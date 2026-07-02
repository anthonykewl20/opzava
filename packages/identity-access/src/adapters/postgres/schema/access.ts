import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import { authUsers } from "./auth.js";
import { appRole, organizations, ownerRole } from "./tenancy.js";

export const firstOwnerSetup = pgTable(
  "first_owner_setup",
  {
    singletonId: boolean("singleton_id").primaryKey().default(true),
    setupAttemptId: text("setup_attempt_id").notNull().unique(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [check("first_owner_setup_singleton_true", sql`${table.singletonId} is true`)]
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("active"),
    membershipVersion: integer("membership_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("memberships_organization_id_user_id_unique").on(
      table.organizationId,
      table.userId
    ),
    check(
      "memberships_status_check",
      sql`${table.status} in ('active', 'invited', 'suspended', 'removed')`
    ),
    index("memberships_user_id_idx").on(table.userId),
    index("memberships_organization_id_status_idx").on(table.organizationId, table.status),
    pgPolicy("memberships_identity_self_select", {
      for: "select",
      to: appRole,
      using: sql`${table.userId} = app.current_user_id() and ${table.status} = 'active'`
    }),
    pgPolicy("memberships_insert_tenant_isolation", {
      for: "insert",
      to: appRole,
      withCheck: sql`${table.organizationId} = app.current_org_id()`
    }),
    pgPolicy("memberships_update_tenant_isolation", {
      for: "update",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`
    }),
    pgPolicy("memberships_delete_tenant_isolation", {
      for: "delete",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`
    }),
    pgPolicy("memberships_insert_tenant_context_required", {
      as: "restrictive",
      for: "insert",
      to: appRole,
      withCheck: sql`app.current_org_id() is not null`
    }),
    pgPolicy("memberships_update_tenant_context_required", {
      as: "restrictive",
      for: "update",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`
    }),
    pgPolicy("memberships_delete_tenant_context_required", {
      as: "restrictive",
      for: "delete",
      to: appRole,
      using: sql`app.current_org_id() is not null`
    }),
    pgPolicy("memberships_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`
    })
  ]
).enableRLS();

export const roleCatalog = pgTable(
  "role_catalog",
  {
    roleKey: text("role_key").primaryKey(),
    scopeType: text("scope_type").notNull(),
    displayName: text("display_name").notNull(),
    isSystem: boolean("is_system").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check("role_catalog_scope_type_check", sql`${table.scopeType} in ('organization', 'project')`)
  ]
);

export const roleGrants = pgTable(
  "role_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    subjectType: text("subject_type").notNull().default("user"),
    subjectId: text("subject_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    roleKey: text("role_key")
      .notNull()
      .references(() => roleCatalog.roleKey, { onDelete: "restrict" }),
    scopeType: text("scope_type").notNull(),
    scopeId: uuid("scope_id").notNull(),
    grantedByUserId: text("granted_by_user_id").references(() => authUsers.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("role_grants_unique").on(
      table.organizationId,
      table.subjectType,
      table.subjectId,
      table.roleKey,
      table.scopeType,
      table.scopeId
    ),
    check("role_grants_subject_type_check", sql`${table.subjectType} in ('user')`),
    check("role_grants_scope_type_check", sql`${table.scopeType} in ('organization', 'project')`),
    index("role_grants_subject_idx").on(table.subjectType, table.subjectId),
    index("role_grants_organization_scope_idx").on(
      table.organizationId,
      table.scopeType,
      table.scopeId
    ),
    pgPolicy("role_grants_subject_select", {
      for: "select",
      to: appRole,
      using: sql`${table.subjectId} = app.current_user_id()`
    }),
    pgPolicy("role_grants_insert_tenant_isolation", {
      for: "insert",
      to: appRole,
      withCheck: sql`${table.organizationId} = app.current_org_id()`
    }),
    pgPolicy("role_grants_update_tenant_isolation", {
      for: "update",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`
    }),
    pgPolicy("role_grants_delete_tenant_isolation", {
      for: "delete",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`
    }),
    pgPolicy("role_grants_insert_tenant_context_required", {
      as: "restrictive",
      for: "insert",
      to: appRole,
      withCheck: sql`app.current_org_id() is not null`
    }),
    pgPolicy("role_grants_update_tenant_context_required", {
      as: "restrictive",
      for: "update",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`
    }),
    pgPolicy("role_grants_delete_tenant_context_required", {
      as: "restrictive",
      for: "delete",
      to: appRole,
      using: sql`app.current_org_id() is not null`
    }),
    pgPolicy("role_grants_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`
    })
  ]
).enableRLS();
