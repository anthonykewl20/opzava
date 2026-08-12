import { randomUUID } from "node:crypto";

import {
  assertCurrentTenant,
  createPostgresDatabase,
  createPostgresPool,
  db,
  mapTenantStoreError,
  rowsFromExecuteResult,
  withTenant
} from "@opzava/adapters";
import { makeOrgId, makeUserId, makeWorkspaceId, TenantAccessDeniedError } from "@opzava/shared-kernel";
import { sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresRuntimeConversationStore } from "../../adapters/postgres/runtime-conversation-store.js";
import { runtimeConversationStoreContract } from "../contracts/runtime-conversation-store.contract.js";

const migrationUrl = process.env["DATABASE_MIGRATION_URL"]?.trim();
const runtimeUrl = process.env["DATABASE_URL"]?.trim();
const hasDatabase = migrationUrl !== undefined && migrationUrl !== "" && runtimeUrl !== undefined && runtimeUrl !== "";
const { Pool } = pg;

describe.skipIf(!hasDatabase)("PostgresRuntimeConversationStore contract (requires DATABASE_URL and DATABASE_MIGRATION_URL)", () => {
  const orgA = randomUUID();
  const orgB = randomUUID();
  const workspaceA = randomUUID();
  const workspaceB = randomUUID();
  const runtimePool = createPostgresPool(runtimeUrl ?? "postgres://unused:unused@127.0.0.1:1/unused");
  const store = new PostgresRuntimeConversationStore(createPostgresDatabase(runtimePool));
  const adminPool = new Pool({ connectionString: migrationUrl ?? "postgres://unused:unused@127.0.0.1:1/unused", application_name: "runtime-conversation-store-contract-admin" });
  let ownsContractUser = false;

  beforeAll(async () => {
    const user = await adminPool.query(
      `insert into public.auth_users (id, name, email, email_verified)
       values ('contract-user', 'Runtime store contract', $1, true)
       on conflict (id) do nothing
       returning id`,
      [`runtime-store-contract-${orgA}@example.invalid`]
    );
    ownsContractUser = user.rowCount === 1;
    await adminPool.query(`insert into public.organizations (id, slug, name, lifecycle_state) values ($1, $2, 'Contract A', 'active'), ($3, $4, 'Contract B', 'active')`, [orgA, `store-contract-${orgA}`, orgB, `store-contract-${orgB}`]);
    await adminPool.query(`insert into public.workspaces (id, organization_id, slug, name) values ($1, $2, 'contract', 'Contract'), ($3, $4, 'contract', 'Contract')`, [workspaceA, orgA, workspaceB, orgB]);
  });

  afterAll(async () => {
    await adminPool.query("delete from public.assistant_tool_outcomes where organization_id = any($1::uuid[])", [[orgA, orgB]]);
    await adminPool.query("delete from public.assistant_turns where organization_id = any($1::uuid[])", [[orgA, orgB]]);
    await adminPool.query("delete from public.assistant_conversations where organization_id = any($1::uuid[])", [[orgA, orgB]]);
    await adminPool.query("delete from public.workspaces where organization_id = any($1::uuid[])", [[orgA, orgB]]);
    await adminPool.query("delete from public.organizations where id = any($1::uuid[])", [[orgA, orgB]]);
    if (ownsContractUser) await adminPool.query("delete from public.auth_users where id = 'contract-user'");
    await runtimePool.end();
    await adminPool.end();
  });

  runtimeConversationStoreContract({
    createStore: () => store,
    scopeA: { organizationId: makeOrgId(orgA), workspaceId: makeWorkspaceId(workspaceA) },
    scopeB: { organizationId: makeOrgId(orgB), workspaceId: makeWorkspaceId(workspaceB) }
  });

  it("rejects a non-opzava_app database role as tenant access denied", async () => {
    const adminStore = new PostgresRuntimeConversationStore(createPostgresDatabase(adminPool));
    await expect(adminStore.findOpenConversation(
      { organizationId: makeOrgId(orgA), workspaceId: makeWorkspaceId(workspaceA) },
      { surface: "contract", assistantKey: "assistant", createdByUserId: makeUserId("contract-user") }
    )).resolves.toMatchObject({ ok: false, error: { status: 403 } });
  });

  it("maps missing tenant context to a hard tenant 403", async () => {
    await expect(assertCurrentTenant(db, orgA)).rejects.toSatisfy((error: unknown) =>
      mapTenantStoreError(error) instanceof TenantAccessDeniedError
    );
  });

  it("proves native RLS rejects cross-tenant writes and hides cross-tenant reads", async () => {
    await expect(withTenant(orgB, async (tx) => {
      await tx.execute(sql`insert into public.assistant_conversations (organization_id, workspace_id, surface, assistant_key, status, created_by_user_id) values (${orgA}, ${workspaceA}, 'wrong', 'wrong', 'open', 'contract-user')`);
    })).rejects.toSatisfy((error: unknown) => mapTenantStoreError(error) instanceof TenantAccessDeniedError);

    await withTenant(orgB, async (tx) => {
      const result = await tx.execute(sql`select id from public.assistant_conversations where organization_id = ${orgA}`);
      expect(rowsFromExecuteResult(result)).toEqual([]);
    });
  });
});
