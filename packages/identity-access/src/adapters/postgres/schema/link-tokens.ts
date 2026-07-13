import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { linkTokenScopes } from "../../../application/link-tokens.js";
import { authSessions, authUsers } from "./auth.js";
import { appRole, organizations, ownerRole, workspaces } from "./tenancy.js";

const linkTokenScopesSql = sql.raw(
  `array[${linkTokenScopes.map((scope) => `'${scope}'`).join(", ")}]::text[]`,
);
const linkTokenScopesCountSql = sql.raw(String(linkTokenScopes.length));

export const linkTokens = pgTable(
  "link_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => authSessions.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull().default("claude-code"),
    scopes: text("scopes").array().notNull(),
    tokenHash: text("token_hash").notNull(),
    jti: text("jti").notNull(),
    membershipVersion: integer("membership_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("link_tokens_token_hash_unique").on(table.tokenHash),
    uniqueIndex("link_tokens_jti_unique").on(table.jti),
    index("link_tokens_organization_workspace_user_idx").on(
      table.organizationId,
      table.workspaceId,
      table.userId,
      table.createdAt,
    ),
    check("link_tokens_client_id_check", sql`${table.clientId} = 'claude-code'`),
    check(
      "link_tokens_scopes_nonempty_check",
      sql`cardinality(${table.scopes}) between 1 and ${linkTokenScopesCountSql}`,
    ),
    check(
      "link_tokens_scopes_subset_check",
      sql`${table.scopes} <@ ${linkTokenScopesSql}`,
    ),
    check(
      "link_tokens_scopes_unique_check",
      sql`cardinality(${table.scopes}) = 1 or ${table.scopes}[1] <> ${table.scopes}[2]`,
    ),
    check("link_tokens_token_hash_check", sql`${table.tokenHash} ~ '^[a-f0-9]{64}$'`),
    check("link_tokens_jti_nonempty_check", sql`char_length(btrim(${table.jti})) > 0`),
    check("link_tokens_jti_length_check", sql`char_length(${table.jti}) <= 180`),
    check("link_tokens_membership_version_positive_check", sql`${table.membershipVersion} > 0`),
    check("link_tokens_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
    pgPolicy("link_tokens_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`,
    }),
    pgPolicy("link_tokens_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`,
    }),
    pgPolicy("link_tokens_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();
