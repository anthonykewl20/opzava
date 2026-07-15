# ADR-011: CRM, external channel identity, and Contact resolution

Status: Deferred

> Deferred 2026-07-15: the implementation was removed under [GitHub issue #200](https://github.com/anthonykewl20/opzava/issues/200). This decision is retained for the CRM data-model rebuild with the future user-side dashboard.

Opzava will own CRM truth in tenant-scoped Postgres aggregates, while OpenClaw owns external channel runtime state behind the ADR-003 `gateway-broker` ACL. CRM resolves customer senders through a `ChannelIdentity` value object on `Contact`, auto-links only exact verified sender matches, uses audited manual merge for cross-channel dedupe, and treats conversations as projections into Contact activity and support tickets.

## Context

ADR-003 puts all OpenClaw runtime access behind the `gateway-broker`, makes the broker the anti-corruption layer for OpenClaw channels, and keeps channel secrets, provider credentials, Gateway-local config, and runtime refs out of Opzava bounded contexts. ADR-004 makes Opzava Postgres the system of record for CRM records, audit, projections, and workflow truth, while OpenClaw remains the runtime owner of sessions, channels, transcripts, and Gateway-local state. ADR-008 makes Support and Customer Management/CRM part of the AI Workforce model, where customer-facing work is performed by a distinct `AgentEmployee` under channel bindings and tool policy. ADR-010 makes CRM-derived facts possible knowledge candidates, but knowledge indexes remain derived and scrub-able.

Q10 locks CRM as an Opzava-owned bounded context. The customer-management surface needs durable customer records, account relationships, deals, support tickets, activity history, segments, consent, merge audit, and legal export/erasure behavior even when a tenant Gateway is down, suspended, deprovisioned, or retaining channel history under a different runtime policy.

OpenClaw channels are the source of inbound sender facts, conversation refs, delivery status, transcripts, channel-specific directory lookups, and send/receive behavior. Those facts are not stable CRM identity by themselves. A Slack user id, phone number, email address, WhatsApp sender id, Gmail sender, or provider user id can be missing, spoofed, recycled, unverified, duplicated across tenants, or ambiguous across channels. A group room, thread id, channel id, or OpenClaw conversation/session id is also not a person.

The highest-risk sad path is a wrong contact-to-conversation link. One mistaken auto-merge can contaminate tickets, deals, AI memory, campaign targeting, support replies, audit trails, legal exports, and right-to-erasure behavior. The CRM model therefore needs a conservative resolution invariant that prefers a tenant-scoped shell and human confirmation over silent cross-channel identity joins.

## Decision

Create a CRM and External Channels bounded context backed by Opzava Postgres. OpenClaw owns channel connectivity, provider credentials, channel runtime state, directory lookups, sends, receives, transcripts, channel history, and OpenClaw conversation/session refs. Opzava owns CRM truth, support workflow truth, contact identity mapping, consent, segments, merge audit, and rebuildable projections.

CRM owns these tenant-scoped aggregates and value objects:

- `Contact`: the customer person aggregate root. It owns PII, lifecycle, owner, dedupe fingerprints, consent refs, account links, open support state, and a set of `ChannelIdentity` value objects.
- `Account`: the company or organization aggregate. It owns company profile, hierarchy, account owner, contact relationships, lifecycle, and account-level activity summaries.
- `Deal`: the commercial opportunity aggregate. It owns value, status, account ref, primary contact ref, stage ref, close metadata, activity refs, and audit.
- `Pipeline` and `Stage`: versioned reference data for commercial workflow. Deals reference a stage in a pipeline version rather than copying mutable display state.
- `Activity`: an append-only CRM timeline entry for calls, notes, inbound messages, outbound messages, campaign touches, deal changes, ticket changes, support summaries, and projected external conversations.
- `Ticket`: the support aggregate. It references a `Contact`, an opaque external conversation ref, support status, priority, SLA, queue, and an assigned Support `AgentEmployee`.
- `Segment`: a saved CRM query/specification plus materialized member ids for campaigns, reporting, and workflow targeting.
- `Consent`: a per-contact, per-channel, per-purpose consent record with status, timestamp, source, proof, and revocation metadata.
- `ChannelIdentity`: a value object on `Contact` that identifies the external sender, not a conversation, room, thread, session, or transcript. It carries the channel, optional channel account or provider account scope, canonical `externalId`, verification state, source, directory enrichment, and linked timestamp.

`ChannelIdentity` uniqueness is tenant-scoped. At most one Contact in a tenant may own the same `(tenantId, channel, channelAccountRef?, externalId)` identity. The `externalId` is the ACL resolver's canonical sender identity for the external channel namespace, not an arbitrary raw provider payload. Raw sender values are normalized through the resolver and do not land in Opzava domain tables; ordinary CRM rows such as `Activity`, `Ticket`, `Deal`, segment members, support assignments, and conversation projections store `ContactId` plus opaque conversation/runtime refs, not provider sender ids.

The ADR-003 ACL emits a normalized `SenderSeen` integration event when OpenClaw observes an external sender. The event envelope carries the tenant bound to the broker route, channel, channel account scope where applicable, sender kind, sender id, display enrichment, verification evidence, opaque conversation refs, idempotency key, and source timestamp. Opzava never trusts a browser-supplied channel id, external id, thread id, room id, session id, or conversation id as proof of Contact identity.

Sender resolution is conservative:

- If `(tenantId, channel, channelAccountRef?, externalId)` matches exactly one verified `ChannelIdentity`, Opzava auto-links the event to that `Contact`.
- If there is no exact verified match, Opzava creates or reuses an `UnknownContact` shell with a real tenant-scoped `ContactId`, minimal non-sensitive display metadata, and resolution status.
- If there are multiple candidates, partial matches, unverified matches, normalized phone/email matches, directory-display-name matches, or dedupe-fingerprint matches, Opzava records suggestions for a human or approved CRM workflow to review.
- Cross-channel dedupe is suggest-and-confirm only. It never silently merges a Slack sender with an email sender, phone sender, WhatsApp sender, or provider user.
- Contact merges are audited manual commands. They record actor, source contacts, target contact, evidence, conflicting fields, pre-merge snapshots or tombstone refs, idempotency key, and rollback/review metadata where retention permits.
- Dedupe and merge never cross tenants. The same phone number, email address, display name, or provider id in two tenants is two separate tenant-scoped identities.

External conversations project into CRM rather than becoming CRM identity. The broker and CRM projectors consume channel and conversation observations through the ACL, resolve a `ContactId` or shell `ContactId`, and append idempotent `Activity` rows to the Contact timeline. Support intent, a support-bound channel, queue rules, or explicit employee/human action opens or updates a `Ticket` for the resolved Contact and opaque conversation ref. The ticket is assigned to a Support `AgentEmployee` whose channel binding and tool policy allow the customer channel and support scope.

Internal Collaboration remains separate from External Channels. Internal team channels, DMs, threads, messages, mentions, reactions, and read cursors are ADR-009 Internal Collaboration records. Customer Slack/Gmail/WhatsApp/mail/support conversations are OpenClaw channel runtime state projected into CRM `Activity`, `Ticket`, and external-channel read models through the ACL. A message may create both a support activity and an internal mention or notification, but those are different write models.

Segments are saved CRM specifications that materialize nightly. A `Segment` stores the tenant-scoped query/specification, owner, purpose, last materialized revision, and cached member ids. Campaigns and workflows may use the cached membership for planning and batching, but every outbound send must re-check current `Consent` at send time for the specific contact, channel, purpose, and tenant policy.

Consent is enforced at send time. Unsubscribe, bounce, spam complaint, opt-out webhook, manual suppression, legal hold, and admin consent changes update `Consent` and suppress future sends before the broker calls OpenClaw channel send APIs. Segment membership, stale campaign plans, AI employee suggestions, and cached projections cannot override a current deny or missing required opt-in.

GDPR right-to-erasure is an idempotent admin/provisioning workflow across Opzava Postgres and the per-tenant Gateway. `EraseContact(tenantId, contactId)` records an idempotency key and PII-free audit tombstone, then:

- erases or anonymizes Opzava Contact PII, `ChannelIdentity`, consent proof payloads, segment membership, activity bodies, ticket bodies, and denormalized CRM projections according to retention policy while preserving required FK skeletons and audit facts;
- calls the tenant Gateway through the ADR-003 ACL/admin context to delete or scrub channel history for the known sender identities;
- triggers Knowledge Management scrub/rebuild work for agent memory, `memory-wiki`, and `memory-lancedb` references under the ADR-010 derived-index model;
- reconciles until Opzava state, Gateway channel history, and agent memory scrub receipts reach a terminal erased or retained-by-policy state.

The load-bearing invariant is: no external conversation, activity, or ticket write persists without tenant scope plus a resolved-or-shell `ContactId`, and raw external sender ids do not bypass `ChannelIdentity` into Opzava domain tables. Projection writers use the tenant bound to the broker connection or outbox envelope, not any tenant-looking value in an OpenClaw payload.

## Consequences

CRM stays available and queryable from Postgres when a tenant Gateway is unavailable. Users can still view Contacts, Accounts, Deals, Tickets, consent, segments, and historical activities, while live channel transcript detail and sends degrade through ADR-003 broker errors such as `GatewayUnavailable`, `CircuitOpen`, `ScopeDenied`, or `ProtocolMismatch`.

Contact identity resolution is intentionally slower than a permissive CRM auto-merge. Unknown senders become shells, and cross-channel identity joins need suggestions, confirmation, and audit. This creates inbox work, but it prevents one spoofed, stale, or ambiguous sender id from poisoning customer records and downstream AI behavior.

Support has a durable handoff point. External conversations are projected into `Activity`, support intent opens or updates `Ticket`, and assignment targets a Support `AgentEmployee` rather than a generic bot or human impersonation. This preserves ADR-008 attribution: the employee can send on behalf of the tenant within channel policy without becoming the customer or the human requester.

Marketing sends must tolerate stale segment membership. Nightly materialization keeps campaign planning cheap, but the send path must intersect every planned recipient with current consent and suppression state. A contact can fall out of eligibility between materialization and delivery, and the delivery worker must treat that as normal.

Erasure becomes a workflow, not a single delete statement. Opzava can erase its CRM truth synchronously where policy permits, but Gateway channel history and agent memory scrub require ACL/admin calls, receipts, retries, and index rebuilds. Product and legal surfaces need terminal states such as `Erased`, `RetainedByPolicy`, `GatewayScrubPending`, `MemoryScrubPending`, and `ScrubFailedNeedsReview`.

The external-id invariant concentrates provider-id handling in one place. Adapters, projectors, campaigns, tickets, deals, and activities must not grow ad hoc `slackUserId`, `gmailSender`, `phone`, `whatsappId`, or similar fields. They reference `ContactId`, `ChannelIdentityId` where explicitly needed by the resolver, and opaque conversation refs.

Merge audit is mandatory because Contact merges affect legal, support, marketing, and AI-memory behavior. Merge commands need explicit evidence capture and tenant-scoped review trails. Undo may not always be possible after erasure, retention expiry, or external sends, so prevention and audit matter more than automatic repair.

## Alternatives

Use OpenClaw channel identities or conversation ids as CRM Contact ids. Rejected because OpenClaw owns runtime channel state, not CRM person identity. Conversation ids, rooms, threads, sessions, and provider sender ids are channel-scoped runtime facts and can be missing, ambiguous, spoofed, recycled, or purged. Opzava needs durable tenant-scoped Contacts that survive Gateway lifecycle and channel provider changes.

Store all channel transcripts, sender ids, and provider-specific identity fields directly in CRM tables. Rejected because it would duplicate OpenClaw channel ownership, expand PII and secret-adjacent blast radius, and leak provider semantics into Deals, Tickets, Activities, and Segments. Opzava stores CRM truth, `ChannelIdentity` mappings, opaque refs, and projections; OpenClaw remains the channel runtime owner.

Auto-merge Contacts across channels using phone, email, display name, or AI similarity. Rejected because false positives are too costly for support, contracts, PII, consent, legal export, and agent memory. Cross-channel dedupe remains suggest-and-confirm with audited manual merge.

Allow tenant-global or cross-tenant dedupe for shared customers. Rejected because tenants are isolation boundaries. The same person, phone, or email can appear in multiple tenants with different consent, support history, account relationships, contracts, and legal obligations. Cross-tenant matching would undermine ADR-002 and ADR-007 isolation.

Treat `UnknownContact` as an ephemeral inbox row without a `ContactId`. Rejected because conversations, activities, and tickets still need stable tenant-scoped identity for authorization, audit, idempotency, assignment, support SLA, and later merge. A shell Contact keeps the invariant intact while making uncertainty explicit.

Materialize segments in realtime on every CRM mutation. Rejected for day-one lean operations because campaign targeting can tolerate nightly materialization plus explicit rebuild triggers, while send-time consent checks are the correctness boundary. Realtime segment recomputation can be added behind the same `Segment` model if campaign scale or UX demands it.

Handle GDPR erasure only in Opzava Postgres. Rejected because customer data can also exist in per-tenant Gateway channel history and agent memory/vector indexes. ADR-010 makes memory/wiki/vector indexes derived and scrub-able; ADR-003 provides the ACL/admin path for per-tenant Gateway deletion and scrub workflows.

## Related ADRs

- ADR-003: `gateway-broker` ACL, two-token model, tenant routing, and runtime RPC.
- ADR-004: Data model boundary, hybrid CQRS, outbox, and projections.
- ADR-008: AI Workforce, delegate agents, personas, and `AgentDispatch`.
- ADR-009: Realtime WS hub, internal chat, assistants-in-chat, PWA/Web Push.
- ADR-010: Knowledge Mgmt SoT, OKF ingestion, memory/wiki/vector indexes, skill catalog.

---
> **Validate against official docs before implementing.** Training knowledge is a starting point, not the source of truth — check `docs/plan/official-docs.md`, `docs/openclaw`, and current vendor docs. See `CLAUDE.md` (Official-docs rule).
