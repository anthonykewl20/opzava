import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "./client.js";
import { withTenant, type TenantTransaction } from "./tenant-context.js";

export type DoctorScanClaimKind = "scheduled" | "force";

export interface DoctorScanFindingRecord {
  readonly checkId: string;
  readonly severity: "info" | "warning" | "error";
  readonly group: string;
  readonly summary: string;
  readonly detailState: "available" | "redacted_unavailable";
  readonly locationLabel: string | null;
  readonly targetLabel: string | null;
  readonly fixHint: string | null;
  readonly suppressed: boolean;
  readonly suppressionReason: string | null;
}

export interface DoctorScanRunRecord {
  readonly status: "succeeded" | "unavailable";
  readonly checksRun: number;
  readonly checksSkipped: number;
  readonly findings: readonly DoctorScanFindingRecord[];
  readonly failureCode?: string;
}

export interface ReadLatestDoctorScanInput {
  readonly organizationId: string;
  readonly scope: string;
}

export interface DoctorScanRepository {
  readLatest(
    input: ReadLatestDoctorScanInput,
  ): Promise<DoctorScanRunRecord | null> | DoctorScanRunRecord | null;
  claim(
    input: ClaimDoctorScanInput,
  ): Promise<DoctorScanLeaseClaim | null> | DoctorScanLeaseClaim | null;
  publish(input: PublishDoctorScanInput): Promise<string | null> | string | null;
}

export interface ClaimDoctorScanInput {
  readonly organizationId: string;
  readonly scope: string;
  readonly kind: DoctorScanClaimKind;
  readonly leaseDurationMs: number;
  readonly cadenceMs?: number;
  readonly forceCooldownMs?: number;
  readonly now?: Date;
}

export interface DoctorScanLeaseClaim {
  readonly leaseToken: string;
  readonly leaseExpiresAt: Date;
}

export interface PublishDoctorScanInput {
  readonly organizationId: string;
  readonly scope: string;
  readonly leaseToken: string;
  readonly startedAt: Date;
  readonly completedAt?: Date;
  readonly run: DoctorScanRunRecord;
}

interface ExecuteDatabase {
  transaction<T>(callback: (tx: TenantTransaction) => Promise<T>): Promise<T>;
}

function rows(result: unknown): ReadonlyArray<Record<string, unknown>> {
  if (Array.isArray(result)) return result as ReadonlyArray<Record<string, unknown>>;
  if (typeof result !== "object" || result === null || !("rows" in result)) return [];
  const value = (result as { readonly rows?: unknown }).rows;
  return Array.isArray(value) ? (value as ReadonlyArray<Record<string, unknown>>) : [];
}

function positiveDuration(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be positive`);
}

export class PostgresDoctorScanRepository {
  public constructor(private readonly database: ExecuteDatabase = db) {}

  public async readLatest(input: ReadLatestDoctorScanInput): Promise<DoctorScanRunRecord | null> {
    return withTenant(
      input.organizationId,
      async (tx) => {
        const runResult = await tx.execute(sql`
        select id, status, checks_run, checks_skipped, failure_code
        from public.platform_doctor_scan_run
        where organization_id = ${input.organizationId}::uuid and scope = ${input.scope}
        order by completed_at desc, id desc
        limit 1
      `);
        const run = rows(runResult)[0];
        if (run === undefined) return null;

        const findingResult = await tx.execute(sql`
        select check_id, severity, display_group, summary, detail_state, location_label,
          target_label, suppressed, suppression_reason
        from public.platform_doctor_scan_finding
        where organization_id = ${input.organizationId}::uuid and scan_run_id = ${run["id"]}::uuid
        order by ordinal
      `);
        const findings = rows(findingResult).map((finding): DoctorScanFindingRecord => ({
          checkId: finding["check_id"] as string,
          severity: finding["severity"] as DoctorScanFindingRecord["severity"],
          group: finding["display_group"] as string,
          summary: finding["summary"] as string,
          detailState: finding["detail_state"] as DoctorScanFindingRecord["detailState"],
          locationLabel: (finding["location_label"] as string | null) ?? null,
          targetLabel: (finding["target_label"] as string | null) ?? null,
          fixHint: null,
          suppressed: finding["suppressed"] as boolean,
          suppressionReason: (finding["suppression_reason"] as string | null) ?? null,
        }));
        const failureCode = run["failure_code"];
        return {
          status: run["status"] as DoctorScanRunRecord["status"],
          checksRun: Number(run["checks_run"]),
          checksSkipped: Number(run["checks_skipped"]),
          findings,
          ...(typeof failureCode === "string" ? { failureCode } : {}),
        };
      },
      this.database as typeof db,
    );
  }

  public async claim(input: ClaimDoctorScanInput): Promise<DoctorScanLeaseClaim | null> {
    positiveDuration(input.leaseDurationMs, "leaseDurationMs");
    const now = input.now ?? new Date();
    const leaseExpiresAt = new Date(now.getTime() + input.leaseDurationMs);
    const token = randomUUID();
    const cadenceMs = input.cadenceMs ?? 5 * 60_000;
    const forceCooldownMs = input.forceCooldownMs ?? 30_000;
    positiveDuration(cadenceMs, "cadenceMs");
    positiveDuration(forceCooldownMs, "forceCooldownMs");

    return withTenant(
      input.organizationId,
      async (tx) => {
        const result = await tx.execute(sql`
        insert into public.platform_doctor_scan_lease (
          organization_id, scope, lease_token, lease_acquired_at, lease_expires_at,
          last_force_requested_at
        )
        select ${input.organizationId}::uuid, ${input.scope}, ${token}::uuid, ${now},
          ${leaseExpiresAt}, ${input.kind === "force" ? now : null}
        where ${input.kind === "force"}
          or not exists (
            select 1 from public.platform_doctor_scan_run
            where organization_id = ${input.organizationId}::uuid and scope = ${input.scope}
              and completed_at > ${new Date(now.getTime() - cadenceMs)}
          )
        on conflict (organization_id, scope) do update set
          lease_token = excluded.lease_token,
          lease_acquired_at = excluded.lease_acquired_at,
          lease_expires_at = excluded.lease_expires_at,
          last_force_requested_at = case
            when ${input.kind === "force"} then excluded.last_force_requested_at
            else platform_doctor_scan_lease.last_force_requested_at
          end
        where platform_doctor_scan_lease.lease_expires_at <= ${now}
          and (
            not ${input.kind === "force"}
            or platform_doctor_scan_lease.last_force_requested_at is null
            or platform_doctor_scan_lease.last_force_requested_at <= ${new Date(now.getTime() - forceCooldownMs)}
          )
          and (
            ${input.kind === "force"}
            or not exists (
              select 1 from public.platform_doctor_scan_run
              where organization_id = ${input.organizationId}::uuid and scope = ${input.scope}
                and completed_at > ${new Date(now.getTime() - cadenceMs)}
            )
          )
        returning lease_token, lease_expires_at
      `);
        const row = rows(result)[0];
        const leaseExpiresAtValue = row?.["lease_expires_at"];
        const returnedLeaseExpiresAt =
          leaseExpiresAtValue instanceof Date
            ? leaseExpiresAtValue
            : typeof leaseExpiresAtValue === "string"
              ? new Date(leaseExpiresAtValue)
              : null;
        return typeof row?.["lease_token"] === "string" &&
          returnedLeaseExpiresAt !== null &&
          !Number.isNaN(returnedLeaseExpiresAt.getTime())
          ? { leaseToken: row["lease_token"], leaseExpiresAt: returnedLeaseExpiresAt }
          : null;
      },
      this.database as typeof db,
    );
  }

  public async publish(input: PublishDoctorScanInput): Promise<string | null> {
    const completedAt = input.completedAt ?? new Date();
    const runId = randomUUID();
    return withTenant(
      input.organizationId,
      async (tx) => {
        // The lease update and evidence insert share one short transaction: a stale worker
        // cannot insert after losing the token or crossing its expiry fence.
        const fenced = await tx.execute(sql`
        update public.platform_doctor_scan_lease set lease_expires_at = now()
        where organization_id = ${input.organizationId}::uuid and scope = ${input.scope}
          and lease_token = ${input.leaseToken}::uuid and lease_expires_at > now()
        returning lease_token
      `);
        if (rows(fenced).length !== 1) return null;

        await tx.execute(sql`
        insert into public.platform_doctor_scan_run (
          id, organization_id, scope, status, started_at, completed_at, checks_run,
          checks_skipped, failure_code, schema_version
        ) values (
          ${runId}::uuid, ${input.organizationId}::uuid, ${input.scope}, ${input.run.status},
          ${input.startedAt}, ${completedAt}, ${input.run.checksRun}, ${input.run.checksSkipped},
          ${input.run.failureCode ?? null}, 1
        )
      `);
        for (const [ordinal, finding] of input.run.findings.entries()) {
          await tx.execute(sql`
          insert into public.platform_doctor_scan_finding (
            scan_run_id, organization_id, ordinal, check_id, severity, display_group, summary,
            detail_state, location_label, target_label, suppressed, suppression_reason
          ) values (
            ${runId}::uuid, ${input.organizationId}::uuid, ${ordinal}, ${finding.checkId},
            ${finding.severity}, ${finding.group}, ${finding.summary}, ${finding.detailState},
            ${finding.locationLabel}, ${finding.targetLabel}, ${finding.suppressed},
            ${finding.suppressionReason}
          )
        `);
        }
        return runId;
      },
      this.database as typeof db,
    );
  }

  public async prune(organizationId: string, scope: string): Promise<number> {
    return withTenant(
      organizationId,
      async (tx) => {
        const result = await tx.execute(sql`
        select app.prune_platform_doctor_scan_runs(${organizationId}::uuid, ${scope}) as deleted
      `);
        const deleted = rows(result)[0]?.["deleted"];
        return typeof deleted === "number" ? deleted : Number(deleted ?? 0);
      },
      this.database as typeof db,
    );
  }
}

interface MemoryLease {
  readonly token: string;
  readonly expiresAt: Date;
  readonly lastForceRequestedAt?: Date;
}

/** Deterministic contract fake; state can be shared across instances to model worker restarts. */
export class InMemoryDoctorScanRepository {
  public constructor(
    private readonly leases = new Map<string, MemoryLease>(),
    private readonly runs = new Map<string, readonly DoctorScanRunRecord[]>(),
  ) {}

  public readLatest(input: ReadLatestDoctorScanInput): DoctorScanRunRecord | null {
    return this.runs.get(`${input.organizationId}:${input.scope}`)?.at(-1) ?? null;
  }

  public claim(input: ClaimDoctorScanInput): DoctorScanLeaseClaim | null {
    positiveDuration(input.leaseDurationMs, "leaseDurationMs");
    const now = input.now ?? new Date();
    const key = `${input.organizationId}:${input.scope}`;
    const lease = this.leases.get(key);
    const cooldown = input.forceCooldownMs ?? 30_000;
    const cadence = input.cadenceMs ?? 5 * 60_000;
    if (lease !== undefined && lease.expiresAt > now) return null;
    if (
      input.kind === "force" &&
      lease?.lastForceRequestedAt !== undefined &&
      lease.lastForceRequestedAt.getTime() + cooldown > now.getTime()
    )
      return null;
    if (input.kind === "scheduled") {
      const latest = this.runs.get(key)?.at(-1);
      // The fake does not retain timestamps; an existing run represents the current cadence window.
      if (latest !== undefined && cadence > 0) return null;
    }
    const token = randomUUID();
    const expiresAt = new Date(now.getTime() + input.leaseDurationMs);
    const nextLease: MemoryLease = {
      token,
      expiresAt,
      ...(input.kind === "force"
        ? { lastForceRequestedAt: now }
        : lease?.lastForceRequestedAt === undefined
          ? {}
          : { lastForceRequestedAt: lease.lastForceRequestedAt }),
    };
    this.leases.set(key, nextLease);
    return { leaseToken: token, leaseExpiresAt: expiresAt };
  }

  public publish(input: PublishDoctorScanInput): string | null {
    const now = input.completedAt ?? new Date();
    const key = `${input.organizationId}:${input.scope}`;
    const lease = this.leases.get(key);
    if (lease?.token !== input.leaseToken || lease.expiresAt <= now) return null;
    this.leases.set(key, { ...lease, expiresAt: now });
    this.runs.set(key, [...(this.runs.get(key) ?? []), input.run]);
    return randomUUID();
  }
}
