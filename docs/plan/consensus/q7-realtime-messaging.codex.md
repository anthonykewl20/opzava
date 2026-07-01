# Q7 Realtime + Internal Messaging

**Recommendation: default to the existing broker as a self-hosted WebSocket hub with Redis backplane, behind `RealtimeTransportPort`.** It gives one browser connection per session, true bidirectional typing/presence, shared fan-out for agent streams and chat, and no managed per-message bill. Keep Ably/Pusher/Supabase Realtime as adapter implementations for future offload; do not design the domain around them. SSE + HTTP POST is acceptable as a degraded adapter for one-way feeds, but not the default for Slack-like chat.

**Surface mapping.**

1) Agent/orchestrator token streaming: broker WS topic, server-to-client only, sourced from the tenant Gateway WS/event stream; no Postgres durability except run summary projections.
2) Activity feed + notifications: durable Opzava events emitted over WS; reconnect backfills from Postgres by cursor.
3) Internal team chat + DM: HTTP command path for sends/edits/reactions/read cursors into Postgres, then WS fan-out; optimistic client messages reconcile by idempotency key.
4) Presence + typing: WS client frames to the broker, Redis TTL state, no Postgres writes; presence is approximate by design.
5) Mention inbox: `Mention` rows created transactionally with messages or assistant hand-offs, projected to Activity and pushed over WS; backfill by mention cursor.

**Internal Collaboration aggregate sketch.** Opzava owns `Channel/Conversation` as the aggregate root, scoped by org and optionally project: `kind = project_room|private_channel|dm`, title, membership policy, archived state. `Membership` grants room access and notification prefs. `Message` has `messageId`, author, body, `conversationSeq`, edit/delete metadata, and optional `threadRootId`. `Thread` is a message subtree rooted by `threadRootId`. `Mention`, `Reaction`, and `ReadCursor` are child records with unique constraints for dedup. `Presence` is not durable: it is a Redis TTL projection keyed by `(orgId, userId, deviceId)` plus room typing keys.

**Fan-out.** Every durable command writes the domain row and an outbox row in the same Postgres transaction. `LISTEN/NOTIFY` only wakes the broker relay; the relay also polls unprocessed outbox ids so missed notifications are harmless. The relay publishes to Redis pub/sub or streams by org/conversation topic; every broker WS instance subscribes and pushes to local clients. Order is per conversation using the Postgres `conversationSeq`; delivery is at least once.

**Context split: confirmed.** `Internal Collaboration` is Opzava-owned Postgres. OpenClaw `Channels` remain external customer comms, and OpenClaw `Sessions` remain agent chats. Both are accessed through the broker ACL and may project activity into Opzava, but they never become internal human team chat storage.

**Biggest sad path.** A client reconnects after missed events and sees duplicates or gaps. Invariant: attach is not "live" until the server backfills `seq > lastSeenSeq` for every subscribed conversation/inbox cursor, then joins the Redis live stream from a known watermark. Clients dedup by `eventId/messageId` and durable send idempotency key.

**Lean ops + scale.** One broker WS tier plus Postgres outbox and Redis keeps VPS operations small, while `RealtimeTransportPort`, topic sharding, and managed adapters leave a clean scale exit.
