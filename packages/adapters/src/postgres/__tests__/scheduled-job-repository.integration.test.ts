import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "../client.js";
import { PostgresScheduledJobRepository } from "../scheduled-job-repository.js";

const enabled = Boolean(process.env["DATABASE_URL"] && process.env["DATABASE_MIGRATION_URL"]);
const describePostgres = enabled ? describe : describe.skip;
const { Pool } = pg;

describePostgres("scheduled job repository real-Postgres concurrency and RLS", () => {
  const organizationId = randomUUID();
  const appPool = enabled ? new Pool({ connectionString: process.env["DATABASE_URL"] }) : undefined;
  const adminPool = enabled ? new Pool({ connectionString: process.env["DATABASE_MIGRATION_URL"] }) : undefined;
  const repository = appPool === undefined ? undefined : new PostgresScheduledJobRepository(createPostgresDatabase(appPool));

  beforeAll(async () => {
    await adminPool!.query("insert into public.organizations (id, slug, name, lifecycle_state) values ($1, $2, $3, 'active')", [organizationId, `scheduler-${organizationId}`, "Scheduler integration"]);
    const now = new Date();
    await Promise.all(["one", "two", "three", "four"].map((scope) => repository!.register({ jobKey: "integration.job", organizationId, scope, cadenceSeconds: 300, now })));
  });

  afterAll(async () => {
    if (adminPool === undefined || appPool === undefined) return;
    await adminPool.query("delete from public.platform_scheduled_job where organization_id = $1", [organizationId]);
    await adminPool.query("delete from public.organizations where id = $1", [organizationId]);
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

  it("surfaces missing tenant access as a hard error rather than empty success", async () => {
    await expect(repository!.register({ jobKey: "integration.job", organizationId: randomUUID(), scope: "denied", cadenceSeconds: 300, now: new Date() })).rejects.toMatchObject({ status: 403 });
  });
});

if (!enabled) {
  describe("scheduled job repository real-Postgres concurrency and RLS", () => {
    it.skip("requires DATABASE_URL and DATABASE_MIGRATION_URL with migration 0019 applied", () => {});
  });
}
