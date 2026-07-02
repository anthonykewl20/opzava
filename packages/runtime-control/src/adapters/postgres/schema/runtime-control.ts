import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgEnum,
  pgPolicy,
  pgRole,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import {
  assistantConversationStatuses,
  assistantToolOutcomeStatuses,
  assistantTurnRoles,
  assistantTurnStatuses
} from "../../../domain/assistant.js";

export const appRole = pgRole("opzava_app").existing();
export const ownerRole = pgRole("opzava_owner").existing();

export const assistantConversationStatus = pgEnum(
  "assistant_conversation_status",
  assistantConversationStatuses
);
export const assistantTurnRole = pgEnum("assistant_turn_role", assistantTurnRoles);
export const assistantTurnStatus = pgEnum("assistant_turn_status", assistantTurnStatuses);
export const assistantToolOutcomeStatus = pgEnum(
  "assistant_tool_outcome_status",
  assistantToolOutcomeStatuses
);

export const assistantConversations = pgTable(
  "assistant_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    surface: text("surface").notNull(),
    assistantKey: text("assistant_key").notNull(),
    status: assistantConversationStatus("status").notNull().default("open"),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("assistant_conversations_id_organization_id_unique").on(
      table.id,
      table.organizationId
    ),
    index("assistant_conversations_organization_workspace_idx").on(
      table.organizationId,
      table.workspaceId
    ),
    pgPolicy("assistant_conversations_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`
    }),
    pgPolicy("assistant_conversations_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`
    }),
    pgPolicy("assistant_conversations_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`
    })
  ]
).enableRLS();

export const assistantTurns = pgTable(
  "assistant_turns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    role: assistantTurnRole("role").notNull(),
    status: assistantTurnStatus("status").notNull(),
    actorUserId: text("actor_user_id"),
    assistantKey: text("assistant_key"),
    content: jsonb("content").notNull().default(sql`'{}'::jsonb`),
    idempotencyKey: text("idempotency_key").notNull(),
    openclawSessionRef: text("openclaw_session_ref"),
    openclawRunRef: text("openclaw_run_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("assistant_turns_id_organization_id_unique").on(
      table.id,
      table.organizationId
    ),
    uniqueIndex("assistant_turns_org_conversation_idempotency_unique").on(
      table.organizationId,
      table.conversationId,
      table.idempotencyKey
    ),
    index("assistant_turns_organization_conversation_created_idx").on(
      table.organizationId,
      table.conversationId,
      table.createdAt
    ),
    pgPolicy("assistant_turns_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`
    }),
    pgPolicy("assistant_turns_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`
    }),
    pgPolicy("assistant_turns_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`
    })
  ]
).enableRLS();

export const assistantToolOutcomes = pgTable(
  "assistant_tool_outcomes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    turnId: uuid("turn_id").notNull(),
    toolName: text("tool_name").notNull(),
    toolCallId: text("tool_call_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: assistantToolOutcomeStatus("status").notNull(),
    requestSummary: jsonb("request_summary").notNull().default(sql`'{}'::jsonb`),
    resultSummary: jsonb("result_summary").notNull().default(sql`'{}'::jsonb`),
    targetRef: text("target_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("assistant_tool_outcomes_turn_tool_call_unique").on(
      table.turnId,
      table.toolCallId
    ),
    index("assistant_tool_outcomes_organization_turn_idx").on(
      table.organizationId,
      table.turnId
    ),
    pgPolicy("assistant_tool_outcomes_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`
    }),
    pgPolicy("assistant_tool_outcomes_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`
    }),
    pgPolicy("assistant_tool_outcomes_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`
    })
  ]
).enableRLS();
