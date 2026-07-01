import { sql } from "drizzle-orm";
import {
  pgEnum,
  pgPolicy,
  pgRole,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import { organizationLifecycleStates } from "../../../domain/tenancy.js";

export const appRole = pgRole("opzava_app").existing();
export const ownerRole = pgRole("opzava_owner").existing();

export const organizationLifecycleState = pgEnum(
  "organization_lifecycle_state",
  organizationLifecycleStates
);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    lifecycleState: organizationLifecycleState("lifecycle_state")
      .notNull()
      .default("provisioning"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("organizations_slug_unique").on(table.slug),
    pgPolicy("organizations_identity_membership_select", {
      for: "select",
      to: appRole,
      using: sql`exists (
        select 1
        from public.memberships m
        where m.organization_id = ${table.id}
          and m.user_id = app.current_user_id()
          and m.status = 'active'
      )`
    }),
    pgPolicy("organizations_select_identity_context_required", {
      as: "restrictive",
      for: "select",
      to: appRole,
      using: sql`app.current_user_id() is not null`
    }),
    pgPolicy("organizations_insert_tenant_isolation", {
      for: "insert",
      to: appRole,
      withCheck: sql`${table.id} = app.current_org_id()`
    }),
    pgPolicy("organizations_update_tenant_isolation", {
      for: "update",
      to: appRole,
      using: sql`${table.id} = app.current_org_id()`,
      withCheck: sql`${table.id} = app.current_org_id()`
    }),
    pgPolicy("organizations_delete_tenant_isolation", {
      for: "delete",
      to: appRole,
      using: sql`${table.id} = app.current_org_id()`
    }),
    pgPolicy("organizations_insert_tenant_context_required", {
      as: "restrictive",
      for: "insert",
      to: appRole,
      withCheck: sql`app.current_org_id() is not null`
    }),
    pgPolicy("organizations_update_tenant_context_required", {
      as: "restrictive",
      for: "update",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`
    }),
    pgPolicy("organizations_delete_tenant_context_required", {
      as: "restrictive",
      for: "delete",
      to: appRole,
      using: sql`app.current_org_id() is not null`
    }),
    pgPolicy("organizations_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`
    })
  ]
).enableRLS();

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("workspaces_organization_id_slug_unique").on(table.organizationId, table.slug),
    pgPolicy("workspaces_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`
    }),
    pgPolicy("workspaces_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`
    }),
    pgPolicy("workspaces_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`
    })
  ]
).enableRLS();

export const tenantRlsProbes = pgTable(
  "tenant_rls_probes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    marker: text("marker").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    pgPolicy("tenant_rls_probes_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`
    }),
    pgPolicy("tenant_rls_probes_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`
    }),
    pgPolicy("tenant_rls_probes_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`
    })
  ]
).enableRLS();
