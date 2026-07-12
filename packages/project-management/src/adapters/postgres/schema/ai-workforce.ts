import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  agentDispatchChannels,
  agentDispatchStates,
  agentIdentityKinds,
  agentIdentityStatuses,
  taskRunStepStates,
} from "../../../domain/ai-workforce.js";
import { appRole, ownerRole, taskCiState, taskMergeState } from "./tasks.js";

export const agentIdentityKind = pgEnum("agent_identity_kind", agentIdentityKinds);
export const agentIdentityStatus = pgEnum("agent_identity_status", agentIdentityStatuses);
export const agentDispatchChannel = pgEnum("agent_dispatch_channel", agentDispatchChannels);
export const agentDispatchState = pgEnum("agent_dispatch_state", agentDispatchStates);
export const taskRunStepState = pgEnum("task_run_step_state", taskRunStepStates);

export const agentIdentity = pgTable(
  "agent_identity",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    name: text("name").notNull(),
    kind: agentIdentityKind("kind").notNull(),
    provider: text("provider"),
    viaClient: text("via_client"),
    issuedToUserId: text("issued_to_user_id"),
    tokenId: text("token_id"),
    openclawAgentRef: text("openclaw_agent_ref"),
    status: agentIdentityStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("agent_identity_id_organization_id_unique").on(table.id, table.organizationId),
    uniqueIndex("agent_identity_organization_workspace_name_unique").on(
      table.organizationId,
      table.workspaceId,
      table.name,
    ),
    pgPolicy("agent_identity_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`,
    }),
    pgPolicy("agent_identity_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`,
    }),
    pgPolicy("agent_identity_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();

export const taskAgentAssignment = pgTable(
  "task_agent_assignment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    taskId: uuid("task_id").notNull(),
    agentIdentityId: uuid("agent_identity_id").notNull(),
    runPolicy: text("run_policy"),
    assignedByUserId: text("assigned_by_user_id"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("task_agent_assignment_id_organization_id_unique").on(
      table.id,
      table.organizationId,
    ),
    uniqueIndex("task_agent_assignment_active_task_unique")
      .on(table.organizationId, table.taskId)
      .where(sql`${table.active}`),
    pgPolicy("task_agent_assignment_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`,
    }),
    pgPolicy("task_agent_assignment_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`,
    }),
    pgPolicy("task_agent_assignment_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();

export const agentDispatch = pgTable(
  "agent_dispatch",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    taskId: uuid("task_id").notNull(),
    outboxId: text("outbox_id").notNull(),
    channel: agentDispatchChannel("channel").notNull(),
    state: agentDispatchState("state").notNull().default("pending"),
    degradedReason: text("degraded_reason"),
    openclawSessionRef: text("openclaw_session_ref"),
    openclawTaskRef: text("openclaw_task_ref"),
    aiRunRef: text("ai_run_ref"),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("agent_dispatch_id_organization_id_unique").on(table.id, table.organizationId),
    uniqueIndex("agent_dispatch_organization_outbox_unique").on(
      table.organizationId,
      table.outboxId,
    ),
    pgPolicy("agent_dispatch_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`,
    }),
    pgPolicy("agent_dispatch_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`,
    }),
    pgPolicy("agent_dispatch_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();

export const taskRunStep = pgTable(
  "task_run_step",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    taskId: uuid("task_id").notNull(),
    agentIdentityId: uuid("agent_identity_id"),
    sequence: integer("sequence").notNull(),
    summary: text("summary").notNull(),
    state: taskRunStepState("state").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("task_run_step_id_organization_id_unique").on(table.id, table.organizationId),
    index("task_run_step_organization_task_sequence_idx").on(
      table.organizationId,
      table.taskId,
      table.sequence,
    ),
    pgPolicy("task_run_step_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`,
    }),
    pgPolicy("task_run_step_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`,
    }),
    pgPolicy("task_run_step_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();

export const taskPullQueue = pgTable(
  "task_pull_queue",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    taskId: uuid("task_id").notNull(),
    agentIdentityId: uuid("agent_identity_id").notNull(),
    reason: text("reason"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimedByTokenId: text("claimed_by_token_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("task_pull_queue_id_organization_id_unique").on(table.id, table.organizationId),
    index("task_pull_queue_organization_agent_created_idx").on(
      table.organizationId,
      table.agentIdentityId,
      table.createdAt,
    ),
    pgPolicy("task_pull_queue_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`,
    }),
    pgPolicy("task_pull_queue_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`,
    }),
    pgPolicy("task_pull_queue_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();

export const taskPrLink = pgTable(
  "task_pr_link",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    taskId: uuid("task_id").notNull(),
    prRef: text("pr_ref").notNull(),
    branch: text("branch"),
    ciState: taskCiState("ci_state"),
    mergeability: text("mergeability"),
    checksUrl: text("checks_url"),
    mergeState: taskMergeState("merge_state"),
    mergedByUserId: text("merged_by_user_id"),
    mergedAt: timestamp("merged_at", { withTimezone: true }),
    mergeAudit: text("merge_audit"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("task_pr_link_id_organization_id_unique").on(table.id, table.organizationId),
    uniqueIndex("task_pr_link_organization_task_pr_ref_unique").on(
      table.organizationId,
      table.taskId,
      table.prRef,
    ),
    pgPolicy("task_pr_link_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`,
    }),
    pgPolicy("task_pr_link_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`,
    }),
    pgPolicy("task_pr_link_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();
