# Slice 2.5 Follow-ups Re-review

## Verdict

**SOUND-WITH-FIXES**

The follow-up changes mostly implement the intended behavior, but one high-severity regression remains: a non-idempotent precondition path in quality-check mutation can make retries with the same idempotency key fail.

## Findings

1. **[HIGH] `addQualityCheck` rejects a replayed idempotent request due to status precondition check**
   - **File:** `packages/project-management/src/application/tasks.ts`
   - **Location:** near `addQualityCheck` precondition branch (`if (review.value.status === "approved")`)
   - **Failure:** A repeated call with the same `idempotencyKey` after the row was already inserted/approved fails early with `alreadyApprovedForTask` (or equivalent), instead of returning the existing row. This breaks idempotency semantics the review demands (`INSERT ... ON CONFLICT DO NOTHING` path with row fallback is effectively bypassed).
   - **Fix:** On conflict/retry, do not short-circuit by status before the fallback query. Fetch the existing row by organization/idempotency key (or return existing review by unique key unconditionally on conflict) and then enforce “approved is terminal” only when applying a new non-idempotent mutation.

2. **[PASS] MCP tool idempotencyKey wiring appears complete and scoped correctly**
   - **File:** `apps/mcp-server/src/tools.ts`, `apps/mcp-server/src/server.ts`
   - **Location:** `create_task`, `add_step`, `add_task_comment`, and quality-check tool handlers/schema + `tasks:read` vs `tasks:write` guard
   - **Note:** `idempotencyKey` is declared in tool input schemas and forwarded into service calls; `tasks:read` cannot invoke write handlers.

3. **[PASS] Multi-link de-duplication is deterministic and complete**
   - **File:** `packages/project-management/src/application/issues.ts`
   - **Location:** `listIssueProjections` lateral subquery uses `ORDER BY updated_at DESC, id ASC LIMIT 1`
   - **Note:** Deterministic tie-breaker exists and unlinked issues are preserved via left join behavior.

4. **[PASS] Position uniqueness migration and schema drift alignment looks consistent**
   - **Files:** `packages/identity-access/drizzle/0011_slice25_drop_position_unique.sql`, `packages/project-management/src/adapters/postgres/schema/tasks.ts`
   - **Note:** Drop migration removes uniqueness assumption and schema no longer enforces uniqueness on `(workspace_id,status,position)`; downstream reorder test now covers occupied-slot movement.

5. **[PASS] Migration hygiene appears valid for rerunnable operation and ordering**
   - **Files:** `packages/identity-access/drizzle/0010_slice25_mutation_idempotency.sql`, `packages/identity-access/drizzle/0011_slice25_drop_position_unique.sql`, `packages/identity-access/drizzle/manifest.json`, `packages/identity-access/drizzle/meta/_journal.json`
   - **Note:** Both SQL files are guarded (`IF NOT EXISTS` / `IF EXISTS`), appended in manifest/journal, and no earlier migration file is edited.

