# Slice 1e Adversarial Review

## Scope
Project: Opzava sub-slice 1e (Task aggregate + admin Tasks board + RLS)
References: `docs/prd/PRD-003-projects-pm.md`, `docs/adr/ADR-004-data-boundary-cqrs.md`, `docs/adr/ADR-007-rbac-rls.md`

| severity | file:line | issue | fix |
| --- | --- | --- | --- |
| medium | `packages/project-management/src/application/authorization.ts:49-61`, `packages/project-management/src/application/authorization.ts:197-204` | `TaskApplicationContext`→`AuthorizationSubject` is derived from request input (tenant/workspace IDs from the task payload), so `authorizeTask` can only enforce self-consistent values from the same object. This allows a caller with any valid session in org A to pass checks for a fabricated task context in org/ workspace A and then manipulate a task row that should be denied by membership or workspace scope logic. It can also allow moving/editing targets that bypass true principal intent because authorization is not grounded in persisted principal membership. | Build `AuthorizationSubject` from authenticated principal/session claims first (tenant membership + allowed workspace IDs) and intersect requested tenant/workspace changes against that canonical subject. Do not source identity constraints from the writable DTO before authorization. |
| low | `packages/project-management/src/application/tasks.ts:501-503`, `packages/project-management/src/application/tasks.ts:658-662` | Targeted reads/writes that hit no row are converted to `taskNotFound`. In cross-tenant probing (or stale/forbidden IDs), this can return a non-403 “not found” path and weaken ADR-007 behavior for denial semantics. | Return an explicit authorization-denied branch when authorization succeeds at tenant level but row is inaccessible (or attempt a separate ownership/access check path) so external callers receive 403/redirect instead of silent or ambiguous empty/result-not-found behavior. |
| low | `apps/web/app/(app)/tasks/actions.ts`, `apps/web/components/tasks/tasks-board.tsx`, `apps/web/e2e/auth-shell.spec.ts:91-110` | End-to-end coverage checks happy-path reload persistence and board actions, but does not assert tenant-tenant and authorization edge cases in the UI workflow for target task operations (directed create/move/read denial across tenants). This leaves a gap where cross-tenant or scoped-role bypass regressions can ship without e2e signal. | Add explicit e2e scenarios for non-owner and cross-tenant attempts (e.g., attacker context tries update/move/view-by-id on another org/task) with hard 403 assertions and visibility assertions after reload. |

### Slice-1e checks summary
- `packages/identity-access/drizzle/0002_slice1e_tasks.sql`: policy shape follows 1b style (enable/force RLS, permissive org `USING` + `WITH CHECK`, restrictive `app.current_org_id() IS NOT NULL`, explicit `GRANT ... TO app.opzava_app`, owner/admin rule present).
- FK references for `tasks.organization_id`, `tasks.workspace_id`, and assignee (`auth_users`) are present; delete behavior is non-cascading and appears aligned with task retention.
- Tenant isolation for arbitrary tenant leaks depends on `app.current_org_id()` being correctly populated by `withTenant` and on application-side authorization.
- Board flow is server-backed for board moves (task status/position persisted through service actions), and web side uses PM DTO/service abstractions rather than raw tables.

VERDICT: **PASS with risk controls required**. No blocker policy gap was found in the SQL migration shape itself, but authorization logic around `AuthorizationSubject` construction and denial signaling can produce bypass or ambiguity at runtime; fix before sign-off.
