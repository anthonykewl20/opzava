import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { appRole, ownerRole } from "./tasks.js";

export const taskEvidenceKind = pgEnum("task_evidence_kind", ["file", "link"]);
export const taskQualityReviewStatus = pgEnum("task_quality_review_status", [
  "open",
  "approved",
  "changes_requested",
]);
export const taskQualityCheckKind = pgEnum("task_quality_check_kind", ["ai_precheck", "human"]);
export const taskQualityCheckState = pgEnum("task_quality_check_state", [
  "pass",
  "fail",
  "pending",
]);
export const taskQualityReviewerState = pgEnum("task_quality_reviewer_state", [
  "pending",
  "approved",
  "changes_requested",
]);

export const taskEvidence = pgTable(
  "task_evidence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    taskId: uuid("task_id").notNull(),
    kind: taskEvidenceKind("kind").notNull(),
    objectRef: text("object_ref"),
    url: text("url"),
    filename: text("filename").notNull(),
    contentType: text("content_type"),
    size: bigint("size", { mode: "number" }),
    provenance: text("provenance").notNull(),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("task_evidence_id_organization_id_unique").on(table.id, table.organizationId),
    index("task_evidence_organization_task_created_idx").on(
      table.organizationId,
      table.taskId,
      table.createdAt,
    ),
    pgPolicy("task_evidence_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`,
    }),
    pgPolicy("task_evidence_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`,
    }),
    pgPolicy("task_evidence_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();

export const taskQualityReview = pgTable(
  "task_quality_review",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    taskId: uuid("task_id").notNull(),
    status: taskQualityReviewStatus("status").notNull().default("open"),
    approvedByUserId: text("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("task_quality_review_task_unique").on(table.taskId),
    uniqueIndex("task_quality_review_id_organization_id_unique").on(table.id, table.organizationId),
    pgPolicy("task_quality_review_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`,
    }),
    pgPolicy("task_quality_review_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`,
    }),
    pgPolicy("task_quality_review_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();

export const taskQualityCheck = pgTable(
  "task_quality_check",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reviewId: uuid("review_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    taskId: uuid("task_id").notNull(),
    label: text("label").notNull(),
    kind: taskQualityCheckKind("kind").notNull(),
    state: taskQualityCheckState("state").notNull().default("pending"),
    actor: text("actor").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("task_quality_check_id_organization_id_unique").on(table.id, table.organizationId),
    index("task_quality_check_organization_review_idx").on(table.organizationId, table.reviewId),
    pgPolicy("task_quality_check_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`,
    }),
    pgPolicy("task_quality_check_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`,
    }),
    pgPolicy("task_quality_check_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();

export const taskQualityReviewer = pgTable(
  "task_quality_reviewer",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reviewId: uuid("review_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    taskId: uuid("task_id").notNull(),
    reviewerUserId: text("reviewer_user_id").notNull(),
    state: taskQualityReviewerState("state").notNull().default("pending"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("task_quality_reviewer_review_user_unique").on(
      table.reviewId,
      table.reviewerUserId,
    ),
    uniqueIndex("task_quality_reviewer_id_organization_id_unique").on(
      table.id,
      table.organizationId,
    ),
    pgPolicy("task_quality_reviewer_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`,
    }),
    pgPolicy("task_quality_reviewer_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`,
    }),
    pgPolicy("task_quality_reviewer_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();
