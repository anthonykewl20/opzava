import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "../client.js";
import { PostgresDoctorScanRepository } from "../doctor-scan-repository.js";

const enabled = Boolean(process.env["DATABASE_URL"] && process.env["DATABASE_MIGRATION_URL"]);
const describePostgres = enabled ? describe : describe.skip;
const { Pool } = pg;

describePostgres("doctor scan repository real-Postgres concurrency and RLS", () => {
  const organizationId = randomUUID();
  const scope = `platform-gateway-${randomUUID()}`;
  const appPool = enabled ? new Pool({ connectionString: process.env["DATABASE_URL"] }) : undefined;
  const adminPool = enabled
    ? new Pool({ connectionString: process.env["DATABASE_MIGRATION_URL"] })
    : undefined;
  const repository = appPool === undefined
    ? undefined
    : new PostgresDoctorScanRepository(createPostgresDatabase(appPool));

  beforeAll(async () => {
    await adminPool!.query(
      "insert into public.organizations (id, slug, name, lifecycle_state) values ($1, $2, $3, 'active')",
      [organizationId, `doctor-${organizationId}`, "Doctor scan integration"]
    );
  });

  afterAll(async () => {
    if (adminPool === undefined || appPool === undefined) return;
    await adminPool.query("delete from public.platform_doctor_scan_finding where organization_id = $1", [organizationId]);
    await adminPool.query("delete from public.platform_doctor_scan_run where organization_id = $1", [organizationId]);
    await adminPool.query("delete from public.platform_doctor_scan_lease where organization_id = $1", [organizationId]);
    await adminPool.query("delete from public.organizations where id = $1", [organizationId]);
    await appPool.end();
    await adminPool.end();
  });

  it("atomically grants only one of simultaneous claims", async () => {
    const now = new Date();
    const claims = await Promise.all(Array.from({ length: 8 }, () => repository!.claim({
      organizationId, scope, kind: "force", leaseDurationMs: 5_000, now
    })));
    expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
  });

  it("permits restart takeover after expiry and fences the stale token", async () => {
    const restartScope = `${scope}-restart`;
    const firstNow = new Date();
    const first = await repository!.claim({
      organizationId, scope: restartScope, kind: "force", leaseDurationMs: 5_000,
      forceCooldownMs: 30, now: firstNow
    });
    await adminPool!.query(
      "update public.platform_doctor_scan_lease set lease_acquired_at = now() - interval '2 seconds', lease_expires_at = now() - interval '1 second', last_force_requested_at = now() - interval '1 second' where organization_id = $1 and scope = $2",
      [organizationId, restartScope]
    );
    const secondNow = new Date();
    const second = await repository!.claim({
      organizationId, scope: restartScope, kind: "force", leaseDurationMs: 5_000,
      forceCooldownMs: 30, now: secondNow
    });
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    const run = { status: "succeeded" as const, checksRun: 1, checksSkipped: 0, findings: [] };
    await expect(repository!.publish({
      organizationId, scope: restartScope, leaseToken: first!.leaseToken, startedAt: firstNow,
      completedAt: secondNow, run
    })).resolves.toBeNull();
    await expect(repository!.publish({
      organizationId, scope: restartScope, leaseToken: second!.leaseToken, startedAt: secondNow,
      completedAt: secondNow, run
    })).resolves.toMatch(/^[0-9a-f-]{36}$/);
  });

  it("forces RLS and rejects a mismatched organization context", async () => {
    const otherOrganizationId = randomUUID();
    const appDb = drizzle({ client: appPool! });
    const result = await appDb.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.current_org', ${otherOrganizationId}, true)`);
      return tx.execute(sql`select id from public.platform_doctor_scan_run where organization_id = ${organizationId}::uuid`);
    });
    expect(result.rows).toHaveLength(0);
    await expect(repository!.claim({
      organizationId: otherOrganizationId, scope, kind: "force", leaseDurationMs: 1_000
    })).rejects.toMatchObject({ status: 403 });
  });
});

if (!enabled) {
  describe("doctor scan repository real-Postgres concurrency and RLS", () => {
    it.skip("requires DATABASE_URL and DATABASE_MIGRATION_URL with migration 0018 applied", () => {});
  });
}
