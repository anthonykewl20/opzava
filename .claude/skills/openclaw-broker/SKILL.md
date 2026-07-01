---
name: openclaw-broker
description: Build or modify Opzava's gateway-broker — the single anti-corruption layer to OpenClaw (WS operator client, tenant→Gateway routing, streaming relay, two-token auth, browser WS hub). Use for any broker or OpenClaw-RPC work.
---

# openclaw-broker

The `gateway-broker` is the **only** anti-corruption layer between Opzava and OpenClaw — no OpenClaw type leaks past it.
Authoritative decision: **ADR-003**. Protocol: `docs/openclaw/gateway/protocol.md` + `operator-scopes.md`. **Read those first** (parity).

## When to use
Building/changing the broker service: the WS operator client to tenant Gateways, the browser WS hub, tenant routing, agent streaming, or any call into OpenClaw RPC.

## Rules (non-negotiable)
- **WS-first operator client.** After the `connect.challenge` nonce, send `connect` (min/maxProtocol = 4) as `role: operator`; sign the challenge with the device keypair. Authenticate with a **paired device token** carrying **`operator.write` + `operator.approvals` ONLY** (never admin/pairing/talk.secrets).
- **req/res with idempotency keys** on every side-effecting method; consume **server-push events** (`agent` `deltaText` streaming, `session.message`, `exec.approval.requested`).
- **Lazy per-tenant connections:** connect on demand, idle-disconnect dormant tenants; reconnect with jittered backoff + a per-tenant **circuit breaker**.
- **The connection IS the tenant.** Keep a tenant→Gateway routing table; **NEVER trust a caller-supplied `tenant_id`** — derive it from the authenticated app→broker context.
- **Two-token boundary:** the broker only ever holds the hot-path device token. Provisioning (admin token, container create/destroy) is a **separate worker** — see `openclaw-gateway-provisioning`. The broker **never** touches Docker or admin scopes.
- **Browser hub (RealtimeTransportPort):** self-hosted WS hub + Redis backplane + Postgres outbox; per-channel sequence + client dedup; presence/typing Redis-only TTL. Relay agent token deltas into a streaming assistant message.
- Everything obeys hybrid-CQRS: **RPC snapshots are truth, WS events are hints** (ADR-004).

## References
ADR-003, ADR-009, ADR-004 · `docs/openclaw/gateway/{protocol,operator-scopes}.md` · `ARCHITECTURE.md` · companion skill `opzava-conventions` · stack skills: `nodejs`, `socketio`, `redis`.
