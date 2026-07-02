# Slice 2 design memo: Ask Admin Opzava on Tasks

Research + design only. This memo locks the implementation shape for Slice 2: Ask Admin Opzava can
read, create, and update the dogfood Tasks board through streaming chat, while OpenClaw remains
behind the broker ACL and Opzava remains the product system of record.

## Verdict summary

Build Slice 2 as a broker-mediated assistant loop, not as a direct OpenClaw integration in
`apps/web`. The first production-worthy path is:

1. `apps/web` authenticates with the existing Better Auth-backed session context, derives
   org/workspace/actor from `getAppSessionContext`, and opens a server-owned stream route for the
   Tasks chat panel.
2. A new Runtime-Control bounded context persists assistant conversations, turns, stream state, and
   tool outcomes in Opzava Postgres under the same RLS pattern as `tasks`.
3. `packages/ports` gains `OpenClawGatewayPort` and `RealtimeTransportPort` contracts with Opzava
   DTOs only. No OpenClaw type crosses the broker.
4. `apps/gateway-broker` owns the OpenClaw operator WS client, tenant route, challenge signing,
   device token, request/response idempotency, event handling, backoff, and circuit breaker.
5. Ask Admin Opzava does Task operations through Opzava application services
   (`@opzava/project-management`) under `withTenant`, acting principal, RBAC, and idempotency. The
   agent never supplies tenant/user authority.
6. Local acceptance should start with a protocol-faithful fake Gateway because the repo does not yet
   contain a runnable OpenClaw Gateway image pin, paired operator-device bootstrap, or compose
   service. That fake proves Opzava behavior only; it must not be recorded as real OpenClaw
   acceptance.

The critical invariant is unchanged: broker is the only ACL to OpenClaw, the hot token is
paired-device `operator.write` + `operator.approvals` only, and admin/pairing/Docker authority stays
outside the chat hot path.

## Locked recommendations

### 1. Platform Gateway locally

Recommendation: add one compose-managed `openclaw-platform-gateway` only after the implementation
can run the official OpenClaw Docker flow with persistent state/config/workspace volumes and a
paired operator device token. Until then, ship Slice 2 against a protocol-faithful fake Gateway in
`apps/gateway-broker` tests/local dev, with an explicit acceptance label: "fake Gateway, not real
OpenClaw acceptance."

Why:

- OpenClaw Docker is optional, and the official image names are `ghcr.io/openclaw/openclaw` or
  `openclaw/openclaw`; the docs show `latest`, `main`, and version tags such as `2026.2.26` but do
  not pin the current Opzava runtime version. Cite: `docs/openclaw/install/docker.md`.
- Docker persistence uses mounted config/state/workspace paths: config maps to
  `/home/node/.openclaw`, workspace to `/home/node/.openclaw/workspace`, and auth profile secret
  material to `/home/node/.config/openclaw`. Cite: `docs/openclaw/install/docker.md`.
- Docker health endpoints are `/healthz` and `/readyz`, and the image has a built-in health check
  for `/healthz`. Cite: `docs/openclaw/install/docker.md`.
- Gateway config is JSON5 at `~/.openclaw/openclaw.json`; invalid config makes Gateway startup fail
  or hot reload skip the candidate. Cite: `docs/openclaw/gateway/configuration.md`.
- Device tokens are issued after pairing and returned in `hello-ok.auth`; token rotation/revocation
  is under `device.token.rotate` / `device.token.revoke`. Cite: `docs/openclaw/gateway/protocol.md`
  and `docs/openclaw/cli/devices.md`.

Compose parity design:

- Local and Dokploy should use the same single compose contract. Add Gateway service only when
  image/tag and bootstrap are locked, using explicit volumes: `openclaw-platform-config`,
  `openclaw-platform-workspace`, and `openclaw-platform-auth-secrets`.
- Secrets stay in existing compose secret/env mechanisms or `SecretsVaultPort` refs. Never commit
  Gateway tokens, provider keys, device tokens, or bootstrap codes.
- Pairing bootstrap is a provisioning/platform-ops job, not a browser action: the worker uses
  temporary `operator.admin`/pairing authority to approve the broker device, stores only a vault
  reference to the resulting hot token, then the broker reconnects with `operator.write` +
  `operator.approvals`.
- The broker never receives Docker access and never performs pairing/admin mutation in the hot path.

Fallback:

- Implement `FakeOpenClawGateway` as a local WebSocket server that emits the documented
  `connect.challenge`, accepts the documented `connect` request, enforces protocol v4 and requested
  scopes, requires idempotency keys on mutating fake methods, and emits documented event families
  needed by Slice 2.
- The fake must intentionally not simulate image startup, real pairing storage, token rotation,
  provider auth, tool policy internals, or Docker/container behavior. Those remain de-risk
  follow-ups.
- Real OpenClaw acceptance is unblocked by selecting an exact image tag, automating device-keypair
  pairing, and proving the operator WS handshake against the container through compose.

2e implementation status (2026-07-02):

- Implemented Opzava-owned, versioned Ask Admin Opzava artifacts (`SOUL.md`, `IDENTITY.md`,
  `AGENTS.md`), the `ask-admin-opzava` agent config fragment with `skills: []`, and the ADR-005
  deny-wins tool policy source in `apps/workers/src/provisioning`. The rendered receipt records
  hashes and a `SecretsVaultPort` device-token ref only; it never records the token value. Agent
  config and tool-policy claims still map to `docs/openclaw/gateway/config-agents.md` and
  `docs/openclaw/gateway/config-tools.md`.
- Implemented a worker bootstrap entry, `pnpm --filter @opzava/workers bootstrap:platform-gateway`,
  that reads a running Gateway URL, renders provisioning materials, stores a provided local operator
  device token in a dev-only file-backed vault, and otherwise prints the documented manual CLI
  boundary for `openclaw devices approve` / `openclaw devices list`. Operator device approval is
  still CLI-mediated because `docs/openclaw/cli/devices.md` documents approval by exact `requestId`,
  while `docs/openclaw/gateway/pairing.md` covers node pairing rather than a complete
  non-interactive operator-device bootstrap.
- Implemented a profile-gated `openclaw-platform-gateway` compose service using the official
  `ghcr.io/openclaw/openclaw:${OPENCLAW_IMAGE_TAG:-2026.6.11}` image, persistent
  config/workspace/auth-profile volumes, `/healthz` healthcheck, no Traefik labels, and no
  default-profile startup. This is compose material only; it does not mark real OpenClaw acceptance
  complete.
- Remaining real-acceptance gates: approve/persist the broker paired-device token, prove the real
  `hello-ok` scope set is only `operator.write` + `operator.approvals` plus the live Gateway's
  materialized `operator.read`, run the broker operator WS handshake against the real container, and
  prove an actual provider-backed agent response. Until those pass, fake-lane tests remain the
  Slice 2 regression signal and not OpenClaw acceptance.

### 2. Operator WS handshake

Recommendation: implement the broker OpenClaw client exactly to `docs/openclaw/gateway/protocol.md`:
wait for `connect.challenge`, sign the nonce with the broker device keypair, send `connect` as a
request frame with role `operator`, `minProtocol: 4`, `maxProtocol: 4`, scopes
`["operator.write", "operator.approvals"]`, and the stored paired device token in
`auth.deviceToken`.

Exact frame shapes:

```json
{
  "type": "event",
  "event": "connect.challenge",
  "payload": { "nonce": "...", "ts": 1737264000000 }
}
```

```json
{
  "type": "req",
  "id": "connect:<tenant-route-id>",
  "method": "connect",
  "params": {
    "minProtocol": 4,
    "maxProtocol": 4,
    "client": {
      "id": "cli",
      "version": "0.0.0",
      "platform": "node",
      "mode": "cli"
    },
    "role": "operator",
    "scopes": ["operator.write", "operator.approvals"],
    "caps": [],
    "commands": [],
    "permissions": {},
    "auth": { "deviceToken": "<paired-device-token>" },
    "locale": "en-US",
    "userAgent": "opzava-gateway-broker/0.0.0",
    "device": {
      "id": "<sha256-hex-of-raw-ed25519-public-key>",
      "publicKey": "<raw-ed25519-public-key-base64url>",
      "signature": "<signature>",
      "signedAt": 1737264000000,
      "nonce": "<challenge-nonce>"
    }
  }
}
```

Responses and events:

- Request frame: `{ "type": "req", "id": "...", "method": "...", "params": {} }`.
- Response frame: `{ "type": "res", "id": "...", "ok": true, "payload": {} }` or
  `{ "type": "res", "id": "...", "ok": false, "error": {} }`.
- Event frame: `{ "type": "event", "event": "...", "payload": {}, "seq": 1, "stateVersion": 1 }`.
- Successful connect returns `hello-ok` with negotiated protocol, server, features, snapshot, auth,
  and policy. Honor `policy.maxPayload`, `policy.maxBufferedBytes`, and `policy.tickIntervalMs`.
- Startup sidecars may return retryable `UNAVAILABLE` with `details.reason: "startup-sidecars"` and
  `retryAfterMs`.
- Side-effecting methods require idempotency keys. The docs say to see schema for exact method-level
  keys; this repo does not vendor the TypeBox schema, so Slice 2 must send `idempotencyKey` anywhere
  OpenClaw method params accept it and enforce idempotency at the broker/Opzava command boundary
  regardless.

OpenClaw citations: `docs/openclaw/gateway/protocol.md`, `docs/openclaw/gateway/operator-scopes.md`,
`docs/openclaw/cli/devices.md`.

### 3. Ask Admin Opzava agent definition

Recommendation: provision one platform agent `ask-admin-opzava` as an OpenClaw agent entry with its
own workspace/agentDir, bootstrap files, and strict tool policy. Opzava owns the persona source,
version, admission policy, audit, and task tool implementation; OpenClaw owns the runtime session,
streaming, workspace files, effective tool inventory, approvals, and tool policy enforcement.

Agent config intent:

- `agents.list[]` entry: `id: "ask-admin-opzava"`, a dedicated workspace under the platform Gateway
  volume, a dedicated agent directory, no inherited broad skills, and a model configured through the
  existing OpenClaw model config.
- `SOUL.md`: concise platform-ops/admin assistant behavior, with explicit refusal language for
  tenant/user-supplied ids, secrets, Docker, admin scopes, filesystem mutation, and cross-tenant
  actions.
- `IDENTITY.md`: "Ask Admin Opzava", an admin assistant identity, never a human user and never an
  OpenClaw operator credential.
- `AGENTS.md`: standing instructions that Task operations happen only through Opzava-owned tools
  admitted by the broker, not by inventing direct SQL, Gateway config edits, or Docker actions.
- Tool policy deny list for standard agent: `["group:runtime", "write", "edit", "apply_patch"]`;
  also deny `group:fs` if read-only file tools are not needed.

OpenClaw-native mechanisms harnessed:

- Agent/workspace configuration and multi-agent routing from
  `docs/openclaw/gateway/config-agents.md` and `docs/openclaw/gateway/configuration.md`.
- Bootstrap files and workspace context injection from `docs/openclaw/gateway/config-agents.md`.
- Tool allow/deny groups and deny-wins semantics from `docs/openclaw/gateway/config-tools.md` and
  `docs/openclaw/gateway/sandbox-vs-tool-policy-vs-elevated.md`.
- Runtime tool inventory and `tools.effective`/`tools.invoke` from
  `docs/openclaw/gateway/protocol.md`.

Opzava-owned mechanisms:

- Which users may access Ask Admin Opzava.
- Tenant/workspace/actor derivation.
- Task read/create/update application services.
- Conversation persistence, final assistant message, tool outcome audit, and idempotency.
- Redaction and incident/admin-card policy when Slice 2 later expands beyond Tasks.

### 4. Task read/create/update mechanism

Recommendation: expose Tasks to the agent through Opzava-owned application tools executed
server-side by the broker/runtime-control service, not through OpenClaw Gateway task ledger RPCs and
not through browser-supplied ids.

Use three tool names:

- `opzava_tasks_list({ status?, limit? })`
- `opzava_tasks_create({ title, description?, status?, priority?, labels? })`
- `opzava_tasks_update({ taskId, title?, description?, status?, priority?, labels? })`

Execution contract:

- Tool calls enter `packages/runtime-control` with a `ToolExecutionContext` containing the
  authenticated Opzava principal, org id, workspace id, assistant turn id, and command idempotency
  key.
- `packages/runtime-control` calls `@opzava/project-management` services: `listTasks`, `createTask`,
  `updateTask`, and `moveTask`.
- Those services already validate shared-kernel ids, call `AuthorizationPort`, and execute SQL under
  `withTenant(orgId, fn)`. Code citations: `packages/project-management/src/application/tasks.ts`,
  `packages/adapters/src/postgres/tenant-context.ts`.
- The tool wrapper ignores any tenant id, user id, workspace id, Gateway ref, or agent id returned
  by the model. Browser/model ids are hints at most.
- Every mutating tool requires an Opzava idempotency key, scoped by
  `(orgId, assistantTurnId, toolCallId, toolName)`, and write-throughs the returned task DTO to the
  UI.

Why not OpenClaw task ledger:

- OpenClaw `tasks.list/get/cancel` are Gateway background task ledger RPCs with sanitized runtime
  summaries, not Opzava PM Task storage. Cite: `docs/openclaw/gateway/protocol.md`.
- `tools.invoke` can invoke available Gateway tools through Gateway policy, but Opzava Tasks are
  product data under RLS, so the side effect must execute in Opzava application services. Cite:
  `docs/openclaw/gateway/protocol.md`.

Native extension options:

- Tool-only plugin with `defineToolPlugin` is a valid OpenClaw mechanism for fixed agent-callable
  tools. Cite: `docs/openclaw/plugins/tool-plugins.md`.
- MCP servers are configurable under `mcp.servers` and expose tools to embedded OpenClaw runtimes.
  Cite: `docs/openclaw/gateway/configuration-reference.md`.
- Webhooks plugin is for authenticated TaskFlow ingress, not the primary Opzava Tasks command path.
  Cite: `docs/openclaw/plugins/webhooks.md`.

Recommendation detail: implement the first Slice 2 tools as broker-owned server-side application
tools and project them to OpenClaw through the narrowest supported native mechanism during
implementation. If plugin/MCP projection is not ready, the broker may run the tools out-of-band
based on assistant structured tool requests, but the tool outcome still persists as Opzava truth and
the fake Gateway must not count as native-tool acceptance.

### 5. Browser streaming path

Recommendation: for Slice 2 only, use a Next App Router route handler with Server-Sent Events from
`apps/web` to the browser. Keep the ADR-009 broker WS hub as the target architecture and promote to
thin authenticated WS in the P2 realtime slice.

Why:

- Slice 2 needs one-way token deltas into one Tasks panel, not full bidirectional chat, typing,
  presence, or reconnect backfill.
- Current dependencies already include Next 16.2.9 and React 19.2.7 per `docs/plan/official-docs.md`
  and `docs/plan/research/slice1-foundation-stack.md`.
- Avoid adding Socket.IO before the broker WS hub, Redis backplane, and Internal Collaboration
  sequence/backfill model exist.

Flow:

1. Browser submits a message to `/api/tasks/ask-admin/turn` with a client idempotency key.
2. Route handler authenticates through `getAppSessionContext`; tenant, workspace, user, and roles
   come from the session only.
3. Runtime-Control creates a durable user turn and starts a broker stream.
4. SSE route emits normalized events: `queued`, `delta`, `tool.started`, `tool.succeeded`,
   `tool.failed`, `assistant.final`, `failed`.
5. Token deltas are live state only. They update one draft assistant bubble.
6. On finalization, Runtime-Control writes one durable assistant turn/message keyed by
   `(conversationId, assistantTurnId)` and marks the stream finalized.
7. Tool-created/updated tasks return write-through Task DTOs; the client patches list/kanban
   immediately, and the route also triggers the normal Tasks revalidation path for reload
   correctness.

ADR-009 alignment:

- This is the accepted degraded one-way path for Slice 2. It must not add presence, typing, durable
  chat ordering, or Redis semantics.
- Final durable message and task changes live in Postgres. Duplicate stream completion, webhook
  completion, retry, or reconnect cannot create a second assistant message.
- P2 replaces this with the broker-hosted WS hub and Redis fan-out described in ADR-009.

OpenClaw stream citations: `docs/openclaw/gateway/protocol.md` documents `chat` events with
`deltaText`, `session.message`, `session.operation`, `session.tool`, `sessions.messages.subscribe`,
and `agent.wait`.

### 6. Persistence ownership and 0003 migration

Recommendation: create a new `packages/runtime-control` bounded context for assistant conversations,
turns, stream status, tool outcomes, idempotency, and OpenClaw opaque refs. Keep AI employee/persona
policy in future AI Workforce, and keep human chat rooms in future Internal Collaboration.

Initial schema for migration `0003_slice2_runtime_control.sql` in the existing one-shot migration
stream:

- `assistant_conversations`
  - `id uuid primary key default gen_random_uuid()`
  - `organization_id uuid not null references organizations(id)`
  - `workspace_id uuid not null references workspaces(id)`
  - `surface text not null` with initial value `tasks.ask_admin`
  - `assistant_key text not null` with `ask-admin-opzava`
  - `status text not null` such as `open`, `archived`
  - `created_by_user_id text not null references auth_users(id)`
  - timestamps
- `assistant_turns`
  - `id uuid primary key default gen_random_uuid()`
  - `conversation_id uuid not null`
  - `organization_id uuid not null`
  - `workspace_id uuid not null`
  - `role text not null` values `user`, `assistant`, `tool`, `system`
  - `actor_user_id text null`
  - `assistant_key text null`
  - `content jsonb not null default '{}'::jsonb`
  - `status text not null`
  - `idempotency_key text not null`
  - `openclaw_session_ref text null`
  - `openclaw_run_ref text null`
  - `created_at`, `finalized_at`
  - unique `(organization_id, idempotency_key)`
- `assistant_tool_outcomes`
  - `id uuid primary key default gen_random_uuid()`
  - `organization_id uuid not null`
  - `workspace_id uuid not null`
  - `turn_id uuid not null`
  - `tool_name text not null`
  - `tool_call_id text not null`
  - `idempotency_key text not null`
  - `status text not null`
  - `request_summary jsonb not null default '{}'::jsonb`
  - `result_summary jsonb not null default '{}'::jsonb`
  - `target_ref text null`
  - `created_at`, `completed_at`
  - unique `(organization_id, idempotency_key)`

RLS must copy the `0002` Tasks pattern:

- `alter table ... owner to opzava_owner`
- explicit grants to `opzava_app`
- `enable row level security`
- `force row level security`
- permissive tenant-isolation policy on `organization_id = app.current_org_id()`
- restrictive no-context policy `app.current_org_id() is not null`
- owner/admin policy for migration owner
- composite `(workspace_id, organization_id)` foreign key to prevent cross-org workspace attachment

Code citations: `packages/identity-access/drizzle/0002_slice1e_tasks.sql`,
`packages/project-management/src/adapters/postgres/schema/tasks.ts`,
`packages/adapters/src/postgres/tenant-context.ts`, `docs/plan/research/slice1b-data-rls.md`.

### 7. Sub-slice plan

Recommendation: implement Slice 2 as six small sub-slices, each with a tdd-able acceptance boundary.
Also reorder the dogfood Tasks seed during Slice 2 to the decided order: Slice 2, Slice 3 CRM core,
Slice 4 Marketing content pipeline, then P1-P8 remainders.

#### 2a - Runtime-Control persistence and ports

Goal: create the Opzava-owned assistant data model and vendor-neutral ports.

Deliverables:

- `packages/runtime-control` with DTOs, application services, and fake ports.
- `packages/ports` exports `OpenClawGatewayPort` and `RealtimeTransportPort`.
- Migration `0003_slice2_runtime_control.sql` and manifest/journal update.

Acceptance:

- A service can create a conversation, append a user turn, finalize exactly one assistant turn, and
  persist one tool outcome under `withTenant`.

Test strategy:

- Unit tests for idempotency and state transitions.
- RLS integration tests copying the 0002 pattern: cross-tenant invisible, cross-tenant write denied,
  missing tenant context maps to 403.

#### 2b - Broker operator client and fake Gateway

Goal: make `apps/gateway-broker` the owner of the OpenClaw operator protocol surface.

Deliverables:

- Protocol DTOs internal to the broker.
- Challenge/connect implementation with device signature abstraction.
- Lazy per-tenant connection manager with jittered backoff and circuit breaker.
- Fake Gateway fixture implementing the documented frames and Slice 2 event families.

Acceptance:

- Broker connects to fake Gateway, negotiates protocol v4, sends one idempotent session request,
  receives delta events, and maps failures to Opzava errors without leaking OpenClaw frames.

Test strategy:

- Broker unit/integration tests with fake Gateway: startup `UNAVAILABLE`, scope mismatch, duplicate
  request id/idempotency, mid-stream close, reconnect budget, unknown event family fail-closed.

#### 2c - Ask Admin Tasks stream route and UI panel

Goal: add a usable chat panel on the Tasks board with live assistant deltas.

Deliverables:

- Next route handler for starting/streaming one turn.
- Client panel in `apps/web/components/tasks`.
- Stream states: queued, working, tool running, finalizing, completed, failed, gateway unavailable,
  policy denied.

Acceptance:

- A user can send one prompt from `/tasks`, see streamed text, and reload to see the finalized
  assistant response.

Test strategy:

- Component tests for stream state rendering and duplicate finalization.
- Route/service tests with fake Runtime-Control and fake broker.

#### 2d - Task tools through Project Management services

Goal: let Ask Admin Opzava list/create/update Tasks through governed server tools.

Deliverables:

- Runtime-Control tool registry for `opzava_tasks_list/create/update`.
- Tool executor calls `@opzava/project-management` under session-derived org/workspace/actor.
- Idempotent task writes and write-through Task DTOs to the stream.

Acceptance:

- "Add a task called X" creates exactly one Task.
- "Move X to in progress" updates the same Task.
- "List the current tasks" reads only authorized workspace Tasks.

Test strategy:

- Application tests for authz denial, RLS denial, duplicate tool call, idempotency conflict,
  malformed model args, and write-through result.

#### 2e - Agent definition and provisioning receipt

Goal: define the real Ask Admin Opzava OpenClaw artifacts without giving the chat path admin
authority.

Deliverables:

- Versioned persona/tool-policy source files in Opzava-owned code/config.
- Provisioning job shape for rendering `SOUL.md`, `IDENTITY.md`, `AGENTS.md`, and Gateway agent
  config.
- Secrets/vault references for broker device token.
- Documentation of the real OpenClaw bootstrap blocker if still using fake Gateway.

Acceptance:

- Provisioning receipt records the expected agent id, workspace, agentDir, tool-policy ref, and
  token ref without storing secrets.

Test strategy:

- Snapshot tests for rendered persona files and policy deny list.
- Service tests proving hot-path chat cannot request admin/pairing/talk.secrets.

#### 2f - Dogfood seed reorder and hardening pass

Goal: align the Tasks board seed with the new execution order and cover sad paths before Slice 2 is
called done.

Deliverables:

- Update `apps/workers/src/seed/roadmap.ts` order to Slice 2 -> Slice 3 CRM core -> Slice 4
  Marketing content pipeline -> P1-P8 remainders -> de-risk follow-ups.
- Add user-visible failure states for gateway down, stream interrupted, policy denied, and duplicate
  send.
- Add incident/admin-card hooks as no-op/future ports where needed, not a full ADR-013
  implementation.

Acceptance:

- Seed receipt returns the new order.
- Slice 2 acceptance prompt creates and updates Tasks once, and all designed sad paths have
  deterministic user-visible states.

Test strategy:

- Seed integration test update.
- End-to-end fake-Gateway happy path and sad-path route tests.

### 8. New dependency pins

Recommendation: prefer the already-pinned stack for Slice 2 and add only one broker dependency if
implementation proves a zero-new-dependency WebSocket client is not acceptable: `ws` in
`@opzava/gateway-broker`.

Dependency policy:

- Already pinned/validated stack remains: Node 24.18, pnpm 11.9, Next 16.2.9, React 19.2.7,
  TypeScript 5.9.x, Drizzle 0.45.2, pg 8.22.0, Postgres 18.4, Better Auth 1.6.23, Tailwind 4.3,
  Traefik 3.6.1, Vitest 4. Cite: `docs/plan/official-docs.md` and
  `docs/plan/research/slice1-foundation-stack.md`.
- Do not add Socket.IO in Slice 2. ADR-009's broker WS hub and Redis fan-out are later than this
  one-panel SSE slice.
- If `ws` is added, pin the exact installed version in `pnpm-lock.yaml` during implementation and
  record validation against the `ws` official docs source listed in `docs/plan/official-docs.md`.
  This memo cannot honestly select a current `ws` patch from local docs alone.
- Do not add an OpenClaw npm SDK unless the vendored docs identify one as the supported Gateway
  protocol client. Current `docs/openclaw/**` documents the WS frames and CLI/container flows, not
  an Opzava-ready JS client package.

## Sad-path ledger

| Sad path                                        | Design response                                                                                                                                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gateway down or unreachable                     | Stream route returns `gateway_unavailable`; conversation turn persists failed/degraded status; Tasks remain available from Postgres. Broker circuit opens per tenant and backs off with jitter.                                       |
| Gateway startup sidecars not ready              | Broker treats connect `UNAVAILABLE` with `details.reason: "startup-sidecars"` and `retryAfterMs` as retryable within budget. Cite: `docs/openclaw/gateway/protocol.md`.                                                               |
| WS dies mid-stream                              | Runtime-Control keeps the user turn and partial live draft as non-final; UI shows retry/degraded. Final assistant message is written only by finalization idempotency.                                                                |
| Duplicate/replayed send                         | Client idempotency key plus server `(orgId, idempotencyKey)` unique constraint returns the existing turn/outcome instead of creating a second message or task.                                                                        |
| Idempotency collision                           | Same key with different normalized payload returns a conflict state, not a retry. No OpenClaw resend until user explicitly retries with a new key.                                                                                    |
| RLS/authz denial in task tool                   | Project Management service returns forbidden; UI shows policy-denied; denial is not converted to empty list. Code path stays under `AuthorizationPort` and `withTenant`.                                                              |
| Agent supplies tenant/user/workspace ids        | Ignored. Server derives context from authenticated session and persisted conversation scope.                                                                                                                                          |
| Stream-vs-persist divergence                    | Live deltas are ephemeral. One durable assistant turn is written on finalization. If finalization fails after task mutation, tool outcome/task write remains durable and assistant turn marks `finalize_failed` for repair.           |
| Task write succeeds but SSE disconnects         | Command path is write-through in Postgres; reload shows the created/updated Task and conversation status.                                                                                                                             |
| Task write fails after assistant text           | Tool outcome records failure and assistant final message must mention the action did not complete; no optimistic permanent task card without confirmed DTO.                                                                           |
| Token/secret exposure                           | Browser, logs, transcripts, tool summaries, debug bundles, and DB rows never store device tokens, provider keys, Gateway shared token, channel secrets, or raw Gateway config. Store vault refs/fingerprints only.                    |
| Hot token scope drift                           | Broker compares negotiated `hello-ok.auth.scopes` to expected `operator.write` + `operator.approvals` plus only the live Gateway's materialized `operator.read`; missing or extra sensitive scopes fail closed and create an admin-observability event. |
| Device signature failure                        | Broker surfaces stable auth failure and stops reconnect loops for nonce/signature codes. Cite: `docs/openclaw/gateway/protocol.md`.                                                                                                   |
| Unknown OpenClaw event family                   | Scope/event handler fail-closed: log sanitized event metadata, do not project payload, force snapshot reconciliation where available.                                                                                                 |
| Broker process pressure                         | Per-tenant lazy connect, fd limits, buffered-byte caps from `hello-ok.policy`, and circuit breakers prevent one Gateway from starving others.                                                                                         |
| Orphan Gateway risk                             | Slice 2 broker never creates runtime containers or routes. Real Gateway service waits for provisioning/reaper controls; fake Gateway cannot create routable orphans.                                                                  |
| OpenClaw fake accepted as real                  | Explicit acceptance label blocks this: fake Gateway tests can satisfy Opzava behavior only; real OpenClaw acceptance requires official image, pairing, and protocol proof.                                                            |
| Admin/pairing/Docker action attempted from chat | Deny in broker admission and tool policy; admin/provisioning credentials stay in platform-ops jobs only.                                                                                                                              |
| Tool policy bypass via SOUL/persona             | Persona is advisory. Gateway tool policy, broker admission, Opzava RBAC, and application services enforce authority. Cite: `docs/openclaw/gateway/config-tools.md` and `docs/openclaw/gateway/sandbox-vs-tool-policy-vs-elevated.md`. |

## Open questions requiring user decision

None blocking for the design. The only implementation-time decision is whether Slice 2 is allowed to
add `ws` to `@opzava/gateway-broker` after checking the official `ws` docs and installed package
metadata, or whether the broker must stay on the already-pinned dependency set.

## Red-team response (2026-07-02)

Review source: `docs/plan/consensus/slice2-design-redteam.spark.md`. Verdict was UNSOUND. The
following resolutions are locked for implementation.

1. 0003 tenant graph hardening: `assistant_turns` must carry `(conversation_id, organization_id)` ->
   `assistant_conversations(id, organization_id)`, `assistant_tool_outcomes` must carry
   `(turn_id, organization_id)` -> `assistant_turns(id, organization_id)`, and every Runtime-Control
   table with `workspace_id` must carry `(workspace_id, organization_id)` ->
   `workspaces(id, organization_id)`. This copies the composite tenant-FK pattern from
   `0002_slice1e_tasks.sql`.

2. Idempotency is scoped to the real command lineage, not the whole tenant. Assistant turns are
   unique on `(organization_id, conversation_id, idempotency_key)`. Tool outcomes are unique on
   `(turn_id, tool_call_id)`. Tool execution is outcome-first: insert a `started` receipt before any
   PM mutation. A retry that sees the receipt returns the recorded result if the request matches,
   returns the in-progress receipt if still running, or returns conflict if the same tool call id is
   reused for a different payload. Project Management services stay unchanged; Runtime-Control owns
   the command envelope and deduplication.

3. `withTenant` must assert `current_user = 'opzava_app'` before setting tenant context. Owner,
   superuser, or `BYPASSRLS` runtime connections fail closed as 403. This is a DB-role invariant,
   not a test-only guard.

4. Broker token provenance is part of the protocol contract. The broker may use only paired-device
   auth for the hot path. It must never connect with shared-secret mode, because
   `docs/openclaw/gateway/operator-scopes.md` says shared-secret bearer auth restores the normal
   full operator default scope set. `hello-ok.auth.scopes` must contain `operator.write` and
   `operator.approvals` and may contain only the live Gateway's materialized `operator.read` in
   addition; missing, duplicated, admin, pairing, talk-secret, or unknown scopes fail closed and emit
   an admin-observability event.

5. The Slice 1e Project Management context contract stands: PM services accept `orgId`,
   `workspaceId`, and actor fields, but callers must ground those fields in a verified principal and
   RLS remains the database backstop. Runtime-Control therefore exposes `ToolExecutionContext` as a
   branded type constructible only from the session-derived principal shape. Model output can never
   construct or override tenant, workspace, actor, role, Gateway, or tool authority.

6. Tool inventory drift is denied at runtime. The broker must call `tools.effective` for the
   selected session and compare the returned inventory with Opzava's expected task-tool inventory.
   Unknown, missing, plugin-added, or policy-drifted tools fail closed and create an admin event.
   Static deny lists remain necessary but not sufficient.

7. `assistant_turns.status` is a state machine: `queued -> streaming -> finalizing -> final|failed`.
   State transitions use guarded conditional `UPDATE`s so one writer owns finalization. Duplicate
   finalize after `final` is a no-op that returns the recorded final turn.

8. Tool outcome rows bind `tool_call_id` to the owning turn before task mutation. This is the
   durable receipt that reconciles stream failure, browser retry, broker reconnect, and PM
   write-through.

9. `docs/plan/EXECUTION.md` deliverable "Provision one platform OpenClaw agent" remains unchecked
   until a real Gateway proof runs against the official image, pairing store, protocol handshake,
   and real scope negotiation. Fake-Gateway tests are explicitly the fake lane and cannot satisfy
   real-Gateway acceptance.

10. Protocol negotiation must follow `docs/openclaw/gateway/protocol.md`: send min/max protocol,
    handle `AUTH_SCOPE_MISMATCH` as a pairing/scope contract failure rather than a bad-token retry,
    and fail closed on unknown event families. The fake Gateway must include adversarial mismatch
    tests for protocol range, scope mismatch, shared-secret rejection, and unknown events.

11. Missing-row behavior is intentionally uniform for cross-tenant probes: row absence returns
    `not_found` to hide existence. AuthorizationPort denial remains distinct and returns
    `forbidden`. This preserves ADR-007 fail-closed authorization without leaking cross-tenant
    resource existence.

12. `ws` is allowed in `apps/gateway-broker` for Slice 2 implementation. The exact version is pinned
    at install time and validated against the official `ws` docs listed in
    `docs/plan/official-docs.md`. Sub-slice 2a adds no new npm dependency.

### Live bring-up findings (2026-07-02, real Gateway)

- `ghcr.io/openclaw/openclaw` pulls publicly; pinned `2026.6.11` (built 2026-06-30). Same digest on
  docker.io.
- Compose profile `openclaw` brings the platform Gateway UP and HEALTHY locally (`/healthz` 200 on
  host port 18799 via local override; 18789 is the developer's own OpenClaw).
- Required first-run steps proven: `config set gateway.mode=local` + `gateway.bind=lan` via
  in-container CLI, then `OPENCLAW_GATEWAY_TOKEN` set (gateway refuses lan bind without auth —
  fail-closed as documented). Compose `command` must be `["node","openclaw.mjs","gateway",...]`
  (image entrypoint is tini; a bare `gateway` arg does not exec).
- CLI works in-container via loopback only
  (`docker compose exec ... node openclaw.mjs devices list --url ws://127.0.0.1:18789/`); plaintext
  ws:// to non-loopback is refused by the CLI (documented security posture).
- REMAINING for real acceptance: (1) approve a real pending device if required and persist the fresh
  device token via vault ref; (2) prove the real broker hot-path handshake with that paired token;
  (3) add a model-provider credential on the Gateway for actual agent responses (user-supplied).
- 2f implementation status: pairing initiation and token issuance are now implemented in the worker
  bootstrap. It can dial with no credential to create a pending approval, dial with
  `OPENCLAW_GATEWAY_TOKEN` as `auth.token` to create/complete device-token issuance, store only the
  resulting vault ref, and immediately re-dial with the fresh token as `auth.deviceToken` to prove the
  narrow hot-path contract. It also validates a provided `OPENCLAW_OPERATOR_DEVICE_TOKEN` as
  `auth.deviceToken` by completing `connect.challenge` -> `connect` -> `hello-ok` with protocol v4
  and only `operator.write` + `operator.approvals` plus the live Gateway's materialized
  `operator.read`. Remaining real acceptance: approve a real pending device if required, persist the
  real token, prove the broker hot-path handshake against the real container, and add a user-supplied
  model-provider credential for actual responses.
- Live protocol correction from the running `2026.6.11` dist source: the external operator client
  presentation is enum-validated as `client.id: "cli"` and `client.mode: "cli"`; the stale docs
  example using `mode: "operator"` is rejected before auth. Device `publicKey` on the wire is the
  raw 32-byte Ed25519 public key encoded base64url, and `device.id` is the full SHA-256 hex digest
  of those raw bytes. Signature payload v2 is exactly
  `["v2", deviceId, clientId, clientMode, role, scopes.join(","), String(signedAtMs), token ?? "", nonce].join("|")`;
  v3 appends normalized platform and device family. The fake Gateway now enforces the same client
  presentation, device-id derivation, challenge nonce, signed-at skew, and v2 payload verification
  in the fake lane.
- Live auth correction from the running `2026.6.11` dist source: `auth.token` is always compared
  against the shared Gateway token. Paired device credentials must ride in `auth.deviceToken`; stale
  values fail as `device token mismatch (rotate/reissue)`. Signature token resolution is
  `auth.token ?? auth.deviceToken ?? auth.bootstrapToken`, so the v2 payload token field must be the
  exact credential presented on that connect attempt. A shared-token connect with a device identity
  returns `PAIRING_REQUIRED` with `details.requestId` while unapproved; once approved, `hello-ok.auth`
  includes a fresh per-device `deviceToken` and `issuedAtMs`. Approval is bound to client metadata
  (platform, userAgent, client version), so issuance and validation use the same bootstrap constants.
  Shared-token connects may materialize broader scopes, but the immediate validation re-dial must be
  exactly the hot-path set plus `operator.read`.

### Live proof (2026-07-03)

Full bootstrap ran end-to-end against the real Gateway (2026.6.11): gateway-token issuance dial ->
PAIRING_REQUIRED -> in-container `devices approve` (direct-local fallback path) -> fresh device token
issued in `hello-ok.auth.deviceToken` -> stored to the dev vault by ref -> immediate validation dial with
`auth.deviceToken` -> hello-ok protocol 4, scopes exactly `operator.approvals, operator.read,
operator.write`. Remaining for full Slice 2 acceptance against the real agent: install the ask-admin
agent config into the Gateway (config.patch), supply a model-provider credential (user-owned), and run
the acceptance prompt through the real loop. The fake lane remains the CI-authoritative test surface.
