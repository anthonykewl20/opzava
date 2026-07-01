**1) Transport: BOTH, split by direction.** WS for inbound events (token streaming, session.message, exec.approval.requested) — event-native, push is non-negotiable. HTTP Admin RPC for outbound commands (send, exec start, scope mgmt) — stateless, retryable, request-scoped, no socket lifecycle to babysit per call.

**2) Auth: per-Gateway paired device token, narrow scopes.** Pair once per (tenant Gateway, broker identity), store device token in a secret manager. Grant only the scopes each call path actually needs (e.g., chat.write, exec.run, sessions.read). Shared-secret is a single coarse-grail key per tenant — wrong fit for least-privilege BFF logic.

**3) Deployment: separate long-lived Node broker service.** Next.js serverless/edge cannot hold the persistent WS; the broker sits alongside, owns WS connections + reconnect/backoff, and exposes an internal HTTP/AMQP API to Next.js route handlers. Keeps BFF stateless and horizontally scalable while the broker manages one socket per tenant Gateway.

**Biggest risk:** WS reconnection storms across N tenants during a regional blip — one flaky gateway can exhaust broker file descriptors and starve the rest. Mitigate with per-tenant circuit breakers, jittered backoff, and shed non-critical subscriptions under pressure.

**MVP→scale:** MVP = single Node process, WS + HTTP in one binary, tokens in env/Secrets Manager. Scale = sharded broker workers by tenant hash, Redis-backed subscription fan-out, token vault with auto-rotation, separate event-bus ingest from command-path workers.
