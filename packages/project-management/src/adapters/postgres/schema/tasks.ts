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

import { taskPriorities, taskStatuses } from "../../../domain/task.js";

export const appRole = pgRole("opzava_app").existing();
export const ownerRole = pgRole("opzava_owner").existing();

export const taskStatus = pgEnum("task_status", taskStatuses);
export const taskPriority = pgEnum("task_priority", taskPriorities);
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
    priority: taskPriority("priority").notNull().default("normal"),
    assigneeUserId: text("assignee_user_id"),
    labels: text("labels").array().notNull().default(sql`'{}'::text[]`),
    position: integer("position").notNull().default(0),
    dueAt: timestamp("due_at", { withTimezone: true }),
    provenanceSource: text("provenance_source").notNull().default("manual"),
    provenanceExternalRef: text("provenance_external_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("tasks_id_organization_id_unique").on(table.id, table.organizationId),
    uniqueIndex("tasks_workspace_card_number_unique").on(table.workspaceId, table.cardNumber),
    index("tasks_organization_workspace_status_position_idx").on(
      table.organizationId,
      table.workspaceId,
      table.status,
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("task_steps_id_organization_id_unique").on(table.id, table.organizationId),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("task_comments_id_organization_id_unique").on(table.id, table.organizationId),
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
