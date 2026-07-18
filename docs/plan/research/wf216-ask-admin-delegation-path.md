# WF-216 — Ask Admin delegation path: consuming the governed command surface (not Q17)

> **Dual-provider research (GLM + Codex-spark), converged; grilling decisions carried to #220.**

Status: **Read-only spec-grade research memo for grilling ticket
[#216](https://github.com/anthonykewl20/opzava/issues/216)** (map
[#210](https://github.com/anthonykewl20/opzava/issues/210), DEPRIORITIZED but workable).

This is planning-contract evidence for final Ask Admin synthesis
[#220](https://github.com/anthonykewl20/opzava/issues/220); it does not authorize product
implementation, change canonical PRDs/ADRs, or revive any quarantined brief. No git/GitHub writes.

## Scope and the premise correction (Q17 is quarantined — do not design against it)

#216 as titled asks *"How does Ask Admin assign a card to subagents by consuming **Q17's dispatch
machinery**?"* and frames the answer around Q17's "workforce plumbing" (#152 dispatcher, #153
sandboxed execution, #154 evidence gate). **That premise is dead and must not be designed against.**

- `CLAUDE.md` (project): *"Q17 and GitHub issues #147–#157 are superseded/quarantined historical
  evidence — never an executable brief."* #152/#153/#154 are CLOSED-quarantined, not delivered.
- ADR-017 (`docs/adr/ADR-017-dev-board-authority-sync-execution.md:17-27`) explicitly supersedes Q17
  and #147–#157 **as active guidance**, retaining them as historical evidence only.
- The #216 readiness review (issue #216 comment, 2026-07-18) and the owner's "unworkable as written"
  comment (2026-07-16) both record that the ticket must be rewritten to **consume** the landed,
  closed decisions, not reopen Q17.

The delegation path is therefore resolved by **consuming** three landed contracts:

1. **#230 — DevTicket command model** (`docs/plan/research/wf230-devticket-command-model.md`,
   landed `bbe61690`, current #228 input until #237).
2. **#232 — Runner control protocol** (`docs/plan/research/wf232-runner-control-protocol.md`,
   landed `4d884957`, current #228 input for #233/#235/#237 until #237).
3. **#243 — Ask Admin skill/runtime/MCP boundary** (`docs/plan/research/wf243-admin-skills-runtime-mcp.md`,
   landed `b006f636`, current #241 input for #246).

Plus the co-housing product contract **PRD-005** (`docs/prd/PRD-005-assistants-chat.md`) and the
authority split **ADR-017**. Wherever this memo states a rule, it cites which of those owns it.

The question this memo actually answers, restated cleanly:

> How does **Ask Admin** (the Lead Orchestrator) delegate card/DevTicket work to subagents/runners
> through the **governed DevTicket command surface** — the delegation command envelope, what stays
> Ask-Admin-owned vs runner-owned, how progress/receipts surface in chat, how failure and disconnect
> are handled with **no automatic failover**, and where the **server-side hard gate** (never
> Done / never approve-merge autonomously) sits.

## 1. The delegation path in one picture

```text
authenticated admin (Better Auth session)
  └─ Ask Admin turn  (PRD-005 conversation/turn authority — NO operator.admin)
       └─ Ask Admin command Adapter: requestCommand(turnContext, intent)        [wf232:235]
            ├─ derives principal/source/session from the web session only       [BFF route.ts:31,80]
            ├─ turn + tool-call idempotency prevent duplicate requests          [wf232:2861-2865]
            └─ Dev Board Adapter REAUTHORIZES principal/source/target/version/  [PRD-005:220]
                 exact action under the server CommandEnvelope                  [wf230:206-244]
                  └─ governed DevTicket command (one of the #230 catalog)       [wf230:1809-1893]
                       ├─ ordinary work starts ONLY from an explicit claim for  [wf230:1100-1138]
                       │  ONE ticket; autonomous_serial needs an approved Sprint [ADR-017:513-528]
                       └─ if the command is execution: Execution Admission       [wf230:135-181]
                            owns claim/lease/fence/lane; Runner only reports    [wf232:222-240]
                            signed facts for its OWN lease                       [wf232 Exact WF-230 map:2224-2244]
```

The decisive inversion vs the Q17 framing: **Ask Admin is a command-request origin, not a dispatcher.
It never holds execution authority.** Dispatch — claim, lease, fence, worktree, process, receipt —
is owned by the Runner protocol (#232) and Execution Admission (#230). Ask Admin hands an intent to
the governed command seam and watches the receipts come back.

## 2. RESOLVED BY EXISTING DECISIONS

These are settled by the landed contracts. #216 consumes them; it does not get to re-decide them.

### 2.1 The delegation command envelope and provenance chain

- **Provenance chain is fixed.** `authenticated human → Ask Admin conversation/turn → tool-call ID →
  Dev Board command request` (`wf232-runner-control-protocol.md:2861-2865`). Turn and tool-call
  idempotency prevent duplicate requests (`wf232:2867`).
- **The server constructs the trusted envelope; the transport adapter may not choose actor/source.**
  Every command handler receives a server-constructed `CommandEnvelope` carrying `actorRef`,
  `source`, `principalAuthorizationRefs`, `sourceAuthorizationRefs`, `authorizationVersion`, target
  versions, and optional `runnerRef/leaseRef/receiptSequence` (`wf230-devticket-command-model.md:206-244`).
  The BFF, Slack adapter, Runner verifier, etc. each *"map authenticated evidence to a principal
  before calling the application service"* and *"may not choose the trusted actor/source fields"*
  (`wf230:241-244`).
- **The Dev Board Adapter reauthorizes, it does not trust.** PRD-005 requires that *"Ask Admin
  Opzava may translate one authenticated conversation/turn/tool-call intent into the same
  server-owned Dev Board command used by UI, Slack, or MCP. The Dev Board Adapter must reauthorize
  the original human principal, source/session, target/version, and exact action; the assistant,
  model, broker body, and transcript never supply actor, tenant, approval, Runner, lease, or secret
  authority. Turn/tool-call identity provides idempotency and provenance only."*
  (`PRD-005-assistants-chat.md:220`; acceptance at `:337`).
- **There is a named deep module for this:** the **Ask Admin command Adapter** with interface
  `requestCommand(turnContext, intent)`, owning *"current web-session/on-behalf-of provenance,
  turn/tool-call idempotency, safe summaries"* and explicitly **must never own** `operator.admin`,
  Human approval inference, or an Execution Lease (`wf232-runner-control-protocol.md:235`).
- **As-built provenance already derives from the session.** `apps/web/app/api/tasks/ask-admin/turn/route.ts`
  resolves the principal via `getAppSessionContext` (`:31`), requires a client `idempotencyKey`
  (`:38`), and forwards `principalSessionId: context.sessionId` to the broker gateway port (`:80`).
  The #232 as-built inventory pins this route's disposition: *"Keep BFF session as actor provenance.
  Ask Admin may request Dev Board commands but cannot become the Runner or approval owner."*
  (`wf232-runner-control-protocol.md:146`).

### 2.2 Ask-Admin-owned vs runner-owned — the authority split

The source/actor policy table in #230 fixes what each origin may request and may never grant itself.
The **Lead Orchestrator / Personal Assistant** row (`wf230-devticket-command-model.md:257`):

> **May request:** draft agent-discovered Proposals; request `CreateBacklogDevTicket` only from
> explicit human shaping; validation requests, notifications, and commands explicitly delegated by
> policy.
> **Never grants itself:** bypassing Proposal for an autonomous discovery; Human Owner, Execution
> Assignee, Reviewer, or unrestricted Admin authority.

Reinforced by #232's Ask Admin section (`wf232-runner-control-protocol.md:2867-2871`):

> *"The Lead Orchestrator may recommend, dispatch an allowed request, pause/escalate, or notify. It
> does not become the Human, assignee, Runner, Reviewer, secret broker, or `operator.admin` merely
> because it called a tool. Machine enrollment, raw secret entry, security/integration trust
> changes, and unbounded approvals stay in the secure UI."*

**Boundary ownership summary (converged GLM + Codex-spark):**

| Scope | Owner | What it covers |
| --- | --- | --- |
| Ask-Admin-owned (orchestration / request) | Ask Admin command Adapter + central policy evaluation | authenticated human/session provenance, command-intent translation, allow-list/policy evaluation at admission, per-turn idempotent request lifecycle (`wf230:206-244`; `PRD-005:220`) |
| Runner/Execution-Admission-owned (never Ask Admin) | Execution Admission + Runner protocol | Runner enrollment/key/capability module, command transport, receipt verification, lease/fence, grant delivery, process/worktree/containment control, execution-proof ingestion (`wf230:135-181, 1098-1289`; `wf232:222-240, 2224-2244`) |

Delegation etiquette — the `opzava-pm` choreography — is therefore **enforced by the Ask Admin
command Adapter plus central policy evaluation, not by ad-hoc `opzava-pm` tooling behavior alone**
(`docs/plan/research/wf243-admin-skills-runtime-mcp.md`; `wf232-runner-control-protocol.md:235`).
#243 locks the placement split: #219 owns Ask Admin **skill content**; #243 owns the **boundary**;
#216 owns the delegation **choreography**. None of the three widens tool containment
(`wf243-admin-skills-runtime-mcp.md:597-598`).

Consequences for the delegation verbs:

- **Ask-Admin-owned (orchestration / request):** recommend a target DevTicket, draft a Proposal for
  agent-discovered work (`DraftProposal`, `wf230:1826`), request `CreateBacklogDevTicket` from
  explicit human shaping (`wf230:1834`), request assignment/claim, pause/escalate, notify, and
  narrate progress.
- **Runner/Execution-Admission-owned (never Ask Admin):** claim arbitration, Execution Lease,
  fencing token, worktree/branch/process, capacity preset, the signed start receipt, checkpoint,
  containment, release, and lane transition (`wf230-devticket-command-model.md:135-181`,
  `1098-1289`; `wf232-runner-control-protocol.md:222-240`, `2224-2244`). *"Execution Admission
  retains every DevTicket, claim, assignment, capacity, lease, fence, lane, and release decision
  fixed by WF-230"* (`wf232:23-24`).
- **Runner identity ≠ Execution Assignee ≠ Lead Orchestrator.** All three are distinct; possessing
  any one grants none of the others (`wf232-runner-control-protocol.md:181-220`;
  `ADR-017-dev-board-authority-sync-execution.md:368-373`). ADR-017's authority matrix makes
  *"Lead Orchestrator, Execution Assignee, Runner selection; Execution Lease authorization"*
  Dev-Board-owned, with external identities and signed observations as *"validated inputs, never
  authority by assertion"* (`ADR-017:86`).

### 2.3 Progress and receipt surfacing (how delegated work shows in chat)

This is the long-running-delegation question that #214/#225 deferred to #216 (`#210` map body,
"Not yet specified"). The landed contracts fix the *supply side*; the *chat-projection* shape is the
open question (§3.3). The governing principle (converged): chat visibility tracks the
**command/request/claim lifecycle** (`requested`, `start_pending`, `blocked`, …) projected from Dev
Board governed activity — **not raw execution internals** (`wf230-devticket-command-model.md`;
`wf232-runner-control-protocol.md`).

- **Runner observations are never lifecycle authority — they are inputs.** Event family placement is
  authority: every claim/lease/grant/fence/containment/release event is a Dev Board workflow/activity
  fact; a Runner-family event *"records only an authenticated signed local observation or proof; it
  cannot itself grant, start, fence, release, terminalize, or reconcile lifecycle state"*
  (`wf230-devticket-command-model.md:1662-1665, 1680-1684`). The accepting/rejecting Dev Board
  command emits the workflow event and links the Runner fact (`wf230:1683-1684`).
- **A receipt is trusted only when seven bindings all match** (`ADR-017-dev-board-authority-sync-execution.md:447-456`):
  enrolled non-revoked Runner key + tenant/Admin binding; active lease ID + current fencing token;
  one-time command nonce; monotonic receipt sequence; exact DevTicket + Ready Contract Version/hash;
  exact repository/worktree/branch/SHA; admitted tool/model capability + current policy. A changed
  payload, sequence collision/gap, stale epoch/fence, revoked key, or downgrade *"fails closed
  without applying a workflow transition"* (`ADR-017:463-466`).
- **Managed-harness output is a typed, redacted, ordered, idempotent envelope stream.** Adopted by
  the landed #232 protocol for #237: status transitions, agent worklog entries, command/test
  evidence, summaries, failures, and bounded artifact references; each carries a monotonic producer
  sequence, pinned revisions, redaction result, and content hash; upload is idempotent/deduped; a
  disconnected Runner buffers within a bounded quota and replays in order; gaps stay visible and the
  run cannot claim complete until required evidence is acknowledged; suspected secrets quarantine the
  envelope and stop any gate that needs it (`wf243-admin-skills-runtime-mcp.md:830-856`).
- **The chat side already has the streaming states to project into.** PRD-005 enumerates queued,
  working, coordinating, **delegating**, waiting-for-approval, finalizing, completed, failed,
  canceled, gateway-unavailable, and policy-denied (`PRD-005-assistants-chat.md:171`), and requires
  that trace/tool cards expose *"high-level checks, safe command labels, summarized tool output, and
  source refs"* with role-specific disclosure (`PRD-005:165-166`). Receipts must not duplicate text,
  approvals, messages, or side effects across stream completion, webhook completion, retries, and
  reconnect (`PRD-005:173, 161`).
- **What this means for #216:** delegated-work progress is a **projection** of authoritative Dev
  Board activity events (`ClaimPrepared`, `LeaseStarted`, `AgentWorklogAppended`,
  `RunnerReceiptAccepted`, `BlockedOpened`, `ReviewRequested`, … — `wf230:1629-1661`) plus the
  managed-harness worklog stream, rendered into the existing PRD-005 streaming states. Ask Admin
  reads the same read models as the Dev Board UI; it does not get a private progress channel.

### 2.4 Failure, disconnect, and no automatic failover

This is the strongest constraint in the whole path and it is fully locked.

- **Local and cloud Runners are explicit selections; a disconnect never triggers cloud failover.**
  *"A local lease cannot migrate to cloud mid-flight; after containment, a future item or fresh claim
  can select cloud only through the owning command and policy. A cloud Runner never appears merely
  because the local machine went offline."* (`wf232-runner-control-protocol.md:2925-2928`).
  ADR-017: *"a disconnected local machine must pause rather than automatically fail over to cloud
  execution"* (`ADR-017:67-70`) and the sad-path: *"If it is still `credential_provisioning` …
  create/reuse Pre-Start Admission Loss … leave Todo without Blocked … started execution uses the
  same Blocked path with its checkpoint preserved. Notify the Admin through Slack and never
  automatically fail over to a cloud runner."* (`ADR-017:477-486`). #232 sad-path row: *"Local
  Runner disconnects during Sprint → pause/Blocked per #230/#233, Slack summary, no cloud failover"*
  (`wf232:3000`).
- **Three deterministic loss containers** (not an "await confirmation" limbo) own every failure:
  **Pre-Start Admission Loss** (no start ever enqueued / no process), **Start Rejection
  Containment** (signed no-process proof), and **Blocked — Connection Lost / Execution Unknown**
  (started or ambiguous `start_pending`), plus the **Material Revision Interruption** that subsumes
  all of the above when a material change is in flight (`wf230-devticket-command-model.md:1157-1199,
  1290-1409`). Each has exactly one finalizer; replays cannot create two (`wf230:1380-1408`).
- **Resume is a fresh `ClaimAndStart`, never lease resurrection.** *"Runner reconnect first writes a
  reconciliation observation … Continuation then uses a new `ClaimAndStart`, lease ID, fencing token,
  and command nonce … it never resurrects the old lease or blindly fails over to cloud."*
  (`wf230-devticket-command-model.md:1435-1443`; `wf232-runner-control-protocol.md:2239-2241`).
- **What this means for #216:** Ask Admin's failure UX is *narrate the governed outcome*. It shows
  "claim failed — safe reason", "Blocked — Connection Lost / Execution Unknown", or "Pre-Start
  Admission Loss finalized; fresh claim eligible", reads straight from the Dev Board activity
  ledger, and offers the human the next governed action (re-claim, supersede, resolve). Ask Admin
  itself triggers **nothing** on failure except an allowed retry request or a notification.

### 2.5 The hard-gate boundary — never Done / never approve-merge autonomously (server-side)

- **Done is admitted only after independent Review + verified merge, and `AdmitDone` is a
  system-owned command.** *"AdmitDone is a system-owned command … it must also observe the exact
  approved Review/Ready Approval and verified GitHub merge into `development` … then decrement WIP
  with Done admission. … A UI drop, GitHub label, agent, or stale projection cannot invoke Done
  directly."* (`wf230-devticket-command-model.md:1538-1547`; catalog row `:1888`).
- **Every ordinary Done exit consumes an exact #229-authenticated `ReviewExitContainmentProof`**
  that the Lead Orchestrator cannot produce (`wf230:1525-1533, 1710-1721`).
- **The Lead Orchestrator row explicitly cannot grant Review or Done.** Never-grants-itself includes
  *"Human Owner, Execution Assignee, Reviewer, or unrestricted Admin authority"*
  (`wf230:257`); the Reviewer source row's never-grants is *"implementation authority, its own
  implementation's approval, direct merge/Done"* (`wf230:263`).
- **The gate is server-side, not tool policy.** Map #210 locked decision: *"Hard gates: autonomous
  actions never touch Done/approve-merge; human-commanded actions can — audited as 'admin X via Ask
  Admin' with an in-chat confirm step. … Hard gate (never Done/approve-merge autonomously) is
  server-side, not tool policy."* (#212 summary in #210; reaffirmed PRD-005 acceptance `:337-338`:
  *"Ask Admin Dev Board actions preserve the original human/session/turn/tool-call provenance, are
  reauthorized against the current target/version, and cannot become Runner, lease, or secret
  facts."*).
- **What this means for #216:** Ask Admin may draft, recommend, request, and notify — including
  drafting a Review submission or a merge *request*. It may **not** emit the Review verdict, the
  `AdmitDone`, or the governed merge authorization. Those are consumed only from #229 proof and a
  verified GitHub merge (`wf230:1716-1721`, `ADR-017:331-342`). A human-commanded Done/approve flows
  through the same command seam, reauthorized and audited as *"admin X via Ask Admin"*
  (`#210` locked decisions; `PRD-005:220, 247`).

### 2.6 The Ask Admin skill/tool subset boundary (#243)

#216's "which delegation tools stay in the allow list" and "delegation etiquette in `opzava-pm`"
questions are bounded by the landed #243 contract.

- **The Ask Admin skill subset is a versioned, fail-closed target policy — not a page, not a
  catalog.** An empty intersection is valid; a skill may be *visible* without being *callable*
  (`wf243-admin-skills-runtime-mcp.md:531-553`). #219 owns exact membership/content; #216 owns
  delegation orchestration; **neither may weaken tool containment** (`wf243:597-598`).
- **Current truth is an empty set.** Ask Admin is provisioned `skills: []`, `tools.profile:
  "minimal"`, deny `group:fs`/`write`/`group:runtime` (`apps/workers/src/provisioning/ask-admin-agent.ts:43-47,
  82`; `wf243-admin-skills-runtime-mcp.md:100, 533-535`). It cannot load any skill today.
- **Exact positive keep-only tool allowlist is mandatory; wildcards/groups/bare `bundle-mcp` leak.**
  The activated policy must contain one exact positive allowlist of every intended model-facing tool
  name (including final projected `<safe-server>__<tool>` names), verified by a real Platform
  Gateway `tools.effective` equality proof before activation (`wf243:562-581`). This is the mechanism
  the #212 research already mandated (`#210` map body, #212 summary).
- **Delegation must not widen through omitted descendant config.** *"The managed Mainframe config
  sets `agents.defaults.skills: []`. The Ask Admin entry and every permitted descendant/subagent
  entry must then carry an explicit `skills: []` or exact approved skill-name list; omission/
  inheritance is invalid. Each descendant also has its own exact positive keep-only … tool allowlist
  and independent deny-wins policy."* (`wf243:583-598`; sad-path `:949`). The current code already
  pins subagent deny = Ask Admin deny and empty allow, with a comment that Q17 would widen *"only
  after the delegation engine proves a concrete need"* (`ask-admin-agent.ts:37-41`). In the as-built
  `buildAskAdminAgentEntry`, delegation **appends only** `sessions_spawn`, `subagents`, and
  `group:sessions` when delegation config is present, while preserving the deny-wins core task/tool
  limits (`ask-admin-agent.ts:317-323`).
- **What this means for #216:** the delegation tool surface is whatever the exact positive allowlist
  admits after `tools.effective` proof — today that is `opzava_tasks_{list,create,update}` plus the
  delegation-session subtree (`sessions_spawn`, `subagents`, `group:sessions` —
  `ask-admin-agent.ts:49-53`). #243 is explicit that the Ask Admin subset is **computed by policy
  and is not a separate authority source** — allow-listing is policy output, never an autonomous
  dispatcher right (`wf243-admin-skills-runtime-mcp.md`). `opzava-pm` does not yet exist (no source
  found; proposed by WF-221, content owned by #219). Widening the descendant surface requires both
  an exact allowlist and a live `tools.effective` equality proof, not a Q17-style blanket
  delegation grant.

## 3. Open decisions (grilling)

Each item below is a decision the landed contracts do **not** make, framed as a grilling question
with a **recommended default**. These are the questions #216 owes #220.

### 3.1 Delegation tool allowlist under `profile:coding` + the `buildAskAdminAgentEntry` rework — **recommendation carried to synthesis #220 (not an owner-lock)**

**Decision needed.** #212 locked that the v1 tool policy needs `profile:coding` (so skills are
loadable) with an **exact `allow`** (because `coding` admits `bundle-mcp`); but
`buildAskAdminAgentEntry` *adds* `ASK_ADMIN_DELEGATION_TOOL_ALLOW` to `allow`
(`ask-admin-agent.ts:317-323`), and the group token `group:sessions` under an exact-allow profile
collapses/under-specifies the surface — the defect carried from #212/#216 ("appends delegation tools
to `allow`, which collapses the surface under `profile:coding`"). The exact set of model-facing
delegation tool names that survive projection must be named.

**Recommended default.** Resolve `group:sessions` to its concrete projected tool names and carry
them as **explicit positive names via `alsoAllow`** (additive, profile-stage-safe), keep the
independent deny-wins list, and gate activation on a real `tools.effective` equality proof per #243
(`wf243:562-581`). Drop `group:sessions` as a bare group token from the allowlist. This is #212's
locked mechanism; #216 only supplies the delegation-specific names. The hard gate stays server-side
(§2.5), so the allowlist governs *what Ask Admin may request*, never *what it may finalize*.

### 3.2 The `opzava-pm` delegation etiquette (orchestration choreography) — **recommendation carried to synthesis #220 (not an owner-lock)**

**Decision needed.** What concrete steps does the `opzava-pm` skill emit when Ask Admin delegates?
Content is #219's; the *delegation choreography* is #216's. The landed contracts constrain it to:
request `CreateBacklogDevTicket` only from explicit human shaping (`wf230:1834`); draft Proposals
for agent-discovered work, never bypassing Proposal for an autonomous discovery (`wf230:257`);
request (not perform) claim/assignment; narrate governed progress; pause/escalate/notify on failure;
never self-escalate to admin mutation (`wf243:947`). Etiquette is **enforced by the Ask Admin
command Adapter plus central policy evaluation**, not by ad-hoc `opzava-pm` tooling behavior alone
(§2.2; `wf243-admin-skills-runtime-mcp.md`).

**Recommended default.** `opzava-pm` emits a fixed, server-reauthorizable **delegation verb set**
mapped 1:1 to #230 commands the Lead Orchestrator may *request*: `draftProposal`,
`requestCreateBacklogDevTicket`, `requestAssign`, `requestClaimAndStart` (forwarded to Execution
Admission), `requestSubmitForReview`, `pauseOrEscalate`, `notify`. Each verb becomes exactly one
`requestCommand(turnContext, intent)` call through the Ask Admin command Adapter (`wf232:235`),
reauthorized by the Dev Board Adapter (`PRD-005:220`). The skill never emits Done/merge/approve —
those are not in its verb set.

### 3.3 Long-running-delegation progress projection in chat — **recommendation carried to synthesis #220 (not an owner-lock)**

**Decision needed.** #214/#225 explicitly deferred "how long-running delegated work surfaces in chat
(progress, interrupts, receipts)" to #216. The supply side is locked (§2.3); the projection shape is
not.

**Recommended default.** A **delegation card** per active delegated intent, projected from Dev Board
activity events + the managed-harness worklog stream into the existing PRD-005 streaming states
(`PRD-005:171`). States: `requested → provisioning → starting → in_progress → [blocked] →
submitted_for_review → completed | failed`. Receipts are read-model projections (rebuildable), never
a second source of truth; the card links the DevTicket, the Runner/Execution-Assignee attribution,
and the last trusted checkpoint or explicit `execution_unknown` (`wf230:1326-1328`). Interrupts
surface as the governed Blocked/Pre-Start/Start-Rejection dispositions (§2.4), with the next allowed
human action offered inline. No private Ask-Admin progress channel — the card tracks the
command/request/claim lifecycle from Dev Board projections, not raw execution internals (§2.3).

### 3.4 Sequencing when governed dispatch (#230/#232) is not yet implemented — **recommendation carried to synthesis #220 (not an owner-lock)**

**Decision needed.** #216's original "degrade to create+assign-only?" fallback is moot as a *Q17
fallback*, but live as a *v1 sequencing* question: the Runner protocol (#232) and Execution
Admission are **unimplemented target architecture** (`ADR-017:14-15`; `wf232:137, 152`). Ask Admin
v1 may ship before governed dispatch exists. What may Ask Admin do at v1?

**Recommended default.** The legacy "degrade to create+assign-only" partial-success path is
**invalid as a v1 default** (it is a quarantined Q17 escape hatch — `CLAUDE.md`; `ADR-017:17-27`).
At v1, Ask Admin delegates only the **non-execution subset** of the Lead Orchestrator's verbs
(`wf230:257`): `DraftProposal`, `requestCreateBacklogDevTicket`,
`requestAssignTodo`/`ClearTodoAssignment` (`wf230:1851`), comments/worklogs, and notifications. It
**may not request `ClaimAndStart`** until #232 Runner delivery + #230 Execution Admission land,
because there is no enrolled Runner to hold the lease and no signed-receipt ingress
(`ADR-017:447-466`). When a governed start-capability is unavailable, the Ask Admin command Adapter
**fails fast** with a typed `governed_dispatch_unavailable` outcome carrying a governance/readiness
message and explicit remediation — consistent with #225's "degrade truthfully" and #243's fail-closed
pattern (`wf243:945`) — rather than silently faking execution or running a partial create+assign flow.

### 3.5 Where the Ask Admin command Adapter lives, and the `operator.admin` boundary — **recommendation carried to synthesis #220 (not an owner-lock)**

**Decision needed.** The deep module is named (`wf232:235`) but its process placement (BFF request
path vs worker) and its exact split from the admin-token remediation job path are not pinned for
v1. PRD-005 separates them: Dev Board intents go through *"its canonical command Adapter with the
authenticated on-behalf-of chain"*, while admin-token remediation executes *"through platform-ops
jobs … Ask Admin Opzava may propose and request approval but does not execute admin operations
inside the chat request path"* (`PRD-005:291-292`; also `:152, :227`).

**Recommended default.** The Ask Admin command Adapter runs in the **BFF/worker application layer**
behind the existing broker `runtimeControl` ACL, derives principal from the Better Auth session only
(`route.ts:31,80`), and emits only governed Dev Board command requests — **never** the ADR-003
`operator.admin` credential. `operator.admin` stays in the audited platform-ops job runner, out of
band from the chat hot path (`PRD-005:227`; `ask-admin-agent.ts:23-27` forbids `operator.admin`).
This keeps the #222 "audited as admin X via Ask Admin, verified acting admin" provenance honest
without putting admin authority in the model's hands.

### 3.6 Boundary policy source order in final assembly — **recommendation carried to synthesis #220 (not an owner-lock)**

**Decision needed.** When the open decisions above are resolved into a #220 spec, the precedence of
the landed contracts is implied but not pinned in one place.

**Recommended default.** Assemble in this source order, then lock in #220: **#243** for
placement/boundary; **#219** for skill-content membership only; **#232** for Ask Admin
provenance/adapter semantics; **#230** for command and claim semantics; **PRD-005** for the
chat-projection contract and admin-job boundary; **ADR-017** for the authority split and sad paths.
Where two sources touch the same field, the more specific authority wins (e.g. #243 over #219 on
*boundary*, #219 over #243 on *content*).

### 3.7 Ticket treatment for #216 — **recommendation carried to synthesis #220 (not an owner-lock)**

**Decision needed.** #216's literal question anchors to superseded Q17 dispatch machinery
(`#216` body + comments; `ADR-017:17-27`).

**Recommended default.** Re-scope #216 as **"Ask Admin command-facing contract only"** — the
delegation envelope, the §2.2 authority split, the §3 choreography/projection, and the §2.5
server-side hard gate, consuming #230/#232/#243 — rather than leaving the Q17-framed title standing
or closing it outright. The consumed scope is fully answered by this memo; only the §3 decisions
remain open for #220.

## 4. Prototype outcome (throwaway evidence — NOT production code)

A throwaway demonstrator at `prototypes/wf216-delegation/` was built and hardened over two Codex-sol
review cycles — each returned **BLOCKED** with real authority/containment findings (forgeable session
principal, the #194 class; no version-advance on disconnect; nonce-only replay; unfenced old
execution; then resume-nonce reuse and delayed old-lease control events) — all fixed and re-verified.
It now **passes** (`node prototypes/wf216-delegation/demo.mjs`; all of **S1–S11 PASS**,
`SCENARIO_SUMMARY=PASS`, exit `0`). It is **not** an implementation of dispatch —
it is a traceable, in-memory, fake-transport demonstration of the delegation command flow, proving
the invariants the landed contracts require. All Runner/Execution-Admission/secret machinery is
**in-memory fakes**; no model tokens were spent. It models the #194 parallel-fix behavior, not the
pre-existing bug.

**Wiring demonstrated:**

```text
Ask Admin turn intent
  → AskAdminCommandAdapter.requestCommand(turnContext, intent)     // derives principal from a verifier-backed fake session
  → fake Dev Board Adapter reauthorizes (principal/source/target/version/action)
  → fake Execution Admission: ClaimAndStart → Execution Lease + fence + nonce
  → fake Runner: signed start receipt → checkpoints/worklogs → containment on disconnect
  → chat card projection (the §3.3 states) rendered to a console trace
```

**Scenarios proved (each with a traceable audit line per step):**

| Scenario | Proves | Invariant / source |
| --- | --- | --- |
| **S1** delegation happy path | turn intent → governed command → `ClaimAndStart` → lease+fence+nonce → signed start receipt **only then** moves the lane → checkpoints/worklogs project → `submitted_for_review` | `wf230:1233-1251`; `wf232:2230-2232`; `PRD-005:171` |
| **S2** forbidden verb | `Done`/approve-merge rejected at the adapter as `forbidden-verb` **before** any Dev Board dispatch | §2.5 hard gate; `wf230:1538-1547, 1716-1721` |
| **S3** disconnect containment | mid-run → `blocked` + `execution_unknown`, `expectedVersion` bumped, last trusted checkpoint preserved, **no cloud Runner appears** | `ADR-017:477-486`; `wf232:3000`; `wf230:1290-1409` |
| **S4** reauth mismatch | principal/source/target/version/action mismatch → Dev Board rejects (`principal-mismatch`, `expectedVersion-mismatch`) | `wf230:206-244`; `PRD-005:220` |
| **S5** replay dedupe | same idempotency key + identical identity tuple `(principalRef, source, action, target, expectedVersion, payloadHash)` → deduped; missing key rejected, no synthetic key generated | `PRD-005:161, 173`; `wf232:2861-2867` |
| **S6** forged / missing session | caller-asserted or missing-principal session rejected **before** Dev Board dispatch; authority derives from the verifier only | `wf230:241-244`; `route.ts:31,80` |
| **S7** stale-version resume | resume requires a **fresh `ClaimAndStart`** with a new lease/fence/nonce; the old lease is never resurrected | `wf230:1435-1443` |
| **S8** cross-caller replay | a different caller cannot replay another principal's idempotency key | `wf232:2861-2867` (turn/tool-call idempotency) |
| **S9** old-fence writes | Runner writes against a stale lease/fence/nonce are rejected (`runner-not-running`/`stale-lease`) | `wf230:1662-1684`; `ADR-017:447-466` |

**What the prototype does not carry** (so its PASS is honest about scope): it emits no `operator.admin`
in any envelope/transcript/receipt (§2.5/§3.5 invariant held in the fake). The seven-binding receipt
trust (`ADR-017:447-456`) is represented by the lease/fence/nonce/identity checks, not by real
Ed25519 verification.

**Mapping to real implementation targets (where this lands if #220 approves):**

- `apps/workers/src/provisioning/ask-admin-agent.ts` / `buildAskAdminAgentEntry` — fixed delegation
  verb surface + the command-adapter entrypoint; session-derived provenance (`actorRef`, `source`)
  via a verifier dependency; explicit-key idempotency and the identity-bound dedupe tuple
  (`ask-admin-agent.ts:37-53, 302-326`).
- **#230 command surface** — the `request*` command-envelope contract and the source-of-truth
  checks on actor/source/version; `ClaimAndStart` issuance of execution control facts
  (lease/fence/nonce) (`wf230-devticket-command-model.md:206-244, 1098-1548`).
- **#232 Runner protocol** — Runner receives claim facts and emits the signed start receipt;
  checkpoints/worklogs are inputs, not lifecycle authority; explicit containment and explicit
  retry/reclaim semantics on disconnect (`wf232-runner-control-protocol.md:222-240, 2224-2244,
  2925-2928`).
- **PRD-005 chat projection** — the §3.3 delegation card renders into the existing streaming states
  from the same read models as the Dev Board UI (`PRD-005-assistants-chat.md:165-173`).

**Out of scope for the prototype (and explicitly not claimed):** real WSS, real Ed25519 enrollment,
real Postgres/RLS, real Codex/Claude harness, real secret grants, and real #229 `ReviewExitContainmentProof` /
verified-merge validation — those are #232's deterministic conformance suite
(`wf232-runner-control-protocol.md:3017-3293`), not this delegation-path sanity check. The prototype
folder is disposable evidence under the repo-hygiene scratch rule and may be deleted wholesale.

## 5. Risks

- **Residual Q17 references in code/specs:** any remaining Q17 plumbing references (the S6/S7/S8
  dispatch machinery framing in `#216`; #152/#153/#154) can cause an accidental bypass of the
  governed claim/lease rules. The §3.7 re-scope closes the ticket-side anchor; a codebase sweep for
  Q17 dispatch calls is the operational guard.
- **Policy drift:** the Ask Admin allow-list append shape (`ask-admin-agent.ts:317-323`) can be
  widened by build-time mistakes; the code comments already guard against replacing policy but not
  all callers. The §3.1 `alsoAllow` + `tools.effective` equality proof is the mitigation.
- **Cross-surface inconsistency risk:** if Ask Admin, MCP, and Runner surfaces project different
  admission meanings, user-visible progress could contradict execution truth (`ADR-017`;
  `wf232-runner-control-protocol.md`). The §3.3 "same read models, no private channel" rule prevents
  this only if all three surfaces project from the authoritative Dev Board ledger.
- **Operational transparency risk:** if chat surfaces claim status without clear readiness causes,
  users may misread "submitted" vs "started." The §3.3 card must carry the governed disposition
  reason and the next allowed human action, not just a state label.
- **Migration risk:** Ask Admin's current tool policy (`skills: []`, `profile: "minimal"`) and #243's
  pending skill/runtime split both require policy-driven projection plumbing; an incomplete rollout
  can make delegation appear inconsistent or empty (`wf243-admin-skills-runtime-mcp.md:100, 533-535`).

## 6. Evidence register

Every rule above traces to one of:

- `docs/adr/ADR-017-dev-board-authority-sync-execution.md` — authority split, four ledgers, Runner
  receipt trust (`:447-466`), disconnect/no-failover (`:477-486`), Runner≠assignee (`:368-373`),
  Q17 supersession (`:17-27`).
- `docs/plan/research/wf230-devticket-command-model.md` — CommandEnvelope (`:206-244`), source/actor
  policy incl. Lead Orchestrator row (`:257`), Claim/start/Blocked/recovery (`:1098-1548`), events
  (`:1618-1807`), command catalog (`:1809-1893`), sad paths (`:1894-2062`).
- `docs/plan/research/wf232-runner-control-protocol.md` — Ask Admin section (`:2856-2871`),
  provenance chain (`:2861-2865`), Ask Admin command Adapter deep module (`:235`), Exact WF-230 map
  (`:2224-2244`), no-failover (`:2925-2928, :3000`), as-built inventory (`:135-153`).
- `docs/plan/research/wf243-admin-skills-runtime-mcp.md` — Ask Admin skill subset contract
  (`:531-560`), exact tool-projection safety (`:562-581`), delegated descendant containment
  (`:583-613`), managed-harness output envelope (`:830-856`), boundary/placement ownership.
- `docs/prd/PRD-005-assistants-chat.md` — Dev Board Adapter reauthorization (`:220`), streaming
  states (`:171`), acceptance (`:337-338`), admin-token job boundary (`:227, :291-292`).
- `apps/workers/src/provisioning/ask-admin-agent.ts` — tool policy + delegation allow (`:43-53`),
  `skills: []` (`:82`), `buildAskAdminAgentEntry` collapse (`:302-326`), subagent containment
  (`:37-41, :336-346`), `operator.admin` forbid (`:23-27`).
- `apps/web/app/api/tasks/ask-admin/turn/route.ts` — session-derived principal (`:31`), idempotency
  key (`:38`), `principalSessionId` (`:80`).
- `prototypes/wf216-delegation/` (`README.md`, `RESULTS.md`, `demo.mjs`) — throwaway demonstrator
  evidence (§4).
- Issues: #216 (body + 4 comments), #210 (map body + comments), #230/#232/#243 (resolution
  comments + landing commits `bbe61690` / `4d884957` / `b006f636`), #212/#221/#225 (via #210 map
  body and `wf221-ask-admin-v1-skills.md`), #194 (prototype parallel-fix reference).

No claim here revives Q17 or #147–#157. Where a #216 open question (§3) is unresolved, it is labeled
as an owner decision for #220 (recommendation, not owner-lock), not silently defaulted into the spec.
