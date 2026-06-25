# Opzava Context

This file defines the shared language future agent runs must use when reasoning about `opzava`.

## Product Identity

- Full brand name: `Opzava`.
- Machine slug: `opzava`.
- Local directory: `anito-opzava`.
- Product: self-hosted AI operations control plane for building an internal AI team.
- Base project: an open-source agent-orchestration base (recorded in `docs/ard/0001-use-mission-control-as-base.md`).
- First department workflow: content generation ending at a WordPress draft.
- Broader scope: SEO research, writing, editing, lead research, cold outreach, campaign operations, reporting, and human approvals.

## Core Principle

Agents are workers, not the brain. The system owns sequence, validation, retries, approvals, external actions, source provenance, cost tracking, admin-managed configuration, and audit trails.

## Brand Rule

Product-facing surfaces use `Opzava`, never `Mission Control`. `Mission Control` is allowed only as a historical upstream reference in ARDs, discovery notes, migration comments, license-required attribution, or tests that assert brand removal.

## Source Of Truth

- Structured database artifacts are the source of truth.
- Admin settings are the source of truth for operator-controlled provider configuration.
- Agent memory is not source of truth.
- Prompt text is not source of truth.
- Logs are evidence, not source of truth.
- External provider responses must be captured as structured artifacts or external-call records before downstream steps depend on them.

## Ubiquitous Language

- `WorkflowDefinition`: versioned template for a workflow.
- `WorkflowRun`: one execution of a workflow definition.
- `StepRun`: one execution of a workflow step inside a workflow run.
- `Artifact`: structured output from a step, validated against a versioned schema.
- `Approval`: human decision gate for a requested side effect or content milestone.
- `Job`: durable unit of work scheduled for execution.
- `Attempt`: one try at executing a job.
- `DeadLetter`: exhausted failed job with replay metadata.
- `ExternalCall`: recorded interaction with a provider.
- `CostEvent`: recorded cost or usage event.
- `AuditEvent`: durable record of who or what changed system state.
- `ProviderAdapter`: mock or live adapter that enforces the provider contract.
- `AdminConfig`: operator-controlled configuration stored and validated by the app.
- `SecretReference`: reference to a secret value, never the cleartext value in logs, generated artifacts, or source code.
- `SourceProvenance`: captured evidence linking generated content to sources.
- `AntiSlopReview`: review artifact that rejects generic, unsupported, formulaic, or low-information output.

### Orchestration engine (see `docs/ard/0014-workflow-engine.md`)

- `Step`: one typed unit of work in a `WorkflowDefinition`, with declared inputs and outputs; an execution of a Step is a `StepRun`. The graph position of a Step within a `WorkflowGraph` is its identity — do not call it a "node".
- `WorkflowGraph`: the directed graph of `Step`s + `Edge`s that a `WorkflowDefinition` compiles to — the single shape both the inherited scheduler-dispatch and the durable runner execute against (the unification surface).
- `Edge`: a directed connection from one `Step` to another, carrying an `EdgeHandle` (`source | approved | rejected | error | …`) that selects which downstream Step runs for a given outcome. Branching is data on the Edge, not a control-flow Step.
- `RunContext`: the data a `StepRun` reads from prior StepRuns and writes for later ones — the inter-step data flow of a `WorkflowRun`. Not a property of any single Step.
- `ReviewStrategy`: a reusable quality-judge that evaluates a StepRun's output and returns a verdict (valid / invalid + feedback, optionally modified params). `Aegis` and the content-quality rule-gates (`AntiSlopReview`, fact-check, brand) are ReviewStrategies — the automated counterpart to a human `Approval`.
- `ModelInvocation`: the result of a provider LLM call (text + token usage + cost) returned at the provider seam; a specialization of `ExternalCall`. The seam through which Steps call models without knowing the provider (the `ProviderAdapter` runtime).

### Essential product surfaces (UX-redesign; see `docs/architecture/ux-redesign/wiring/`, ARD 0013)

- `ProjectProfile`: the Engine-B product overlay on an inherited `project` — its `type` (`blank | marketing | …`) and `enabled_tiles`. The inherited `projects` table is never mutated for product concerns.
- `ProjectMember`: a role-bearing **human** relationship to a project (`owner | member | viewer`) on Engine-B `opzava_project_members`, keyed by value — distinct from agent assignment (`project_agent_assignments` is agents-only). The roster self-seeds on first touch (assign/comment/approve) and falls back to a participant-footprint derivation when empty; room visibility is gated by the `opzava_conversation` typing layer, never by touching inherited `messages` (per 100 T2).
- `Board` / `Card`: a **presentation view** over inherited `tasks` (columns ≈ task status groupings) — **not** new tables. A "card" IS a `task`.
- `TodoList` / `TodoItem`: an Engine-B **grouping** over `tasks` (references task ids by value, joined at the composition layer) — **not** a new work-item type.
- `Goal`: a SMART objective (statement, measurable + current + unit, deadline, label status, owner, connected work) with computed progress; never traffic-light coloured.
- `Idea`: a Discovery-board item (`column`: New | Exploring | Decided | Parked; votes, research sources, single-model AI opinion) that may `connect` to a project.
- `Document`: a Docs-&-Files entry (doc or uploaded file) with a storage abstraction; distinct from repo/OpenAPI docs.
- `MarketingCampaign`: a multi-channel campaign umbrella (`stage`: Plan→Create→Approve→Publish→Measure) — distinct from the email-send `Campaign`, which it reuses as its email channel executor.
- `Asset`: a marketing asset (file + type + status) reviewed via `Approval`.
- `MetricEvent`: an ingested external metric (email/web/social/ads) — the only honest source of report numbers; absent until its `Connector` exists.
- `Connector`: a uniform external integration (`AdminConfig` connection + `SecretReference` + guarded `ProviderAdapter` + ingestion to `MetricEvent`).
- `LinkedTool` / `ToolHealth`: a connected agent tool and its state (`active | connected | degraded | disconnected | not_linked`), shown by glyph+label.
- `Conversation`: a typed thread (`team | dm | group_dm | assistant | orchestrator` — five kinds on `opzava_conversation`, per 100 T7) layered over inherited `messages`; AI turns carry inline step/artifact/`Approval` cards. Group-DM = one `opzava_conversation` with a `participants[]` array; human sends stay on the inherited chat route (D7.4 — the `opzava_*` overlay never touches `messages`).
- `ProjectHealth`: a project's derived status — **two facets, not one value**: a health facet `{needs_you, blocked}` and an activity facet `{running, scheduled, idle, planning}`, with a display-label precedence `blocked > needs_you > running > scheduled > idle > planning` (so a project can show "running" *and* "1 waiting for you" at once). Computed deterministically by `projectNeedsYou` (pure) + `readNeedsYouRollup` (per 100 T1); "Needs review" is the `quality_review`-pending sub-case of `needs_you`.
- `NeedsYouRollup`: the deterministic cross-project aggregation ("N projects need you · M blocked") — `needs_you` and `blocked` are **disjoint** counts (blocked = an external impediment you can't directly fix, e.g. a dependent tool offline; needs_you = waiting on your action). v1 is workspace-singleton scoped (per 100 T1).
- `OrchestratorAction`: a registry entry the Ask-Opzava orchestrator may propose, confirmed-before-act — either `internal-reversible` (auto-executes: notify_owner, create_followup_task, request_changes_redraft) or `external-guarded` (mints an `Approval` + guarded provider: approve_and_send). Distinct from an `Approval` (the external gate); `request_changes` is an action, **not** an approval-state (per 100 T3).
- `AssistiveAI`: any AI-authored block (analysis, recommendation, "make it SMART", consensus, draft, digest) that shows provenance and routes through human `Approval` before any **external/irreversible** action — internal-reversible state changes (card moves, metric updates, queueing an approval) may be AI-driven; never autonomous over external actions (per 93 D5 / 96 A1).
- `UserProfile`: the Engine-B product overlay on an inherited user — `opzava_user_profile` (`src/opzava/modules/account/`), keyed to `users.id` **by value**, holding only product-profile fields (`timezone`, `bio`, `job_title`, `notif_prefs`, `appearance`, extensible `record_json`). It **never** duplicates Engine-A identity (`display_name`, `email`, `avatar_url` live on inherited `users`); the profile read **composes** the two at the route/reader layer, never by a cross-engine import. `timezone` is the one field with a live consumer today (relative-date formatting, ARD 0016).

### Team execution & surfaces (see `docs/ard/0015-team-execution-and-surfaces-architecture.md`)

- `ControlPlane` / `ExecutionPlane`: Opzava is the control plane (cards, ledger, state, gate); the operator's local tool and OpenClaw are the execution plane. Opzava **delegates execution, never owns it** — it is not an executor and not a CI runner.
- `TaskType`: the discriminator on a Card (`code | content | social | ops`) that selects its file substrate, execution engine, and `ReviewStrategy`. Not every task is dev work; only `code` owns a git branch / PR / code review.
- `ExecutionSurface`: where a task's work physically runs — `local` (operator's machine, personal subscription) | `server` (OpenClaw on the Dokploy box) | `web-terminal` (observation of an `OpenClawAgent` session). Distinct from `TaskType`.
- `OpenClawAgent`: a server-side execution persona on the single OpenClaw gateway, backed by one `AgentAccountProfile`. The unit of server-side execution and of agent-from-host isolation. Not the mainframe — OpenClaw is an optional execution backend behind Opzava.
- `AgentAccountProfile`: one of the operator's connected model accounts on OpenClaw (`anthropic:max` via CLI-reuse on the server, `openai:chatgpt` via OAuth, an API key for failover). Multiple per gateway; the operator's own subscriptions. The host-bound constraint on subscription reuse applies to multi-human shared boxes, **not** to the single operator's own host.
- `AccountRouting`: the policy mapping `TaskType` (+ per-Card override) → account/model, stored in `AdminConfig`; OpenClaw per-profile failover runs underneath. No model choices are hardcoded in source (golden principle).
- `ready_for_review` / `done`: on a Card's review lifecycle, `ready_for_review` is the operator/agent's **claim** of completion and the **Aegis trigger**; `done` is Aegis's **verdict** — Aegis gates *between* them and is never triggered by "done". `changes_requested` is the rejected-branch return to `in_progress`.

### Identity & sessions (Engine A auth — `src/lib/auth.ts` / `user_sessions`, never an `opzava_*` table)

- `UserSession`: a human operator's authenticated web-login — one `user_sessions` row, minted by an interactive login and carried by the Opzava session cookie (fixed 7-day expiry, no refresh). The unit "Active sessions" lists and `Revoke` invalidates; *active* = a `UserSession` whose `expires_at` is still in the future (a derived state, never a stored flag). Distinct from an `OpenClawAgent` session and from a `DeviceAuthorization`.
- `CurrentSession`: the one `UserSession` whose cookie token authenticates the request in hand — "This device" in the UI, resolvable via `getCurrentSessionId`. Exactly one for a cookie-authenticated request; **absent** for API-key or proxy-header auth (which mint no `user_sessions` row), so nothing is marked "This device" then.
- `Revoke`: invalidate a `UserSession` by deleting its row so its token stops authenticating — immediate and idempotent. UI labels map onto it: per-row "Sign out", all-but-current "Sign out everywhere", own-session "Log out" (the device-scoped avatar-menu action). `destroySession` / `destroyAllUserSessions` are its Engine-A primitives.
- `DeviceAuthorization`: the RFC 8628 device-code grant that links a CLI/desktop agent tool to Opzava (`docs/ard/0012-device-authorization.md`) — a separate credential path that surfaces as a `LinkedTool` / `ToolHealth` ("Connected tools"), **never** a `UserSession` ("Active sessions").
- `SessionLabel`: the display-only `device · browser` string projected from a `UserSession`'s stored `user_agent` (via `ua-parser-js`) — a presentation projection, not a stored Device; coarse by nature (a UA yields "Mac", not "MacBook Pro").
- `TwoFactorEnrollment`: a user's TOTP second factor — an Engine-A `user_totp` row holding the **reversibly-encrypted** TOTP secret (AES-256-GCM, key HKDF-derived from `AUTH_SECRET`) plus enabled/confirmed state. Verified as a second login step after the password. Engine A; never a `SecretReference` and never an `opzava_*` table.
- `TOTP`: a time-based one-time code (RFC 6238) from the operator's authenticator app — the second factor. Its secret is *encrypted, not hashed* (verification needs the cleartext) and replay-guarded by tracking the last-used time-step.
- `RecoveryCode`: a single-use, **scrypt-hashed** backup code (like a password) that substitutes for a `TOTP` when the authenticator is lost; shown once at enrollment.
- `TwoFactorChallenge`: the short-lived **stateless signed token** issued when a 2FA-enabled user passes the password step; redeemed with a `TOTP` or `RecoveryCode` to mint the `UserSession`. Carries no DB state.
- `AccountDeactivation`: a **reversible soft-disable** of a user — sets `users.disabled_at`, revokes all their `UserSession`s, and bars login — NOT a hard delete (authored work is retained, attribution preserved). Self-service via `DELETE /api/me`, **refused for the last active admin** (no bricking), reversible by an admin. The mockup's "Delete account" is this.

## Forbidden Ambiguity

- Do not say `task` when the correct term is `WorkflowRun`, `StepRun`, or `Job`. A `task` (the kanban Card) is the human-facing work item; a `StepRun` is a workflow execution unit — a task may be progressed by a WorkflowRun, but they are distinct.
- Do not say `node` when the correct term is `Step` (the definition) or `StepRun` (an execution). "Node" is a foreign term from other frameworks; Opzava's graph units are Steps.
- Do not say `content` when the correct term is `SEOBrief`, `Outline`, `ArticleDraft`, `FactCheckReport`, or `BrandReview`.
- Do not say `config` when the correct term is `AdminConfig`, environment bootstrap config, or `SecretReference`.
- Do not say `done` unless the acceptance tests and required artifacts exist.
- Do not say `probably`, `should`, or `likely` for a build-critical fact without a discovery note.
- Do not say `AI output` without naming its artifact type, source provenance, validation status, and approval state.
- Do not say `Campaign` when you mean `MarketingCampaign` (the multi-channel umbrella) — the email-send `Campaign` is only its email channel executor.
- Do not say `Card` or `Todo` as if it were a new stored entity — both are views/groupings over inherited `tasks`; do not create `opzava_card`/`opzava_todo` tables (ARD 0013, D1).
- Do not assert a project is "on track" / "needs you" / "blocked" as if it were a stored column — it is the **derived** `ProjectHealth` predicate (per 100 T1); render it only from `projectNeedsYou`/`readNeedsYouRollup`, never invented.
- Do not show a tool as `active` or cite "p95" latency for a non-gateway tool — `active` is honest only for gateways with live agents; CLI/MCP tools cap at `connected`/`disconnected`/`not_linked` (per 100 T4).
- Do not compute `LinkedTool`/`ToolHealth` state by importing `device_tokens` / `gateway_health_logs` / `agents` into the tools module — those are Engine A; merge them into tool state ONLY via the `readUnifiedToolHealth` composition read (a one-way Engine-A→B read-seam). Tool state is a projection (`projectToolState`), never a stored flag; `not_linked` requires the fixed tool catalog.
- Do not present a report number (opens/clicks/conversions/spend/traffic) as real without a live `Connector` and `MetricEvent` data — until then the surface shows "Connect &lt;platform&gt;" (per 93 D4 / 100 T5).
- Do not use `ticket` to mean an external helpdesk/support ticket — `ticket` is the inherited project-ticket scheme (`CS-1042`) only (per 100 T8).
- Do not present a report number (opens, clicks, spend, traffic) as real without a live `Connector` and `MetricEvent` data; until then the surface shows a "connect &lt;platform&gt;" state.
- Do not say the AI "publishes", "decides", or "acts" autonomously — it is `AssistiveAI`: it drafts, a human `Approval` gates, a guarded `ProviderAdapter` acts.
- Do not treat a `Card` as a dev task by default — it has a `TaskType` (`code | content | social | ops`); only `code` tasks own a git branch, PR, and code review. Forcing git/code-review onto content/social/ops is over-engineering (per ARD 0015).
- Do not say Aegis runs "when the task is done" — `done` is Aegis's verdict; `ready_for_review` (the completion *claim*) is what triggers Aegis.
- Do not say the server "can't use my subscription" as a blanket rule — for the single operator it can (CLI-reuse on the operator's own host); the host-bound constraint applies to multi-human shared boxes only (per ARD 0015).
- Do not say "the web-terminal is like my local terminal" — it is an observation/steer surface over an `OpenClawAgent` session, not a Codespaces-equivalent dev environment; Opzava does not become a cloud-IDE or a CI runner.
- Do not say `session` unqualified — it collides with a `UserSession` (web-login, `user_sessions`), an `OpenClawAgent` session (execution observation), and a `DeviceAuthorization` grant (linked tool). Always name which one.
- Do not conflate "Active sessions" with "Connected tools" — the first lists `UserSession`s (Engine A `user_sessions`); the second lists `LinkedTool`s (device-authorized agent tools, ARD 0012). Same mockup card-stack, different entities.
- Do not model a `UserSession`'s device as a stored entity — it is a derived `SessionLabel` from `user_agent`; there is no Device table and the label is coarse/heuristic (never assert "MacBook Pro" from a UA).
- Do not say the product "deletes" or "destroys" a session — the canonical verb is `Revoke` (UI: "Sign out"); `destroySession` is only the Engine-A primitive that implements it.
- Do not store a `TOTP` secret as a `SecretReference` or as a hash — `SecretReference` (Engine B) is the pointer model for operator-configured *provider* credentials and has no backing vault; a `TOTP` secret is a *per-user auth* credential (Engine A), reversibly encrypted at rest. (A `RecoveryCode`, being one-way, IS scrypt-hashed like a password.)
- Do not say a correct password "logs in" a 2FA-enabled user — it issues a `TwoFactorChallenge`; only a verified `TOTP` or `RecoveryCode` mints the `UserSession`.
- Do not treat "Delete account" as a hard row-delete — self-service removal is a reversible `AccountDeactivation` (`users.disabled_at`), never `DELETE FROM users`; the hard `deleteUser` is admin-only, targets OTHER users, and refuses self-deletion. Never deactivate the last active admin.
- Do not store identity fields (`display_name`, `email`, `avatar_url`) in a `UserProfile` (`opzava_user_profile`) — those are inherited Engine-A `users` columns; the overlay holds only product-profile fields (`timezone`/`bio`/`job_title`/`notif_prefs`/`appearance`) and composes with identity at the route, never by importing `src/lib`.

## Content Quality Language

- `Source-backed`: claims trace to captured sources.
- `Fact-checked`: claims were checked by a dedicated step and review artifact.
- `Brand-reviewed`: voice, structure, and positioning passed the brand review step.
- `Human-approved`: an accountable human approved the external action.
- `AI slop`: generic, unsupported, low-information, repetitive, or formulaic generated output that should not be published or stored as final content.

## Engineering Quality Language

- `Complexity`: current difficulty of understanding, testing, or changing code.
- `Entropy`: gradual structural, semantic, or behavioral decay over time.
- `Golden principle`: mechanical rule encoded in the repo so future agent runs preserve team taste.
- `Garbage collection`: recurring cleanup process that detects drift and opens targeted refactor tasks.
- `Red-green-refactor`: write a failing test, make it pass with the smallest correct change, then simplify.
