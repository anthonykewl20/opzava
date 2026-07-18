# Ask Admin Opzava v1 — Assembled Locked Spec (WF-220 synthesis)

> **Refreshed 2026-07-18** to consume the reconciled/enriched source memos (no locked decision changed).

> **What this is.** The assembled, locked v1 spec for **Ask Admin Opzava as the ADMIN-only Lead
> Orchestrator**, synthesized from every resolved child ticket on wayfinder map
> [#210](https://github.com/anthonykewl20/opzava/issues/210). It is the deliverable for TASK
> [#220](https://github.com/anthonykewl20/opzava/issues/220) ("Assemble the locked Ask Admin v1 spec").
> It **consumes** the child decisions; it does **not** reopen them. Every load-bearing claim cites a
> memo, issue, or `file:line`. Unresolved items are listed in §4, never invented.
>
> **Status:** SPEC (not the shipped feature). Ready to enter `docs/plan/EXECUTION.md` as the slice plan
> in §2 — subject to the owner sign-off the #220 body requires ("Get explicit user sign-off — the map is
> done when this closes"). Per `CLAUDE.md`, `docs/plan/EXECUTION.md` is a **frozen** historical worklog
> that must not be rewritten; this slice plan therefore lands as a **new, dated addition** (an Ask Admin
> v1 slice section), not as an edit to the frozen Q1–Q18 record.
>
> **Authority rule (read first).** This spec inherits the source-precedence locked by wf216 §3.6:
> **#243** (placement/boundary) > **#219** (skill content) > **#232** (Ask Admin provenance/adapter) >
> **#230** (DevTicket command + claim semantics) > **PRD-005** (chat-projection contract + admin-job
> boundary) > **ADR-017** (authority split + sad paths). Where two sources touch the same field, the
> more specific authority wins (e.g. #243 over #219 on *boundary*; #219 over #243 on *content*)
> (`docs/plan/research/wf216-ask-admin-delegation-path.md` §3.6).
>
> **Scope guardrails.** Keep Ask Admin implementation slices **separate** from the future Dev Board
> ticket decomposition. Do **not** use Q17 or issues #147–#157 or the frozen Q17 memo as executable
> authority (`CLAUDE.md`; `docs/adr/ADR-017-dev-board-authority-sync-execution.md:17-27`; #220 owner
> comment 2026-07-15). The Dev Board model itself is owned by the parallel grilling session; this spec
> only **consumes** DevTicket commands, role separation, fenced Runner receipts, version-bound
> approvals, and the four-ledger model (#210 owner comment; PRD #226 / ADR #227, commit `2b80949b`).

---

## Evidence-dependency lock (what this spec consumed, and what is still open)

**Consumed (resolved → locked here):**

- Memory backend (`#211` → `wf211-ask-admin-memory-backend.md`); memory architecture (`#217`, 2 live-verify
  gates → `#220` comment 2026-07-15).
- Tool inventory + tool-policy diff (`#212` → `wf212-ask-admin-tool-inventory.md`).
- Conversation-history data model, 8 decisions + 2 net-new tools (`#213` → issue comments).
- Mockup design contract, Variant A (`#214` → issue comment; `ux-redesign/mockups/orchestrator-chat.html`).
- Sad-path product behavior, six states (`#225` → issue comment).
- Admin access & session binding (`#222` → issue comment).
- Brain model + failover chain (`#223` → `wf223-ask-admin-brain-model.md`).
- Cost & usage governance, visibility-only (`#224` → issue comment).
- Skills mechanics (`#221` → `wf221-ask-admin-v1-skills.md`); v1 skill set (`#219` →
  `wf219-ask-admin-v1-skills.md`, dual-provider-converged + enriched 2026-07-18).
- Delegation path (`#216` → `wf216-ask-admin-delegation-path.md`, prototype `prototypes/wf216-delegation/`;
  **enriched 2026-07-18** — reconciliation note + prior branch depth folded in, now carrying the
  three-path separation (§Scope) and the §3.8 closed-tool `opzava_support_delegate` alternative
  surfaced here as D-DELEG-4, plus the §3.9 retention contract and the branch sad-path table §2.4).
- Governed card authority + hard-gate confirm flow (`#218` → `wf218-governed-card-authority.md`,
  prototype `prototypes/wf218-hard-gate/`, commit `028ec317`; corrected-contract + enriched 2026-07-18).
- Principal trust brief (`#194` → `docs/adr/ADR-018-web-broker-principal-trust.md`, Proposed).
- Product contract (`docs/prd/PRD-005-assistants-chat.md`); Dev Board authority (`ADR-017`, `PRD-019`).

**Still open at assembly time (carried to §3 owner-decisions and §4 unresolved):** the readiness
review (#220 comment 2026-07-18) recorded `BLOCKED` on `#216/#218/#219` — **all three now have landed
memos**, so that structural blocker is cleared. Remaining open intersections: `#229` (Review Gate /
`AdmitDone` proof owner — owns the deferred approve-merge **and** the system-owned Done chain),
`#246` (final DevTicket graph/formats), `#251` (brain chain head unrunnable on the current stack),
`#252` (upstream-internals leakage in the error surface), and the ADR-018 owner pick. None blocks
**drafting** the spec; several gate **specific slices** (called out per-slice in §2).

---

# PART 1 — THE PRD-STYLE SPEC

## 1.1 Problem & destination

Ask Admin Opzava is the **admin-facing assistant / Lead-Orchestrator chat**: a Claude-web-parity chat UI
with multi-conversation history, WebChat-parity transport through the gateway-broker, its own
OpenClaw-native skills and memory, governed Dev Board authority, and a narrowed v1 tool policy
(#210 "Destination"). It is the **read-everything, guarded-write** orchestrator that **delegates cards to
subagents** by consuming the governed DevTicket command surface — **not** the quarantined Q17 dispatch
machinery (#210 locked decision 3; `wf216` "Scope and the premise correction"). It lives at
`apps/web` `/ask-opzava` (the `/ask-opzava` → Ask Admin rename debt is absorbed in this scope, #210
locked decision 2) over agent `ask-admin-opzava` on the per-tenant platform gateway, broker ACL only
(#210 Notes; `apps/workers/src/provisioning/ask-admin-agent.ts`).

The product contract is **PRD-005** (`docs/prd/PRD-005-assistants-chat.md`): Ask Admin Opzava is an
Opzava-owned assistant conversation surface backed by ADR-008/009/003/013, where **Opzava owns
conversation rows, admission, authorization, context scoping, approvals, activity projections, and
durable final messages**, and OpenClaw is harnessed for delegate-agent sessions, live token streams,
runtime approvals, tools, logs, and remediation operations through the broker
(`PRD-005-assistants-chat.md:24-27`).

## 1.2 Identity & scope

- **Ask Admin IS the Lead Orchestrator** — read-everything, guarded-write, delegates cards to subagents
  by consuming governed dispatch (#210 locked decision 3).
- **Admin-only.** Available only to admin/full-shell users admitted to platform-ops surfaces
  (`PRD-005-assistants-chat.md:150`); the access gate is **the same as the admin dashboard**
  (§1.12, `#222`).
- **v1 jobs** (#210 locked decision 6): platform Q&A, governed Dev Board writes (full card lifecycle
  incl. GH-action parity with the card UI), delegation, memory, web search, PM reasoning, reporting.
- **Out of scope for v1** (#210 "Out of scope"): Ask Opzava (user-facing assistant); v2+ UI tier
  (attachments, conversation search UI, Projects, Artifacts, model picker, share links,
  extended-thinking toggles); the Dev Board model design itself; Q17 dispatch machinery build
  (#147–#157); model/provider credential auth (owned by the Connections program).

## 1.3 UI — design contract (Variant A, screenshot parity)

**Design contract:** `ux-redesign/mockups/orchestrator-chat.html` (commit `463e3768`), **Variant A dual
rail** — admin nav + conversation history both visible (nav | chats | chat); the conversation rail is
contextual to Ask Admin; nav collapses to icons to reclaim chat width (#214 resolution). Implement to
**screenshot parity** against the ported central tokens/stylesheets
`ux-redesign/mockups/{tokens,app,shadcn}.css` (mockup-parity directive, #210 design directives;
`CLAUDE.md` Non-Negotiable "Mockup parity"). **No scattered ad-hoc styling** — every UI change shows a
mockup first and gets explicit user approval before implementation (mockup-revision-first, #210 design
directives).

**Build vehicle (verified against official docs + codebase):** the shadcn chat primitives **already in
the repo** — `apps/web/components/ui/{message-scroller,message,bubble,marker}.tsx` (confirmed present),
already imported by `ask-opzava-chat.tsx`. Mapping (#214 resolution; #220 comment 2026-07-15):

- **MessageScroller** → streaming, Stop, saved-thread restore, history pagination, scroll controls.
- **Message** → rows + footer actions.
- **Bubble** → collapsible tool receipts/digests.
- **Marker** → streaming/date/compaction separators + the quota-failover marker.
- The **conversation-history rail** is **app-composed** (shadcn `Button` + `DropdownMenu` kebab) —
  MessageScroller only restores a thread's messages (#214).

**Claude-web-parity features in scope** (#210 locked decision 5; #214): conversation sidebar (New chat,
grouped Today/Yesterday/Previous-7-days), auto-titles, rename/delete popover, streaming + Stop,
retry/copy/feedback, kept tool receipts + digest cards, bottom composer. Footer shows the **pinned model
+ plan quota** (#223/#224). **Not in v1:** attachments, search, Projects, Artifacts, model picker
(#210 locked decision 5).

## 1.4 Conversation-history data model

**Locked (`#213`, 8 decisions, HITL grilling).**

- **Source of truth = Postgres (Architecture B).** The durable transcript lives in Opzava Postgres
  (`assistant_conversations` / `assistant_turns` / `assistant_tool_outcomes`, already present, RLS
  tenant-isolated). The gateway session is truth **only** for live agent working context (a
  lossy/compacted RPC view), **seeded/rebuilt from PG, never the reverse**. Honors "Postgres is truth;
  projections are rebuildable caches" (`#213` decision 1).
- **Conversation ↔ session = re-bindable, not immortal.** One logical conversation ↔ one active session
  at a time. When a session is lost (compaction beyond recovery, gateway restart, anti-orphan reaper,
  remote-gateway migration) the conversation **re-binds to a fresh session re-seeded from PG history**;
  across its life it may span multiple `sessionId`s, recorded per-turn in `openclaw_session_ref`
  (`#213` decision 2).
- **Titles.** New chat = "New chat"; after the first user message, **auto-title via a cheap/fast model**
  (not the premium brain — consistent with #223/#224); user rename anytime, **manual rename always wins**
  (never auto-overwritten); stored in a **new `title` column** on `assistant_conversations` (does not
  exist yet) (`#213` decision 3).
- **Delete = soft, recoverable, then purge.** Removes from the sidebar immediately; recoverable ~30-day
  grace, then hard-purged. Deleting a transcript **never** wipes memory (delete-transcript ≠
  delete-memory, `#217`) (`#213` decision 4).
- **Assistant searches its own old chats in v1** (scope expansion): on-demand **keyword** search,
  workspace-scoped by RLS, honest provenance ("from our chat on <date>"), **relevance-triggered not
  reflexive** (`#213` decision 5; amends `#217`).
- **Retention = 90 days after last activity, built as a configurable policy** (active chats never age
  out); the old-chat search window = the retention window (`#213` decision 6).
- **Compaction/truncation is display-truthful:** full PG transcript unaffected; a subtle
  **"— earlier messages summarized —"** divider (honors #225 degrade-truthfully); PG *is* the
  truncation side-reader (`#213` decision 7).
- **One warm live session at a time** (for the current conversation); switching conversations re-seeds
  from PG (lean single-VPS ops) (`#213` decision 8).

**Canonical terms → fold into `CONTEXT.md`** at implementation (`#213`): **Conversation** = the durable
saved thread; **Session** = the ephemeral gateway runtime that processes a turn.

## 1.5 WebChat-parity transport (absorbs Control-UI port row #14 + the `/ask-opzava` rename)

**Row-#14 WebChat-parity mapping, given Architecture B (`#213` decision 8):**

- `chat.history` / `message.get` → **served from PG** for the user-facing sidebar/transcript; the
  gateway history call seeds/reconciles a live session, not the user's source of truth.
- `send` → through the broker to the gateway; the turn is persisted to PG with an **idempotency key**.
- `inject` → used to **re-seed** a fresh session from PG history on re-bind.
- **Idempotent send coalescing** → the existing `assistant_turns` unique
  `(org, conversation, idempotency_key)` index dedupes retried sends → a message never appears twice.
- The **`/ask-opzava` → Ask Admin rename** lands in this scope (#210 locked decision 2).

## 1.6 Memory architecture

**Locked (`#211` backend + `#217` architecture; `#220` comment 2026-07-15).**

- **Backend:** builtin `memory-core` (the default), no slot change; runner-up QMD only if recall quality
  over a large multi-agent corpus proves insufficient (`wf211-ask-admin-memory-backend.md` "RECOMMENDATION").
- **Scope:** v1 is **Ask Admin's OWN memory only**. Cross-agent read (the `memorySearch.extraPaths`
  asymmetric-read capability) is **parked** to the frontend/projects phase — but the layout convention
  is **locked now** (`/home/node/.openclaw/workspace/<agent-id>/{MEMORY.md,memory/}`) so turning it on is
  a config delta (`#217`; `wf211` "Concrete config shape").
- **Write/capture:** **memory-flush only** — the default pre-compaction append path
  (`appendMemoryFlushContent`, bypasses the write-denied policy). No dreaming, no scoped memory-write
  tool. Explicit "remember X" is acknowledged live and persists at the next flush (`#217`).
- **Embeddings:** **off** — `provider: "none"`, FTS5/BM25 keyword-only (`#217`; `wf211`).
- **Search scope:** memory files only (no experimental session-transcript indexing); plus the on-demand
  transcript search of `#213` decision 5 — the two **coexist and are complementary** (`#217` amendment).
- **Recall trigger:** tool-based (`memory_search`/`memory_get`) guided by an AGENTS.md memory-discipline
  rule; `active-memory` auto-recall deferred (`#217`).
- **Trust/poison:** light-touch AGENTS.md provenance discipline; the heavier cross-agent guardrail rides
  with the parked cross-agent slice (`#217`).
- **Lifecycle:** memory **decoupled from conversations** — deleting a chat removes the transcript, not
  derived memory; admin prunes `MEMORY.md` directly; no auto-expiry (`#217`).

**Two live-gateway verification gates the spec MUST carry into implementation (`#220` comment
2026-07-15; `#217` handoffs) — both are gating, not nice-to-haves:**

1. **CRITICAL** — prove memory-flush's append writes under Ask Admin's `write`/`edit`/`group:fs`-denied
   policy (`appendMemoryFlushContent`, `agent-tools.read.ts:596`). **If it does not, v1 has no working
   memory** and the write-path decision must be revisited (fallback: a narrowly-scoped memory-append
   capability).
2. Prove `memory_get`/`memory_search` reach is scoped to Ask Admin's own workspace under
   `tools.fs.workspaceOnly: true`.

## 1.7 Brain model + failover

**Locked (`#223` user-decided 2026-07-15; `#220` comment 2026-07-15).**

- **Pinned model** (strict primary unless it carries its own `fallbacks`,
  `docs/openclaw/concepts/model-failover.md:59`) on the agent's own
  `agents.list[ask-admin-opzava].model = { primary, fallbacks: [...] }`.
- **The chain:** `openai/gpt-5.6-sol` → `anthropic/claude-opus-4-8` → `zai/glm-5.2` →
  `moonshot/kimi-k2.6` (four distinct providers; Anthropic variant = **Opus 4.8, not Fable 5**)
  (`wf223-ask-admin-brain-model.md` "The chain").
- **Interim deployable primary:** **GLM-5.2** until OpenAI (Codex OAuth) and Anthropic (setup-token) auth
  are wired and the 5.6-sol ref is verified — do **not** pin an unreachable primary (`wf223`).
- **Subagent model policy (agnostic):** subagents do **not** inherit the premium primary; the subagent
  model is the **cheapest capable routable model in the tenant's connected set, resolved dynamically at
  provision time — never a hardcoded string** (honors agnostic-ports); per-role escalation allowed
  (`wf223` "Subagent model policy"; the biggest cost lever → `#224`).

**Build-blockers the slice must handle (`#220` comment 2026-07-15; `wf223` "Implementation findings"):**

1. The provisioner **cannot serialize the failover chain today**: `AskAdminAgentEntryInput.model` is
   typed `readonly model?: string` (`apps/workers/src/provisioning/ask-admin-agent.ts:289`) and the base
   fragment has no `model` field. **Widen the input type + serialization to accept `{ primary,
   fallbacks: [...] }`.**
2. Subagent-model resolution must be **dynamic + agnostic** off `agents.defaults.models`.
3. Deploy-time gates: confirm `openai/gpt-5.6-sol` in the Codex catalog (`openclaw models list
   --provider openai`); wire Anthropic setup-token + Codex OAuth; smoke-test each non-GLM tier live on
   the per-tenant Gateway (only GLM proven today).

**⚠ Live defect (`#251`, map #210 comment 2026-07-16):** the pinned head `gpt-5.6-sol` **cannot execute
on the current stack** — the gateway bundles its own Codex (`mainframe/extensions/codex/package.json` →
`@openai/codex: 0.142.4`) and the backend 400s `gpt-5.6-*` from CLI ≤0.143.0; electing it succeeds, every
turn then fails. The head is not runnable until the fork bump (`#193` → upstream `v2026.7.1`, app-server
0.144.3). **Open (§4):** whether the chain fails over for *this* failure mode (catalog-offers but
runtime-rejects — not a quota failure) is **unproven**; #225 covers quota and gateway-down, not this.

## 1.8 Cost & usage governance (visibility, not enforcement)

**Locked (`#224`).**

- **v1 cost scope = visibility, not enforcement.** Ship a **"current account limits" UI** on the
  Connections surface from OpenClaw `limits.windows` — real for **Claude + GPT** (both surface plan
  quota), graceful "not available" for **GLM + Kimi** (no quota-window surface in OpenClaw). Expose
  session token usage + quota windows in admin surfaces (`#224`; `#220` comment 2026-07-15).
- **Quota-aware failover:** plan-quota exhaustion walks the #223 chain (OpenClaw fails over on
  rate-limit/quota errors) — no hard-stop (`#224`).
- **No budget-enforcement machinery in v1** — no spend/token budgets, no subagent fan-out caps (single
  trusted operator; the #223 agnostic-cheapest-subagent default already bounds the biggest driver)
  (`#224`).
- **Locked principle (pipeline deferred):** pay-per-token pricing must read from a **refreshable source,
  never a hardcoded constant**. OpenClaw's cost estimate uses locally-configured static pricing; when a
  pay-per-token provider is first connected, a scheduled refresh job (writing `models.providers.*`
  pricing from a maintained feed) is the fast-follow (`#224`; `#220` comment 2026-07-15).

## 1.9 The three skills (+ AGENTS.md governance placement)

**Locked (`#219` content; `#221` mechanics; `#243` placement).**

- **Three proprietary, repo-versioned `SKILL.md` skills — deeper not wider; delegation folds into
  `opzava-pm`:** `opzava-card-authoring`, `opzava-pm`, `opzava-reporting`. No ClawHub/community skill
  (`#219` §0, R1).
- **A skill is prose and can NEVER grant/unlock a tool** (`allowed-tools` frontmatter is inert in the
  fork). Everything enforceable lives in **AGENTS.md + tool policy + server-side validation, never skill
  prose** (`#219` R2, R14; `#221` §A2; ADR-005 "SOUL can lie; tool policy cannot").
- **Discipline that applies every turn is NOT a skill — it goes in AGENTS.md:** platform-state answering
  conventions + memory discipline are every-turn (`#219` R3; `#221` §B1/§B3).
- **Per-skill content target** (`#219` §4.1):
  - `opzava-card-authoring` — near-verbatim port of `.claude/skills/opzava-task-authoring/SKILL.md`,
    tool refs rewritten to `opzava_tasks_*`, **Card/DevTicket/Proposal** terms (R11).
  - `opzava-pm` — sprint-progress math from board truth, "should X be a Sprint?" rubric, prioritization,
    decide-vs-escalate lines, and the delegate-a-Card playbook.
  - `opzava-reporting` — report taxonomy + per-type data-gathering checklist + `templates/` + honesty
    rules (every number traces to a tool result).
- **Skills are inert today and stay inert until** the #212 tool allow-list + the `minimal→coding` profile
  switch land (`#219` §0; `#221` §B6). The card/platform-read tools the skills assume **mostly do not
  exist on the agent surface** and **must be ported** (#212 §D; §1.13).
- **Standing prompt cost:** ~275 tokens/turn for the three-skill index; bodies cost tokens only on the
  turn that `read`s them (`#221` §A1; `#219` §4.1).
- **Delivery channel (default):** shared-volume reconciler write for v1 (parity with today's artifact
  reconciler; live-refresh via watcher); migrate to `skills.upload.*`+`skills.install` when Gateways go
  remote (`#221` §A5; `#219` O4).

## 1.10 Governed card authority + hard-gate confirm flow

**Locked (`#218`, corrected contract; closes bug `#253`). The gate is server-side, argument- and
principal-aware, below the tool-policy layer, and its job on a terminal status is to REJECT + REDIRECT —
not gate-and-allow.**

- **The governed authority already exists on paper; enforcement did not exist in code.** Bug `#253`:
  tool policy is per-tool not per-argument, so `opzava_tasks_update` *and* `opzava_tasks_create` both
  accept `status:"done"` with no guard (`wf218-governed-card-authority.md` "Primary evidence"; #212 §F).
- **Decision 1 — gate locus.** A single status-aware guard (working name
  `assertTerminalTransitionAuthorized`) in `packages/project-management`, invoked by **both** `moveTask`
  (`tasks.ts:1745`) and `createTask` (`tasks.ts:1386`), **after** `authorizeTask` succeeds and **before**
  the `withTenant` mutation/insert. No caller — agent, direct web, MCP task-tool — reaches a terminal
  transition by passing only the role check (`wf218` Decision 1; §2).
- **Decision 2 — create-with-terminal rejected outright.** No "born Done" card
  (`hardReason=create-with-terminal-status`, DBF-030) (`wf218` Decision 2).
- **Decision 3 — `Done` is SYSTEM-OWNED via `AdmitDone`; the tool path can NEVER write Done.**
  `moveTask(done)` / `createTask(done)` **always reject + redirect** to governed `AdmitDone`
  (`hardReason=done-is-system-owned` / `terminal-transition-requires-admit-done`). `AdmitDone` is a
  system-owned command **disabled until #229's contract is implemented**; it must consume the #229
  Review Exit Containment Proof + governed merge authorization + verified GitHub merge into
  `development` (wf230:1525-1547; DBF-028/030/031; PRD-019:27-28). **A human confirm token is
  necessary-but-never-sufficient for Done** (`wf218` Decision 3; §3).
- **Decision 4 — `approve-merge` OUT OF SCOPE for v1.** No merge tool ships; the #229 binding lands with
  #229 (`wf218` Decision 4; ADR-017:331-332). The #218 frame's "two hard gates (Done / approve-merge)"
  **collapse to one (Done) for v1, and that one is system-owned and unreachable from the tool path**
  until #229 ships `AdmitDone` (`wf218` §8B).
- **Decision 5 — no step-up for v1**; password/TOTP/passkey step-up stays reserved for
  credential/blast-radius actions routed to the Secure Admin UI (DBF-118; `#222`).
- **Audit = TWO sinks (corrected):** (4A) Dev Board activity/history ledger records **accepted** commands
  only (DBF-174); (4B) rejected/bypass attempts go to a **separate security/telemetry sink**, never the
  activity ledger (`wf218` §4). Every gate attempt produces **exactly one record in the correct sink**.
- **Sad-path vocabulary:** S1–S12 (autonomous Done, tool-path Done always-rejects, principal mismatch,
  create-with-terminal, expired/replayed token, forged source, principal-binding-absent, malformed
  expiry, valid-token+invalid-state, state-change-after-confirm invalidation, commit-failure rollback,
  confused confirmation) — each rejects server-side with **no state mutation and no token consumption**
  (`wf218` §5).
- **Atomicity:** token consume + mutation + accepted-ledger write commit as **ONE transaction**
  (wf230:299-301); a rejected attempt is terminal for its key — an intentional retry must use a NEW
  key/nonce (wf230:410-411) (`wf218` §3C, §5 S5b/S11).
- **Throwaway proof:** `prototypes/wf218-hard-gate/` (S1–S7 PASS, exit 0, corrected model committed
  `028ec317`) (`wf218` §6).

## 1.11 Delegation path (consume governed dispatch, not Q17)

**Locked (`#216`, dual-provider converged; prototype `prototypes/wf216-delegation/` S1–S11 PASS).**

- **The decisive inversion:** Ask Admin is a **command-request origin, not a dispatcher** — it never
  holds execution authority. Dispatch (claim, lease, fence, worktree, process, receipt) is owned by the
  Runner protocol (#232) and Execution Admission (#230). Ask Admin hands an intent to the governed
  command seam and watches receipts come back (`wf216` §1, §2.1).
- **The named deep module:** the **Ask Admin command Adapter** with interface
  `requestCommand(turnContext, intent)`, owning current web-session/on-behalf-of provenance,
  turn/tool-call idempotency, safe summaries — and **must never own** `operator.admin`, Human approval
  inference, or an Execution Lease (wf232:235; `wf216` §2.1).
- **Provenance chain is fixed:** `authenticated human → Ask Admin turn → tool-call ID → Dev Board command
  request` (wf232:2861-2865); turn + tool-call idempotency prevent duplicate requests (`wf216` §2.1).
- **Authority split (`#230` Lead Orchestrator row):** Ask Admin may **draft Proposals, request
  `CreateBacklogDevTicket` only from explicit human shaping, request assignment/claim, pause/escalate,
  notify, narrate progress**; it may **never** self-grant Human Owner / Execution Assignee / Reviewer /
  unrestricted Admin authority (wf230:257; `wf216` §2.2).
- **Hard-gate boundary (server-side):** Ask Admin may draft/recommend/request/notify — including drafting
  a Review submission or merge *request* — but may **not** emit the Review verdict, `AdmitDone`, or the
  governed merge authorization (consumed only from #229 proof + verified merge) (`wf216` §2.5).
- **Failure/disconnect: NO automatic failover.** A local lease cannot migrate to cloud mid-flight; a
  disconnected local machine must **pause** rather than auto-fail-over (ADR-017:67-70;
  wf232:2925-2928, :3000) (`wf216` §2.4).
- **Progress surfacing:** delegated-work progress is a **projection** of authoritative Dev Board activity
  events + the managed-harness worklog stream into the existing PRD-005 streaming states — Ask Admin
  reads the same read models as the Dev Board UI; **no private progress channel** (`wf216` §2.3; §3.3).
- **v1 sequencing (`#216` §3.4):** the Runner protocol (#232) and Execution Admission are unimplemented
  target architecture (ADR-017:14-15). At v1 Ask Admin delegates only the **non-execution subset** of the
  Lead Orchestrator's verbs; it **may not request `ClaimAndStart`** until #232 + #230 land. When a
  governed start-capability is unavailable, the Adapter **fails fast** with a typed
  `governed_dispatch_unavailable` outcome (consistent with #225 degrade-truthfully + #243 fail-closed)
  rather than faking execution (`wf216` §3.4).
- **Throwaway proof:** `prototypes/wf216-delegation/` (S1–S11 PASS, exit 0; `wf216` §4).

## 1.12 Admin access & session binding

**Locked (`#222`; reconciled with `#194`/ADR-018 by `#218` §3E).**

- **Access gate = same as the admin dashboard.** Any member holding the admin/owner-tier role reaches
  Ask Admin; no dedicated "can-use-Ask-Admin" capability in v1. Entry is governed by the authenticated
  app session (→ `/login` if none) + the broker's `runtimeControl.forbidden` 403 role gate
  (`apps/web/app/(app)/ask-opzava/page.tsx`) (`#222`).
- **Session binding + audit attribution.** The chat binds to the admin's Better Auth app session
  (BFF-verified). Human-commanded actions carry the **acting admin's verified principal** → audit ledger
  records **"admin X via Ask Admin"** (PRD-013 pattern); **autonomous** actions attribute to the **agent
  identity** ("Ask Admin Opzava") — keeping the #218 human-vs-autonomous split visible (`#222`).
- **`#194` reconciliation (load-bearing).** `#218` §3E establishes that **#194 does NOT gate the hard
  gate for v1**: the gate runs in the **web BFF** under a **verified Better Auth session**
  (`route.ts:619`, `:265-273`; `:388`), where the broker is only stream transport — it never trusts a
  broker-asserted principal. `#194` is a **latent** trap (single-broker topology; only `tenantId` is
  read), and it gates **broker-crossing** authority, not BFF-local tool execution (`wf218` §3E;
  ADR-018:7,39,107-108). **Therefore: build the gate BFF-side now; do not block on #194.**

## 1.13 v1 tool policy (the exact recipe)

**Locked (`#212` consensus-corrected; `#219` R5–R7; `#243`). The current `minimal`+`allow:[opzava_tasks_*]`
block is already an empty intersection and MUST be replaced wholesale, together with projecting the
tools.**

- **Profile:** `minimal → coding` — the **only** profile carrying `read`/`memory_*`/`web_*`
  (`#212` §E3; `tool-catalog.ts:364-376`).
- **Additive key:** `alsoAllow` (merged at the profile stage *before* filtering), **not** `allow`
  (keep-only, cannot re-admit a profile-filtered tool); plugin/MCP tools are **not** profile-exempt
  (`#212` §A2–A3, the dual-model correction).
- **Control:** `coding` admits **`bundle-mcp`** (every configured MCP-server tool), so a deny-only shape
  **leaks**; the surface **must** be pinned by an **exact narrowing `allow`** of every model-facing name
  (`#212` §E2; `#219` R7; `#243`).
- **Exact v1 surface (25 names):** core 12 (`read`, `web_search`, `web_fetch`, `memory_search`,
  `memory_get`, `session_status`, `sessions_list`, `sessions_history`, `sessions_send`,
  `sessions_spawn`, `sessions_yield`, `subagents`) + ported card tools (`opzava_tasks_get`,
  `opzava_tasks_comments_add`, `opzava_tasks_steps_create`/`_toggle`/`_reorder`,
  `opzava_tasks_quality_checks_add`, `opzava_tasks_due_set`, `opzava_tasks_watchers_set`) + net-new
  platform reads (`opzava_github_state_read`, `opzava_connections_health_read`) + the 2 net-new
  conversation-search tools (`opzava_conversations_search`, `opzava_conversations_get`) (`#212` §C/§D;
  `#213` amendments; `#219` §6.1 S1).
- **Delegation subtree = the v1-locked §3.1 surface** (`sessions_spawn`/`sessions_yield`/`subagents`,
  resolved from `group:sessions` via `alsoAllow` in Slice A12). The enriched `wf216` §3.8 carries a
  stricter alternative — a single closed `opzava_support_delegate` tool that removes raw
  `sessions_*/subagents` exposure from the model. That alternative is **not** swapped in here; it is
  surfaced as an open owner decision (D-DELEG-4 — no raw exposure vs richer control). The 25-name set
  above is unchanged.
- **Defense-in-depth deny:** list mutations individually (`write`/`edit`/`apply_patch`, never
  `group:fs`), `group:runtime`, and `group:agents` members individually (never `group:agents`, which
  would also kill the `update_plan` opt-in) (`#212` §E3; `#219` §5).
- **`fs.workspaceOnly: true`** (confine read to `ASK_ADMIN_AGENT_WORKSPACE`) + top-level
  `tools.sessions.visibility: "tree"` (`#212` §E3; `#217` gate 2).
- **Fail-closed:** `agents.defaults.skills: []` (subagents fail closed, not "unrestricted")
  (`#219` R10; `#221` §A5).
- **Rework (`#212` §E4):** `buildAskAdminAgentEntry` must **construct the complete intended `allow`**
  (which already includes the delegation subtree), **not append** `ASK_ADMIN_DELEGATION_TOOL_ALLOW` to a
  keep-only `allow` (which collapses the surface under `coding`).
- **Release ordering (`#212` §G):** the broker performs an exact effective-inventory check
  (`operator-client.ts:449-489`); unknown allow entries warn and unavailable tools fail the check — so
  **build/project the tools first, then install the policy + update the broker's expected inventory
  atomically**, gated on a live `tools.effective` equality proof.
- **Quality-check provenance gate (distinct from the Done gate):** a quality-check `pass` is **not**
  approval — the `opzava_tasks_quality_checks_add` tool must label agent checks **AI (`ai_precheck`)** and
  must not forge `kind:"human"` (`#212` §D/§F; `tasks.ts:2958-2974`).

## 1.14 Sad-path inventory (first-class)

**Locked (`#225`, designed with `#214`; `#252` presentation half). Overriding principle: degrade
truthfully — no fake-green, no hard crash, never lose the user's input.**

| State | Behavior (`#225`) |
|---|---|
| **Cold-start (new chat)** | Centered greeting + **task-focused** prompt chips; title strip hidden until first message auto-titles. |
| **Loading** | **Shimmer skeleton** shaped like the reply + honest "what it's doing" status ("Reading the Dev Board…"). Not a blank spinner. |
| **Send failed (offline)** | **Draft preserved**, "Not sent — you're offline," **auto-retry** on reconnect + manual Retry. Plain language. |
| **Tool failed** | **Honest** red receipt + assistant states "nothing was changed" + Retry / manual path. Never a silent retry. |
| **Quota / rate-limit** | **Graceful failover** to the next chain tier (GPT-5.6-sol → Opus 4.8) with an honest inline marker; replies continue (visualizes #223/#224). |
| **Gateway down** | **Read-only degrade** — browse past chats, replies paused, honest banner, "last synced" pill, composer locked (draft kept), auto-reconnect. Not a hard-fail, not fake-healthy. |
| **Memory unavailable** | Proceed and say so ("I couldn't reach memory, answering from this conversation only"), never block (`#217`; `#225`). |
| **Deferred** | Long-running-delegation progress in chat → `#216` (now resolved; the delegation card, §1.11). |

**⚠ Live defect (`#252`, map #210 comment 2026-07-16):** Ask Admin forwards **raw upstream failure text**
to the browser (raw OpenAI JSON blob, broker-internal message, `cf-ray`/`request id`). This collides with
#225's "degrade truthfully." The rule that survived review: **semantic messages pass through,
infrastructure detail never does.** On an *admin* surface, `"The 'gpt-5.6-sol' model requires a newer
version of Codex"` is the most actionable line — a closed vocabulary of Opzava-owned strings would be
hostile. **Two halves:** (a) the **sanitization half** (broker strips infrastructure detail) is
independent and can land alone; (b) the **presentation half** is Ask Admin's and is realized with the
shadcn `Marker` + semantic colors (#225 handoff; #220 comment 2026-07-15).

## 1.15 Behavioral contracts (the invariants every slice preserves)

1. **Postgres is product truth; gateway sessions are ephemeral live context, seeded from PG, never the
   reverse.** Projections/receipts are rebuildable caches; WS events are hints (`#213`; `CLAUDE.md`).
2. **Tool policy beats SOUL claims; RLS denial is a hard 403, never an empty result** (`CLAUDE.md`;
   ADR-005; `#219` R14).
3. **The hard gate is server-side, argument- and principal-aware, below tool policy; terminal status
   rejects + redirects — never gate-and-allows.** Two audit sinks; accepted-only in the activity ledger
   (`#218`).
4. **Ask Admin is a command-request origin, never a dispatcher; it never holds execution authority and
   never auto-fails-over** (`#216`).
5. **Browser code never calls OpenClaw and never sees Gateway DTOs/secrets; one broker ACL on the hot
   path** (`CLAUDE.md`; PRD-005).
6. **Degrade truthfully:** no fake-green, no silent retry, draft-preserving, read-only-not-crash
   (`#225`).
7. **Local docker-compose stays in parity with live Dokploy; no routable orphan Gateway**
   (`CLAUDE.md` Ops).

---

# PART 2 — IMPLEMENTATION SLICE GRAPH

**Tracer-bullet design.** Each slice is an independently-grabbable, end-to-end-visible bullet (not a
horizontal layer). The graph is a DAG with explicit blocking edges. Every slice card below bakes in the
**five-point slice quality bar** (#220 body; #210 implementation quality bar):

1. **Architecture alignment** — names the module that deepens + where the seam sits
   (`improve-codebase-architecture`, `codebase-design`).
2. **All angles covered** — explicit sad-path / edge-case inventory.
3. **CLEAR WORKING state** — the observable behavior that counts as working.
4. **Behavioral user-level e2e tests** — a real drive in `tests/e2e/drives/`.
5. **Passing gate** — `node tests/e2e/gate/real-world-validate.mjs`, 2 consecutive clean runs, exit 0.

> **Architecture-test + e2e-hardening checklist (baked into every card, per the #220 readiness
> review):** each slice carries (a) an architecture-alignment note, (b) an architecture test where the
> seam admits one, and (c) a `tests/e2e/drives/` extension exercising its own flows.

## Slice graph (edges)

```text
                       ┌──────────────────────────────────────────────────────┐
                       │ A0  De-risk spike: live tool-policy + memory proof     │  (throwaway, GATE)
                       └──────────────┬───────────────────────────────────────┘
                                      │ proves the recipe + the 2 memory gates
          ┌───────────────────────────┼──────────────────────────────┐
          ▼                           ▼                              ▼
 ┌─────────────────┐        ┌────────────────────┐          ┌──────────────────┐
 │ A1  Agent tool  │        │ A6  Memory arch     │          │ (gates feed A2,  │
 │  surface: port +│        │  (allowlist+AGENTS) │          │  A11 skills)     │
 │  net-new reads  │        └─────────┬──────────┘          └──────────────────┘
 └────────┬────────┘                  │ (allowlist is A2)
          ▼                           │
 ┌─────────────────┐ ◄─────────────────┘
 │ A2  Tool policy │ ◄── A0 (live proof), A1 (tools projected)
 │  coding+exact   │
 └────────┬────────┘
          │ (read/memory/delegation available; skills no longer inert)
          ├──────────────► A7  Server-side hard gate (independent; BFF-side, no #194 dep)
          ├──────────────► A11 Skills (3 SKILL.md + AGENTS.md) ◄── A1 (card/platform tools)
          └──────────────► A12 Delegation path (Adapter + verbs + card) ◄── A5 transport, A9 UI

 Parallel data/UI/transport spine (own edges):
   A3  Brain model provisioner+auth   ──► (#251 fork bump for real head; ships GLM interim now)
   A4  Conversation-history model     ──► (data layer; independent)
   A5  WebChat-parity transport ◄── A4 ──► A9, A12
   A8  Admin access+audit attribution ◄── (ADR-018 owner pick; BFF-side now)
   A9  UI Variant A dual rail ◄── A4, A5, A3
   A10 UI six sad-path states + #252 sanitization ◄── A9, A3
   A13 Cost governance: account-limits UI ◄── A3, A10
```

**Critical path:** A0 → A1 → A2 unlocks A6/A7/A11/A12. A3 (brain) ships on GLM-interim immediately and
blocks only its own real-head verification on #251. A9 (UI) is gated by A4+A5+A3.

---

### Slice A0 — De-risk spike: live tool-policy + memory proof (throwaway, GATE)

**Status:** not-started · **Type:** throwaway de-risk · **Blocks:** A1, A2, A6, A11

**Goal:** Prove the riskiest unverified paths on a **real** per-tenant Gateway before any tool/skill/
memory slice ships — the two `#217` memory gates (one CRITICAL) + the `#219` O3 live proof + the
`#212` exact-allow effective-set proof.

**Deliverables:**
- [ ] Probe (a): with `profile:coding` + exact `allow` + surgical `deny` + `fs.workspaceOnly:true`, the
  broker's `getEffectiveTools` (`operator-client.ts:460-501`) returns **exactly** the 25-name v1 surface
  — nothing denied leaks in, nothing intended is missing (`#219` §6.1 S1; `#212` §G).
- [ ] Probe (b): the `workspaceOnly` read root is the **per-agent** workspace
  (`/home/node/.openclaw/workspace/ask-admin-opzava`), not the shared mount; per-skill `additionalRoots`
  add only skill dirs — raw `read` cannot reach sibling agents' memory (`#221` §A5; `#219` O3).
- [ ] Probe (c) **CRITICAL (`#217` gate 1):** `appendMemoryFlushContent` (`agent-tools.read.ts:596`)
  actually writes under the `write`/`edit`/`group:fs`-denied policy. **If it does not, v1 has no working
  memory** — record and escalate (fallback: a narrowly-scoped memory-append capability).
- [ ] Probe (d) (`#217` gate 2): `memory_get`/`memory_search` reach is scoped to Ask Admin's own
  workspace under `workspaceOnly:true`.

**Architecture alignment:** Validates the **tool-policy pipeline seam** (`profile → allow/alsoAllow →
group → sender`, profile-first keep-only) as the single enforcement spine; deepens confidence in the
`coding`+exact-allow contract before product code depends on it (`#212` Part A; `#219` §5).

**Sad paths / edges:** the recipe yields an **empty** or **leaking** effective set; memory-flush silently
no-ops under deny; `memory_get` reaches outside workspace. Each must be observed and recorded, not
assumed.

**CLEAR WORKING state:** A real `tools.effective` round-trip prints the exact 25-name set; a memory-flush
write is observable on disk under the denied policy; a workspace-escape `read` is rejected.

**E2E drive:** `tests/e2e/drives/ask-admin-a0-toolproof.mjs` — drives a real gateway turn under the
candidate policy, dumps `tools.effective`, attempts a memory flush + an escape `read`, asserts the four
probes.

**Gate:** `node tests/e2e/gate/real-world-validate.mjs`, 2× clean, exit 0.

---

### Slice A1 — Agent tool surface: port card tools + net-new platform/conversation reads

**Status:** not-started · **Blocked by:** A0 · **Blocks:** A2, A11, A12

**Goal:** Give the skills and PM/reporting jobs the tools they assume, on the **session-principal
runtime-control registry** — consolidated, not duplicated across two auth principals.

**Deliverables:**
- [ ] **Port** the richer card tools from the standalone `apps/mcp-server` onto the runtime-control agent
  surface: `opzava_tasks_get`, `opzava_tasks_comments_add` (harden attribution — agent comments must not
  masquerade as human), `opzava_tasks_steps_{create,toggle,reorder}`, `opzava_tasks_quality_checks_add`
  (provenance gate: AI `ai_precheck`, never `kind:"human"`), `opzava_tasks_due_set`,
  `opzava_tasks_watchers_set` (`#212` §D; `apps/mcp-server/src/tools.ts:27-39`).
- [ ] **Build net-new reads:** `opzava_github_state_read` (issue **and** PR state — the current adapter
  skips PRs, `packages/adapters/src/github/issues.ts:104-107`), `opzava_connections_health_read` (`#212`
  §D).
- [ ] **Build net-new conversation-search tools:** `opzava_conversations_search` /
  `opzava_conversations_get` — read-only, **RLS-scoped**, honest-provenance, on runtime-control (`#213`
  amendments).
- [ ] **Pin the projection mechanism** (bare names vs `<server>__opzava_tasks_*` bundle-MCP names) —
  CRITICAL, decides the exact `allow` names (`#212` §E2, §H Q2; `#219` R7).

**Architecture alignment:** Consolidates **two divergent task-tool surfaces** (runtime-control
session-principal vs mcp-server `LinkTokenPrincipal`) into **one agent-facing registry** — the
deep-module is the runtime-control task-tool registry; the seam is the `ToolExecutionContext` principal
(`#212` §B; `assistant-conversation-lifecycle.ts:49-62`).

**Sad paths / edges:** card-not-found (RLS-visible-but-empty vs hard-403 distinction); agent comment
attribution forgery; quality-check `kind` forgery; GitHub PR-state adapter gap; RLS cross-workspace leak
in conversation search.

**CLEAR WORKING state:** an Ask Admin turn calls `opzava_tasks_get` and `opzava_conversations_search`
through the broker and receives RLS-scoped results; an agent comment is labeled AI.

**E2E drive:** `tests/e2e/drives/ask-admin-a1-tools.mjs`.

**Gate:** real-world-validate 2× clean, exit 0.

---

### Slice A2 — Ask Admin tool policy: `coding` + exact-allow + broker inventory (atomic)

**Status:** not-started · **Blocked by:** A0 (live proof), A1 (tools projected) · **Blocks:** A6, A11, A12

**Goal:** Land the §1.13 recipe atomically — the control that makes the widened profile safe and
unblocks skills/memory/delegation.

**Deliverables:**
- [ ] Switch `profile: minimal → coding`; install the **exact keep-only `allow`** of the full 25-name
  surface; surgical `deny` (mutations + `group:runtime` + `group:agents` members individually, never
  `group:fs`/`group:agents` wholesale); `fs.workspaceOnly:true`; top-level `sessions.visibility:"tree"`
  (`#212` §E3; `#219` §5).
- [ ] **Rework `buildAskAdminAgentEntry`** to construct the complete intended `allow` (already including
  the delegation subtree), **not append** `ASK_ADMIN_DELEGATION_TOOL_ALLOW` to a keep-only allow (`#212`
  §E4; `ask-admin-agent.ts:302-326`).
- [ ] `agents.defaults.skills: []` (subagent fail-closed) (`#219` R10).
- [ ] **Atomic release:** project the tools (A1) → install the policy → update the broker's expected
  inventory together; the broker's `getEffectiveTools` mismatch check is the verifier (`#212` §G;
  `operator-client.ts:449-489`).

**Architecture alignment:** The seam is the tool-policy **pipeline** as the single enforcement spine
(profile-first AND-filter, keep-only matcher, `alsoAllow` profile-stage merge); deepens the
policy-as-control (not probe-only) invariant (`#212` Part A; `#219` §5).

**Sad paths / edges:** a forgotten core name silently drops from `effective`; a typo'd product name
warns-then-fails the inventory check; delegation-append collapse; `bundle-mcp` leak under deny-only.

**CLEAR WORKING state:** `tools.effective` on the live gateway equals exactly the 25-name set; the
broker session is **admitted** (no `toolInventoryMismatch`); skills/memory/delegation tools are now
model-visible.

**E2E drive:** `tests/e2e/drives/ask-admin-a2-policy.mjs`.

**Gate:** real-world-validate 2× clean, exit 0.

---

### Slice A3 — Brain model: provisioner serialization + auth + interim primary

**Status:** not-started · **Blocked by:** #251 (fork bump) for the real `gpt-5.6-sol` head; ships
**GLM-5.2 interim primary now** · **Blocks:** A9 (footer model), A10 (quota marker), A13

**Goal:** Make the pinned failover chain provisionable and at least one full tier operational.

**Deliverables:**
- [ ] **Widen `AskAdminAgentEntryInput.model`** from `readonly model?: string`
  (`ask-admin-agent.ts:289`) to accept `{ primary, fallbacks: [...] }`; update serialization (`wf223`
  Implementation finding 1; `#220` comment 2026-07-15).
- [ ] Wire **OpenAI Codex OAuth** + **Anthropic setup-token** auth paths on the per-tenant Gateway
  (`wf223` OQ2; `mainframe/PATCHES.md` rung 3).
- [ ] **Stage GLM-5.2 as interim primary** (the only authenticated multi-model provider today) with Kimi
  K2.6 fallback; do not pin an unreachable primary (`wf223`).
- [ ] **Dynamic/agnostic subagent-model resolution** off `agents.defaults.models` — never a hardcoded
  string; per-role escalation allowed (`wf223` "Subagent model policy"; `#220` comment 2026-07-15).
- [ ] Deploy-time gates: verify `gpt-5.6-sol` in the Codex catalog (`openclaw models list --provider
  openai`; `gpt-5.5` is the repo-proven interim if absent); smoke-test each non-GLM tier live (`wf223`
  OQ1/OQ3).
- [ ] **Resolve #251:** after the fork bump (`#193` → `v2026.7.1`, app-server 0.144.3), pin
  `gpt-5.6-sol` as primary; **and** verify whether the chain fails over on the
  catalog-offers-but-runtime-rejects failure mode (§4 open).

**Architecture alignment:** The seam is the **provisioning fragment** (`ASK_ADMIN_AGENT_CONFIG_FRAGMENT`
→ `buildAskAdminAgentEntry`) owning the agent's pinned model object; deepens the agnostic-ports
invariant by resolving subagent models dynamically off the connected set (`wf223`; `#223`).

**Sad paths / edges:** unreachable primary (do not pin); auth not yet wired (interim GLM); chain does
not fail over on runtime-reject (`#251` open); subagent inherits premium by default (must not).

**CLEAR WORKING state:** a streamed Ask Admin turn runs on the interim primary (GLM-5.2); the
provisioned config carries `{primary, fallbacks}`; a subagent resolves to a cheaper routable model.

**E2E drive:** `tests/e2e/drives/ask-admin-a3-brain.mjs` (interim primary turn + provisioned-config
assertion).

**Gate:** real-world-validate 2× clean, exit 0.

---

### Slice A4 — Conversation-history data model + lifecycle

**Status:** not-started · **Blocked by:** none (data layer) · **Blocks:** A5, A9

**Goal:** Make Postgres the durable conversation truth with titles, retention, soft-delete, and re-bind.

**Deliverables:**
- [ ] New **`title` column** on `assistant_conversations` (#213 decision 3).
- [ ] **Auto-title** via a cheap/fast model after the first user message; **manual rename always wins**
  (#213 decision 3).
- [ ] **Retention policy setting** (v1 default 90d after last activity; active chats never age out),
  built as a configurable setting (#213 decision 6).
- [ ] **Soft-delete + ~30-day grace + hard-purge job**; deleting a transcript never wipes memory (#213
  decision 4; `#217`).
- [ ] **Re-bind + re-seed-from-PG session lifecycle** (`inject` on re-bind); per-turn
  `openclaw_session_ref`; one warm session; switch re-seeds (#213 decisions 2, 8).
- [ ] **Compaction divider** data ("— earlier messages summarized —"); PG is the truncation side-reader
  (#213 decision 7).
- [ ] **Idempotent send coalescing** via the existing `assistant_turns` unique
  `(org, conversation, idempotency_key)` index (#213 decision 8).
- [ ] **Fold Conversation/Session terms into `CONTEXT.md`** (#213).

**Architecture alignment:** Deepens the **assistant-conversation aggregate** (Opzava-owned product state)
vs the ephemeral gateway session; the seam is the re-bind/re-seed lifecycle honoring "Postgres is truth;
projections are rebuildable caches" (#213; PRD-005 Implementation decisions).

**Sad paths / edges:** session lost mid-conversation (re-bind + re-seed); compaction beyond recovery;
purge-after-grace; retention-expiry of an active chat (must not); duplicate send (dedupe).

**CLEAR WORKING state:** an admin sends a turn, reloads after a simulated session loss, and sees the
full transcript restored from PG; rename persists; a deleted chat disappears then purges after grace.

**E2E drive:** `tests/e2e/drives/ask-admin-a4-conversations.mjs`.

**Gate:** real-world-validate 2× clean, exit 0.

---

### Slice A5 — WebChat-parity transport (`chat.*` RPCs through the broker)

**Status:** not-started · **Blocked by:** A4 · **Blocks:** A9, A12

**Goal:** Absorb Control-UI port row #14 + the `/ask-opzava` rename into the broker chat path.

**Deliverables:**
- [ ] `chat.history` / `message.get` served from PG for the sidebar/transcript; gateway history used only
  to seed/reconcile a live session (#213 decision 8).
- [ ] `send` through the broker to the gateway; turn persisted to PG with an idempotency key (#213).
- [ ] `inject` to re-seed a fresh session from PG history on re-bind (#213).
- [ ] **`/ask-opzava` → Ask Admin rename** in the route/nav (#210 locked decision 2).

**Architecture alignment:** The seam is the broker **`chat.*` RPC surface** as the single anti-corruption
layer to OpenClaw (per the `openclaw-broker` skill); deepens the "browser never calls OpenClaw"
invariant (#213 decision 8; `CLAUDE.md` ACL).

**Sad paths / edges:** duplicate stream frames / reconnect replay / webhook completion race (must not
duplicate messages — PRD-005:173); send while a turn is in flight; broker offline mid-send.

**CLEAR WORKING state:** the sidebar lists past chats from PG; sending produces exactly one durable
turn across retries/reconnect; re-opening a chat re-seeds a live session.

**E2E drive:** `tests/e2e/drives/ask-admin-a5-transport.mjs` (incl. reconnect-replay dedupe).

**Gate:** real-world-validate 2× clean, exit 0.

---

### Slice A6 — Memory architecture: allowlist + AGENTS.md discipline + cross-agent layout

**Status:** not-started · **Blocked by:** A0 (2 gates), A2 (allowlist) · **Blocks:** —

**Goal:** Give Ask Admin working own-memory with honest provenance, keyword-only, decoupled from
conversations.

**Deliverables:**
- [ ] `memory_search` + `memory_get` in the allowlist (via A2) + `read` enabled (#217 handoffs; `#221`
  §A5).
- [ ] **Memory-flush capture** (default pre-compaction append; proven in A0 gate 1); `provider:"none"`
  keyword-only (#217).
- [ ] **AGENTS.md memory-discipline + provenance section** (durable platform facts vs untrusted
  evidence; never promote web/unverified content as fact) (#217 trust/poison; `#219` §4.3).
- [ ] **Lock the cross-agent layout convention** now (`/home/node/.openclaw/workspace/<agent-id>/{MEMORY.md,
  memory/}`) so enabling it later is a config delta — but do **not** wire `extraPaths` in v1 (#217;
  `wf211`).

**Architecture alignment:** Deepens the **memory as human-readable Markdown + rebuildable SQLite cache**
model (matches "projections are rebuildable caches"); the seam is the `memory-core` backend +
memory-flush write path under write-denied policy (`wf211`; `#217`).

**Sad paths / edges:** memory-flush no-ops under deny (A0 gate 1 — CRITICAL); memory-unavailable
(proceed and say so, #225); delete-transcript accidentally wiping memory (must not).

**CLEAR WORKING state:** the admin says "remember X"; X persists at the next flush; a later
`memory_search` recalls it from MEMORY.md; deleting the chat leaves memory intact.

**E2E drive:** `tests/e2e/drives/ask-admin-a6-memory.mjs`.

**Gate:** real-world-validate 2× clean, exit 0.

---

### Slice A7 — Server-side hard gate (terminal transition + two-sink audit)

**Status:** not-started · **Blocked by:** none (server-side; does **not** depend on #194 per `#218` §3E)
· **Blocks:** A12 (terminal safety for delegation)

**Goal:** Close bug #253 — no caller reaches a terminal transition by passing only the role check.

**Deliverables:**
- [ ] `assertTerminalTransitionAuthorized` in `packages/project-management`, invoked by **both**
  `moveTask` (`tasks.ts:1745`) and `createTask` (`tasks.ts:1386`), after `authorizeTask`, before
  mutation/insert (`#218` §2A).
- [ ] **Reject + redirect** every tool-path `done` (`done-is-system-owned` /
  `terminal-transition-requires-admit-done`); **reject** create-with-terminal
  (`create-with-terminal-status`) (`#218` Decisions 2, 3).
- [ ] **Two-sink audit:** accepted → Dev Board activity/history ledger (DBF-174); rejected/bypass →
  separate security/telemetry sink; exactly one record per attempt in the correct sink (`#218` §4).
- [ ] Closed `hardReason` vocabulary S1–S12; atomic consume+mutate+ledger in one tx; fail-closed on
  every principal-trust gap (`#218` §3C, §5).
- [ ] **Mirror the corrected prototype** (`028ec317`): tool path cannot write Done, `AdmitDone`+proofs
  (stubbed until #229), two sinks, atomicity (`#218` §8C).
- [ ] **Confirm-token wiring is CONDITIONAL** on the §3 owner-decision (default: none in v1; the gate
  ships reject+redirect regardless) (`#218` §9).

**Architecture alignment:** Deepens the **project-management application service** (`moveTask`/`createTask`
+ `authorizeTask`) with a transition-class guard **below** the role check; the seam is the
status-aware guard invoked by every caller (agent/web/MCP) — the #253 requirement (`#218` §2D).

**Architecture test:** assert no code path reaches `UPDATE tasks SET status='done'` (or insert with
`status:'done'`) without passing the guard.

**Sad paths / edges:** S1–S12 (`#218` §5) — autonomous Done, tool-path Done always-rejects, principal
mismatch, create-with-terminal, expired/replayed token, forged source, principal-binding-absent,
malformed expiry, valid-token+invalid-state, state-change-after-confirm, commit-failure rollback,
confused confirmation.

**CLEAR WORKING state:** an Ask Admin turn (and a direct web call, and an MCP call) attempting
`status:'done'` is rejected with a hard-gate code and redirected to governed `AdmitDone`; the attempt
appears in the security sink, never the activity ledger.

**E2E drive:** `tests/e2e/drives/ask-admin-a7-hardgate.mjs` (covers S1–S6 minimum + cross-caller).

**Gate:** real-world-validate 2× clean, exit 0.

---

### Slice A8 — Admin access & session binding + audit attribution

**Status:** not-started · **Blocked by:** ADR-018 owner pick (recommend: proceed BFF-side now) ·
**Blocks:** A12 (audit attribution)

**Goal:** Make the access boundary explicit and the audit attribution honest.

**Deliverables:**
- [ ] Access gate = same as the admin dashboard (role gate + broker `runtimeControl.forbidden` 403)
  (`#222`; `ask-opzava/page.tsx`).
- [ ] Audit attribution: human-commanded → verified acting admin → **"admin X via Ask Admin"**;
  autonomous → agent identity ("Ask Admin Opzava") (`#222`).
- [ ] **Extend the trusted context + audit** with provenance (currently records tool/target/result but
  not source/attestation) (`#212` §F; `assistant-conversation-outcomes.ts:29-93`).
- [ ] **ADR-018 Option 0 narrowing** (delete the four unread broker principal fields) as the
  no-regret move; note Option 2 (audience-bound signed assertion) as the eventual fleet answer
  (ADR-018; `#218` §3E).

**Architecture alignment:** Deepens the **BFF-verified session → `ToolExecutionContext` principal** seam
as the load-bearing trust source (not the broker); makes routing correctness stated, not implicit
(ADR-018:107-108; `#218` §3E).

**Sad paths / edges:** missing/null session → 401 fail-closed (`route.ts:619`); role revocation removes
access on reload/reconnect (PRD-005); caller-supplied tenant/actor/Runner fields ignored as authority
(PRD-005:337-357).

**CLEAR WORKING state:** a non-admin is 403'd at the gate; a human-commanded action is audited as
"admin X via Ask Admin"; an autonomous action as the agent identity.

**E2E drive:** `tests/e2e/drives/ask-admin-a8-access.mjs`.

**Gate:** real-world-validate 2× clean, exit 0.

---

### Slice A9 — UI: Variant A dual rail + chat surface (screenshot parity)

**Status:** not-started · **Blocked by:** A4 (conversation data), A5 (transport), A3 (footer model) ·
**Blocks:** A10

**Goal:** Build the approved design contract on the repo's shadcn chat primitives, to screenshot parity.

**Deliverables:**
- [ ] Dual rail (nav | chats | chat); contextual conversation rail; collapsible-to-icons nav, against
  `ux-redesign/mockups/{tokens,app,shadcn}.css` (#214; mockup-parity directive).
- [ ] Build on `MessageScroller`/`Message`/`Bubble`/`Marker` (`apps/web/components/ui/*`); app-compose
  the conversation-history rail (Button + DropdownMenu kebab) (#214).
- [ ] Conversation sidebar (New chat, grouped Today/Yesterday/Previous-7-days), auto-titles,
  rename/delete popover, streaming + Stop, retry/copy/feedback, tool receipts + digest cards, bottom
  composer (#210 locked decision 5; #214).
- [ ] Footer: pinned model + plan quota (#223/#224).

**Architecture alignment:** Deepens the **chat UI composition** over the shadcn primitives already
imported by `ask-opzava-chat.tsx`; the seam is the MessageScroller/Bubble/Marker component contract
(#214; official docs ui.shadcn.com/docs/changelog/2026-06-chat-components).

**Sad paths / edges:** cold-start empty state; long-thread scroll/pagination; compaction divider render;
mobile width preservation (PRD-005 accessibility/responsive).

**CLEAR WORKING state:** side-by-side screenshot matches `orchestrator-chat.html` (Variant A); a real
streamed turn renders with Stop/retry; the sidebar shows live PG conversations with auto-titles.

**E2E drive:** `tests/e2e/drives/ask-admin-a9-ui.mjs` (screenshot-parity assertion).

**Gate:** real-world-validate 2× clean, exit 0.

---

### Slice A10 — UI: six sad-path states + #252 error sanitization

**Status:** not-started · **Blocked by:** A9, A3 (failover chain for quota marker) · **Blocks:** A13

**Goal:** Realize the #225 states truthfully + fix the #252 upstream-internals leak.

**Deliverables:**
- [ ] Cold-start (task-focused prompt chips), loading (shimmer + honest status), send-failed (draft +
  auto/manual retry), tool-failed (honest red receipt + "nothing was changed"), quota (graceful
  failover marker), gateway-down (read-only degrade + "last synced" + auto-reconnect), memory-
  unavailable (proceed and say so) — via shadcn `Marker` + semantic colors (#225; #220 comment
  2026-07-15).
- [ ] **#252 sanitization (presentation half):** semantic messages pass through, infrastructure detail
  (`cf-ray`, `request id`, raw provider JSON) never does; realize with `Marker` (#252; #220 comment
  2026-07-15). (The broker-side sanitization half can land independently and earlier.)

**Architecture alignment:** Deepens the **chat-state projection** from PRD-005 streaming states
(`queued/working/coordinating/delegating/.../gateway-unavailable/policy-denied`, PRD-005:171); the seam
is the Marker/Bubble honest-render contract (#225; #252).

**Sad paths / edges:** every state is itself a sad path; the tension between closed-vocabulary
Opzava-strings vs pass-through actionable messages (rule: semantic passes, infra never does).

**CLEAR WORKING state:** each of the six states is reproducible from a real degraded dependency; an
upstream error renders as an actionable semantic message with no `cf-ray`/raw JSON.

**E2E drive:** `tests/e2e/drives/ask-admin-a10-sadpaths.mjs` (fault-injects each state +
infra-leak assertion).

**Gate:** real-world-validate 2× clean, exit 0.

---

### Slice A11 — Skills: 3 `SKILL.md` + AGENTS.md governance

**Status:** not-started · **Blocked by:** A2 (policy/profile/read — skills inert until then), A1
(card/platform tools), A7 (gate framing) · **Blocks:** —

**Goal:** Ship the three proprietary skills + every-turn governance in AGENTS.md.

**Deliverables:**
- [ ] `opzava-card-authoring` — near-verbatim port of
  `.claude/skills/opzava-task-authoring/SKILL.md`, tool refs → `opzava_tasks_*`, Card/DevTicket/Proposal
  terms (`#219` §4.1; R12).
- [ ] `opzava-pm` — sprint math + "should X be a Sprint?" rubric + prioritization + delegation playbook
  (DevTicket vocabulary; consumes `#216`); `#219` §4.1).
- [ ] `opzava-reporting` — taxonomy + per-type data checklist + `templates/` + honesty rules (`#219`
  §4.1).
- [ ] `user-invocable: false` for all three (default; `#219` O5).
- [ ] **Shared-volume reconciler delivery** (default; `#219` O4; `#221` §A5) + `agents.list[].skills`
  set to the exact three names.
- [ ] **AGENTS.md additions** (cap ~3–4 KB; `#219` O6): memory discipline, platform-state conventions,
  governance hard rules ("autonomous never Done / never approve-merge" — **backed by** tool policy +
  the A7 server-side gate, never skill prose) (`#219` §4.3; R3/R4).

**Architecture alignment:** Deepens the **skill-as-demand-loaded-craft** model (metadata index +
`read`-on-trigger) vs every-turn AGENTS.md artifacts; the seam is the skills agent-filter +
`additionalRoots` read-root mechanism (`#221` §A1/§A5; `#219` §5).

**Sad paths / edges:** a skill's declared tool absent from `effective` (rejected); undeclared body-tool
usage (rejected); subagent inheriting "unrestricted" skills (fail-closed via `agents.defaults.skills:[]`,
R10); skill body exceeding token budget.

**CLEAR WORKING state:** a card-authoring turn loads `opzava-card-authoring` via `read` and produces a
scannable Card; a PM turn loads `opzava-pm`; a reporting turn loads `opzava-reporting`; subagents load
zero skills.

**E2E drive:** `tests/e2e/drives/ask-admin-a11-skills.mjs` (skill-load + governance assertions).

**Gate:** real-world-validate 2× clean, exit 0.

---

### Slice A12 — Delegation path: Ask Admin command Adapter + verbs + delegation card

**Status:** not-started · **Blocked by:** A2 (delegation session tools), A5 (transport), A9 (card UI),
A7 (terminal safety), A8 (audit) · **Blocks:** —

**Goal:** Ask Admin delegates through the governed command seam — request origin, never dispatcher.

**Deliverables:**
- [ ] **`AskAdminCommandAdapter.requestCommand(turnContext, intent)`** in the BFF/worker behind the
  broker `runtimeControl` ACL; derives principal from the Better Auth session only; turn/tool-call
  idempotency; **never** `operator.admin` (`wf216` §2.1, §3.5; `wf232:235`).
- [ ] **Delegation verb set** mapped 1:1 to #230 commands the Lead Orchestrator may *request*:
  `draftProposal`, `requestCreateBacklogDevTicket`, `requestAssign`, `requestClaimAndStart` (forwarded
  to Execution Admission), `requestSubmitForReview`, `pauseOrEscalate`, `notify` — each exactly one
  `requestCommand` call; never Done/merge/approve (`wf216` §3.2).
- [ ] **Fail-fast `governed_dispatch_unavailable`** when a governed start-capability is absent (v1 ships
  the **non-execution subset** — no `ClaimAndStart` until #232/#230 land) (`wf216` §3.4).
- [ ] **Delegation card** per active intent, projected from Dev Board activity + worklog stream into the
  PRD-005 streaming states (`requested → provisioning → starting → in_progress → [blocked] →
  submitted_for_review → completed | failed`); no private progress channel (`wf216` §2.3, §3.3).
- [ ] Resolve `group:sessions` → concrete projected tool names via `alsoAllow`; drop the bare group
  token (`wf216` §3.1; `#212` §E4).
- [ ] **Owner decision to weigh (not a silent change):** the enriched `wf216` §3.8 carries a stricter,
  better-grounded alternative to the raw delegation subtree above — a single closed
  `opzava_support_delegate` tool (Mainframe extension `extensions/opzava-support-delegation` +
  `AssistantDelegationCoordinator`) that removes raw `sessions_*/subagents` from the model surface.
  v1 ships §3.1's resolved subtree; §3.8 is surfaced for owner sign-off as a fast-follow hardening, not
  swapped in. Tradeoff: no raw `sessions_*/subagents` exposure (§3.8) vs richer runtime control (§3.1).
  See D-DELEG-4; full conflict analysis `RECONCILE-NOTES-216.md` §1.A.

**Architecture alignment:** Deepens the **Ask Admin command Adapter** as the named deep module
(`requestCommand(turnContext, intent)`) — the seam between chat intent and the governed DevTicket command
surface; enforces the request-origin-vs-dispatcher inversion (`wf216` §1; `wf232:235`).

**Sad paths / edges:** forbidden verb (Done/merge) rejected at the adapter before dispatch (prototype S2);
disconnect containment — no cloud failover (S3); reauth mismatch (S4); replay dedupe (S5); forged/missing
session rejected (S6); stale-version resume requires fresh `ClaimAndStart` (S7) (`wf216` §4).

**CLEAR WORKING state:** an admin asks Ask Admin to delegate a Card; a delegation card appears tracking
`requested → ... → submitted_for_review`; a `Done`/merge verb is rejected; a disconnect pauses (no cloud
Runner appears).

**E2E drive:** `tests/e2e/drives/ask-admin-a12-delegation.mjs` (happy + forbidden-verb + fail-fast).

**Gate:** real-world-validate 2× clean, exit 0.

---

### Slice A13 — Cost governance: account-limits UI + usage visibility

**Status:** not-started · **Blocked by:** A3 (chain), A10 (quota marker) · **Blocks:** —

**Goal:** v1 cost visibility (not enforcement).

**Deliverables:**
- [ ] **"Current account limits" UI** on the Connections surface from OpenClaw `limits.windows` — real
  for Claude + GPT; graceful "not available" for GLM + Kimi (`#224`; `#220` comment 2026-07-15).
- [ ] Session token usage + quota windows in admin surfaces (`#224`).
- [ ] **Quota-aware failover** walks the #223 chain (no hard-stop) (`#224`).
- [ ] **No budgets / fan-out caps in v1** (`#224`). Pay-per-token pricing-refresh pipeline **deferred**
  (principle locked: never hardcoded) (`#224`).

**Architecture alignment:** Deepens the **Connections surface** as the provider-quota projection owner;
the seam is OpenClaw `limits.windows` → read model (Claude/GPT real; GLM/Kimi degrade gracefully)
(`#224`; `docs/openclaw/concepts/usage-tracking.md`).

**Sad paths / edges:** GLM/Kimi "not available" degrade; quota exhaustion triggers failover (not
hard-stop); a pay-per-token provider connected before the refresh pipeline (do not hardcode a price).

**CLEAR WORKING state:** the Connections UI shows Claude/GPT plan limits live; an Ask Admin turn hitting
quota fails over with the A10 marker; GLM/Kimi show "plan limits not available."

**E2E drive:** `tests/e2e/drives/ask-admin-a13-cost.mjs`.

**Gate:** real-world-validate 2× clean, exit 0.

---

# PART 3 — OWNER DECISIONS TO LOCK BEFORE IMPLEMENTATION

> Each child's "recommendation carried to #220 (not an owner-lock)" consolidated here with a
> **recommended default**. Absent an owner override at sign-off, the default is what the slices build.
> These are **defaults to confirm**, not reopened child decisions.

## 3.1 Tool policy & projection (from #212, #219, #243)

- **D-TP-1 Projection mechanism** — bare names vs `<server>__opzava_tasks_*` bundle-MCP names
  (`#212` §H Q2, CRITICAL). **Default:** pin at A1; prefer the shape that makes the exact `allow`
  enforceable, and rewrite the `allow` to the projected names. *Owner must confirm.*
- **D-TP-2 Accept the ADR-005 deny-surface widening** (`minimal → coding`) (`#219` O2). **Default:
  accept** — no alternative path to `read`/`memory_*`/`web_*`; safe because the exact keep-only `allow`
  (not deny-only) is the control, and the broker fails the session closed on drift. *Confirm.*
- **D-TP-3 `read` inclusion** — soft; drop if skills prove fully context-injected (`#212` §H Q3).
  **Default: keep** for v1 (skills demand-load via `read`). *Confirm.*

## 3.2 Memory (from #217, #211)

- **D-MEM-1 Memory-flush under write-denied policy** — the CRITICAL A0 gate. **Default:** prove it
  writes; if not, add a narrowly-scoped memory-append capability (`#217` gate 1). *Outcome of A0.*
- **D-MEM-2 Cross-agent `extraPaths`** — parked. **Default:** lock the layout convention now, do not
  wire in v1 (`#217`). *Confirm.*

## 3.3 Brain model (from #223, #251)

- **D-BRAIN-1 Interim primary** — **Default:** GLM-5.2 until OpenAI/Anthropic auth wired and 5.6-sol
  verified (`wf223`). *Confirm.*
- **D-BRAIN-2 `gpt-5.6-sol` head runnability** — blocked on #193 fork bump; **Default:** pin after bump,
  verify catalog (`gpt-5.5` fallback) (`wf223` OQ1; `#251`). *Confirm.*
- **D-BRAIN-3 (OPEN, §4)** — does the chain fail over on "runtime rejects a catalog-offered model"
  (not a quota failure)? **Default:** treat as a hard turn-failure until proven otherwise; surface via
  the A10 tool-failed state. *Owner must decide the desired UX.*

## 3.4 Conversation history (from #213)

- **D-CONV-1 Auto-title model** — **Default:** a cheap/fast model, not the premium brain; manual rename
  always wins (#213 decision 3). *Confirm.*
- **D-CONV-2 Retention default** — **Default:** 90d after last activity, configurable (#213 decision 6).
  *Confirm.*
- **D-CONV-3 CONTEXT.md terms** — **Default:** fold Conversation/Session at A4 (#213). *Confirm.*

## 3.5 Skills (from #219, #221)

- **D-SKILL-1 3 vs 4 skills** — **Default: 3** (`opzava-platform-status` deferred to v2; `#219` O1).
  *Confirm.*
- **D-SKILL-2 Delivery channel** — **Default:** shared-volume reconciler write for v1 (`#219` O4).
  *Confirm.*
- **D-SKILL-3 Slash-command surface** — **Default:** `user-invocable: false` (`#219` O5). *Confirm.*
- **D-SKILL-4 AGENTS.md budget** — **Default:** cap additions ~3–4 KB; slice owner owns the token audit
  (`#219` O6). *Confirm.*

## 3.6 Hard gate / confirm token (from #218)

- **D-GATE-1 Confirm-token scope (Q4/§9, REOPENED)** — given Done is system-owned and unreachable from
  the tool path, and approve-merge is deferred. **Default (a): none in v1** — defer all confirm-token
  machinery; the gate ships reject+redirect regardless. Adopt (b) only if a §1B non-terminal
  human-commanded action is actually surfaced through Ask Admin in v1 (`#218` §9). *Owner must decide.*
- **D-GATE-2 `approve-merge` / `AdmitDone`** — **Default:** out of scope for v1; lands with #229 (`#218`
  Decision 4). *Confirm.*
- **D-GATE-3 Quality-check provenance** — **Default:** agent checks labeled AI (`ai_precheck`), never
  `kind:"human"` (`#212` §F). *Confirm.*

## 3.7 Delegation (from #216)

- **D-DELEG-1 v1 verb subset** — **Default:** non-execution subset only (no `ClaimAndStart` until #232/
  #230 land); fail-fast `governed_dispatch_unavailable` (`wf216` §3.4). *Confirm.*
- **D-DELEG-2 Adapter placement** — **Default:** BFF/worker behind `runtimeControl`, never `operator.admin`
  (`wf216` §3.5). *Confirm.*
- **D-DELEG-3 Boundary source order** — **Default:** #243 > #219 > #232 > #230 > PRD-005 > ADR-017
  (`wf216` §3.6). *Confirm.*
- **D-DELEG-4 Model-facing delegation surface (OPEN — owner decision, not locked).** The enriched
  `wf216` carries two alternative surfaces for the v1 delegation tool. §3.1's resolved raw subtree
  (`sessions_spawn`/`sessions_yield`/`subagents`, admitted via `alsoAllow`) is the surface this spec
  locks in §1.13 (the 25-name set) and Slice A12. The enriched §3.8 proposes a stricter,
  better-grounded alternative: a single closed `opzava_support_delegate` tool backed by a new
  Mainframe extension + `AssistantDelegationCoordinator` that **removes raw `sessions_*/subagents`
  from the model-facing surface entirely** (no unsafe caller-selected args — target/cwd/runtime/model/
  thread/context/attachments; no non-idempotent `taskName`) in exchange for a larger self-contained
  build (extension + coordinator + aggregate + adapter + policy + projection). **Default (unchanged):
  keep §3.1 for v1** — §3.8 is recorded here as a fast-follow hardening the owner may choose at
  sign-off, **not a silent swap**; the v1 25-name surface and Slice A12 are unchanged unless the owner
  overrides. Tradeoff to weigh: **no raw `sessions_*/subagents` exposure (§3.8) vs richer runtime
  control (§3.1).** Full conflict analysis: `RECONCILE-NOTES-216.md` §1.A (`wf216` §3.1 ↔ §3.8).
  *Owner decision, not locked.*

## 3.8 Cost (from #224)

- **D-COST-1 Budgets/caps** — **Default:** none in v1 (visibility only) (`#224`). *Confirm.*
- **D-COST-2 Pay-per-token pricing** — **Default:** pipeline deferred; never hardcoded (`#224`).
  *Confirm.*

## 3.9 Access & principal trust (from #222, ADR-018)

- **D-ACCESS-1 Access gate** — **Default:** same as the admin dashboard (role gate +
  `runtimeControl.forbidden`) (`#222`). *Confirm.*
- **D-ACCESS-2 ADR-018** — **Default:** take Option 0 (delete four unread fields) now as no-regret;
  Option 3 (per-tenant scoped token) before the fleet; Option 2 deferred to the first real
  user-identity consumer (ADR-018 Recommendation). The hard gate proceeds BFF-side regardless (`#218`
  §3E). *Owner must pick (this is an ADR decision, not a slice default).*

---

# PART 4 — UNRESOLVED / OPEN INTERSECTIONS (do not invent)

These are **not** resolved by the child decisions; they are listed, not defaulted into fact.

1. **#251 — brain chain head unrunnable + failover gap.** `gpt-5.6-sol` cannot execute on the current
   stack (gateway-bundled Codex 0.142.4; backend 400s `gpt-5.6-*` from CLI ≤0.143.0). Not runnable until
   the `#193` fork bump (→ upstream `v2026.7.1`, app-server 0.144.3). **And** it is unproven whether the
   #223 chain fails over for the failure mode "catalog offers the model but the runtime rejects it" —
   that is neither a quota failure nor gateway-down, so #225 does not cover it. (Map #210 comment
   2026-07-16; `#251`.) → see D-BRAIN-3.
2. **#252 — upstream-internals leakage.** Ask Admin forwards raw upstream failure text (OpenAI JSON,
   broker messages, `cf-ray`/`request id`). The sanitization (broker) and presentation (UI) halves are
   separable. The survived rule: semantic messages pass, infrastructure detail never does. (Map #210
   comment 2026-07-16; `#252`.) → baked into A10; broker half can land independently.
3. **#229 — Review Gate / `AdmitDone` proof owner.** Owns the deferred approve-merge **and** the
   system-owned Done chain. `AdmitDone` is disabled until #229 ships the Review Exit Containment Proof;
   until then **no v1 path writes Done** (by design). (`#218` Decision 3; wf230:1525-1547.)
4. **#246 — final DevTicket graph/formats.** Collides with this spec on the final command-graph and
   audit shape; #220 consumes #230's command model but the final aggregate schema is #246's.
   (Readiness review, #220 comment 2026-07-18.) → the A7 gate's aggregate migration is a #246/#237
   follow-through (`#218` §8C.7).
5. **ADR-018 / #194 — principal trust (Proposed).** Owner has not picked. The hard gate does **not**
   block on it (BFF-side, `#218` §3E), but trustworthy broker-side `userId` attribution ("admin X via
   Ask Admin" proven, not asserted) is a vote for Option 2; Option 0 is the no-regret narrowing now;
   Option 3 is required before a per-tenant broker fleet. (ADR-018; `#222`.) → see D-ACCESS-2.
6. **#230/#232 governed dispatch is unimplemented target architecture.** A12 ships the non-execution
   delegation subset and fails fast; full `ClaimAndStart` waits for #232 Runner delivery + #230
   Execution Admission (ADR-017:14-15). (`wf216` §3.4.)
7. **`opzava_conversations_search`/`_get` RLS + projection plan.** The 2 net-new tools (from #213) must
   coordinate with #212's projection/`tools.effective` plan; their exact projected names pin at A1/A2.
   (`#213` downstream flags.)
8. **`memory_get` reach over `extraPaths`** travels with the parked cross-agent slice (not v1).
   (`wf211` open questions; `#217`.)

---

# PART 5 — ACCEPTANCE & EVIDENCE GATES (map-done criteria)

The map (#220) is done when:

1. This assembled spec is **user-signed-off** (the #220 body's explicit requirement).
2. The §2 slice graph is **ready to enter `docs/plan/EXECUTION.md`** as a new, dated Ask Admin v1 slice
   section (not an edit to the frozen Q1–Q18 worklog).
3. Every slice card carries the five-point quality bar + the architecture-test/e2e-hardening checklist
   (per the #220 readiness review).
4. The §3 owner-decisions are confirmed (or overridden) at sign-off.
5. The §4 open intersections are explicitly acknowledged (not silently defaulted).

**Per-slice Done verdict:** `node tests/e2e/gate/real-world-validate.mjs`, **2 consecutive clean runs,
exit 0** (#220 body; #210 implementation quality bar), plus the slice's own `tests/e2e/drives/`
extension passing.

---

# PART 6 — CITATIONS INDEX (every claim → source)

**Memos (read this pass):**
- `docs/plan/research/wf211-ask-admin-memory-backend.md` — memory backend (builtin `memory-core` +
  `extraPaths`; QMD runner-up; LanceDB/Honcho/wiki disqualified).
- `docs/plan/research/wf212-ask-admin-tool-inventory.md` — tool-policy mechanic (`alsoAllow`,
  profile-first, keep-only, plugin tools not exempt), 37-row core inventory, card-tool port + net-new
  reads, exact-`allow` control, server-side gate.
- `docs/plan/research/wf216-ask-admin-delegation-path.md` — delegation as command-request origin; §2
  authority split; §3 open decisions carried to #220; prototype S1–S11.
- `docs/plan/research/wf218-governed-card-authority.md` — corrected hard-gate contract; #253 closure;
  two-sink audit; S1–S12; §9 confirm-token open question; ADR-018 Option 0 reconciliation.
- `docs/plan/research/wf219-ask-admin-v1-skills.md` — three skills; R1–R16 resolved; §3 open decisions;
  fail-closed guarantees §5; prototype §6.
- `docs/plan/research/wf221-ask-admin-v1-skills.md` — skill mechanics; §A5 corrected provisioning recipe;
  §B the v1 set; §B6 hard tool dependency.
- `docs/plan/research/wf223-ask-admin-brain-model.md` — pinned chain; interim GLM primary; agnostic
  subagent model; provisioner build-blocker.

**Authority docs:**
- `docs/prd/PRD-005-assistants-chat.md` — chat contract: conversation lifecycle (`:154-167`), streaming
  states (`:171`), Dev Board Adapter reauthorization (`:220`), admin-token job boundary (`:227`,
  `:291-292`), acceptance (`:331-343`), Ask Admin Dev Board tests (`:357`).
- `docs/adr/ADR-018-web-broker-principal-trust.md` — broker reads only `tenantId` (`:7`,`:39`); Option 0
  (`:64-68`); BFF owns user attribution (`:107-108`); Option 3 (`:50`,`:76-78`).
- `docs/adr/ADR-017-dev-board-authority-sync-execution.md` — authority split, four ledgers
  (`:533-545`), disconnect/no-failover (`:67-70`, `:477-486`), Runner≠assignee (`:368-373`), Q17
  supersession (`:17-27`), Review #229 owns verdict+merge (`:331-342`).
- `docs/plan/dev-board-foundation-decisions.md` — DBF-028 (`:59`), DBF-030 (`:61`), DBF-031 (`:62`),
  DBF-118 (`:199`), DBF-174 (`:285`), DBF-193 (`:321`), DBF-226 (`:362`).

**Code (cited via memos, host-verified):**
- `apps/workers/src/provisioning/ask-admin-agent.ts` — current policy (`:29-53`, `:82`, `:86-90`,
  `:261-281`); delegation allow (`:49-53`); `buildAskAdminAgentEntry` (`:302-326`); subagent containment
  (`:37-41`, `:336-346`); `operator.approvals` (`:20`); model typed as string (`:289`).
- `packages/runtime-control/src/application/task-tools.ts` — registry (`:43-58`); `optionalStatus`
  (`:261-276`); create/update args; `performTool` (`:665-681`, `:717-728`).
- `packages/project-management/src/application/tasks.ts` — `authorizeTask` (`:648-668`); `createTask`
  (`:1386`); `moveTask` (`:1745`); approval op (`:2958-2974`).
- `apps/web/app/api/tasks/ask-admin/turn/route.ts` — 401 session gate (`:619`); `actingPrincipal`
  (`:265-273`); `tool.call` BFF-side (`:379-393`); `approval.requested` no-op (`:423-425`).
- `apps/gateway-broker/src/acl/openclaw/operator-client.ts` — `getEffectiveTools` mismatch
  fail-closed (`:449-501`).
- `mainframe/src/agents/tool-catalog.ts` — `minimal`=`session_status` only; `coding`=`bundle-mcp`
  (`:363-376`); pipeline + matcher (`tool-policy-pipeline.ts`, `tool-policy-match.ts`,
  `agent-tools.policy.ts`).
- `apps/web/components/ui/{message-scroller,message,bubble,marker}.tsx` — shadcn chat primitives
  (confirmed present).
- `ux-redesign/mockups/orchestrator-chat.html` (+ `{tokens,app,shadcn}.css`) — design contract
  (commit `463e3768`; confirmed present).

**Prototypes (throwaway evidence):**
- `prototypes/wf216-delegation/` (S1–S11 PASS), `prototypes/wf218-hard-gate/` (S1–S7 PASS, `028ec317`),
  `prototypes/wf219-skills/` (S0–S5 PASS).

**Issues (gh read this pass):** #210 (map body + comments incl. 2026-07-16 live defects and 2026-07-17
#216-in-flight), #220 (body + 6 comments incl. 2026-07-18 readiness review), #213 (8 decisions + 2
net-new tools), #214 (Variant A), #217 (architecture + 2 gates + #213 amendment), #222 (access), #224
(cost), #225 (six states), #211/#212/#216/#218/#219/#221/#223 (via memos + map ledger), #251/#252
(live defects via map comment), #229/#246 (open intersections via readiness review), #194/ADR-018
(principal trust).

**No claim here revives Q17 or #147–#157.** Where a child open question is unresolved, it is labeled as
an owner decision (§3) or an open intersection (§4), not silently defaulted into the spec.
