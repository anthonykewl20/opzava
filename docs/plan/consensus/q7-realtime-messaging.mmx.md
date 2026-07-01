**Transport: self-hosted WebSocket hub in the broker + Redis backplane**, fronted by a `RealtimeTransportPort` so Ably/Pusher is a swap, not a rewrite.

- **(a) Token streaming, (b) activity/notify, (c) team chat/DM, (e) mentions** → WS hub, Redis fan-out. Persisted, replayable, multi-instance. Server→client WS for stream; client→server frames for send, persisted via outbox.
- **(d) Presence + typing** → ephemeral, high-fanout. **SSE on a dedicated edge endpoint** keyed to a presence shard, Redis-published. No DB writes. Presence TTL'd in Redis (heartbeat 10s, expiry 30s). Keeps the chat hub cheap.
- HTTP POST + SSE is rejected: dual-channel, NAT issues, no fan-out. Managed is rejected: vendor lock for a domain we own and a cost line that scales with chat volume, not value.

**Aggregates (Postgres, Opzava-owned):**
`Workspace` → `Channel {kind: public|private|dm}` → `Message {id, channel_id, thread_parent_id?, author_id, body, edited_at?, deleted_at?}` → `Thread` (self-aggregate on Message). Children: `Mention {message_id, user_id, seen_at?}` = **mention inbox**, `Reaction {message_id, user_id, emoji}`, `ReadCursor {channel_id, user_id, last_read_message_id, updated_at}`. Presence/typing NOT in PG — Redis only.

**Fan-out:** Transactional **outbox** in PG → broker relay consumes via `LISTEN/NOTIFY` → Redis pub/sub → all WS instances. At-least-once, ordered per `(channel_id, sequence)` from a per-channel Postgres sequence.

**Bounded contexts: CONFIRMED separate.** External Channels = OpenClaw ACL, read-model only. Internal Collaboration = write model, owns identity/permissions. Shared kernel: `UserId`, `TenantId`.

**Biggest sad path: ordering on reconnect.** Invariant: **`last_seq >= client_seq` always; gap-fill by `(channel_id, seq > client_seq) LIMIT N` before live attach.** Client dedups by `message_id` (idempotency key on send).

Lean ops: 2 small VPS, broker is the only stateful realtime process; PG+Redis do the heavy lifting.
