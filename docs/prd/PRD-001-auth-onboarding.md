# PRD-001: Auth, invitation, profile security, and first workspace setup

## Problem

Opzava needs a secure, calm way for people to create the first workspace, join an existing organization, sign in, recover access, protect their accounts, and manage sessions before the rest of the product shell can be trusted.

This slice is more than login UI. The auth path controls Organization creation, membership grants, role grants, invitation acceptance, session revocation, MFA policy, passkey step-up, password reset, device/session cleanup, and the first tenant Gateway provisioning path. If these flows drift into provider defaults, Opzava risks stale role access, invite privilege escalation, account enumeration, weak recovery paths, orphaned provisioning, or a user landing in the product before the tenant is actually ready.

The solution is an Opzava-owned Identity & Access and onboarding product surface backed by Better Auth behind `AuthPort`, fine-grained checks through `AuthorizationPort`, and first-workspace provisioning through the Tenant Provisioning/Platform-Ops bounded context. ADR-006, ADR-007, and ADR-002 set the invariants: Better Auth authenticates but does not decide resource authorization; invitation acceptance revalidates the Opzava `Invitation` in the same transaction that grants access; and an Organization becomes usable only when tenant/Gateway provisioning reaches a valid state.

## Goals and Non-goals

### Goals

- Ship signup and login for owner setup, invited members, returning members, OAuth/provider sign-in, email/password sign-in, TOTP verification, recovery-code fallback, passkey sign-in/step-up, and guarded error states.
- Support first workspace setup that creates the owner, Organization, initial membership, role grants, optional invites, and a Tenant Provisioning job that triggers Gateway provisioning.
- Support email invitation acceptance with address locking, provider account matching, role ceiling enforcement, duplicate-member handling, and in-transaction `Invitation` re-validation before membership or role grants are written.
- Support password reset with anti-enumeration request behavior, short-lived single-use reset links, password policy checks, password reuse rejection, and session revocation after reset.
- Support TOTP enrollment, verification, hashed single-use recovery codes, recovery-code regeneration, recovery-code low-count warnings, and passkeys for passwordless sign-in and high-risk step-up.
- Support organization-enforceable MFA policy that blocks non-compliant sessions and requires fresh MFA/passkey step-up for sensitive security, role, billing, invite, and provisioning actions.
- Support profile editing, notification preference entry points, appearance defaults, connected-tool doorway, password change, MFA management, active session/device management, revoke-session, logout-all-devices, and account deletion guard states.
- Keep auth, invite, session, and setup states understandable in the Essential calm UI without exposing provider internals, raw tokens, Gateway config, or secrets.
- Define data/API touchpoints by owning bounded context and port.
- Define OpenClaw-parity boundaries so auth remains Opzava-owned while first-workspace setup harnesses Gateway provisioning only through approved ports.
- Define acceptance and testing decisions at the highest product seams.

### Non-goals

- Build enterprise SSO administration, SCIM, domain capture, IdP policy sync, or managed-IdP provisioning in this PRD.
- Build billing checkout, plans, dunning, or metered usage beyond the setup dependency that a tenant cannot become Active without valid entitlement/provisioning state.
- Build the full app shell, Home, project navigation, Find, notification center, or PWA offline/push preference surfaces. Those are handled by later PRDs, with this PRD providing session and account prerequisites.
- Build Guest-Client project magic-link UX beyond preserving the ADR-006/ADR-007 rule that Guest-Clients are project-scoped external identities, not Organization members.
- Build admin user-management tables, full audit explorer, security-audit dashboard, or org settings pages beyond the auth/profile flows and org-level MFA policy contract.
- Build OpenClaw pairing UI, channel connect wizard detail, linked-tool catalog detail, or runtime connection repair beyond showing the connected-tools doorway in Profile.
- Add a new structural `Team` hierarchy or department-based authorization role. ADR-007 roles and controlled role catalog remain the source for setup/invite role choices.

## User Stories

1. As a first-time owner, I want to create my owner account, so that I can start setting up Opzava for my organization.
2. As a first-time owner, I want password strength guidance during setup, so that my initial Owner account starts with a defensible password.
3. As a first-time owner, I want to name my workspace and choose a timezone, so that schedules, digests, and "needs you by" dates have the right default context.
4. As a first-time owner, I want to invite teammates during setup, so that the workspace can start with the right people.
5. As a first-time owner, I want to skip invites during setup, so that I can finish setup even if the team list is not ready.
6. As a first-time owner, I want setup to run only once, so that nobody can create a second first owner for an existing install.
7. As a first-time owner, I want setup progress and pending states, so that I know when owner, workspace, invites, and provisioning are being created.
8. As a first-time owner, I want setup completion to wait for a valid tenant/provisioning state, so that I do not enter a broken workspace.
9. As a first-time owner, I want setup failures to show retry or support states, so that a provisioning interruption is recoverable without duplicate tenants.
10. As a Tenant Provisioning worker, I want setup to create an idempotent provisioning job, so that Gateway provisioning can retry safely.
11. As a Tenant Provisioning worker, I want the provisioning job to reserve tenant/Gateway material and emit receipts, so that setup is auditable and resumable.
12. As an invited member, I want an invite page that shows the Organization, inviter, expiry, and role, so that I understand what I am joining.
13. As an invited member, I want the invited email address locked on the form, so that an invite cannot be redirected to another account.
14. As an invited member, I want to join with Google or GitHub when the provider account matches my invite, so that setup is quick without weakening the invite binding.
15. As an invited member, I want to set a password when I do not use a provider, so that I can join with email/password credentials.
16. As an invited member, I want expired invite messaging, so that I know to ask for a new invite instead of retrying a dead link.
17. As an invited member, I want a signed-in-as-someone-else warning, so that I do not accidentally accept another person's invite.
18. As an invited member who already belongs to the Organization, I want a safe "already have access" state, so that duplicate invite acceptance does not create duplicate grants.
19. As an inviter, I want invite acceptance to re-check my authority at acceptance time, so that a revoked inviter cannot grant access later.
20. As a security reviewer, I want invite acceptance to revalidate the Opzava `Invitation` row inside the same transaction as membership and role changes, so that provider callbacks cannot grant access by themselves.
21. As a security reviewer, I want invite acceptance to enforce token hash, email/user binding, org id, tenant lifecycle, status, TTL, single-use state, role ceiling, inviter authority, duplicate membership, and RLS tenant context, so that stale or tampered invites fail closed.
22. As a returning member, I want to sign in with email and password, so that I can access my workspace from a trusted browser.
23. As a returning member, I want to sign in with an approved provider, so that I can use my existing Google or GitHub account.
24. As a returning member, I want wrong-credential errors to be deliberately vague, so that the app never reveals whether an email exists.
25. As a returning member, I want brute-force lockout messaging, so that repeated attempts pause clearly and safely.
26. As a returning member, I want a "remember this device" option, so that trusted devices require less friction where policy allows.
27. As a returning member with MFA enabled, I want a second verification step, so that password compromise alone is not enough.
28. As a returning member with MFA enabled, I want to use a recovery code if I lose my authenticator, so that I can recover without support.
29. As a returning member with few recovery codes left, I want a warning, so that I regenerate codes before lockout.
30. As a returning member with a passkey, I want passwordless sign-in where supported, so that secure sign-in is easier.
31. As an admin performing a sensitive action, I want passkey or fresh MFA step-up, so that stale sessions cannot change high-risk settings.
32. As an organization owner, I want to enforce MFA for all members, so that the Organization meets its security posture.
33. As an organization owner, I want sessions that no longer satisfy MFA policy to be blocked or stepped up, so that policy changes take effect.
34. As a member required to enroll MFA, I want a clear enrollment path after login, so that I can satisfy org policy without getting lost.
35. As a member adding TOTP, I want to scan a QR code or copy a setup key, so that I can use my authenticator app.
36. As a member adding TOTP, I want to verify the first 6-digit code before MFA is enabled, so that broken enrollment cannot lock me out.
37. As a member adding TOTP, I want to see recovery codes once and confirm I saved them, so that I understand their importance.
38. As a member adding TOTP, I want wrong-code and clock-drift guidance, so that I can fix common authenticator issues.
39. As a member with MFA already enabled, I want enrollment to be a no-op and route to management, so that I do not create duplicate MFA state.
40. As a member, I want to register and manage passkeys from profile security, so that I can use WebAuthn for sign-in and step-up.
41. As a member, I want passkey names, device hints, creation date, last used date, and revoke actions, so that I can manage authenticators safely.
42. As a member who forgot my password, I want to request a reset link, so that I can recover access.
43. As a member who forgot my password, I want reset request results to look the same whether the account exists or not, so that account existence is not leaked.
44. As a member who forgot my password, I want reset requests rate-limited, so that abuse does not flood inboxes.
45. As a member with an SSO-only account, I want password reset to point me back to provider sign-in without revealing account existence to unauthenticated users.
46. As a member using a reset link, I want the target email shown but not editable, so that I know which account is being reset.
47. As a member using a reset link, I want the link to expire quickly and work once, so that old or replayed links cannot be abused.
48. As a member setting a new password, I want password requirements and confirmation checks, so that invalid passwords are caught before submit.
49. As a member setting a new password, I want previous-password reuse rejected, so that stolen old passwords cannot return.
50. As a member after password reset, I want all other devices signed out, so that a compromised session is revoked.
51. As a member, I want to sign out of this device, so that the current browser session ends without disrupting my other devices.
52. As a member, I want a signed-out confirmation, so that I know which sessions remain open.
53. As a member, I want a direct path back to sign in, so that returning after sign-out is easy.
54. As a member, I want to edit my profile details, avatar, display name, timezone, language, and bio, so that teammates and assistants see accurate identity.
55. As a member, I want profile saves to give quick feedback, so that I know changes were accepted.
56. As a member, I want notification preferences and quiet hours in Profile, so that account-level preferences have a home.
57. As a member, I want appearance defaults in Profile, so that Opzava opens with my preferred theme and density.
58. As a member, I want a connected-tools summary in Profile, so that I can see whether local tools need attention.
59. As a member, I want to change my password from Profile, so that I can rotate credentials without using reset.
60. As a member, I want password change to require my current password or step-up, so that an unattended session cannot silently change credentials.
61. As a member, I want Profile Security to show MFA status and management, so that I can keep account protection current.
62. As a member, I want active sessions listed by device, browser, location hint, and last activity, so that I can spot unfamiliar access.
63. As a member, I want to revoke another session, so that a lost or shared device can be signed out.
64. As a member, I want "sign out everywhere", so that I can quickly revoke all other sessions.
65. As a member, I want session revocation to also invalidate push bindings for those devices, so that revoked devices stop receiving notifications.
66. As a member deleting my account, I want typed confirmation, so that destructive action is deliberate.
67. As a teammate in shared projects, I want another user's account deletion not to delete shared project records, so that team work remains intact.
68. As an admin changing roles or membership, I want affected sessions revoked or invalidated in the same transaction, so that stale access cannot continue.
69. As an authorization maintainer, I want every privileged auth/profile/setup mutation to call `AuthorizationPort`, so that auth provider state never bypasses Opzava policy.
70. As a product operator, I want audit rows for setup, invite acceptance, MFA changes, passkey changes, session revocation, password reset, org MFA policy changes, and account deletion, so that security events are explainable.
71. As a PWA user, I want authenticated state checked through server session endpoints, so that service workers never need readable cookies.
72. As a PWA user, I want offline privileged screens to show an auth-required gate until the server session probe succeeds, so that cached UI does not imply live authorization.
73. As a developer, I want these flows tested through auth/onboarding commands, route/server-action behavior, and UI composition, so that the security contract survives provider upgrades.

## UX walkthrough

| Mockup | Required UX mapping |
| --- | --- |
| `essential-login.html` | Sign-in card with Opzava mark, Google/GitHub provider buttons, email/password form, password visibility control, remember-device option, forgot-password link, first-time setup link, TOTP verification step, recovery-code fallback, vague wrong-credential alert, brute-force lockout state, wrong-2FA alert, recovery-code low-count warning, and pending submit state. Login must never reveal account existence and must route MFA/passkey step-up according to session and org policy. |
| `essential-2fa-setup.html` | Profile Security TOTP enrollment flow with three steps: Scan, Verify, Recovery. It must use a server-issued `otpauth://` secret, copyable setup key, 6-digit verification, one-time recovery codes displayed once, download/copy/print actions, saved-codes confirmation, success state, wrong-code state, already-enabled state, and pending verification state. The "security key / passkey" affordance maps to passkey enrollment/management behind `AuthPort`. SMS is not a baseline factor in this PRD. |
| `essential-accept-invite.html` | Invitation acceptance with Organization name, inviter, expiry, role label, provider join buttons, locked invited email, name/password fields, terms links, expired invite state, signed-in-as-wrong-user state, already-member state, and pending join state. The UI is only a shell over the hard requirement that `Invitation` is revalidated inside the same tenant transaction that creates or updates membership and role grants. |
| `essential-forgot-password.html` | Reset request page with email input, neutral "check your email" result, masked submitted email, 30-minute expiry copy, resend action, back-to-sign-in link, invalid-email validation, rate-limit state, pending state, and SSO-account guidance. The result copy, timing, and status must not disclose whether the account exists. |
| `essential-reset-password.html` | Reset-link landing page with locked account email, new password, confirmation, strength/requirement guidance, success state that explains other sessions were signed out, expired/used/tampered-link state, mismatch state, password-reuse state, and pending save state. Successful reset revokes other sessions and push bindings. |
| `essential-setup.html` | First-run setup with Account, Workspace, and Team steps; owner name/email/password; workspace name/timezone; optional team invite text area; default role selector; skip-for-now path; already-set-up guard; weak-password guard; pending "Creating workspace" state; and workspace-ready confirmation. Submitting setup creates Owner membership and a Tenant Provisioning job that triggers Gateway provisioning before normal product access is allowed. |
| `essential-profile.html` | Authenticated Profile page inside the Essential top bar with in-page sections for Profile, Notifications, Appearance, Connected tools, and Security & account. Required security mapping includes profile saves, notification preferences, quiet hours, appearance defaults, connected-tools doorway, password change, MFA status/manage action, active sessions with current-device label, per-session sign-out, sign-out-everywhere, restrained danger zone, typed account-deletion dialog, live save feedback, and accessible focus/announcement behavior. |
| `essential-signout.html` | Signed-out confirmation card after current-device logout with Sign back in, Back to marketing/site, and explicit note that other sessions stay open. Logout-all-devices remains a Profile Security action and must revoke other sessions and push bindings. |

## Functional requirements

### Signup, login, and session validation

- Identity & Access must own Opzava user, account, session, membership mirror, MFA, passkey, invite, reset, and audit product behavior while Better Auth remains behind `AuthPort`.
- Returning sign-in must support email/password and approved provider sign-in.
- First workspace setup is the owner signup path and must be unavailable once an install or tenant already has an owner.
- Provider sign-in must create or link credentials only through `AuthPort` use cases that preserve Opzava user and membership records.
- Login errors for wrong credentials must be deliberately vague and must not reveal whether an email address exists.
- Login attempts must be rate-limited and lockout states must be explicit without leaking account state.
- DB-backed revocable sessions are required. Stateless JWT web sessions are out of scope.
- Session validation must check expiry, revocation, user state, active org context, membership state, membership version, tenant lifecycle, MFA level, and org MFA policy.
- `session.cookieCache` must stay disabled according to ADR-006.
- Every privileged command/query after login must re-check Opzava membership and role state through `AuthorizationPort`, not Better Auth provider roles.
- Unsafe browser commands must use SameSite cookies, origin checks, and server-issued CSRF nonces.
- PWA and service-worker flows must use server-mediated session probes. Service workers must not read cookies or hold long-lived bearer credentials.

### MFA, recovery codes, and passkeys

- TOTP must be the baseline MFA factor and must be enrolled only after a successful first code verification.
- TOTP secrets and recovery-code generation must be handled through `AuthPort`; UI must never persist or log raw secrets.
- Recovery codes must be hashed at rest, single-use, displayed once, and regenerated only after fresh auth/step-up.
- Login must support recovery-code fallback when TOTP is unavailable and must mark used codes as consumed.
- The product must warn when recovery-code count is low after login or in Profile Security.
- Passkeys must be supported through WebAuthn/SimpleWebAuthn behind `AuthPort` for passwordless sign-in where stable and for high-risk step-up.
- Passkey management must show safe metadata only: display name, device/platform hint, created date, last used date, and revoke action.
- Org-level MFA enforcement must require compliant sessions for all covered members and must force enrollment or step-up when policy changes.
- High-risk actions must require fresh MFA or passkey step-up: owner/admin role changes, invite-role escalation, billing authority, org security settings, password change without current-password confidence, recovery-code regeneration, passkey deletion, logout-all-devices, account deletion, and provisioning/admin repair actions.
- Sessions that no longer satisfy org MFA policy must be revoked, blocked, or stepped up before privileged access.

### Invitation acceptance

- Invitation creation and acceptance must be owned by Identity & Access.
- Invitation links must use token hashes, not stored plaintext tokens.
- Invitations must have TTL, status, intended email or user binding, inviter reference, org id, role ceiling, and audit metadata.
- Invite acceptance must revalidate the Opzava `Invitation` row inside the same database transaction that applies membership and role changes.
- The acceptance transaction must check token hash, intended email/user binding, org id, tenant lifecycle, invitation status, TTL, single-use state, inviter authority, role ceiling, duplicate membership state, and RLS tenant context.
- Provider invitation callbacks must grant nothing by themselves.
- The invited email must be fixed in the UI and in the command payload; user-entered alternate email cannot redirect the invite.
- Provider sign-in during invite acceptance must prove the provider identity matches the invited address or bound user.
- Already-member acceptance must be idempotent and must not create duplicate membership or role grants.
- Expired, used, revoked, tenant-suspended, role-ceiling-failed, wrong-user, and inviter-no-longer-authorized states must fail closed with clear user-facing copy.
- Membership, `RoleGrant`, `membershipVersion`, session invalidation, audit rows, and outbox events must be written in the same transaction as successful acceptance.

### Password reset and password change

- Forgot-password request must always return neutral "check your email" behavior after syntactically valid email input.
- Reset request rate limits must apply by IP, account/email hash where available, and device/session hints where available.
- Password reset links must be short-lived, single-use, token-hashed, and bound to the intended account.
- Reset links must show the account email in locked/read-only form after token validation.
- Password reset must enforce current password policy and reject reuse according to stored password-history policy.
- Successful password reset must revoke other sessions, invalidate push bindings for revoked sessions, bump relevant session/security version state, and write audit/outbox events.
- Password change from Profile must require current password or fresh step-up according to policy.
- Password change from Profile must preserve the current session only when policy allows and must revoke other sessions when risk policy requires it.
- SSO/provider-only accounts must not expose a password reset path that implies account existence to unauthenticated requesters.

### First workspace and Organization setup

- First-run setup must create or link the first `User`, create the `Organization`, create Owner `Membership`, create Owner `RoleGrant`, set workspace timezone defaults, and write audit/outbox rows.
- Setup must be idempotent by setup attempt and tenant/org identifiers; duplicate submits must not create duplicate owners or Organizations.
- Setup must create a `ProvisioningJob` owned by Tenant Provisioning/Platform-Ops that triggers the ADR-002 Gateway provisioning flow through `GatewayRuntimePort`.
- Normal product access must not be granted until the Organization is in a usable lifecycle/provisioning state. A recoverable provisioning state may show a setup-progress or retry/repair page.
- Optional setup invites must create `Invitation` rows after the Owner membership and role grants are committed and authorized.
- Setup role choices must come from the controlled role catalog. If the UI offers a viewer-like option, it must map to an approved role row or be omitted until supported by ADR-007 role data.
- Setup must enforce the already-set-up guard before owner creation and again inside the creation transaction.
- Setup must record provisioning receipts or pointers sufficient for support and audit without exposing Gateway admin tokens, ports, config paths, or secrets to the browser.

### Profile, preferences, sessions, and account security

- Profile reads and writes must be scoped to the active user and active Organization where applicable.
- Profile identity fields must include full name, display name, email, job title, timezone, language, bio, and avatar/photo metadata.
- Email change must require verification and fresh step-up before it changes sign-in identity or notification destination.
- Notification preference controls in Profile must update user preference records or route to the notification preference owner without duplicating notification domain logic.
- Appearance defaults must be user-scoped preferences.
- Connected tools in Profile must be a doorway summary only; detailed tool connection and repair flows belong to the connected-tools PRD.
- Password change, MFA management, passkey management, active sessions, logout-all-devices, and account deletion must live in Security & account.
- Active sessions must show device/browser, approximate location, last active, current-device marker, MFA level where useful, and revoke action.
- The current session cannot revoke itself through a "Sign out" row action; current-device logout uses the sign-out flow.
- Revoking another session must set `revokedAt`, invalidate associated push binding, and remove access on next request/reconnect.
- Logout-all-devices must revoke every other active session for the user, invalidate their push bindings, and preserve only the current session when policy allows.
- Current-device logout must revoke or end only the current session and land on the signed-out confirmation screen.
- Account deletion must require typed confirmation and fresh step-up. The initial implementation may schedule deletion rather than immediately hard-delete, but the user-facing state must be explicit.
- Account deletion must not delete shared Organization or Project records owned by the team.

### Org-level security policy and admin-sensitive actions

- Organization security policy must include an MFA enforcement flag or equivalent policy row.
- Owner/Admin users with permission may enable, disable, or update org MFA policy through an authorized command.
- Enabling org MFA must identify non-compliant members and force enrollment/step-up before privileged access.
- Policy changes must bump the relevant membership/security version and invalidate or step up non-compliant sessions.
- Invite role escalation, Owner/Admin role changes, security policy changes, billing authority changes, provisioning repair, and account deletion require fresh MFA/passkey step-up.
- All security policy changes must emit audit rows and outbox events for notifications/security telemetry.

### Accessibility, copy, and async states

- Auth cards, setup steps, MFA code inputs, profile tabs/anchors, session rows, dialogs, and alerts must be keyboard accessible.
- Pending states must disable duplicate submits and announce progress through polite live regions.
- Error and status states must use labels/glyphs and not rely on color alone.
- Reset, invite, and login copy must avoid account enumeration.
- Security errors must be plain-language by default and must not expose raw provider errors, token state, SQL/RLS details, or Gateway provisioning internals.
- Mobile layouts must preserve form labels, role labels, recovery codes, session actions, and destructive confirmations without overlap.

## Data and API touchpoints

| Surface | Owning bounded context | Primary data/API touchpoints | Ports |
| --- | --- | --- | --- |
| Signup and login | Identity & Access | User, credential/provider account, password policy, login attempt/rate-limit state, session issuance, remember-device hint, MFA challenge state | `AuthPort`, `AuthorizationPort`, `EventBusPort` |
| Session validation | Identity & Access | Session token hash/id, active org context, device metadata, MFA level, membership version, expiry, `revokedAt`, push binding refs | `AuthPort`, `AuthorizationPort`, `PushNotificationPort`, `EventBusPort` |
| TOTP enrollment | Identity & Access | TOTP secret lifecycle, otpauth URI, verification challenge, MFA enrollment state, audit row | `AuthPort`, `AuthorizationPort`, `EventBusPort` |
| Recovery codes | Identity & Access | Hashed single-use recovery codes, generated/used/regenerated counts, low-count warning, audit row | `AuthPort`, `AuthorizationPort`, `EventBusPort` |
| Passkeys | Identity & Access | WebAuthn credential metadata, challenge/attestation/assertion, last-used timestamp, revoke command, step-up proof | `AuthPort`, `AuthorizationPort`, `EventBusPort` |
| Invitation acceptance | Identity & Access | `Invitation`, token hash, intended email/user binding, inviter authority, role ceiling, `Membership`, `RoleGrant`, `membershipVersion`, duplicate-member state, audit/outbox | `AuthPort`, `AuthorizationPort`, `EventBusPort` |
| Password reset | Identity & Access | Reset token hash, TTL, single-use state, masked email display, password policy, password history, session revocation, push binding invalidation | `AuthPort`, `PushNotificationPort`, `EventBusPort` |
| First workspace setup | Identity & Access with Tenant Provisioning/Platform-Ops | Owner `User`, `Organization`, Owner `Membership`, Owner `RoleGrant`, workspace timezone, setup attempt idempotency, setup audit rows | `AuthPort`, `AuthorizationPort`, `EventBusPort` |
| Gateway provisioning from setup | Tenant Provisioning/Platform-Ops | `ProvisioningJob`, `GatewayInstance`, tenant lifecycle state, provisioning receipts, health/readiness result, retry/repair status | `GatewayRuntimePort`, `AuthorizationPort`, `EventBusPort` |
| Setup invites | Identity & Access | Invite batch, role choices from role catalog, inviter authority, invite TTL/status, email delivery intent/outbox | `AuthPort`, `AuthorizationPort`, `EventBusPort` |
| Profile identity | Identity & Access | User profile, avatar/object ref, display name, email verification state, timezone, language, bio, job title | `AuthPort`, `AuthorizationPort`, `ObjectStorePort`, `EventBusPort` |
| User preferences | Identity & Access with Notifications/Admin-Observability where needed | Appearance defaults, notification preference refs, quiet hours, pause state, preference audit where required | `AuthorizationPort`, `EventBusPort`, optionally `PushNotificationPort` |
| Connected-tools doorway | Runtime Control / Gateway Broker with Identity & Access | Linked-tool status summary, health count, user/org scoped connection refs, deep link to tool catalog | `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort` |
| Active sessions and devices | Identity & Access | Session list, device/browser/location metadata, current-device marker, revoke command, logout-all-devices command, push binding refs | `AuthPort`, `AuthorizationPort`, `PushNotificationPort`, `EventBusPort` |
| Org MFA policy | Identity & Access | Organization security policy, enforcement flag, non-compliant session/member query, policy update command, session invalidation | `AuthPort`, `AuthorizationPort`, `EventBusPort` |
| Account deletion | Identity & Access with contributing contexts | Typed confirmation, fresh step-up proof, deletion/scheduled-deletion state, personal preference/profile cleanup, shared-work preservation refs | `AuthPort`, `AuthorizationPort`, `EventBusPort` |
| Audit and security telemetry | Audit/Security with Identity & Access producers | Auth events, invite events, MFA/passkey changes, reset, session revocation, setup/provisioning refs, org policy changes, account deletion | `EventBusPort`, `AuthorizationPort` |

## Implementation decisions

- Use Better Auth as the primary auth adapter only through `AuthPort`; do not let domain services or UI depend on Better Auth schemas or role strings.
- Keep Auth.js v5 plus Postgres adapter as the fallback strategy behind the same `AuthPort`, consistent with ADR-006.
- Keep authentication and authorization split: valid session proves identity/coarse org context; `AuthorizationPort` decides resource and action access.
- Use DB-backed revocable sessions with membership/security version checks. Do not introduce stateless JWT web sessions.
- Disable Better Auth `session.cookieCache` and treat any proposal to enable it as requiring a new ADR.
- Model invite acceptance as one transaction that revalidates `Invitation`, writes membership/grants/audit/outbox, bumps membership version, and invalidates affected sessions.
- Model first workspace setup as a two-context flow: Identity & Access creates owner/org/grants, Tenant Provisioning/Platform-Ops creates the ADR-002 provisioning job and Gateway readiness state.
- Keep Gateway provisioning off the request hot path. The web flow observes provisioning state and receipts; `GatewayRuntimePort` work is done by the provisioning worker.
- Use role choices from ADR-007 roles-as-data. Do not hard-code provider roles or introduce department/team roles.
- Store only token hashes, credential refs, session hashes, safe device metadata, and SecretReference-style metadata. Never store or render plaintext auth tokens, reset tokens, invitation tokens, TOTP secrets, recovery-code hashes, provider tokens, Gateway admin tokens, or channel secrets in browser-visible content.
- Treat Profile connected-tools as a summary doorway; detailed runtime connection state belongs to the connected-tools surface.
- Use outbox/audit events for auth and setup side effects. Email sending, notifications, and provisioning progress may be asynchronous, but stale authority invalidation must happen in the same transaction as the authority change.
- Use plain-language auth errors and map provider/internal failures to product states before they reach the UI.

## OpenClaw-parity notes

| Feature area | Classification | Native harnessed vs Opzava-owned decision |
| --- | --- | --- |
| Signup, login, password reset, MFA, passkeys, sessions | Opzava-owned | OpenClaw has no user identity authority for Opzava. Better Auth is harnessed behind `AuthPort`; Opzava owns product users, sessions, membership mirrors, audit, and policy. |
| Fine-grained authorization | Opzava-owned | ADR-007 `AuthorizationPort` decides Organization, Project, Member, RoleGrant, Invitation, and Guest-Client access. OpenClaw never decides Opzava user permissions. |
| Invitation acceptance | Opzava-owned | Provider callbacks are inputs only. Opzava `Invitation` revalidation and membership/role grant transaction are the authority. |
| First workspace setup | Hybrid | Opzava owns owner/org/membership/setup state. Gateway provisioning is harnessed through Tenant Provisioning/Platform-Ops and `GatewayRuntimePort` according to ADR-002. |
| Tenant Gateway readiness | Native harnessed through Opzava provisioning | OpenClaw Gateway health/readiness, pairing, runtime lifecycle, and seeded runtime artifacts are reached only through provisioning workers and ports. Browser auth/setup flows never write Gateway config. |
| Profile identity and preferences | Opzava-owned | Profile, preferences, session/device management, MFA/passkeys, and account deletion are Opzava Identity & Access concerns. |
| Connected-tools doorway in Profile | Hybrid | Opzava owns authorized summary rows and navigation. Runtime/tool health may be projected from Gateway/OpenClaw/MCP signals through existing ports. |
| Audit/security telemetry | Opzava-owned with runtime refs where applicable | Auth and account-security events are Opzava audit events. Gateway provisioning refs remain opaque and safe. |
| PWA auth and push binding | Opzava-owned | Server-mediated `/api/auth/session` and push binding are Opzava session behavior. Push payloads carry fetch-on-open hints, not sensitive OpenClaw data. |

## Acceptance criteria

- First-run setup creates exactly one Owner path for a new workspace and blocks repeated setup for an already-owned install.
- Setup writes owner user, Organization, Owner membership, Owner role grant, workspace defaults, audit/outbox records, and a Tenant Provisioning job.
- Setup does not grant normal product access until tenant/Gateway provisioning reaches a usable state or a clear recoverable setup/provisioning state is shown.
- Optional setup invites create `Invitation` rows with controlled role choices and do not send or store plaintext invite tokens.
- Login supports email/password and approved provider sign-in with vague wrong-credential behavior.
- Login rate limiting and brute-force lockout render clear states without revealing account existence.
- TOTP challenge appears after password/provider sign-in when the user/session/org policy requires MFA.
- Recovery-code fallback works once per code and warns when code count is low.
- Passkey sign-in and step-up use WebAuthn challenges through `AuthPort` and expose only safe metadata.
- Org MFA policy can be enforced by authorized Owner/Admin users and blocks, revokes, or steps up non-compliant sessions.
- TOTP setup requires scan/copy setup key, verifies a first code, displays recovery codes once, and requires saved-code confirmation before enabling.
- Invitation acceptance shows Organization/inviter/expiry/role, locks the invited email, handles provider join and password join, and renders expired/wrong-user/already-member/pending states.
- Invitation acceptance revalidates `Invitation` in the same transaction that writes membership, role grants, audit/outbox, membership version, and session invalidation.
- Provider invitation callbacks never grant membership or role grants without the Opzava transaction.
- Forgot-password request returns the same neutral result for existing and non-existing accounts after valid email input.
- Password reset links expire, are single-use, are token-hashed, and show a locked target email after validation.
- Password reset enforces password policy, rejects password reuse, and revokes other sessions and push bindings on success.
- Profile renders Profile, Notifications, Appearance, Connected tools, and Security & account sections inside the Essential shell.
- Profile identity edits save user-visible fields and provide accessible pending/saved feedback.
- Email changes require verification and fresh step-up before changing login or notification identity.
- Profile Security supports password change, MFA status/manage action, passkey management entry, active sessions, revoke session, logout-all-devices, and account deletion guard.
- Session list shows current device, other devices, approximate metadata, last activity, and authorized revoke actions.
- Current-device logout lands on the signed-out confirmation and does not revoke other sessions.
- Logout-all-devices revokes other sessions and push bindings.
- Account deletion requires typed confirmation and fresh step-up and does not delete shared project/team records.
- Missing tenant context, authorization denial, stale membership version, revoked session, suspended tenant, and non-compliant MFA policy render blocked/forbidden/step-up states, never a successful empty state.
- Auth/profile/setup UI states are keyboard accessible, announce pending/success/error changes, and do not rely on color alone.
- No UI, DTO, event, or audit row exposes plaintext secrets, tokens, recovery-code hashes, provider payloads, Gateway config, or raw provisioning credentials.

## Testing decisions

- Test at the highest product seams: Identity & Access commands/queries, auth route/server-action behavior, Tenant Provisioning setup handoff, authorization-gated profile/session actions, and UI composition for the named auth/profile/setup screens.
- Tests should assert external behavior and security invariants, not Better Auth internals or CSS implementation details.
- Add login tests for provider and email/password success, vague wrong-credential failure, lockout/rate-limit state, MFA challenge routing, recovery-code fallback, passkey challenge routing, and revoked-session denial.
- Add session validation tests for expired sessions, `revokedAt`, stale membership version, org removal, role change, org MFA policy change, suspended tenant, and missing tenant context.
- Add TOTP tests for enrollment secret issuance, first-code verification, wrong-code rejection, recovery-code one-time display, hashed storage, single-use consumption, low-count warning, regeneration step-up, and already-enabled no-op.
- Add passkey tests for registration challenge, sign-in assertion, step-up assertion, safe metadata display, revoke action, and stale-session mutation denial.
- Add invitation tests for expired token, used token, wrong email, wrong signed-in user, provider email mismatch, duplicate member, tenant not active, inviter lost authority, role ceiling failure, RLS missing context, and successful in-transaction membership/grant write.
- Add password reset tests for anti-enumeration response, resend/rate limit, token expiry, token reuse, tampered token, locked account email display, password mismatch, password reuse rejection, and other-session revocation.
- Add first-workspace setup tests for already-set-up guard, owner/org/grant creation, optional invite creation, duplicate submit idempotency, provisioning job creation, provisioning failure/retry state, and no normal access before usable lifecycle.
- Add Profile tests for identity save, notification preference save/route, appearance defaults, connected-tools doorway, password change, MFA/passkey management links, active session list, revoke session, logout-all-devices, and account deletion typed confirmation.
- Add authorization tests for every profile/security mutation, org MFA policy change, setup invite role choice, session revoke, and account deletion.
- Add audit/outbox tests for setup, invite acceptance, password reset, password change, MFA/passkey changes, session revocation, org MFA policy change, and account deletion.
- Add PWA/push-binding tests for server-mediated session probe, push binding invalidation on session revocation/password reset/logout-all-devices, and no sensitive push payload details.
- Add accessibility tests for auth cards, MFA code inputs, setup stepper, invite states, reset states, session rows, destructive dialogs, live regions, focus return, keyboard-only actions, and non-color status labels.
- Add provider-upgrade regression tests around Better Auth cookie cache disabled behavior, 2FA paths, passkeys, revocable sessions, password reset invalidation, and invitation callbacks.
- Do not test OpenClaw protocol internals in auth tests. Use `GatewayRuntimePort` fakes/provisioning receipts for setup handoff behavior.

## Dependencies

- ADR-006: Better Auth, revocable sessions, MFA/passkeys, invitation hardening, anti-enumeration, PWA auth, push binding, and Auth.js fallback.
- ADR-007: Resource-scoped RBAC, roles-as-data, `AuthorizationPort`, Organization/Project/Member/RoleGrant/Invitation vocabulary, RLS, and fail-closed tenant access.
- ADR-002: Pure-per-tenant tenancy, Tenant Provisioning job, `GatewayRuntimePort`, Gateway readiness, lifecycle state, and anti-orphan provisioning invariants.
- ADR-001: Locked stack, DDD module structure, and port vocabulary for `AuthPort`, `AuthorizationPort`, `GatewayRuntimePort`, `EventBusPort`, `ObjectStorePort`, and related boundaries.
- ADR-004: Identity & Access as Opzava system of record, outbox/projections, and no OpenClaw type leakage.
- ADR-009: PWA/Web Push delivery consumers, push privacy, and realtime reconnect consumers that depend on session validity.
- PRD-002: App shell and navigation consume authenticated session, active Organization, Profile route, notification bell, and shell forbidden/offline states.
- PRD-013: Connected-tools doorway (connections/providers/channels + connect wizard) is detailed in the connections/tools surfaces.

---
> **Validate against official docs before implementing.** Training knowledge is a starting point, not the source of truth — check `docs/plan/official-docs.md`, `docs/openclaw`, and current vendor docs. See `CLAUDE.md` (Official-docs rule).
