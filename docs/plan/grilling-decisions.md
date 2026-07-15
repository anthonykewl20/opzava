# Opzava — Grilling Decisions Log

Running record of locked design decisions from the `/grilling` session. Feeds the eventual ADR/PRD
set. Consensus memos (codex GPT-5.5 xhigh + mmx MiniMax-M3) live in `docs/plan/consensus/`.

Project: custom web UI for **OpenClaw** — a Basecamp/Asana-style PM tool + CRM for marketing,
finance, promotions, and customer support. Surfaces OpenClaw features + the plugin Workboard;
self-logs errors into an Opzava-owned Incident/ErrorGroup lifecycle, with an optional Dev Board
Incidents projection and separately linked remediation DevTickets where permanent work is needed.

---

## Governing principles (apply to every decision)

- **Scale-ready modular DDD from day one — no MVP-then-rewrite.** Prefer properly-bounded /
  separated designs over "start simple, extract later." (user directive, 2026-07-01)
- **Architect posture: agnostic, sad-path-first, edge-case-driven.** Keep the core domain
  vendor-neutral (externals behind ports / anti-corruption layers); lead every design with failure
  modes and edge cases, not the happy path.
- **OpenClaw capability parity — harness, do not reinvent.** Design strictly to what `docs/openclaw`
  says OpenClaw can and cannot do; surface and orchestrate its native capabilities (tool policy,
  sandbox, memory/wiki/skills, cron, channels, sessions, Workboard) rather than building parallel
  mechanisms. Stay on OpenClaw's grain. (user directive)
- **Official docs before coding APIs.** Training knowledge is a starting point, never the source of
  truth. Validate OpenClaw against `docs/openclaw` and validate every framework, language, and
  library against current official docs in `docs/plan/official-docs.md` before implementation.
- **Lean VPS / cheap ops — efficiency first.** Prefer the lowest-resource control that meets the
  goal; avoid per-project processes/containers; keep resource cost O(tenants), not
  O(tenants×projects). (user directive)

---

## Product vision (crystallized 2026-07-01)

Opzava is an **AI-staffed company-in-a-box**: OpenClaw-backed AI agents that **act like real human
teammates** across **Marketing, Customer Support, Finance, and Customer Management**, working
alongside humans to **grow the business**. Humans + AI collaborate in a **Slack-grade internal chat
hub** (Opzava-owned; simple/durable/reliable/flexible) where the AI assistants are **first-class
participants** — bridged to OpenClaw agents via the **broker** (live token streaming) and the
**Webhooks plugin** (TaskFlow ingress for external automation + proactive delivery). Delivered as a
**PWA** (installable desktop + mobile) with **Web Push** notifications.

**Operating mode:** Opzava runs single-tenant internally first to market and promote Opzava itself.
The scale-ready multi-tenant architecture is retained; it runs one tenant now, not a public
multi-tenant SaaS yet. The completed admin Tasks MVP is historical as-built substrate; the current
developer-operations target is the Dev Board pivot recorded below. CRM remains deferred to the
future user-side dashboard.

**Two assistant personas (= the two-token context split):**

- **Ask Opzava** — the tenant/user **Personal Assistant** (Runtime-Control context,
  `write`+`approvals` token, project-scoped knowledge).
- **Ask Admin Opzava** — the **platform-ops Admin assistant** (Provisioning/Platform-Ops context,
  `admin` token).

**Core domain = the multi-agent AI Workforce:** persona'd agents (`SOUL.md`/`IDENTITY.md`),
proactive via **heartbeat + cron + standing-orders**, task-handling via PM cards + `AgentDispatch`,
external customer comms via OpenClaw **channels**, organized into departments
(Marketing/Support/Finance/CRM).

---

## Q1 — Root architecture — LOCKED

**Opzava is a dedicated application backend (BFF) with its own durable, multi-tenant database**
(users, roles, workspaces/projects, tasks, CRM records, approvals, audit). The OpenClaw Gateway is a
**private, backend-only AI-runtime dependency** brokered via server-side RPC — never a client-facing
or data-of-record store. Rationale: OpenClaw docs state the Gateway is single-operator-domain and
_not_ a multi-tenant boundary, and the Workboard is deliberately small ("not a replacement for
Jira/Linear"). So RBAC/tenancy/sessions must live in the app.

## Q1b — Tech stack — LOCKED (user)

Next.js App Router + TypeScript + Postgres + **Drizzle** (locked 2026-07-02 via Slice 1 foundation
research — `docs/plan/research/slice1-foundation-stack.md`,
`docs/plan/research/slice1b-data-rls.md`) + shadcn/ui + Tailwind. Server-only OpenClaw RPC client.

## Q2 — Tenant ↔ Gateway topology — LOCKED

**Pure B: one OpenClaw Gateway per tenant/workspace, from day one.** No shared/pooled Gateway path.
Each tenant Gateway has its own profile, config, state, workspace, and port (ideally separate OS
user/host). Consensus: codex + mmx both recommended hybrid-C; user chose the stricter **pure-B** for
a single code path and uniform isolation. Implication: the broker must maintain a **tenant → Gateway
routing table** and provision/ deprovision Gateways over the tenant lifecycle. Accepted trade-off: a
Gateway fleet to orchestrate at scale (container/pod per tenant, pooling for dormant tenants) —
deferred, not designed yet. Consensus trail:
`docs/plan/consensus/q2-tenancy-topology.{codex,mmx}.md`.

## Q3 — OpenClaw RPC broker + auth — LOCKED

- **Transport: WS-first.** One persistent, scoped operator WebSocket per tenant Gateway carries both
  req/res commands (with idempotency keys) and server-push events. Admin HTTP RPC plugin kept only
  as an ops/break-glass surface.
- **Auth: per-Gateway paired device token, least privilege = `operator.write` +
  `operator.approvals`** (write implies read; excludes admin/pairing/talk.secrets → the app can
  drive agents/sessions/chat/cron and resolve approvals, but cannot mutate Gateway config or manage
  pairing). Token + keypair stored in Opzava vault, keyed by tenant.
- **Deployment: a SEPARATE long-lived Node `gateway-broker` service** owns the WS pool (one socket
  per ACTIVE tenant — lazy connect, idle-disconnect dormant), reconnect/backoff/circuit-breakers,
  and the tenant→Gateway routing table.
- **Credential split:** channel secrets (Slack/WhatsApp/Gmail) live inside each tenant Gateway;
  Opzava stores only Gateway reachability metadata (host/port/TLS fingerprint) + a vault reference
  to the broker device token. Consensus trail:
  `docs/plan/consensus/q3-rpc-broker-auth.{codex,mmx}.md`.

## Q4 — Data-model boundary + bounded contexts — LOCKED

- **Opzava-owned (Postgres system-of-record):** Identity & Access, Tenant Onboarding, Project
  Management, CRM, Marketing, Notifications/Admin-Observability.
- **OpenClaw-owned (reached ONLY via the ACL):** Agent Sessions, Runs & Streaming, Channels,
  Cron/Automation, Workboard (agent-work), Logs, Usage/Cost, **Skills, Memory (memory-lancedb active
  slot + memory-wiki companion)**.
- **Anti-Corruption Layer = the `gateway-broker`** — the single seam to OpenClaw; no OpenClaw type
  leaks past it.
- **Two card concepts stay separate, bridged:** `pm.Card` (Opzava, human work) vs `workboard.Card`
  (OpenClaw, agent work), bridged by an **`AgentDispatch`** aggregate holding OPAQUE refs
  (cardId/taskId/runId/sessionKey as value objects), lifecycle projected back. Cross-referenced,
  never a foreign key.
- **Hybrid CQRS:** durable UI data (agent-run summaries, activity, errors, usage/cost, session
  index, Workboard lifecycle) is PROJECTED into Postgres read models; ephemeral data (token
  streaming, live tail, logs, transcript detail, steering) is LIVE READ-THROUGH via the broker;
  never live-query OpenClaw storage.
- **Load-bearing invariant:** projections are a rebuildable cache; **OpenClaw RPC snapshots are
  truth, WS events are hints**; the command path is write-through (apply the synchronous req/res
  result immediately).
- **Agnostic ports:** OpenClawGatewayPort, EventBusPort (Postgres outbox+LISTEN/NOTIFY →
  Redis/NATS/Kafka later), SecretsVaultPort, ObjectStorePort, RealtimeTransportPort. Consensus
  trail: `docs/plan/consensus/q4-data-boundary-contexts.{codex,mmx}.md` (+ sad-path ledger: event
  loss/dup/order, read-your-writes, gateway down/deprovision, orphaned refs, idempotency,
  cross-tenant leak, protocol drift).

## Q4b — Knowledge Management + project↔workspace mapping + credentials — LOCKED

- **New bounded context: Project Knowledge Management.** Ports: `KnowledgeSourcePort` (Opzava SoT),
  `KnowledgeIndexPort` (adapter = OpenClaw wiki + lancedb over OKF, swappable),
  `EmbeddingProviderPort`, `SkillCatalogPort`.
- **Project ↔ knowledge** — ⚠️ **REVISED by Q8:** scoping is now **employee = workspace, project =
  shared corpus injected per assignment, org = corpus** (NOT one workspace per project). The main
  orchestrator remains a project-scoped facade; cross-project = RBAC-gated fan-out. See Q8 for the
  authoritative model.
- **KB source of truth = Opzava** (docs/notes/uploads in Postgres + object store).
  memory/wiki/vectors are **rebuildable derived indexes**; reprovision → idempotent,
  content-addressed re-ingestion keyed by `(tenantId, projectId, contentHash)` from a consistent
  published KB revision (dry-run diff before apply).
- **Ingestion seam = OKF bundles + `wiki okf import`** (portable, agnostic) + **s3-backed lancedb**
  for durable vectors.
- **autoCapture OFF** — auto-captured chat facts become **candidate KB entries in Opzava** (reviewed
  → promoted to SoT), never hidden Gateway-only state; preserves the rebuildable-from-SoT guarantee.
  (user)
- **Skills governance = admin-only curated catalog.** Skills installed ONLY via the audited
  provisioning path with `security.installPolicy` (fail-closed) + verification; tenants/projects
  SELECT from an Opzava catalog, never self-install arbitrary ClawHub skills (skills are executable
  code → RCE risk). (user)
- **Two-token credential model = a bounded-context split:** Runtime-Control context (hot path,
  `operator.write` + `operator.approvals`) vs Tenant Provisioning / Platform-Ops context
  (`operator.admin`, per-Gateway-scoped, short-lived/JIT, out-of-band worker only, fully audited).
  Consensus trail: `docs/plan/consensus/q4b-knowledge-credentials.{codex,mmx}.md`.

## Q4c — Execution isolation & security posture (efficiency) — LOCKED

- **NO per-project Docker sandbox.** Over-engineering given pure-B tenant isolation + curated
  admin-only skills; a container per project taxes the VPS for little gain (sandbox is "not a
  perfect boundary" per OpenClaw docs).
- **Primary control = TOOL POLICY (free hard stop), not sandbox.** Standard agents (orchestrator,
  project assistants, marketing/support) run **`sandbox.mode: off`** + tool policy DENY of
  `group:runtime` (exec/process/code_execution)
  - FS-mutating tools (write/edit/apply_patch). Allow chat, memory/wiki search, web
    (egress-allowlisted), messaging, sessions.
- **Sandbox ONLY for the rare code-executing agent** — then `scope: shared` per tenant, or offloaded
  to an `ssh`/`openshell` worker (a cheap separate box), keeping Docker off the main gateway VPS.
  Containers = O(tenants), not O(tenants×projects).
- **Real residual risk (neither sandbox nor tool policy stops it): data-flow attacks** — SSRF via
  `web_fetch`, prompt-injection/context-poisoning via RAG (wiki/web/doc content), secret
  exfiltration of the tenant's channel creds. Cheap mitigations: `web_fetch` egress/domain
  allowlist, input sanitization on ingested web/wiki content before it reaches the model, and a
  tool-invocation audit log. These are the security investments that matter and cost ~0 VPS load.
- **Ops win:** ~3–5x more tenants per VPS vs per-project containers. Consensus trail:
  `docs/plan/consensus/q4c-sandbox-efficiency.{codex,mmx}.md`.

## Q5 — Multi-tenancy & RBAC — LOCKED

- **Hierarchy: Organization (= tenant = one Gateway) → Project → Member.** No structural Team node;
  "team" is an optional membership grouping/label. **marketing/finance/promotions/support =
  departments / project-types / queues (attributes), NOT RBAC roles.**
- **RBAC = resource-scoped, roles-as-data, behind an `AuthorizationPort`.** Grants at org scope AND
  per-project scope; a single `can(user, action, resource)` evaluator. Not ReBAC/Zanzibar, not broad
  ABAC (evolvable to ReBAC behind the port).
- **Isolation = tenant-scoped repositories + Postgres RLS as a fail-closed backstop.**
  `SET LOCAL app.current_org` per transaction; RLS denies empty org context. **PgBouncer transaction
  pooling mode** (session pooling breaks `SET LOCAL`). App-only = one bug from a leak; RLS-only
  fights tooling — do both.
- **Roles: Owner / Admin / Manager / Member / Guest-Client.** External clients live in a separate
  `external_identities` table, bound to ONE project, least-privilege (read-only + narrow
  support-ticket resource), NO org-wide membership, NO access to the internal
  orchestrator/knowledgebase.
- **Confirmed: Opzava users are Postgres identities only** — no individual OpenClaw operator
  identities; the broker holds one scoped operator token per Gateway + a signed `x-acting-user` for
  audit. Compromised operator ≠ tenant compromise.
- **I&A aggregates:** Organization, User (global identity), Membership(user,org,role),
  RoleGrant(user,scope,role), Project, ExternalIdentity, Invitation.
- **Biggest sad path: cross-tenant leak via a forgotten tenant context.** RLS then returns EMPTY
  rows — the app must surface a hard **403, not a silent empty state.** Invariant: a centralized
  `withTenant(org, fn)` transaction wrapper is the ONLY path to tenant tables; integration tests
  assert 403 (not 200-empty); alert on 403 spikes. Consensus trail:
  `docs/plan/consensus/q5-tenancy-rbac.{codex,mmx}.md`.

## Q7 — Realtime + internal chat + AI assistants in-chat + PWA/Push — LOCKED

**Transport (consensus): self-hosted WebSocket hub in the `gateway-broker` service + Redis
backplane + Postgres outbox, behind a `RealtimeTransportPort`** (managed Ably/Pusher = a swap, not a
rewrite). Rejected SSE+POST (weak fan-out) and managed-default (vendor lock for a domain we own).
Per-surface: agent token streaming, activity/notifications, team chat/DM, mention inbox → WS hub +
Redis fan-out, durable via outbox; **presence + typing → Redis-only TTL heartbeats (10s/30s), never
Postgres**. **Internal Collaboration context (Opzava-owned, Postgres):**
`Channel {public|private|dm}` →
`Message {id, channel_id, thread_parent_id?, author_ref, body, seq, edited_at?, deleted_at?}`;
`Thread`; `Membership`; `Mention` (= mention inbox); `Reaction`;
`ReadCursor {channel,user,last_read_seq}`. **Fan-out:** outbox → `LISTEN/NOTIFY` → Redis pub/sub →
all WS instances; ordered by a **per-channel Postgres sequence**; at-least-once; client dedups by
`message_id` (send idempotency key). **Context split CONFIRMED distinct:** Internal Collaboration
(Opzava write model) vs External Channels (OpenClaw customer comms via ACL) vs Agent Sessions
(OpenClaw). Shared kernel = `UserId`, `TenantId`, `ProjectId`. **AI assistants as first-class chat
participants** (persona identity from `IDENTITY.md`): inbound (user/@mention) → Bridge in broker →
OpenClaw `sessions.send` scoped to the right workspace; outbound → agent WS stream relayed as a
streaming assistant message (live "typing"), finalized on completion; proactive/async
(heartbeat/cron/standing-order) → **Webhooks plugin** → Opzava receiver → posted; exec/plugin
approvals surface as interactive chat messages. **PWA + Web Push:** installable service-worker PWA
(desktop+mobile); **Web Push** (VAPID) behind a `PushNotificationPort` (native FCM/APNs later);
per-device `PushSubscription` in Postgres; push for DMs, @mentions, assistant completions,
approvals-needed, task assignments; in-app realtime when online, Web Push when backgrounded
(deduped); iOS = installed-PWA only (16.4+). **Sad-path invariants:** reconnect gap/dup →
per-channel `seq` backfill (`seq > client_seq LIMIT N`) before live attach + client dedup;
assistant/gateway down → degraded "assistant unavailable" + queued (per-tenant circuit breaker);
double delivery (stream+webhook) → per-agent-turn idempotency key; push privacy → no sensitive
payload (fetch on open); push 410 → prune dead subs; proactive spam → rate-limit + native
`HEARTBEAT_OK` suppression. Consensus trail:
`docs/plan/consensus/q7-realtime-messaging.{codex,mmx}.md`.

## Q8 — AI Workforce / agent-persona domain (CORE) — LOCKED

**AI employee = an OpenClaw DELEGATE agent** (delegate-architecture pattern): own identity/persona
(`SOUL.md` persona + hard-blocks, `AGENTS.md` role + standing-orders, `IDENTITY.md` name, `USER.md`
principals), own workspace + agentDir + sessions + memory-lancedb + skills, isolated auth, channel
bindings. Acts **on behalf of** humans; **never impersonates** them. **Workforce-context
aggregates:**
`AgentEmployee {tenantId, name, personaId, departmentId, autonomyTier, openclawAgentId (opaque ref), channelBindings[], toolPolicyRef, standingOrderIds[], status}`,
`Persona {soulMd, agentsMd, identityMd, hardBlocks[]}`,
`Department {name, roleMandate, defaultTier}`,
`AutonomyTier {T1_DRAFT | T2_SEND_ON_BEHALF | T3_PROACTIVE}`,
`StandingOrder {scope, trigger, actions[], approvalRequired, auditLevel}`,
`ChannelBinding {channel, accountId, direction, scopeFilter}`,
`Assignment {taskId, employeeId, projectId?, sessionRef, reportRef}`. Provisioned via the
**admin/provisioning context** (admin-only OpenClaw config writes → `agents.list` + `bindings` +
workspace files); runtime stores opaque refs + broker ACL. **Knowledge scoping (REVISES Q4b):
`employee = workspace`, `project = shared corpus`, `org = corpus`.** Workspace identity is
per-EMPLOYEE (persona + personal memory-lancedb + skills persist across all their work), NOT
per-project. A Project owns a **read-only shared corpusRef** (wiki + vectors) **injected at session
start ON TOP of** personal memory (layering: personal → project → org). **Memory writes land in the
employee's workspace, never the project corpus.** **Delegation / 'Ask Opzava' orchestrator:** main
coordinator whose SOUL says "route to a specialist if one exists." Flow: PM card / chat request →
resolve Department → pick an AgentEmployee → spawn subagent session (employee's agentDir/bindings/
tools + project-corpus overlay) → employee works → reports back as a chat message attributed to its
persona → orchestrator threads it onto the parent card via `Assignment`. Escalates to a human when
`tier == DRAFT` or a hard block fires. **Human-in-the-loop default tiers:** Finance &
Customer-Management → **T1 (Draft + approval)** (money/PII/contracts); Marketing & Support → **T2
(Send-on-behalf, agent identity)**; **T3 (Proactive)** only for non-mutating / pre-approved
standing-orders (monitoring, briefings). Finance-event standing-orders stay T1 + approval. **Biggest
sad path: prompt-injection via a customer channel → a Tier-2 agent exfiltrates PII/funds.**
Invariants enforced at **Gateway TOOL POLICY + approval rows, NOT in SOUL** ("SOUL can lie; tool
policy cannot"): (a) outbound HTTP only to a per-agent domain allowlist; (b) tool policy denies
PII/financial reads unless the binding grants it; (c) autonomous sends triggered ONLY by
standing-orders, never by an inbound message; (d) every send/mutation writes an immutable audit row;
(e) per-agent spend + rate caps; (f) money/PII/credential/legal/tenant-admin actions always require
an approval row. Consensus trail: `docs/plan/consensus/q8-ai-workforce.{codex,mmx}.md`.

## Q6 — User authentication — LOCKED (grounded in `docs/plan/research/q6-auth-stack.md`)

- **Library: Better Auth (primary), behind an `AuthPort`; Auth.js v5 + Postgres adapter = the real
  fallback.** Feature-fit (first-party multi-tenant orgs + revocable DB sessions + TOTP/recovery +
  SimpleWebAuthn passkeys + anti-enumeration) shrinks our custom auth surface. Mitigate its advisory
  volume (31; 21 in 2026): pin a vetted release, subscribe the `better-auth` GHSA feed, audit the
  cookie-cache/2FA/invitation paths. The AuthPort keeps a swap days-not-months.
- **AuthN vs AuthZ split:** Better Auth owns **authentication + coarse org membership ONLY**;
  Opzava's Q5 `AuthorizationPort` (resource-scoped, roles-as-data) stays the **fine-grained authZ
  source of truth** — fine-grained checks never call Better Auth. Org membership syncs INTO our
  RBAC, not the reverse.
- **Sessions: DB-backed + revocable** (no JWT). Revoke on logout-all-devices, **password reset, org
  removal, role/membership change**. **`session.cookieCache` disabled** (advisory-driven,
  non-negotiable).
- **2FA: TOTP + single-use recovery codes baseline + passkeys (WebAuthn) step-up/passwordless;
  org-admin-enforceable MFA** (`requireMfa` on sensitive orgs/admin actions).
- **PWA auth (service worker CANNOT read httpOnly cookies):** the only session read is a server
  `/api/auth/session` endpoint; the SW registers its Web Push subscription via a one-time
  `HMAC(sessionId, nonce)` handshake, and the **server binds push↔session and re-validates that
  binding server-side at enqueue** (a service worker cannot securely hold the HMAC key, so
  validation is server-side, not in the SW — ADR-006 refinement); offline UX = cached public
  surfaces + explicit "auth required" gate. No "two-cookie split" (not spec-supported). CSRF via
  SameSite + server-action origin checks.
- **External Guest-Clients: per-project scoped magic-link** (project key in token claims,
  server-bound to the `external_identities` row, TTL ≤24h, single-use, audited). They NEVER receive
  org membership.
- **Biggest sad path: role/membership flip between session issue and use, or a provider
  invite-callback granting access.** Invariant: **every privileged access re-checks membership+role
  inside the same DB tx that authorizes; provider invite callbacks grant NOTHING without
  re-validating the Opzava `Invitation` row in-tx; `revokeSessionsOnRoleChange` runs in-tx;
  push↔session bindings re-validated server-side at enqueue.** Consensus trail:
  `docs/plan/consensus/q6-auth.{codex,mmx}.md`.

## Q9 — Error→Admin-card pipeline (Ask Admin Opzava) — LOCKED

> **Superseded presentation amendment (2026-07-15):** Preserve the original Q9 body below as the
> historical decision record, but do not implement its ADMIN `pm.Card`/board projection. ADR-013's
> `ErrorGroup`/Incident aggregate now owns incident identity, lifecycle, visibility, evidence, and
> remediation. Dev Board may show a read-only Incidents projection, never a DevTicket or `pm.Card`;
> permanent code/configuration remediation is a separately linked DevTicket of Type Bug or
> Technical Task under PRD-019/ADR-017.

**Opzava-owned Notifications/Admin-Observability context (Postgres).** Aggregates:
`ErrorGroup {fingerprint, severity, count, firstSeen, lastSeen, status, tenantId?, projectId?, agentId?, gatewayId?, visibility}`,
`ErrorEvent {groupId, source, payload (JSONB, redacted), ts}`,
`RemediationAction {groupId, kind, blastRadiusClass, status, approvals, auditRef}`,
`AlertRoute {match, severity, channel}`. **The ADMIN card is a projection of ErrorGroup** (reuses
the PM-card read model on a platform board). **Sources (4 producers → one normalized Incident):**
(a) app — Next.js `error.tsx`/`route.ts` + broker reporters; (b) broker/ACL ingestion errors; (c)
**OpenClaw via the ACL** — scheduled `logs.tail` (cursor/gateway), `diagnostics.stability`,
task-ledger `failed/timed_out/cancelled`, Workboard failure flags, `health`, usage/cost spikes —
**projected per Q4 hybrid-CQRS (snapshots = truth, events = hints)**; (d) customer/support report.
Workboard = a diagnostics SOURCE only. **Capture: lean built-in incident domain for day one, behind
an `ErrorCapturePort`.** Self-hosted **GlitchTip** (Sentry-API, single PG, ~150MB) is an OPTIONAL
drop-in adapter for frontend source-map symbolication later — deferred (lean-ops). **Dedup /
anti-storm:** fingerprint = SHA-256(`service|route|exception-type|normalized-message`). Card
creation: suppress until count ≥ N in window (default 3/5min) OR severity=critical → immediate;
30-min per-fingerprint cooldown; per-tenant/per-gateway hourly card caps. One card per fingerprint
lifetime; reopen on post-resolve recurrence. **Boards + visibility:** a distinct **platform-ops
ADMIN board** (`tenantId = NULL`, spans app+infra+ALL gateways) vs **tenant-visible** redacted error
views. Single switch = `ErrorGroup.visibility {platform_only | tenant_visible | tenant_redacted}`,
enforced by RLS + query-guard. Cross-tenant detail never leaves the platform board. **Ask Admin
Opzava remediation loop:** triage card → read `logs.tail`+`diagnostics.stability` via ACL → propose
a `RemediationAction` with a **blast-radius class**. Default autonomy = **low (notify + draft
only)**; **approval gate for class ≥ medium** (restart-gateway / re-dispatch / re-provision);
**destructive** → **2-step human confirm**. Every action: dry-run-first, idempotency key,
**one-tenant blast radius**, immutable admin-token audit (actor, before/after). **Biggest sad path +
invariants:** (1) the **pipeline itself going blind** → an `errors_ingest_deadletter` table is the
absolute sink + a **watchdog card** (heartbeat-driven, never suppressable) fires if no ErrorEvent
lands in 5 min; (2) **redaction at the INGEST boundary** — one `redact(payload, visibility)` runs
before storage (never at read time), so no payload crosses tenant scope or leaks PII/secrets from
stack traces. Consensus trail: `docs/plan/consensus/q9-error-pipeline.{codex,mmx}.md`.

## Q10 — CRM / Customer-Management — LOCKED

**Opzava-owned Postgres truth; OpenClaw stays channel/session/transcript owner behind the ACL.**
Aggregates (all tenant-scoped): `Contact` (root — PII, lifecycle, consent refs, dedup key,
ChannelIdentity set), `Account/Company`, `Deal/Opportunity` (stage → `Pipeline`), `Pipeline/Stage`
(versioned ref data), `Activity` (child: call/note/inbound-msg), `Ticket` (root — refs Contact +
conversation + assignee AgentEmployee + SLA), `Segment` (stored query + materialized member IDs),
`Consent` (per-channel: status, ts, proof), `ChannelIdentity` (**VO on Contact = the SENDER
identity** `{channel, externalId, verified, linkedAt}`, NOT a conversation id). **ChannelIdentity ↔
Contact resolution:** the ACL emits `SenderSeen{tenantId, channel, externalId, displayName}`; Opzava
keys a **`ChannelIdentity(channel, externalId)` unique-per-tenant** index. **Exact verified match →
auto-link**; miss → an ephemeral `UnknownContact` shell in an inbox for agent confirm.
**Cross-channel dedupe = suggest-and-confirm** (tenant fingerprint → candidates → audited manual
merge). **Never auto-merge, never across tenants** (same phone ≠ same Contact across tenants).
**Conversations → CRM:** ACL `ConversationStarted` → resolve to ContactId (or shell) → write
`Activity`; open a `Ticket` when `intent=support`, binding Contact + conversation + a support
AgentEmployee. (External Channels context, distinct from internal team chat.) **Marketing:**
`Segment` = stored query + nightly materialization; **Consent enforced at send-time**; opt-out
webhook → revoke + suppress. **GDPR right-to-erasure = an idempotent admin/provisioning workflow**
across BOTH stores: (a) Opzava — hard-delete Contact, hash PII in Activities/Tickets, blank
transcript bodies, keep FK skeleton; (b) OpenClaw (per-tenant Gateway) — delete channel history +
scrub agent `memory-wiki`/`lancedb` by tenant filter; (c) idempotency key + audit ledger; async
reindex. **Biggest sad path + invariant:** a **wrong contact↔conversation link poisons every
downstream artefact.** Invariant: **no external conversation/activity/ticket write persists without
tenant scope + a resolved-or-shell ContactId — a raw `externalId` NEVER lands in Opzava domain
tables**; `ChannelIdentity(channel, externalId)` unique per tenant. Consensus trail:
`docs/plan/consensus/q10-crm.{codex,mmx}.md`.

## Q11 — Department workflow engine — LOCKED

**Principle: "Opzava defines, OpenClaw executes."** `Workflow`/`Playbook` = the Opzava definition
aggregate (SoT) with three `Mechanism` children — `StandingOrderBlock` (→ AgentEmployee `AGENTS.md`
autonomous authority), `CronSpec` (→ cron), `TaskFlowSpec` (→ managed multi-step TaskFlow).
`Workflow.Publish` → `WorkflowProvisioner` (admin/provisioning context) writes the OpenClaw
artifacts + stores a `ProvisionReceipt`; runtime events project back → `WorkflowRun`/`RunStep`
write-model (Q4 hybrid-CQRS). **Marketing content pipeline:** `Campaign` · `ContentCalendar` ·
`ContentItem` (`Idea → Draft → InReview → Approved → Scheduled → Published → Archived`) ·
`ContentPipeline` (process manager: AI draft [T2] → review → `Approval` gate → schedule/publish) ·
`Report`. **Unified `Approval`** (`Pending → Approved|Rejected|Expired`, `requesterAgentId`,
`policyRef`, `payloadRef`), one chat inbox (Q7). **Split of truth:** Opzava `Approval` = SoT for
**business** approvals (content/finance/send-on-behalf); OpenClaw `operator.approvals` = runtime
truth for **exec/plugin** (agent tool-execution) gates; reconciled via mirrored refs (business
conflict → Opzava wins). **Same engine reused:** `FinanceEventWorkflow` (T1), `SupportSlaWorkflow`
(T1 ack + tiered escalation, `SLAClock`), `SendOnBehalfWorkflow` (T2) — all instantiate
`Workflow + Mechanism + Approval + Run`; only policies + mechanism shapes differ. **Reports:**
scheduled trigger → agent run → ACL read (channels/usage/ledger) → `ReportJob` → versioned
`ReportArtifact`, cached by `(tenant, reportType, periodHash)` with a freshness SLA. **Biggest sad
path + invariants:** runaway standing-order/cron **fan-out burns quota + floods approvals**. Every
`Mechanism` carries `costBudgetPerHour` + `maxConcurrentRuns` + `requiresApprovalPolicy`; the
provisioner **rejects a publish that would breach the tenant ceiling**; a runtime `RunLimiter`
enforces; approval backlog auto-escalates at >50% SLA. **Inviolable: no `ContentItem` reaches
`Published` without an `Approval` in `Approved` state — enforced at BOTH gateway and UI** (+
idempotency on scheduled runs). Consensus trail:
`docs/plan/consensus/q11-dept-workflows.{codex,mmx}.md`.

## Q12 — Billing + onboarding & Gateway provisioning lifecycle — LOCKED

**Onboarding = a compensating SAGA** (`ProvisioningJob`, orchestrated by the admin/provisioning
platform worker using a short-lived `operator.admin`; the hot broker stays `write`+`approvals`):
sign-up → create tenant+owner(org) → reserve config/state/workspace/ports → start Gateway container
→ wait `health` → bootstrap admin-token pairing (Q3) → seed default departments+agents+ACL → attach
Plan → channel connect-wizard. Each step idempotent (keyed by `tenant_id`) with a compensating
action. **Lifecycle: `Provisioning → Active → Suspended → Deprovisioning → Deleted`**, single source
of truth `tenant.lifecycle_state` (`updated_at` guard); `ProvisioningJob` owns
retry/failure/rollback. **Gateway provisioning mechanism (lean realization of pure-B):** **one
rootless Docker container per tenant** on a bin-packed VPS (unique
`OPENCLAW_CONFIG_PATH`+`OPENCLAW_STATE_DIR`+`workspace`+`gateway.port`+derived ports),
**lazy-start + idle-stop** (~10min), image-cached → **~50+ tenants/VPS**. Scale path: K8s Deployment
/ Nomad alloc behind a **`GatewayRuntimePort`** (`GatewayInstance.runtime = {docker|k8s|nomad}`) —
no domain change. **Billing status: DEFERRED (2026-07-02).** `BillingPort` stays as a null-adapter
seam for internal single-tenant use. No payment provider, including Stripe, is implemented until
external monetization. The billing/metering design is retained for that later stage. **Billing
design retained:** provider behind a **`BillingPort`**. Aggregates: `Subscription`,
`Plan(slug, limits_json, provider_price_id)`, `UsageMeter`,
`MeterEvent(idempotency_key = sha256(tenant, agent, window, raw usage.cost))`, `Invoice`,
`ProvisioningJob`, `GatewayInstance`. A 1-min `usage.cost` poller emits idempotent MeterEvents for
the future provider adapter. **Plan enforcement:** BFF quota middleware checks `Plan` + `UsageMeter`
per request (agent count, cost budgets [Q11], channels, seats, autonomy tiers, features); overage →
402; **dunning → `Suspended`** (block gateway start, 30-day data grace) → `Deprovisioning`.
**Biggest sad path + invariant: the ORPHANED Gateway** (billing paused but container still burning
CPU; or a double-provision race → two containers on the same ports). **Invariant: no container may
run without an active tenant entitlement + a valid `GatewayInstance` + a live provisioner lease;
`GatewayInstance.tenant_id` UNIQUE and `(state_dir, ports)` UNIQUE via DB advisory locks; lifecycle
bound to `tenant.lifecycle_state` via the outbox.** Purge = `Deprovisioning` emits
`container.kill` + `state_dir.rm` + `stripe.cancel` + GDPR purge (Q10/Q4b) in one tx; failure →
idempotent cron reaper. Consensus trail:
`docs/plan/consensus/q12-billing-provisioning.{codex,mmx}.md`.

## Q13 — Capability-parity map + ADR/PRD backlog — DELIVERED

Every mockup screen classified OpenClaw-native / Opzava-owned / hybrid →
`docs/plan/capability-parity.md`; priority-ordered ADR/PRD backlog → `docs/plan/backlog.md`,
realized as ADR-001..015 (`docs/adr/`) + PRD-001..018 (`docs/prd/`). Consensus trail:
`docs/plan/consensus/q13-backlog.mmx.md` (historical — its draft PRD-019..028/ADR-016 ids were
renumbered into the then-final ADR/PRD set; the current PRD-019 and ADR-017 are new, unrelated Dev
Board documents).

## Q14 — Local Docker stack ⇄ live Dokploy parity (Traefik) — LOCKED

**One canonical `docker-compose.yml` (with Compose profiles) is the source of truth for BOTH
environments.** Local runs the full stack incl. its own Traefik (a `local` profile) with **mkcert**
TLS on `*.localhost`; on **Dokploy** the app deploys as a **Compose stack that ATTACHES to Dokploy's
existing Traefik** (no second Traefik) with **Let's Encrypt** on `*.opzava.app`. Identical across
both: service names, the shared external network **`dokploy-network`**, Traefik router/label
conventions, healthchecks. Diverges only: TLS issuer, Traefik ownership, replicas/limits, secrets
source (`.env` vs Dokploy secrets — same keys). **App services are Compose-managed; per-tenant
OpenClaw Gateways are runtime Docker containers** created/reconciled by the
**`worker-provisioning`** service (the admin/provisioning context) via the `GatewayRuntimePort`
docker adapter — NOT baked into compose. **Docker access security (codex corrects mmx):**
provisioning needs WRITE (create/start/stop/remove containers + network connect), so a read-only
proxy is insufficient — use **`tecnativa/docker-socket-proxy` scoped to a NARROW MUTATION subset**
(containers + networks; deny image push, host bind-mounts, privileged, arbitrary exec), reachable
**ONLY by `worker-provisioning`**. Traefik may read `/var/run/docker.sock` directly as read-only for
Docker-provider discovery. **The broker (hot path) NEVER touches Docker.** CI lints that
`/var/run/docker.sock` appears only on the approved read-only Traefik discovery mount and
socket-proxy service. **Traefik provider parity:** tenant Gateways are plain containers → Traefik
must have the **Docker provider enabled** to route them. On Dokploy (Swarm) ensure its Traefik has
the Docker provider on (pinned flags), OR run a **dedicated Opzava Traefik** for tenant routing on
`dokploy-network`. Local plain-compose uses the Docker provider natively → labels resolve
identically. **Service list (compose):** traefik (local profile), postgres, pgbouncer, redis, minio,
next (web), broker, worker-provisioning (owns the socket-proxy), worker-projection, worker-metering,
dockerproxy. Dynamic: per-tenant `openclaw-gateway` containers (Traefik-labeled, joined to
`dokploy-network`). Domains: `app` / `t-<id>` on `*.localhost` (mkcert) vs `*.opzava.app` (Let's
Encrypt). **Biggest sad path + invariant: a routable ORPHAN tenant Gateway** (container up + Traefik
still routing after suspend/delete). Deprovision/suspend is ONE transaction that removes the Traefik
route AND kills the container AND revokes entitlement (ties to ADR-002 anti-orphan + ADR-014
suspension); a reaper kills any tenant-Gateway container lacking Active-entitlement + valid
GatewayInstance + live lease and pulls its route. The SAME reconcile logic + single
`GatewayRuntimePort` adapter run local and live (only the Docker endpoint differs). → new **ADR-015
(Deployment & environment parity)**; refines ADR-002's `GatewayRuntimePort`. Consensus trail:
`docs/plan/consensus/q14-local-dokploy-parity.{codex,mmx}.md`.

---

## Q15 — MVP roadmap — LOCKED, then superseded for execution order

> Dev Board amendment (2026-07-15): The Q15 body below is historical. `EXECUTION.md` no longer
> controls live work order and remains a historical worklog only. Approved Dev Board/GitHub issues,
> together with `docs/plan/dev-board-migration-manifest.md`, now control the live migration and
> build.

Walking-skeleton MVP + phased P1–P8 build order locked from mmx consensus → `docs/plan/roadmap.md`.
2026-07-02: `docs/plan/EXECUTION.md` superseded the walking-skeleton MVP with the **admin-Tasks
MVP** (dogfood: Opzava tracks its own build); roadmap P1–P8 remain the phase-detail reference,
EXECUTION.md controls order. Consensus trail: `docs/plan/consensus/q15-mvp-roadmap.mmx.md`.

## Q16 — Platform orchestrator runtime + local coding harness — LOCKED (2026-07-03)

- **Initial orchestrator model:** ChatGPT/Codex **subscription OAuth** (operator's GPT Pro account)
  drives `openai/gpt-5.5` through OpenClaw's **native Codex app-server runtime** on the platform
  Gateway, powering **Ask Admin Opzava / Ask Opzava** (the orchestrator chat services).
  `auth.order.openai` places a direct **API-key profile as automatic fallback**; OpenClaw
  auth-monitoring surfaces any silent fallback as an admin-observability event ("running on metered
  API billing"). **Tripwire:** move to a dedicated account/API-key profile BEFORE external users or
  scheduled marketing automation (P5).
- **Auth ops:** OAuth profiles are per-environment interactive sign-ins (refresh tokens
  non-portable; SecretRef explicitly rejected for OAuth material) → one documented in-container
  runbook step per environment; tokens persist in the `openclaw-platform-auth-profiles` volume and
  never leave the environment they were minted in.
- **Streaming:** agent runtimes are embedded below the session layer, so the broker's deltaText
  relay is runtime-agnostic (verified: `docs/openclaw/concepts/agent-runtimes.md`).
- **Local coding harness:** the developer's **Claude Code runs locally** and connects to **Opzava's
  own MCP server**, which exposes exactly the governed `opzava_tasks_*` registry (Slice 2d path:
  same validation, outcome-first receipts, forbidden ≠ not_found). **Not** ACP-hosted — ACP spawns
  the harness on the gateway host, which contradicts local-first dev work; ACP harness sessions are
  revisited in P1 for Opzava-dispatched code work. Gateway `mcp.servers` registration of the same
  server is **deferred to P1**: the first gateway-native consumer (standing orders/cron) forces the
  autonomous-agent principal question, which is ADR-008 territory — do not wire authority-less tool
  access earlier.
- **Authority (hybrid on-behalf-of):** the link credential binds (human user + client identity
  `claude-code`); execution authority comes ONLY from the human's RBAC/RLS; every audit/tool-outcome
  row records actor + via-client. Client-supplied tenant/user/workspace ids are never authority (the
  2d invariant, unchanged).
- **Credential:** scoped revocable **link token** (admin-UI issued, shown once, stored hashed,
  `tasks:read`/`tasks:write` scopes, expiry, dies with membership/session-version revocation).
  Upgrade to a true device-authorization flow at the multi-user tripwire, validated against Better
  Auth official docs at that time (P8/PRD-013 already anticipates this).
- → **Slice 2.5** (after Slice 2, before Slice 3 CRM): Opzava MCP server + link tokens + Claude Code
  connect recipe + audit attribution. Acceptance: a local Claude Code session lists/creates/moves a
  Task and it appears live on the admin board; a revoked token fails with a clean auth error; task
  activity shows actor-via-claude-code.
- **Orchestrator + subagents (clarified 2026-07-03; updated 2026-07-12):** exactly one connected
  provider is the MAIN ORCHESTRATOR, derived from the Gateway primary model at
  `agents.defaults.model.primary`. GPT-Pro/Codex (`openai/gpt-5.5`) is the initial default, not a
  hardcoded invariant. The other connected providers (z.ai/GLM, Claude, OpenCode, Kimi/Moonshot,
  Alibaba/Qwen, OpenRouter, ...) are SUBAGENT specialist models the orchestrator DELEGATES to by
  strength, to offload work and save orchestrator tokens. The Connections GUI can move the main role
  to another connected provider with a routable model, and the previous lead remains a subagent.
  This is DELEGATION, not `auth.order` failover (a separate, secondary mechanism: same task,
  cheaper/next provider only when the primary is unavailable). Harnessed via OpenClaw NATIVE
  capability (verified in the live config schema + `docs/openclaw/gateway/config-tools.md`):
  `agents.list[].subagents.delegationMode: "prefer"` (docs: "coordinator agents that should stay
  responsive and push non-trivial work into spawned sub-agents"), `subagents.allowAgents`,
  per-subagent `model`, and the `sessions_spawn` / `group:sessions` tools. IMPLICATION: the
  orchestrator's tool policy must ALLOW `sessions_spawn`/`subagents` (the current minimal profile
  denies them) - a deliberate, audited expansion beyond the Slice 2 lock-down, gated by the same
  tool-policy-first posture. The full delegation ENGINE (routing by strength, the AI task board,
  run-trace evidence) is P1 AI Workforce (ADR-008); Slice 2.5 only wires the orchestrator
  `delegationMode` + connects the subagent models + assigns roles in the Connections GUI. Parity:
  `docs/openclaw/concepts/model-providers.md`, `docs/openclaw/gateway/config-tools.md`
  (subagents/sessions), `docs/openclaw/providers/*`.
- OpenClaw parity citations: `docs/openclaw/providers/openai.md` (subscription OAuth explicitly
  supported; `auth.order` fallback), `auth-credential-semantics.md` (OAuth non-portability,
  SecretRef guard), `concepts/agent-runtimes.md` (embedded runtimes), `tools/acp-agents.md` (ACP =
  gateway-hosted harness), `cli/mcp.md` (MCP surfaces).

## Q17 — Admin Tasks board as AI-Workforce dev pipeline — SUPERSEDED / FROZEN HISTORICAL (locked 2026-07-04; superseded 2026-07-15)

**Purpose:** the Tasks board is **ADMIN-ONLY** and exists for Opzava-platform development work:
slices, fixes, incidents, PRs, and repo dogfooding. It is **Opzava dogfooding Opzava**, not an
end-user product surface. CRM/Marketing remain the separate user-side business surfaces and stay
deferred from this slice. **Actors (3):** (1) human admin = owner/curator/approver; (2) doer agent =
either a gateway-side subagent dispatched by the Lead Orchestrator and running on the VPS, OR an
external local tool (`claude-code`/`claude-desktop`/`codex`) connected through hosted MCP; (3) Lead
Orchestrator = **Ask Admin Opzava**, the dispatcher + adversarial reviewer. **Dispatch model:**
"Dispatch" means Ask Admin Opzava spawns **gateway-side subagents** using OpenClaw native
`sessions_spawn` + `subagents` with `delegationMode: "prefer"`; those subagents run **on the VPS**.
It is NOT remote-control of the admin's local desktop apps, and ACP/CLI-backends also run on the
gateway host (Q16 rejected ACP for the local-first dev harness for that reason). Local tools are the
manual/grab path via hosted MCP. Both paths drive the SAME card through the SAME consumer-agnostic
governed task/review tool registry. **Lifecycle (5 lanes + orthogonal Blocked):**
`Backlog -> Todo -> In Progress -> Review -> Done`, with `Blocked` as a flag/label, not a lane.
Backlog is planning/curation only; doers never touch it, and the creating agent drafts Overview
there. `Backlog -> Todo` is **human-only** and is the actionable gate. Todo can be pre-assigned by a
human; otherwise the orchestrator auto-dispatches and `Assigned to` shows the agent identity.
`Todo -> In Progress` is doer-owned through `task.claim` and begins the AI Run.
`In Progress -> Review` is doer-owned but hard-gated by matching Evidence or Files. Quality Review
is orchestrator-owned adversarial verification; the card stays in Review and never auto-Dones.
Review pass waits for a human; changes-requested sends the same doer back to In Progress with a
required note. `Review -> Done` is **human-only**; Done triggers the orchestrator to merge the
linked PR only when CI is green, fail-closed otherwise, and the linked GitHub issue auto-closes on
merge. Current DB status enum `todo|in_progress|blocked|done` must gain `backlog` and `review`.
**Evidence gate:** the doer must declare `change-type = visual|non-visual` and attach matching
evidence before Review: visual work requires screenshot proof; non-visual work requires
e2e/user-level tests, smoke tests, real-world tests, mutation tests, or other deep-verification
artifacts. `In Progress -> Review` fails closed without matching evidence. The orchestrator
independently verifies sufficiency/reality by re-running tests or checking screenshots against
stated outcome; Evidence is not a checkbox. **Issue ⇄ Task ⇄ PR:** GitHub issues can be imported as
Tasks, curated in Backlog, and shown with a `#NN` chip. A Task has 0..1 primary issue and can
produce a PR with `Closes #NN`. GitHub remains source of truth for issue state; the Opzava Postgres
Task is the execution unit. Code tasks branch from `development` and use PR + CI status +
tests/screenshots as first-class Evidence. Net-new: PRs do not exist in the current issue adapter;
gateway-side subagents need a repo clone and git credentials on the VPS to push branches and open
PRs. **Trigger mechanism:** Opzava task events emitted through the ADR-004 transactional outbox
(`card -> Todo`, comment/ `@mention`, `review-requested`) feed the **dispatcher worker**: the
ADR-008/P1 AI-Workforce `AgentDispatch` loop pulled forward for platform development. Gateway-side
doers are real-time push (dispatcher -> broker `sessions.send` -> orchestrator turn -> dispatch
subagent/respond/run review). Local-tool doers are poll only (`list_my_open_items` over hosted MCP),
so comments on local-tool-owned cards are answered on next poll, not instantly. `@mention` routes to
the specific agent identity: push for gateway-side identities, queue-for-poll for local-tool
identities. **Surfaces:** AI Run tab is the full step-by-step run trace with live elapsed ticker.
Evidence/Files stores artifacts including PRs. Comments are human-readable summaries and replies to
human comments/mentions in the Opzava task-authoring voice, not every raw tool call. `Assigned to`
is the named agent identity plus AI badge. **Governed tool registry:** consumer-agnostic tools for
gateway subagents and local MCP tools are `task.claim`, `task.report_run_step`,
`task.attach_evidence(kind: screenshot|e2e|smoke|real_world|mutation|verify_deep|pr)`,
`task.comment`/`task.reply`, `task.request_review` (hard-gated), and
`task.update(overview/labels/due/watchers/link_issue/ link_pr)`. Reviewer-only tools, enforced by
tool policy for the orchestrator identity, are `review.record_check`, `review.pass`, and
`review.request_changes`. No agent gets `set Done` or `merge`; those remain human-gated /
orchestrator-internal-on-Done. **Hosted MCP:** promote the MCP server from local stdio to a hosted
Streamable HTTP compose service behind Traefik at `mcp.opzava.<domain>` on the VPS; stdio stays as a
local fallback. Auth uses the Slice 2.5 scoped/revocable/hashed link tokens as
`Authorization: Bearer`. The token resolves to on-behalf-of authority: issuing human RBAC/RLS plus a
named agent identity bound at issuance in the UI, not client-declared. One token per tool gives
trustworthy attribution. Revocation dies with membership/session-version changes and explicit
revoke. Compatibility with `claude-code`, `claude-desktop`, and `codex` over remote HTTP MCP +
bearer must be runtime-verified, not assumed. **Scope note:** this is effectively **P1 AI
Workforce** (ADR-008) pulled forward and applied to Opzava's own dev work. It is a large multi-part
build: 5-lane state machine + transition tool-policy, dispatcher worker, gateway-side subagent
execution with repo+git credentials, PR/CI dimension, evidence gate, orchestrator Quality-Review
automation, agent-identity registry, and hosted-HTTP MCP. Sequence it after live bring-up and before
user-side Marketing. **Biggest sad path + invariants:** the doer self-approves, fabricates evidence,
or merges unreviewed code. Invariants: doers can never touch Backlog, set Done, call reviewer-only
tools, or merge; `request_review` fails closed without matching evidence; Review is adversarial
orchestrator verification and still waits for human Done; CI red blocks Done/merge and the card
stays in Review; named agent identity comes from token/provisioning policy, never from
client-supplied text. Canonical slice contract: `docs/plan/consensus/tasks-ai-workforce-design.md`.

---

## Q18 — Own OpenClaw as a tracked fork (`mainframe/`) + VPS Dokploy production home + Control-UI port contract — LOCKED (2026-07-04)

> **Amendment (2026-07-15):** Q18 remains authoritative for Mainframe ownership, deployment, and
> the Control-UI port program. Its historical execution-order and "Tasks, Issues retained" / "Tasks
> IS the workboard" sentences are superseded: current work order comes from approved GitHub issues
> plus `docs/plan/dev-board-migration-manifest.md`, and Dev Board replaces the standalone Tasks and
> Issues products. OpenClaw Workboard remains deliberately unported.

**Decision (user-grilled interactively 2026-07-04, no paired consensus):** Opzava **OWNS OpenClaw as
a tracked fork, not a hard fork**. The clone at `docs/openclaw/clone` (upstream
`github.com/openclaw/openclaw`, v2026.6.11, commit `bd2740fedc`, MIT) moves to **`mainframe/`** by
**squash import**: working tree only, the 1.6GB upstream `.git` is dropped, and the pin is recorded
in `mainframe/UPSTREAM.md`. Vocabulary: **Mainframe** = the fork source we own; **Platform Gateway**
= the running container — which becomes `build: ./mainframe` instead of
`image: ghcr.io/openclaw/openclaw` (same version + same named volumes = seamless swap; no separate
"install OpenClaw" exists anymore). `docs/openclaw/clone` is deleted after the move; curated
`docs/openclaw/` stays the canonical reference. `mainframe/` is EXCLUDED from the Opzava pnpm
workspace (it is its own pnpm workspace; nesting would merge two dependency universes) — the ONLY
integration point is the Docker image boundary. No GitHub fork repo until we actually upstream
patches. Upstream bumps are a deliberate operation: scratch-clone upstream, diff old..new tag,
apply, re-review `PATCHES.md`. **Customization ladder (heavy customization WITHOUT fork rot):**
every change lands on the lowest rung that can express it — **Rung 0** config · **Rung 1** official
extension points (extensions/skills/hooks) · **Rung 2** first-party additive modules
(`extensions/opzava-*`; upstream files untouched) · **Rung 3** source patches to upstream files,
each logged in `mainframe/PATCHES.md` (what/why/upstream status), re-reviewed at every bump. Rung 3
is expected near-empty. Blog auto-generation, FB-ads analysis, and email-campaign automation are NOT
fork customizations — they are Opzava Marketing features that USE the gateway (skills/cron/agents
via broker). Branding = rung 0/1 (the fork's Control UI is replaced by our dashboard anyway).
**Topology unchanged:** the static Platform Gateway (mainframe-built) is the canonical runtime.
ADR-002 per-tenant dynamic provisioning is **deferred-not-deleted** (code retained — it still powers
onboard-exec + operator bootstrap; at multi-tenant, dynamic gateways use the same mainframe image).
ADR-003 two-token broker/worker ACL untouched. "No routable orphan Gateway" retained. **Production
home:** VPS Dokploy at `5.189.186.18` (6 vCPU / 12GB RAM / 100GB NVMe; creds in
`secrets/dokploy.env` — **ROTATE the API key**, it transited a chat transcript, and move the panel
off plain HTTP-on-IP). No Dokploy project exists yet. **Local compose REMAINS the dev/verify
environment** — the local↔Dokploy parity invariant is intact; the VPS is the production home, not a
replacement for local dev. **Domain: `opzava.app` is purchased at the first live-dev push**
(explicit bring-up gate; today it is only a local-Traefik name); wildcard A `*.opzava.app` → VPS;
Traefik + Let's Encrypt; all public traffic on 443; the Dokploy panel itself gets a TLS subdomain.
**WebSocket (production-grade; the fix for the experienced wss/SSL pain):** the gateway keeps **zero
public listeners**. Exactly **ONE public WS surface**: browser ↔ app/broker (`wss://app.opzava.app`)
via Traefik+LE. Every external consumer — browser, local Claude Code MCP, PWA/mobile, guest portals,
future public API — enters through Opzava's authenticated endpoints; the broker relays. Internal
legs (broker/worker → gateway) stay plain `ws://` on `dokploy-network` — no certs by design. Root
cause of past wss failures = certs on a bare IP; solved structurally by the domain gate. Hardening
spec for the one surface: Traefik WS upgrade + long idle timeouts, ping/pong heartbeat, client
auto-reconnect with backoff+jitter, session-bound sockets (revocation closes them), graceful drain
on deploy. **Reconnect = re-snapshot** (RPC snapshots are truth, WS events are hints) so drops never
lose data. Laptop→VPS gateway/node pairing is deferred; if ever needed it is an ADDITIVE
authenticated Traefik route, not a rearchitect. **Execution order:** (a) **mainframe-move slice**
(move + `UPSTREAM.md` + `PATCHES.md` + workspace exclusion + compose `build: ./mainframe` + boot
proof on existing volumes + the pivot-docs package) → (b) **Slice 3.7 port program** view-by-view →
(c) **Dokploy bring-up** when the user says push (buy domain, wildcard DNS, LE, deploy, wss verified
live). The dashboard port is the first substantial priority; the move is its foundation stone.
**Dashboard design contract (mockup-revision-first):** the OpenClaw Control UI view defines **WHAT**
(fields, data, states, RPCs); the mockup defines **HOW IT LOOKS**; on disagreement the **mockup is
revised first** (delete invented elements no gateway RPC can back, add real capabilities), then the
screen is implemented to the corrected mockup with side-by-side screenshot parity. Views without
mockups (sessions, nodes, MCP) get one authored before implementation. `/senior-frontend` is
mandatory; the bar is **calm, user-friendly, optimal UX** — improve OpenClaw's ergonomics, never
regress them. The "mockup IS the design" directive SURVIVES via this reconciliation gate.
**Retention + port additions:** Tasks, Issues, and Ask Admin Opzava are all RETAINED (Opzava-native
family); the admin dashboard = union of native surfaces + the ported gateway-ops views. **CRM is
NEVER an admin-dashboard surface** (user clarification, same day): its permanent home is the
user-side dashboard; the `/crm/*` routes then in the admin app were a temporary Slice-3 parking
spot *(update 2026-07-15: executed — the parking-spot routes and the CRM backend were removed under
GitHub issue #200; CRM returns with the user-side dashboard)*. OpenClaw's **workboard view is deliberately
NOT ported** — Opzava Tasks IS the workboard (Q17). **New port-program row #14: Ask Admin = WebChat
parity** (`docs/openclaw/web/webchat.md`):
`chat.history`/`chat.send`/`chat.inject`/`chat.message.get` via the broker, backing-`sessionId`
continuity across reconnects, idempotency-keyed send coalescing, truncated-message side-reader,
compaction dividers linking to Sessions. **Break-glass:** the fork's own Control UI stays ENABLED in
our image, internal-only, never Traefik-routed; ops access = SSH tunnel + port-forward (runbook
entry). We are never locked out of the gateway while the port program is mid-flight. **Build path:**
Dokploy builds ALL images from the repo with the same `build:` directives local uses (parity by
construction; the 12GB box handles the monorepo build). **Pre-agreed fallback, no re-litigating:**
if VPS builds OOM or crawl, GitHub Actions builds the mainframe image → private ghcr → BOTH
environments pull it; app images stay Dokploy-built either way. Rollback = previous image; gateway
state lives in named volumes, never the image. Runbook gains a docker build-cache prune policy.
**Docs revision = targeted amendments bundled into the mainframe-move slice, NOT a mass rewrite**
(the broker ACL, two-token, projections-as-cache, RLS, tool-policy-first, parity, and the port
program all survive unchanged): new **ADR-016** "Own OpenClaw as a tracked fork (mainframe)"; amend
ADR-002 (deferral note) + ADR-015 (build-from-source + VPS home); EXECUTION.md restructure;
CLAUDE.md doc map + mockup-nuance edits; port-program spec edits (+row #14, workboard non-port note,
mockup-revision-first gate); GH issues sweep (close obsoleted, relabel survivors); PRDs amended
lazily by the view slice that contradicts them; consensus/research memos stay frozen. **Biggest sad
paths + invariants:** fork rot (ladder + `PATCHES.md` + `UPSTREAM.md` pin); accidental 1.9GB commit
(gitignore guard on `docs/openclaw/clone/` until the move lands); a routable gateway (invariant
retained; one public WS surface only); wss cert failures (domain purchase is a hard gate before live
push); VPS build OOM (pre-agreed CI fallback); dashboard broken mid-port (break-glass Control UI);
leaked Dokploy key (rotate directive recorded in `secrets/dokploy.env`).

---

## Dev Board pivot — LOCKED (2026-07-15)

The separate admin Tasks and Issues product model is replaced by one **Dev Board** surface and a
dedicated **DevTicket** aggregate. Opzava owns work contracts, workflow gates, dependencies,
Sprints, assignments, approval, review, execution leases, and synchronization conflicts. GitHub is
the durable synchronized Issue mirror and remains authoritative for native issue number/URL and
PR/commit/check/merge facts. Incidents remain a separate operational projection; permanent
remediation is a linked Bug or Technical Task DevTicket.

The pivot also locks the Backlog readiness gate, version-bound Ready Contract, atomic Todo claim,
explicit admitted local or orchestrator/cloud Runner selection with no implicit or automatic
failover, independent local Reviewer against the shared local Docker stack, Slack Personal
Assistant controls, goal-driven `autonomous_serial` Sprint model, first-class
Docs/Development/Releases views, deterministic bidirectional GitHub App synchronization, and
preservation of human-readable history on both systems. Review remains mandatory; Done means
reviewed and merged into `development`; Staging and Production remain separate Releases states.

This section is only the index entry. Detailed decisions live in
`docs/plan/dev-board-foundation-decisions.md`; the product and architecture contracts are
`docs/prd/PRD-019-dev-board.md` and
`docs/adr/ADR-017-dev-board-authority-sync-execution.md`; the legacy cleanup and issue-quarantine
sequence is `docs/plan/dev-board-migration-manifest.md`. These documents supersede Q17 and issues
#147–#157. Replacement implementation tickets require explicit human approval before publication.

---

## Grilling status — DEV BOARD FOUNDATION COMPLETE ✅ (Q1–Q18 + 2026-07-15 pivot)

All architecture branches locked with paired codex + mmx consensus: **Q1** BFF+DB · **Q1b** stack ·
**Q2** pure-B tenancy · **Q3** WS broker+scoped token · **Q4** contexts+CQRS+ACL · **Q4b** knowledge
mgmt+two-token · **Q4c** tool-policy-first security · **Q5** RBAC+RLS · **Q6** auth (Better Auth) ·
**Q7** realtime+chat+assistants+PWA/Push · **Q8** AI Workforce · **Q9** error→admin-card · **Q10**
CRM · **Q11** dept workflows · **Q12** billing+provisioning · **Q13** capability-parity map +
ADR/PRD backlog · **Q14** local⇄Dokploy parity · **Q15** MVP roadmap · **Q16** orchestrator
runtime + local coding harness (user-grilled, no paired consensus — decisions taken interactively
2026-07-03) · **Q17** admin Tasks board as AI-Workforce dev pipeline (**superseded/frozen
historical**, 2026-07-15) · **Q18** own OpenClaw as tracked fork
(`mainframe/`) + VPS Dokploy production home + Control-UI port contract (user-grilled, no paired
consensus — decisions taken interactively 2026-07-04) · **Dev Board pivot** unified DevTicket,
GitHub mirror, local execution/review, Sprint, Docs, Development, and Releases foundation (locked
2026-07-15). The Dev Board foundation grilling is complete. Current authority is PRD-019, ADR-017,
and the detailed Dev Board decision ledger; execution sequencing is controlled by the migration
manifest and explicitly approved replacement issues. `docs/plan/EXECUTION.md` is historical.
