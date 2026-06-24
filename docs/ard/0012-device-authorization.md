FINALIZED ARD 0012 at `/home/anthony/devtony/anito-opzava/docs/ard/0012-device-authorization.md` (140 lines, Status: Accepted, Date 2026-06-24).

## What was done
Rewrote the existing v1 draft into the final shipped specification, verifying every cited `file:line` against the actual code (code wins over the digest's stale numbers). Standard ARD format: Status / Date / Relates-to / Context / Decision (D1–D7 + TTL) / Consequences (positive + negative + invariants) / Alternatives considered / Open questions / References.

## Key citation corrections (digest was stale; verified against HEAD)
- `getUserFromRequest` seam: digest said `auth.ts:435` — CONFIRMED `:435`.
- agent_api_keys block: digest said `:502-553`; actual is `:505-554`.
- plugin hook insertion neighbor: `:557-560` (verified `if (_authResolverHook)` at `:557`).
- global admin key return: `:487-502`, with `role:'admin'` at `:495` (verified).
- hashApiKey/hashSessionToken: `:634-640` (digest said `:598-604`).
- deriveRoleFromScopes: `:652`; requireRole: `:668`.
- 054 partial unique index: `migrations.ts:1493` (verified `CREATE UNIQUE INDEX ... idx_messages_client_message_id`).
- security.event EventType: `event-bus.ts:34` (verified).

## GRILL-2 residual gaps folded into the ARD (the v1 draft missed these)
1. **Chain-level (not row-level) revocation** (red-team critical) — `resolveDeviceToken` rejects any access token whose `rotation_chain_id` has ANY row with `revoked_at IS NOT NULL`. Defeats the stolen-refresh-token-refreshed-before-revoke attack. Made the DEFAULT, not an opt-in knob.
2. **SERVER-SAFE atomic rotation disambiguation** (D3, the highest-value correctness catch) — `MAX(rotation_seq)` embedded in the UPDATE predicate (not a separate read-after-UPDATE that races across replicas). Three-way disambiguation: winner / legit-concurrent-loser (409 already_rotated, NOT revoke) / genuine reuse (seq<max → family revoke). Multi-process concurrency test as the acceptance gate.
3. **Migration renumber** — device tables are `058`/`059`, NOT `055` (collides with A1). Added the missing `059_revoked_access_tokens_denylist` migration the v1 referenced but no task created (would have runtime-failed the kill-switch).
4. **DB-backed refresh + device-flow rate limiter** (`critical:true`) — in-memory Maps split brute-force across N replicas; the refresh endpoint (higher-value target) gets the same primitive.
5. **`device_tokens.workspace_id INTEGER NOT NULL`** (schema-enforced, not just application-checked) — closes the cross-tenant trap at the DB.
6. **Honest exactly-once scope** — Idempotency-Key retry only on routes with an existing index; non-indexed routes fall back to single-attempt-no-retry (the generic idempotency_key does not exist on most mutating tables).
7. **SSE leadership-handoff silence gap** (red-team) — documented that dispatch-event SSE can go quiet up to lock TTL during a redeploy; only the elected leader emits `task.status_changed`.
8. **Fused B1a/B1b split** — principal-binding (B1a, no device dep) and resolveDeviceToken cascade (B1b, depends_on D2) split to kill the circular dependency; documented in the Decision + Relates-to.
9. **Redaction governance test** anchored on the actual logging primitives (`logSecurityEvent|logAuditEvent|broadcast|throw|Error(`), not just `console.*`.

## Cross-references wired
ARD 0011 (orchestrator — lease + single-active-writer lock), ARD 0006 (Postgres path), ARD 0007, ARD 0008 (SecretReference/hashes-at-rest), ARD 0009 (SSE cursor reuse), MASTER-PLAN.md Track D. RFCs: 8628, 6749 §6/§10.4/§2.1, 7009, 9700, MCP 2025-06-18.

The ARD references the implementation tasks (MASTER-PLAN D1–D7 + B1b) rather than duplicating them, keeping it the architecture contract those tasks must honor. Decisions are FINAL per the resolved_decisions_acknowledged — no re-litigation; only two operator-sign-off tolerances remain (the 8h revoke window default; the SSE leadership-handoff gap awareness), both with engineering defaults already shipped.
