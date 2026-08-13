import type { DoctorScanRepository, DoctorScanRunRecord } from "@opzava/adapters";
import type { GatewayRuntimePort } from "@opzava/ports";

import { parseDoctorLintOutput } from "./parser.js";

const DEFAULT_CADENCE_MS = 5 * 60_000;
const FORCE_COOLDOWN_MS = 30_000;
const DEFAULT_LEASE_DURATION_MS = 30_000;

export interface DoctorScanScope {
  readonly organizationId: string;
  readonly scope: string;
}

export interface DoctorScanLatest {
  readonly availability: "available" | "unknown";
  readonly latest: DoctorScanRunRecord | null;
  readonly inProgress: boolean;
}

export interface OpenClawDoctorScanPort {
  readLatest(input: DoctorScanScope): Promise<DoctorScanLatest>;
  ensureFresh(input: DoctorScanScope): Promise<DoctorScanLatest>;
  force(input: DoctorScanScope): Promise<DoctorScanLatest>;
  tick(input: DoctorScanScope): Promise<DoctorScanLatest>;
}

export interface OpenClawDoctorScanOptions {
  readonly cadenceMs?: number;
  readonly leaseDurationMs?: number;
  /** Authorization belongs to the admin/JIT caller boundary. The default is fail-closed. */
  readonly authorizeForce?: (input: DoctorScanScope) => Promise<boolean> | boolean;
  readonly now?: () => Date;
}

/** Worker-owned application service. Raw doctor output exists only inside executeScan. */
export class OpenClawDoctorScanOrchestrator implements OpenClawDoctorScanPort {
  private readonly inFlight = new Set<string>();

  public constructor(
    private readonly repository: DoctorScanRepository,
    private readonly runtime: Pick<GatewayRuntimePort, "runDoctorLintScan">,
    private readonly options: OpenClawDoctorScanOptions = {},
  ) {}

  public async readLatest(input: DoctorScanScope): Promise<DoctorScanLatest> {
    const latest = await this.repository.readLatest(input);
    return {
      availability: latest === null ? "unknown" : "available",
      latest,
      inProgress: this.inFlight.has(this.key(input)),
    };
  }

  public async ensureFresh(input: DoctorScanScope): Promise<DoctorScanLatest> {
    const latest = await this.repository.readLatest(input);
    const inProgress = await this.startIfClaimed(input, "scheduled");
    return { availability: latest === null ? "unknown" : "available", latest, inProgress };
  }

  public async force(input: DoctorScanScope): Promise<DoctorScanLatest> {
    if (!(await (this.options.authorizeForce?.(input) ?? false))) {
      throw new Error("Doctor scan force is not authorized.");
    }
    const latest = await this.repository.readLatest(input);
    const inProgress = await this.startIfClaimed(input, "force");
    return { availability: latest === null ? "unknown" : "available", latest, inProgress };
  }

  public tick(input: DoctorScanScope): Promise<DoctorScanLatest> {
    return this.ensureFresh(input);
  }

  private key(input: DoctorScanScope): string {
    return `${input.organizationId}:${input.scope}`;
  }

  private async startIfClaimed(
    input: DoctorScanScope,
    kind: "scheduled" | "force",
  ): Promise<boolean> {
    const key = this.key(input);
    if (this.inFlight.has(key)) return true;
    this.inFlight.add(key);
    try {
      const startedAt = this.options.now?.() ?? new Date();
      const claim = await this.repository.claim({
        ...input,
        kind,
        leaseDurationMs: this.options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS,
        cadenceMs: this.options.cadenceMs ?? DEFAULT_CADENCE_MS,
        forceCooldownMs: FORCE_COOLDOWN_MS,
        now: startedAt,
      });
      if (claim === null) {
        this.inFlight.delete(key);
        return false;
      }
      void this.executeScan(input, claim.leaseToken, startedAt)
        .catch(() => {
          // Final fail-safe: detached work must never create an unhandled rejection.
        })
        .finally(() => {
          this.inFlight.delete(key);
        });
      return true;
    } catch (error) {
      this.inFlight.delete(key);
      throw error;
    }
  }

  private async executeScan(
    input: DoctorScanScope,
    leaseToken: string,
    startedAt: Date,
  ): Promise<void> {
    let run: Omit<DoctorScanRunRecord, "runCheckedAt">;
    try {
      const result = await this.runtime.runDoctorLintScan();
      run = result.ok
        ? parseDoctorLintOutput(result.value)
        : this.unavailable("doctor_scan_unavailable");
    } catch {
      run = this.unavailable("doctor_scan_unavailable");
    }

    try {
      await this.repository.publish({
        ...input,
        leaseToken,
        startedAt,
        completedAt: this.options.now?.() ?? new Date(),
        run,
      });
    } catch {
      // Publication failures are intentionally swallowed: detached work must never reject, and no
      // raw adapter/database exception may reach logs or callers. The lease fence remains honest.
    }
  }

  private unavailable(failureCode: string): Omit<DoctorScanRunRecord, "runCheckedAt"> {
    return {
      status: "unavailable",
      checksRun: 0,
      checksSkipped: 0,
      findings: [],
      failureCode,
    };
  }
}
