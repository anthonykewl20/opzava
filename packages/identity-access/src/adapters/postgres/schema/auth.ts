import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import { organizations, workspaces } from "./tenancy.js";

export const authUsers = pgTable(
  "auth_users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
    passwordFailedCount: integer("password_failed_count").notNull().default(0),
    passwordLockedUntil: timestamp("password_locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [uniqueIndex("auth_users_email_unique").on(sql`lower(${table.email})`)]
);

export const authTwoFactor = pgTable(
  "auth_two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    verified: boolean("verified").notNull().default(false),
    failedVerificationCount: integer("failed_verification_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    enrollmentGeneration: text("enrollment_generation"),
    enrollmentSessionId: text("enrollment_session_id").references(() => authSessions.id, {
      onDelete: "set null"
    })
  },
  (table) => [uniqueIndex("auth_two_factor_user_id_unique").on(table.userId)]
);

export const authMfaChallenges = pgTable(
  "auth_mfa_challenges",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    activeOrganizationId: uuid("active_organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    membershipVersion: integer("membership_version").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    userAgentHash: text("user_agent_hash"),
    ipAddressHash: text("ip_address_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("auth_mfa_challenges_user_id_idx").on(table.userId),
    index("auth_mfa_challenges_expires_at_idx").on(table.expiresAt)
  ]
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    activeOrganizationId: uuid("active_organization_id").references(() => organizations.id, {
      onDelete: "set null"
    }),
    membershipVersion: integer("membership_version").notNull().default(0),
    mfaSatisfiedAt: timestamp("mfa_satisfied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("auth_sessions_user_id_idx").on(table.userId),
    index("auth_sessions_active_organization_id_idx").on(table.activeOrganizationId)
  ]
);

export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("auth_accounts_provider_account_unique").on(table.providerId, table.accountId),
    index("auth_accounts_user_id_idx").on(table.userId)
  ]
);

export const authVerifications = pgTable(
  "auth_verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("auth_verifications_identifier_idx").on(table.identifier)]
);

export const authPasswordResetTokens = pgTable(
  "auth_password_reset_tokens",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    salt: text("salt").notNull(),
    handleHash: text("handle_hash").notNull(),
    handleLookupDigest: text("handle_lookup_digest").notNull(),
    handleExpiresAt: timestamp("handle_expires_at", { withTimezone: true }).notNull(),
    handleUsedAt: timestamp("handle_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("auth_password_reset_tokens_user_id_idx").on(table.userId),
    index("auth_password_reset_tokens_expires_at_idx").on(table.expiresAt),
    index("auth_password_reset_tokens_handle_expires_at_idx").on(table.handleExpiresAt),
    uniqueIndex("auth_password_reset_tokens_handle_lookup_digest_unique").on(table.handleLookupDigest)
  ]
);

export const authInvitations = pgTable(
  "auth_invitations",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    salt: text("salt").notNull(),
    tokenHash: text("token_hash").notNull(),
    tokenLookupDigest: text("token_lookup_digest").notNull(),
    invitedByUserId: text("invited_by_user_id").notNull().references(() => authUsers.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull().default(sql`now() + interval '24 hours'`),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true })
  },
  (table) => [
    check("auth_invitations_role_check", sql`${table.role} in ('admin', 'member')`),
    check("auth_invitations_max_ttl_check", sql`${table.expiresAt} <= ${table.createdAt} + interval '24 hours'`),
    index("auth_invitations_org_idx").on(table.organizationId),
    index("auth_invitations_org_email_idx").on(table.organizationId, sql`lower(${table.email})`),
    uniqueIndex("auth_invitations_token_lookup_digest_unique").on(table.tokenLookupDigest)
  ]
);

export const authExternalIdentities = pgTable(
  "auth_external_identities",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    email: text("email").notNull(),
    emailHash: text("email_hash").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("auth_external_identities_org_project_email_unique").on(table.organizationId, table.projectId, table.emailHash),
    uniqueIndex("auth_external_identities_id_org_project_unique").on(table.id, table.organizationId, table.projectId),
    foreignKey({
      columns: [table.projectId, table.organizationId],
      foreignColumns: [workspaces.id, workspaces.organizationId],
      name: "auth_external_identities_project_organization_fk"
    }).onDelete("cascade")
  ]
);

export const authGuestMagicLinks = pgTable(
  "auth_guest_magic_links",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    email: text("email").notNull(),
    salt: text("salt").notNull(),
    tokenHash: text("token_hash").notNull(),
    tokenLookupDigest: text("token_lookup_digest").notNull(),
    createdByUserId: text("created_by_user_id").notNull().references(() => authUsers.id, { onDelete: "restrict" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check("auth_guest_magic_links_max_ttl_check", sql`${table.expiresAt} <= ${table.createdAt} + interval '24 hours'`),
    index("auth_guest_magic_links_org_project_idx").on(table.organizationId, table.projectId),
    uniqueIndex("auth_guest_magic_links_token_lookup_digest_unique").on(table.tokenLookupDigest),
    foreignKey({
      columns: [table.projectId, table.organizationId],
      foreignColumns: [workspaces.id, workspaces.organizationId],
      name: "auth_guest_magic_links_project_organization_fk"
    }).onDelete("cascade")
  ]
);

export const authGuestSessions = pgTable(
  "auth_guest_sessions",
  {
    id: uuid("id").primaryKey(),
    externalIdentityId: uuid("external_identity_id").notNull(),
    projectId: uuid("project_id").notNull(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    salt: text("salt").notNull(),
    tokenHash: text("token_hash").notNull(),
    tokenLookupDigest: text("token_lookup_digest").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true })
  },
  (table) => [
    index("auth_guest_sessions_expires_at_idx").on(table.expiresAt),
    uniqueIndex("auth_guest_sessions_token_lookup_digest_unique").on(table.tokenLookupDigest),
    foreignKey({
      columns: [table.projectId, table.organizationId],
      foreignColumns: [workspaces.id, workspaces.organizationId],
      name: "auth_guest_sessions_project_organization_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.externalIdentityId, table.organizationId, table.projectId],
      foreignColumns: [authExternalIdentities.id, authExternalIdentities.organizationId, authExternalIdentities.projectId],
      name: "auth_guest_sessions_external_identity_organization_project_fk"
    }).onDelete("cascade")
  ]
);

export const betterAuthSchema = {
  user: authUsers,
  session: authSessions,
  account: authAccounts,
  verification: authVerifications,
  twoFactor: authTwoFactor,
  auth_users: authUsers,
  auth_sessions: authSessions,
  auth_accounts: authAccounts,
  auth_verifications: authVerifications,
  auth_two_factor: authTwoFactor,
  auth_mfa_challenges: authMfaChallenges,
  auth_password_reset_tokens: authPasswordResetTokens,
  auth_invitations: authInvitations,
  auth_external_identities: authExternalIdentities,
  auth_guest_magic_links: authGuestMagicLinks,
  auth_guest_sessions: authGuestSessions
};
