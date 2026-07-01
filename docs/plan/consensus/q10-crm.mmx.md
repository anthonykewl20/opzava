**Decisions**

1) **Aggregates** (Postgres, all tenant-scoped by `tenant_id`):
- `Contact` root: PII, lifecycle, consent refs, channel-identity set, dedup key (hash).
- `Account` root: company, hierarchy, contacts, owner.
- `Deal` root: value, stage (ref `Pipeline`), account, primary contact, activities.
- `Pipeline/Stage`: reference data, versioned.
- `Activity`: child entity of Contact/Deal (call, note, inbound msg).
- `Ticket`: root, refs Contact + conversation, assignee, SLA.
- `Segment`: spec object (JSON query) + cached materialised IDs.
- `Consent`: per-channel record (channel, status, ts, proof).
- `ChannelIdentity`: **VO on Contact** `{channel, externalId, verified, linkedAt}`.

2) **ChannelId ↔ Contact**: **suggest-and-confirm, never silent auto-merge.** ACL emits `SenderSeen(tenantId, channel, externalId, displayName)`. Opzava indexes `ChannelIdentity(channel, externalId)` unique-per-tenant. Hit → link. Miss → ephemeral `UnknownContact` shell surfaced in inbox; agent confirms/merges. De-dup by tenant-scoped fingerprint (`hash(displayName|phone_normalised)`) → dup candidates, manual merge. Same phone ≠ same Contact across tenants.

3) **Conversations→CRM**: ACL webhook → `ConversationStarted{tenantId, channel, externalId, sessionId}`. Service resolves to ContactId (or shell), writes Activity + opens Ticket if `intent=support`. Ticket binds Contact + conversation thread + assignee AgentEmployee.

4) **Marketing**: Segment = stored query + nightly materialisation into `segment_member(segment_id, contact_id)`. Consent enforced at send-time via `Consent` lookup; opt-out = webhook unsubscribe → revoke + suppress.

5) **GDPR erasure**: synchronous `EraseContact(tenantId, contactId)` via Gateway fanout:
   (a) Opzava: hard-delete Contact, hash PII in Activities/Tickets, blank transcript bodies, keep FK skeleton.
   (b) OpenClaw: call `DeleteChannelHistory(tenantId, externalIds)` + scrub agent `memory_wiki`/`lancedb` via tenant-scoped filter.
   (c) Idempotency key + audit ledger. Reindex async.

6) **Biggest sad path + invariant**: *Wrong contact↔conversation link poisons every downstream artefact (deals, tickets, AI memory, legal exposure).*
**Invariant**: `ChannelIdentity(channel, externalId)` is UNIQUE per tenant; conversation/activity writes REQUIRE a resolved or shell ContactId — never allow raw externalId to persist in Opzava domain tables.

**Parity**: OpenClaw owns channels + identity resolution; Opzava owns CRM truth, mapped via `ChannelIdentity` VO.
**Lean-ops**: 8 tables, 1 ACL consumer, 1 outbound eraser; no realtime sync — materialised segments + webhook-driven writes.
