import type { OrgId, WorkspaceId } from "@opzava/shared-kernel";
import type { Result } from "@opzava/shared-kernel";

export type ErrorCaptureSeverity = "info" | "warning" | "error";

// ---------------------------------------------------------------------------
// Diagnostics (droppable — never the source of truth)
// ---------------------------------------------------------------------------

export interface CaptureErrorInput {
  readonly source: string;
  readonly operation: string;
  readonly severity: ErrorCaptureSeverity;
  readonly message: string;
  readonly code?: string;
  readonly tenantId?: string;
  readonly orgId?: OrgId;
  readonly workspaceId?: WorkspaceId;
  readonly userId?: string;
  readonly correlationId?: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown;
}

// ---------------------------------------------------------------------------
// Compliance governance audit (append-only — never droppable)
// ---------------------------------------------------------------------------
// Issue #192 / PRD-013 user story 25: connections/provider model governance must be
// reconstructable. This seam records state-transition events for DOMAIN INTENTS, not RPCs.
// The three provider connect flows (api-key, setup-token, device) all fold into the single
// `provider_connected` intent; GitHub connect/disconnect are first-class connection intents.
// The fire-and-forget orchestrator re-election after a credential change is recorded with
// actor=system and a `trigger` linking the human who rotated the credential, so the literal
// truth (the system executed it) and the causal truth (the human necessitated it) are both
// preserved without conflating them (#192 review comment 2).

/**
 * The allowed values below are the single source of truth for the audit enums: the TS unions
 * derive from them, and the Postgres schema imports the arrays to build CHECK constraints, so
 * the two can never drift. Add a value here only when a new governance-meanful concept lands.
 */
export const auditActorTypes = ["user", "system", "service"] as const;
export const auditTargetKinds = [
  "model_provider",
  "orchestrator",
  "github_connection",
  "gateway_config",
] as const;
export const auditIntents = [
  "provider_connected",
  "provider_disconnected",
  "provider_model_toggled",
  "orchestrator_set",
  "orchestrator_delegation_applied",
  "orchestrator_reconciled",
  "github_connected",
  "github_disconnected",
  "gateway_config_pruned",
] as const;
export const auditTransitions = ["requested", "completed", "failed", "cancelled"] as const;
export const auditResults = ["success", "failure", "pending", "unknown"] as const;

/** Who or what executed the audited transition. */
export type AuditActorType = (typeof auditActorTypes)[number];

/** The kind of connection/provider artifact a transition targets. */
export type AuditTargetKind = (typeof auditTargetKinds)[number];

/**
 * Domain intent behind a mutation — NOT the RPC/entry point. Multiple RPC entry points
 * (the three provider connect flows) map to one intent. Add an intent here only when a new
 * governance-meaningful mutation lands; never add RPC names as intents.
 */
export type AuditIntent = (typeof auditIntents)[number];

/**
 * State-transition phase. The log models TRANSITIONS, not outcomes, so an ambiguous gateway
 * write (e.g. disconnect's `closedBeforeResponse`) is honestly a `requested` with no terminal
 * event yet, and the resolution is appended when it arrives. Rows are append-only: a
 * `requested` is never rewritten into a `completed`; a second row is written (#192 comment 4).
 */
export type AuditTransition = (typeof auditTransitions)[number];

/** Outcome carried on the transition, separate from the phase so a `requested` may already know its result. */
export type AuditResult = (typeof auditResults)[number];

/**
 * Causal provenance for a system-initiated transition (e.g. the orchestrator re-election fired
 * automatically after a credential rotation). Carrying the originating human keeps the
 * compliance record causally honest without attributing the system's write to that human
 * (#192 comment 2).
 */
export interface AuditTrigger {
  readonly triggeredByActorId: string;
  readonly triggeredByAction: string;
}

/**
 * A safe, secret-free projection of gateway routing/configuration at a version in time. The
 * adapter writes this to the immutable `governance_config_version` table and links the audit
 * row to it by id — NO diff is ever inlined in an audit text field, so no secret can leak into
 * one (#192 comment 3b). Only routing/policy/auth-health labels belong here; never credentials,
 * API keys, OAuth tokens, or SecretRef values.
 */
export interface AuditConfigSnapshot {
  readonly targetKind: AuditTargetKind;
  readonly targetRef: string;
  readonly content: Readonly<Record<string, unknown>>;
  readonly versionHash?: string;
}

export interface AppendAuditInput {
  readonly organizationId: OrgId;
  readonly workspaceId?: WorkspaceId;
  readonly intent: AuditIntent;
  readonly transition: AuditTransition;
  readonly targetKind: AuditTargetKind;
  readonly targetRef: string;
  readonly actorId: string;
  readonly actorType: AuditActorType;
  readonly trigger?: AuditTrigger;
  readonly correlationId?: string;
  /**
   * Optional safe config snapshot. When supplied, the adapter persists it as an immutable
   * config version and returns its id on the receipt. Omit when no reconstructable routing
   * projection is available — leave honestly empty rather than faking one.
   */
  readonly configSnapshot?: AuditConfigSnapshot;
  /** PRD-013 decision fields. Free-form outcome labels (e.g. "allowed", "denied:plan_limit"). */
  readonly authorizationDecision?: string;
  readonly policyDecision?: string;
  readonly entitlementDecision?: string;
  readonly result: AuditResult;
  readonly resultCode?: string;
  readonly resultMessage?: string;
}

export interface AppendAuditReceipt {
  readonly eventId: string;
  readonly configVersionId?: string;
}

/**
 * The single Opzava observability seam (#192 review comment 5b).
 *
 * - `capture` is DIAGNOSTICS: structured error/telemetry capture that may be dropped, sampled,
 *   or routed to a best-effort sink (GlitchTip under the pending ADR-013). It is never the
 *   source of truth and must never be relied on for correctness.
 * - `appendAudit` is COMPLIANCE: an append-only governance audit of provider/connection model
 *   governance mutations. Per ADR-004 Postgres is the truth for the audit event itself, so the
 *   adapter appends directly (no outbox — there is no external system to dispatch the event to;
 *   #192 comment 4). Audit rows carry no idempotency key: deduplication belongs at the command
 *   handler, before anything reaches the audit table, never via upsert (#192 comment 3a).
 *
 * Both concerns live behind one port so the observability boundary is inhabited by exactly one
 * adapter family instead of a parallel theatre port.
 */
export interface ErrorCapturePort {
  capture(input: CaptureErrorInput): Promise<Result<void>>;
  appendAudit(input: AppendAuditInput): Promise<Result<AppendAuditReceipt>>;
}
