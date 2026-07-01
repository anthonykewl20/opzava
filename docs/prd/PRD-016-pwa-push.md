# PRD-016: PWA install, offline behavior, and Web Push preferences

## Problem

Opzava is intended to feel available like a desktop/mobile work app while remaining a secure web product backed by revocable Better Auth sessions, server-mediated realtime, and safe Web Push. The ADRs lock the hard parts: ADR-006 says service workers cannot read httpOnly cookies, and ADR-009 says PWA/Web Push delivery must bind subscriptions to server-validated sessions and carry safe payloads only.

Without a PRD-level contract, this slice can drift into risky or confusing behavior:

- The app could be technically installable but lack clear install states, manifest quality, update behavior, or offline recovery.
- Offline screens could imply privileged access when the server session cannot be proven.
- A service worker could be treated as an auth authority even though it cannot inspect httpOnly session cookies.
- Web Push subscriptions could outlive revoked sessions, role changes, tenant suspension, disabled devices, or changed user preferences.
- Push payloads could leak sensitive message, project, ticket, approval, incident, or customer details onto browser and platform notification surfaces.
- Notification preferences could remain split between Settings, Alerts, channel mute state, and device permissions, making delivery hard to reason about.
- iOS users could expect browser-tab push even though Web Push is available only for installed Home Screen PWAs on supported iOS/iPadOS versions.

The solution is a complete PWA and Web Push product slice owned by App Shell, Identity & Access, Internal Collaboration, and Notifications/Admin-Observability. Opzava becomes installable through a production web app manifest and service worker, caches only public shell surfaces plus redacted last-known safe UI, gates privileged offline screens behind a server session probe, binds Web Push subscriptions server-side to the authenticated session/device, and gives each user explicit push, in-app, email, Slack, digest, quiet-hours, and device preferences. This PRD applies ADR-006 and ADR-009 without restating their architecture.

## Goals and Non-goals

### Goals

- Ship an installable PWA for desktop and mobile with a valid web app manifest, icons, scope, start URL, display mode, theme colors, and service-worker registration.
- Provide a reliable app shell that can load from cache for public/auth-neutral surfaces and show an explicit auth-required gate for privileged surfaces until `/api/auth/session` succeeds.
- Cache static assets, login/reset/invite/status shell surfaces, install help, and safe redacted offline states; do not cache sensitive authenticated data as offline truth.
- Make offline, reconnecting, stale, unsupported-browser, update-available, and auth-required states normal UX states.
- Register, rotate, disable, and prune Web Push subscriptions through authenticated window code and server-side push-to-session binding.
- Respect the ADR-006 constraint that service workers cannot read httpOnly cookies and must not hold long-lived bearer credentials.
- Store per-device push subscription metadata with endpoint hashes, session/device binding, browser/platform metadata, expiration/rotation state, and audit.
- Re-check session, membership version, role state, tenant lifecycle, device state, subscription state, and per-user preferences before push enqueue/delivery.
- Keep push payloads safe: notification id, coarse type, org/project hint where safe, collapse/dedup key, and fetch-on-open instruction only.
- Add per-user notification preferences for Web Push, in-app, email, Slack, digests, quiet hours, severity overrides, event routing, and per-device enablement.
- Integrate push preference controls into `settings.html` Notifications and delivery/rule visibility into `notifications-alerts.html`.
- Document and surface the iOS installed-PWA-only caveat clearly in permission/install UX.
- Define data/API touchpoints by owning bounded context and ports.
- Define OpenClaw-parity boundaries: Opzava owns PWA install, push auth, notification preferences, and delivery policy; OpenClaw remains a source for runtime events only through existing ports.
- Define acceptance and testing decisions for installability, offline gates, subscription lifecycle, preferences, privacy, and platform caveats.

### Non-goals

- Build native iOS, Android, macOS, or Windows apps.
- Add native APNs/FCM app adapters in this PRD; Web Push with VAPID is the first `PushNotificationPort` adapter per ADR-009.
- Let service workers authenticate users, read httpOnly cookies, store session secrets, or bypass `/api/auth/session`.
- Implement a readable second cookie, localStorage session token, IndexedDB bearer token, or two-cookie split for PWA auth.
- Guarantee full offline editing, offline chat send, offline project management, offline approvals, offline ticket commands, or offline agent dispatch.
- Cache sensitive message bodies, approval payloads, customer PII, financial data, raw notifications, logs, runtime traces, OpenClaw refs, or secrets for offline display.
- Replace Internal Collaboration notification rules, PRD-012 alert rules, PRD-014 billing/budget alerts, or per-channel mute behavior.
- Build third-party Slack/email delivery providers; this PRD consumes the existing notification/outbox and connection mechanisms.
- Expose OpenClaw Gateway, Workboard, runtime sessions, task refs, logs, usage, tools, or approval internals directly to the browser/service worker.
- Publish this PRD, call `gh`, create issues, or apply issue-tracker labels.

## User Stories

1. As an organization member, I want to install Opzava from my browser, so that it opens like a focused work app.
2. As an organization member, I want the installed app to show the Opzava name, icon, theme, and correct start screen, so that it feels trustworthy.
3. As an organization member, I want install prompts only when my browser supports the PWA requirements, so that I do not follow dead-end setup.
4. As an organization member, I want an install help screen when the browser does not expose the native prompt, so that desktop and mobile installation is still discoverable.
5. As an iOS user, I want clear copy that push notifications require adding Opzava to the Home Screen, so that I understand why Safari-tab push is unavailable.
6. As an iOS user, I want push controls disabled until Opzava is running as an installed PWA where required, so that I do not grant a permission that cannot work.
7. As a mobile user, I want the installed app to stay inside the correct Opzava scope, so that navigation does not unexpectedly jump to a browser tab.
8. As a desktop user, I want the installed app to preserve normal sign-in and organization context, so that it behaves like the web app.
9. As a product operator, I want manifest and service-worker updates to be versioned, so that stale shell assets can be refreshed safely.
10. As a product operator, I want users to see an update-available prompt when a new shell is ready, so that long-lived installed apps do not run stale code silently.
11. As an offline user, I want the app shell to load from cache, so that I get a clear Opzava experience instead of a browser error.
12. As an offline user, I want public/auth-neutral surfaces to render from cache, so that login, reset, invite landing, status, and install help are still reachable.
13. As an offline signed-in user, I want privileged screens to show an auth-required gate when the server cannot be reached, so that cached UI does not imply active authorization.
14. As an offline signed-in user, I want redacted last-known surfaces where allowed, so that I can orient myself without seeing sensitive details.
15. As an offline signed-in user, I want no offline mutation to pretend it succeeded, so that I do not create hidden conflicts.
16. As a reconnecting user, I want Opzava to re-check `/api/auth/session` before showing privileged content, so that revoked sessions fail closed.
17. As a reconnecting user, I want the app to refresh notification, activity, and unread counts after session validation, so that stale cached counts reconcile.
18. As a user whose session expired, I want the offline gate to route me to sign in when network returns, so that recovery is direct.
19. As a user removed from an organization, I want cached app surfaces to stop showing privileged data after the next server probe, so that removed access is enforced.
20. As a user whose role changed, I want push delivery and cached privileged surfaces to respect the new role after revalidation, so that stale authority is not preserved.
21. As a security reviewer, I want service workers to never read cookies or store bearer credentials, so that the httpOnly session boundary remains intact.
22. As a security reviewer, I want push registration initiated by authenticated window code, so that the server can validate the session before binding.
23. As a security reviewer, I want a one-time server-issued binding token for subscription registration, so that a subscription cannot be replay-bound casually.
24. As a security reviewer, I want binding tokens consumed once, so that retries and malicious reuse are detectable.
25. As a security reviewer, I want push subscriptions bound server-side to session, user, org, device, and subscription hash, so that service workers are not the authority.
26. As a security reviewer, I want push enqueue to re-check session revocation and membership version, so that role changes suppress stale devices.
27. As a security reviewer, I want tenant suspension to suppress push delivery, so that background notifications do not outlive tenant lifecycle.
28. As a security reviewer, I want push payloads to contain only safe hints, so that lock screens and notification centers do not leak sensitive content.
29. As a security reviewer, I want notification details fetched after normal server auth, so that opening a push cannot bypass authorization.
30. As a security reviewer, I want dead push endpoints pruned on provider errors, so that stale subscriptions do not accumulate.
31. As a security reviewer, I want user/device push disablement audited, so that delivery changes are explainable.
32. As an organization owner, I want logout-all-devices to invalidate push bindings, so that old devices stop receiving notifications.
33. As an organization owner, I want password reset and high-risk recovery to invalidate push bindings, so that compromised sessions cannot keep background delivery.
34. As an organization owner, I want org MFA policy changes to suppress non-compliant sessions and devices, so that push follows auth policy.
35. As an organization owner, I want device lists to show active push-capable browsers, so that users can disable lost or stale devices.
36. As an organization owner, I want device labels to be understandable but not fingerprint-invasive, so that privacy and utility are balanced.
37. As a user, I want to turn Web Push on or off for my account, so that I control background delivery.
38. As a user, I want to turn Web Push on or off per device, so that work notifications go only to devices I trust.
39. As a user, I want browser permission state shown in Settings, so that I know whether Opzava can actually send push.
40. As a user, I want a test notification action, so that I can confirm a device is configured correctly.
41. As a user, I want clear blocked-permission recovery instructions, so that I can fix browser-level notification denial.
42. As a user, I want quiet hours, so that non-critical notifications are held overnight.
43. As a user, I want critical notifications to bypass quiet hours where policy allows, so that incidents and approvals are not missed.
44. As a user, I want digest frequency controls, so that routine completed work can be summarized instead of pushed immediately.
45. As a user, I want per-event routing for approval requested, agent run failed, task completed, budget threshold, DMs, mentions, assistant completions, task assignments, and admin alerts, so that each category reaches the right channel.
46. As a user, I want in-app, Web Push, email, and Slack preferences to be separate channels, so that disabling one does not disable all awareness.
47. As a user, I want channel mute and DM/mention priority to interact predictably, so that busy rooms are quiet but direct call-outs still reach me.
48. As a user, I want grouped similar events, so that repeated failures do not create notification floods.
49. As a user, I want collapse/dedup behavior for push notifications, so that my notification tray does not show obsolete copies.
50. As a user, I want notification rows to deep-link to the relevant work after auth, so that I land in the right project, card, DM, approval, agent, issue, or cost view.
51. As a user, I want mark-read state to sync between in-app notifications and push-open behavior, so that counts remain honest.
52. As a user, I want dismissed notifications to stop reappearing unless the underlying event changes, so that clearing noise is respected.
53. As a reviewer, I want approval-needed prompts to be push-capable when enabled, so that review bottlenecks are visible.
54. As a reviewer, I want approval payload details hidden from push, so that lock screens do not reveal business or runtime detail.
55. As a project member, I want DMs and mentions to support Web Push when enabled, so that directed collaboration reaches me while away.
56. As a project member, I want muted rooms to suppress ordinary room push, so that background delivery follows room preferences.
57. As a project member, I want assistant completions to notify me when I requested the work, so that I know when output is ready.
58. As an agent manager, I want agent run failed and agent offline notifications to be push-capable, so that operational issues reach owners quickly.
59. As a billing admin, I want budget threshold and budget exceeded notifications to respect push preferences, so that spend risk is visible.
60. As a platform operator, I want critical admin alerts to appear in notification center and eligible push, so that incidents are actionable.
61. As a platform operator, I want alert rule delivery channels to include Web Push where allowed, so that rules match user/device capability.
62. As a platform operator, I want alert rules to respect severity, cooldown, and escalation, so that push delivery is not noisy.
63. As a platform operator, I want push failures and suppressions observable, so that delivery problems can be investigated without exposing payload detail.
64. As a developer, I want subscription bind, rotate, disable, revoke, prune, and enqueue behavior tested at application-service seams, so that edge cases are protected.
65. As a developer, I want service-worker cache behavior tested by external behavior, so that the app shell and offline gate work without coupling tests to implementation internals.
66. As a developer, I want fetch-on-open authorization tested, so that notification ids cannot reveal details without access.
67. As a developer, I want preference resolution tested once at the highest notification policy seam, so that channels do not diverge.
68. As a designer, I want a net-new install and push permission screen, so that Settings does not carry all onboarding burden.
69. As a designer, I want a net-new offline auth-required gate, so that privileged offline UX is explicit and calm.
70. As a designer, I want iOS caveat states represented in the mockups, so that users understand installed-PWA-only push.
71. As a screen-reader user, I want install status, permission status, push channel checkboxes, quiet-hours fields, alert rules, and offline gates to have semantic labels, so that PWA controls are accessible.
72. As a keyboard user, I want install prompts, permission requests, device rows, notification routing matrix, and alert rules to work without a mouse, so that setup is operable.
73. As a mobile user, I want Settings notification controls to fit without table overflow or hidden actions, so that push preferences can be managed on small screens.
74. As an offline mobile user, I want cached shell and auth gate text not to overlap or trap focus, so that recovery is usable.
75. As a privacy-conscious user, I want Opzava to explain that push notifications fetch details on open, so that background delivery feels safer.
76. As a privacy-conscious user, I want to disable all background notifications while keeping in-app notifications, so that I can avoid lock-screen exposure.
77. As an admin, I want notification preferences to be per-user and not workspace-wide by default, so that personal attention settings remain personal.
78. As an admin, I want workspace alert defaults for new users, so that critical operational notifications have sane starting routes.
79. As an admin, I want user preferences to remain within policy ceilings, so that mandatory critical/admin alerts cannot be silently disabled where policy disallows it.
80. As a product operator, I want every PWA/push surface to render supported, unsupported, denied, promptable, granted, installed, not installed, stale, offline, forbidden, and retry states, so that platform reality is explicit.

## UX walkthrough mapping each named mockup screen

| Mockup | Required UX mapping |
| --- | --- |
| `settings.html` | The existing Settings Notifications panel remains the primary preference-management surface. Extend it from 3 channels to include Web Push as a first-class delivery channel alongside In-app, Email, and Slack. Preserve Default alert channel, Digest frequency, Quiet hours start/end, notification routing matrix, Group similar events, Mention owners on blocked work, Send weekend summaries, Save notification settings, and Send test alert. Add browser/device permission state, installed-app state, per-device push enablement, a Send test push action, blocked-permission recovery, and iOS installed-PWA-only caveat copy. The routing matrix must cover DMs, mentions, assistant completions, approval requested, agent run failed, task completed, task assigned, budget threshold/exceeded, incident/admin-card alert, and digest categories. Settings must save only user preferences and policy-compliant defaults; it must not directly bind subscriptions without the authenticated server handshake. |
| `notifications-alerts.html` | The Alerts & notifications page remains the active notification center and alert-rule surface. Preserve unread counts, severity tabs, notification rows, actions, mark all read, empty/loading/error states, alert rules table, enabled switches, severity badges, delivery-channel hint, live regions, and toast semantics. Extend delivery channel display to include Web Push when a rule or event is push-eligible. Notification rows opened from a push must fetch details through normal auth and update durable read state. Alert rules must show whether Web Push is eligible, suppressed by user/device preference, suppressed by quiet hours, or blocked by platform capability. Toasts and live regions are in-app only; Web Push must use safe payload hints and collapse/dedup keys. |

Net-new screens to design:

- PWA install prompt/banner and install help screen for desktop, Android, and iOS Home Screen instructions.
- PWA update-available prompt with refresh now/later states.
- Offline shell/auth-required gate for privileged routes when `/api/auth/session` cannot be reached.
- Offline public shell states for login, password reset, invite landing, status, install help, and safe unavailable messaging.
- Push permission onboarding screen with browser support, permission prompt, blocked/denied recovery, and installed-PWA-only iOS copy.
- Device notification management screen or drawer listing current browser/device subscriptions, last seen, permission state, platform, session-bound status, test action, and disable action.
- Push delivery diagnostics drawer for user-visible suppressed reasons such as quiet hours, muted channel, permission denied, device disabled, not installed on iOS, expired session, or tenant suspended.
- Notification preference detail drawer for event-specific routing, severity override, digest behavior, quiet-hours bypass policy, and channel fallback.

## Functional requirements

### PWA install and manifest

- App Shell must ship a valid web app manifest with Opzava name, short name, description, start URL, scope, display mode, theme/background colors, orientation policy where needed, and complete icon set.
- Manifest values that vary by deployment or tenant branding must be generated server-side or configured through safe app settings without exposing secrets.
- The app must register a service worker only in supported secure contexts.
- Install prompts must render only when the browser/platform supports the required install path or when platform-specific instructions are applicable.
- iOS/iPadOS UX must state that Web Push requires Opzava to be added to the Home Screen as an installed PWA on supported versions; normal browser tabs must not be presented as push-capable.
- The installed app start URL must recover session state through normal server session validation and must not encode credentials.
- The service worker update flow must support a clear update-available state and a user-controlled refresh path for already-open work.
- Installability must not depend on OpenClaw Gateway availability.
- Installation state is a client/platform capability hint only; it is not an authorization factor.

### Service worker cache and offline shell

- The service worker must precache versioned static shell assets needed to render the app frame, offline gate, install help, login/reset/invite/status shell, and safe error states.
- Runtime caching must be limited to safe public assets and explicitly allowed auth-neutral responses.
- Authenticated API responses must not be cached as offline truth unless the response is specifically designed as redacted, non-sensitive, and safe to show without current authorization.
- Privileged routes opened while offline must render an auth-required gate until `/api/auth/session` succeeds.
- Offline privileged gates must explain that Opzava cannot confirm the session while offline and must avoid implying data loss or successful sign-out.
- When network returns, the app must call `/api/auth/session` and re-check authorization before rendering privileged content.
- Session-expired, revoked, role-changed, tenant-suspended, and project-forbidden responses after reconnect must clear privileged UI state and route to the correct auth/forbidden state.
- Cached public surfaces must include loading, offline, retry, and unavailable states.
- Offline states must not show sensitive notification titles, message snippets, approval payloads, customer PII, financial data, raw log text, runtime refs, or secrets.
- Any redacted last-known surface must show freshness and stale/offline status and must be replaced after successful server revalidation.
- Offline mutations for chat, approvals, cards, settings, push preferences, alert rules, tickets, and agent dispatch are out of scope and must not be queued as successful commands.
- The service worker must not inspect cookies, construct auth headers, or store session tokens.

### Push subscription lifecycle

- Push permission and subscription creation must be initiated by authenticated browser window code, not by a service worker acting alone.
- Before binding a subscription, the server must validate the normal httpOnly-cookie-backed session through `AuthPort`.
- The server must issue a one-time binding token derived from the validated session and nonce according to ADR-006.
- The subscription bind endpoint must validate and consume the binding token, reject replay, and bind the subscription server-side to session, user, org, device, and subscription hash.
- Stored push subscription data must include endpoint hash, subscription hash, user id, org id, session id or session ref, device id, browser/platform metadata, created/last-seen timestamps, expiration/rotation state, permission state, disabled state, and audit metadata.
- Raw push endpoint and browser key material must be stored only as needed by `PushNotificationPort`; derived lookup fields must use hashes.
- Subscription rotation must update the existing device binding where possible and audit old/new subscription hashes.
- Permission revocation, browser unsubscribe, endpoint `404`/`410`, repeated provider failure, logout, logout-all-devices, password reset, role/membership change, org removal, MFA enforcement failure, tenant suspension, and device disablement must suppress or revoke the binding as appropriate.
- Multiple browsers/devices per user are allowed, each with independent subscription and preference state.
- The user must be able to disable push for one device without disabling in-app notifications or other devices.
- The system must support sending a test push that exercises the same eligibility and payload-safety path as ordinary notifications.
- Push lifecycle events must write audit/outbox records without storing sensitive payload content.

### Push enqueue, payload, and fetch-on-open

- Notification producers must create notification intents or rows through Notifications/Admin-Observability or the owning context's notification path.
- Enqueue must resolve user preference, event type, severity, quiet hours, digest policy, channel mute state, device state, browser permission, installed-PWA caveat, tenant lifecycle, session state, membership version, role state, and subscription state before delivery.
- Enqueue must drop or suppress delivery when the session is revoked/expired, membership version is stale, role no longer authorizes the source, tenant is suspended, device is disabled, subscription is dead, user preference disables push, channel mute suppresses ordinary delivery, or platform capability is absent.
- Critical/admin policies may bypass quiet hours only when product policy explicitly allows it.
- Push payloads must include only notification id, coarse type, safe org/project hint where needed for routing, collapse/dedup key, timestamp, and fetch-on-open instruction.
- Push payloads must not include message bodies, ticket content, approval details, customer PII, financial values beyond safe threshold labels, raw logs, runtime refs, provider payloads, secrets, or tokens.
- Opening a push notification must route through a server endpoint or app route that validates `/api/auth/session`, calls `AuthorizationPort` for the target resource, and fetches current details.
- If authorization fails on push open, the app must show a safe forbidden, sign-in, expired, or unavailable state instead of the notification detail.
- Push open should mark the notification read only after a successful authenticated read or explicit policy-approved open event.
- Duplicate push deliveries must be harmless through notification id and collapse/dedup key handling.
- Delivery failures, suppressions, dead endpoints, and pruning must be observable to admins in aggregate without exposing sensitive payloads.

### Notification preferences and device controls

- Notification preferences must be per-user and scoped to the active organization where appropriate.
- Preference categories must include at least DMs, mentions, assistant completions, approval requested, task assigned, task completed, agent run failed, agent offline, budget threshold, budget exceeded, incident/admin-card alert, issue/remediation update, digest, and product/update notices.
- Delivery channels must include In-app, Web Push, Email, Slack where configured, and Digest where applicable.
- Preferences must support default channel, digest frequency, quiet-hours start/end, quiet-hours timezone, weekend summaries, group similar events, event-specific routing, severity override where allowed, and per-device push enablement.
- Preferences must distinguish user choice from workspace policy defaults and mandatory policy floors.
- Workspace defaults may seed new-user preferences but must not overwrite existing user preferences without explicit policy.
- Preference saves must be authorized, audited, and idempotent.
- Notification routing must resolve per-channel mute state and direct mention/DM priority consistently with Internal Collaboration rules.
- Browser permission denied/blocked/default/granted must be visible in Settings.
- Unsupported browsers and unsupported platform modes must show disabled controls with an explanation.
- iOS not-installed state must show Web Push unavailable until running as installed PWA.
- Send test alert and send test push must respect current permission/device/preference state and report suppressed reasons.

### In-app notifications, alert rules, and counts

- Notification center rows must remain durable Opzava records with unread/read, severity, source, safe summary, time, and primary action.
- Notification bell count must reconcile from durable state after reconnect and must not depend solely on push delivery.
- Mark read, mark all read, dismiss, and push-open read updates must update durable notification state.
- Alert rules must include delivery-channel eligibility, including Web Push when configured and supported.
- Alert rules must show suppressed delivery reasons where useful: quiet hours, cooldown, disabled rule, disabled channel, disabled device, unsupported browser, iOS not installed, tenant suspended, session invalid, or preference disabled.
- In-app toasts and ARIA live regions remain separate from Web Push; they must not be used as proof of background delivery.
- Notification center and Settings must render loading, empty, error, offline/reconnecting, forbidden, stale, unsupported, permission denied, and retry states.

### Security, privacy, and audit

- `AuthPort` session validation remains the only way to read authenticated session state from browser/window flows.
- `AuthorizationPort` must protect all preference mutations, notification detail fetches, push-open target reads, device disablement, and alert-rule mutations.
- Service workers must never be granted a parallel credential surface.
- Push payloads, subscription logs, audit rows, diagnostics, and dead-letter records must be redacted and must not store secrets.
- Subscription endpoint hashes and device metadata must be treated as privacy-sensitive operational data.
- Device disablement, subscription bind, rotation, revoke, prune, failed bind, test push, and preference mutation must write audit/security telemetry.
- Tenant-scoped repositories and RLS expectations from ADR-007 apply to subscriptions, preferences, notifications, and alert rules.
- Missing tenant or user context must fail closed with 403 or auth-required behavior, not an empty successful page.

## Data and API touchpoints

| Surface | Owning bounded context | Primary data/API touchpoints | Ports |
| --- | --- | --- | --- |
| Web app manifest | App Shell with Tenant Provisioning/Platform-Ops inputs | App name, short name, icons, theme, scope, start URL, deployment-safe branding | None for static manifest; `AuthorizationPort` only for tenant-admin branding mutations |
| Service-worker registration/update | App Shell | Build version, asset manifest, cache version, update-available state, offline fallback route | None for static assets; `EventBusPort` only for update telemetry where needed |
| Public offline shell | App Shell with Identity & Access | Cached login/reset/invite/status/install shells, offline/unavailable states, retry affordance | `AuthPort` for reconnect session probe |
| Privileged offline gate | Identity & Access with App Shell | `/api/auth/session`, auth-required gate, revoked/expired/forbidden routing, membership version freshness | `AuthPort`, `AuthorizationPort` |
| Push capability bootstrap | Notifications/Admin-Observability with Identity & Access | Browser support, permission state, installed-PWA state, VAPID public key, device metadata | `PushNotificationPort`, `AuthPort` |
| Binding-token issue | Identity & Access | Validated session, nonce, one-time binding token, replay metadata, audit | `AuthPort`, `EventBusPort` |
| Push subscription bind/rotate | Notifications/Admin-Observability with Identity & Access | Subscription endpoint/key material, endpoint hash, subscription hash, session/user/org/device binding, browser metadata, audit | `PushNotificationPort`, `AuthPort`, `AuthorizationPort`, `EventBusPort` |
| Push subscription revoke/prune | Notifications/Admin-Observability with Identity & Access | Disabled device, logout-all-devices, password reset, role/membership change, tenant suspension, provider `410`/failure, audit | `PushNotificationPort`, `AuthPort`, `EventBusPort` |
| Device notification management | Identity & Access with Notifications/Admin-Observability | Device id, browser/platform label, permission state, last seen, push enabled/disabled, test action | `AuthPort`, `AuthorizationPort`, `PushNotificationPort`, `EventBusPort` |
| User notification preferences | Notifications/Admin-Observability | Per-event/channel matrix, Web Push enablement, quiet hours, digest frequency, weekend summaries, grouping, policy floors, audit | `AuthorizationPort`, `EventBusPort` |
| Channel mute and directed collaboration preferences | Internal Collaboration with Notifications/Admin-Observability | Channel membership preference, DM/mention priority, mute state, room/project context | `AuthorizationPort`, `RealtimeTransportPort`, `EventBusPort` |
| Notification row creation | Notifications/Admin-Observability with source contexts | Notification id, actor/source refs, type, severity, safe summary, read state, target route, outbox | `EventBusPort`, `RealtimeTransportPort`, `AuthorizationPort` |
| Push enqueue and delivery | Notifications/Admin-Observability | Eligibility decision, preference resolution, session/device/subscription check, collapse key, safe payload, delivery result | `PushNotificationPort`, `AuthPort`, `AuthorizationPort`, `EventBusPort` |
| Push fetch-on-open | Notifications/Admin-Observability with target owning context | Notification id, target resource ref, current session, authorization decision, mark-read/update | `AuthPort`, `AuthorizationPort`, `EventBusPort` |
| Alert rules and delivery routes | Notifications/Admin-Observability | Rule, condition, severity, channel eligibility, cooldown, enabled state, suppressed reasons | `AuthorizationPort`, `PushNotificationPort`, `EventBusPort` |
| Runtime/agent notification sources | AI Workforce and gateway-broker projections | Assistant completion, agent offline, agent run failed, approval-needed prompt, task assignment/completion | `OpenClawGatewayPort`, `RealtimeTransportPort`, `EventBusPort` |
| Project/task notification sources | Project Management and Department Workflows | Card assignment, blocked work, project update, approval request, campaign/workflow event | `AuthorizationPort`, `EventBusPort` |
| Budget and incident notification sources | Finance/Billing and Notifications/Admin-Observability | Budget threshold/exceeded, usage alert, incident/admin-card alert, remediation update | `AuthorizationPort`, `EventBusPort`, `PushNotificationPort` |
| Push delivery diagnostics | Notifications/Admin-Observability | Suppressed reason, delivery attempt metadata, provider result, dead endpoint, aggregate delivery status | `PushNotificationPort`, `EventBusPort` |

## OpenClaw-parity notes

| Capability | Native harnessed vs Opzava-owned |
| --- | --- |
| PWA install and manifest | Opzava-owned App Shell behavior. OpenClaw has no install or browser manifest authority. |
| Service worker and offline shell | Opzava-owned. The service worker caches web assets and public/auth-neutral shells only; it does not query OpenClaw or authenticate users. |
| Auth-required offline gate | Opzava-owned through ADR-006 `AuthPort` and `AuthorizationPort`. OpenClaw is not involved in proving browser session state. |
| Web Push subscription binding | Opzava-owned through Notifications/Admin-Observability and Identity & Access. ADR-006 server-side push-to-session binding is mandatory because service workers cannot read httpOnly cookies. |
| Web Push delivery adapter | Hybrid only at the adapter level: Web Push/VAPID is the first `PushNotificationPort` adapter; native FCM/APNs can be added later behind the same port. |
| Notification preferences | Opzava-owned user/device/event policy. OpenClaw channel/runtime settings do not decide browser push preference. |
| Internal chat, DMs, mentions, read state | Opzava-owned Internal Collaboration. OpenClaw Agent Sessions are not internal chat storage. |
| Assistant completions and runtime alerts | Hybrid. OpenClaw runtime events are harnessed through the broker ACL and projected into Opzava notifications; Opzava owns delivery policy and payload safety. |
| Agent offline, task failures, usage/cost, diagnostics | OpenClaw-native observations where applicable, harnessed through `OpenClawGatewayPort` and projections. Opzava owns notification rows, alert rules, and push delivery. |
| Alert rules | Opzava-owned Notifications/Admin-Observability. Runtime data may trigger rules, but rules, cooldowns, delivery channels, and audit live in Opzava. |
| Sensitive notification detail | Opzava-owned fetch-on-open flow. Push never carries raw OpenClaw logs, runtime refs, tool payloads, transcripts, or secrets. |
| iOS installed-PWA caveat | Web-platform constraint surfaced by Opzava UX. No OpenClaw involvement. |

## Acceptance criteria

- Opzava exposes a valid production web app manifest with correct name, icons, scope, start URL, display mode, and theme.
- Supported desktop/mobile browsers can install Opzava through native prompt or documented platform instruction.
- iOS/iPadOS Web Push controls clearly state the installed-PWA/Home Screen requirement and do not present browser tabs as push-capable.
- The service worker registers only in secure supported contexts.
- Cached shell assets allow the app to render an Opzava offline shell when the network is unavailable.
- Public/auth-neutral surfaces such as login/reset/invite/status/install help can render from cache with offline states.
- Privileged routes opened offline show an auth-required gate rather than cached sensitive content.
- Reconnect calls `/api/auth/session` before privileged content is shown.
- Revoked, expired, role-changed, tenant-suspended, or forbidden sessions after reconnect fail closed.
- Service worker code does not read cookies, store bearer credentials, or create authenticated headers.
- Authenticated API responses are not cached as sensitive offline truth.
- A user can enable Web Push only after a valid authenticated server-mediated binding flow.
- Push subscription binding stores session/user/org/device/subscription metadata and audit, not plaintext lookup tokens.
- Binding-token replay is rejected.
- Subscription rotation updates the binding and audits the rotation.
- Logout-all-devices, password reset, org removal, role/membership change, MFA enforcement failure, tenant suspension, device disablement, and provider dead-endpoint responses suppress or revoke push delivery as appropriate.
- Push enqueue re-checks session, membership version, role state, tenant lifecycle, device state, subscription state, and preferences.
- Push payloads contain only safe hints and fetch-on-open instructions.
- Opening a push notification fetches details only after normal session validation and authorization.
- Forbidden or expired push-open targets show safe auth/forbidden/unavailable states.
- Users can configure Web Push, in-app, email, Slack, digest, quiet hours, grouping, and event-specific preferences.
- Users can disable push on one device without disabling other notification channels or devices.
- Settings shows browser permission state, installed-PWA state, and suppressed reasons for push controls.
- Send test push follows the same eligibility path as ordinary push and reports success or suppression.
- Notification center unread/read state reconciles after push open, mark read, mark all read, and reconnect.
- Alert rules can show Web Push as an eligible delivery channel and explain suppressed delivery when applicable.
- Notification center and Settings render loading, empty, error, offline/reconnecting, forbidden, stale, unsupported, permission denied, blocked, and retry states.
- No push, audit, diagnostics, or dead-letter record stores sensitive notification payload content.

## Testing decisions

- Test external behavior at the highest seams: service-worker registration/installability checks, offline shell route behavior, session-probe gate, push subscription application service, preference policy resolver, enqueue/delivery service, fetch-on-open route, and Settings/Notifications UI composition.
- Do not test browser internals, service-worker implementation details, Better Auth internals, Web Push provider internals, VAPID cryptography internals, or OpenClaw runtime internals directly.
- Add installability tests for manifest presence, required fields, icon references, scope/start URL, secure-context registration guard, and update-available UX state.
- Add offline behavior tests proving public/auth-neutral shells render while privileged routes show auth-required gate until `/api/auth/session` succeeds.
- Add reconnect tests proving expired/revoked/forbidden/tenant-suspended responses clear privileged UI and route to safe states.
- Add cache-safety tests proving sensitive authenticated responses, notification details, approval details, logs, customer data, and runtime refs are not available as offline truth.
- Add subscription lifecycle tests for bind, replay rejection, rotate, disable device, unsubscribe, dead endpoint prune, logout-all-devices, password reset, role change, org removal, MFA enforcement, and tenant suspension.
- Add enqueue tests proving delivery suppression for disabled preference, quiet hours, mute state, unsupported platform, iOS not installed, permission denied, disabled device, stale session, stale membership version, revoked role, tenant suspension, and dead subscription.
- Add payload tests proving push contains only notification id, coarse type, safe hints, collapse/dedup key, and fetch-on-open instruction.
- Add fetch-on-open tests proving details require `AuthPort` session validation and `AuthorizationPort` target authorization.
- Add preference tests for per-event/channel matrix, Web Push per-device enablement, digest frequency, quiet hours, critical bypass policy, grouping, and workspace default seeding.
- Add UI tests for `settings.html` notification preferences, device permission state, iOS caveat, test push suppression, and save behavior.
- Add UI tests for `notifications-alerts.html` severity tabs, unread/read state, Web Push delivery-channel labels, alert-rule suppression labels, loading/empty/error states, and ARIA live/toast semantics.
- Reuse PRD-004 Internal Collaboration notification and push tests where they cover DMs, mentions, channel mute, read state, and push-safe payloads.
- Reuse PRD-012 alert-rule and notification-center tests where they cover severity, alert routes, notification rows, mark-read, and delivery-channel rules.
- Reuse PRD-001/ADR-006 auth tests where they cover revocable sessions, logout-all-devices, role/membership change invalidation, and `/api/auth/session`.
- Do not run project build/test/lint as part of this PRD drafting task.

## Dependencies

- ADR-006 for Better Auth boundaries, revocable DB sessions, `/api/auth/session`, service-worker/httpOnly-cookie constraint, one-time push binding handshake, no two-cookie split, session revocation, and push-to-session binding.
- ADR-009 for realtime notifications, `PushNotificationPort`, `RealtimeTransportPort`, Web Push/VAPID first adapter, safe push payloads, fetch-on-open behavior, and PWA/offline gates.
- ADR-007 for resource authorization, role/membership changes, tenant-scoped repositories, and fail-closed behavior.
- PRD-001 for login/reset/invite auth surfaces, session UX, MFA/passkey policy, and revocation behavior.
- PRD-002 for app shell/navigation, cached shell routing, notification bell placement, and global offline/reconnecting shell states.
- PRD-004 for Internal Collaboration notification sources, DMs, mentions, channel mute, read state, and Web Push delivery expectations.
- PRD-005 for assistant completion and Ask Opzava notification sources.
- PRD-012 for alert rules, notification center, severity, admin alerts, safe alert payloads, and observability diagnostics.
- PRD-014 for budget threshold/exceeded notification sources and billing-state/tenant-suspension effects.
- Browser platform support for service workers, web app manifests, Notification API, Push API, and VAPID Web Push.
- Net-new design work for install prompt/help, push permission onboarding, offline auth-required gate, device management, iOS caveat, and push diagnostics before implementation beyond backend/API foundations.
