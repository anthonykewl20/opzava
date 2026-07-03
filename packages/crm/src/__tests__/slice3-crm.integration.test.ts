import {
  createPostgresPool,
  db,
  pool,
  sql,
} from "@opzava/adapters";
import type { Result } from "@opzava/shared-kernel";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  addNote,
  closeDeal,
  createAccount,
  createContact,
  createDeal,
  createTicket,
  ensureDefaultPipeline,
  getAccount,
  getContact,
  getTicket,
  listAccounts,
  listContactTimeline,
  listDeals,
  moveDealStage,
  reopenDeal,
  updateAccount,
  updateContact,
  updateDeal,
  updateTicket,
  updateTicketStatus,
  type CrmDealDto,
} from "../application/index.js";

interface TenantFixture {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly userId: string;
}

const testRunId = randomUUID();
const adminPool = createPostgresPool(readMigrationDatabaseUrlForTest());
const createdOrganizationIds: string[] = [];
const createdUserIds: string[] = [];

function readMigrationDatabaseUrlForTest(): string {
  const value = process.env["DATABASE_MIGRATION_URL"];

  if (value === undefined || value.trim() === "") {
    throw new Error("DATABASE_MIGRATION_URL is required for slice 3 CRM tests.");
  }

  return value;
}

function rowsFromExecuteResult(result: unknown): ReadonlyArray<Record<string, unknown>> {
  if (Array.isArray(result)) {
    return result as ReadonlyArray<Record<string, unknown>>;
  }

  if (typeof result !== "object" || result === null || !("rows" in result)) {
    return [];
  }

  const rows = (result as { readonly rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as ReadonlyArray<Record<string, unknown>>) : [];
}

async function adminCreateTenant(label: string): Promise<TenantFixture> {
  const organizationId = randomUUID();
  const workspaceId = randomUUID();
  const userId = randomUUID();
  const slug = `slice3-crm-${testRunId}-${label}`;

  await adminPool.query(
    `insert into public.organizations (id, slug, name, lifecycle_state)
     values ($1, $2, $3, 'active')`,
    [organizationId, slug, `Slice 3 CRM ${label}`],
  );
  await adminPool.query(
    `insert into public.workspaces (id, organization_id, slug, name)
     values ($1, $2, $3, $4)`,
    [workspaceId, organizationId, "admin", "Admin"],
  );
  await adminPool.query(
    `insert into public.auth_users (id, name, email, email_verified)
     values ($1, $2, $3, true)`,
    [userId, `CRM Member ${label}`, `${label}-${testRunId}@example.test`],
  );
  await adminPool.query(
    `insert into public.memberships (organization_id, user_id, status, membership_version)
     values ($1, $2, 'active', 1)`,
    [organizationId, userId],
  );
  await adminPool.query(
    `insert into public.role_grants (
      organization_id,
      subject_type,
      subject_id,
      role_key,
      scope_type,
      scope_id,
      granted_by_user_id
    )
    values ($1, 'user', $2, 'member', 'organization', $1, $2)`,
    [organizationId, userId],
  );

  createdOrganizationIds.push(organizationId);
  createdUserIds.push(userId);
  return { organizationId, workspaceId, userId };
}

function actor(userId: string) {
  return { userId, roleKeys: ["member"] };
}

function context(tenant: TenantFixture) {
  return {
    orgId: tenant.organizationId,
    workspaceId: tenant.workspaceId,
    actor: actor(tenant.userId),
  };
}

function unwrap<T>(result: Result<T>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}

function expectError(result: Result<unknown>, code: string): void {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("Expected error result.");
  }

  expect(result.error.code).toBe(code);
}

function flattenDeals(columns: readonly { readonly deals: readonly CrmDealDto[] }[]): CrmDealDto[] {
  return columns.flatMap((column) => [...column.deals]);
}

async function cleanupCreatedRows(): Promise<void> {
  const organizationIds = [...createdOrganizationIds];
  const userIds = [...createdUserIds];

  if (organizationIds.length > 0) {
    await adminPool.query(
      "delete from public.crm_activities where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query(
      "delete from public.crm_tickets where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query("delete from public.crm_deals where organization_id = any($1::uuid[])", [
      organizationIds,
    ]);
    await adminPool.query(
      "delete from public.crm_pipeline_stages where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query(
      "delete from public.crm_pipelines where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query(
      "delete from public.crm_contacts where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query(
      "delete from public.crm_accounts where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query(
      "delete from public.role_grants where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query(
      "delete from public.memberships where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query("delete from public.workspaces where organization_id = any($1::uuid[])", [
      organizationIds,
    ]);
    await adminPool.query("delete from public.organizations where id = any($1::uuid[])", [
      organizationIds,
    ]);
  }

  if (userIds.length > 0) {
    await adminPool.query("delete from public.auth_users where id = any($1::text[])", [userIds]);
  }

  createdOrganizationIds.length = 0;
  createdUserIds.length = 0;
}

beforeAll(async () => {
  const result = await db.execute(sql`
    select current_user as session_role, rolsuper as is_super, rolbypassrls as bypass_rls
    from pg_roles
    where rolname = current_user
  `);
  const row = rowsFromExecuteResult(result)[0];
  if (
    row?.["session_role"] !== "opzava_app" ||
    row?.["is_super"] === true ||
    row?.["bypass_rls"] === true
  ) {
    throw new Error(
      `Slice 3 CRM integration test must run as non-owner opzava_app; got ${JSON.stringify(row)}`,
    );
  }
});

afterEach(async () => {
  await cleanupCreatedRows();
});

afterAll(async () => {
  await pool.end();
  await adminPool.end();
});

describe("slice 3 CRM core", () => {
  it("keeps tenant rows isolated and returns forbidden for non-member actors", async () => {
    const tenantA = await adminCreateTenant("isolation-a");
    const tenantB = await adminCreateTenant("isolation-b");

    const account = unwrap(
      await createAccount({
        ...context(tenantA),
        name: "Tenant A Account",
      }),
    );
    const contact = unwrap(
      await createContact({
        ...context(tenantA),
        displayName: "Tenant A Contact",
        accountId: account.id,
      }),
    );
    const deal = unwrap(
      await createDeal({
        ...context(tenantA),
        title: "Tenant A Deal",
        accountId: account.id,
        primaryContactId: contact.id,
      }),
    );
    const ticket = unwrap(
      await createTicket({
        ...context(tenantA),
        subject: "Tenant A Ticket",
        contactId: contact.id,
        accountId: account.id,
      }),
    );

    expectError(
      await getAccount({
        ...context(tenantB),
        accountId: account.id,
      }),
      "crm.notFound",
    );
    expectError(
      await updateAccount({
        ...context(tenantB),
        accountId: account.id,
        name: "Tenant B cannot update",
      }),
      "crm.notFound",
    );
    expectError(
      await getContact({
        ...context(tenantB),
        contactId: contact.id,
      }),
      "crm.notFound",
    );
    expectError(
      await updateContact({
        ...context(tenantB),
        contactId: contact.id,
        displayName: "Tenant B cannot update",
      }),
      "crm.notFound",
    );
    expectError(
      await updateDeal({
        ...context(tenantB),
        dealId: deal.id,
        title: "Tenant B cannot update",
      }),
      "crm.notFound",
    );
    expectError(
      await getTicket({
        ...context(tenantB),
        ticketId: ticket.id,
      }),
      "crm.notFound",
    );
    expectError(
      await updateTicket({
        ...context(tenantB),
        ticketId: ticket.id,
        subject: "Tenant B cannot update",
      }),
      "crm.notFound",
    );

    expectError(
      await listAccounts({
        orgId: tenantA.organizationId,
        workspaceId: tenantA.workspaceId,
        actor: { userId: randomUUID(), roleKeys: [] },
      }),
      "crm.forbidden",
    );
  });

  it("returns existing rows for idempotent account, contact, deal, and ticket creates", async () => {
    const tenant = await adminCreateTenant("idempotency");

    const firstAccount = unwrap(
      await createAccount({
        ...context(tenant),
        name: "Idempotent account",
        idempotencyKey: "crm:account:same",
      }),
    );
    const retriedAccount = unwrap(
      await createAccount({
        ...context(tenant),
        name: "Changed account name must not duplicate",
        idempotencyKey: "crm:account:same",
      }),
    );
    const differentAccount = unwrap(
      await createAccount({
        ...context(tenant),
        name: "Different account",
        idempotencyKey: "crm:account:different",
      }),
    );
    expect(retriedAccount.id).toBe(firstAccount.id);
    expect(differentAccount.id).not.toBe(firstAccount.id);

    const firstContact = unwrap(
      await createContact({
        ...context(tenant),
        displayName: "Idempotent contact",
        accountId: firstAccount.id,
        idempotencyKey: "crm:contact:same",
      }),
    );
    const retriedContact = unwrap(
      await createContact({
        ...context(tenant),
        displayName: "Changed contact must not duplicate",
        accountId: randomUUID(),
        idempotencyKey: "crm:contact:same",
      }),
    );
    const differentContact = unwrap(
      await createContact({
        ...context(tenant),
        displayName: "Different contact",
        accountId: firstAccount.id,
        idempotencyKey: "crm:contact:different",
      }),
    );
    expect(retriedContact.id).toBe(firstContact.id);
    expect(differentContact.id).not.toBe(firstContact.id);

    const firstDeal = unwrap(
      await createDeal({
        ...context(tenant),
        title: "Idempotent deal",
        accountId: firstAccount.id,
        primaryContactId: firstContact.id,
        idempotencyKey: "crm:deal:same",
      }),
    );
    const retriedDeal = unwrap(
      await createDeal({
        ...context(tenant),
        title: "Changed deal must not duplicate",
        accountId: randomUUID(),
        idempotencyKey: "crm:deal:same",
      }),
    );
    const differentDeal = unwrap(
      await createDeal({
        ...context(tenant),
        title: "Different deal",
        accountId: firstAccount.id,
        primaryContactId: firstContact.id,
        idempotencyKey: "crm:deal:different",
      }),
    );
    expect(retriedDeal.id).toBe(firstDeal.id);
    expect(differentDeal.id).not.toBe(firstDeal.id);

    const firstTicket = unwrap(
      await createTicket({
        ...context(tenant),
        subject: "Idempotent ticket",
        contactId: firstContact.id,
        accountId: firstAccount.id,
        idempotencyKey: "crm:ticket:same",
      }),
    );
    const retriedTicket = unwrap(
      await createTicket({
        ...context(tenant),
        subject: "Changed ticket must not duplicate",
        contactId: randomUUID(),
        idempotencyKey: "crm:ticket:same",
      }),
    );
    const differentTicket = unwrap(
      await createTicket({
        ...context(tenant),
        subject: "Different ticket",
        contactId: firstContact.id,
        accountId: firstAccount.id,
        idempotencyKey: "crm:ticket:different",
      }),
    );
    expect(retriedTicket.id).toBe(firstTicket.id);
    expect(differentTicket.id).not.toBe(firstTicket.id);
  });

  it("manages the default pipeline and validates deal stage movement", async () => {
    const tenant = await adminCreateTenant("pipeline-a");
    const otherTenant = await adminCreateTenant("pipeline-b");

    const firstPipeline = unwrap(await ensureDefaultPipeline(context(tenant)));
    const secondPipeline = unwrap(await ensureDefaultPipeline(context(tenant)));
    expect(secondPipeline.pipeline.id).toBe(firstPipeline.pipeline.id);
    expect(secondPipeline.stages).toHaveLength(4);

    const otherPipeline = unwrap(await ensureDefaultPipeline(context(otherTenant)));
    const account = unwrap(
      await createAccount({
        ...context(tenant),
        name: "Pipeline account",
      }),
    );
    const contact = unwrap(
      await createContact({
        ...context(tenant),
        displayName: "Pipeline contact",
        accountId: account.id,
      }),
    );
    const deal = unwrap(
      await createDeal({
        ...context(tenant),
        title: "Pipeline deal",
        accountId: account.id,
        primaryContactId: contact.id,
      }),
    );
    expect(deal.stageId).toBe(firstPipeline.stages[0]?.id);

    const moved = unwrap(
      await moveDealStage({
        ...context(tenant),
        dealId: deal.id,
        stageId: firstPipeline.stages[2]?.id ?? "",
      }),
    );
    expect(moved.stageId).toBe(firstPipeline.stages[2]?.id);

    const afterMoveTimeline = unwrap(
      await listContactTimeline({
        ...context(tenant),
        contactId: contact.id,
      }),
    );
    expect(
      afterMoveTimeline.filter((activity) => activity.kind === "deal_stage_changed"),
    ).toHaveLength(1);

    unwrap(
      await moveDealStage({
        ...context(tenant),
        dealId: deal.id,
        stageId: firstPipeline.stages[2]?.id ?? "",
      }),
    );
    const afterNoopTimeline = unwrap(
      await listContactTimeline({
        ...context(tenant),
        contactId: contact.id,
      }),
    );
    expect(
      afterNoopTimeline.filter((activity) => activity.kind === "deal_stage_changed"),
    ).toHaveLength(1);

    expectError(
      await moveDealStage({
        ...context(tenant),
        dealId: deal.id,
        stageId: otherPipeline.stages[1]?.id ?? "",
      }),
      "crm.validation",
    );
    const board = unwrap(await listDeals(context(tenant)));
    const unchanged = flattenDeals(board).find((candidate) => candidate.id === deal.id);
    expect(unchanged?.stageId).toBe(firstPipeline.stages[2]?.id);
  });

  it("supports deal close, reopen, and lost transitions with conflict protection", async () => {
    const tenant = await adminCreateTenant("deal-status");
    const account = unwrap(
      await createAccount({
        ...context(tenant),
        name: "Close account",
      }),
    );
    const deal = unwrap(
      await createDeal({
        ...context(tenant),
        title: "Closeable deal",
        accountId: account.id,
      }),
    );

    const won = unwrap(
      await closeDeal({
        ...context(tenant),
        dealId: deal.id,
        outcome: "won",
        closeReason: "Signed",
      }),
    );
    expect(won.status).toBe("won");
    expect(won.closedAt).not.toBeNull();

    expectError(
      await closeDeal({
        ...context(tenant),
        dealId: deal.id,
        outcome: "lost",
      }),
      "crm.conflict",
    );

    const reopened = unwrap(
      await reopenDeal({
        ...context(tenant),
        dealId: deal.id,
      }),
    );
    expect(reopened.status).toBe("open");
    expect(reopened.closedAt).toBeNull();

    const lost = unwrap(
      await closeDeal({
        ...context(tenant),
        dealId: deal.id,
        outcome: "lost",
        closeReason: "No budget",
      }),
    );
    expect(lost.status).toBe("lost");
  });

  it("validates ticket contacts and appends ticket status activity only on changes", async () => {
    const tenant = await adminCreateTenant("ticket-status-a");
    const otherTenant = await adminCreateTenant("ticket-status-b");
    const account = unwrap(
      await createAccount({
        ...context(tenant),
        name: "Ticket account",
      }),
    );
    const contact = unwrap(
      await createContact({
        ...context(tenant),
        displayName: "Ticket contact",
        accountId: account.id,
      }),
    );
    const otherContact = unwrap(
      await createContact({
        ...context(otherTenant),
        displayName: "Other tenant contact",
      }),
    );

    expectError(
      await createTicket({
        ...context(tenant),
        subject: "Cross tenant contact should fail",
        contactId: otherContact.id,
      }),
      "crm.notFound",
    );

    const ticket = unwrap(
      await createTicket({
        ...context(tenant),
        subject: "Ticket with activity",
        contactId: contact.id,
        accountId: account.id,
      }),
    );
    unwrap(
      await updateTicketStatus({
        ...context(tenant),
        ticketId: ticket.id,
        status: "open",
      }),
    );
    unwrap(
      await updateTicketStatus({
        ...context(tenant),
        ticketId: ticket.id,
        status: "open",
      }),
    );

    const timeline = unwrap(
      await listContactTimeline({
        ...context(tenant),
        contactId: contact.id,
      }),
    );
    expect(
      timeline.filter((activity) => activity.kind === "ticket_status_changed"),
    ).toHaveLength(1);
  });

  it("returns contact timeline newest-first and rejects invalid account parents", async () => {
    const tenant = await adminCreateTenant("timeline-parent-a");
    const otherTenant = await adminCreateTenant("timeline-parent-b");
    const account = unwrap(
      await createAccount({
        ...context(tenant),
        name: "Timeline account",
      }),
    );
    const contact = unwrap(
      await createContact({
        ...context(tenant),
        displayName: "Timeline contact",
        accountId: account.id,
      }),
    );
    const note = unwrap(
      await addNote({
        ...context(tenant),
        contactId: contact.id,
        body: "Followed up after qualification.",
      }),
    );
    expect(note.kind).toBe("note");

    const timeline = unwrap(
      await listContactTimeline({
        ...context(tenant),
        contactId: contact.id,
      }),
    );
    expect(timeline[0]?.kind).toBe("note");
    expect(timeline.map((activity) => activity.kind)).toContain("contact_created");

    expectError(
      await updateAccount({
        ...context(tenant),
        accountId: account.id,
        parentAccountId: account.id,
      }),
      "crm.validation",
    );

    const otherAccount = unwrap(
      await createAccount({
        ...context(otherTenant),
        name: "Other tenant parent",
      }),
    );
    expectError(
      await updateAccount({
        ...context(tenant),
        accountId: account.id,
        parentAccountId: otherAccount.id,
      }),
      "crm.notFound",
    );
  });
});
