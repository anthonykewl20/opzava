# WF-218 — Governed card authority & hard-gate confirm flow

**Ticket:**
[#218 — Spec the governed card authority and hard-gate confirm flow](https://github.com/anthonykewl20/opzava/issues/218)
· map [#210](https://github.com/anthonykewl20/opzava/issues/210) (Ask Admin)<br>
**Date:** 2026-07-18 (revised 2026-07-18 — contract correction)<br>
**Status:** resolved design input. A throwaway demonstrator at `prototypes/wf218-hard-gate/`
proves the corrected **gate contract** across seven scenarios. An earlier draft's Done happy-path
encoded a **contract error** (it implied a human confirm token could directly write Done); a
completeness audit (Codex gpt-5.6-sol) + matrix audit (DeepSeek v4 Pro) caught it, and both this
memo and the prototype (committed `028ec317`) are corrected against the locked contract. **No
production code or schema is landed by this memo.** Open implementation items are carried to #220
(assembly).

> **⚠ Contract correction (read first).** The earlier draft implied that an enrolled admin's in-chat
> **confirm token could directly write `Done`** (i.e. `moveTask→done` succeeds once the token +
> verified principal are presented). **That is wrong.** The locked contract is unambiguous:
> - **No direct In-Progress→Done transition exists** (DBF-028;
>   `docs/plan/dev-board-foundation-decisions.md:59`).
> - **`Done` is written only by the system-owned `AdmitDone` command**, which is **disabled until
>   #229's contract is implemented** and must consume the **#229 Review Exit Containment Proof** +
>   **governed merge authorization** + **verified GitHub merge into `development`**
>   (wf230:1525-1547; `docs/plan/research/wf230-devticket-command-model.md:1538-1547`).
> - **Nothing invokes Done directly** — "A UI drop, GitHub label, agent, or stale projection cannot
>   invoke Done directly" (wf230:1546-1547).
> - Therefore **from the Ask Admin tool path, `moveTask(done)` and `createTask(done)` ALWAYS reject
>   and redirect to governed `AdmitDone`** (§1A). A human confirm token is **necessary-but-never-
>   sufficient** for Done: it is at most one input to the governed merge-authorization chain, never a
>   Done-writer.
> - **Audit correction:** the activity/history ledger records **accepted** commands only (DBF-174,
>   `dev-board-foundation-decisions.md:285`). **Rejected/bypass attempts go to a SEPARATE
>   security/telemetry sink**, not the activity ledger (§4).
> Net: the gate's job for terminal status is to **REJECT + REDIRECT**, not to gate-and-allow a
> confirm-token-backed Done. The "two hard gates" in #218's frame collapse to **one** for v1 (Done),
> and even that one is unreachable from the tool path until #229 ships `AdmitDone`.

> **Scope rule honored.** This memo **consumes** the locked Dev Board command model (`ADR-017`,
> `PRD-019`, #230/wf230, `docs/plan/dev-board-foundation-decisions.md`) and `ADR-018` — it does not
> redefine them. Per the #218 readiness review (2026-07-18) and the #218↔#230 collision comment, #230
> owns the DevTicket command surface; #218 owns only the **Ask-Admin-side** questions: the
> commanded-vs-autonomous split, attribution/audit rows, the in-chat confirm step, and how the gate is
> enforced so tool policy cannot bypass it. Every claim below cites a `file:line` or issue; the
> prototype is the only runnable evidence and it is explicitly throwaway (and its Done happy-path is
> now known to need rework — §6).

## Decision summary

The governed authority already exists on paper; the enforcement did not exist in code. This memo
locks the contract that closes that gap (bug [#253](https://github.com/anthonykewl20/opzava/issues/253))
and records the decisions locked this session, **with the Done contract corrected**.

1. **The gate is server-side, argument- and principal-aware, below the tool-policy layer, called by
   both `moveTask` and `createTask`, and its job on a terminal status is to REJECT + REDIRECT — not
   to gate-and-allow.** A single status-aware guard (working name
   `assertTerminalTransitionAuthorized`) lives in `packages/project-management`, invoked **after**
   `authorizeTask` succeeds and **before** the `withTenant` mutation (or insert). No caller — Ask
   Admin agent, direct web, or MCP task-tool — can reach a terminal transition by passing only the
   role check. This is the #253 closure
   (`packages/project-management/src/application/tasks.ts:1745` and `:1386`; #253; #212).
2. **`createTask` with a terminal status is REJECTED outright.** A card may never be *born* `done`
   (Decision 2). Given DBF-030 ("Done means the exact reviewed change has passed required approval
   and merged into `development`"), there is no legitimate "born Done" card, so the create path does
   not gate terminal status — it rejects it with `hardReason=create-with-terminal-status` before
   insert (`tasks.ts:1395-1421`; DBF-030; `dev-board-foundation-decisions.md:61`; #212).
3. **`Done` is SYSTEM-OWNED via `AdmitDone`; the Ask Admin tool path can NEVER write Done.**
   `moveTask(done)` and `createTask(done)` **always reject and redirect** to governed `AdmitDone`
   (`hardReason=done-is-system-owned` / `terminal-transition-requires-admit-done`). `AdmitDone` is a
   system-owned command **disabled until #229's contract is implemented**; it must consume the
   **#229 Review Exit Containment Proof**, the **governed merge authorization**, and a **verified
   GitHub merge into `development`** before decrementing WIP with Done admission
   (wf230:1525-1547, esp. `:1538-1542`, `:1546-1547`; wf230:1888; wf230:492-498; ADR-017:101-103,
   :331-332; DBF-028/030/031; PRD-019:27-28, :50-55, :102-103, :104-105, :118-119; #229). A human
   confirm token is **necessary-but-never-sufficient** for Done (§3).
4. **`approve-merge` is OUT OF SCOPE for v1.** The Ask Admin tool surface ships no merge tool for v1
   (`packages/runtime-control/src/application/task-tools.ts:43-58` exposes only list/create/update).
   The #229 `ReviewMergeAuthorization` / Review Exit Containment Proof binding remains the target
   contract (§1A) and is not exercised by v1; it lands with #229 (wf230:154-155; ADR-017:331-332;
   #229). **This requires an explicit amendment to #218's body** (§8B): its frame names "the two
   hard gates (Done / approve-merge)," but with approve-merge deferred and Done unreachable from the
   tool path, the two collapse to one (Done) for v1 — and even that one is system-owned.
5. **No step-up auth for v1, and the confirm-token scope is now an open question.** Because Done
   cannot be written via the tool path, the in-chat "confirm-for-Done" partly evaporates: there is no
   Done mutation for a confirm token to authorize in v1. Whatever confirm-token machinery v1 needs
   applies only to **non-terminal human-commanded actions** (§1B) — and **which v1 actions (if any)
   actually require one is OPEN** (§9). Password/TOTP/passkey step-up stays reserved for
   credential/blast-radius actions routed to the Secure Admin UI (DBF-118,
   `dev-board-foundation-decisions.md:199`; #222).

Decisions 1–4 resolve open questions Q1, Q2, Q3, Q5, Q6, and Q8 from the research pass (§7). The
principal-trust dependency (Q8) is recorded here, per the #218 collision comment, as a #218-side
statement so #220 inherits it: **the principal is verified at the BFF/tool-execution layer, not the
broker — a vote for ADR-018 Option 0's attribution split, not against it, and it does not require
resolving #194 before building the gate** (§3E; ADR-018:107-108). The confirm-token scope (Q4) is
**reopened** by the Done correction and carried as the §9 open question.

## Primary evidence and as-built gap — the #253 closure

The gap is precisely defined by three verified facts. Together they are bug #253: "tool policy is
the only barrier, and tool policy is not a hard gate."

1. **The agent tool surface allows terminal status on both create and update.**
   `runtimeControlTaskToolRegistry` advertises `status?: todo|in_progress|blocked|done` for
   `opzava_tasks_create` **and** `opzava_tasks_update`
   (`packages/runtime-control/src/application/task-tools.ts:48-58`). `parseCreateArgs`
   (`task-tools.ts:389`) and `parseUpdateArgs` (`task-tools.ts:445`) both run status through the
   identical `optionalStatus` validator, which treats `done` no differently from `todo`
   (`task-tools.ts:261-276`). This is the "create ALSO accepts done" finding from #212.

2. **`performTool` reaches the mutation with no terminal-status gate.**
   - Create path: `services.createTask({ ...appContext, ...parsed.args }, deps)` passes `status`
     straight through (`task-tools.ts:665-681`). A `status:'done'` create goes directly to insert.
   - Update path: a status change calls `services.moveTask(...)` (`task-tools.ts:717-728`).
   - The only authority consulted is `taskDependencies(dependencies)` wiring an `authorizationPort`
     (`task-tools.ts:549-552`). There is **no** confirm token, **no** human-command attestation,
     **no** terminal-status branch anywhere in this file.

3. **The application-layer check is generic and status-agnostic.**
   `moveTask` (`packages/project-management/src/application/tasks.ts:1745`) calls
   `authorizeTask(input, "update", authorizationPort)` at `tasks.ts:1774`, then performs the
   `UPDATE ... SET status=` at `tasks.ts:1780-1807`. `createTask` (`tasks.ts:1386`) parses status via
   `parseTaskStatus(input.status ?? "todo")` at `tasks.ts:1395` — `done` parses fine — then calls
   `authorizeTask(input, "create", ...)` at `tasks.ts:1421`. `authorizeTask` (`tasks.ts:648-668`)
   delegates to `authorizationPort.can(...)`. The default port is `RoleKeyTaskAuthorizationPort`
   (`packages/project-management/src/application/authorization.ts:103`), whose `can()` returns
   `roleAllows("member", subject.roleKeys)` for **every** `update`/`create` action
   (`authorization.ts:31-71`) — it cannot distinguish a move to `todo` from a move to `done`.

The Ask Admin agent already holds the tools: `ASK_ADMIN_TOOL_POLICY_ALLOW =
[opzava_tasks_list, opzava_tasks_create, opzava_tasks_update]`
(`apps/workers/src/provisioning/ask-admin-agent.ts:43-47`), and the SOUL/IDENTITY/AGENTS templates
instruct it to "Keep all task operations scoped to the authenticated session principal"
(`ask-admin-agent.ts:227`, `:175-182`). But that is a **SOUL claim** — per the project
Non-Negotiable "tool policy beats SOUL claims," it is not a barrier. An agent whose acting admin
holds `member`+ passes `authorizeTask` today and can `UPDATE tasks SET status='done'`.

> **What the gate does about it (corrected).** The guard does **not** "let a confirm token write
> Done." It **rejects** every tool-path `done` transition (move *and* create) with a hard-gate code
> and **redirects** to governed `AdmitDone`. Done is reachable only by the system-owned `AdmitDone`
> path (Decision 3). The confirm token, if v1 uses one at all, is for non-terminal human-commanded
> actions (§1B, §9) — never a Done-writer.

> **Naming correction (verified).** The task brief names `markTaskDoneForCard`. That function
> **does not exist** in source — `grep -rn 'markTaskDoneForCard' packages/ apps/` returns zero hits
> in `src/`. The real terminal-status code paths are `createTask` (create-with-done) and `moveTask`
> (update→done). The gate covers **both**, and rejects both.

## 1. Governed action matrix

Source/principal authority is **already locked** by wf230's exhaustive v1 source/principal table
(`docs/plan/research/wf230-devticket-command-model.md:248-264`). #218 consumes it; it does not
redefine it. The matrix below is the **Ask Admin overlay** on that table: it maps the **actual
current tool surface** (`opzava_tasks_{list,create,update}`) plus the target terminal commands onto
three buckets: **autonomous-allowed**, **human-commanded-only** (needs confirm, per §9 open
question), and **never-reachable-from-tool-path** (the hard gates — system-owned or rejected).

### 1A. Never reachable from the Ask Admin tool path (reject + redirect; NOT confirm-gated-and-allowed)

| Command / transition | Why unreachable from the tool path | Authority |
| --- | --- | --- |
| **Lane move → `Done`** (`moveTask` to `status:'done'`) — **ALWAYS reject + redirect to `AdmitDone`** | **No direct In-Progress→Done exists** (DBF-028, `dev-board-foundation-decisions.md:59`); **Done is system-owned via `AdmitDone`**, disabled until #229 and requiring the #229 Review Exit Containment Proof + governed merge authorization + verified merge into `development` (wf230:1525-1547, esp. `:1538-1542`); "A UI drop, GitHub label, agent, or stale projection cannot invoke Done directly" (wf230:1546-1547); "Review and Done moves are system-controlled" (DBF-031, `dev-board-foundation-decisions.md:62`); "Done is admitted only after the applicable Review and approval have passed and the exact reviewed change is merged into `development`" (ADR-017:101-103); "no card may be declared Done before independent review and merge into `development`" (PRD-019:27-28); Review is mandatory and independent (PRD-019:50-55, :102-103). The Ask Admin tool path therefore rejects `done` with `hardReason=done-is-system-owned` and redirects to governed `AdmitDone`. | DBF-028/030/031, wf230:1525-1547, ADR-017:101-103, PRD-019:27-28/50-55/102-103/104-105/118-119, #229, #253 |
| **`approve-merge`** (Review Merge Authorization dispatch) — **v1 OUT OF SCOPE** | Single-use #229-governed authorization bound to the Review Exit Containment Proof; "permission to admit Done without the matching confirmed dispatch [is never granted]" (wf230:155); "Review #229 remains the only owner of independent verdict and exact merge authorization; the integration only dispatches an already-authorized merge and confirms native facts" (ADR-017:331-332); merge is human-approval territory (ADR-017:88). Ask Admin ships no merge tool for v1 (`task-tools.ts:43-58`). | #229, wf230:154-155, ADR-017:88/331-332 |
| **Create-with-terminal-status** (`createTask` with `status:'done'`) — **REJECTED outright** | "create ALSO accepts done" (#212); a freshly-created `done` card would bypass Review+merge entirely. There is no legitimate "born Done" card (DBF-030, `dev-board-foundation-decisions.md:61`), so create does not gate terminal status — it rejects it (Decision 2). | #212, DBF-030 |

> **Correction vs. the earlier draft.** The earlier 1A listed "Lane move → Done" as *confirm-token +
> verified principal required; autonomous = reject* — i.e. confirm-gated-and-allowed. That is wrong:
> no confirm token makes a tool-path `moveTask(done)` succeed. The gate **rejects + redirects** every
> tool-path Done attempt. Done admission is the system's job (`AdmitDone`), gated on #229 proofs +
> verified merge, not on an in-chat confirm.

### 1B. Human-commanded-only — agent may relay/propose, but may not self-execute; executed as the human, audited "admin X via Ask Admin"

This memo does **not** reclassify non-terminal/middle-bucket command provenance.
`#218` consumes #230; command-level ownership stays in `wf230`'s source/principal table (`248-264`) and
command table (`1826-1892`). `#218` only marks terminal and deferred-hard-gate behavior in this matrix and
keeps the human-commanded list as a v1 confirm-token candidate set, not a restated authority ledger.

The following were marked human-commanded-only in earlier drafts but are explicitly autonomous in wf230 and
must stay in non-confirm buckets unless #220 exposes a different transport surface:
- `DraftProposal` (autonomous) — `wf230:1826`
- `SubmitProposal` (autonomous) — `wf230:1827`
- `SubmitForReview` (autonomous) — `wf230:1881`
- `ValidateReady` (autonomous) — `wf230:1840`
- `ProposeRevision` (autonomous) — `wf230:1872`
- `AppendWorklog` / `CorrectWorklogByAppend` (autonomous) — `wf230:1839`
- `OpenAbsoluteStop` (autonomous) — `wf230:1849`
- `ResolveAbsoluteStop` (autonomous) — `wf230:1850`
- `OpenPolicyException` (autonomous) — `wf230:1844`
- `ExpirePolicyException` (autonomous) — `wf230:1847`
- `FinalizeCancelReviewHandoff` (autonomous) — `wf230:1886`
- `ConfirmGitHubIssueCreated` (autonomous) — `wf230:1829`
- `DispatchClaimRequested` (autonomous) — `wf230:1843`

`ReviewChangesRequested` is also explicitly **Reviewer-sourced and autonomous** (`wf230:263`) and therefore is **not
never-autonomous**; it consumes `#229` exit proof to move `Review` out to `Todo` (`wf230:1887`).

This is the only confirm-token set carried in §9 as an open question.

### 1C. Autonomous-allowed — agent may do without a confirm token

| Command | Authority |
| --- | --- |
| Reads (`opzava_tasks_list`, future `get`/search) | tool surface (`task-tools.ts:43-47`); read needs no gate (`authorization.ts` `action==='read'`) |
| Non-terminal field shaping (title/description/priority/labels on a **non-terminal** card) | wf230:253 ("all human-authorized shaping"), :257; `updateTask` (`tasks.ts:1659`) |
| Draft agent-discovered Proposals; `CreateBacklogDevTicket` **only from explicit human shaping** | wf230:257 (`DraftProposal`), `SubmitProposal`:wf230:1826-1827; `CreateBacklogDevTicket`:wf230:1834; DBF-006 |
| Lane moves into non-terminal lanes (Backlog↔Todo↔Blocked↔In-Progress), including the runner's `ClaimAndStart` for an eligible assigned Todo | wf230:255; wf230:1841-1853; DBF-023/031 |
| `ready.validate`, notifications, validation requests | wf230:255, :257 |

**Locked rule (#212, restated for the matrix):** autonomous actions never touch Done or
create-with-done, and the tool path never reaches Done at all. Everything in 1A is rejected or
system-owned.

## 2. Hard-gate enforcement locus

**Where the gate lives, exactly.** The gate is a **server-side, principal- and argument-level**
check that sits **below the tool-policy layer** and **between the existing generic `authorizeTask`
and the SQL mutation**, so that no caller — not the Ask Admin agent, not a direct web call, not an
MCP caller — can reach a terminal transition by passing only the role check (Decision 1; #253). On a
terminal status it **rejects + redirects**; it never authorizes a confirm-token-backed Done.

### 2A. The precise insertion points (reconciled with #253)

The guard intercepts **both** terminal-status code paths in
`packages/project-management/src/application/tasks.ts`:

1. **`moveTask` (`tasks.ts:1745`).** Today: `authorizeTask(input, "update", …)` at `:1774` →
   `withTenant` SQL `UPDATE ... SET status=` at `:1780-1807`. The guard runs **after**
   `authorizeTask` succeeds and **before** `withTenant`, inspecting `status.value` (`:1759`). If
   `status.value === 'done'` (or any future terminal lane), it **rejects** with
   `hardReason=done-is-system-owned` / `terminal-transition-requires-admit-done` and **redirects to
   governed `AdmitDone`** (Decision 3); the function returns before any SQL. This closes the #253
   update→done path by rejecting it, not by gate-and-allow.

2. **`createTask` (`tasks.ts:1386`).** Today: `parseTaskStatus(input.status ?? "todo")` at `:1395`
   → `authorizeTask(input, "create", …)` at `:1421` → insert loop at `:1426`. Per Decision 2 the
   guard rejects any create carrying a terminal status with `hardReason=create-with-terminal-status`
   before insert. This closes the #212 create-with-done path that #253's evidence names.

### 2B. Why it cannot live at the tool-policy or SOUL layer

- `ASK_ADMIN_TOOL_POLICY` is **per-tool, not per-argument** (`ask-admin-agent.ts:66-72`,
  `:253-259`). It can admit or deny `opzava_tasks_update` as a whole; it cannot distinguish
  `status:'todo'` from `status:'done'` inside one call. The #212 consensus states this directly:
  "Tool policy is per-tool, not per-argument — it cannot enforce 'autonomous never
  Done/approve-merge'. Enforce server-side in runtime-control/project-management,
  argument+principal-aware."
- SOUL/IDENTITY/AGENTS templates are claims, not controls (Non-Negotiable: "tool policy beats SOUL
  claims"; `ask-admin-agent.ts:146-236`).

### 2C. Where the principal the gate checks comes from

The guard does **not** need new principal plumbing — the verified identity is already in the
execution context (and this is the boundary #194 does **not** cover — see §3E):

- The web BFF derives the principal from a verified Better Auth session: `getAppSessionContext` →
  401 if null (`apps/web/app/api/tasks/ask-admin/turn/route.ts:619`; ADR-018:29), and
  `actingPrincipal(context)` builds it from `context.user.id` + `context.roleKeys`
  (`route.ts:265-273`).
- That principal becomes `ToolExecutionContext` via `toolExecutionContextFromSessionPrincipal`
  (`packages/runtime-control/src/application/assistant-conversation-lifecycle.ts:504-533`),
  carrying `actor: { userId, roleKeys }` (`assistant-conversation-lifecycle.ts:32-35, :40`) plus
  `sessionId`, `conversationId`, `assistantTurnId`, and an existing `commandIdempotencyKey`
  (`assistant-conversation-lifecycle.ts:49-55`).
- The tool runs **synchronously in the web BFF** on the agent's `tool.call` event
  (`route.ts:379-393` calls `runtime.executeRuntimeControlTaskTool` at `:388`). The broker is only
  the transport for the stream; tool execution is BFF-side, where the session is verified.

So the guard reads `context.actor` (verified admin) and, for non-terminal human-commanded actions
only, the **confirm token** (§3) from the tool-call envelope. For terminal status it needs neither —
it rejects unconditionally and redirects.

### 2D. Recommended shape

A single status-aware guard (`assertTerminalTransitionAuthorized`) invoked by both `moveTask` and
`createTask`, taking `(target, fromStatus→toStatus, context.actor, commandEnvelope)`. Keeping it in
`project-management` (the `withTenant`/SQL layer) — not in `runtime-control/task-tools.ts` —
guarantees every caller is gated, which is the #253 requirement ("enforced **below** the
tool-policy layer so a SOUL/tool-policy bypass cannot reach a terminal transition").

> The gate is **additive** to `authorizeTask`, not a replacement: RLS/role denial remains a hard 403
> (Non-Negotiable: "RLS denial is a hard 403, never an empty result"; `authorization.ts:35-50`
> tenant/org/workspace-mismatch). The gate adds the *transition-class* decision on top — and for
> terminal status that decision is **reject + redirect to `AdmitDone`**.

## 3. Human-command envelope + confirm-token contract

> **Corrected scope.** A confirm token is **not** a Done-writer (Decision 3). It is wf230's
> single-use exception/authorization record (the `PolicyExceptionRequest` shape), scoped to the Ask
> Admin in-chat flow, and — in v1 — relevant **only to non-terminal human-commanded actions** (§1B),
> if any. The contract below governs the token's shape, atomic consumption, and the principal it is
> bound to; whether v1 actually mints one is the §9 open question.

### 3A. Envelope fields (what attests a human-commanded action)

Carried alongside the existing `ToolExecutionContext` (`assistant-conversation-lifecycle.ts:49-55`)
and validated by the §2 guard:

| Field | Source / meaning |
| --- | --- |
| `actingPrincipal` | verified `userId` + `roleKeys` from the Better Auth session (`route.ts:265-273`, `assistant-conversation-lifecycle.ts:32-35`). This is "admin X". |
| `source` | `human-commanded` vs `autonomous`. **BFF-minted from the presence/absence of a consumed confirm token — never the agent's self-classification** (policy beats SOUL; wf230:271-272 "role labels in a request body are audit metadata only after they match the authenticated principal"). For Done, `source` is irrelevant — the tool path rejects regardless. |
| `confirmToken` | single-use, scoped, expiry-bound token minted only on the admin's explicit in-chat confirm (§3B). Absent ⇒ source is autonomous. **Never sufficient for Done.** |
| `scope` | exact target + action binding, e.g. `{ taskId, action:'ready.approve' }` for a non-terminal human-commanded action. A scope of `{ toStatus:'done' }` is itself rejected (1A). |
| `commandIdempotencyKey` / `commandId` | already present (`assistant-conversation-lifecycle.ts:54`); aligns with wf230's idempotency/command identity (wf230:215-239, :396-402). |
| `authorizationVersion` | wf230 envelope field (wf230:224), for policy re-evaluation on replay. |

This maps directly onto wf230's **trusted command envelope** (wf230:206-244):
`principalAuthorizationRefs[]`, `sourceAuthorizationRefs[]` (`sessionId`, optional
`machineEnrollmentId`/`keyAuthorizationId`), `authorizationVersion`, `idempotencyKey`, `commandId`
(wf230:215-224).

### 3B. Confirm-token semantics = wf230's "Needs Human Approval Request" / `PolicyExceptionRequest`

The confirm token is not a new invention — it is wf230's exception record, scoped to the Ask Admin
in-chat flow:

- **Shape:** "exact target/action/contract/policy binding, safe reason/scope, requester/source,
  state, **approver/nonce/expiry, revocation and one-use consumption refs**" (wf230:144).
- **Single-use:** "the single-use authorization token/ref consumed by the eventual retried command
  when approved" (wf230:287). The §2 guard consumes the token atomically with the governed state
  change; a second use is a conflict (§5).
- **Approver:** "the enrolled Admin/Human Owner permitted by policy" (wf230:292). For Ask Admin that
  is the verified acting admin (`route.ts:265-273`).
- **Binding:** nonce + exact version/hash + expiry + audit, matching DBF-193 ("Slack workflow
  approvals require enrolled Admin identity, one-time nonce, exact version/hash, expiry, and
  audit"). For Ask Admin the channel is the in-chat confirm riding the existing
  `operator.approvals` scope (§3D) rather than Slack, but the binding contract is identical.

### 3C. Atomic consumption — ONE transaction, not consume-then-mutate

**Token consumption is atomic with the mutation AND the accepted-ledger write, in a single
transaction.** This is mandatory (not a #220 optimization):

- wf230: "The retry **consumes the exception token in the same transaction as the governed state
  change**" (wf230:299-301).
- The accepted command row is written to the **Dev Board activity/history ledger** in that same tx
  (DBF-174, `dev-board-foundation-decisions.md:285` — accepted commands only).
- **On any failure after the token is presented (precondition fail, commit error, state
  invalidation), the entire transaction rolls back:** the token is **not** consumed, **no** mutation
  is applied, **no** accepted-ledger row is written. There is no "consume-then-mutate" window that
  could lose a token or half-apply a transition (§5 commit-failure rollback).
- Rejected attempts consume **no** token and write **no** activity-ledger row; they go to the
  security/telemetry sink instead (§4, wf230:394-395: "An authentication/authorization denial never
  claims an idempotency key and never exposes an existing result").

### 3D. What "admin X via Ask Admin" concretely requires

1. A **verified, enrolled admin session** at the BFF (`route.ts:619` 401-gate; ADR-018:29). This is
   admin X.
2. The action **attributed to `context.user.id`** (the verified admin), never to a caller-supplied
   id (SOUL: "Authority comes only from the Opzava server session," `ask-admin-agent.ts:171-172`).
3. For a non-terminal human-commanded action: a **confirm token** minted only when admin X explicitly
   confirms in-chat — the agent's proposal becomes an `approval.requested`, the admin's confirm mints
   the token, the retried `tool.call` carries it.
4. The token **bound to admin X** (principal-bound); a token minted for admin A must not satisfy a
   call made under admin B (§5 principal mismatch).
5. An **audit row** in the correct sink — accepted actions to the activity ledger as
   `source=human-commanded`, `actingPrincipal=admin X`, label `"admin X via Ask Admin"`, and the
   consumed-token ref; rejected/bypass attempts to the security/telemetry sink (§4).

### 3E. Reconciliation with #194 / #222 / ADR-018 Option 0 (principal trust)

This is the load-bearing reconciliation, sharpened to qualify #222 correctly.

- **#194 gates authority that crosses/trusts the BROKER assertion — NOT this BFF-local tool
  execution.** #194 ("the broker trusts caller-asserted principals") is about the gateway-broker
  authenticating the service token and then *shape-checking* a request-body principal it never
  verifies (#194; `apps/gateway-broker/src/internal/http-server.ts:145`). The hard gate runs in the
  **web BFF** under a **verified Better Auth session** (`route.ts:619`, `:265-273`; `:388`), where
  the broker is only the stream transport. That execution never trusts a broker-asserted principal,
  so **#194 does not gate it** and does not need to resolve before the gate ships.
- **#222 qualified accordingly.** #222's open question — "does the in-chat confirm for the two hard
  gates require anything beyond an authenticated admin session (e.g. step-up)?" — **collapses under
  the correction**: (a) Done cannot be written via the tool path at all, so there is no
  Done-confirm to step up for; (b) the BFF-local session is already verified, so for any non-terminal
  human-commanded action the confirm needs only the enrolled-admin session + principal-match + expiry
  — **no step-up** (Decision 5). Step-up stays reserved for credential/blast-radius actions routed to
  the Secure Admin UI (DBF-118; #222).
- **ADR-018 Option 0 reliance.** ADR-018 recommends **Option 0 — delete the four unread principal
  fields** from the broker principal, because the broker only shape-checks them and verifies nothing
  (`docs/adr/ADR-018-web-broker-principal-trust.md:7, :39, :64-68`); its stated consequence: **"the
  BFF holds the verified session and should own user-level observability"** (ADR-018:107). The hard
  gate relies on exactly that split: confirm-token mint/verify stays BFF-side, never broker-side
  (ADR-018:7/39). Option 0 alone is not a principal-trust guarantee — it removes the trap; it does
  not *verify* identity (ADR-018:68). If a future topology shares `BROKER_INTERNAL_TOKEN` across a
  fleet, only Option 3 (per-tenant scoped token) constrains it (ADR-018:50, :76-78). For v1 (one
  broker, one token, BFF-side execution) the BFF-verified session is sufficient; the gate still
  **fails closed** if that session cannot be established (§5).

**Net (Q8, locked as a #218-side statement):** #218 does **not** require resolving #194 before
building the gate. It requires stating that the principal is verified **at the BFF/tool-execution
layer, not the broker** — a vote *for* ADR-018 Option 0's attribution split, not against it, and
#222's step-up question collapses to "no step-up; and Done has no tool-path confirm at all." The
Option 3 fleet follow-through is an open item for #220 only if per-tenant brokers materialize.

## 4. Audit record shape — TWO sinks (corrected)

> **Correction.** The earlier draft wrote "one row per gated attempt (accepted **or** rejected)" to
> the **Dev Board activity/history ledger**. That is wrong. DBF-174 is explicit: the activity/history
> ledger "records **accepted** product commands, transitions, assignments, dependencies, approvals,
> comments, Review verdicts, and Done facts" (`dev-board-foundation-decisions.md:285`) — **accepted
> only**. Rejected/bypass attempts are **security/telemetry events**, not activity history, and go to
> a **separate sink**. None of the four ledgers (ADR-017:533-545) is a "rejected-attempts" ledger,
> which confirms rejected attempts do not belong in the activity/history ledger.

### 4A. Sink 1 — Dev Board activity/history ledger (ACCEPTED only; DBF-174)

One row per **accepted** gated command, consistent with the observation binding DBF-226
("bind source/receipt/actor/version plus `observedAt`/`evaluatedAt`/`validUntil`",
`dev-board-foundation-decisions.md:362`) and wf230's audit-metadata rule (wf230:271-272).

| Field | Value / notes |
| --- | --- |
| `action` | the transition/command, e.g. `task.update(status=todo)`, `ready.approve`; **never** `task.move(done)` (rejected) |
| `source` | `autonomous` \| `human-commanded` (BFF-minted from token presence, §3A) |
| `actingPrincipal` | verified `userId` + `roleKeys` + `sessionId` (`route.ts:265-273`, `assistant-conversation-lifecycle.ts:32-35`); for human-commanded, the label resolves to **"admin X via Ask Admin"** |
| `target` | `taskId`/cardId, `fromStatus → toStatus` (non-terminal), exact ref |
| `confirmTokenRef` | nonce, scope, expiry, `consumedAt` (one-use, wf230:144/287); `null` for autonomous attempts |
| `authorizationVersion` | policy version evaluated (wf230:224) |
| `commandId` / `idempotencyKey` | command identity (wf230:215-239; `assistant-conversation-lifecycle.ts:54`) |
| `observedAt` / `evaluatedAt` | timestamps (DBF-226) |

### 4B. Sink 2 — separate security/telemetry sink (REJECTED / BYPASS attempts)

Every **rejected** or **bypass** attempt on a gate produces exactly one record here — never in the
activity/history ledger. This is the non-negotiable regression check the #218 readiness review
demands ("proving no `done`/`approve-merge` without confirm-token and principal-match"), and these
are exactly the attempts the gate exists to refuse:

| Field | Value / notes |
| --- | --- |
| `attemptedAction` | the rejected command, e.g. `task.move(done)`, `task.create(done)`, a forged-token Done attempt |
| `actor` | verified `userId`/`roleKeys` when known; `unknown` for forged/no-session |
| `source` | `autonomous` (default) \| `human-commanded-claimed` (a `source` marker with no valid consumed token — itself a violation, §5 S6) |
| `target` | the `taskId`/transition the caller tried to reach |
| `hardReason` | the guard's decision rationale — closed vocabulary (§5) |
| `decision` | `rejected` (always, in this sink) |
| `confirmTokenRef` | the presented (invalid) token ref if any: expired, already-consumed, principal-mismatched, forged, or absent |
| `observedAt` | timestamp |

**Invariant (corrected):** every gate attempt produces **exactly one record in the appropriate
sink** — accepted → activity/history ledger (4A); rejected/bypass → security/telemetry sink (4B).
Accepted and rejected attempts are **never mixed** in one ledger. The exact persistence target for
the security/telemetry sink (the observability/remediation surface, PRD-012/PRD-018/ADR-013) is a
#220 implementation detail; the **ownership split** is the contract locked here.

## 5. Sad paths & edge cases (FIRST-CLASS)

Each rejects **server-side, below tool policy, with exactly one record in the security/telemetry sink
(§4B)** and **no state mutation** and **no token consumption**. The closed `hardReason` vocabulary:

| # | Scenario | Inputs | `hardReason` | `decision` |
| --- | --- | --- | --- | --- |
| S1 | Autonomous attempt on a gated transition | `opzava_tasks_update { status:'done' }` with no confirm token | `done-is-system-owned` (redirect to `AdmitDone`) | rejected |
| S2 | **Tool-path Done attempt always rejects + redirects (corrected happy path)** | admin confirms in-chat → token minted → retried `tool.call { status:'done' }` carries token + verified principal — **still rejected**: no tool path writes Done | `done-is-system-owned` / `terminal-transition-requires-admit-done` | rejected (redirect to governed `AdmitDone`) |
| S3 | Principal mismatch | token bound to admin A, call under admin B's session (or agent with no admin) | `principal-mismatch` | rejected |
| S4 | Create-with-terminal-status | `opzava_tasks_create { status:'done' }` | `create-with-terminal-status` | rejected |
| S5a | Expired token | token `validUntil` exceeded | `confirm-token-expired` | rejected |
| S5b | Replayed token (vs. idempotent retry) | consumed token presented a second time → `confirm-token-conflict`; an **intentional retry after a state change must use a NEW key/nonce** (wf230:410-411) — replaying the same consumed token is never a valid retry | `confirm-token-conflict` | rejected |
| S6 | Forged-token source | unknown/fabricated confirm token, or a `source=human-commanded` marker with no valid consumed token | `autonomous-attempt-on-gated-transition` | rejected |
| S7 | Principal-binding absent | token has no `adminId` binding, or actor missing | `principal-binding-absent` | rejected |
| S8 | Malformed expiry | token expiry non-finite/malformed | `confirm-token-expired` | rejected |
| **S9** | **Valid token + invalid DevTicket state** | token valid + principal matches, but the target is not in a state the action admits (e.g. a non-terminal action on a terminal/locked card, or — for Done — no verified merge / no #229 proof) | `invalid-target-state` | rejected |
| **S10** | **State change after confirm invalidates the token** | between mint and consume, a material revision / merge-state / version change occurs (wf230:295-297: "Material target/contract or policy change, approver-role revocation, nonce replay, or expiry invalidates the request before use") | `confirm-token-invalidated` | rejected |
| **S11** | **Commit-failure rollback** | the atomic consume+mutate+ledger tx fails to commit (DB error, precondition fail mid-tx) | (none persisted — tx rolled back) | token **unconsumed**, no mutation, no ledger row; retried with a fresh attempt |
| **S12** | **Confused confirmation** | admin confirms a proposal intending target A, but the token is presented for target B (scope/target mismatch), or the admin confirms an action whose semantics they misread | `principal-mismatch` / `confirm-token-invalidated` (scope bound to the wrong target) | rejected |

Authoritative citations for the sad-path contract:

- **Tool-path Done (S1, S2):** DBF-028 ("No direct In Progress-to-Done transition exists"); wf230:1525-1547
  (AdmitDone system-owned; nothing invokes Done directly); ADR-017:101-103; PRD-019:27-28; #253.
  **A confirm token never changes S1/S2's outcome** — the tool path cannot write Done.
- **Autonomous/missing-token (S1, S6):** wf230:255/260 ("Never grants: Done"); #212; #253. The token's
  absence is what makes `source` autonomous (§3A) — a `source` marker supplied without a valid
  consumed token is itself a policy violation.
- **Expired (S5a, S8):** wf230:144 (expiry); DBF-193; DBF-226 (`validUntil`).
- **Replay vs. retry (S5b):** single-use consumption (wf230:287, :299-301) + idempotency/concurrency
  contract (wf230:383-415). **wf230:410-411 is decisive:** "After an authorized reservation, a
  domain-policy/precondition rejection is terminal for that key. A caller that intentionally retries
  after state changes uses a **new key**." So a rejected attempt never reuses its key/nonce; replaying
  a consumed token is `confirm-token-conflict`, not a retry. Optimistic aggregate-version mismatch also
  rejects (wf230:296, :419+).
- **Principal mismatch (S3) / confused confirmation (S12):** analogous to wf230's hard 403 on
  tenant/workspace mismatch (wf230:388) and `authorization.ts:35-50` mismatch denials; also blocks
  token-lending between admins. S12 adds the scope-bound-to-wrong-target case.
- **Valid token + invalid state (S9):** the gate re-checks target state under lock (wf230:419+,
  optimistic/pessimistic concurrency on every mutable record it relies on for authority); for Done
  specifically, no verified merge / no #229 proof ⇒ `AdmitDone` itself rejects (wf230:1525-1547,
  :492-498, :1956).
- **State-change-after-confirm (S10):** wf230:295-297 invalidates the exception on material
  target/contract/policy change, approver-role revocation, nonce replay, or expiry.
- **Commit-failure rollback (S11):** atomicity (§3C, wf230:299-301); wf230:394-395 ("an
  authentication/authorization denial never claims an idempotency key and never exposes an existing
  result") — a failed tx leaves the token unconsumed and writes nothing.
- **Principal-binding absent (S7):** the guard fails closed before any principal comparison when the
  token carries no binding or the actor is missing (prototype FIX 2).
- **Create-with-terminal (S4):** Decision 2; #212; DBF-030.
- **Principal-trust unavailable (fail closed):** if the BFF cannot establish a verified session
  (`getAppSessionContext` null → `route.ts:619` 401), or — under a future Option 2 — a signed
  assertion cannot be verified, **never fall back to trusting an unverified claim.** #194;
  ADR-018:68/107.

> Two sad paths remain **deferred with approve-merge (v1 out of scope)** and are not exercised by the
> prototype: *approve-merge without Review Exit Containment Proof* (wf230:155; #229; ADR-017:331-332)
> and *self-approve Review* (wf230:150, :263). They remain target contract for when #229 lands.

## 6. Prototype outcome (the runnable evidence)

A **throwaway demonstrator** at `prototypes/wf218-hard-gate/` proves the corrected gate contract
end-to-end on DevTicket-shaped state, with no DB, no network, and no repo dependencies. Run with
`node prototypes/wf218-hard-gate/demo.mjs`. It answers one design question: *can a server-side,
argument+principal-level gate keep the Ask Admin tool path from ever writing Done, admit Done only
through a proof-gated system command, and audit both truthfully?*

> **Contract correction applied.** An earlier version of the demonstrator encoded the wrong Done
> contract — a human confirm token *directly wrote Done*. A completeness audit (Codex gpt-5.6-sol)
> and a matrix audit (DeepSeek v4 Pro) caught this; per Decision 3 / wf230:1525-1547 no tool path
> writes Done. The prototype was **reworked to the corrected model and committed** (`028ec317`): the
> tool path can never write Done (reject + redirect to `AdmitDone`), `AdmitDone` is system-owned and
> proof-gated, consume+mutate+ledger is one atomic unit, and the audit uses two sinks. The corrected
> scenarios (S1–S7) are in §6B; all pass (`exit=0`), independently re-run.

### 6A. What the prototype models (still valid)

1. `authorizeTask(action)` remains generic and permissive by design (always pass for `member`),
   while a dedicated status-aware guard enforces terminal-hard-gate behavior — the gate is below
   `authorizeTask`, not a replacement for it (§2D).
2. `moveTask` and `createTask` both run `authorizeTask(...)` → `assertTerminalTransitionAuthorized`
   → mutation only when allowed.
3. A single-use confirm-token model bound to task + target action + admin principal + expiry.
4. Gate audit records for accepted and rejected attempts (the **two-sink split** is the rework — §6C).
5. Sad-path behavior first (§5): missing token, expired token, consumed-token replay, principal
   mismatch, terminal-create rejection, forged source, absent binding, malformed expiry.

### 6B. Scenario results (`prototypes/wf218-hard-gate/RESULTS.md`) — corrected model

Seven passing scenarios (`exit=0`, independently re-run) on the corrected authority model:
- **S1** tool-path autonomous direct-Done → rejected (`done-requires-admit-done`), no mutation.
- **S2** tool-path human-token direct-Done → **still rejected**, token **retained** (necessary-but-not-sufficient).
- **S3** create-with-done → rejected outright (`create-with-terminal-status`).
- **S4** `AdmitDone` with incomplete proofs → rejected fail-closed (per-proof `hardReason`).
- **S5** `AdmitDone` with the full proof chain → accepted exactly once (the ONLY Done path).
- **S6** `AdmitDone` post-authorization failure → atomic rollback of status **and** ledger.
- **S7** confirm-token mechanics (single-use CAS, scope/principal/expiry) on a representative non-terminal action.

Two audit sinks: accepted commands → activity ledger (2 rows); rejected/bypass attempts → security sink (11 rows).

### 6C. What the corrected prototype demonstrates (carried to #220)

The rework (committed `028ec317`) encodes the corrected contract:

1. **Tool path cannot write Done.** `moveTask(done)` and `createTask(done)` ALWAYS reject
   (`done-requires-admit-done` / `create-with-terminal-status`) and redirect to governed `AdmitDone`
   — **even with** a valid confirm token + verified principal; the token is not consumed (S1/S2/S3;
   wf230:1525-1547, :1546-1547).
2. **`AdmitDone` + proofs.** Done is admitted ONLY by a system-actor `AdmitDone` from `review`,
   consuming ready approval + the #229 Review Exit Containment Proof + governed merge authorization +
   verified merge into `development`; any missing proof fails closed (S4/S5; wf230:1525-1547, :1888,
   :492-498). #229's exact proof schema remains a named dependency the real `AdmitDone` must consume.
3. **Two sinks.** Accepted commands → activity/history ledger (DBF-174); rejected/bypass attempts →
   the separate security/telemetry sink (S1–S4, S7; §4B).
4. **Atomicity.** Mutation + accepted-ledger write commit as ONE unit; a post-authorization failure
   rolls back both (S6; wf230:299-301).

> **Known prototype limitation (DeepSeek WARNING, non-blocking).** The demonstrator's raw `moveTask`
> gates only Done; non-terminal lane moves are ungated (autonomous-allowed per §1C), while the
> token-gated path is illustrated separately on a representative action. A real deployment routes any
> confirm-token-required non-terminal action through the same guard — see §9's open question on which
> v1 actions require a token.

### 6D. Review hardening (DeepSeek + Codex-sol) — fixes that still hold

The demonstrator was hardened after concurrent DeepSeek + Codex-sol review; these fixes remain valid
for the gate mechanics (`prototypes/wf218-hard-gate/README.md`):

- **FIX 1:** `appendAudit` takes explicit `source`; `source` is computed inside the guard from the
  validated token binding and never inferred from envelope presence (closes the "agent self-labels
  human-commanded" hole; §3A).
- **FIX 2:** principal binding is fail-closed before comparison — `principal-binding-absent` when
  `adminId` is missing or actor is missing; `mintConfirmToken` now requires `adminId` (S7).
- **FIX 3:** expiry validation is finite-only; malformed/non-finite expiry rejects as
  `confirm-token-expired` (S8).
- **FIX 4:** token consume is an atomic claim (`consumeConfirmToken`) returning `null` for
  already-consumed tokens; replay rejects as `confirm-token-conflict` (S5b). *(Rework note: the
  consume must also share the tx with the mutation + accepted-ledger write — §3C, §6C.4.)*
- **FIX 5:** every guard outcome includes `source`, and every guard attempt writes exactly one
  record (the rework routes it to the **correct** of the two sinks — §6C.3).
- **FIX 6:** create status checks enforce `CREATE_ALLOWED_STATUSES`; `done` is rejected as
  `create-with-terminal-status` (Decision 2; S4).

### 6E. Mapping to real insertion points

The prototype's pieces map 1:1 onto the real code paths named in §2A
(`prototypes/wf218-hard-gate/README.md` "Mapping to REAL insertion points"):

| Prototype piece | Real insertion point |
| --- | --- |
| `authorizeTask(action)` placement | `tasks.ts:1774` (moveTask), `tasks.ts:1421` (createTask) — keep existing role check as-is; gate below it |
| `assertTerminalTransitionAuthorized(...)` | before `withTenant` at `tasks.ts:1780-1807` (move) and before insert at `tasks.ts:1426` (create); both terminal cases now **reject + redirect** to `AdmitDone` |
| `approval.requested` placeholder | `apps/web/app/api/tasks/ask-admin/turn/route.ts:423-425` — where confirm-token mint/consume wiring plugs in for non-terminal human-commanded actions (#220, subject to §9) |

### 6F. Explicitly out of scope for the prototype

Real Postgres/Prisma persistence, real OpenClaw `exec.approval.requested` transport beyond the
placeholder mapping, the full wf230 command envelope/aggregate (`ReviewApproval`,
`PolicyExceptionRequest`, `ExecutionLease`, four-ledger writes), the #229 independent Review + Review
Exit Containment Proof, **`AdmitDone` and the governed merge-authorization chain**, `approve-merge`,
step-up auth, and the Slack approval channel. The prototype stands up **only** the gate +
confirm-token + two-sink audit against the existing `moveTask`/`createTask`/
`authorizeTask` shape, to de-risk the contract before #220 assembly.

## 7. Locked decisions and how the open questions resolved

| Research question | Resolution | Disposition |
| --- | --- | --- |
| Q1 — Step-up auth for Done? | **No step-up for v1** (Decision 5). And Done has no tool-path confirm at all (Decision 3), so #222's step-up question collapses. Step-up reserved for credential/blast-radius actions (DBF-118; #222). | LOCKED |
| Q2 — What is approve-merge in Ask Admin? | **Out of scope for v1** (Decision 4). No merge tool ships; the #229 binding lands with #229. **#218's body needs an explicit amendment** (§8B). | LOCKED |
| Q3 — Gate locus precision? | Dedicated guard `assertTerminalTransitionAuthorized` in `project-management`, called by both `moveTask` and `createTask`, all callers (Decision 1; §2). On terminal status it **rejects + redirects**, never gate-and-allows. | LOCKED |
| Q4 — Confirm-token transport? | Ride `approval.requested`/`operator.approvals` for the confirm UX; carry the consumed token ref in the tool-call envelope for the guard (§3D). **But whether v1 needs a confirm token at all is now OPEN** (§9). | **REOPENED → §9** |
| Q5 — Autonomous vs human-commanded anchoring? | Valid consumed token present ⇒ `human-commanded`; else `autonomous`. BFF-minted from token binding, never the agent's self-label (prototype FIX 1; §3A). | LOCKED |
| Q6 — Create-with-done: gate or reject? | **Reject outright** (Decision 2; DBF-030). No "born Done" card. | LOCKED |
| Q7 — Review-lane interplay? | Review admission is system-controlled (DBF-031); Review is mandatory (DBF-028). Done is system-owned via `AdmitDone` (Decision 3); the tool path never reaches Done or Review-entry. Review-entry gating depends on #229. | **Carried to #220** |
| Q8 — Principal-trust dependency on ADR-018? | No #194 prerequisite for v1. #194 gates broker-crossing authority, not this BFF-local execution (§3E). Principal verified BFF-side, consistent with Option 0 (ADR-018:107-108). Option 3 fleet follow-through only if per-tenant brokers materialize. | LOCKED (as #218-side statement) |

## 8. Open items carried to #220

#220 (assembly) inherits the implementation work this memo deliberately leaves unbuilt.

### 8A. The FOUR artifacts #218 hands #220

#218's deliverable to #220 is four concrete artifacts, each fully specified by this memo:

1. **Ask Admin overlay on #230's source/command table.** The §1 matrix as an Ask-Admin-specific
   overlay on wf230's exhaustive source/principal table (wf230:248-264), marking each row
   *autonomous-allowed* (§1C), *human-commanded-only / confirm candidate* (§1B), or
   *never-reachable-from-tool-path* (§1A — Done/approve-merge/create-with-done).
2. **Corrected terminal rule.** No direct In-Progress→Done (DBF-028); Done is system-owned via
   `AdmitDone`, disabled until #229 and requiring the #229 Review Exit Containment Proof + governed
   merge authorization + verified merge into `development` (wf230:1525-1547); nothing invokes Done
   directly (wf230:1546-1547); `moveTask(done)`/`createTask(done)` always reject + redirect
   (Decision 3); create-with-done is rejected outright (Decision 2).
3. **Transactional confirmation protocol.** Single-use confirm token (wf230:144, :287); consume +
   mutation + accepted-ledger write in ONE transaction (§3C; wf230:299-301); retry-vs-replay
   (wf230:410-411 — rejected attempt is terminal for the key; intentional retry uses a new key);
   invalidation on material state change (wf230:295-297); principal-bound nonce + version/hash +
   finite expiry (DBF-193).
4. **Ledger/error ownership + acceptance tests.** Two sinks: activity/history ledger = accepted
   commands only (DBF-174); rejected/bypass attempts → separate security/telemetry sink (§4B). The
   acceptance tests must prove the split — accepted attempts appear in the activity ledger and
   nowhere else; rejected/bypass attempts appear in the security sink and **nowhere in the activity
   ledger** — plus the §5 sad-path vocabulary (S1–S12), atomic rollback (S11), and retry-vs-replay
   (S5b).

### 8B. #218 body amendment / defer target (explicit)

#218's body frames "an in-chat confirm step for the two hard gates (Done / approve-merge)"
([#218](https://github.com/anthonykewl20/opzava/issues/218)). This memo's correction means that frame
needs an **explicit amendment** recorded on the issue (or its #220 synthesis):

- **approve-merge** is deferred to #229 (Decision 4; ADR-017:331-332) — not a v1 hard gate.
- **Done** is system-owned via `AdmitDone` and **unreachable from the tool path** in v1 (Decision 3;
  wf230:1525-1547) — so there is no in-chat "confirm writes Done" for v1.
- The "two hard gates" therefore **collapse to one for v1 (Done)**, and that one is not writable via
  Ask Admin until #229 ships `AdmitDone`. The remaining confirm-token work, if any, is for
  non-terminal human-commanded actions (§1B) and is gated on the §9 open question.

### 8C. Implementation items

1. **Confirm-token wire-up (subject to §9).** Mint on `approval.requested` at
   `apps/web/app/api/tasks/ask-admin/turn/route.ts:423-425` (currently a no-op), consume atomically
   (with mutation + accepted-ledger write) on the retried `tool.call` — **only if** §9 resolves that
   some v1 action needs it. The transport design is set (§3D); the wiring is not.
2. **Real guard in `project-management`.** Land `assertTerminalTransitionAuthorized` at the §2A
   insertion points (`tasks.ts:1745`/`:1386`) with the closed `hardReason` vocabulary (§5),
   **rejecting + redirecting** terminal status, plus real audit writes to the correct sink (§4).
3. **Two-sink audit wiring.** Accepted → Dev Board activity/history ledger (DBF-174/DBF-226);
   rejected/bypass → the security/telemetry sink (§4B).
4. **Mirror the corrected prototype.** The real implementation must reproduce what the corrected
   demonstrator already shows (`028ec317`; §6C): tool path cannot write Done, `AdmitDone`+proofs,
   two sinks, and atomic consume+mutate+ledger.
5. **Review-lane interplay (Q7).** How the gate composes with #229's system-controlled Review
   admission (DBF-028/031).
6. **`approve-merge` + #229.** The `ReviewMergeAuthorization` / Review Exit Containment Proof binding
   (wf230:154-155; ADR-017:331-332) and its two deferred sad paths (§5) — lands when #229 lands.
7. **Aggregate migration.** Mapping the gate onto the eventual wf230 `DevTicket` aggregate when it
   replaces the legacy `Task` (wf230; #237), preserving the "every caller is gated" property through
   the expand-contract cutover.
8. **ADR-018 fleet follow-through.** Option 3 per-tenant scoped `BROKER_INTERNAL_TOKEN` only if
   per-tenant brokers materialize (ADR-018:50, :76-78); not blocking v1.
9. **Step-up auth (reserved).** Password/TOTP/passkey step-up for credential/blast-radius actions
   routed to the Secure Admin UI (DBF-118); explicitly **not** Done (which has no tool-path confirm).

## 9. Open question — which v1 Ask-Admin actions (if any) require a confirm token?

The Done correction reopens Q4. **Given that Done is system-owned and unreachable from the tool path
(Decision 3) and approve-merge is deferred (Decision 4), it is no longer obvious that any v1 Ask
Admin action needs a confirm token at all.** Two outcomes are both defensible and must be decided
before #220 cuts the confirm-token slices:

- **(a) None in v1 — defer all confirm-token machinery to #229/#220.** If the v1 tool surface
  (`opzava_tasks_{list,create,update}`) only does autonomous-allowed reads/shaping (§1C) and the
  human-commanded actions in §1B are not yet exposed through Ask Admin, then no v1 action needs an
  in-chat confirm token; the gate only needs to reject terminal status and redirect. This is the
  leaner v1.
- **(b) Non-terminal human-commanded actions need one.** If v1 surfaces any §1B action through Ask
  Admin (e.g. a `ready.approve` or exception decision relayed by the agent), then the confirm-token
  contract (§3) applies to **those** actions — necessary-but-not-sufficient for the governed state
  change, never for Done.

This question folds into #222 (whose step-up question already collapses to "no") and must be
resolved against the locked v1 tool policy (`ask-admin-agent.ts:43-47`) before #220. Until resolved,
the gate ships the **reject+redirect** behavior regardless (it does not depend on the answer).

## Anti-patterns — what this gate must not decay into

| Anti-pattern | Why it fails |
| --- | --- |
| Let a confirm token write Done (the corrected error) | No direct In-Progress→Done exists (DBF-028); Done is system-owned via `AdmitDone`, disabled until #229 and requiring #229 proof + governed merge auth + verified merge (wf230:1525-1547); "a UI drop, GitHub label, agent, or stale projection cannot invoke Done directly" (wf230:1546-1547). A confirm token is necessary-but-never-sufficient. |
| Enforce Done/approve-merge at tool-policy or SOUL layer only | tool policy is per-tool, not per-argument (`ask-admin-agent.ts:66-72`); SOUL is a claim, not a control — a bypass can still reach `UPDATE tasks SET status='done'` (#212; #253) |
| Trust the agent's self-classified `source` field | the agent decides tool calls autonomously; `source` must be BFF-minted from a consumed token or it is `autonomous` (prototype FIX 1; wf230:271-272) |
| Gate create-with-done instead of rejecting it | manufactures a "born Done" card that bypasses Review+merge; no legitimate case exists (DBF-030; Decision 2) |
| Consume the token, then mutate in a separate step | token consumption must be atomic with the mutation AND the accepted-ledger write in ONE transaction (wf230:299-301); a consume-then-mutate window can lose a token or half-apply a transition (S11) |
| Write rejected/bypass attempts to the activity/history ledger | DBF-174 records accepted commands only; rejected/bypass attempts are security/telemetry events in a separate sink (§4) |
| Push confirm-token mint/verify into the broker | the broker only shape-checks principal fields and verifies nothing (ADR-018:7/39); the verified session lives BFF-side (ADR-018:107-108); #194 gates broker-crossing authority, not this BFF-local execution (§3E) |
| Reuse a confirm token across transitions, admins, or after a state change | breaks single-use consumption (wf230:287/299-301) and principal binding (DBF-193); material change invalidates it (wf230:295-297); enables token-lending/replay (S5b) |
| Treat a replayed token as an idempotent retry | a rejected attempt is terminal for its key; an intentional retry must use a NEW key/nonce (wf230:410-411); replay is `confirm-token-conflict` (S5b) |
| Fall back to an unverified principal when the session is absent | must fail closed — `principal-trust-unavailable` / `principal-binding-absent`, never a silent allow (#194; ADR-018:68) |
| Ship v1 `approve-merge` without #229's Review Exit Containment Proof | "permission to admit Done without the matching confirmed dispatch [is never granted]" (wf230:155; ADR-017:331-332) |
| Replace `authorizeTask` with the gate | the gate is additive; RLS/role denial stays a hard 403, never an empty result (`authorization.ts:35-50`) |

## Downstream delivery constraints

#220 (assembly) must preserve these constraints when landing the gate in production code:

1. Put the guard in `packages/project-management` (the `withTenant`/SQL layer), invoked by **both**
   `moveTask` (`tasks.ts:1745`) and `createTask` (`tasks.ts:1386`), so every caller — agent, direct
   web, MCP task-tool — is gated (the #253 requirement).
2. **On terminal status, REJECT + REDIRECT to governed `AdmitDone` — never gate-and-allow.** A
   confirm token must not make `moveTask(done)` or `createTask(done)` succeed (Decision 3;
   wf230:1525-1547). Reject create-with-done outright (`create-with-terminal-status`).
3. If §9 resolves that a v1 action needs a confirm token: mint it BFF-side on `approval.requested`,
   bind it to the verified acting admin + exact non-terminal `{ taskId, action }` scope + finite
   expiry, and **consume it atomically with the mutation AND the accepted-ledger write in one
   transaction** (wf230:299-301); a second use is `confirm-token-conflict`; an intentional retry
   after a state change uses a new key/nonce (wf230:410-411).
4. Derive `source` only from the consumed-token binding inside the guard — never from an envelope
   field the caller could set.
5. Fail closed on every principal-trust gap (`principal-mismatch`, `principal-binding-absent`,
   `principal-trust-unavailable`, `confirm-token-expired`); never allow on unverified evidence.
6. **Two sinks:** write exactly one record per attempt in the **correct** sink — accepted → Dev Board
   activity/history ledger (DBF-174); rejected/bypass → the security/telemetry sink (§4B). Never mix.
7. Keep `approve-merge`, `AdmitDone`/#229 proof binding, step-up auth, and real OpenClaw transport
   out of v1 scope; do not half-wire them.
8. When the wf230 `DevTicket` aggregate replaces the legacy `Task`, carry the guard forward so the
   "every caller is gated" property survives the expand-contract cutover.

## Resolution

#218 is resolved by the server-side, argument- and principal-aware gate below tool policy that
**rejects + redirects** every terminal transition (Decision 1), the outright rejection of
create-with-terminal-status (Decision 2), the **system-owned `AdmitDone` contract that makes Done
unreachable from the tool path** (Decision 3 — the corrected contract), the v1 deferral of
approve-merge with an explicit #218-body amendment (Decision 4), and the no-step-up / reopened
confirm-token-scope position (Decision 5 / §9). The governed action matrix, the BFF-side
confirm-token/audit contract with **two sinks**, the corrected sad-path vocabulary (S1–S12), and the
ADR-018 Option 0 / #194 / #222 reconciliation are locked here. The four artifacts for #220 (§8A),
the #218-body amendment (§8B), and the confirm-token-scope open question (§9) are carried forward.
Implementation — the real guard, the (conditional) `approval.requested` wire-up, the two-sink audit,
the #229 approve-merge/`AdmitDone` binding, and the aggregate migration — is carried to #220
(mirroring the corrected prototype `028ec317`); it does not need to reopen this contract.

---

## Appendix — source citations index

**Code (verified this pass):**
- `packages/runtime-control/src/application/task-tools.ts` — tool registry `:43-58`; `optionalStatus`
  (done≈todo) `:261-276`; `parseCreateArgs`/`parseUpdateArgs` `:369-496`; `performTool` create
  `:665-681`, status→`moveTask` `:717-728`; auth wiring `:549-552`.
- `packages/runtime-control/src/application/assistant-conversation-lifecycle.ts` —
  `RuntimeControlActor { userId, roleKeys }` `:32-35`; `ToolExecutionContext` (+ `sessionId`,
  `commandIdempotencyKey`) `:49-55`; context built from session principal `:504-533`.
- `packages/project-management/src/application/tasks.ts` — `authorizeTask` (generic,
  action-agnostic) `:648-668`; `createTask` (accepts `done`, no gate) `:1386-1452`; `updateTask`
  `:1659`; `moveTask` (update→done, no gate) `:1745-1825`.
- `packages/project-management/src/application/authorization.ts` —
  `RoleKeyTaskAuthorizationPort.can` returns `roleAllows("member")` regardless of status `:31-71`;
  `defaultTaskAuthorizationPort` `:103`; RLS/org/workspace mismatch denials `:35-50`.
- `apps/workers/src/provisioning/ask-admin-agent.ts` —
  `ASK_ADMIN_TOOL_POLICY_ALLOW=[list,create,update]` `:43-47`; per-tool policy `:66-72`,
  `:253-259`; `operator.approvals` scope `:20`; SOUL/IDENTITY/AGENTS claims `:146-236`, `:171-182`,
  `:227`.
- `apps/web/app/api/tasks/ask-admin/turn/route.ts` — 401 session gate `:619`; `actingPrincipal` from
  verified session `:265-273`; `tool.call`→`executeRuntimeControlTaskTool` (BFF-side) `:379-393`,
  `:388`; `approval.requested` no-op `:423-425`.
- `apps/gateway-broker/src/acl/openclaw/` — `exec.approval.requested` `operator-client.ts:937`;
  →`approval.requested` `:1122`, `http-server.ts:302`; `EXPECTED_OPERATOR_SCOPES` `protocol.ts:4`.
- `apps/gateway-broker/src/internal/http-server.ts` — `parseVerifiedPrincipal` shape-checks only
  `:145` (#194).

**Authority docs:**
- `docs/adr/ADR-017-dev-board-authority-sync-execution.md` — `:88` (human approvals → Dev Board);
  `:101-103` (Review mandatory; Done only after Review+approval+merge into `development`);
  `:173` (dependency-Done); `:331-332` (Review #229 owns verdict + merge authorization; integration
  only dispatches); `:488-491` (Slack/approval binding = identity+version+nonce+expiry+audit);
  `:499-511` (Review; until it exists, Done fails closed); `:533-545` (four ledgers).
- `docs/adr/ADR-018-web-broker-principal-trust.md` — broker reads only `tenantId` `:7,:39`; Option 0
  `:64-68`; BFF owns user attribution `:107-108`; Option 0 not sufficient alone `:68`; Option 3
  `:50,:76-78`.
- `docs/prd/PRD-019-dev-board.md` — `:27-28` (no Done before review+merge); `:50-55` (six lanes,
  Review mandatory+independent, Done=merged); `:102-103` (story 18, every implementation through
  Review); `:104-105` (story 19, Done=reviewed+merged); `:118-119` (story 26, Review/Done
  system-controlled).
- `docs/plan/dev-board-foundation-decisions.md` — DBF-017 `:43`; **DBF-028 `:59` ("No direct
  In-Progress-to-Done transition exists")**; DBF-030 `:61`; DBF-031 `:62`; DBF-118 `:199`; **DBF-174
  `:285` (activity/history ledger records accepted commands only)**; DBF-193 `:321`; DBF-226 `:362`.
- `docs/plan/research/wf230-devticket-command-model.md` — command envelope `:206-244`; source/principal
  matrix `:248-264` (Done never granted `:255-256`, `:260`); Needs Human Approval Request/confirm-token
  `:144, :276-305` (`:287` single-use token, `:292` approver, `:295-297` invalidation, `:299-301`
  consume-in-same-tx); ReviewMergeAuthorization/Review Exit Containment Proof `:154-155`;
  `ReviewChangesRequested`/`AdmitDone` lock the proof `:492-498`; **AdmitDone system-owned, disabled
  until #229, requires verified merge; nothing invokes Done directly `:1525-1547` (esp.
  `:1538-1547`)**; merge authorization locks proof without consuming `:1713-1726`; `AdmitDone`/
  `ReviewChangesRequested` command rows `:1887-1888`; AdmitDone-lacks-proof rejects `:1956`;
  idempotency/concurrency hard-403 + retry-vs-replay `:383-415` (esp. `:394-395` denial never claims
  a key, `:410-411` rejection terminal for key / retry uses new key); audit-metadata `:271-272`.

**Prototype (throwaway evidence — corrected authority model, committed `028ec317`):**
- `prototypes/wf218-hard-gate/demo.mjs` — the runnable demonstrator (tool path cannot write Done;
  `AdmitDone` system-owned + proof-gated; atomic; two sinks).
- `prototypes/wf218-hard-gate/README.md` — what it proves, the real-insertion mapping, and the locked
  decisions baked in.
- `prototypes/wf218-hard-gate/RESULTS.md` — S1–S7 PASS (`exit=0`, independently re-run), corrected
  model per §6B; hardened via DeepSeek + Codex-sol review (BLOCKED → fixed → re-review APPROVED).

**Issues (gh read):** #218 (frame + readiness review + #230 collision + #222 step-up hand-off — its
"two hard gates" body needs the §8B amendment), #253 (the filed Done-gate code-gap bug this memo
closes), #230 (closed; resolved command model, landed wf230), #212 (closed; server-side gate,
create-also-accepts-done), #222 (closed; "admin X via Ask Admin"; step-up question collapses under
the correction), #220 (assembly — four artifacts §8A + open items carried forward), #229 (Review
Gate / ReviewMergeAuthorization / Review Exit Containment Proof owner — owns the deferred
approve-merge AND the system-owned `AdmitDone` chain), #194/ADR-018 (broker principal trust — gates
broker-crossing authority, not this BFF-local execution).
