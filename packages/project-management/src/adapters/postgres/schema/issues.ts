import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { appRole, ownerRole } from "./tasks.js";

export const issueProjection = pgTable(
  "issue_projection",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    repository: text("repository").notNull(),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    state: text("state").notNull(),
    labels: text("labels")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    assignee: text("assignee"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    url: text("url").notNull(),
  },
  (table) => [
    uniqueIndex("issue_projection_workspace_repo_number_unique").on(
      table.workspaceId,
      table.repository,
      table.number,
    ),
    uniqueIndex("issue_projection_id_organization_id_unique").on(table.id, table.organizationId),
    index("issue_projection_organization_workspace_state_idx").on(
      table.organizationId,
      table.workspaceId,
      table.state,
      table.updatedAt,
    ),
    pgPolicy("issue_projection_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`,
    }),
    pgPolicy("issue_projection_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`,
    }),
    pgPolicy("issue_projection_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();

export const issueCloseOutbox = pgTable(
  "issue_close_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    taskId: uuid("task_id").notNull(),
    repository: text("repository").notNull(),
    issueNumber: integer("issue_number").notNull(),
    issueUrl: text("issue_url").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    state: text("state").notNull().default("pending"),
    closeReason: text("close_reason").notNull().default("completed"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("issue_close_outbox_dedupe_key_unique").on(table.dedupeKey),
    uniqueIndex("issue_close_outbox_id_organization_id_unique").on(table.id, table.organizationId),
    index("issue_close_outbox_pending_idx").on(
      table.organizationId,
      table.workspaceId,
      table.nextAttemptAt,
    ),
    pgPolicy("issue_close_outbox_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`,
    }),
    pgPolicy("issue_close_outbox_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`,
    }),
    pgPolicy("issue_close_outbox_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();

export const issueCreateIntent = pgTable(
  "issue_create_intent",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    actorUserId: text("actor_user_id").notNull(),
    repository: text("repository").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    state: text("state").notNull().default("processing"),
    issueProjectionId: uuid("issue_projection_id"),
    issueNumber: integer("issue_number"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("issue_create_intent_workspace_key_unique").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    uniqueIndex("issue_create_intent_id_organization_id_unique").on(
      table.id,
      table.organizationId,
    ),
    index("issue_create_intent_workspace_state_idx").on(
      table.organizationId,
      table.workspaceId,
      table.state,
      table.updatedAt,
    ),
    pgPolicy("issue_create_intent_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`,
    }),
    pgPolicy("issue_create_intent_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`,
    }),
    pgPolicy("issue_create_intent_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();
