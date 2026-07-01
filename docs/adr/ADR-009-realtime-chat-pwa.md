# ADR-009: Realtime WS hub, internal chat, assistants-in-chat, and PWA/Web Push

Status: Accepted

Opzava will run a self-hosted WebSocket hub inside the `gateway-broker`, backed by Redis for online fan-out and Postgres outbox for durability, behind `RealtimeTransportPort`. Internal Collaboration owns durable team chat in Opzava Postgres, AI assistants appear as first-class chat participants through the broker-to-OpenClaw session bridge, and installable PWA/Web Push delivery uses `PushNotificationPort` with server-side session binding and offline gates.

## Context

ADR-001 establishes `apps/gateway-broker` as the long-lived Node service that owns OpenClaw sockets and broker-owned realtime fan-out surfaces, with `RealtimeTransportPort` and `PushNotificationPort` as vendor-neutral ports. ADR-003 makes the `gateway-broker` the only production path to OpenClaw and the owner of tenant Gateway WS pools, server-push events, scope negotiation, routing, backpressure, and opaque runtime refs. ADR-004 puts Internal Collaboration, notifications, activity projections, and durable UI state in Opzava Postgres while OpenClaw remains the runtime owner of sessions, runs, channels, Webhooks, and Gateway-local state.

Q7 locks a Slack-grade internal chat and realtime delivery surface. The product needs one online path for agent token streaming, activity updates, notifications, internal team chat/DMs, mention inbox updates, assistant-in-chat replies, approval prompts, read receipts, typing, and presence. It also needs reconnect behavior that survives browser sleep, mobile network churn, deploys, missed notifications, and duplicate deliveries without turning Redis or a managed realtime vendor into the system of record.

There are three adjacent domains that must stay separate. Internal Collaboration is Opzava-owned team chat and collaboration history. External Channels are customer or public-channel communications such as Slack, Gmail, WhatsApp, mail, and support channel correlation reached through the OpenClaw ACL. Agent Sessions are OpenClaw-owned runtime conversations, runs, transcripts, and streaming state. These surfaces may project into each other, but they do not share a write model.

ADR-006 constrains PWA and Web Push auth. Service workers cannot read httpOnly cookies, so push subscription registration, push binding, enqueue decisions, and fetch-on-open behavior must be server-mediated. Push cannot become a second authentication channel, and notification payloads must not carry sensitive content.

ADR-008 makes AI employees distinct personas with their own identity, workspace, sessions, channel bindings, tool policy, and assignments. Chat must therefore treat assistants as first-class participants with persona attribution, not as anonymous system messages and not as impersonated humans. Inbound mentions and chat requests need to bridge to OpenClaw `sessions.send`; outbound agent streams need to render as the selected employee persona; proactive standing-order or heartbeat work needs a safe ingress path back into Opzava chat.

## Decision

Use a self-hosted WebSocket hub in `apps/gateway-broker` as the default realtime transport. Browser clients connect to the broker hub through an authenticated Opzava session and subscribe to tenant-, project-, channel-, inbox-, activity-, and runtime-scoped topics admitted by Opzava authorization. The broker hub is exposed to the application through `RealtimeTransportPort`, so Ably, Pusher, Supabase Realtime, or another managed provider can be introduced later as an adapter swap without changing the Internal Collaboration domain model, event schemas, command handlers, or client message contract.

Use Redis as the online backplane and Postgres outbox as the durable event source. Every durable command writes its domain rows and an outbox row in the same Postgres transaction. `LISTEN/NOTIFY` wakes broker relay workers, but workers also poll the outbox table so a missed notification only delays delivery. The relay publishes accepted events to Redis topics or streams partitioned by tenant and surface. Every broker WS instance subscribes to Redis and pushes matching events to its local clients. Redis is not the durable event log.

Map realtime surfaces by durability and ownership:

- Agent token streaming uses broker WS topics, server-to-client only, sourced from the tenant Gateway WS/event stream through ADR-003. Token chunks are live runtime data and are not stored as durable chat messages unless the run completes into an assistant message, summary, transcript projection, report, or activity event.
- Activity feed and notifications are durable Opzava events emitted over WS and backfilled from Postgres by cursor on reconnect.
- Internal team chat, DMs, message edits, deletes, reactions, read cursors, threads, and mentions use HTTP or server-action command paths into Internal Collaboration Postgres rows, followed by WS fan-out from the outbox. Optimistic client messages reconcile by idempotency key and final `messageId`.
- Mention inbox updates are `Mention` rows created transactionally with messages, assistant hand-offs, approvals, or workflow notifications, projected to activity and pushed over WS. Reconnect backfills by mention cursor.
- Presence and typing are ephemeral. Clients send heartbeats or typing frames over the broker WS. Broker instances store presence and typing state in Redis with TTLs, using a 10 second heartbeat target and roughly 30 second expiry. No Postgres row, outbox event, projection, audit row, or durable read model is written for ordinary presence or typing.

Order durable chat by a per-channel Postgres sequence. Each committed `Message` receives a monotonically increasing `channelSeq` scoped to one channel. Events are delivered at least once and ordered per `(tenantId, channelId, channelSeq)` when backfilled from Postgres. Live Redis delivery is a latency path and may duplicate or race; the sequence and event ids are the correctness path.

The attach invariant is: a subscription is not live until the server backfills every durable gap requested by the client and establishes a live watermark. For a channel, the broker backfills `channelSeq > clientSeq` up to the configured page/window limit before joining the Redis live stream. For inbox and activity surfaces, the broker backfills by the appropriate cursor. Clients must deduplicate by `eventId`, `messageId`, and send idempotency key, and must treat duplicate delivery as normal.

Keep the bounded-context split explicit:

- Internal Collaboration owns internal channels, DMs, threads, memberships, messages, mentions, reactions, read cursors, durable chat ordering, and internal chat history in Opzava Postgres.
- External Channels owns Opzava-side customer/channel correlation records and projections, while OpenClaw Channel Runtime owns provider connectivity, channel credentials, external conversation state, and channel send/receive runtime behavior.
- Agent Sessions are OpenClaw-owned runtime conversations reached through `OpenClawGatewayPort`; Opzava stores opaque refs, projections, summaries, and chat messages generated by admitted assistant flows, not OpenClaw session rows.
- Shared-kernel ids such as `TenantId`, `UserId`, `ProjectId`, `AgentEmployeeId`, and opaque runtime refs are the cross-context contract.

Model AI assistants as first-class chat participants. An assistant participant is backed by an ADR-008 `AgentEmployee` and persona identity, not a human user. Inbound user messages, slash actions, or `@assistant` mentions are admitted by Opzava RBAC, tool policy, tenant lifecycle, project membership, autonomy tier, and idempotency checks, then bridged by the broker to OpenClaw `sessions.send` scoped to the selected employee workspace, agentDir, session, and project/org corpus overlays.

Outbound assistant responses are streamed into chat as that employee persona. Token deltas may show as a live assistant message or typing-like state over WS. Completion finalizes one durable `Message` with author type `assistant`, the `AgentEmployeeId`, persona/version attribution, optional `Assignment` and `AgentDispatch` refs, and opaque `sessionRef`, `runRef`, or `turnRef` values. If stream completion and webhook completion both arrive, the per-agent-turn idempotency key decides the single durable message.

Proactive assistant work enters chat through the OpenClaw Webhooks plugin. Heartbeats, cron, standing orders, TaskFlow ingress, and approved proactive events call an Opzava receiver, which authenticates the webhook source, resolves tenant and employee, re-checks policy, deduplicates by webhook/turn idempotency key, and posts the resulting assistant message, approval prompt, activity event, or incident notification into the owning Opzava context. Proactive sends are rate-limited and subject to the ADR-008 invariant that inbound hostile messages alone cannot trigger autonomous external sends.

Use PWA plus Web Push for background delivery. The web app is installable as a service-worker PWA on desktop and mobile. Web Push with VAPID is the first `PushNotificationPort` adapter; native FCM/APNs can be added later behind the same port. Store per-device `PushSubscription` rows in Postgres with endpoint hash, user id, org id, session id, device id, subscription hash, browser metadata, expiry/rotation state, and audit metadata.

Bind push subscriptions server-side to the authenticated session. Window code registers a browser subscription and sends it to a server endpoint while the normal httpOnly cookie-backed session is valid. The server performs the ADR-006 one-time binding-token handshake, stores only hashes and metadata needed for replay detection, and binds the subscription to `(sessionId, userId, orgId, deviceId)`. At enqueue time, the server revalidates session, user, org membership, role/membership version, tenant lifecycle, device state, notification preference, and push binding state before sending. Revoked sessions, expired sessions, role-invalidated sessions, disabled devices, dead subscriptions, and tenant suspension drop or suppress push.

Use Web Push for DMs, mentions, assistant completions, approval-needed prompts, task assignments, incident/admin-card alerts, and other notification events where background delivery is useful. Online clients receive in-app WS events; backgrounded or offline clients receive Web Push when allowed. Push payloads carry no sensitive content: only notification id, coarse type, tenant/org hint, collapse/dedup keys, and fetch-on-open instructions. Opening a notification must fetch details through normal server session validation. Offline UX is a cached public shell plus redacted last-known surfaces; privileged screens stay behind an explicit server-session gate.

## Aggregates

Internal Collaboration owns these aggregates and child records:

- `Channel`: the aggregate root for an internal room or DM. Fields include `tenantId`, optional `projectId`, `kind` such as `public`, `private`, `project_room`, or `dm`, `title`, membership policy, archived state, notification defaults, and lifecycle/audit metadata.
- `Membership`: a user's access and notification relationship to a channel. Fields include `channelId`, `userId`, role or membership kind, joined/left state, muted state, notification preference, last delivery preference, and audit metadata.
- `Message`: one durable chat entry in a channel. Fields include `messageId`, `channelId`, `channelSeq`, `authorRef`, `authorType` such as human, assistant, system, or integration, body/content blocks, idempotency key, optional `threadRootId`, edit/delete metadata, optional target refs, and opaque runtime refs where the message reports assistant or external runtime work.
- `Thread`: a message subtree rooted by a thread root message. Thread identity is internal to one channel and uses the root message plus channel sequence to preserve ordering and backfill semantics.
- `Mention`: the durable mention-inbox record created in the same transaction as the message, assistant hand-off, approval prompt, or workflow notification that mentions a principal. Fields include mentioned `userId` or employee/ref target, source message or activity ref, seen/cleared state, and cursor metadata.
- `Reaction`: a deduplicated reaction child record keyed by message, actor, and emoji or reaction kind. Reactions are durable and fan out over WS after the transaction commits.
- `ReadCursor`: a per-user cursor for one channel or thread. Fields include `channelId`, `userId`, optional `threadRootId`, `lastReadSeq`, `lastReadMessageId`, and `updatedAt`.

Presence and typing are not aggregates. They are Redis TTL projections keyed by tenant, user, device, channel, and thread where needed. Their absence after expiry means unknown/offline, not a domain transition.

Assistant chat messages may reference ADR-008 aggregates such as `AgentEmployee`, `Assignment`, `AgentDispatch`, `Persona`, and `ChannelBinding`, but Internal Collaboration does not own those aggregates. It stores stable ids and opaque refs so the chat transcript remains durable when runtime sessions are purged, Gateways are unavailable, or workforce assignments are reconciled.

## Consequences

The broker becomes the online realtime boundary in addition to the OpenClaw ACL. It must manage browser WS authentication, topic authorization, local connection registries, Redis subscriptions, outbox relay, per-tenant backpressure, payload limits, reconnect pressure, and deploy drain behavior. This is acceptable because ADR-003 already concentrates long-lived socket and stream complexity in the broker.

Postgres remains the correctness boundary for durable collaboration. Chat history, message order, mentions, reactions, read cursors, notification rows, push subscriptions, activity projections, and outbox events are recoverable from Postgres. Redis can be flushed, resharded, or miss a pub/sub message without losing durable collaboration data.

Reconnect gaps and duplicate handling are designed-in. A client that reconnects with stale `clientSeq` receives per-channel sequence backfill before live attach, and a client that receives the same live event twice must deduplicate by `eventId`, `messageId`, and idempotency key. The durable invariant is: every committed message has one `channelSeq`, and every client-visible duplicate is harmless.

Presence and typing are approximate by design. They are useful collaboration hints, not facts. Browser sleep, mobile backgrounding, network changes, deploys, Redis expiry, and dropped frames may make someone appear offline or stop typing early. The system must not use presence or typing for authorization, audit, workflow state, billing, or delivery guarantees.

Assistant-in-chat creates a clear participant model. Users can see which AI employee acted, which persona produced a message, which assignment or dispatch it belongs to, and whether it came from an inbound request, an approval flow, or proactive work. The cost is more idempotency and attribution discipline across stream completion, webhook completion, runtime projections, and durable chat messages.

PWA/Web Push remains subordinate to server auth. Push can wake or notify, but it cannot reveal sensitive content, prove authorization, or bypass role/session revocation. Dead endpoints, push `410` responses, browser endpoint churn, permission revocation, iOS installed-PWA limits, duplicate push delivery, and notification collapse behavior are normal operational paths.

Managed realtime remains available as a scale or operations exit. Because the domain talks to `RealtimeTransportPort` and durable eventing stays in Postgres outbox, moving fan-out to a provider later changes adapter implementation and operational cost, not Internal Collaboration aggregates or ordering rules.

## Alternatives

Use SSE plus HTTP POST as the default realtime model. Rejected because Opzava needs one bidirectional, authenticated, topic-authorized connection for chat sends, read cursor updates, typing, presence heartbeats, assistant live output, activity, and notifications. SSE plus POST creates dual-channel state, weaker fan-out semantics, more reconnect edge cases, and no clean client-to-server realtime frames for typing, presence, and interactive chat surfaces. SSE remains acceptable only as a degraded adapter for one-way feeds.

Use a managed realtime provider such as Ably, Pusher, or Supabase Realtime as the default foundation. Rejected because internal chat, activity, assistant streams, mentions, and notification fan-out are core product surfaces that Opzava owns, and the first operating posture is lean VPS with vendor-neutral ports. A managed provider would create per-message cost exposure and provider-specific channel semantics before the domain model is stable. It remains a future `RealtimeTransportPort` adapter when scale, regional delivery, or operational pressure justifies it.

Use Redis pub/sub or streams as the durable chat log. Rejected because Redis does not provide the same transaction boundary as the message write, Postgres sequence assignment, mention creation, reaction mutation, read cursor update, audit row, and outbox insert. Redis is the low-latency online backplane; Postgres is the durable source of truth.

Store presence and typing in Postgres for exactness. Rejected because presence and typing are high-churn, approximate collaboration hints. Writing heartbeats and typing transitions into Postgres would create write amplification, retention noise, and false precision without improving authorization or delivery correctness.

Treat OpenClaw Agent Sessions as internal chat storage. Rejected because Agent Sessions are runtime conversations owned by OpenClaw, with runtime retention, transcripts, runs, tokens, task state, and Gateway lifecycle. Internal team chat needs Opzava-owned history, membership, mentions, reactions, read cursors, per-channel order, and PWA/push behavior even when a tenant Gateway is down, suspended, or purged.

Make assistant chat output a system notification instead of a participant message. Rejected because ADR-008 gives AI employees their own identity, persona, workspace, assignments, and audit trail. Collapsing assistant output into system messages would hide attribution, make approvals and hand-offs harder to reason about, and blur humans, employees, broker credentials, and runtime sessions.

Send sensitive details in push payloads for convenience. Rejected because Web Push traverses browser and platform notification surfaces and service workers cannot independently validate httpOnly-cookie sessions. Push payloads carry only safe hints; sensitive details are fetched after server session validation.

## Related ADRs

- ADR-001: Monorepo, DDD module structure, and locked stack.
- ADR-003: `gateway-broker` ACL, two-token model, tenant routing, and runtime RPC.
- ADR-004: Data model boundary, hybrid CQRS, outbox, and projections.
- ADR-006: Better Auth, revocable sessions, MFA/passkeys, and PWA auth.
- ADR-008: AI Workforce, delegate agents, personas, and `AgentDispatch`.
