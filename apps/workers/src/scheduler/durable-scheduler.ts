import type { ScheduledJobRecord, ScheduledJobRepository } from "@opzava/adapters";

export interface ScheduledJobHandlerContext {
  readonly organizationId: string;
  readonly scope: string;
}

/** Code-only admission list. Every handler must be idempotent or independently fenced. */
export type ScheduledJobHandler = (context: ScheduledJobHandlerContext) => Promise<void>;
export type ScheduledJobHandlerRegistry = ReadonlyMap<string, ScheduledJobHandler>;

export interface DurableSchedulerOptions {
  readonly organizationId: string;
  readonly wakeIntervalMs?: number;
  readonly batchLimit?: number;
  readonly retryBackoffSeconds?: number;
  readonly now?: () => Date;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export class DurableScheduler {
  private stopping = false;
  private loop: Promise<void> | null = null;
  private wakeSleep: (() => void) | null = null;

  public constructor(
    private readonly repository: ScheduledJobRepository,
    private readonly handlers: ScheduledJobHandlerRegistry,
    private readonly options: DurableSchedulerOptions,
  ) {}

  public start(): void {
    if (this.loop !== null) return;
    this.stopping = false;
    this.loop = this.run();
  }

  /** Stop claiming immediately, interrupt the idle sleep, and await the active handler/fence. */
  public async stop(): Promise<void> {
    this.stopping = true;
    this.wakeSleep?.();
    await this.loop;
    this.loop = null;
  }

  /** One deterministic wake, exposed for unit tests and operational probes. */
  public async wake(): Promise<void> {
    if (this.stopping) return;
    const jobs = await this.repository.claimDue({
      organizationId: this.options.organizationId,
      now: this.now(),
      batchLimit: this.options.batchLimit ?? 10,
    });
    for (const job of jobs) {
      // Rows in this batch are already durably leased. Shutdown stops the next claim, but drains
      // every claimed dispatch so it does not strand fresh leases until expiry.
      await this.dispatch(job);
    }
  }

  private async run(): Promise<void> {
    while (!this.stopping) {
      try {
        await this.wake();
      } catch {
        // Database/adapter failures are retried on the next wake. Raw errors are never logged or
        // persisted from this security-sensitive background loop.
      }
      if (!this.stopping) await this.wait(this.options.wakeIntervalMs ?? 45_000);
    }
  }

  private async dispatch(job: ScheduledJobRecord): Promise<void> {
    const handler = this.handlers.get(job.jobKey);
    const identity = { jobKey: job.jobKey, organizationId: job.organizationId, scope: job.scope };
    try {
      if (handler === undefined) throw new UnknownScheduledJobError();
      await handler({ organizationId: job.organizationId, scope: job.scope });
      await this.repository.ack({
        ...identity, leaseToken: job.dispatchLeaseToken!, now: this.now(),
        cadenceSeconds: job.cadenceSeconds,
      });
    } catch (error) {
      await this.repository.fail({
        ...identity, leaseToken: job.dispatchLeaseToken!, now: this.now(),
        failureCode: error instanceof UnknownScheduledJobError ? "handler_not_registered" : "handler_failed",
        retryBackoffSeconds: this.options.retryBackoffSeconds ?? 60,
      });
    }
  }

  private now(): Date { return this.options.now?.() ?? new Date(); }

  private async wait(milliseconds: number): Promise<void> {
    let release!: () => void;
    const interrupted = new Promise<void>((resolve) => { release = resolve; });
    this.wakeSleep = release;
    try {
      await Promise.race([
        this.options.sleep?.(milliseconds) ?? new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
        interrupted,
      ]);
    } finally {
      this.wakeSleep = null;
    }
  }
}

class UnknownScheduledJobError extends Error {}
