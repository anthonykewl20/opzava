import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "../client.js";
import { PostgresScheduledJobRepository } from "../scheduled-job-repository.js";
import { withTenant } from "../tenant-context.js";

const enabled = Boolean(process.env["DATABASE_URL"] && process.env["DATABASE_MIGRATION_URL"]);
const describePostgres = enabled ? describe : describe.skip;
const { Pool } = pg;

describePostgres("scheduled job repository real-Postgres concurrency and RLS", () => {
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const appPool = enabled ? new Pool({ connectionString: process.env["DATABASE_URL"] }) : undefined;
  const adminPool = enabled ? new Pool({ connectionString: process.env["DATABASE_MIGRATION_URL"] }) : undefined;
  const appDatabase = appPool === undefined ? undefined : createPostgresDatabase(appPool);
  const repository = appDatabase === undefined ? undefined : new PostgresScheduledJobRepository(appDatabase);

  beforeAll(async () => {
    await adminPool!.query("insert into public.organizations (id, slug, name, lifecycle_state) values ($1, $2, $3, 'active')", [organizationId, `scheduler-${organizationId}`, "Scheduler integration"]);
    await adminPool!.query("insert into public.organizations (id, slug, name, lifecycle_state) values ($1, $2, $3, 'active')", [otherOrganizationId, `scheduler-${otherOrganizationId}`, "Scheduler integration other tenant"]);
    const now = new Date();
    await Promise.all(["one", "two", "three", "four"].map((scope) => repository!.register({ jobKey: "integration.job", organizationId, scope, cadenceSeconds: 300, now })));
  });

  afterAll(async () => {
    if (adminPool === undefined || appPool === undefined) return;
    await adminPool.query("delete from public.platform_scheduled_job where organization_id in ($1, $2)", [organizationId, otherOrganizationId]);
    await adminPool.query("delete from public.organizations where id in ($1, $2)", [organizationId, otherOrganizationId]);
    await appPool.end(); await adminPool.end();
  });

  it("returns disjoint rows to concurrent SKIP LOCKED claimers", async () => {
    const now = new Date(Date.now() + 1_000);
    const [left, right] = await Promise.all([
      repository!.claimDue({ organizationId, now, batchLimit: 2 }),
      repository!.claimDue({ organizationId, now, batchLimit: 2 }),
    ]);
    expect(left).toHaveLength(2); expect(right).toHaveLength(2);
    const leftKeys = new Set(left.map((row) => `${row.jobKey}:${row.scope}`));
    expect(right.every((row) => !leftKeys.has(`${row.jobKey}:${row.scope}`))).toBe(true);
  });

  it("denies cross-tenant writes and isolates cross-tenant reads through RLS", async () => {
    const now = new Date();
    await repository!.register({ jobKey: "integration.rls", organizationId, scope: "isolated", cadenceSeconds: 300, now });

    await expect(withTenant(otherOrganizationId, async (tx) => {
      await tx.execute(sql`
        insert into public.platform_scheduled_job
          (job_key, organization_id, scope, cadence_seconds, next_run_at, updated_at)
        values ('integration.rls', ${organizationId}::uuid, 'denied', 300, ${now}, ${now})
      `);
    }, appDatabase!)).rejects.toMatchObject({ status: 403 });

    await expect(repository!.claimDue({ organizationId: otherOrganizationId, now, batchLimit: 10 })).resolves.toEqual([]);
  });

  it("uses the database clock for acknowledgement lease fences", async () => {
    const claimedAt = new Date();
    await repository!.register({ jobKey: "integration.clock", organizationId: otherOrganizationId, scope: "ack", cadenceSeconds: 300, now: claimedAt });
    const [claimed] = await repository!.claimDue({ organizationId: otherOrganizationId, now: new Date(claimedAt.getTime() + 1_000), batchLimit: 1 });
    expect(claimed).toBeDefined();

    await adminPool!.query(
      "update public.platform_scheduled_job set dispatch_lease_token = $1, dispatch_lease_expires_at = '2100-01-01T00:00:00.000Z' where job_key = $2 and organization_id = $3 and scope = $4",
      [claimed!.dispatchLeaseToken, claimed!.jobKey, otherOrganizationId, claimed!.scope]
    );

    await expect(repository!.ack({
      jobKey: claimed!.jobKey,
      organizationId: otherOrganizationId,
      scope: claimed!.scope,
      leaseToken: claimed!.dispatchLeaseToken!,
      now: new Date("2200-01-01T00:00:00.000Z"),
      cadenceSeconds: 300
    })).resolves.toBe(true);
  });
});

if (!enabled) {
  describe("scheduled job repository real-Postgres concurrency and RLS", () => {
    it.skip("requires DATABASE_URL and DATABASE_MIGRATION_URL with migration 0019 applied", () => {});
  });
}
