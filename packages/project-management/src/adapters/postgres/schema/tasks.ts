import { sql } from "drizzle-orm";
import {
  index,
  bigint,
  boolean,
  integer,
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
  taskChangeTypes,
  taskCiStates,
  taskLanes,
  taskMergeStates,
  taskPriorities,
  taskReviewStates,
  taskStatuses
} from "../../../domain/task.js";

export const appRole = pgRole("opzava_app").existing();
export const ownerRole = pgRole("opzava_owner").existing();

export const taskStatus = pgEnum("task_status", taskStatuses);
export const taskLane = pgEnum("task_lane", taskLanes);
export const taskPriority = pgEnum("task_priority", taskPriorities);
export const taskChangeType = pgEnum("task_change_type", taskChangeTypes);
export const taskReviewState = pgEnum("task_review_state", taskReviewStates);
export const taskMergeState = pgEnum("task_merge_state", taskMergeStates);
export const taskCiState = pgEnum("task_ci_state", taskCiStates);
export const taskCommentAuthorKind = pgEnum("task_comment_author_kind", [
  "human",
  "assistant"
]);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    cardNumber: bigint("card_number", { mode: "number" }).notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: taskStatus("status").notNull().default("todo"),
    lane: taskLane("lane").notNull().default("todo"),
    blocked: boolean("blocked").notNull().default(false),
    blockedReason: text("blocked_reason"),
    priority: taskPriority("priority").notNull().default("normal"),
    assigneeUserId: text("assignee_user_id"),
    overview: text("overview"),
    assignedAgentIdentityId: uuid("assigned_agent_identity_id"),
    primaryIssueRef: text("primary_issue_ref"),
    primaryPrRef: text("primary_pr_ref"),
    branchName: text("branch_name"),
    changeType: taskChangeType("change_type"),
    reviewState: taskReviewState("review_state").notNull().default("not_requested"),
    reviewRequestedAt: timestamp("review_requested_at", { withTimezone: true }),
    reviewRequestedByAgentIdentityId: uuid("review_requested_by_agent_identity_id"),
    reviewPassedAt: timestamp("review_passed_at", { withTimezone: true }),
    reviewPassedByOrchestratorIdentityId: uuid(
      "review_passed_by_orchestrator_identity_id"
    ),
    doneRequestedAt: timestamp("done_requested_at", { withTimezone: true }),
    doneByUserId: text("done_by_user_id"),
    mergeState: taskMergeState("merge_state").notNull().default("none"),
    ciState: taskCiState("ci_state").notNull().default("unknown"),
    labels: text("labels").array().notNull().default(sql`'{}'::text[]`),
    position: integer("position").notNull().default(0),
    dueAt: timestamp("due_at", { withTimezone: true }),
    provenanceSource: text("provenance_source").notNull().default("manual"),
    provenanceExternalRef: text("provenance_external_ref"),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("tasks_id_organization_id_unique").on(table.id, table.organizationId),
    uniqueIndex("tasks_workspace_card_number_unique").on(table.workspaceId, table.cardNumber),
    uniqueIndex("tasks_organization_idempotency_key_unique").on(
      table.organizationId,
      table.idempotencyKey
    ),
    // NOTE: position is best-effort display order — intentionally NOT unique.
    // A rare concurrent same-(workspace,status) create can momentarily assign a
    // duplicate position (nondeterministic tie-break only, no data loss,
    // resolved on the next reorder). A unique (workspace,status,position) index
    // was tried and REVERTED because reorder does absolute-position moves that a
    // non-deferrable unique index breaks (23505) without a make-room-shift
    // redesign — out of scope for this follow-up.
    index("tasks_organization_workspace_status_position_idx").on(
      table.organizationId,
      table.workspaceId,
      table.status,
      table.position
    ),
    index("tasks_org_ws_lane_position_idx").on(
      table.organizationId,
      table.workspaceId,
      table.lane,
      table.position
    ),
    pgPolicy("tasks_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`
    }),
    pgPolicy("tasks_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`
    }),
    pgPolicy("tasks_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`
    })
  ]
).enableRLS();

export const taskSteps = pgTable(
  "task_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    text: text("text").notNull(),
    assigneeUserId: text("assignee_user_id"),
    done: boolean("done").notNull().default(false),
    position: integer("position").notNull(),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("task_steps_id_organization_id_unique").on(table.id, table.organizationId),
    uniqueIndex("task_steps_organization_idempotency_key_unique").on(
      table.organizationId,
      table.idempotencyKey
    ),
    index("task_steps_organization_task_position_idx").on(
      table.organizationId,
      table.taskId,
      table.position
    ),
    pgPolicy("task_steps_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`
    }),
    pgPolicy("task_steps_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`
    }),
    pgPolicy("task_steps_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`
    })
  ]
).enableRLS();

export const taskWatchers = pgTable(
  "task_watchers",
  {
    taskId: uuid("task_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("task_watchers_task_user_unique").on(table.taskId, table.userId),
    index("task_watchers_organization_task_idx").on(table.organizationId, table.taskId),
    pgPolicy("task_watchers_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`
    }),
    pgPolicy("task_watchers_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`
    }),
    pgPolicy("task_watchers_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`
    })
  ]
).enableRLS();

export const taskComments = pgTable(
  "task_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    authorKind: taskCommentAuthorKind("author_kind").notNull(),
    authorUserId: text("author_user_id"),
    assistantKey: text("assistant_key"),
    body: text("body").notNull(),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("task_comments_id_organization_id_unique").on(table.id, table.organizationId),
    uniqueIndex("task_comments_organization_idempotency_key_unique").on(
      table.organizationId,
      table.idempotencyKey
    ),
    index("task_comments_organization_task_created_idx").on(
      table.organizationId,
      table.taskId,
      table.createdAt
    ),
    pgPolicy("task_comments_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`
    }),
    pgPolicy("task_comments_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`
    }),
    pgPolicy("task_comments_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`
    })
  ]
).enableRLS();

export const taskCommentReadMarkers = pgTable(
  "task_comment_read_markers",
  {
    taskId: uuid("task_id").notNull(),
    commentId: uuid("comment_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    userId: text("user_id").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("task_comment_read_markers_comment_user_unique").on(
      table.commentId,
      table.userId
    ),
    index("task_comment_read_markers_organization_task_idx").on(
      table.organizationId,
      table.taskId
    ),
    pgPolicy("task_comment_read_markers_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`
    }),
    pgPolicy("task_comment_read_markers_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`
    }),
    pgPolicy("task_comment_read_markers_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`
    })
  ]
).enableRLS();
