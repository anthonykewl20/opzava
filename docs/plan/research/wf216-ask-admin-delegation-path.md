# WF-216 — Ask Admin delegation path: consuming the governed command surface (not Q17)

> **Dual-provider research (GLM + Codex-spark), converged; grilling decisions carried to #220.**

Status: **Read-only spec-grade research memo for grilling ticket
[#216](https://github.com/anthonykewl20/opzava/issues/216)** (map
[#210](https://github.com/anthonykewl20/opzava/issues/210), DEPRIORITIZED but workable).

This is planning-contract evidence for final Ask Admin synthesis
[#220](https://github.com/anthonykewl20/opzava/issues/220); it does not authorize product
implementation, change canonical PRDs/ADRs, or revive any quarantined brief. No git/GitHub writes.

> **Reconciliation note (2026-07-18).** This memo folds in the deeper, prior branch draft of #216
> (the "Ask Admin delegation boundary" amendment). That branch introduced a **three-path separation**
> (conversation support / managed employee / governed DevTicket) and a detailed **closed-tool
> conversation-support module** (`opzava_support_delegate`, `SupportDelegationAttempt`,
> `AssistantDelegationCoordinator`, a Mainframe extension, retention, behavioral contracts). It is folded
> in here as additional depth and as candidate open decisions carried to #220. Where the branch reaches a
> *different* conclusion than the converged dual-provider memo (notably on the v1 model-facing delegation
> tool surface), the conflict is flagged inline and analyzed in `RECONCILE-NOTES-216.md`. The converged
> framing, structure, and recommendations below remain the base; nothing the landed memo already held is
> dropped.

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

### Three non-interchangeable delegation paths (from the branch — load-bearing framing)

Ask Admin neighbors **three** delegation paths that look similar but must never borrow one another's
identity, approval, lease, lane, or completion authority. The same model vendor or physical machine may
participate in more than one path, but identity and authority never transfer between them; correlation
uses opaque references only.

| Path | Product record and owner | Runtime | May mutate governed work? | Progress authority |
| --- | --- | --- | --- | --- |
| **Conversation support** | AI Workforce; `SupportDelegationAttempt` child of one `AssistantConversation`, governed by PRD-005 | One isolated native OpenClaw subagent behind an Opzava adapter | No | Safe support-lifecycle projection only |
| **Managed employee work** | `AgentDispatch` + one or more `Assignment` records; [ADR-008](../../adr/ADR-008-ai-workforce.md) AI Workforce | Selected `AgentEmployee` sessions/runs | Only through that workflow's authorized ports and approvals | AI Workforce assignment/dispatch projection |
| **DevTicket implementation** | DevTicket command model, Claim Attempt, Execution Lease, Runner binding; ADR-017 / [PRD-019](../../prd/PRD-019-dev-board.md) / WF-230 / WF-232 | Enrolled local or admitted cloud Runner using the selected harness | Yes, only within exact governed authority | Dev Board lanes and signed Runner/provider facts |

Canonical prose uses **Assistant Conversation** and **Support Delegation Attempt**; their internal
aggregate/type identifiers (`AssistantConversation`, `SupportDelegationAttempt`) are aliases, not
separate domain terms.

The remainder of this memo (§1–§6, §3.1–§3.7, §4–§6) consumes the **DevTicket path** — that is #216's
primary consumed scope and what synthesis #220 locked (§3.7 re-scope). The **conversation-support**
path is carried as an open decision in §3.8 (with its closed-tool surface, state machine, runtime
policy, retention, and behavioral contracts), and the **managed-employee** boundary is fixed in §2.2.
Both are bounded here so neither is blurred with DevTicket execution.

The question this memo actually answers, restated cleanly:

> How does **Ask Admin** (the Lead Orchestrator) delegate card/DevTicket work to subagents/runners
> through the **governed DevTicket command surface** — the delegation command envelope, what stays
> Ask-Admin-owned vs runner-owned, how progress/receipts surface in chat, how failure and disconnect
> are handled with **no automatic failover**, and where the **server-side hard gate** (never
> Done / never approve-merge autonomously) sits — and how the adjacent **conversation-support** and
> **managed-employee** delegation paths stay non-interchangeable with it.

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
the governed command seam and watches the receipts come back. This inversion holds equally for the
conversation-support path (§3.8): Ask Admin requests support; the coordinator owns the runtime
dispatch and the support child never gains DevTicket authority.

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
- **Human commands and runtime observations use different admission paths (from the branch).**
  Human `start`/`status`/`cancel` commands reauthorize the current principal, tenant, conversation
  access, delegation reference, and effective policy at call time. Authenticated runtime observations
  (e.g. a signed Runner receipt or a support-child lifecycle event) use the authenticated
  runtime-ingress contract — current broker↔Gateway connection identity, tenant Gateway route,
  extension ID/version, dispatch ID/generation, plugin record version, native correlation, event
  ID/sequence/hash, schema version — and **do not require a still-authorized human session** to record
  truthful terminal/containment facts. Recipient projection then independently reauthorizes the
  current human/session/conversation before disclosing status or result content. An opaque reference
  is a locator only; it is never authority (`PRD-005:220, 337-357`; `ADR-017:447-466`; branch
  "Authorization and provenance").

### 2.2 Ask-Admin-owned vs runner-owned — the authority split (and the three-path boundary)

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

#### Managed-employee work is a separate path — ADR-008 (from the branch)

When a request is real project/business work delegated to an employee, [ADR-008](../../adr/ADR-008-ai-workforce.md)
applies, not the DevTicket command seam and not conversation support:

1. authorize and resolve the work target;
2. create/reuse `AgentDispatch` for the human work bridge when applicable;
3. create an `Assignment` for the selected `AgentEmployee`;
4. run through the employee's own policy, workspace, knowledge scope, approvals, and runtime;
5. project assignment/dispatch status into the conversation.

When a DevTicket's Execution Assignee is an `AgentEmployee`, AI Workforce must create/cross-link the
applicable `AgentDispatch` and `Assignment` for employee identity, knowledge/autonomy policy, load,
session, and report projection. Those records **do not admit work or move lanes**: Dev Board alone
owns Ready, assignment to the DevTicket role, Claim Attempt, Runner/lease/fence, signed start,
Review, and Done (`ADR-017`; `wf230:135-181`). Ephemeral conversation support (§3.8) never
impersonates or substitutes for an `AgentEmployee` — bounded conversation analysis is not a workforce
allocation or project responsibility.

#### DevTicket lane detail (from the branch)

- Backlog work remains planning-only and cannot start.
- Todo is the only claimable ordinary lane. `AssignTodo` may assign without starting; only a valid
  `ClaimAndStart` can begin one ordinary ticket (`wf230:1851`, `1233-1251`).
- `ClaimAndStart` enters Starting/Claim Attempt first; In Progress is projected only after the
  enrolled Runner returns the accepted signed `execution_started` receipt for the exact lease,
  fence, contract, runner, worktree, process, and nonce (`wf230:135-181`, `2224-2244`).
- An approved Sprint alone may use `autonomous_serial`; its controller selects the next eligible
  member in order. A support child cannot select Sprint work (`ADR-017:513-528`).

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
- **Native completion is push-based; no polling (from the branch).** Native completion is delivered
  back to the requester session as a push/announce with a stable delivery idempotency key;
  `sessions_yield` is the native wait primitive and the docs explicitly reject polling session
  history or subagent lists in a loop. The Opzava adapter admits the completion once, updates the
  product record, and emits one realtime/conversation event; browser reconnect backfills Opzava
  state first. The model and browser never loop over `sessions_list`, `sessions_history`,
  `subagents`, or `sessions_yield` (`docs/openclaw/tools/subagents.md`;
  `docs/openclaw/concepts/session-tool.md`; `PRD-005:161, 173`).
- **Safe projection vocabulary for the support path (from the branch).** The chat may show only
  product-owned safe states — e.g. Preparing support, Running support, Cancellation requested, Result
  ready, Failed, Timed out, Cancelled, or Runtime state unknown. Each projection includes a safe
  purpose/label, freshness, last observation, and a bounded next action. It does not expose native
  session keys, runtime paths, provider payloads, hidden prompts, or child transcripts. Cancelling
  conversation support only cancels that support attempt; it does not stop a DevTicket, release an
  Execution Lease, pause a Sprint, cancel an `Assignment`, or resolve an Incident — those require
  their owning commands (`PRD-005:165-173`; branch "Progress, cancellation, and UI projection").
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

#### Extended failure/recovery contract (from the branch — additional sad paths)

The DevTicket sad paths above govern execution. The conversation-support path (§3.8) and the
command-request seam add the following deterministic behaviors, all consistent with
"degrade truthfully" (#225) and no-automatic-failover:

| Failure | Required behavior |
| --- | --- |
| Duplicate start, same fingerprint | Return the same record/projection; no second dispatch |
| Duplicate key, different fingerprint | Reject collision; no dispatch |
| New start in the same human turn | Return same semantic record or reject `turn_already_delegated`; no dispatch |
| New turn while predecessor is nonterminal | Reject; one-conversation guard prevents replacement |
| Adapter times out after dispatch | Mark `unknown`; reconcile; never blind-respawn |
| An `unknown` attempt appears absent | Preserve `unknown`; no absence-based retry proof or replacement-spawn path |
| Runtime unavailable during reconciliation | Preserve `unknown`, freshness, and human remediation |
| Child policy/model/sandbox mismatch | Fail before running or contain; do not deliver result as valid |
| Child attempts a forbidden tool | Deny, audit, and fail/contain without widening policy |
| Prompt injection in supplied evidence | Treat as quoted data; child has no tools/authority; parent verifies output |
| Principal/conversation access revoked | Deny status/result; coordinator may still contain runtime work |
| Cancel races completion | Proven terminal result wins; otherwise await authenticated cancellation/terminal fact |
| Deadline after dispatch | Commit `cancel_requested(runtime_state_unknown)`; never mark a live child expired |
| Result acknowledgement lost | Retry exact ack; hard-purge content by deadline and retain a non-replayable tombstone |
| Provider result duplicate/out of order | Idempotent versioned admission; contradiction creates an attention/conflict record |
| Dev Board command unavailable | Report not started; no support-subagent coding fallback |
| Runner disconnect | Consume Dev Board owner facts; no automatic cloud/subagent failover |

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
  (`#210` locked decisions; `PRD-005:220, 247`). This applies identically to support-child output:
  it is untrusted generated content that cannot override policy, provide an approval, satisfy a
  behavioral contract, close a ticket, move a lane, or become Review evidence (branch "Authorization
  and provenance").

### 2.6 The Ask Admin skill/tool subset boundary (#243) and the as-built OpenClaw facts

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
  the #212 research already mandated (`#210` map body, #212 summary). An empty `allow` list is **not**
  the guarantee for a support child, because OpenClaw treats an empty allow as unrestricted at that
  policy stage — deny-all (`tools.deny: ["*"]`) plus a live effective-inventory equality check is the
  gate (branch "Exact runtime policy").
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

#### Current OpenClaw runtime facts and repository gap (from the branch — capability grounding)

The vendored [Sub-agents documentation](../../openclaw/tools/subagents.md) and current Mainframe
source establish the runtime facts the tool-subset decision depends on (rechecked against current
official sources 2026-07-17: [Sub-agents](https://docs.openclaw.ai/tools/subagents),
[Session tools](https://docs.openclaw.ai/concepts/session-tool),
[Gateway security](https://docs.openclaw.ai/gateway/security); pinned
[Plugin runtime](../../openclaw/plugins/sdk-runtime.md) and [Plugin hooks](../../openclaw/plugins/hooks.md)
checked against the vendored Mainframe source):

- `sessions_spawn` is **non-blocking** and creates a random child session/run. It accepts a
  model-facing `taskName`, but the docs describe that name only as a bounded targeting handle;
  duplicate active/recent names can be ambiguous and it is **not an external idempotency key**.
- `sandbox: "require"` rejects a target that is not sandboxed. The raw tool also accepts caller
  choices such as target agent, current working directory, runtime, model, thinking level, thread,
  context mode, cleanup, and attachments — arguments the branch deems **too broad to expose** for
  this contract.
- Native completion is delivered back to the requester session as a **push/announce** with a stable
  delivery idempotency key; `sessions_yield` is the native wait primitive and the docs explicitly
  reject polling session history or subagent lists in a loop.
- A child result is **evidence for the parent to verify**, not user instruction or proof that the
  original work is done.
- Mainframe's current `subagents` tool is **list-only**; it is not the product state machine
  required for durable start/status/cancel semantics.
- `sessions.delete` over normal Gateway RPC is **admin-scoped**; Ask Admin must not receive that
  method or `operator.admin` to implement cancellation.

These are runtime capabilities, not Opzava authority; implementation must pin and revalidate the
actual Mainframe version and prove the effective policy on the real Gateway. The target contract
does not exist today: `ask-admin-agent.ts` currently appends `sessions_spawn`, `subagents`, and
`group:sessions` through `ASK_ADMIN_DELEGATION_TOOL_ALLOW` (`:49-53, 317-323`), and the current
provider-shaped subagent roles are not `SupportDelegationAttempt` or managed `AgentEmployee`
records. Mainframe has plugin runtime helpers to run a plugin-owned subagent, wait/read its
messages, and delete a session owned by the same plugin, but it does not yet expose the
product-specific durable start-once, broker lifecycle event, result-admission, or hard-purge
contract that §3.8 requires. This gap is the substance of the open decision in §3.8.

## 3. Open decisions (grilling)

Each item below is a decision the landed contracts do **not** make, framed as a grilling question
with a **recommended default**. These are the questions #216 owes #220. §3.1–§3.7 are the converged
dual-provider recommendations; §3.8–§3.10 are carried in from the deeper branch draft (the
conversation-support closed-tool path, its retention/redaction contract, and the routing-etiquette
detail) and are explicitly candidate decisions for #220 — they do not override §3.1–§3.7 where the
two tension (flagged inline and in `RECONCILE-NOTES-216.md`).

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

> ⚠ **Tension with §3.8.** §3.8 carries a stricter, branch-sourced alternative: **remove** the raw
> `sessions_spawn`/`subagents`/`group:sessions` subtree entirely and expose a single closed
> `opzava_support_delegate` tool backed by a new Mainframe extension and coordinator. The two reach
> different conclusions on the v1 model-facing delegation surface. Synthesis #220 **adopted §3.1
> for v1** (`wf220-ask-admin-v1-assembled-spec.md` §1.13 lists `sessions_spawn`/`sessions_yield`/
> `subagents` in the 25-name surface; Slice A12 resolves `group:sessions` via `alsoAllow`). §3.8 is
> therefore carried as a candidate hardening / deeper path, not as an override. Full conflict
> analysis: `RECONCILE-NOTES-216.md` §1.A.

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

**Routing-etiquette detail (from the branch).** Before choosing a tool, `opzava-pm` must classify
the requested outcome: bounded evidence analysis/comparison/summary uses only the support path
(§3.8's `opzava_support_delegate`); employee responsibility uses the ADR-008 dispatch/assignment
application command (§2.2); DevTicket shaping, assignment, claim/start, lane, Sprint, or Review
intent uses the exact Dev Board command/read Adapter; ambiguity or a missing owner gate produces a
clarification or safe owner deep link, never a raw native session fallback. The guidance tells the
model to name the selected owner, report only owner-projected progress, keep support output
non-authoritative, and never infer approval, readiness, assignment, start, Review, or Done from
conversation text. This is prompt/skill etiquette only — #219 may refine the wording but must
preserve this boundary; the closed tool schema, effective tool policy, application authorization,
Dev Board command gates, Runner receipts, and Review gates remain the deterministic enforcement
(branch "`opzava-pm` routing etiquette").

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
command/request/claim lifecycle from Dev Board projections, not raw execution internals (§2.3). The
support-path projection (§3.8) is rendered separately from DevTicket progress so a support card
never reads as governed-work progress (`PRD-005:165-173`).

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
The same fail-fast applies to the support path (§3.8): if governed execution is unavailable, Ask
Admin may still perform separately authorized planning, card shaping, creation, or `AssignTodo`
commands where their gates pass, and must say execution did not start; there is **no
create+assign-to-subagent fallback** and **no coding-subagent fallback**.

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
without putting admin authority in the model's hands. For the support path, cancellation must also
avoid `operator.admin`: a plugin-owned child session lets cancellation use
`api.runtime.subagent.deleteSession` scoped to that owned session only, never `sessions.delete` over
admin-scoped Gateway RPC (§2.6; branch "Hidden coordinator interface").

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
remain open for #220. The branch's broader three-path framing (§Scope) and the conversation-support
module (§3.8) are carried as adjacent depth #220 may fold in, but #216's locked consumed scope
remains the DevTicket command path.

### 3.8 The conversation-support delegation path (closed-tool `opzava_support_delegate`) — **recommendation carried to synthesis #220 (not an owner-lock), from the branch draft**

> ⚠ **Conflicts with §3.1** on the v1 model-facing delegation tool surface. Synthesis #220 adopted
> §3.1 for v1; this subsection is carried as a stricter, more secure **candidate path** the owner
> may choose at sign-off. Full analysis: `RECONCILE-NOTES-216.md` §1.A. It is included here because
> it is the deepest unique substance in the branch and bounds the conversation-support path that
> §3.1 does not address.

**Decision needed.** Ask Admin sometimes needs a bounded, non-mutating analysis child (summarize /
identify risks / identify gaps / check consistency / compare options / draft a summary) over
sanitized evidence — work that is **not** DevTicket execution and **not** an `AgentEmployee`
assignment. The raw `sessions_spawn`/`subagents` subtree (§3.1) can serve this, but the raw tool
exposes unsafe caller-selected arguments (target agent, cwd, runtime, model, thread, context mode,
attachments) and lacks product idempotency (`taskName` is not an idempotency key — §2.6). Should
this path instead be a single closed product tool?

**Recommended default (branch design).** Expose exactly **one** model-facing delegation tool,
`opzava_support_delegate`, backed by an AI Workforce `AssistantDelegationCoordinator` and a narrow
Mainframe extension, and **remove** the raw `sessions_spawn`/`subagents`/`group:sessions` surface.
Native `sessions_*`/`subagents` tools are adapter-internal and never visible to Ask Admin's model.
The tool's input is a closed JSON Schema (every branch rejects unknown fields); it admits only
`start`/`status`/`cancel` actions over a bounded `purpose`/`operation`/`evidenceRefs` union —
project delivery, employee allocation, implementation, acceptance, Review, and mutation cannot be
represented and therefore fail schema/admission before dispatch.

- **A `SupportDelegationAttempt`** is a child runtime-support/idempotency record of one
  `AssistantConversation`: it binds tenant, conversation, parent turn, parent runtime/tool-call
  identity, current human principal; server-selected support purpose/operation and bounded request
  fingerprint; natural idempotency key, start-command fingerprint, and separate cancellation command
  keys; server-selected Support Delegation Policy ID/revision/digest, resolved model identity,
  sterile role/workspace/bootstrap manifest, sandbox proof, and deny-all effective child-tool
  inventory proof; deterministic correlation handle plus opaque native run/session refs; lifecycle
  state/version, dispatch-intent generation, deadlines, observation cursor, safe status, sanitized
  terminal summary, audit refs; and created/updated/terminal timestamps with retention/redaction
  disposition. It **never** contains a DevTicket contract, assignment, project-work target,
  acceptance decision, raw prompt/provider payload, chain-of-thought, secret, raw Gateway DTO,
  filesystem path, or credential. It is not project work, an employee `Assignment`, an
  `AgentDispatch`, a DevTicket, a Review Attempt, or evidence that any governed work is complete.
- **V1 support children have an exactly empty effective tool set.** They may only reason over
  bounded, sanitized evidence supplied in their isolated prompt for one non-mutating analysis,
  comparison, or summary purpose. They cannot research independently, read files or memory, call the
  web, run code, edit state, invoke product tools, nest sessions, or receive secrets.
- **State machine:** `reserved → dispatching → running → succeeded | failed | cancelled`, with
  `unknown` (OpenClaw may still own a live child; user-visible and actionable; never normalized to
  failed/cancelled/expired/safe-to-retry), `cancel_requested` (nonterminal; may retain
  `runtime_state_unknown`; a proven terminal result wins the race), and `expired` (allowed only while
  the reservation is authoritatively proven never dispatched; a deadline after dispatch atomically
  commits cancellation intent and moves to `cancel_requested(runtime_state_unknown)`). Terminal
  states never regress; late duplicate observations are no-ops; contradictory observations produce a
  safe conflict/attention record instead of rewriting history. Every transition uses an expected
  record version and dispatch generation; runtime observations additionally bind the current plugin
  record version and a strictly increasing event sequence (duplicate event ID/hash is a no-op; same
  sequence/event ID with different bytes is a security/integrity conflict).
- **Idempotency and uncertain results (at-least-once observation, idempotent projection — not a
  false exactly-once runtime claim).** The start natural key is `tenant + conversation + parent
  human turn + parent tool call + caller command key`; its fingerprint contains principal, normalized
  purpose/operation, resolved authorized evidence identities/versions/digests, and selected policy
  ID/revision/digest; the first accepted request stores the complete fingerprint before any runtime
  call. V1 also holds a durable unique support slot on `tenant + conversation + parent human turn`;
  a second tool call/key in the same turn with the same semantic fingerprint returns the existing
  Attempt, a different fingerprint is rejected as `turn_already_delegated`, and a partial unique guard
  permits at most one nonterminal Attempt per conversation — so a new human turn cannot replace an
  `unknown`/`running`/`dispatching`/`cancel_requested` Attempt. Reservation and dispatch intent
  commit before invoking OpenClaw; the outbox uses the attempt ID and dispatch generation as the
  stable plugin `dispatchId`, and worker retry always replays that same ID. A crash before the plugin
  call replays safely; a crash after reservation/native acceptance replays the same `dispatchId` and
  receives the existing plugin record; if the extension cannot establish whether its reserved dispatch
  created a native child, the attempt becomes `unknown` and v1 never respawns that logical request. A
  fresh attempt requires a new human turn/tool call and command key after the first is terminal.
- **Exact runtime policy `ask-admin-support/v1`** (coordinator-constructed, not model-constructed):
  dedicated `ask-admin-support` native role (no caller-selected agent); isolated native `subagent`
  runtime (run mode, no thread/fork/ACP/attachments); one server-resolved model (no per-call override;
  metered/pay-per-token providers excluded from v1); fixed versioned prompt template ≤ 4 KiB UTF-8
  with 1–16 typed evidence refs (2–16 for compare) and ≤ 64 KiB / ≤ 16,384 input tokens of resolved
  sanitized evidence; ≤ 2,048 output tokens and 8 KiB text with a 120-second deadline; one child per
  attempt, at most 1 nonterminal attempt per conversation and 4 per tenant; maximum nesting depth 1
  with no session/subagent tools; dedicated empty/curated workspace with no project checkout, user
  files, credentials, writable mount, or shared agent state; reviewed minimal `AGENTS.md`/`TOOLS.md`
  (policy only), `skills: []`, no SOUL/user/memory/corpus/extraPaths/transcript-search injection;
  deny-all `tools.deny: ["*"]` with no plugin/MCP/tool-search projection and a live effective
  inventory that must equal the empty set; `sandbox: "require"`, workspace access `none`, read-only
  runtime mounts, no child network/browser access; terminal result held only for acknowledged
  delivery with the owned session archived immediately afterward and hard-purged within 24 hours.
  Native subagents inject target-role bootstrap files even with a different working directory, so the
  dedicated sterile role/workspace/bootstrap manifest is hashed into the policy proof; the application
  supplies only the fixed-template purpose/operation and sanitized evidence **in addition to** that
  trusted minimal bootstrap — it never inherits Ask Admin's transcript, skills, memory, workspace, or
  MCP projections.
- **Hidden coordinator interface** (`AssistantDelegationCoordinator`, the deep module):
  `startSupportDelegation(authorizedTurn, boundedRequest)`; `getSupportDelegation(currentPrincipal,
  delegationRef)`; `cancelSupportDelegation(currentPrincipal, delegationRef, commandKey)`;
  `admitRuntimeObservation(authenticatedObservation)`; `projectCompletion(authorizedRecipient,
  delegationRef)`. It depends on a narrow Runtime-Control `AssistantSupportRuntimePort` for typed
  `startOnce`/`getStatus`/`requestCancel`/`acknowledgeResult` operations over server-constructed
  arguments; general Gateway/session control does not leak into callers. The coordinator hides
  reservation, request fingerprints, collision handling, native argument construction, OpenClaw
  adapter calls, unknown-outcome reconciliation, cancellation, result sanitization, retention, audit,
  and realtime publication — and never owns DevTicket, GitHub, Runner, Review, or approval policy
  beyond its own support-child state.
- **Additive Mainframe extension `extensions/opzava-support-delegation`** (build prerequisite before
  the model-facing tool can enable): registers only `opzava.support.start`/`status`/`cancel`/`ack`
  under `operator.write`, admitted only from the coordinator Adapter by exact ACL and Gateway
  route/device identity; accepts an Opzava-created `dispatchId`/generation/fingerprint, durably
  reserves that identity before calling `api.runtime.subagent.run`, and returns the existing record
  for an identical replay while rejecting a fingerprint collision; creates a plugin-owned child
  session so cancellation uses `api.runtime.subagent.deleteSession` without `operator.admin` and
  cannot target any other session; observes `subagent_spawned`/`subagent_ended` then uses the
  plugin-owned `waitForRun`/`getSessionMessages` helpers to obtain the latest visible assistant result
  (never assuming `subagent_ended` contains result text); publishes a versioned
  `opzava.support.lifecycle` event on the authenticated broker↔Gateway operator connection (an
  additive extension is the prerequisite if Mainframe cannot yet publish plugin lifecycle events
  there — not a reason to add a polling loop or callback secret); binds every event to plugin
  ID/version, tenant Gateway route, dispatch ID/generation, plugin record version, native
  run/session correlation, monotonic event sequence, event ID, outcome, content hash, and safe
  result; and stores a terminal result pending coordinator acknowledgement, then archives/deletes
  the owned native session. Its dispatch ledger is an extension-owned **non-evicting transactional
  SQLite store** (not the SDK's evictable keyed runtime store) that admits at most four nonterminal
  dispatch rows for its tenant Gateway route; start/cancel/result capture/acknowledgement/archive/
  purge each require the exact generation and expected row version (a lost CAS reloads/replays but
  never repeats the external effect); store open/migration/write failure, capacity exhaustion, or
  inability to commit a dispatch claim rejects admission before `api.runtime.subagent.run` with no
  in-memory fallback. Rows progress only through `reserved → starting → running | unknown |
  cancel_pending`; verified cancellation continues `cancel_pending → cancelled → purged`, a terminal
  result continues `terminal_unacked → archive_pending → archived → purged`, and
  `purged_unacknowledged` is the terminal-retention failure branch. A tombstone retains
  dispatch/fingerprint/generation, terminal class, result hash, event cursor, and purge proof — never
  content — for at least 30 days after purge and at least the coordinator command-idempotency
  horizon; tombstones are not capacity-evicted and a replayed old `dispatchId` returns the tombstone
  rather than starting a child. Browser code and the model never call these Gateway methods or see
  their runtime references; the extension has no Opzava Postgres access and makes no workflow
  decision.

This is a large, self-contained build (extension + coordinator + aggregate + adapter + policy +
projection). Because #220 locked §3.1 for v1, the owner decision is whether to schedule this as a
fast-follow hardening of the conversation-support path or to defer it; either way the raw subtree
(§3.1) is the v1 surface and this design bounds what a safer surface would look like.

### 3.9 Retention, redaction, and audit for delegated support output — **recommendation carried to synthesis #220 (not an owner-lock), from the branch draft**

**Decision needed.** How long does support-child runtime content (prompts, chain-of-thought,
provider responses, tool transcripts, native session history) persist, and what survives purge?

**Recommended default (branch contract).** `SupportDelegationAttempt` follows the owning
conversation's retention and deletion policy for user-visible operation/evidence labels, safe
progress, and terminal summary; soft deletion and purge never remove immutable audit/security facts
another policy requires. Required audit retains only the minimum safe identity, command digest,
policy/version, lifecycle transitions, authorization outcome, opaque runtime correlation refs,
terminal class, and redaction/deletion disposition. Raw prompts, chain-of-thought, provider
responses, tool transcripts, native session history, credentials, secret values, and Gateway DTOs
are **not** copied into the product projection; sanitized terminal output becomes a conversation
message only through the ordinary one-final-message idempotency and authorization path. The Mainframe
extension starts with native delivery disabled; after terminal observation it reads only the latest
visible assistant message, stores a bounded result plus content hash pending an `opzava.support.ack`
carrying exact dispatch/generation/record-version/result-hash and the verified product
result-admission receipt, and never promotes tool/tool-result content. Acknowledgement loss cannot
extend raw retention: `terminalAt + 24 hours` is an absolute deadline for native prompt/session/
result content; at that deadline the sweep hard-purges owned content even without acknowledgement,
CAS-transitions the ledger to `purged_unacknowledged`, retains only the safe tombstone, and emits/
replays a content-free lifecycle fact. If the coordinator never admitted the result, it records
terminal `failed(result_expired_before_admission)` plus operational attention; if it already admitted
the matching result and only the ack was lost, its durable content hash proves the existing product
terminal state and the replay only settles cleanup. Neither case permits a replacement spawn. The
extension must provide and prove that owned hard-purge sweep; if the public plugin SDK cannot
hard-purge an owned archive, a logged Mainframe rung-3 extension is a prerequisite, and cleanup
failure is visible operational attention that blocks new starts for the affected support role until
reconciled. No support delegation may ship if native prompt/result retention cannot meet this bounded
policy. Final retention/redaction duration and archive mechanics are consumed from their owning
policies at #220; this ticket does not invent a second archive system.

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

### 4.1 Behavioral contracts and validation gates (from the branch — for the implementation ticket)

The implementation ticket must prove these at real seams without relying on a model for deterministic
correctness. They are the acceptance gates for whichever delegation surface (§3.1 raw subtree or §3.8
closed tool) #220 locks; they are listed, not defaulted into fact.

1. **Exact tool inventory** — a live Gateway effective-policy probe for Ask Admin admits the chosen
   delegation surface and none of the unsafe raw args; a support child (§3.8) has an empty effective
   tool set because deny-all remains effective after role bootstrap, skill discovery, plugin
   projection, and MCP discovery.
2. **Durable idempotency** — real Postgres/application tests race identical and colliding
   start/cancel commands across browser retry, reconnect, worker restart, duplicate tool delivery,
   second tool calls in one human turn, and new turns while a predecessor remains nonterminal.
3. **Unknown spawn** — a fault-injecting OpenClaw adapter loses the spawn response after runtime
   acceptance; the attempt becomes `unknown`, survives restart, reconciles one correlated child, and
   never issues a blind replacement.
4. **Safe arguments** — hostile tool inputs (free-form task/target/action, invalid/overlong
   keys/refs/reasons, agent/model/runtime/cwd/thread/context overrides, attachments, secrets,
   DevTicket implementation, tool widening) are rejected by closed schema or server admission before
   native dispatch and produce safe audit.
5. **Authorization** — another tenant/user, revoked role, deleted conversation, stale policy, guessed
   opaque ref, and stale cancellation key cannot start/read/cancel or receive a result.
6. **Cancellation** — reservation cancellation, running cancellation, cancellation/completion race,
   crash after `cancel_pending`, restart/reissue, post-dispatch deadline, provider loss, and late
   duplicate terminal observations preserve the state rules above and never project cancellation from
   request intent alone.
7. **Push projection** — native completion produces one sanitized durable/realtime result; browser
   reconnect backfills it without polling or duplication.
8. **Extension boundary (§3.8)** — the exact-scope Mainframe extension uses its non-evicting
   transactional ledger to replay one `dispatchId`, rejects start when that ledger is
   unavailable/full, retrieves only its owned visible assistant result, emits authenticated monotonic
   lifecycle events, cancels only its owned session without `operator.admin`, and rejects
   cross-plugin/session targeting.
9. **Retention (§3.9)** — exact acknowledgement and lost-ack/restart races preserve product result
   state; ack before product commit is rejected, crash after `archive_pending` reissues the exact
   owned effect, the hard-purge sweep removes native prompt/session/result artifacts within 24 hours,
   preserves a non-replayable content-free tombstone, and creates visible attention while blocking new
   starts when cleanup fails.
10. **Boundary enforcement** — support output cannot create/assign/claim/move/approve/complete a
    DevTicket, create an `Assignment`/`AgentDispatch`, mutate GitHub, operate a Runner, or satisfy
    Review.
11. **User-level ordinary work** — an authenticated admin asks Ask Admin to work on a Todo ticket;
    the chat shows the accepted owner command and Starting state; the Card reaches In Progress only
    after the exact Runner-signed start receipt. A simultaneous UI/Slack/CLI claim has one winner.
12. **Disconnect** — after local start, disconnect produces owner-reported containment/Blocked and a
    safe Slack/chat next action. No cloud or support-subagent failover occurs.
13. **Managed employee + DevTicket** — assign an `AgentEmployee` to a Ready Todo DevTicket and prove
    the linked `AgentDispatch`/`Assignment` reports employee identity/session while the Card remains
    Todo/Starting until Dev Board independently accepts the exact Runner-signed start receipt.
14. **Real browser** — authenticated local-stack journeys show start/status/cancel, unknown runtime,
    revocation, safe terminal result, keyboard/focus/live-region behavior, and redaction at mobile
    and desktop widths in light/dark mode.

Support-child model output may be exercised in a separately labeled optional compatibility smoke; it
is never the deterministic contract gate.

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
- **Raw-subtree safety risk (from the branch):** keeping `sessions_spawn`/`subagents` as
  model-facing tools (§3.1) leaves the unsafe caller-selected args and the non-idempotent `taskName`
  one schema/admission mistake away from exposure (`docs/openclaw/tools/subagents.md`). The §3.8
  closed-tool design removes this risk; if #220 keeps §3.1 for v1, the closed-tool path should be
  tracked as a fast-follow hardening.
- **Unbuilt-extension dependency (from the branch):** the §3.8 design depends on a Mainframe
  extension that does not yet exist; until it is built and proven, the conversation-support path
  cannot ship safely, and a polling-loop or callback-secret shortcut must not be substituted.

## 6. Rejected alternatives (from the branch)

- **Expose `sessions_spawn` plus `group:sessions`:** rejected by the branch because it exposes unsafe
  arguments, lacks product idempotency, leaks runtime identity/control, and blurs support with
  governed work. (Note: this is exactly the §3.1 v1 surface #220 locked — recorded as CONFLICT A in
  `RECONCILE-NOTES-216.md`, not silently dropped.)
- **Use `subagents`/history as the product status surface:** rejected because native runtime lists
  are not Opzava authorization, retention, audit, or durable workflow state.
- **Treat every child as an `AgentEmployee`:** rejected because bounded conversation analysis is not
  a workforce allocation or project responsibility (ADR-008).
- **Reuse Q17 dispatch:** rejected because Q17 is quarantined and conflicts with the Dev Board
  command/Runner model (`CLAUDE.md`; `ADR-017:17-27`).
- **Fallback from unavailable Dev Board execution to a coding subagent:** rejected because it would
  bypass Ready, claim, lease, Runner, worktree, Review, dependency, and approval gates.
- **Mark a timed-out spawn failed/expired and retry:** rejected because OpenClaw may still own a live
  child and `taskName` is not an idempotency key (`docs/openclaw/tools/subagents.md`).
- **Give the child generic read/web/memory tools:** rejected for v1 because filesystem corpus,
  tenant-memory scope, prompt-injection, SSRF/private-network, spend, and data-retention boundaries
  are not yet represented by purpose-built support tools.

## 7. Required implementation ordering (from the branch)

1. #220 consumes this resolution together with #212/#219 and defines one exact Ask Admin effective
   tool inventory. It supersedes WF-212's raw delegation-session-tool shortlist only if the owner
   adopts §3.8; otherwise §3.1's resolved subtree stands.
2. If §3.8 is adopted, build and prove `extensions/opzava-support-delegation`, including durable
   `dispatchId` replay, exact-scope lifecycle push, plugin-owned result/cancel handling,
   acknowledgement, archive, and the bounded hard-purge path; the product tool remains disabled
   until this prerequisite passes.
3. Build the product-owned tool (or the §3.1 resolved subtree), `SupportDelegationAttempt`
   (if §3.8), coordinator, `AssistantSupportRuntimePort` adapter, authorization, retention, and safe
   projection before changing Ask Admin's agent policy.
4. Configure/prove the sterile support role, deny-all empty child inventory, sandbox, bounds,
   bootstrap/skill/MCP/network exclusions, and native completion adapter.
5. Atomically install the new Ask Admin policy and broker expected inventory; remove or resolve the
   current additive `ASK_ADMIN_DELEGATION_TOOL_ALLOW` behavior and every raw native delegation-tool
   leak.
6. Run the deterministic contract tests (§4.1) and the real local-stack user journeys before any
   ticket claims delegation works.

## 8. Exact synthesis handoff to #220 (from the branch)

#220 must:

- make the three-path separation (§Scope) normative in the final Ask Admin v1 spec;
- decide the model-facing delegation surface — §3.1 resolved subtree (v1, already locked) vs §3.8
  closed `opzava_support_delegate` tool (fast-follow hardening) — and record the decision explicitly
  (CONFLICT A);
- if §3.8 is adopted, amend WF-212's tool policy so `opzava_support_delegate` is the only
  conversation-support tool and raw native session/subagent tools are denied; otherwise pin the §3.1
  resolved names;
- preserve #219 skill etiquette as prompt guidance only, never enforcement or authority;
- define the exact UI copy/projection for long-running support separately from DevTicket progress;
- reconcile #213 conversation retention and #225 degraded states with the attempt lifecycle (§3.9);
- carry #222 verified-human provenance and current authorization into every operation;
- cut implementation tickets only after its remaining dependencies are resolved, with the §4.1 tests
  and behavioral contracts copied into their acceptance gates.

## 9. Evidence register

Every rule above traces to one of:

- `docs/adr/ADR-017-dev-board-authority-sync-execution.md` — authority split, four ledgers, Runner
  receipt trust (`:447-466`), disconnect/no-failover (`:477-486`), Runner≠assignee (`:368-373`),
  Q17 supersession (`:17-27`).
- `docs/adr/ADR-008-ai-workforce.md` — managed AI Workforce identity, `AgentDispatch`, and
  `Assignment` (the managed-employee path, §2.2; from the branch).
- `docs/prd/PRD-019-dev-board.md` — DevTicket workflow and execution authority product contract
  (from the branch).
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
- `docs/openclaw/tools/subagents.md`, `docs/openclaw/concepts/session-tool.md`,
  `docs/openclaw/plugins/sdk-runtime.md`, `docs/openclaw/plugins/hooks.md` — vendored OpenClaw
  capability facts grounding §2.6 and §3.8 (from the branch); web mirrors rechecked 2026-07-17:
  `https://docs.openclaw.ai/tools/subagents`, `https://docs.openclaw.ai/concepts/session-tool`,
  `https://docs.openclaw.ai/gateway/security`.
- Issues: #216 (body + 4 comments), #210 (map body + comments), #230/#232/#243 (resolution
  comments + landing commits `bbe61690` / `4d884957` / `b006f636`), #212/#221/#225 (via #210 map
  body and `wf221-ask-admin-v1-skills.md`), #194 (prototype parallel-fix reference), #220 (synthesis
  that consumed this memo — `wf220-ask-admin-v1-assembled-spec.md`).

No claim here revives Q17 or #147–#157. Where a #216 open question (§3) is unresolved, it is labeled
as an owner decision for #220 (recommendation, not owner-lock), not silently defaulted into the spec.
Where the branch draft reached a different conclusion than the converged memo (§3.1 vs §3.8), the
conflict is recorded in `RECONCILE-NOTES-216.md` and the synthesis's v1 adoption of §3.1 is noted
inline.
