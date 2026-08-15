# ADR-006: Better Auth, revocable sessions, MFA/passkeys, and PWA auth

Status: Accepted

> Current-context note (2026-07-15): CRM references in this retained decision mean the deferred CRM rebuild, which returns only with the future user-side dashboard (GitHub issue #200).

Opzava will use Better Auth as the primary authentication library, behind `AuthPort`, with Auth.js v5 plus the Postgres adapter as the real fallback. Better Auth owns AUTHENTICATION and coarse organization membership only; fine-grained resource authorization stays in ADR-007 `AuthorizationPort`. Sessions are DB-backed and revocable, MFA is org-enforceable, and PWA/Web Push auth is designed around the constraint that service workers cannot read httpOnly cookies.

## Context

ADR-001 establishes `AuthPort` as the authentication capability port and `AuthorizationPort` as the fine-grained authorization capability port. ADR-004 places Identity & Access inside Opzava Postgres as system-of-record data. Q5 locks the access model: Organization is the tenant, Project is the main child scope, roles are data, Guest-Clients are project-scoped external identities, and privileged access must go through a single `can(user, action, resource)` evaluator rather than provider-specific role checks.

Opzava is a multi-tenant B2B application with PWA delivery, Web Push notifications, org invitations, external Guest-Client access, admin actions, and AI employees that can act across project, CRM, support, finance, and runtime-control surfaces. Authentication cannot be a thin login screen: it must support revocable sessions, password reset invalidation, logout-all-devices, org membership changes, MFA, passkey step-up, anti-enumeration, invite hardening, and browser/PWA behavior without turning the domain into an auth-provider schema.

The Q6 research compared Lucia, Auth.js v5, and Better Auth. Lucia is not a product auth stack for this use case. Auth.js v5 remains viable with a Postgres adapter, but its passkey support is experimental and it does not supply the same first-party multi-tenant organization and MFA/passkey surface. Better Auth has the strongest feature fit for Opzava: organizations, revocable DB sessions, TOTP, single-use recovery codes, SimpleWebAuthn passkeys, and anti-enumeration. The caveat is security maturity: the research found meaningful advisory volume, including issues in the cookie cache, 2FA, and invitation paths that Opzava would depend on.

PWA auth has a hard web-platform constraint. A service worker cannot read httpOnly cookies, so it cannot independently prove a user's web session by inspecting cookie state. Authenticated session reads, Web Push subscription registration, push binding, and offline privileged UX must be mediated by server endpoints. The common "two-cookie split" pattern is not accepted here because it would create a parallel non-httpOnly credential surface and does not solve the service-worker constraint safely.

The hardest access sad paths are role drift and provider callback trust. A user may have a valid session issued before their membership or role changed. An auth provider's organization or invitation callback may also report a successful invite flow that does not match Opzava's tenant, invitation, role ceiling, or current inviter authority. In both cases, the provider signal must not become authorization by itself.

## Decision

Use Better Auth as the primary authentication adapter behind `AuthPort`. The application depends on Opzava principals, session records, membership mirrors, and `AuthorizationPort` decisions, not on Better Auth schemas directly. Better Auth may be replaced only through the `AuthPort` adapter contract.

Keep Auth.js v5 plus the Postgres adapter as the real fallback. The fallback is not a parallel supported runtime mode; it is the planned escape path if Better Auth has an unpatched critical issue on Opzava's pinned release, breaks required organization/session behavior, or becomes operationally unsuitable. The fallback must preserve the same Opzava-owned users, sessions, membership mirrors, invitations, role grants, and authorization checks even if more organization/MFA behavior moves into Opzava code.

Split AUTHENTICATION from authorization:

- Better Auth owns user sign-in, credential and provider flows, password reset hooks, MFA/passkey enrollment and verification, session issuance, session revocation primitives, and coarse organization membership proof.
- Better Auth does not own project authorization, resource roles, AI employee authority, knowledge access, admin-board access, CRM access, runtime-command admission, billing entitlements, or Guest-Client project permissions.
- ADR-007 `AuthorizationPort` is the only fine-grained authorization source of truth. Fine-grained checks never call Better Auth roles directly.
- Better Auth organization membership syncs into Opzava RBAC, not the reverse. Membership and invite changes enter through an `AuthPort` use case that updates Opzava `Membership`, `RoleGrant`, `membershipVersion`, audit rows, and affected session state in one transaction.

Use DB-backed revocable sessions. Do not use stateless JWT auth for Opzava web sessions. Store enough session state in Postgres to enforce revocation and step-up policy: session id or token hash, user id, active org context, device metadata, MFA level, membership version, expiry, and `revokedAt`. Session validation must check expiry, revocation, user state, org membership state, and membership version before admitting privileged work.

Revoke or invalidate sessions on all authority-changing events:

- logout-all-devices
- password reset
- org removal
- membership change
- role change
- org-level MFA enforcement change where the session no longer satisfies policy
- high-risk account recovery or provider-link changes

`session.cookieCache` is disabled. This is advisory-driven and non-negotiable for Opzava because stale cached session state can bypass fresh 2FA or membership checks. Any future attempt to enable cookie caching requires a new ADR that proves revocation, MFA, invitation, and role-change semantics remain correct.

Use TOTP plus hashed single-use recovery codes as baseline MFA. Use passkeys through WebAuthn/SimpleWebAuthn as passwordless sign-in where stable and as step-up for high-risk actions. Organization admins may enforce MFA for all members of sensitive organizations. Platform-admin actions, owner/admin role changes, billing authority changes, security settings, invite-role escalation, and runtime/admin provisioning flows require fresh MFA or passkey step-up according to policy.

Design PWA auth around server mediation:

- Browser window code reads auth state only through a server `/api/auth/session` endpoint using httpOnly SameSite cookies.
- Service workers do not inspect cookies and do not hold a long-lived bearer credential.
- Web Push subscriptions are registered through a server endpoint that receives the subscription from authenticated window code and binds the subscription server-side to `(sessionId, userId, orgId, deviceId, subscriptionHash)`.
- The server issues a one-time binding token derived from `HMAC(sessionId, nonce)` for the push-registration handshake. The server validates and consumes that token when binding or rotating the subscription, and stores only hashes/metadata needed for replay detection and audit.
- Push enqueue re-checks the bound session/user/org/device state and drops delivery when the session is revoked, expired, role-invalidated, or no longer satisfies org policy.
- Push payloads carry no sensitive content. They contain notification ids, coarse type, and fetch-on-open hints; sensitive details are fetched after `/api/auth/session` succeeds.
- Offline UX is limited to cached public shell and last-known redacted surfaces. Privileged screens show an explicit auth-required state until the server session probe succeeds.
- Do not implement a two-cookie split or any readable-cookie substitute for the httpOnly session.

Use SameSite cookies, Origin checks, and server-issued CSRF nonces for unsafe browser commands. Server actions and route handlers must reject missing or mismatched origins and must not treat service-worker-originated requests as authenticated unless the normal cookie-backed server session validation succeeds.

External Guest-Clients use a separate per-project magic-link flow. A Guest-Client token is bound to one project, one intended external identity/email, a short TTL of at most 24 hours, a token hash, single-use state, and audit metadata. Accepting a Guest-Client magic link creates or refreshes an `ExternalIdentity`/Guest-Client project access path, never an organization membership and never a Better Auth organization member. Guest-Clients are authorized through ADR-007 external-guest policy only.

Provider invitation callbacks grant nothing by themselves. Invite acceptance must revalidate the Opzava `Invitation` row inside the same database transaction that applies membership and role changes. That transaction must check token hash, intended email or user binding, org id, tenant lifecycle, invitation status, TTL, single-use state, inviter authority, role ceiling, RLS tenant context, and duplicate membership state. Only then may it create or update membership, role grants, audit rows, and outbox events.

Run `revokeSessionsOnRoleChange` in the same transaction that changes membership or role grants. The transaction that changes authority must also bump `membershipVersion`, revoke or invalidate affected sessions and push bindings, and write the audit/outbox records. A later asynchronous worker may fan out notifications or cleanup, but it must not be the first point where stale authority is made invalid.

Mitigate Better Auth advisory volume through operational controls:

- Pin Better Auth to vetted releases instead of floating ranges.
- Track the `better-auth` GHSA/advisory feed as an explicit security maintenance item.
- Treat cookie-cache, 2FA/MFA, passkey, session revocation, password reset, organization membership, and invitation paths as upgrade regression targets.
- Keep provider schemas behind `AuthPort` and Opzava-owned tables so fallback to Auth.js v5 plus Postgres is a contained adapter migration rather than a domain rewrite.

## Consequences

Better Auth deletes a large amount of custom auth code from the first implementation. Opzava gets organization membership primitives, revocable sessions, TOTP/recovery, passkeys, and anti-enumeration without building every edge case from scratch.

The AuthPort boundary becomes load-bearing. Domain services and UI code must consume Opzava principals and session/membership DTOs, not Better Auth SDK objects. If Better Auth is swapped for Auth.js v5, the application contract must remain stable.

Fine-grained authorization stays coherent with ADR-007. A valid Better Auth session proves identity and coarse org membership, but every privileged operation still re-checks Opzava membership and role state in the same transaction that authorizes the resource action. This is intentionally more work than trusting provider roles, because project access, Guest-Client access, admin boards, runtime commands, agent actions, and knowledge scopes are Opzava domain policy.

Revocable DB sessions add database reads to session validation and background cleanup work. The benefit is that logout-all-devices, password reset, org removal, role changes, and MFA policy changes have deterministic invalidation semantics. Cookie caching is unavailable as a performance shortcut.

PWA auth is more server-mediated than a normal web app. Service workers can cache shell assets and receive push events, but they do not become an auth authority. Push registration, rotation, enqueue, and wake behavior must tolerate revoked sessions, expired sessions, stale devices, duplicate subscriptions, push endpoint churn, and fetch-on-open flows.

Guest-Client access remains separate from employee/member access. This avoids accidentally giving external clients org-wide identity, internal chat access, Ask Opzava access, project knowledge beyond their scope, or coarse Better Auth organization roles.

Invitation and membership code must be transactionally strict. The auth provider can start or complete a flow, but Opzava's Invitation row, tenant lifecycle, role ceiling, inviter authority, RLS context, and audit requirements decide whether access is granted.

Security maintenance is part of the architecture. Better Auth's feature fit is accepted together with its advisory monitoring burden. A pinned release, GHSA tracking, upgrade tests, and an Auth.js fallback path are not optional operational niceties; they are the risk controls that make the primary choice acceptable.

## Amendment (2026-08-15): Passkey ceremony ownership

Better Auth continues to supply the compatible schema and algorithm conventions, but the `AuthPort` adapter owns WebAuthn ceremony orchestration and **all** session issuance. Passkeys are implemented with the mature `@simplewebauthn/server` verification core directly behind that port. The Better Auth passkey plugin is endpoint-coupled, hardcodes `requireUserVerification: false`, and issues sessions via `internalAdapter`, bypassing Opzava's AuthPort session boundary; it is therefore not used.

Passkey credentials are user-scoped global identity data under the `0001` auth-table convention, with no organization column or tenant RLS. Challenge records are likewise not tenant-RLS data, but registration and step-up challenges pin `active_organization_id` and membership version so their current-session context is revalidated at finish. Every registration, passwordless sign-in, and step-up challenge is short-lived (five minutes), salted-HMAC verified after deterministic directory lookup, purpose-bound, and conditionally consumed in its finish transaction. RP ID/name/origins come only from trusted configuration, never request headers. Both creation and assertion require user verification. A UV-verified passkey passwordless sign-in satisfies MFA and records `mfa_satisfied_at`; this avoids an unnecessary TOTP prompt for a user who has 2FA enabled.

### Passkeys and account locks

Passwordless sign-in with a registered passkey deliberately bypasses the password brute-force lockout. A registered passkey requires authenticator possession and live user verification, which is stronger than the locked password factor. Blocking this path would let an attacker who repeatedly submits wrong passwords deny a legitimate passkey holder access. Password attempts remain locked and all passkey ceremony validation, user verification, membership checks, challenge consumption, and credential-counter checks remain fail-closed.

Adding, renaming, and revoking a passkey requires the existing password re-authentication pattern. v1 deliberately permits revoking the last passkey: password and (where enabled) recovery codes remain available factors; factor-count policy can be tightened later through an explicit policy change.

## Alternatives

Use Auth.js v5 plus the Postgres adapter as the primary auth stack. Rejected as the default because Opzava would need to build or harden more of the organization, MFA/recovery, passkey, anti-enumeration, invitation, and revocable-session surface itself. It remains the real fallback because it is stable enough for session/provider fundamentals and can run behind the same `AuthPort`.

Use Lucia or a custom Lucia-style auth implementation. Rejected because Opzava's auth requirements are broad and security-sensitive. Building org membership, revocable sessions, invitation invariants, MFA recovery, passkeys, anti-enumeration, PWA push binding, and provider edge cases from primitives would increase the custom bug surface.

Use stateless JWT sessions. Rejected because Opzava requires deterministic session revocation on logout-all-devices, password reset, org removal, role change, membership change, MFA enforcement change, and push binding invalidation. Short JWT TTLs do not satisfy same-transaction authority revocation.

Let Better Auth own all authorization through organization roles. Rejected because Opzava authorization is resource-scoped and domain-specific: projects, Guest-Clients, knowledge, CRM, AI employees, tool policy, runtime commands, admin boards, billing, and approvals have policies that do not fit coarse provider roles. ADR-007 remains the fine-grained authority.

Use a managed IdP as the required foundation. Rejected for the initial posture because ADR-001 prefers lean VPS operations and vendor-neutral core ports. A managed IdP can be added later behind `AuthPort` for enterprise SSO or compliance needs, but the product foundation must not require it.

Use a readable second cookie or two-cookie split so the service worker can infer auth state. Rejected because service workers cannot read httpOnly cookies, readable cookies create a weaker parallel credential surface, and offline/push flows still need server revalidation. Opzava uses `/api/auth/session`, server-bound push subscriptions, one-time HMAC binding tokens, and fetch-on-open notifications instead.

Give Guest-Clients Better Auth organization membership with a restricted role. Rejected because Guest-Clients are external project-scoped identities, not org members. Putting them into org membership would increase the risk of internal-chat, knowledge, assistant, or admin-surface leakage and would blur the Q5 role model.

## Related ADRs

- ADR-001: Monorepo, DDD module structure, and locked stack.
- ADR-004: Data model boundary, hybrid CQRS, outbox, and projections.
- ADR-007: Resource RBAC, roles-as-data, and Postgres RLS.
- ADR-009: Realtime WS hub, internal chat, assistants-in-chat, PWA/Web Push.

---
> **Validate against official docs before implementing.** Training knowledge is a starting point, not the source of truth — check `docs/plan/official-docs.md`, `docs/openclaw`, and current vendor docs. See `CLAUDE.md` (Official-docs rule).
