import { sql } from "drizzle-orm";
import { check, index, jsonb, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import {
  auditActorTypes,
  auditIntents,
  auditResults,
  auditTargetKinds,
  auditTransitions,
} from "@opzava/ports";

import { appRole, organizations, ownerRole, workspaces } from "./tenancy.js";

// CHECK-constraint value lists, built from the single source of truth in @opzava/ports so the
// Postgres enums cannot drift from the TS unions (see error-capture.ts).
const actorTypesSql = sql.raw(`array[${auditActorTypes.map((v) => `'${v}'`).join(", ")}]::text[]`);
const targetKindsSql = sql.raw(
  `array[${auditTargetKinds.map((v) => `'${v}'`).join(", ")}]::text[]`,
);
const intentsSql = sql.raw(`array[${auditIntents.map((v) => `'${v}'`).join(", ")}]::text[]`);
const transitionsSql = sql.raw(
  `array[${auditTransitions.map((v) => `'${v}'`).join(", ")}]::text[]`,
);
const resultsSql = sql.raw(`array[${auditResults.map((v) => `'${v}'`).join(", ")}]::text[]`);

/**
 * Immutable, secret-free projection of gateway routing/configuration at a point in time. The
 * audit log points at a version row by id instead of inlining a diff (#192 comment 3b), so a
 * secret can never leak into an audit text field — none is ever written. Content holds only
 * routing/policy/auth-health labels; never credentials, tokens, or SecretRef values.
 */
export const governanceConfigVersion = pgTable(
  "governance_config_version",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    targetKind: text("target_kind").notNull(),
    targetRef: text("target_ref").notNull(),
    versionHash: text("version_hash"),
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("governance_config_version_org_target_idx").on(
      table.organizationId,
      table.targetKind,
      table.targetRef,
      table.createdAt,
    ),
    check(
      "governance_config_version_target_kind_check",
      sql`${table.targetKind} = any(${targetKindsSql})`,
    ),
    check(
      "governance_config_version_version_hash_check",
      sql`${table.versionHash} is null or ${table.versionHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "governance_config_version_target_ref_nonempty_check",
      sql`char_length(btrim(${table.targetRef})) > 0`,
    ),
    pgPolicy("governance_config_version_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`,
    }),
    pgPolicy("governance_config_version_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`,
    }),
    pgPolicy("governance_config_version_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();

/**
 * Append-only compliance audit of provider/connection model-governance mutations (#192).
 * Each row is a state-transition event (intent × transition), never an upsert: there is no
 * idempotency key, and a `requested` is never rewritten into a `completed` — a new row is
 * written (#192 comments 3a & 4). `actor_*` records who executed the transition; `triggered_by_*`
 * records what necessitated it for system-initiated cascades (e.g. orchestrator re-election
 * after a credential rotation), keeping literal and causal truth distinct (#192 comment 2).
 */
export const governanceAudit = pgTable(
  "governance_audit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "restrict" }),
    intent: text("intent").notNull(),
    transition: text("transition").notNull(),
    targetKind: text("target_kind").notNull(),
    targetRef: text("target_ref").notNull(),
    actorId: text("actor_id").notNull(),
    actorType: text("actor_type").notNull(),
    triggeredByActorId: text("triggered_by_actor_id"),
    triggeredByAction: text("triggered_by_action"),
    correlationId: text("correlation_id"),
    configVersionId: uuid("config_version_id").references(() => governanceConfigVersion.id, {
      onDelete: "set null",
    }),
    authorizationDecision: text("authorization_decision"),
    policyDecision: text("policy_decision"),
    entitlementDecision: text("entitlement_decision"),
    result: text("result").notNull(),
    resultCode: text("result_code"),
    resultMessage: text("result_message"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("governance_audit_org_recorded_idx").on(table.organizationId, table.recordedAt),
    index("governance_audit_org_intent_target_idx").on(
      table.organizationId,
      table.intent,
      table.targetKind,
      table.targetRef,
    ),
    check("governance_audit_intent_check", sql`${table.intent} = any(${intentsSql})`),
    check("governance_audit_transition_check", sql`${table.transition} = any(${transitionsSql})`),
    check("governance_audit_target_kind_check", sql`${table.targetKind} = any(${targetKindsSql})`),
    check("governance_audit_actor_type_check", sql`${table.actorType} = any(${actorTypesSql})`),
    check("governance_audit_result_check", sql`${table.result} = any(${resultsSql})`),
    check("governance_audit_actor_nonempty_check", sql`char_length(btrim(${table.actorId})) > 0`),
    check(
      "governance_audit_target_ref_nonempty_check",
      sql`char_length(btrim(${table.targetRef})) > 0`,
    ),
    // trigger is optional, but if present both provenance fields must be present together.
    check(
      "governance_audit_trigger_shape_check",
      sql`
        (${table.triggeredByActorId} is null and ${table.triggeredByAction} is null)
        or
        (${table.triggeredByActorId} is not null and ${table.triggeredByAction} is not null)
      `,
    ),
    pgPolicy("governance_audit_tenant_isolation", {
      for: "all",
      to: appRole,
      using: sql`${table.organizationId} = app.current_org_id()`,
      withCheck: sql`${table.organizationId} = app.current_org_id()`,
    }),
    pgPolicy("governance_audit_tenant_context_required", {
      as: "restrictive",
      for: "all",
      to: appRole,
      using: sql`app.current_org_id() is not null`,
      withCheck: sql`app.current_org_id() is not null`,
    }),
    pgPolicy("governance_audit_owner_admin", {
      for: "all",
      to: ownerRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();
