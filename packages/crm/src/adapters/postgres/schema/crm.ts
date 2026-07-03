import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgPolicy,
  pgRole,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  crmActivityActorKinds,
  crmActivityKinds,
  crmContactLifecycles,
  crmDealStatuses,
  crmTicketPriorities,
  crmTicketStatuses,
} from "../../../domain/index.js";

export const appRole = pgRole("opzava_app").existing();
export const ownerRole = pgRole("opzava_owner").existing();

export const crmContactLifecycle = pgEnum("crm_contact_lifecycle", crmContactLifecycles);
export const crmDealStatus = pgEnum("crm_deal_status", crmDealStatuses);
export const crmTicketStatus = pgEnum("crm_ticket_status", crmTicketStatuses);
export const crmTicketPriority = pgEnum("crm_ticket_priority", crmTicketPriorities);
export const crmActivityKind = pgEnum("crm_activity_kind", crmActivityKinds);
export const crmActivityActorKind = pgEnum(
  "crm_activity_actor_kind",
  crmActivityActorKinds,
);

export const crmAccounts = pgTable(
  "crm_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    name: text("name").notNull(),
    domain: text("domain"),
    industry: text("industry"),
    website: text("website"),
    description: text("description").notNull().default(""),
    ownerUserId: text("owner_user_id"),
    parentAccountId: uuid("parent_account_id"),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("crm_accounts_id_organization_id_unique").on(table.id, table.organizationId),
    uniqueIndex("crm_accounts_organization_idempotency_key_unique").on(
      table.organizationId,
      table.idempotencyKey,
    ),
    index("crm_accounts_organization_workspace_name_idx").on(
      table.organizationId,
      table.workspaceId,
      table.name,
    ),
    foreignKey({
      columns: [table.parentAccountId, table.organizationId],
      foreignColumns: [table.id, table.organizationId],
      name: "crm_accounts_parent_account_organization_fk",
    }),
    check("crm_accounts_name_nonempty_check", sql`char_length(btrim(${table.name})) > 0`),
    pgPolicy("crm_accounts_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`,
    }),
    pgPolicy("crm_accounts_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`,
    }),
    pgPolicy("crm_accounts_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();

export const crmContacts = pgTable(
  "crm_contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    title: text("title"),
    lifecycleStage: crmContactLifecycle("lifecycle_stage").notNull().default("lead"),
    accountId: uuid("account_id"),
    ownerUserId: text("owner_user_id"),
    notes: text("notes").notNull().default(""),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("crm_contacts_id_organization_id_unique").on(table.id, table.organizationId),
    uniqueIndex("crm_contacts_organization_idempotency_key_unique").on(
      table.organizationId,
      table.idempotencyKey,
    ),
    index("crm_contacts_organization_workspace_name_idx").on(
      table.organizationId,
      table.workspaceId,
      table.displayName,
    ),
    foreignKey({
      columns: [table.accountId, table.organizationId],
      foreignColumns: [crmAccounts.id, crmAccounts.organizationId],
      name: "crm_contacts_account_organization_fk",
    }),
    check(
      "crm_contacts_display_name_nonempty_check",
      sql`char_length(btrim(${table.displayName})) > 0`,
    ),
    pgPolicy("crm_contacts_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`,
    }),
    pgPolicy("crm_contacts_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`,
    }),
    pgPolicy("crm_contacts_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();

export const crmPipelines = pgTable(
  "crm_pipelines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    key: text("key").notNull().default("default"),
    version: integer("version").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("crm_pipelines_id_organization_id_unique").on(table.id, table.organizationId),
    uniqueIndex("crm_pipelines_workspace_key_version_unique").on(
      table.workspaceId,
      table.key,
      table.version,
    ),
    check("crm_pipelines_key_nonempty_check", sql`char_length(btrim(${table.key})) > 0`),
    check("crm_pipelines_version_positive_check", sql`${table.version} > 0`),
    check("crm_pipelines_name_nonempty_check", sql`char_length(btrim(${table.name})) > 0`),
    pgPolicy("crm_pipelines_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`,
    }),
    pgPolicy("crm_pipelines_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`,
    }),
    pgPolicy("crm_pipelines_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();

export const crmPipelineStages = pgTable(
  "crm_pipeline_stages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pipelineId: uuid("pipeline_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("crm_pipeline_stages_id_organization_id_unique").on(
      table.id,
      table.organizationId,
    ),
    uniqueIndex("crm_pipeline_stages_pipeline_position_unique").on(
      table.pipelineId,
      table.position,
    ),
    index("crm_pipeline_stages_organization_pipeline_position_idx").on(
      table.organizationId,
      table.pipelineId,
      table.position,
    ),
    foreignKey({
      columns: [table.pipelineId, table.organizationId],
      foreignColumns: [crmPipelines.id, crmPipelines.organizationId],
      name: "crm_pipeline_stages_pipeline_organization_fk",
    }),
    check("crm_pipeline_stages_name_nonempty_check", sql`char_length(btrim(${table.name})) > 0`),
    check("crm_pipeline_stages_position_nonnegative_check", sql`${table.position} >= 0`),
    pgPolicy("crm_pipeline_stages_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`,
    }),
    pgPolicy("crm_pipeline_stages_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`,
    }),
    pgPolicy("crm_pipeline_stages_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();

export const crmDeals = pgTable(
  "crm_deals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    title: text("title").notNull(),
    accountId: uuid("account_id").notNull(),
    primaryContactId: uuid("primary_contact_id"),
    pipelineId: uuid("pipeline_id").notNull(),
    stageId: uuid("stage_id").notNull(),
    status: crmDealStatus("status").notNull().default("open"),
    valueCents: bigint("value_cents", { mode: "number" }),
    currency: text("currency").notNull().default("USD"),
    ownerUserId: text("owner_user_id"),
    expectedCloseDate: timestamp("expected_close_date", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closeReason: text("close_reason"),
    position: integer("position").notNull().default(0),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("crm_deals_id_organization_id_unique").on(table.id, table.organizationId),
    uniqueIndex("crm_deals_organization_idempotency_key_unique").on(
      table.organizationId,
      table.idempotencyKey,
    ),
    index("crm_deals_organization_workspace_pipeline_stage_position_idx").on(
      table.organizationId,
      table.workspaceId,
      table.pipelineId,
      table.stageId,
      table.position,
    ),
    foreignKey({
      columns: [table.accountId, table.organizationId],
      foreignColumns: [crmAccounts.id, crmAccounts.organizationId],
      name: "crm_deals_account_organization_fk",
    }),
    foreignKey({
      columns: [table.primaryContactId, table.organizationId],
      foreignColumns: [crmContacts.id, crmContacts.organizationId],
      name: "crm_deals_primary_contact_organization_fk",
    }),
    foreignKey({
      columns: [table.pipelineId, table.organizationId],
      foreignColumns: [crmPipelines.id, crmPipelines.organizationId],
      name: "crm_deals_pipeline_organization_fk",
    }),
    foreignKey({
      columns: [table.stageId, table.organizationId],
      foreignColumns: [crmPipelineStages.id, crmPipelineStages.organizationId],
      name: "crm_deals_stage_organization_fk",
    }),
    check("crm_deals_title_nonempty_check", sql`char_length(btrim(${table.title})) > 0`),
    check("crm_deals_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "crm_deals_value_nonnegative_check",
      sql`${table.valueCents} is null or ${table.valueCents} >= 0`,
    ),
    check("crm_deals_position_nonnegative_check", sql`${table.position} >= 0`),
    pgPolicy("crm_deals_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`,
    }),
    pgPolicy("crm_deals_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`,
    }),
    pgPolicy("crm_deals_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();

export const crmTickets = pgTable(
  "crm_tickets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull().default(""),
    contactId: uuid("contact_id").notNull(),
    accountId: uuid("account_id"),
    status: crmTicketStatus("status").notNull().default("new"),
    priority: crmTicketPriority("priority").notNull().default("normal"),
    queue: text("queue").notNull().default("support"),
    assigneeUserId: text("assignee_user_id"),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("crm_tickets_id_organization_id_unique").on(table.id, table.organizationId),
    uniqueIndex("crm_tickets_organization_idempotency_key_unique").on(
      table.organizationId,
      table.idempotencyKey,
    ),
    index("crm_tickets_organization_workspace_status_priority_idx").on(
      table.organizationId,
      table.workspaceId,
      table.status,
      table.priority,
    ),
    foreignKey({
      columns: [table.contactId, table.organizationId],
      foreignColumns: [crmContacts.id, crmContacts.organizationId],
      name: "crm_tickets_contact_organization_fk",
    }),
    foreignKey({
      columns: [table.accountId, table.organizationId],
      foreignColumns: [crmAccounts.id, crmAccounts.organizationId],
      name: "crm_tickets_account_organization_fk",
    }),
    check("crm_tickets_subject_nonempty_check", sql`char_length(btrim(${table.subject})) > 0`),
    check("crm_tickets_queue_nonempty_check", sql`char_length(btrim(${table.queue})) > 0`),
    pgPolicy("crm_tickets_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`,
    }),
    pgPolicy("crm_tickets_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`,
    }),
    pgPolicy("crm_tickets_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();

export const crmActivities = pgTable(
  "crm_activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    kind: crmActivityKind("kind").notNull(),
    body: text("body").notNull().default(""),
    actorKind: crmActivityActorKind("actor_kind").notNull().default("human"),
    actorUserId: text("actor_user_id"),
    contactId: uuid("contact_id"),
    accountId: uuid("account_id"),
    dealId: uuid("deal_id"),
    ticketId: uuid("ticket_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("crm_activities_id_organization_id_unique").on(table.id, table.organizationId),
    index("crm_activities_organization_contact_occurred_idx").on(
      table.organizationId,
      table.contactId,
      table.occurredAt,
    ),
    index("crm_activities_organization_deal_occurred_idx").on(
      table.organizationId,
      table.dealId,
      table.occurredAt,
    ),
    foreignKey({
      columns: [table.contactId, table.organizationId],
      foreignColumns: [crmContacts.id, crmContacts.organizationId],
      name: "crm_activities_contact_organization_fk",
    }),
    foreignKey({
      columns: [table.accountId, table.organizationId],
      foreignColumns: [crmAccounts.id, crmAccounts.organizationId],
      name: "crm_activities_account_organization_fk",
    }),
    foreignKey({
      columns: [table.dealId, table.organizationId],
      foreignColumns: [crmDeals.id, crmDeals.organizationId],
      name: "crm_activities_deal_organization_fk",
    }),
    foreignKey({
      columns: [table.ticketId, table.organizationId],
      foreignColumns: [crmTickets.id, crmTickets.organizationId],
      name: "crm_activities_ticket_organization_fk",
    }),
    check(
      "crm_activities_subject_ref_check",
      sql`${table.contactId} is not null
        or ${table.accountId} is not null
        or ${table.dealId} is not null
        or ${table.ticketId} is not null`,
    ),
    pgPolicy("crm_activities_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`,
    }),
    pgPolicy("crm_activities_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`,
    }),
    pgPolicy("crm_activities_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();
