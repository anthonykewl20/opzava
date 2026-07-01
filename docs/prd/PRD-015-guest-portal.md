# PRD-015: External guest-client portal and project-scoped magic links

## Problem

Opzava needs a way for external clients to inspect project progress and raise narrowly scoped support requests without becoming Organization members or seeing internal work.

Today the auth and project PRDs acknowledge Guest-Clients, but the product contract is not complete enough to implement safely. If this slice drifts, the most likely failures are severe:

- A client could be invited through the normal member flow and accidentally receive Organization membership, internal chat, Ask Opzava, project knowledge, settings, billing, CRM, or runtime-control access.
- A project magic link could become a reusable bearer credential with unclear expiry, no audit trail, or no binding to the intended external identity.
- Support tickets raised from a client portal could bypass CRM `Contact`/`ChannelIdentity` resolution and create raw external ids in product tables.
- Project read-only surfaces could leak internal comments, AI run details, card evidence, docs, customer data, costs, approvals, or private project tools.
- Designers could assume the existing member invite page covers Guest-Clients, even though most guest screens are net-new and the access model is materially different.

The solution is an external Guest-Client portal owned by Identity & Access, Project Management, and CRM/External Channels. Guest access is granted only through per-project scoped magic links with TTL 24h, single-use consumption, audit, and no Organization membership. Accepting a magic link creates or refreshes an `ExternalIdentity` bound to exactly one Project and one intended external identity/email. The portal exposes a limited read-only project view plus a narrow support-ticket resource. ADR-006, ADR-007, and ADR-011 set the invariants; this PRD defines the product requirements without restating architecture.

## Goals and Non-goals

### Goals

- Ship project-scoped Guest-Client magic links with TTL 24h, token-hash storage, single-use acceptance, intended email/external identity binding, audit, and clear expired/used/wrong-recipient states.
- Ensure Guest-Clients never become Better Auth Organization members and never receive Opzava `Membership`.
- Create or refresh an `ExternalIdentity` row on acceptance, bound to exactly one Organization-owned Project and one external identity/email.
- Authorize Guest-Clients through ADR-007 external-guest policy and `AuthorizationPort`, not provider org roles or member invite shortcuts.
- Provide a limited external portal surface: read-only project overview, safe project status/timeline, client-visible cards/milestones/files, and a narrow support-ticket resource.
- Allow Guest-Clients to create and view support tickets for the bound project only, with limited fields, attachments, and comments that are explicitly client-visible.
- Connect portal support tickets to CRM/External Channels using ADR-011 identity rules, `Contact`/`UnknownContact` shells where needed, `ChannelIdentity`, and audited activity.
- Keep guest portal UX separate from internal project, chat, docs, Ask Opzava, admin, billing, settings, knowledge, and runtime-control surfaces.
- Map the existing `essential-accept-invite.html` mockup as member-invite prior art and identify net-new guest screens to design.
- Define data/API touchpoints by owning bounded context and ports.
- Define OpenClaw-parity boundaries: Opzava owns guest identity, portal policy, project projections, and tickets; OpenClaw is used only through existing ACL-owned runtime/channel capabilities where applicable.
- Define acceptance and testing decisions for security, authorization, single-use links, scoped portal behavior, and support-ticket lifecycle.

### Non-goals

- Build full customer-account portal, community portal, knowledgebase browsing, billing portal, invoice payment, contract management, or external deal room.
- Give Guest-Clients Organization membership, Better Auth organization roles, internal `Membership`, project-member role grants, or access to member-only auth/profile surfaces.
- Let Guest-Clients use internal chat, project Team room, DMs, Ask Opzava, Ask Admin Opzava, internal notifications, app shell settings, billing, admin boards, debug/monitoring, knowledge management, agent roster, or runtime controls.
- Expose raw OpenClaw sessions, transcripts, Workboard cards, task refs, logs, usage/cost, tools, approval queues, channel credentials, Gateway refs, or agent memory.
- Store plaintext magic-link tokens, provider secrets, channel credentials, raw external sender ids in ordinary project/ticket rows, or browser-chosen external identity proof.
- Replace PRD-001 member invitations, PRD-003 project management, PRD-010 CRM/support, or ADR-011 external channel identity.
- Build enterprise SSO, SCIM, domain capture, or external-customer account administration.
- Publish issues, call `gh`, or change issue-tracker triage labels.

## User Stories

1. As a project manager, I want to invite an external client to one project, so that they can follow progress without becoming a workspace member.
2. As a project manager, I want the guest invite to show the target project, intended email, role, expiry, and client-visible capabilities, so that I understand the access being granted.
3. As a project manager, I want guest links to expire after 24 hours, so that stale client links cannot be used later.
4. As a project manager, I want guest links to be single-use, so that a forwarded accepted link cannot be replayed.
5. As a project manager, I want to revoke a pending guest link, so that an accidental invite can be stopped before acceptance.
6. As a project manager, I want to revoke active guest access, so that a former client contact loses access to the project portal.
7. As a project manager, I want revocation audited, so that client access history is explainable.
8. As a project manager, I want guest access to be project-scoped, so that the client cannot see sibling projects.
9. As a project manager, I want guest access to be read-only by default, so that the client cannot move cards, edit docs, change goals, assign people, or dispatch AI work.
10. As a project manager, I want to mark specific project records client-visible, so that internal-only work stays hidden.
11. As a project manager, I want the portal to hide internal comments and private evidence, so that client access does not leak team discussion.
12. As a project manager, I want guest access to work even when the client is not a normal Opzava user, so that client collaboration does not require workspace onboarding.
13. As a security reviewer, I want accepting a guest link to create or refresh `ExternalIdentity`, not `Membership`, so that external identity and organization membership cannot be confused.
14. As a security reviewer, I want magic-link tokens stored only as hashes, so that database reads cannot recover usable links.
15. As a security reviewer, I want guest acceptance to validate token hash, project, org, intended email, TTL, single-use state, revocation, and tenant lifecycle in one transaction, so that stale or tampered links fail closed.
16. As a security reviewer, I want provider callbacks and browser payloads to grant nothing by themselves, so that client-supplied identifiers cannot create access.
17. As a security reviewer, I want every portal read to call `AuthorizationPort`, so that guest scope is enforced consistently.
18. As a security reviewer, I want missing tenant/project context to return 403, so that authorization bugs are visible rather than empty states.
19. As an external client, I want an invite landing page that names the project and inviter, so that I know why I received the link.
20. As an external client, I want the email address locked to the invite, so that I cannot accidentally accept someone else's project access.
21. As an external client, I want clear expired-link messaging, so that I know to request a fresh link.
22. As an external client, I want clear used-link messaging, so that I understand a single-use link cannot be accepted twice.
23. As an external client, I want wrong-recipient messaging, so that I do not continue under the wrong identity.
24. As an external client, I want acceptance to be fast and calm, so that I can reach the project portal without learning internal Opzava concepts.
25. As an external client, I want the portal to show the project name, client-facing description, current status, next milestone, and last client-visible update, so that I can understand progress quickly.
26. As an external client, I want to see only client-visible cards or milestones, so that I am not exposed to internal backlog noise.
27. As an external client, I want to open a client-visible work item, so that I can read summary, status, due date, attachments, and latest approved update.
28. As an external client, I want AI-generated text or summaries to be shown only after they are approved for client visibility, so that draft/internal AI output is not exposed.
29. As an external client, I want files and attachments to be limited to client-visible assets, so that I see deliverables without internal evidence.
30. As an external client, I want project timeline entries to be filtered to client-safe activity, so that I can follow progress without internal audit details.
31. As an external client, I want to download or preview allowed files, so that I can review deliverables.
32. As an external client, I want forbidden items to be absent or show a clear forbidden state, so that broken links do not imply missing work.
33. As an external client, I want the portal to be mobile-friendly, so that I can review status from a phone.
34. As an external client, I want accessible buttons, tables, activity rows, and forms, so that assistive technology works in the portal.
35. As an external client, I want to create a support ticket from the project portal, so that I can ask for help about the project.
36. As an external client, I want a support ticket form with subject, description, priority where allowed, category, and attachments, so that my request has enough context.
37. As an external client, I want the ticket form to associate the ticket with the current project automatically, so that I cannot choose another project.
38. As an external client, I want to view my portal support tickets for the bound project, so that I know what is open or resolved.
39. As an external client, I want to add client-visible comments and attachments to my ticket, so that I can provide follow-up information.
40. As an external client, I want to see status changes such as New, In review, Waiting on client, In progress, Resolved, and Closed, so that support progress is clear.
41. As an external client, I want to reopen or reply to a resolved ticket only where policy allows, so that closed issues can be handled deliberately.
42. As an external client, I want ticket notifications by email or link-refresh only where supported, so that I can return to the ticket safely.
43. As a support agent, I want portal tickets to become CRM `Ticket` records, so that external portal support shares the same support workflow truth.
44. As a support agent, I want portal ticket creation to resolve or create a `Contact` or `UnknownContact` shell, so that every ticket has stable CRM identity.
45. As a support agent, I want the portal external identity to map through `ChannelIdentity` or equivalent external identity metadata, so that CRM resolution stays consistent with ADR-011.
46. As a support agent, I want portal comments to appear as CRM `Activity`, so that client communication is visible in the timeline.
47. As a support agent, I want internal ticket comments to stay hidden from the portal, so that support triage does not leak.
48. As a support agent, I want client-visible replies to be explicit, so that a note is never accidentally sent to the client.
49. As a support agent, I want support AI employees to draft replies under existing approval policy, so that portal tickets use the same governed support process as channel tickets.
50. As a support agent, I want ticket attachments scanned and policy-checked before internal or AI use, so that uploaded client files do not bypass safety rules.
51. As a support lead, I want portal tickets to show their source as Guest Portal, so that queues can separate portal requests from Slack, email, or WhatsApp.
52. As a support lead, I want portal tickets to carry project scope, so that routing, SLA, and reporting can filter by project.
53. As a support lead, I want guest access revocation not to delete CRM ticket history, so that support audit remains intact.
54. As a support lead, I want ticket visibility to update if guest access is revoked, so that the client can no longer open portal ticket pages.
55. As a CRM maintainer, I want external guest identities separated from contacts but linkable to them, so that access and customer identity remain distinct.
56. As a CRM maintainer, I want duplicate guest emails or external identities to be reviewed rather than silently merged across contacts, so that client identity stays conservative.
57. As an admin, I want guest activity audited, including link creation, acceptance, portal reads, ticket creation, comments, attachment downloads, and revocation, so that client access can be investigated.
58. As an admin, I want audit rows to include actor type and project scope, so that external actions are distinguishable from member actions.
59. As an admin, I want guest portal access to respect tenant lifecycle, so that suspended or deprovisioning tenants cannot keep serving privileged client views.
60. As an admin, I want guest portal access to respect project lifecycle, so that archived or deleted projects do not expose stale collaboration surfaces unless explicitly allowed.
61. As a product operator, I want guest portal screens to degrade when projections are stale, so that clients do not see misleading live status.
62. As a product operator, I want guest portal pages to avoid raw runtime reads, so that Gateway outages do not leak internal runtime failures.
63. As a product operator, I want portal rate limits on link acceptance, ticket creation, comments, and attachment upload, so that abuse is contained.
64. As a product operator, I want magic-link abuse telemetry, so that repeated invalid, expired, or wrong-recipient attempts can be investigated.
65. As a developer, I want guest session or portal-token state to be revocable and short-lived, so that accepted portal access can be terminated quickly.
66. As a developer, I want guest portal commands to carry idempotency keys, so that retries do not duplicate tickets or comments.
67. As a developer, I want external identity reads/writes isolated through tenant/project scoped repositories, so that missing scope fails closed under RLS.
68. As a developer, I want tests at invitation, acceptance, authorization, portal query, ticket command, and UI composition seams, so that the risky behavior is protected without coupling to provider internals.
69. As a designer, I want a clear list of net-new guest screens, so that member-invite mockups are not stretched beyond their purpose.
70. As a designer, I want the portal to use client-facing language instead of internal Opzava role words, so that external clients understand what they can do.
71. As a platform admin, I want guest access to be excluded from seat counts unless a future billing PRD explicitly changes it, so that external clients do not consume internal member licenses by accident.
72. As a platform admin, I want Guest-Client role grants to be project/external-identity scoped only, so that they cannot be escalated to Owner, Admin, Manager, or Member through member role flows.

## UX walkthrough mapping each named mockup screen

| Mockup | Required UX mapping |
| --- | --- |
| `essential-accept-invite.html` | This mockup is member-invite prior art, not the guest portal screen as-is. Reuse the calm auth-card pattern, Opzava mark, invite context block, locked email treatment, pending submit state, expired state, wrong-recipient state, and already-access state. The guest version must replace "Join workspace" language with project-specific external access language, show project name and inviter, show Guest-Client capability summary, omit Organization role/member copy, omit normal workspace setup language, and make clear that accepting grants access only to one project portal. The acceptance action consumes a 24h single-use project magic link and creates or refreshes `ExternalIdentity`, never `Membership`. |

Net-new screens to design:

- Guest magic-link acceptance page for one project, including valid, expired, used, revoked, wrong-recipient, already-has-access, tenant-unavailable, project-archived, and pending states.
- Guest portal shell with minimal branding, project title, client-facing status, last update, open support-ticket count, and sign-out/leave-access affordance where applicable.
- Read-only guest project overview showing client-visible status, milestones, cards, files, timeline, and next action.
- Guest work-item detail for client-visible card/milestone summary, approved updates, due/status, deliverables, attachments, and related support tickets.
- Guest file preview/download screen with client-visible file metadata, unavailable/removed states, and access-denied handling.
- Guest support-ticket list scoped to the project and external identity.
- Guest support-ticket create form with subject, description, category, allowed priority, attachment upload, privacy note, and submit pending state.
- Guest support-ticket detail with status, client-visible thread, attachments, waiting-on-client prompt, resolved/closed state, and reply/reopen policy.
- Internal project guest-access management panel for project managers/admins to create, resend, revoke, and audit project-scoped guest links and active external identities.
- Internal client-visibility controls on project records, cards, milestones, updates, files, and support-ticket replies.
- Internal audit view or drawer filtered to Guest-Client link and portal activity.

## Functional requirements

### Guest magic links and acceptance

- Identity & Access must own Guest-Client magic-link creation, acceptance, token lifecycle, external access audit, and external principal/session material.
- Guest magic links must be scoped to exactly one Organization-owned Project.
- Guest magic links must have a TTL of 24 hours from creation.
- Guest magic links must be single-use. Successful acceptance must consume the token in the same transaction that creates or refreshes external access.
- Guest magic-link tokens must be generated as high-entropy secrets and stored only as hashes.
- Magic-link acceptance must validate token hash, intended email or external identity binding, org id, project id, tenant lifecycle, project lifecycle, invitation status, TTL, single-use state, revocation state, inviter authority at creation where relevant, and RLS tenant context.
- Magic-link acceptance must create or refresh `ExternalIdentity` and external project access only. It must never create `Membership`, Better Auth Organization membership, member `RoleGrant`, or provider organization role.
- Guest access must be represented as a project-scoped external principal usable by `AuthorizationPort`.
- Already-accepted links must not create duplicate external identities, duplicate ticket access, or duplicate grants.
- Used, expired, revoked, tampered, wrong-recipient, tenant-suspended, project-archived, and project-not-found states must fail closed with safe user-facing copy.
- Browser-supplied project ids, org ids, email addresses, redirect targets, and external identity ids are hints only.
- Guest acceptance may issue a short-lived guest portal session or equivalent external principal binding, but it must be revocable and must not be a normal member web session.
- Guest portal sessions must be invalidated when the `ExternalIdentity` is revoked, project access is revoked, project lifecycle disallows access, tenant lifecycle disallows access, or policy changes make the session invalid.
- Guest links must be rate-limited by token hash, IP/device hints, project, and intended email hash where available.
- Link creation, resend, acceptance, failed acceptance, session creation, session revocation, and access revocation must write audit rows and outbox events.

### ExternalIdentity model and authorization

- Identity & Access must own `ExternalIdentity` as a project-scoped external client identity distinct from `User` and `Membership`.
- An `ExternalIdentity` must be bound to one `orgId`, one `projectId`, one intended email or external identity key, status, lifecycle metadata, created/accepted timestamps, last-seen timestamp, and audit refs.
- An `ExternalIdentity` must not be promoted to Organization membership in-place. Any future conversion to member access must use the normal member invitation flow and a separate explicit product decision.
- External identity status must include at least Pending, Active, Revoked, Expired, Suspended, ProjectArchived, and Deleted/Retained where policy requires.
- External Guest-Client authorization must use ADR-007 `AuthorizationPort` external-guest policy.
- Guest permissions must apply only to the bound Project and the explicitly supported guest resource set.
- Guest permissions must never apply to sibling projects, organization-wide resources, internal collaboration, Ask Opzava, knowledge search, agent roster, settings, billing, admin, debug, runtime controls, or raw CRM.
- Guest authorization must fail closed on missing tenant context, missing project context, missing external identity, revoked external identity, expired portal session, project mismatch, org mismatch, or unsupported resource/action.
- Project-scoped Guest-Client role grants must not be assignable through normal member role-grant UI.
- Audit and telemetry must label subject type as external/Guest-Client rather than member.

### Guest portal read-only project view

- Project Management must own guest-readable project projections.
- Guest portal reads must use prefiltered client-visible read models or server-side projections; clients must not receive internal fields and hide them in the browser.
- The read-only project overview must include project name, client-facing description, status, owner/contact display where allowed, last client-visible update, next milestone, visible cards/milestones, visible files, and open/resolved support-ticket summary.
- Guest-visible project records must be explicitly marked or projected as client-visible by authorized internal users or policy.
- Guest-visible cards/milestones must expose only safe fields such as title, client-facing summary, status, due/date window, approved update, deliverable refs, and linked client-visible ticket refs.
- Guest-visible timelines must include only approved project updates, client-visible file changes, visible milestone changes, and client-visible ticket activity.
- Guest portal must not expose internal comments, AI run traces, task dispatch state, OpenClaw Workboard refs, costs, approvals, quality review internals, private evidence, internal labels, internal project activity, hidden docs, or private files.
- Guest file access must be mediated by authorized server endpoints or signed object-store URLs with short expiry and no embedded secrets.
- Project archive, guest access revocation, tenant suspension, projection staleness, or deleted file states must render as explicit unavailable/forbidden/stale states.
- Guest portal UI must not expose Organization navigation, global search, project switcher, member profile, settings, app shell admin nav, internal notifications, or chat surfaces.
- Read-only means no create/update/delete for project records, cards, goals, to-dos, schedules, docs, discovery records, AI assignments, or comments outside the support-ticket resource.

### Narrow guest support-ticket resource

- CRM/External Channels must own Guest Portal support tickets as normal CRM `Ticket` records with a source of Guest Portal.
- Guest ticket creation must require an active `ExternalIdentity`, active project access, and `AuthorizationPort` permission for the guest ticket action.
- Guest ticket creation must associate the ticket with the bound project automatically. The guest cannot choose an arbitrary project or Organization.
- Guest ticket creation must resolve or create a CRM `Contact` or `UnknownContact` shell according to ADR-011 identity rules.
- Portal external identity metadata may contribute to `ChannelIdentity` or resolver evidence, but raw browser-supplied external ids must not bypass the resolver.
- Every guest ticket must reference tenant, project, `ExternalIdentity`, resolved-or-shell `ContactId`, optional `Account`, source Guest Portal, queue, status, priority policy, SLA policy where applicable, and audit.
- Guest ticket statuses exposed to clients must be a safe subset, such as New, In review, Waiting on client, In progress, Resolved, and Closed.
- Internal ticket statuses, queues, assignments, support AI drafts, approvals, and internal notes must remain hidden unless explicitly mapped to safe client-visible status or reply.
- Guest ticket comments must be explicitly client-visible and must append CRM `Activity`.
- Internal replies must require an explicit client-visible send/reply action before appearing in the portal.
- Guest attachments must use Object Store refs, virus/malware scanning or equivalent ingest policy, size/type limits, and authorization checks before internal display or AI use.
- Guest ticket create/comment/upload/reopen actions must be idempotent.
- Guest ticket reads must be limited to tickets connected to the bound project and external identity, plus any policy-approved shared ticket visibility for the same client identity.
- Revoked guest access must block future portal ticket reads and writes while preserving CRM ticket history and audit.
- Guest-created support tickets may link to `pm.Card` records for internal work, but portal users must see only client-visible ticket/card projections.

### Internal management and visibility controls

- Project managers/admins with permission must be able to create, resend, revoke, and inspect guest magic links for a project.
- Internal guest management must show pending links, expired links, used links, active external identities, last seen, ticket count, inviter, created time, accepted time, revoked time, and audit summary.
- Resend must create a new 24h single-use token rather than reusing a prior token.
- Revoking an active `ExternalIdentity` must invalidate guest portal sessions and prevent new reads/writes.
- Client-visible controls must exist for project updates, cards/milestones, files, and ticket replies before they can appear in the portal.
- Client-visible markings must be audited with actor, resource, previous visibility, new visibility, timestamp, and reason where supplied.
- Guest management must not expose plaintext tokens after link generation.
- Guest invite delivery must use the repo's eventual email/notification mechanism through ports/outbox, not direct ad hoc provider calls from UI code.

### Safety, privacy, and lifecycle states

- Guest portal data must be tenant-scoped and project-scoped in repositories and backed by ADR-007 RLS expectations.
- Guest portal must return 403 for authorization denial and must not convert missing tenant/project context into an empty healthy page.
- Guest portal must sanitize all displayed client-submitted content, filenames, descriptions, comments, and AI/customer text before rendering.
- Guest portal must not include sensitive push payloads or service-worker-only authentication assumptions.
- Guest portal sessions or refresh mechanisms must not use readable long-lived bearer credentials in browser storage.
- Guest activity must be included in audit/security telemetry and may feed Notifications/Admin-Observability for suspicious acceptance attempts, high ticket volume, repeated upload failures, or authorization-denial spikes.
- Tenant suspended, project archived, project deleted, external identity revoked, token expired, token used, object unavailable, projection stale, offline, and support unavailable states must be defined as normal UX states.

## Implementation decisions

- Model Guest-Client access as project-scoped external identity access, not as a variation of member invitation acceptance.
- Keep magic-link creation and acceptance in Identity & Access, with `ExternalIdentity` as the accepted access record and audit anchor.
- Use `AuthorizationPort` for every guest portal read and command; do not rely on Better Auth organization roles, provider callbacks, or browser-supplied ids.
- Keep Guest-Client project visibility as an allowlisted projection/read-model problem. Internal project fields are excluded server-side before response serialization.
- Use CRM/External Channels for guest support tickets so portal requests become normal `Ticket`, `Contact`/`UnknownContact`, `ChannelIdentity`, and `Activity` records under ADR-011.
- Treat guest portal support as the only write-capable guest resource in this PRD.
- Use Object Store refs and short-lived authorized downloads for guest-visible files and support attachments.
- Use outbox/audit events for guest link lifecycle, external identity lifecycle, portal activity, support-ticket activity, client-visible visibility changes, and suspicious failed attempts.
- Defer broader customer portal concepts, self-service knowledgebase, invoices, contracts, and account management to later PRDs.

## Data and API touchpoints

| Surface | Owning bounded context | Primary data/API touchpoints | Ports |
| --- | --- | --- | --- |
| Guest magic-link creation | Identity & Access with Project Management | Project, intended email/external identity, inviter authority, token hash, TTL 24h, status, audit/outbox | `AuthorizationPort`, `AuthPort`, `EventBusPort` |
| Guest magic-link delivery/resend | Identity & Access with Notifications | Delivery intent, redacted recipient, new token hash, expiration, audit, email/notification outbox | `EventBusPort` |
| Guest acceptance | Identity & Access | Token hash, project/org binding, intended email, TTL, single-use state, revocation, tenant/project lifecycle, `ExternalIdentity`, audit | `AuthPort`, `AuthorizationPort`, `EventBusPort` |
| Guest portal session/principal | Identity & Access | External principal, portal session/ref, external identity status, expiry/revocation, last seen, audit | `AuthPort`, `AuthorizationPort`, `EventBusPort` |
| ExternalIdentity lifecycle | Identity & Access | `ExternalIdentity`, project binding, status, accepted/revoked timestamps, last seen, retained/deleted state | `AuthorizationPort`, `EventBusPort` |
| Guest authorization | Identity & Access | External principal, action, resource descriptor, project/org match, guest policy, denial telemetry | `AuthorizationPort`, `EventBusPort` |
| Guest project overview | Project Management | Client-visible project projection, status, milestones/cards, updates, files summary, support summary | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort` where later supported |
| Guest work-item detail | Project Management | Client-visible card/milestone projection, approved updates, visible file refs, linked visible ticket refs | `AuthorizationPort`, `EventBusPort` |
| Guest file access | Knowledge Management/Object Store with Project Management | Client-visible file metadata, object ref, download authorization, expiry, audit/download event | `ObjectStorePort`, `AuthorizationPort`, `EventBusPort` |
| Client-visible controls | Project Management with CRM where needed | Visibility flags/projections for cards, milestones, updates, files, ticket replies, actor/reason audit | `AuthorizationPort`, `EventBusPort` |
| Guest ticket list/detail | CRM/External Channels | `Ticket`, source Guest Portal, project ref, `ExternalIdentity`, Contact, safe status, client-visible comments/attachments | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort` where later supported |
| Guest ticket creation | CRM/External Channels | Subject, body, category, priority policy, project binding, ExternalIdentity, Contact/UnknownContact, idempotency, audit | `AuthorizationPort`, `EventBusPort`, `ObjectStorePort` |
| Guest ticket comments | CRM/External Channels | Client-visible comment, attachment refs, `Activity`, idempotency, audit | `AuthorizationPort`, `EventBusPort`, `ObjectStorePort` |
| Contact resolution | CRM/External Channels | Contact, UnknownContact shell, ChannelIdentity/evidence, portal identity metadata, conservative resolver decisions | `AuthorizationPort`, `EventBusPort` |
| Support AI handoff | AI Workforce with CRM | Ticket assignment, Support `AgentEmployee`, draft/review/send policy, client-visible reply decision | `OpenClawGatewayPort`, `AuthorizationPort`, `EventBusPort` |
| Internal guest management | Project Management with Identity & Access | Pending/active/revoked guest links, active external identities, last seen, ticket count, audit summary | `AuthorizationPort`, `EventBusPort` |
| Audit/security telemetry | Identity & Access, Project Management, CRM, Notifications/Admin-Observability | Link lifecycle, acceptance failures, portal reads, downloads, tickets, comments, revocations, denials, suspicious attempts | `EventBusPort`, `AuthorizationPort` |

## OpenClaw-parity notes

| Capability | Native harnessed vs Opzava-owned |
| --- | --- |
| Guest identity and magic links | Opzava-owned in Identity & Access. OpenClaw has no guest identity authority and no role in accepting project magic links. |
| Guest authorization | Opzava-owned through ADR-007 `AuthorizationPort`, `ExternalIdentity`, and project-scoped guest policy. |
| Guest project portal | Opzava-owned read models and projections from Project Management. Browser clients do not live-query OpenClaw runtime. |
| Guest-visible files | Opzava-owned metadata and object-store authorization. Derived knowledge indexes and OpenClaw memory are not exposed to guests. |
| Support tickets | Opzava-owned CRM `Ticket`, Contact, Activity, and support workflow truth. |
| External channel identity | Opzava-owned CRM resolver model from ADR-011. Portal identity metadata may feed resolver evidence; raw external ids do not become ordinary domain fields. |
| Support AI drafts/replies | Hybrid. Opzava owns Ticket workflow, approval, and client-visible reply decisions; OpenClaw may execute Support `AgentEmployee` work through the broker ACL. |
| Runtime sessions, Workboard, tasks, logs, usage, tools, approvals | OpenClaw-native where relevant internally, but not exposed to Guest-Clients. Any internal support use is projected into safe CRM/project states before portal display. |
| Realtime and notifications | Opzava-owned portal policy. Realtime may later use `RealtimeTransportPort`; guest email/link refresh uses notification/outbox mechanisms. Push/session assumptions from member PWA flows do not grant guest access. |

## Acceptance criteria

- A project manager can create a Guest-Client magic link for one project and one intended email/external identity.
- The generated link expires exactly according to the 24h policy and cannot be revived.
- The stored token material is a hash; plaintext token is never persisted.
- Accepting a valid link consumes it once and creates or refreshes one `ExternalIdentity` for the intended project.
- Reusing an accepted link fails with a used-link state and does not create duplicate access.
- Expired, revoked, wrong-recipient, tampered, tenant-suspended, project-archived, and missing-project links fail closed.
- Successful guest acceptance creates no `Membership`, no Better Auth Organization membership, and no member-scoped `RoleGrant`.
- Guest portal reads are allowed only for the bound project and allowed resource set.
- Attempted guest access to sibling projects, Organization resources, internal chat, Ask Opzava, settings, billing, admin, knowledge search, agent roster, runtime controls, and hidden records returns forbidden behavior.
- The guest project overview displays only client-visible project status, updates, milestones/cards, files, and support-ticket summary.
- Internal comments, AI run traces, private files, costs, approvals, logs, Workboard refs, and raw runtime state do not appear in guest responses.
- A Guest-Client can create a support ticket scoped to the bound project.
- Guest support-ticket creation produces or links CRM `Ticket`, `ExternalIdentity`, resolved-or-shell `ContactId`, and `Activity` records.
- Guest ticket list/detail shows only tickets the external identity is allowed to see.
- Guest ticket comments and attachments are client-visible only when submitted by the guest or explicitly sent/published by internal support.
- Internal ticket notes and AI drafts remain hidden from the portal until explicitly made client-visible.
- Revoking active guest access blocks future portal reads/writes and invalidates guest portal session state.
- Revoking guest access does not delete CRM tickets, Contact/UnknownContact history, Activity, or audit rows.
- Every link lifecycle, acceptance attempt, portal read, file download, ticket action, comment, attachment event, visibility change, and revocation writes audit/security telemetry.
- Missing tenant/project context returns 403 and is not rendered as an empty successful portal.
- Guest portal screens define loading, pending, expired, used, revoked, forbidden, stale, unavailable, upload-failed, validation-error, and retry states.

## Testing decisions

- Test external behavior at the highest seams: magic-link application service, acceptance route/server action, `AuthorizationPort` guest policy, portal query handlers, support-ticket command handlers, and UI composition for guest screens.
- Do not test Better Auth internals, provider callback internals, token generator internals, OpenClaw runtime internals, or object-store SDK details directly.
- Add tests proving guest acceptance creates `ExternalIdentity` and never creates `Membership` or member `RoleGrant`.
- Add tests for 24h TTL, single-use consumption, revoked token, wrong recipient, used token, tampered token, tenant lifecycle denial, project lifecycle denial, and duplicate submit idempotency.
- Add authorization tests proving guest access is allowed only for the bound project and narrow support-ticket resource.
- Add denial tests proving sibling project, Organization, internal chat, settings, billing, admin, knowledge, agent, and runtime resources fail closed.
- Add query/serialization tests proving guest project responses exclude internal fields server-side.
- Add support-ticket command tests proving project binding is server-derived, Contact/UnknownContact resolution is invoked, comments become `Activity`, internal notes stay hidden, and idempotency prevents duplicates.
- Add attachment tests at the command/port seam proving size/type policy, object refs, authorization, and download expiry behavior without testing provider storage internals.
- Add audit/outbox tests for link creation, acceptance, failure, revocation, portal read, download, ticket create/comment, and visibility changes.
- Add UI tests for the guest acceptance page states derived from `essential-accept-invite.html` and net-new portal/ticket states once designs exist.
- Reuse PRD-001 invitation acceptance test patterns where they cover locked email, expired state, wrong-recipient state, pending submit, and already-access copy, but keep guest tests separate from member-invite membership assertions.
- Reuse PRD-003 project read-model tests for project/card visibility only where they can assert explicit client-visible projection behavior.
- Reuse PRD-010 CRM/support tests for `Ticket`, `Contact`/`UnknownContact`, `Activity`, comments, attachments, and client-visible reply behavior.

## Dependencies

- ADR-006 for Better Auth boundaries, DB-backed sessions, provider-callback distrust, and the rule that external Guest-Clients use a separate per-project magic-link flow.
- ADR-007 for resource-scoped RBAC, `AuthorizationPort`, `ExternalIdentity`, Guest-Client role policy, tenant-scoped repositories, and RLS fail-closed expectations.
- ADR-011 for CRM `Contact`, `ChannelIdentity`, conservative identity resolution, `UnknownContact`, `Ticket`, and `Activity` behavior.
- PRD-001 for member invitation UI prior art, locked email handling, expired/wrong-user states, and auth/security patterns.
- PRD-003 for Project Management read models, project/card visibility, project lifecycle, files, and project activity patterns.
- PRD-010 for CRM/support tickets, client-visible replies, Contact resolution, Activity, attachments, and support AI handoff.
- Notification/email delivery mechanism through outbox/EventBus for sending and resending guest links.
- Object Store integration for guest-visible file downloads and support-ticket attachments.
- Net-new design work for the guest portal screens listed in the UX walkthrough before implementation beyond backend/API foundations.

---
> **Validate against official docs before implementing.** Training knowledge is a starting point, not the source of truth — check `docs/plan/official-docs.md`, `docs/openclaw`, and current vendor docs. See `CLAUDE.md` (Official-docs rule).
