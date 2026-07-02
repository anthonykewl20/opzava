# Opzava — Grilling Decisions Log

Running record of locked design decisions from the `/grilling` session. Feeds the eventual ADR/PRD set.
Consensus memos (codex GPT-5.5 xhigh + mmx MiniMax-M3) live in `docs/plan/consensus/`.

Project: custom web UI for **OpenClaw** — a Basecamp/Asana-style PM tool + CRM for marketing, finance,
promotions, and customer support. Surfaces OpenClaw features + the plugin Workboard; self-logs errors and
auto-creates cards in an ADMIN board.

---

## Governing principles (apply to every decision)
- **Scale-ready modular DDD from day one — no MVP-then-rewrite.** Prefer properly-bounded / separated designs
  over "start simple, extract later." (user directive, 2026-07-01)
- **Architect posture: agnostic, sad-path-first, edge-case-driven.** Keep the core domain vendor-neutral
  (externals behind ports / anti-corruption layers); lead every design with failure modes and edge cases,
  not the happy path.
- **OpenClaw capability parity — harness, do not reinvent.** Design strictly to what `docs/openclaw` says OpenClaw
  can and cannot do; surface and orchestrate its native capabilities (tool policy, sandbox, memory/wiki/skills, cron,
  channels, sessions, Workboard) rather than building parallel mechanisms. Stay on OpenClaw's grain. (user directive)
- **Official docs before coding APIs.** Training knowledge is a starting point, never the source of truth. Validate
  OpenClaw against `docs/openclaw` and validate every framework, language, and library against current official docs in
  `docs/plan/official-docs.md` before implementation.
- **Lean VPS / cheap ops — efficiency first.** Prefer the lowest-resource control that meets the goal; avoid
  per-project processes/containers; keep resource cost O(tenants), not O(tenants×projects). (user directive)

---

## Product vision (crystallized 2026-07-01)
Opzava is an **AI-staffed company-in-a-box**: OpenClaw-backed AI agents that **act like real human teammates** across
**Marketing, Customer Support, Finance, and Customer Management**, working alongside humans to **grow the business**.
Humans + AI collaborate in a **Slack-grade internal chat hub** (Opzava-owned; simple/durable/reliable/flexible) where
the AI assistants are **first-class participants** — bridged to OpenClaw agents via the **broker** (live token streaming)
and the **Webhooks plugin** (TaskFlow ingress for external automation + proactive delivery). Delivered as a **PWA**
(installable desktop + mobile) with **Web Push** notifications.

**Operating mode (2026-07-02):** Opzava runs single-tenant internally first to market and promote Opzava itself. The
scale-ready multi-tenant architecture is retained; it runs one tenant now, not a public multi-tenant SaaS yet. The first
business-value build after the admin-Tasks MVP is **Marketing + CRM**.

**Two assistant personas (= the two-token context split):**
- **Ask Opzava** — the tenant/user **Personal Assistant** (Runtime-Control context, `write`+`approvals` token, project-scoped knowledge).
- **Ask Admin Opzava** — the **platform-ops Admin assistant** (Provisioning/Platform-Ops context, `admin` token).

**Core domain = the multi-agent AI Workforce:** persona'd agents (`SOUL.md`/`IDENTITY.md`), proactive via
**heartbeat + cron + standing-orders**, task-handling via PM cards + `AgentDispatch`, external customer comms via
OpenClaw **channels**, organized into departments (Marketing/Support/Finance/CRM).

---

## Q1 — Root architecture — LOCKED
**Opzava is a dedicated application backend (BFF) with its own durable, multi-tenant database** (users, roles,
workspaces/projects, tasks, CRM records, approvals, audit). The OpenClaw Gateway is a **private, backend-only
AI-runtime dependency** brokered via server-side RPC — never a client-facing or data-of-record store.
Rationale: OpenClaw docs state the Gateway is single-operator-domain and *not* a multi-tenant boundary, and the
Workboard is deliberately small ("not a replacement for Jira/Linear"). So RBAC/tenancy/sessions must live in the app.

## Q1b — Tech stack — LOCKED (user)
Next.js App Router + TypeScript + Postgres + **Drizzle** (locked 2026-07-02 via Slice 1 foundation research —
`docs/plan/research/slice1-foundation-stack.md`, `docs/plan/research/slice1b-data-rls.md`) + shadcn/ui + Tailwind.
Server-only OpenClaw RPC client.

## Q2 — Tenant ↔ Gateway topology — LOCKED
**Pure B: one OpenClaw Gateway per tenant/workspace, from day one.** No shared/pooled Gateway path.
Each tenant Gateway has its own profile, config, state, workspace, and port (ideally separate OS user/host).
Consensus: codex + mmx both recommended hybrid-C; user chose the stricter **pure-B** for a single code path and
uniform isolation. Implication: the broker must maintain a **tenant → Gateway routing table** and provision/
deprovision Gateways over the tenant lifecycle. Accepted trade-off: a Gateway fleet to orchestrate at scale
(container/pod per tenant, pooling for dormant tenants) — deferred, not designed yet.
Consensus trail: `docs/plan/consensus/q2-tenancy-topology.{codex,mmx}.md`.

## Q3 — OpenClaw RPC broker + auth — LOCKED
- **Transport: WS-first.** One persistent, scoped operator WebSocket per tenant Gateway carries both req/res
  commands (with idempotency keys) and server-push events. Admin HTTP RPC plugin kept only as an ops/break-glass surface.
- **Auth: per-Gateway paired device token, least privilege = `operator.write` + `operator.approvals`** (write
  implies read; excludes admin/pairing/talk.secrets → the app can drive agents/sessions/chat/cron and resolve
  approvals, but cannot mutate Gateway config or manage pairing). Token + keypair stored in Opzava vault, keyed by tenant.
- **Deployment: a SEPARATE long-lived Node `gateway-broker` service** owns the WS pool (one socket per ACTIVE
  tenant — lazy connect, idle-disconnect dormant), reconnect/backoff/circuit-breakers, and the tenant→Gateway routing table.
- **Credential split:** channel secrets (Slack/WhatsApp/Gmail) live inside each tenant Gateway; Opzava stores only
  Gateway reachability metadata (host/port/TLS fingerprint) + a vault reference to the broker device token.
Consensus trail: `docs/plan/consensus/q3-rpc-broker-auth.{codex,mmx}.md`.

## Q4 — Data-model boundary + bounded contexts — LOCKED
- **Opzava-owned (Postgres system-of-record):** Identity & Access, Tenant Onboarding, Project Management, CRM,
  Marketing, Notifications/Admin-Observability.
- **OpenClaw-owned (reached ONLY via the ACL):** Agent Sessions, Runs & Streaming, Channels, Cron/Automation,
  Workboard (agent-work), Logs, Usage/Cost, **Skills, Memory (memory-lancedb active slot + memory-wiki companion)**.
- **Anti-Corruption Layer = the `gateway-broker`** — the single seam to OpenClaw; no OpenClaw type leaks past it.
- **Two card concepts stay separate, bridged:** `pm.Card` (Opzava, human work) vs `workboard.Card` (OpenClaw, agent
  work), bridged by an **`AgentDispatch`** aggregate holding OPAQUE refs (cardId/taskId/runId/sessionKey as value
  objects), lifecycle projected back. Cross-referenced, never a foreign key.
- **Hybrid CQRS:** durable UI data (agent-run summaries, activity, errors, usage/cost, session index, Workboard
  lifecycle) is PROJECTED into Postgres read models; ephemeral data (token streaming, live tail, logs, transcript
  detail, steering) is LIVE READ-THROUGH via the broker; never live-query OpenClaw storage.
- **Load-bearing invariant:** projections are a rebuildable cache; **OpenClaw RPC snapshots are truth, WS events are
  hints**; the command path is write-through (apply the synchronous req/res result immediately).
- **Agnostic ports:** OpenClawGatewayPort, EventBusPort (Postgres outbox+LISTEN/NOTIFY → Redis/NATS/Kafka later),
  SecretsVaultPort, ObjectStorePort, RealtimeTransportPort.
Consensus trail: `docs/plan/consensus/q4-data-boundary-contexts.{codex,mmx}.md` (+ sad-path ledger: event
loss/dup/order, read-your-writes, gateway down/deprovision, orphaned refs, idempotency, cross-tenant leak, protocol drift).

## Q4b — Knowledge Management + project↔workspace mapping + credentials — LOCKED
- **New bounded context: Project Knowledge Management.** Ports: `KnowledgeSourcePort` (Opzava SoT),
  `KnowledgeIndexPort` (adapter = OpenClaw wiki + lancedb over OKF, swappable), `EmbeddingProviderPort`, `SkillCatalogPort`.
- **Project ↔ knowledge** — ⚠️ **REVISED by Q8:** scoping is now **employee = workspace, project = shared corpus
  injected per assignment, org = corpus** (NOT one workspace per project). The main orchestrator remains a project-scoped
  facade; cross-project = RBAC-gated fan-out. See Q8 for the authoritative model.
- **KB source of truth = Opzava** (docs/notes/uploads in Postgres + object store). memory/wiki/vectors are
  **rebuildable derived indexes**; reprovision → idempotent, content-addressed re-ingestion keyed by
  `(tenantId, projectId, contentHash)` from a consistent published KB revision (dry-run diff before apply).
- **Ingestion seam = OKF bundles + `wiki okf import`** (portable, agnostic) + **s3-backed lancedb** for durable vectors.
- **autoCapture OFF** — auto-captured chat facts become **candidate KB entries in Opzava** (reviewed → promoted to
  SoT), never hidden Gateway-only state; preserves the rebuildable-from-SoT guarantee. (user)
- **Skills governance = admin-only curated catalog.** Skills installed ONLY via the audited provisioning path with
  `security.installPolicy` (fail-closed) + verification; tenants/projects SELECT from an Opzava catalog, never
  self-install arbitrary ClawHub skills (skills are executable code → RCE risk). (user)
- **Two-token credential model = a bounded-context split:** Runtime-Control context (hot path, `operator.write` +
  `operator.approvals`) vs Tenant Provisioning / Platform-Ops context (`operator.admin`, per-Gateway-scoped,
  short-lived/JIT, out-of-band worker only, fully audited).
Consensus trail: `docs/plan/consensus/q4b-knowledge-credentials.{codex,mmx}.md`.

## Q4c — Execution isolation & security posture (efficiency) — LOCKED
- **NO per-project Docker sandbox.** Over-engineering given pure-B tenant isolation + curated admin-only skills; a
  container per project taxes the VPS for little gain (sandbox is "not a perfect boundary" per OpenClaw docs).
- **Primary control = TOOL POLICY (free hard stop), not sandbox.** Standard agents (orchestrator, project assistants,
  marketing/support) run **`sandbox.mode: off`** + tool policy DENY of `group:runtime` (exec/process/code_execution)
  + FS-mutating tools (write/edit/apply_patch). Allow chat, memory/wiki search, web (egress-allowlisted), messaging, sessions.
- **Sandbox ONLY for the rare code-executing agent** — then `scope: shared` per tenant, or offloaded to an
  `ssh`/`openshell` worker (a cheap separate box), keeping Docker off the main gateway VPS. Containers = O(tenants), not O(tenants×projects).
- **Real residual risk (neither sandbox nor tool policy stops it): data-flow attacks** — SSRF via `web_fetch`,
  prompt-injection/context-poisoning via RAG (wiki/web/doc content), secret exfiltration of the tenant's channel creds.
  Cheap mitigations: `web_fetch` egress/domain allowlist, input sanitization on ingested web/wiki content before it reaches
  the model, and a tool-invocation audit log. These are the security investments that matter and cost ~0 VPS load.
- **Ops win:** ~3–5x more tenants per VPS vs per-project containers.
Consensus trail: `docs/plan/consensus/q4c-sandbox-efficiency.{codex,mmx}.md`.

## Q5 — Multi-tenancy & RBAC — LOCKED
- **Hierarchy: Organization (= tenant = one Gateway) → Project → Member.** No structural Team node; "team" is an
  optional membership grouping/label. **marketing/finance/promotions/support = departments / project-types / queues
  (attributes), NOT RBAC roles.**
- **RBAC = resource-scoped, roles-as-data, behind an `AuthorizationPort`.** Grants at org scope AND per-project scope;
  a single `can(user, action, resource)` evaluator. Not ReBAC/Zanzibar, not broad ABAC (evolvable to ReBAC behind the port).
- **Isolation = tenant-scoped repositories + Postgres RLS as a fail-closed backstop.** `SET LOCAL app.current_org`
  per transaction; RLS denies empty org context. **PgBouncer transaction pooling mode** (session pooling breaks
  `SET LOCAL`). App-only = one bug from a leak; RLS-only fights tooling — do both.
- **Roles: Owner / Admin / Manager / Member / Guest-Client.** External clients live in a separate `external_identities`
  table, bound to ONE project, least-privilege (read-only + narrow support-ticket resource), NO org-wide membership,
  NO access to the internal orchestrator/knowledgebase.
- **Confirmed: Opzava users are Postgres identities only** — no individual OpenClaw operator identities; the broker
  holds one scoped operator token per Gateway + a signed `x-acting-user` for audit. Compromised operator ≠ tenant compromise.
- **I&A aggregates:** Organization, User (global identity), Membership(user,org,role), RoleGrant(user,scope,role),
  Project, ExternalIdentity, Invitation.
- **Biggest sad path: cross-tenant leak via a forgotten tenant context.** RLS then returns EMPTY rows — the app must
  surface a hard **403, not a silent empty state.** Invariant: a centralized `withTenant(org, fn)` transaction wrapper
  is the ONLY path to tenant tables; integration tests assert 403 (not 200-empty); alert on 403 spikes.
Consensus trail: `docs/plan/consensus/q5-tenancy-rbac.{codex,mmx}.md`.

## Q7 — Realtime + internal chat + AI assistants in-chat + PWA/Push — LOCKED
**Transport (consensus): self-hosted WebSocket hub in the `gateway-broker` service + Redis backplane + Postgres outbox,
behind a `RealtimeTransportPort`** (managed Ably/Pusher = a swap, not a rewrite). Rejected SSE+POST (weak fan-out) and
managed-default (vendor lock for a domain we own). Per-surface: agent token streaming, activity/notifications, team
chat/DM, mention inbox → WS hub + Redis fan-out, durable via outbox; **presence + typing → Redis-only TTL heartbeats
(10s/30s), never Postgres**.
**Internal Collaboration context (Opzava-owned, Postgres):** `Channel {public|private|dm}` → `Message {id, channel_id,
thread_parent_id?, author_ref, body, seq, edited_at?, deleted_at?}`; `Thread`; `Membership`; `Mention` (= mention inbox);
`Reaction`; `ReadCursor {channel,user,last_read_seq}`. **Fan-out:** outbox → `LISTEN/NOTIFY` → Redis pub/sub → all WS
instances; ordered by a **per-channel Postgres sequence**; at-least-once; client dedups by `message_id` (send idempotency key).
**Context split CONFIRMED distinct:** Internal Collaboration (Opzava write model) vs External Channels (OpenClaw customer
comms via ACL) vs Agent Sessions (OpenClaw). Shared kernel = `UserId`, `TenantId`, `ProjectId`.
**AI assistants as first-class chat participants** (persona identity from `IDENTITY.md`): inbound (user/@mention) → Bridge
in broker → OpenClaw `sessions.send` scoped to the right workspace; outbound → agent WS stream relayed as a streaming
assistant message (live "typing"), finalized on completion; proactive/async (heartbeat/cron/standing-order) → **Webhooks
plugin** → Opzava receiver → posted; exec/plugin approvals surface as interactive chat messages.
**PWA + Web Push:** installable service-worker PWA (desktop+mobile); **Web Push** (VAPID) behind a `PushNotificationPort`
(native FCM/APNs later); per-device `PushSubscription` in Postgres; push for DMs, @mentions, assistant completions,
approvals-needed, task assignments; in-app realtime when online, Web Push when backgrounded (deduped); iOS = installed-PWA only (16.4+).
**Sad-path invariants:** reconnect gap/dup → per-channel `seq` backfill (`seq > client_seq LIMIT N`) before live attach +
client dedup; assistant/gateway down → degraded "assistant unavailable" + queued (per-tenant circuit breaker); double
delivery (stream+webhook) → per-agent-turn idempotency key; push privacy → no sensitive payload (fetch on open); push
410 → prune dead subs; proactive spam → rate-limit + native `HEARTBEAT_OK` suppression.
Consensus trail: `docs/plan/consensus/q7-realtime-messaging.{codex,mmx}.md`.

## Q8 — AI Workforce / agent-persona domain (CORE) — LOCKED
**AI employee = an OpenClaw DELEGATE agent** (delegate-architecture pattern): own identity/persona (`SOUL.md` persona +
hard-blocks, `AGENTS.md` role + standing-orders, `IDENTITY.md` name, `USER.md` principals), own workspace + agentDir +
sessions + memory-lancedb + skills, isolated auth, channel bindings. Acts **on behalf of** humans; **never impersonates** them.
**Workforce-context aggregates:** `AgentEmployee {tenantId, name, personaId, departmentId, autonomyTier, openclawAgentId
(opaque ref), channelBindings[], toolPolicyRef, standingOrderIds[], status}`, `Persona {soulMd, agentsMd, identityMd,
hardBlocks[]}`, `Department {name, roleMandate, defaultTier}`, `AutonomyTier {T1_DRAFT | T2_SEND_ON_BEHALF | T3_PROACTIVE}`,
`StandingOrder {scope, trigger, actions[], approvalRequired, auditLevel}`, `ChannelBinding {channel, accountId, direction,
scopeFilter}`, `Assignment {taskId, employeeId, projectId?, sessionRef, reportRef}`. Provisioned via the **admin/provisioning
context** (admin-only OpenClaw config writes → `agents.list` + `bindings` + workspace files); runtime stores opaque refs + broker ACL.
**Knowledge scoping (REVISES Q4b): `employee = workspace`, `project = shared corpus`, `org = corpus`.** Workspace identity
is per-EMPLOYEE (persona + personal memory-lancedb + skills persist across all their work), NOT per-project. A Project owns a
**read-only shared corpusRef** (wiki + vectors) **injected at session start ON TOP of** personal memory (layering: personal →
project → org). **Memory writes land in the employee's workspace, never the project corpus.**
**Delegation / 'Ask Opzava' orchestrator:** main coordinator whose SOUL says "route to a specialist if one exists." Flow:
PM card / chat request → resolve Department → pick an AgentEmployee → spawn subagent session (employee's agentDir/bindings/
tools + project-corpus overlay) → employee works → reports back as a chat message attributed to its persona → orchestrator
threads it onto the parent card via `Assignment`. Escalates to a human when `tier == DRAFT` or a hard block fires.
**Human-in-the-loop default tiers:** Finance & Customer-Management → **T1 (Draft + approval)** (money/PII/contracts);
Marketing & Support → **T2 (Send-on-behalf, agent identity)**; **T3 (Proactive)** only for non-mutating / pre-approved
standing-orders (monitoring, briefings). Finance-event standing-orders stay T1 + approval.
**Biggest sad path: prompt-injection via a customer channel → a Tier-2 agent exfiltrates PII/funds.** Invariants enforced at
**Gateway TOOL POLICY + approval rows, NOT in SOUL** ("SOUL can lie; tool policy cannot"): (a) outbound HTTP only to a
per-agent domain allowlist; (b) tool policy denies PII/financial reads unless the binding grants it; (c) autonomous sends
triggered ONLY by standing-orders, never by an inbound message; (d) every send/mutation writes an immutable audit row;
(e) per-agent spend + rate caps; (f) money/PII/credential/legal/tenant-admin actions always require an approval row.
Consensus trail: `docs/plan/consensus/q8-ai-workforce.{codex,mmx}.md`.

## Q6 — User authentication — LOCKED (grounded in `docs/plan/research/q6-auth-stack.md`)
- **Library: Better Auth (primary), behind an `AuthPort`; Auth.js v5 + Postgres adapter = the real fallback.** Feature-fit
  (first-party multi-tenant orgs + revocable DB sessions + TOTP/recovery + SimpleWebAuthn passkeys + anti-enumeration)
  shrinks our custom auth surface. Mitigate its advisory volume (31; 21 in 2026): pin a vetted release, subscribe the
  `better-auth` GHSA feed, audit the cookie-cache/2FA/invitation paths. The AuthPort keeps a swap days-not-months.
- **AuthN vs AuthZ split:** Better Auth owns **authentication + coarse org membership ONLY**; Opzava's Q5
  `AuthorizationPort` (resource-scoped, roles-as-data) stays the **fine-grained authZ source of truth** — fine-grained
  checks never call Better Auth. Org membership syncs INTO our RBAC, not the reverse.
- **Sessions: DB-backed + revocable** (no JWT). Revoke on logout-all-devices, **password reset, org removal, role/membership
  change**. **`session.cookieCache` disabled** (advisory-driven, non-negotiable).
- **2FA: TOTP + single-use recovery codes baseline + passkeys (WebAuthn) step-up/passwordless; org-admin-enforceable MFA**
  (`requireMfa` on sensitive orgs/admin actions).
- **PWA auth (service worker CANNOT read httpOnly cookies):** the only session read is a server `/api/auth/session` endpoint;
  the SW registers its Web Push subscription via a one-time `HMAC(sessionId, nonce)` handshake, and the **server binds
  push↔session and re-validates that binding server-side at enqueue** (a service worker cannot securely hold the HMAC key,
  so validation is server-side, not in the SW — ADR-006 refinement); offline UX = cached public surfaces + explicit "auth required" gate. No "two-cookie split"
  (not spec-supported). CSRF via SameSite + server-action origin checks.
- **External Guest-Clients: per-project scoped magic-link** (project key in token claims, server-bound to the
  `external_identities` row, TTL ≤24h, single-use, audited). They NEVER receive org membership.
- **Biggest sad path: role/membership flip between session issue and use, or a provider invite-callback granting access.**
  Invariant: **every privileged access re-checks membership+role inside the same DB tx that authorizes; provider invite
  callbacks grant NOTHING without re-validating the Opzava `Invitation` row in-tx; `revokeSessionsOnRoleChange` runs in-tx;
  push↔session bindings re-validated server-side at enqueue.**
Consensus trail: `docs/plan/consensus/q6-auth.{codex,mmx}.md`.

## Q9 — Error→Admin-card pipeline (Ask Admin Opzava) — LOCKED
**Opzava-owned Notifications/Admin-Observability context (Postgres).** Aggregates: `ErrorGroup {fingerprint, severity, count,
firstSeen, lastSeen, status, tenantId?, projectId?, agentId?, gatewayId?, visibility}`, `ErrorEvent {groupId, source, payload
(JSONB, redacted), ts}`, `RemediationAction {groupId, kind, blastRadiusClass, status, approvals, auditRef}`, `AlertRoute
{match, severity, channel}`. **The ADMIN card is a projection of ErrorGroup** (reuses the PM-card read model on a platform board).
**Sources (4 producers → one normalized Incident):** (a) app — Next.js `error.tsx`/`route.ts` + broker reporters; (b) broker/ACL
ingestion errors; (c) **OpenClaw via the ACL** — scheduled `logs.tail` (cursor/gateway), `diagnostics.stability`, task-ledger
`failed/timed_out/cancelled`, Workboard failure flags, `health`, usage/cost spikes — **projected per Q4 hybrid-CQRS (snapshots =
truth, events = hints)**; (d) customer/support report. Workboard = a diagnostics SOURCE only.
**Capture: lean built-in incident domain for day one, behind an `ErrorCapturePort`.** Self-hosted **GlitchTip** (Sentry-API,
single PG, ~150MB) is an OPTIONAL drop-in adapter for frontend source-map symbolication later — deferred (lean-ops).
**Dedup / anti-storm:** fingerprint = SHA-256(`service|route|exception-type|normalized-message`). Card creation: suppress until
count ≥ N in window (default 3/5min) OR severity=critical → immediate; 30-min per-fingerprint cooldown; per-tenant/per-gateway
hourly card caps. One card per fingerprint lifetime; reopen on post-resolve recurrence.
**Boards + visibility:** a distinct **platform-ops ADMIN board** (`tenantId = NULL`, spans app+infra+ALL gateways) vs
**tenant-visible** redacted error views. Single switch = `ErrorGroup.visibility {platform_only | tenant_visible | tenant_redacted}`,
enforced by RLS + query-guard. Cross-tenant detail never leaves the platform board.
**Ask Admin Opzava remediation loop:** triage card → read `logs.tail`+`diagnostics.stability` via ACL → propose a
`RemediationAction` with a **blast-radius class**. Default autonomy = **low (notify + draft only)**; **approval gate for class ≥
medium** (restart-gateway / re-dispatch / re-provision); **destructive** → **2-step human confirm**. Every action: dry-run-first,
idempotency key, **one-tenant blast radius**, immutable admin-token audit (actor, before/after).
**Biggest sad path + invariants:** (1) the **pipeline itself going blind** → an `errors_ingest_deadletter` table is the absolute
sink + a **watchdog card** (heartbeat-driven, never suppressable) fires if no ErrorEvent lands in 5 min; (2) **redaction at the
INGEST boundary** — one `redact(payload, visibility)` runs before storage (never at read time), so no payload crosses tenant scope
or leaks PII/secrets from stack traces.
Consensus trail: `docs/plan/consensus/q9-error-pipeline.{codex,mmx}.md`.

## Q10 — CRM / Customer-Management — LOCKED
**Opzava-owned Postgres truth; OpenClaw stays channel/session/transcript owner behind the ACL.** Aggregates (all
tenant-scoped): `Contact` (root — PII, lifecycle, consent refs, dedup key, ChannelIdentity set), `Account/Company`,
`Deal/Opportunity` (stage → `Pipeline`), `Pipeline/Stage` (versioned ref data), `Activity` (child: call/note/inbound-msg),
`Ticket` (root — refs Contact + conversation + assignee AgentEmployee + SLA), `Segment` (stored query + materialized member IDs),
`Consent` (per-channel: status, ts, proof), `ChannelIdentity` (**VO on Contact = the SENDER identity** `{channel, externalId,
verified, linkedAt}`, NOT a conversation id).
**ChannelIdentity ↔ Contact resolution:** the ACL emits `SenderSeen{tenantId, channel, externalId, displayName}`; Opzava keys a
**`ChannelIdentity(channel, externalId)` unique-per-tenant** index. **Exact verified match → auto-link**; miss → an ephemeral
`UnknownContact` shell in an inbox for agent confirm. **Cross-channel dedupe = suggest-and-confirm** (tenant fingerprint →
candidates → audited manual merge). **Never auto-merge, never across tenants** (same phone ≠ same Contact across tenants).
**Conversations → CRM:** ACL `ConversationStarted` → resolve to ContactId (or shell) → write `Activity`; open a `Ticket` when
`intent=support`, binding Contact + conversation + a support AgentEmployee. (External Channels context, distinct from internal team chat.)
**Marketing:** `Segment` = stored query + nightly materialization; **Consent enforced at send-time**; opt-out webhook → revoke + suppress.
**GDPR right-to-erasure = an idempotent admin/provisioning workflow** across BOTH stores: (a) Opzava — hard-delete Contact, hash PII
in Activities/Tickets, blank transcript bodies, keep FK skeleton; (b) OpenClaw (per-tenant Gateway) — delete channel history + scrub
agent `memory-wiki`/`lancedb` by tenant filter; (c) idempotency key + audit ledger; async reindex.
**Biggest sad path + invariant:** a **wrong contact↔conversation link poisons every downstream artefact.** Invariant: **no external
conversation/activity/ticket write persists without tenant scope + a resolved-or-shell ContactId — a raw `externalId` NEVER lands in
Opzava domain tables**; `ChannelIdentity(channel, externalId)` unique per tenant.
Consensus trail: `docs/plan/consensus/q10-crm.{codex,mmx}.md`.

## Q11 — Department workflow engine — LOCKED
**Principle: "Opzava defines, OpenClaw executes."** `Workflow`/`Playbook` = the Opzava definition aggregate (SoT) with three
`Mechanism` children — `StandingOrderBlock` (→ AgentEmployee `AGENTS.md` autonomous authority), `CronSpec` (→ cron), `TaskFlowSpec`
(→ managed multi-step TaskFlow). `Workflow.Publish` → `WorkflowProvisioner` (admin/provisioning context) writes the OpenClaw
artifacts + stores a `ProvisionReceipt`; runtime events project back → `WorkflowRun`/`RunStep` write-model (Q4 hybrid-CQRS).
**Marketing content pipeline:** `Campaign` · `ContentCalendar` · `ContentItem` (`Idea → Draft → InReview → Approved → Scheduled →
Published → Archived`) · `ContentPipeline` (process manager: AI draft [T2] → review → `Approval` gate → schedule/publish) · `Report`.
**Unified `Approval`** (`Pending → Approved|Rejected|Expired`, `requesterAgentId`, `policyRef`, `payloadRef`), one chat inbox (Q7).
**Split of truth:** Opzava `Approval` = SoT for **business** approvals (content/finance/send-on-behalf); OpenClaw `operator.approvals`
= runtime truth for **exec/plugin** (agent tool-execution) gates; reconciled via mirrored refs (business conflict → Opzava wins).
**Same engine reused:** `FinanceEventWorkflow` (T1), `SupportSlaWorkflow` (T1 ack + tiered escalation, `SLAClock`), `SendOnBehalfWorkflow`
(T2) — all instantiate `Workflow + Mechanism + Approval + Run`; only policies + mechanism shapes differ.
**Reports:** scheduled trigger → agent run → ACL read (channels/usage/ledger) → `ReportJob` → versioned `ReportArtifact`, cached by
`(tenant, reportType, periodHash)` with a freshness SLA.
**Biggest sad path + invariants:** runaway standing-order/cron **fan-out burns quota + floods approvals**. Every `Mechanism` carries
`costBudgetPerHour` + `maxConcurrentRuns` + `requiresApprovalPolicy`; the provisioner **rejects a publish that would breach the tenant
ceiling**; a runtime `RunLimiter` enforces; approval backlog auto-escalates at >50% SLA. **Inviolable: no `ContentItem` reaches
`Published` without an `Approval` in `Approved` state — enforced at BOTH gateway and UI** (+ idempotency on scheduled runs).
Consensus trail: `docs/plan/consensus/q11-dept-workflows.{codex,mmx}.md`.

## Q12 — Billing + onboarding & Gateway provisioning lifecycle — LOCKED
**Onboarding = a compensating SAGA** (`ProvisioningJob`, orchestrated by the admin/provisioning platform worker using a short-lived
`operator.admin`; the hot broker stays `write`+`approvals`): sign-up → create tenant+owner(org) → reserve config/state/workspace/ports
→ start Gateway container → wait `health` → bootstrap admin-token pairing (Q3) → seed default departments+agents+ACL → attach Plan →
channel connect-wizard. Each step idempotent (keyed by `tenant_id`) with a compensating action. **Lifecycle: `Provisioning → Active →
Suspended → Deprovisioning → Deleted`**, single source of truth `tenant.lifecycle_state` (`updated_at` guard); `ProvisioningJob` owns
retry/failure/rollback.
**Gateway provisioning mechanism (lean realization of pure-B):** **one rootless Docker container per tenant** on a bin-packed VPS
(unique `OPENCLAW_CONFIG_PATH`+`OPENCLAW_STATE_DIR`+`workspace`+`gateway.port`+derived ports), **lazy-start + idle-stop** (~10min),
image-cached → **~50+ tenants/VPS**. Scale path: K8s Deployment / Nomad alloc behind a **`GatewayRuntimePort`**
(`GatewayInstance.runtime = {docker|k8s|nomad}`) — no domain change.
**Billing status: DEFERRED (2026-07-02).** `BillingPort` stays as a null-adapter seam for internal single-tenant use. No
payment provider, including Stripe, is implemented until external monetization. The billing/metering design is retained
for that later stage.
**Billing design retained:** provider behind a **`BillingPort`**. Aggregates: `Subscription`, `Plan(slug, limits_json, provider_price_id)`, `UsageMeter`,
`MeterEvent(idempotency_key = sha256(tenant, agent, window, raw usage.cost))`, `Invoice`, `ProvisioningJob`, `GatewayInstance`. A 1-min
`usage.cost` poller emits idempotent MeterEvents for the future provider adapter.
**Plan enforcement:** BFF quota middleware checks `Plan` + `UsageMeter` per request (agent count, cost budgets [Q11], channels, seats,
autonomy tiers, features); overage → 402; **dunning → `Suspended`** (block gateway start, 30-day data grace) → `Deprovisioning`.
**Biggest sad path + invariant: the ORPHANED Gateway** (billing paused but container still burning CPU; or a double-provision race →
two containers on the same ports). **Invariant: no container may run without an active tenant entitlement + a valid `GatewayInstance` +
a live provisioner lease; `GatewayInstance.tenant_id` UNIQUE and `(state_dir, ports)` UNIQUE via DB advisory locks; lifecycle bound to
`tenant.lifecycle_state` via the outbox.** Purge = `Deprovisioning` emits `container.kill` + `state_dir.rm` + `stripe.cancel` + GDPR
purge (Q10/Q4b) in one tx; failure → idempotent cron reaper.
Consensus trail: `docs/plan/consensus/q12-billing-provisioning.{codex,mmx}.md`.

## Q13 — Capability-parity map + ADR/PRD backlog — DELIVERED
Every mockup screen classified OpenClaw-native / Opzava-owned / hybrid → `docs/plan/capability-parity.md`; priority-ordered
ADR/PRD backlog → `docs/plan/backlog.md`, realized as ADR-001..015 (`docs/adr/`) + PRD-001..018 (`docs/prd/`).
Consensus trail: `docs/plan/consensus/q13-backlog.mmx.md` (historical — its draft PRD-019..028/ADR-016 ids were
renumbered into the final ADR/PRD set).

## Q14 — Local Docker stack ⇄ live Dokploy parity (Traefik) — LOCKED
**One canonical `docker-compose.yml` (with Compose profiles) is the source of truth for BOTH environments.** Local runs the
full stack incl. its own Traefik (a `local` profile) with **mkcert** TLS on `*.localhost`; on **Dokploy** the app deploys as a
**Compose stack that ATTACHES to Dokploy's existing Traefik** (no second Traefik) with **Let's Encrypt** on `*.opzava.app`.
Identical across both: service names, the shared external network **`dokploy-network`**, Traefik router/label conventions,
healthchecks. Diverges only: TLS issuer, Traefik ownership, replicas/limits, secrets source (`.env` vs Dokploy secrets — same keys).
**App services are Compose-managed; per-tenant OpenClaw Gateways are runtime Docker containers** created/reconciled by the
**`worker-provisioning`** service (the admin/provisioning context) via the `GatewayRuntimePort` docker adapter — NOT baked into compose.
**Docker access security (codex corrects mmx):** provisioning needs WRITE (create/start/stop/remove containers + network connect),
so a read-only proxy is insufficient — use **`tecnativa/docker-socket-proxy` scoped to a NARROW MUTATION subset** (containers +
networks; deny image push, host bind-mounts, privileged, arbitrary exec), reachable **ONLY by `worker-provisioning`**. Traefik may
read `/var/run/docker.sock` directly as read-only for Docker-provider discovery. **The broker (hot path) NEVER touches Docker.**
CI lints that `/var/run/docker.sock` appears only on the approved read-only Traefik discovery mount and socket-proxy service.
**Traefik provider parity:** tenant Gateways are plain containers → Traefik must have the **Docker provider enabled** to route them.
On Dokploy (Swarm) ensure its Traefik has the Docker provider on (pinned flags), OR run a **dedicated Opzava Traefik** for tenant
routing on `dokploy-network`. Local plain-compose uses the Docker provider natively → labels resolve identically.
**Service list (compose):** traefik (local profile), postgres, pgbouncer, redis, minio, next (web), broker, worker-provisioning
(owns the socket-proxy), worker-projection, worker-metering, dockerproxy. Dynamic: per-tenant `openclaw-gateway` containers
(Traefik-labeled, joined to `dokploy-network`). Domains: `app` / `t-<id>` on `*.localhost` (mkcert) vs `*.opzava.app` (Let's Encrypt).
**Biggest sad path + invariant: a routable ORPHAN tenant Gateway** (container up + Traefik still routing after suspend/delete).
Deprovision/suspend is ONE transaction that removes the Traefik route AND kills the container AND revokes entitlement (ties to
ADR-002 anti-orphan + ADR-014 suspension); a reaper kills any tenant-Gateway container lacking Active-entitlement + valid
GatewayInstance + live lease and pulls its route. The SAME reconcile logic + single `GatewayRuntimePort` adapter run local and live
(only the Docker endpoint differs). → new **ADR-015 (Deployment & environment parity)**; refines ADR-002's `GatewayRuntimePort`.
Consensus trail: `docs/plan/consensus/q14-local-dokploy-parity.{codex,mmx}.md`.

---

## Q15 — MVP roadmap — LOCKED, then superseded for execution order
Walking-skeleton MVP + phased P1–P8 build order locked from mmx consensus → `docs/plan/roadmap.md`.
2026-07-02: `docs/plan/EXECUTION.md` superseded the walking-skeleton MVP with the **admin-Tasks MVP** (dogfood:
Opzava tracks its own build); roadmap P1–P8 remain the phase-detail reference, EXECUTION.md controls order.
Consensus trail: `docs/plan/consensus/q15-mvp-roadmap.mmx.md`.

---

## Grilling status — COMPLETE ✅ (Q1–Q15)
All architecture branches locked with paired codex + mmx consensus: **Q1** BFF+DB · **Q1b** stack · **Q2** pure-B tenancy · **Q3**
WS broker+scoped token · **Q4** contexts+CQRS+ACL · **Q4b** knowledge mgmt+two-token · **Q4c** tool-policy-first security · **Q5**
RBAC+RLS · **Q6** auth (Better Auth) · **Q7** realtime+chat+assistants+PWA/Push · **Q8** AI Workforce · **Q9** error→admin-card ·
**Q10** CRM · **Q11** dept workflows · **Q12** billing+provisioning · **Q13** capability-parity map + ADR/PRD backlog ·
**Q14** local⇄Dokploy parity · **Q15** MVP roadmap.
The grilling sequence is complete. Design is realized in ADR-001..015 + PRD-001..018; execution is controlled by
`docs/plan/EXECUTION.md`.
