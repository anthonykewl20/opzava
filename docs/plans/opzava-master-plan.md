<!-- agent-context: this is the canonical shipped master spec for Opzava. Read before editing any track. -->

# Opzava Master Plan — v1

**Status:** SHIPPED SPEC (compile v1). Supersedes `docs/architecture/system-map/91-remediation-plan.md` in scope.
**Scope owner:** the 36 confirmed REVIEW findings (post-2.1.0: orchestration/dispatch, task capture, Aegis gate, MCP server, 7-client connectivity, security, dual-engine deep-read) + the D2 device-auth design (net-new — no prior device-grant surface existed; verified `grep device_tokens|device_code|user_code|refresh_token` in `migrations.ts` + `auth.ts` = 0 hits).
**Relationship to 91:** `91-remediation-plan.md` is the CLOSED record for parity findings F1–F14 (from `90-parity-findings.md`) — all ✅, release 2.1.0 cut. This plan does NOT re-litigate any ✅ item. It owns the *next* generation. Chain: `90-parity-findings.md` → `91-remediation-plan.md` (closed) → **this** (open, post-2.1.0).
**Load-bearing constraints honored:** ARD 0007 (engine separation — `core/auth` placement, runner canonicalization), ARD 0008 (secret storage — env-secret discipline, token hashing).
**Resolved decisions (FINAL, do not re-litigate):** D2 device-auth winner (RFC 8628, Opzava own AS+RS, 8h access / 30d rotating refresh, 3-layer rotation guard, stdio-first transport); orchestratorUnification (runner = canonical execution path for all engines); no-passphrase local token (0o600 + opt-in `OPZAVA_TOKEN_ENC_KEY` envelope); stdio-only in this deliverable (HTTP-MCP deferred, additive).

## Linearized execution order
See the structured output `linearized_execution_order`. Spine: G7 (doc honesty) + B-principal-binding + A-write-spine in parallel → C-runner-unification (gates A's scheduler fix) → D-device-auth (fuses B's principal-binding at the cascade) → E/F hardening → H durability decision lands last (needs A's transactional spine).

## Track summary
- **A — Orchestration correctness & write-spine safety** (P0)
- **B — Security & principal-binding authz** (P0)
- **C — Deep-module refactors & runner canonicalization** (P1)
- **D — Device-auth + persistent reliable connection** (P0)
- **E — MCP server hardening** (P1)
- **F — Client-connectivity truthing & dead surface** (P2)
- **G — Horizontal-scale honesty** (P0)
- **H — SQLite durability & ops** (P0)

Every task below is specified in the structured output (id, objective, depends_on, files, acceptance, test, risk, rollback). This file is the navigable index; the structured output is the executable contract.
