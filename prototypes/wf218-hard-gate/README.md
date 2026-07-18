# wf218 hard-gate prototype

## What this prototype proves

This throwaway prototype models the WF-218 hard-gate contract in-memory with no DB, no network, and no repo dependencies.

It demonstrates:

1. `authorizeTask(action)` remains generic and permissive by design (always pass for `member`), while a dedicated status-aware guard enforces terminal-hard-gate behavior.
2. `moveTask` and `createTask` both run:
   - `authorizeTask(...)`
   - dedicated guard (`assertTerminalTransitionAuthorized`)
   - mutation only when allowed
3. A single-use confirm token model bound to task + target status + admin principal + expiry.
4. Gate audit rows for both accepted and rejected gated attempts.
5. Sad-path behavior first: missing token, expired token, consumed token replay, principal mismatch, and terminal-create rejection.

## How to run

`node prototypes/wf218-hard-gate/demo.mjs`

### Expected console behavior

The script runs eight scenarios, prints PASS/FAIL for each, then dumps all audit rows. It exits with:

- `0` when all scenarios pass
- non-zero when any assertion fails

## Review fixes applied

- FIX 1: `appendAudit` now takes explicit `source`; source is computed in `assertTerminalTransitionAuthorized` from validated token binding and never inferred from envelope presence.
- FIX 2: principal binding is fail-closed before comparison, returning `principal-binding-absent` when `adminId` is missing or actor is missing, and `mintConfirmToken` now requires `adminId`.
- FIX 3: expiry validation is finite-only; malformed or non-finite expiry now rejects as `confirm-token-expired`.
- FIX 4: token consume is an atomic claim (`consumeConfirmToken`) that returns `null` for already-consumed tokens and rejects replay as `confirm-token-conflict`.
- FIX 5: all guard outcomes now include `source`, and every guard attempt writes exactly one audit row.
- FIX 6: create status checks now enforce `CREATE_ALLOWED_STATUSES`, and `done` is rejected as `create-with-terminal-status`.

Scenario additions:

- S6: forged-token source check (`autonomous-attempt-on-gated-transition`) verifies autonomous source for unknown confirm token.
- S7: principal-binding-absent checks for missing token binding and null actor, both with `principal-binding-absent`.
- S8: malformed expiry check (`confirm-token-expired`) with no state mutation.

Both DeepSeek and Codex-sol reviews drove this pass.

## Mapping to REAL insertion points (memo-aligned)

| Prototype piece | Real insertion point in repo | Insertion intent |
|---|---|---|
| `authorizeTask(action)` stub + placement | `packages/project-management/src/application/tasks.ts:1774` (moveTask) and `packages/project-management/src/application/tasks.ts:1421` (createTask) | Keep existing role/authorization check as-is; gate stays below it |
| `assertTerminalTransitionAuthorized(...)` | `packages/project-management/src/application/tasks.ts:1745` before `withTenant` mutation (`tasks.ts:1780-1807` for move) and before `insert` in create (`tasks.ts:1426`) | Centralized terminal gate for `done` transitions |
| `moveTask` flow ordering | `packages/project-management/src/application/tasks.ts:1745` | `authorizeTask` -> guard -> mutation |
| `createTask` flow ordering | `packages/project-management/src/application/tasks.ts:1386` | `authorizeTask` -> guard -> insert |
| Create terminal guard path | `packages/project-management/src/application/tasks.ts:1395-1421` | Reject `create` with `status: 'done'` before mutation (`create-with-terminal-status`) |
| `approval.requested` no-op route | `apps/web/app/api/tasks/ask-admin/turn/route.ts:423-425` | Placeholder where confirm-token mint/consume wiring should be plugged in later |

## Locked decisions (baked in)

- `create-with-terminal-status` is rejected outright. Cards cannot be born `done`.
- `approve-merge` flow is **out of scope** for v1.
- No `step-up auth` for v1. Gate source is enrolled-admin session + one-time scope-bound confirm token + principal match + expiry.
- The gate is server-side, below tool policy, and below authorization (`authorizeTask`), not replacing it.

## OUT OF SCOPE (throwaway prototype)

- Real Postgres/Prisma/ORM persistence
- Real OpenClaw transport and `approval.requested` wire-up beyond placeholder mapping
- `wf230` aggregate writes and command-identity records
- `#229` review/merge containment implementation
- Step-up auth / TOTP / passkey flows

## Notes on scope

This prototype is intentionally throwaway and should not be used as production code. It is a simulation scaffold for contract verification before the real WF-218 implementation in application code.
