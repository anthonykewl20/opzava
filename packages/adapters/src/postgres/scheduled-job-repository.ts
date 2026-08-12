import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";

import { db } from "./client.js";
import { withTenant, type TenantTransaction } from "./tenant-context.js";

const DISPATCH_LEASE_SECONDS = 60;
const boundedCode = /^[a-z0-9][a-z0-9_]{0,63}$/;

export interface ScheduledJobRecord {
  readonly jobKey: string;
  readonly organizationId: string;
  readonly scope: string;
  readonly cadenceSeconds: number;
  readonly nextRunAt: Date;
  readonly dispatchLeaseToken: string | null;
  readonly dispatchLeaseExpiresAt: Date | null;
  readonly consecutiveFailures: number;
  readonly lastStartedAt: Date | null;
  readonly lastCompletedAt: Date | null;
  readonly lastFailureCode: string | null;
}

export interface ScheduledJobIdentity {
  readonly jobKey: string;
  readonly organizationId: string;
  readonly scope: string;
}

export interface ScheduledJobRepository {
  claimDue(input: { readonly organizationId: string; readonly now: Date; readonly batchLimit: number }): Promise<readonly ScheduledJobRecord[]> | readonly ScheduledJobRecord[];
  ack(input: ScheduledJobIdentity & { readonly leaseToken: string; readonly now: Date; readonly cadenceSeconds: number }): Promise<boolean> | boolean;
  fail(input: ScheduledJobIdentity & { readonly leaseToken: string; readonly now: Date; readonly failureCode: string; readonly retryBackoffSeconds: number }): Promise<boolean> | boolean;
  register(input: ScheduledJobIdentity & { readonly cadenceSeconds: number; readonly now: Date }): Promise<void> | void;
}

interface ExecuteDatabase {
  transaction<T>(callback: (tx: TenantTransaction) => Promise<T>): Promise<T>;
}

function rows(result: unknown): ReadonlyArray<Record<string, unknown>> {
  if (Array.isArray(result)) return result as ReadonlyArray<Record<string, unknown>>;
  if (typeof result !== "object" || result === null || !("rows" in result)) return [];
  const value = (result as { readonly rows?: unknown }).rows;
  return Array.isArray(value) ? value as ReadonlyArray<Record<string, unknown>> : [];
}

function positiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be positive`);
}

function date(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function record(row: Record<string, unknown>): ScheduledJobRecord {
  return {
    jobKey: String(row["job_key"]), organizationId: String(row["organization_id"]),
    scope: String(row["scope"]), cadenceSeconds: Number(row["cadence_seconds"]),
    nextRunAt: date(row["next_run_at"])!, dispatchLeaseToken: row["dispatch_lease_token"] as string | null,
    dispatchLeaseExpiresAt: date(row["dispatch_lease_expires_at"]),
    consecutiveFailures: Number(row["consecutive_failures"]), lastStartedAt: date(row["last_started_at"]),
    lastCompletedAt: date(row["last_completed_at"]), lastFailureCode: row["last_failure_code"] as string | null,
  };
}

export class PostgresScheduledJobRepository implements ScheduledJobRepository {
  public constructor(private readonly database: ExecuteDatabase = db) {}

  public claimDue(input: { readonly organizationId: string; readonly now: Date; readonly batchLimit: number }): Promise<readonly ScheduledJobRecord[]> {
    positiveInteger(input.batchLimit, "batchLimit");
    return withTenant(input.organizationId, async (tx) => {
      const result = await tx.execute(sql`
        with due as (
          select job_key, organization_id, scope
          from public.platform_scheduled_job
          where organization_id = ${input.organizationId}::uuid and next_run_at <= ${input.now}
            and (dispatch_lease_token is null or dispatch_lease_expires_at <= ${input.now})
          order by next_run_at, job_key, scope
          for update skip locked limit ${input.batchLimit}
        )
        update public.platform_scheduled_job job set
          dispatch_lease_token = gen_random_uuid(),
          dispatch_lease_expires_at = ${input.now} + (${DISPATCH_LEASE_SECONDS} * interval '1 second'),
          last_started_at = ${input.now}, updated_at = ${input.now}
        from due
        where job.job_key = due.job_key and job.organization_id = due.organization_id and job.scope = due.scope
        returning job.*
      `);
      return rows(result).map(record);
    }, this.database as typeof db);
  }

  public ack(input: ScheduledJobIdentity & { readonly leaseToken: string; readonly now: Date; readonly cadenceSeconds: number }): Promise<boolean> {
    positiveInteger(input.cadenceSeconds, "cadenceSeconds");
    return withTenant(input.organizationId, async (tx) => {
      const result = await tx.execute(sql`
        update public.platform_scheduled_job set
          next_run_at = ${input.now} + (${input.cadenceSeconds} * interval '1 second'),
          dispatch_lease_token = null, dispatch_lease_expires_at = null,
          consecutive_failures = 0, last_completed_at = ${input.now}, last_failure_code = null,
          updated_at = ${input.now}
        where job_key = ${input.jobKey} and organization_id = ${input.organizationId}::uuid
          and scope = ${input.scope} and dispatch_lease_token = ${input.leaseToken}::uuid
          and dispatch_lease_expires_at > ${input.now}
        returning job_key
      `);
      return rows(result).length === 1;
    }, this.database as typeof db);
  }

  public fail(input: ScheduledJobIdentity & { readonly leaseToken: string; readonly now: Date; readonly failureCode: string; readonly retryBackoffSeconds: number }): Promise<boolean> {
    positiveInteger(input.retryBackoffSeconds, "retryBackoffSeconds");
    if (!boundedCode.test(input.failureCode)) throw new RangeError("failureCode must be bounded");
    return withTenant(input.organizationId, async (tx) => {
      const result = await tx.execute(sql`
        update public.platform_scheduled_job set
          next_run_at = ${input.now} + (${input.retryBackoffSeconds} * interval '1 second'),
          dispatch_lease_token = null, dispatch_lease_expires_at = null,
          consecutive_failures = least(consecutive_failures + 1, 2147483647), last_failure_code = ${input.failureCode},
          updated_at = ${input.now}
        where job_key = ${input.jobKey} and organization_id = ${input.organizationId}::uuid
          and scope = ${input.scope} and dispatch_lease_token = ${input.leaseToken}::uuid
          and dispatch_lease_expires_at > ${input.now}
        returning job_key
      `);
      return rows(result).length === 1;
    }, this.database as typeof db);
  }

  public register(input: ScheduledJobIdentity & { readonly cadenceSeconds: number; readonly now: Date }): Promise<void> {
    positiveInteger(input.cadenceSeconds, "cadenceSeconds");
    return withTenant(input.organizationId, async (tx) => {
      await tx.execute(sql`
        insert into public.platform_scheduled_job
          (job_key, organization_id, scope, cadence_seconds, next_run_at, updated_at)
        values (${input.jobKey}, ${input.organizationId}::uuid, ${input.scope}, ${input.cadenceSeconds}, ${input.now}, ${input.now})
        on conflict (job_key, organization_id, scope) do update set
          cadence_seconds = excluded.cadence_seconds, updated_at = excluded.updated_at
      `);
    }, this.database as typeof db);
  }
}

/** Stateful contract fake. A live dispatch lease models a row locked/owned by another worker. */
export class InMemoryScheduledJobRepository implements ScheduledJobRepository {
  private readonly jobs = new Map<string, ScheduledJobRecord>();
  private key(input: ScheduledJobIdentity): string { return `${input.jobKey}:${input.organizationId}:${input.scope}`; }
  public values(): readonly ScheduledJobRecord[] { return [...this.jobs.values()]; }

  public register(input: ScheduledJobIdentity & { readonly cadenceSeconds: number; readonly now: Date }): void {
    positiveInteger(input.cadenceSeconds, "cadenceSeconds");
    const key = this.key(input); const existing = this.jobs.get(key);
    this.jobs.set(key, existing === undefined ? {
      ...input, nextRunAt: new Date(input.now), dispatchLeaseToken: null, dispatchLeaseExpiresAt: null,
      consecutiveFailures: 0, lastStartedAt: null, lastCompletedAt: null, lastFailureCode: null,
    } : { ...existing, cadenceSeconds: input.cadenceSeconds });
  }

  public claimDue(input: { readonly organizationId: string; readonly now: Date; readonly batchLimit: number }): readonly ScheduledJobRecord[] {
    positiveInteger(input.batchLimit, "batchLimit"); const claimed: ScheduledJobRecord[] = [];
    const due = [...this.jobs.entries()].filter(([, job]) => job.organizationId === input.organizationId && job.nextRunAt <= input.now && (job.dispatchLeaseExpiresAt === null || job.dispatchLeaseExpiresAt <= input.now)).sort((a, b) => a[1].nextRunAt.getTime() - b[1].nextRunAt.getTime());
    for (const [key, job] of due.slice(0, input.batchLimit)) {
      const next = { ...job, dispatchLeaseToken: randomUUID(), dispatchLeaseExpiresAt: new Date(input.now.getTime() + DISPATCH_LEASE_SECONDS * 1000), lastStartedAt: new Date(input.now) };
      this.jobs.set(key, next); claimed.push(next);
    }
    return claimed;
  }

  public ack(input: ScheduledJobIdentity & { readonly leaseToken: string; readonly now: Date; readonly cadenceSeconds: number }): boolean {
    const key = this.key(input); const job = this.jobs.get(key);
    if (job?.dispatchLeaseToken !== input.leaseToken || job.dispatchLeaseExpiresAt === null || job.dispatchLeaseExpiresAt <= input.now) return false;
    this.jobs.set(key, { ...job, cadenceSeconds: input.cadenceSeconds, nextRunAt: new Date(input.now.getTime() + input.cadenceSeconds * 1000), dispatchLeaseToken: null, dispatchLeaseExpiresAt: null, consecutiveFailures: 0, lastCompletedAt: new Date(input.now), lastFailureCode: null }); return true;
  }

  public fail(input: ScheduledJobIdentity & { readonly leaseToken: string; readonly now: Date; readonly failureCode: string; readonly retryBackoffSeconds: number }): boolean {
    if (!boundedCode.test(input.failureCode)) throw new RangeError("failureCode must be bounded");
    const key = this.key(input); const job = this.jobs.get(key);
    if (job?.dispatchLeaseToken !== input.leaseToken || job.dispatchLeaseExpiresAt === null || job.dispatchLeaseExpiresAt <= input.now) return false;
    this.jobs.set(key, { ...job, nextRunAt: new Date(input.now.getTime() + input.retryBackoffSeconds * 1000), dispatchLeaseToken: null, dispatchLeaseExpiresAt: null, consecutiveFailures: Math.min(job.consecutiveFailures + 1, 2_147_483_647), lastFailureCode: input.failureCode }); return true;
  }
}
