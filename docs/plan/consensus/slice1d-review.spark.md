# Slice 1d auth shell/session/tenant review (adversarial)

| severity | file:line | issue | fix |
| --- | --- | --- | --- |
| high | `apps/web/lib/session.ts:175-207` | `getAppSessionContext` uses `AuthPort.getSession` and then falls back to `resolveTenantContextFromIdentity` when that returns `null`. `resolveTenantContextFromIdentity` re-derives membership from `auth_sessions` token only and current active memberships, so a session invalidated by `membership_version` (or org switch/privilege change) can still create a context from another active membership. This violates fail-closed denied-session behavior and weakens session-to-tenant revocation. | Remove the fallback path; require `authPort.getSession` to return a non-null verified `AuthSession` for shell context, or add explicit membership/version checks in the fallback before binding `app.current_org` and issuing context. |
| medium | `apps/web/next.config.ts:1` / `apps/web/proxy.ts:1` | Centralized route policy in `proxy.ts` is never active (no `middleware.ts`), so auth-guarding is only enforced in `/(app)/layout.tsx` and not as defense-in-depth at request-entry. This can leave non-`(app)` protected seams unguarded by shared middleware logic and increases risk of inconsistent auth behavior. | Add `apps/web/middleware.ts` that exports `proxy` and keep the matcher there, or remove `proxy.ts` and keep explicit per-route server checks documented as the canonical boundary. |
| medium | `packages/identity-access/src/application/first-owner-setup.ts:104` | `validateInput` accepts owner passwords as short as 8 characters, while `apps/web/app/(auth)/setup/actions.ts` enforces >=12 + complexity through Zod. Anyone calling `FirstOwnerSetupService` directly (including future API surfaces) can bypass the stronger setup UI contract and create weak owner credentials. | Align domain validation with UI contract: enforce 12+ chars + character class checks (or shared password policy service) inside `FirstOwnerSetupService` and return explicit `weak-password` status/Result errors. |
| low | `apps/web/lib/session.ts:50-71` | The session resolver accepts both custom and legacy Better-Auth cookie names when reading `cookie` header. If legacy cookie tokens remain, token origin/rotation ambiguity exists across versions and can make session migration harder to reason about. | During cutover, reject legacy cookie names at read-time (or map/rotate once) to keep a single authoritative token format and reduce ambiguity during incident response. |

VERDICT: UNSOUND (1 high, 1 medium, 1 medium, 1 low finding)

Focus pass/fail:

- Route guards in shell pages: pass for covered `/(app)` routes; fail-open risk exists because global middleware layer is absent.
- Session cookie hardness: pass (`httpOnly` + sameSite, secure in production, token not obviously logged).
- Session-to-tenant derivation: partial fail (primary path is good; fallback path bypasses membership-version guarantees).
- 1c invariant parity: mostly pass; no active regression identified in atomic setup, DB-backed sessions, `cookieCache` disable, or tx-bounded `set_config` calls.
- First-owner setup action behavior: pass (`FirstOwnerSetupService` called; session set only after successful status).
- BFF/UI boundary: pass for surfaced routes/components; no raw Drizzle in components found.
