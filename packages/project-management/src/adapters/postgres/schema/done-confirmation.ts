import { sql } from "drizzle-orm";
import { index, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { appRole, ownerRole } from "./tasks.js";

export const taskDoneConfirmation = pgTable(
  "task_done_confirmation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    issuedForUserId: text("issued_for_user_id").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    consumedByUserId: text("consumed_by_user_id"),
    qualityReviewId: uuid("quality_review_id"),
  },
  (table) => [
    index("task_done_confirmation_unconsumed_idx")
      .on(table.organizationId, table.taskId, table.issuedForUserId, table.expiresAt)
      .where(sql`${table.consumedAt} is null`),
    pgPolicy("task_done_confirmation_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`,
    }),
    pgPolicy("task_done_confirmation_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`,
    }),
    pgPolicy("task_done_confirmation_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();
