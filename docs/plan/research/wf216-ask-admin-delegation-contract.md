# WF-216 — Ask Admin delegation boundary

Status: **Prepared resolution for Wayfinder #216. This amendment is inactive until its commit lands,
#216 closes with verification evidence, and map #210 explicitly designates it current input for
final synthesis #220. Product code is not implemented.**

Date: 2026-07-17

Consumer: Ask Admin Wayfinder map #210 and final synthesis #220.

## Decision summary

1. Ask Admin has three neighboring but non-interchangeable delegation paths: ephemeral conversation
   support, managed `AgentEmployee` work, and governed DevTicket execution. No path may borrow
   another path's identity, approval, lease, lane, or completion authority.
2. Ephemeral conversation support uses one Opzava-owned model-facing tool,
   `opzava_support_delegate`, backed by an `AssistantDelegationCoordinator`. Native OpenClaw
   `sessions_*` and `subagents` tools are adapter-internal and never visible to Ask Admin's model.
3. A `SupportDelegationAttempt` is a child runtime-support/idempotency record of one
   `AssistantConversation`. It is not project work, an employee `Assignment`, an `AgentDispatch`, a
   DevTicket, a Review Attempt, or evidence that any governed work is complete.
4. V1 support children have an exactly empty effective tool set. They may only reason over bounded,
   sanitized evidence supplied in their isolated prompt for one non-mutating analysis, comparison,
   or summary purpose. They cannot research independently, read files or memory, call the web, run
   code, edit state, invoke product tools, nest sessions, or receive secrets.
5. The coordinator durably reserves the attempt and dispatch intent before invoking OpenClaw. A
   deterministic native task handle is correlation only, not an exactly-once guarantee. After an
   unknown spawn outcome, v1 never spawns a replacement for that logical request. It accepts only
   exact-generation observations or cancellation until the attempt becomes terminal; any later
   attempt requires a new human turn and command key.
6. Human `start`, `status`, and `cancel` commands reauthorize the current principal, tenant,
   conversation access, delegation reference, and effective policy. Native observations use the
   authenticated runtime-ingress contract even if the human session has ended; result disclosure
   independently reauthorizes its current recipient. An opaque reference is not authority.
7. Native completion remains push-based. The adapter maps it idempotently into the Opzava
   conversation/realtime path; neither the model nor browser polls OpenClaw sessions.
8. Managed employee work continues through ADR-008 `AgentDispatch` plus `Assignment`. Ephemeral
   support never impersonates or substitutes for an `AgentEmployee`.
9. DevTicket implementation starts only through the Dev Board command boundary, Execution Admission,
   an enrolled Runner, a fenced Execution Lease, and a verified signed `execution_started` receipt.
   Ask Admin and its support child cannot move a lane, claim a ticket, satisfy Review, or fall back
   to coding when governed execution is unavailable.
10. Ordinary DevTicket execution still requires an explicit human-directed claim for one ticket.
    `autonomous_serial` remains exclusive to one approved Active Sprint. The original authenticated
    human/conversation/turn/tool-call provenance survives every Ask Admin command request.

## Why the ticket premise changed

Issue #216 originally asked Ask Admin to consume the quarantined Q17 dispatcher (#152–#154). Q17 and
issues #147–#157 are frozen historical evidence, not executable briefs. Their old generic Task
pipeline cannot authorize new work.

The replacement boundaries are now explicit:

- [ADR-008](../../adr/ADR-008-ai-workforce.md) owns managed AI Workforce identity, `AgentDispatch`,
  and `Assignment`.
- [ADR-017](../../adr/ADR-017-dev-board-authority-sync-execution.md) and
  [PRD-019](../../prd/PRD-019-dev-board.md) own DevTicket workflow and execution authority.
- [WF-230](wf230-devticket-command-model.md) owns DevTicket commands, Claim Attempts, signed-start
  arbitration, lanes, leases, and containment.
- [WF-232](wf232-runner-control-protocol.md) owns enrolled Runner delivery, signed observations,
  local/cloud selection, process containment, and the no-automatic-failover rule.
- [PRD-005](../../prd/PRD-005-assistants-chat.md) specifies assistant conversations, human
  provenance, and safe runtime projections. The AI Workforce context owns the Assistant Conversation
  module; Runtime-Control supplies its broker-mediated native-runtime adapter.

This resolution consumes those owners. It does not recreate Q17 under a new name.

## Source evidence and limitations

### Current OpenClaw facts

The vendored [Sub-agents documentation](../../openclaw/tools/subagents.md) and current Mainframe
source establish the following runtime facts:

- `sessions_spawn` is non-blocking and creates a random child session/run. It accepts a model-facing
  `taskName`, but the documentation describes that name only as a bounded targeting handle.
  Duplicate active/recent names can be ambiguous; it is not an external idempotency key.
- `sandbox: "require"` rejects a target that is not sandboxed. The raw tool also accepts caller
  choices such as target agent, current working directory, runtime, model, thinking level, thread,
  context mode, cleanup, and attachments. Those arguments are too broad to expose for this contract.
- Native completion is delivered back to the requester session as a push/announce with a stable
  delivery idempotency key. `sessions_yield` is the native wait primitive; the docs explicitly
  reject polling session history or subagent lists in a loop.
- A child result is evidence for the parent to verify. It is not user instruction or proof that the
  original work is done.
- Mainframe's current `subagents` tool is list-only. It is not the product state machine required
  for durable start/status/cancel semantics.

Current official sources were rechecked on 2026-07-17:

- [OpenClaw Sub-agents](https://docs.openclaw.ai/tools/subagents)
- [OpenClaw Session tools](https://docs.openclaw.ai/concepts/session-tool)
- [OpenClaw Gateway security](https://docs.openclaw.ai/gateway/security)

The repository-pinned [Plugin runtime](../../openclaw/plugins/sdk-runtime.md) and
[Plugin hooks](../../openclaw/plugins/hooks.md) documents were also checked against the vendored
Mainframe source for the plugin-owned run, message-read, lifecycle-hook, and delete-session
capabilities used below. These pinned files are evidence for the current fork; implementation must
recheck their matching upstream release documentation before changing the extension seam.

These are runtime capabilities, not Opzava authority. Implementation must pin and revalidate the
actual Mainframe version and prove the effective policy on the real Gateway.

### Current repository gap

The target contract does not exist today:

- `apps/workers/src/provisioning/ask-admin-agent.ts` currently appends `sessions_spawn`,
  `subagents`, and `group:sessions` through `ASK_ADMIN_DELEGATION_TOOL_ALLOW`. That raw surface must
  be removed, not extended.
- The current provider-shaped subagent roles are not Support Delegation Attempts or managed
  `AgentEmployee` records, and their native session state is not an Opzava product lifecycle.
- Mainframe has plugin runtime helpers to run a plugin-owned subagent, wait/read its messages, and
  delete a session owned by the same plugin. It does not yet expose the product-specific durable
  start-once, broker lifecycle event, result-admission, or hard-purge contract required below.
- `sessions.delete` over normal Gateway RPC is admin-scoped. Ask Admin must not receive that method
  or `operator.admin` to implement cancellation.

Implementation is therefore blocked until the narrow Mainframe extension and Runtime-Control Adapter
described below are built and proven. Raw session tools are not an interim fallback.

## Three delegation paths

| Path                     | Product record and owner                                                                       | Runtime                                                            | May mutate governed work?                                   | Progress authority                               |
| ------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------ |
| Conversation support     | AI Workforce; `SupportDelegationAttempt` child of `AssistantConversation`, governed by PRD-005 | One isolated native OpenClaw subagent behind an Opzava adapter     | No                                                          | Safe support lifecycle projection only           |
| Managed employee work    | `AgentDispatch` + one or more `Assignment` records; ADR-008 AI Workforce                       | Selected `AgentEmployee` sessions/runs                             | Only through that workflow's authorized ports and approvals | AI Workforce assignment/dispatch projection      |
| DevTicket implementation | DevTicket command model, Claim Attempt, Execution Lease, Runner binding; ADR-017/WF-230/WF-232 | Enrolled local or admitted cloud Runner using the selected harness | Yes, only within exact governed authority                   | Dev Board lanes and signed Runner/provider facts |

The same model vendor or physical machine may participate in more than one path, but identity and
authority never transfer between them. Correlation uses opaque references only.

Canonical prose uses **Assistant Conversation** and **Support Delegation Attempt**. Their internal
aggregate/type identifiers may be `AssistantConversation` and `SupportDelegationAttempt`; those
identifiers are aliases, not separate domain terms.

## Conversation-support deep module

### Model-facing interface

Ask Admin sees exactly one delegation tool. Its input is the following closed JSON Schema; every
branch rejects unknown fields, and the application additionally enforces the stated UTF-8 byte
limits after JSON decoding:

```json
{
  "oneOf": [
    {
      "type": "object",
      "additionalProperties": false,
      "required": ["action", "commandKey", "purpose", "operation", "evidenceRefs"],
      "properties": {
        "action": { "const": "start" },
        "commandKey": {
          "type": "string",
          "pattern": "^cmd_[A-Za-z0-9_-]{20,84}$",
          "minLength": 24,
          "maxLength": 88
        },
        "purpose": { "const": "analyze_provided_evidence" },
        "operation": {
          "enum": ["summarize", "identify_risks", "identify_gaps", "check_consistency"]
        },
        "evidenceRefs": {
          "type": "array",
          "minItems": 1,
          "maxItems": 16,
          "uniqueItems": true,
          "items": {
            "type": "string",
            "pattern": "^evi_[A-Za-z0-9_-]{22,86}$",
            "minLength": 26,
            "maxLength": 90
          }
        }
      }
    },
    {
      "type": "object",
      "additionalProperties": false,
      "required": ["action", "commandKey", "purpose", "operation", "evidenceRefs"],
      "properties": {
        "action": { "const": "start" },
        "commandKey": {
          "type": "string",
          "pattern": "^cmd_[A-Za-z0-9_-]{20,84}$",
          "minLength": 24,
          "maxLength": 88
        },
        "purpose": { "const": "compare_options" },
        "operation": { "enum": ["compare_tradeoffs", "compare_constraints"] },
        "evidenceRefs": {
          "type": "array",
          "minItems": 2,
          "maxItems": 16,
          "uniqueItems": true,
          "items": {
            "type": "string",
            "pattern": "^evi_[A-Za-z0-9_-]{22,86}$",
            "minLength": 26,
            "maxLength": 90
          }
        }
      }
    },
    {
      "type": "object",
      "additionalProperties": false,
      "required": ["action", "commandKey", "purpose", "operation", "evidenceRefs"],
      "properties": {
        "action": { "const": "start" },
        "commandKey": {
          "type": "string",
          "pattern": "^cmd_[A-Za-z0-9_-]{20,84}$",
          "minLength": 24,
          "maxLength": 88
        },
        "purpose": { "const": "draft_summary" },
        "operation": { "enum": ["decision_summary", "status_summary", "handoff_summary"] },
        "evidenceRefs": {
          "type": "array",
          "minItems": 1,
          "maxItems": 16,
          "uniqueItems": true,
          "items": {
            "type": "string",
            "pattern": "^evi_[A-Za-z0-9_-]{22,86}$",
            "minLength": 26,
            "maxLength": 90
          }
        }
      }
    },
    {
      "type": "object",
      "additionalProperties": false,
      "required": ["action", "delegationRef"],
      "properties": {
        "action": { "const": "status" },
        "delegationRef": {
          "type": "string",
          "pattern": "^sda_[A-Za-z0-9_-]{22,86}$",
          "minLength": 26,
          "maxLength": 90
        }
      }
    },
    {
      "type": "object",
      "additionalProperties": false,
      "required": ["action", "delegationRef", "commandKey"],
      "properties": {
        "action": { "const": "cancel" },
        "delegationRef": {
          "type": "string",
          "pattern": "^sda_[A-Za-z0-9_-]{22,86}$",
          "minLength": 26,
          "maxLength": 90
        },
        "commandKey": {
          "type": "string",
          "pattern": "^cmd_[A-Za-z0-9_-]{20,84}$",
          "minLength": 24,
          "maxLength": 88
        },
        "reason": { "type": "string", "minLength": 1, "maxLength": 512 }
      }
    }
  ]
}
```

`commandKey` is at most 88 UTF-8 bytes, `delegationRef` at most 90 UTF-8 bytes, and `reason` at most
512 UTF-8 bytes. The start branches deliberately have no free-form task, target, or instruction
field. The coordinator renders one fixed, versioned prompt template from `purpose`, `operation`, and
authorized sanitized evidence. Project delivery, employee allocation, implementation, acceptance,
Review, and mutation cannot be represented by this union and therefore fail schema/admission before
dispatch.

`status` and `cancel` use the opaque Opzava reference. `start` and `cancel` require their respective
idempotency keys; read-only `status` does not invent a command key. Evidence references are
caller/model hints resolved and authorized server-side, never trusted content locators. The
delegation reference is a locator only; the application service independently authorizes every call.

### Hidden coordinator interface

The AI Workforce `AssistantDelegationCoordinator` is the deep Module. Its small application
interface is:

- `startSupportDelegation(authorizedTurn, boundedRequest)`;
- `getSupportDelegation(currentPrincipal, delegationRef)`;
- `cancelSupportDelegation(currentPrincipal, delegationRef, commandKey)`;
- `admitRuntimeObservation(authenticatedObservation)`;
- `projectCompletion(authorizedRecipient, delegationRef)`.

The coordinator depends on a narrow Runtime-Control `AssistantSupportRuntimePort` for typed
`startOnce`, `getStatus`, `requestCancel`, and `acknowledgeResult` operations over
server-constructed arguments. General Gateway/session control does not leak into callers.

The Adapter requires one additive bundled Mainframe extension,
`extensions/opzava-support-delegation`, before v1 can enable the model-facing tool. The extension:

- registers only `opzava.support.start`, `opzava.support.status`, `opzava.support.cancel`, and
  `opzava.support.ack` under `operator.write`; the broker's exact ACL and Gateway route/device
  identity admit those methods only from the coordinator Adapter;
- accepts an Opzava-created `dispatchId`, generation, and full fingerprint, durably reserves that
  identity before calling `api.runtime.subagent.run`, and returns the existing record for an
  identical replay while rejecting a fingerprint collision;
- creates a plugin-owned child session so cancellation can use `api.runtime.subagent.deleteSession`
  without `operator.admin` and cannot target any other session;
- observes `subagent_spawned`/`subagent_ended`, then uses the plugin-owned
  `waitForRun`/`getSessionMessages` helpers to obtain the latest visible assistant result. It never
  assumes `subagent_ended` contains result text;
- publishes a versioned `opzava.support.lifecycle` event on the existing authenticated
  broker↔Gateway operator connection. If Mainframe cannot yet publish plugin lifecycle events on
  that connection, that additive extension is a build prerequisite, not a reason to add a polling
  loop or callback secret;
- binds every event to plugin ID/version, tenant Gateway route, dispatch ID/generation, plugin
  record version, native run/session correlation, monotonic event sequence, event ID, outcome,
  content hash, and safe result. The broker authenticates the connection and exact Gateway route
  before the coordinator admits it;
- stores a terminal result pending coordinator acknowledgement, then archives/deletes the owned
  native session and drives the native-retention contract below.

The extension's dispatch ledger is an extension-owned transactional SQLite store in the Mainframe
state directory, not the SDK's evictable keyed runtime store. Each non-evicting row binds
`dispatchId`, generation, fingerprint digest, tenant Gateway route, plugin/version, state, expected
record version, native correlations, event cursor/hash, terminal class/result hash, acknowledgement,
purge deadline/proof, and tombstone deadline. `dispatchId` is unique. Start, cancel, result capture,
acknowledgement, archive, and purge each require the exact generation and expected row version; a
lost CAS reloads/replays but never repeats the external effect. Store open/migration/write failure,
capacity exhaustion, or inability to commit a dispatch claim rejects admission before
`api.runtime.subagent.run`; no in-memory fallback exists. The extension admits at most four
nonterminal dispatch rows for its tenant Gateway; product-side one-per-conversation admission must
already have passed, and either stricter limit wins.

Rows progress only through `reserved → starting → running | unknown | cancel_pending`; verified
cancellation continues `cancel_pending → cancelled → purged`, while a terminal result continues
`terminal_unacked → archive_pending → archived → purged`. `purged_unacknowledged` is the
terminal-retention failure branch. Cancellation, terminal capture, result admission, archive, and
purge race on the same row version; the first committed fact is preserved and the loser reloads it.
`cancel_pending` projects as product `cancel_requested`; only extension `cancelled` projects a
cancellation acknowledgement and releases nonterminal capacity.

| Extension input                                       | Guard                                                                                          | Atomic ledger effect / external effect                                                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `start` first call                                    | record absent, generation `1`, expected version `0`, valid fingerprint/policy/capacity         | insert `reserved`, then CAS `starting`; only that committed transition owns one `subagent.run` call                                |
| `start` replay                                        | same dispatch/generation/fingerprint                                                           | return current row/tombstone; never call the runtime                                                                               |
| `start` collision                                     | same dispatch with other generation/fingerprint                                                | reject; no row rewrite or runtime call                                                                                             |
| recovery of `starting` without correlated native fact | exact row/version, process restarted or call outcome lost                                      | CAS `unknown`; never call `subagent.run` again                                                                                     |
| native started observation                            | exact dispatch/generation/version/session/run                                                  | CAS `running`, increment event sequence, emit one fact                                                                             |
| `cancel`                                              | exact dispatch/generation/expected version; plugin owns native session                         | CAS `cancel_pending` with command digest; durable effect worker owns delete/cancel                                                 |
| cancel-effect recovery                                | exact pending row/version and owned native correlation                                         | reissue idempotently after restart; terminal fact wins, otherwise verified deletion CAS-sets `cancelled` and emits acknowledgement |
| terminal/result capture                               | exact native correlation and expected version                                                  | CAS `terminal_unacked`, store bounded result/hash, emit one fact; competing cancel reloads terminal                                |
| `ack`                                                 | exact dispatch/generation/expected version/result hash plus verified product-admission receipt | CAS `archive_pending` with receipt digest; durable effect worker owns archive/delete                                               |
| archive-effect recovery                               | exact pending row/version, owned native correlation, and admission receipt                     | reissue idempotently after restart; verified archive/deletion CAS-sets `archived`                                                  |
| purge sweep                                           | exact version and due deadline                                                                 | delete owned native/raw content, persist proof, CAS `purged` or `purged_unacknowledged`                                            |

A tombstone retains dispatch/fingerprint/generation, terminal class, result hash, event cursor, and
purge proof—never content—for at least 30 days after purge and at least the coordinator
command-idempotency horizon, whichever is later. Tombstones are not capacity-evicted and a replayed
old `dispatchId` returns the tombstone rather than starting a child. Compaction may delete one only
after that horizon and an explicit coordinator release receipt.

The pending-effect worker is the only owner of cancel/delete and archive/delete calls. A process
crash after committing a pending row cannot lose the effect: recovery scans pending rows and
reissues against the same plugin-owned session. A duplicate delete/not-found response settles an
effect only when the durable row proves that exact plugin ownership and no competing terminal result
won; otherwise the row remains pending/attention. `cancelled` is emitted only after verified native
cancellation/deletion, never when the request is merely committed. Its row remains until the purge
sweep records content cleanup/proof and converts it to the non-replayable `purged` tombstone.

`opzava.support.ack` accepts only a signed product result-admission receipt created after the
coordinator's Postgres transaction durably commits the matching terminal result and outbox row. The
receipt binds tenant, Attempt/version, dispatch/generation, result hash, product event ID, commit
time, and receipt ID; it is signed by the pinned Opzava broker identity and verified by the
extension. A missing, stale, mismatched, or unverified receipt leaves `terminal_unacked` unchanged.
The extension records only its receipt digest and safe identifiers, never product content or a
credential.

Browser code and the model never call these Gateway methods or see their runtime references. The
extension has no Opzava Postgres access and makes no workflow decision.

The coordinator hides reservation, request fingerprints, collision handling, native argument
construction, OpenClaw adapter calls, unknown-outcome reconciliation, cancellation, result
sanitization, retention, audit, and realtime publication. It never owns DevTicket, GitHub, Runner,
Review, or approval policy beyond its own AI Workforce support-child state.

### `SupportDelegationAttempt`

One attempt binds at minimum:

- tenant, conversation, parent turn, parent runtime/tool-call identity, and current human principal;
- server-selected support purpose/operation and bounded request fingerprint;
- natural idempotency key, start-command fingerprint, and separate cancellation command keys;
- server-selected Support Delegation Policy ID/revision/digest, resolved model identity, sterile
  role/workspace/bootstrap manifest, sandbox proof, and deny-all effective child-tool inventory
  proof;
- deterministic correlation handle plus opaque native run/session refs stored only where authorized;
- lifecycle state/version, dispatch-intent generation, deadlines, observation cursor, safe status,
  sanitized terminal summary, and audit refs;
- created/updated/terminal timestamps and retention/redaction disposition.

It never contains a DevTicket contract, assignment, project-work target, acceptance decision, raw
prompt/provider payload, chain-of-thought, secret, raw Gateway DTO, filesystem path, or credential.

### State machine

Canonical states are:

```text
reserved → dispatching → running → succeeded | failed | cancelled
    │            │          ├──→ unknown ──→ running | succeeded | failed | cancelled
    │            └──────────┴──────────────→ cancel_requested
    │                                          ├──→ cancelled | failed | succeeded
    │                                          └──→ cancel_requested(runtime_state_unknown)
    ├──→ expired
    └──→ cancelled
```

Rules:

- `reserved` means a durable record exists and no runtime dispatch has been issued.
- `dispatching` means the durable dispatch intent exists and an adapter call may have taken effect.
- `running` requires an authenticated runtime observation correlated to that exact intent.
- `cancel_requested` is nonterminal and may retain a `runtime_state_unknown` reason. If a terminal
  result was already authoritatively observed, that result wins. Otherwise only an authenticated
  cancellation/terminal observation settles the state.
- `unknown` means OpenClaw may still own a live child. It is user-visible and actionable; it is
  never normalized to failed, cancelled, expired, or safe-to-retry.
- `expired` is allowed only while the reservation is authoritatively proven never dispatched. A
  deadline after dispatch atomically commits cancellation intent and moves to
  `cancel_requested(runtime_state_unknown)` until runtime proof establishes `cancelled`, `failed`
  with a timed-out reason, or `succeeded`.
- Terminal states never regress. Late duplicate observations are no-ops; contradictory observations
  produce a safe conflict/attention record instead of rewriting history.

Every transition uses an expected Support Delegation Attempt version and dispatch generation.
Runtime observations additionally bind the current plugin record version and strictly increasing
event sequence. Duplicate event ID/hash is a no-op; same sequence or event ID with different bytes
is a security/integrity conflict and changes no lifecycle state.

| Current state                          | Accepted input and guard                                             | Next state / atomic effect                                    | External side-effect owner |
| -------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------- |
| `reserved`                             | authorized start committed                                           | `dispatching`; append one dispatch outbox intent              | coordinator worker         |
| `reserved`                             | authorized cancel or reservation deadline before any dispatch intent | `cancelled` or `expired`; no runtime call                     | coordinator                |
| `dispatching`                          | authenticated plugin `started` for exact generation                  | `running`; store opaque correlations                          | plugin event ingress       |
| `dispatching`                          | worker/plugin uncertainty without terminal proof                     | `unknown`; preserve ownership warning                         | reconciliation worker      |
| `running`                              | authenticated terminal event/result                                  | matching terminal state; store safe result pending disclosure | plugin event ingress       |
| `running`                              | runtime ownership becomes unverifiable                               | `unknown`; do not start another child                         | reconciliation worker      |
| `unknown`                              | authenticated current/terminal observation                           | `running` or matching terminal state                          | plugin event ingress       |
| `dispatching`, `running`, or `unknown` | authorized cancel/deadline with new cancel key                       | `cancel_requested`; append one cancel outbox intent           | coordinator worker         |
| `cancel_requested`                     | authenticated plugin cancellation acknowledgement                    | `cancelled`                                                   | plugin event ingress       |
| `cancel_requested`                     | authenticated terminal result won the race                           | `succeeded` or `failed`                                       | plugin event ingress       |
| `cancel_requested`                     | cancel/result outcome unavailable                                    | remain `cancel_requested(runtime_state_unknown)`              | reconciliation worker      |
| any terminal state                     | any replay/late same observation                                     | unchanged/no-op                                               | coordinator/event ingress  |

Policy revocation blocks new starts and result disclosure, but it does not block authenticated
runtime-fact admission. The coordinator issues a server-owned cancellation intent for affected
nonterminal attempts; once that intent commits, an uncertain result remains visibly
`cancel_requested(runtime_state_unknown)`.

### Idempotency and uncertain provider results

The start natural key is tenant + conversation + parent human turn + parent tool call + caller
command key. Its fingerprint contains the current human principal, normalized support
purpose/operation, resolved authorized evidence identities/versions/digest, and selected Support
Delegation Policy ID/revision/digest. The first accepted request stores the complete fingerprint
before any runtime call.

V1 also holds a durable unique support slot on tenant + conversation + parent human turn. The first
accepted start binds that slot to one Attempt and semantic fingerprint. A second tool call/key in
the same human turn with the same semantic fingerprint returns that Attempt; a different fingerprint
is rejected as `turn_already_delegated`. A separate partial unique guard permits at most one
nonterminal Support Delegation Attempt per conversation. Therefore a new human turn cannot replace
an `unknown`, `running`, `dispatching`, or `cancel_requested` Attempt. Only after the predecessor is
terminal may a later human turn and fresh command key reserve a new slot/Attempt.

- Same key and same fingerprint returns the existing Opzava reference/projection.
- Same key and different fingerprint is a collision and performs no dispatch.
- Reservation and dispatch intent commit before invoking OpenClaw. The outbox uses the attempt ID
  and dispatch generation as the stable plugin `dispatchId`; worker retry always replays that same
  ID.
- The adapter constructs one deterministic `taskName`/correlation handle. That handle helps inspect
  current/recent runtime state but never proves that a spawn did or did not occur.
- A crash before the plugin call replays the same `dispatchId` safely. A crash after plugin
  reservation or native acceptance replays that same ID and receives the existing plugin record. If
  the extension itself cannot establish whether its reserved dispatch created a native child, the
  attempt becomes `unknown`; v1 never respawns that logical request. A late exact-generation
  observation may resolve it, and a cancellation request may contain it.
- A fresh support attempt for the same logical request requires a new human turn/tool call and
  command key after the first attempt is terminal. `taskName`, a windowed list, or an absent current
  session is never sufficient proof to retry an unknown attempt.
- Cancellation's natural key is tenant + Support Delegation Attempt ID + caller command key. Its
  fingerprint contains principal, bounded reason, expected attempt version, dispatch generation, and
  current policy decision. Duplicate same commands are no-ops; a collision performs no new
  cancellation.

This contract is at-least-once observation with idempotent product projection, not a false
exactly-once runtime claim.

## Exact runtime policy

The coordinator, not the model, constructs the native request from **Support Delegation Policy
`ask-admin-support/v1`**. Its initial immutable limits are:

| Policy dimension | V1 value                                                                                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native role      | dedicated `ask-admin-support`; no caller-selected agent                                                                                                           |
| Runtime/context  | native `subagent`, isolated, run mode, no thread/fork/ACP/attachments                                                                                             |
| Model            | one server-resolved model from versioned `ask-admin-support-models/v1`; no per-call override; metered/pay-per-token providers excluded from v1 support delegation |
| Prompt/evidence  | fixed versioned template ≤ 4 KiB UTF-8; 1–16 typed refs (2–16 for compare); resolved sanitized evidence ≤ 64 KiB and ≤ 16,384 input tokens                        |
| Output/runtime   | ≤ 2,048 output tokens and 8 KiB text; 120-second deadline                                                                                                         |
| Concurrency      | one child per attempt; at most 1 nonterminal attempt per conversation and 4 per tenant                                                                            |
| Nesting          | maximum depth 1; no session/subagent tools                                                                                                                        |
| Workspace        | dedicated empty/curated workspace; no project checkout, user files, credentials, writable mount, or shared agent state                                            |
| Bootstrap/skills | reviewed minimal `AGENTS.md`/`TOOLS.md` containing policy only; `skills: []`; no SOUL/user/memory/corpus/extraPaths/transcript-search injection                   |
| Tools/MCP        | deny-all `tools.deny: ["*"]`; no plugin/MCP/tool-search projection; live effective inventory must equal the empty set                                             |
| Sandbox/network  | `sandbox: "require"`, workspace access `none`, read-only runtime mounts, no child network/browser access                                                          |
| Native retention | terminal result held only for acknowledged delivery; owned session archived immediately afterward and hard-purged within 24 hours                                 |

An empty `allow` list is not used as the guarantee because OpenClaw treats it as unrestricted at
that policy stage. Deny-all plus a live effective-inventory equality check is the gate.

Native subagents inject target-role bootstrap files even with a different working directory. The
dedicated sterile role/workspace/bootstrap manifest is therefore hashed into the policy proof. The
application supplies only the fixed-template purpose/operation and sanitized evidence **in addition
to** that trusted minimal runtime bootstrap; it never inherits Ask Admin's transcript, skills,
memory, workspace, or MCP projections.

The accepted `running` observation must prove the exact policy ID/revision/digest, resolved model,
sterile manifest digest, sandbox/mount/network posture, and empty effective inventory. A mismatch is
contained and never presented as a valid support result.

An implementation may later propose purpose-built read-only evidence tools, but that is a new
reviewed policy revision. It cannot silently widen this v1 contract or reuse generic filesystem,
memory, web-fetch, or MCP access.

## Authorization and provenance

Human `start`, `status`, and `cancel` calls verify all of the following at call time:

- current authenticated principal and tenant lifecycle;
- current conversation ownership/access and parent-turn visibility;
- current Ask Admin availability and model-facing tool policy;
- exact delegation reference, record version, purpose, and current state;
- current support-agent role/model/sandbox/effective-tool policy for `start`;
- current cancellation permission and cancellation-key fingerprint for `cancel`;
- recipient authorization and disclosure policy before status/result projection.

Authenticated runtime observations use a different admission path: current broker↔Gateway connection
identity, tenant Gateway route, extension ID/version, dispatch ID/generation, plugin record version,
native correlation, event ID/sequence/hash, and schema version. They do not require a
still-authorized human session to record truthful terminal/containment facts. Recipient projection
then independently reauthorizes the current human/session/conversation before disclosing status or
result content.

Revocation after start does not grant continued disclosure. The coordinator may still contain or
cancel runtime work through its server authority, but it does not deliver hidden results to a
revoked principal. The original human principal, conversation, turn, and tool-call chain remains
audit provenance; it does not become child authority or a human approval.

Support child output is untrusted generated content. The parent must sanitize, label, and verify it
before synthesis. It cannot override system/developer/user policy, provide an approval, satisfy a
behavioral contract, close a ticket, move a lane, or become Review evidence.

## Progress, cancellation, and UI projection

The chat may show only product-owned safe states such as Preparing support, Running support,
Cancellation requested, Result ready, Failed, Timed out, Cancelled, or Runtime state unknown. Each
projection includes safe purpose/label, freshness, last observation, and a bounded next action. It
does not expose native session keys, runtime paths, provider payloads, hidden prompts, or child
transcripts.

Native completion is push-based. The adapter admits the completion once, updates the
`SupportDelegationAttempt`, and emits one realtime/conversation event. Browser reconnect backfills
Opzava state first. The model/browser never loops over `sessions_list`, `sessions_history`,
`subagents`, or `sessions_yield`.

Cancelling conversation support only cancels that support attempt. It does not stop a DevTicket,
release an Execution Lease, pause a Sprint, cancel an `Assignment`, or resolve an Incident. Those
actions require their owning commands.

### `opzava-pm` routing etiquette

The Ask Admin `opzava-pm` guidance must classify the requested outcome before choosing a tool:

- bounded evidence analysis/comparison/summary uses only `opzava_support_delegate`;
- employee responsibility uses the ADR-008 dispatch/assignment application command;
- DevTicket shaping, assignment, claim/start, lane, Sprint, or Review intent uses the exact Dev
  Board command/read Adapter;
- ambiguity or a missing owner gate produces a clarification or safe owner deep link, never a raw
  native session fallback.

The guidance tells the model to name the selected owner, report only owner-projected progress, keep
support output non-authoritative, and never infer approval, readiness, assignment, start, Review, or
Done from conversation text. This is prompt/skill etiquette only. The closed tool schema, effective
tool policy, application authorization, Dev Board command gates, Runner receipts, and Review gates
remain the deterministic enforcement; changing the skill cannot widen authority. #219 may refine the
wording but must preserve this boundary.

## Managed employee and DevTicket boundaries

### Managed `AgentEmployee` work

When a request is real project/business work delegated to an employee, ADR-008 applies:

1. authorize and resolve the work target;
2. create/reuse `AgentDispatch` for the human work bridge when applicable;
3. create an `Assignment` for the selected `AgentEmployee`;
4. run through the employee's own policy, workspace, knowledge scope, approvals, and runtime;
5. project assignment/dispatch status into the conversation.

The support union cannot express an employee responsibility, project deliverable, workflow step,
acceptance result, target action, or business-side effect. Free-form task/target/action properties
are schema-invalid, while a DevTicket or employee projection may be supplied only as authorized
quoted evidence for one of the closed non-mutating operations.

When a DevTicket's Execution Assignee is an `AgentEmployee`, AI Workforce must create/cross-link the
applicable `AgentDispatch` and `Assignment` for employee identity, knowledge/autonomy policy, load,
session, and report projection. Those records do not admit work or move lanes: Dev Board alone owns
Ready, assignment to the DevTicket role, Claim Attempt, Runner/lease/fence, signed start, Review,
and Done.

### DevTicket work

Ask Admin may translate an explicit authenticated human intent into the exact Dev Board command
Adapter defined by WF-230/WF-232. It does not call a native subagent to implement the ticket.

- Backlog work remains planning-only and cannot start.
- Todo is the only claimable ordinary lane. `AssignTodo` may assign without starting; only a valid
  `ClaimAndStart` can begin one ordinary ticket.
- `ClaimAndStart` enters Starting/Claim Attempt first. In Progress is projected only after the
  enrolled Runner returns the accepted signed `execution_started` receipt for the exact lease,
  fence, contract, runner, worktree, process, and nonce.
- An approved Sprint alone may use `autonomous_serial`; its controller selects the next eligible
  member in order. A support child cannot select Sprint work.
- Local Runner disconnect after start causes governed containment/Blocked behavior with no automatic
  cloud failover. The conversation reports the owner state and next action; it never spawns a
  replacement support child to continue code work.
- Every completed implementation still enters independent local Review. Support output is neither
  review evidence nor Reviewer identity.

If governed execution is unavailable, Ask Admin may still perform separately authorized planning,
card shaping, creation, or `AssignTodo` commands where their gates pass. It must say execution did
not start. There is no create+assign-to-subagent fallback.

## Retention, redaction, and audit

`SupportDelegationAttempt` follows the owning conversation's retention and deletion policy for
user-visible operation/evidence labels, safe progress, and terminal summary. Soft deletion and purge
never remove immutable audit/security facts that another policy requires. Required audit retains
only the minimum safe identity, command digest, policy/version, lifecycle transitions, authorization
outcome, opaque runtime correlation refs, terminal class, and redaction/deletion disposition.

Raw prompts, chain-of-thought, provider responses, tool transcripts, native session history,
credentials, secret values, and Gateway DTOs are not copied into the product projection. Sanitized
terminal output becomes a conversation message only through the ordinary one-final-message
idempotency and authorization path.

The Mainframe extension starts with native delivery disabled. After terminal observation it reads
only the latest visible assistant message, stores a bounded result plus content hash pending an
`opzava.support.ack` carrying exact dispatch/generation/record-version/result-hash and the verified
product result-admission receipt, and never promotes tool/tool-result content. An identical
acknowledgement replay returns the existing state; a version/hash/receipt collision has no effect.
Accepted acknowledgement commits `archive_pending`; the recoverable pending-effect worker then uses
plugin-owned deletion and records `archived` only after the effect is verified.

Acknowledgement loss cannot extend raw retention: `terminalAt + 24 hours` is an absolute deadline
for native prompt/session/result content. At that deadline the sweep hard-purges owned content even
without acknowledgement, CAS-transitions the ledger to `purged_unacknowledged`, retains only the
safe tombstone, and emits/replays a content-free lifecycle fact. If the coordinator never admitted
the result, it records terminal `failed(result_expired_before_admission)` plus operational
attention; if it already admitted the matching result and only the ack was lost, its durable content
hash proves the existing product terminal state and the replay only settles cleanup. Neither case
permits a replacement spawn. Restart/lost-event reconciliation reads the durable row/tombstone, not
native session absence.

The extension must provide and prove that owned hard-purge sweep; if the public plugin SDK cannot
hard-purge an owned archive, a logged Mainframe rung-3 extension is a prerequisite. Cleanup failure
is visible operational attention and blocks new starts for the affected support role until
reconciled. Conversation purge requests shorten native retention where the runtime can prove
ownership, while required minimal security audit remains redacted and separate.

No support delegation may ship if native prompt/result retention cannot meet this bounded policy.

Final retention/redaction duration and archive mechanics are consumed from their owning policies at
#220; this ticket does not invent a second archive system.

## Failure and recovery contract

| Failure                                   | Required behavior                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| Duplicate start, same fingerprint         | Return the same attempt/projection; no second spawn                                   |
| Duplicate key, different fingerprint      | Reject collision; no spawn                                                            |
| New start in the same human turn          | Return same semantic Attempt or reject `turn_already_delegated`; no spawn             |
| New turn while predecessor is nonterminal | Reject; one conversation guard prevents replacement                                   |
| Extension ledger unavailable/full         | Reject before native call; no in-memory/evictable fallback                            |
| Adapter times out after dispatch          | Mark `unknown`; reconcile; never blind-respawn                                        |
| An unknown attempt appears absent         | Preserve `unknown`; v1 has no absence-based retry proof or replacement-spawn path     |
| Runtime unavailable during reconciliation | Preserve `unknown`, freshness, and human remediation                                  |
| Child policy/model/sandbox mismatch       | Fail before running or contain; do not deliver result as valid                        |
| Child attempts a forbidden tool           | Deny, audit, and fail/contain without widening policy                                 |
| Prompt injection in supplied evidence     | Treat as quoted data; child has no tools/authority; parent verifies output            |
| Principal/conversation access revoked     | Deny status/result; coordinator may still contain runtime work                        |
| Cancel races completion                   | Proven terminal result wins; otherwise await authenticated cancellation/terminal fact |
| Deadline after dispatch                   | Commit `cancel_requested(runtime_state_unknown)`; never mark live child expired       |
| Result acknowledgement lost               | Retry exact ack; hard-purge content by 24 hours and retain non-replayable tombstone   |
| Provider result duplicate/out of order    | Idempotent versioned admission; contradiction creates attention/conflict              |
| Dev Board command unavailable             | Report not started; no support-subagent coding fallback                               |
| Runner disconnect                         | Consume Dev Board owner facts; no automatic cloud/subagent failover                   |

## Behavioral contracts and validation

The implementation ticket must prove these at real seams without relying on a model for
deterministic correctness:

1. **Exact tool inventory:** a live Gateway effective-policy probe for Ask Admin contains
   `opzava_support_delegate` and none of `sessions_spawn`, `sessions_yield`, `subagents`,
   `sessions_list`, `sessions_history`, `sessions_send`, or mutable `session_status`. A support
   child has an empty effective tool set because deny-all remains effective after role bootstrap,
   skill discovery, plugin projection, and MCP discovery.
2. **Durable idempotency:** real Postgres/application tests race identical and colliding
   start/cancel commands across browser retry, reconnect, worker restart, duplicate tool delivery,
   second tool calls in one human turn, and new turns while a predecessor remains nonterminal.
3. **Unknown spawn:** a fault-injecting OpenClaw Adapter loses the spawn response after runtime
   acceptance. The attempt becomes `unknown`, survives restart, reconciles one correlated child, and
   never issues a blind replacement.
4. **Safe arguments:** hostile tool inputs try free-form task/target/action properties, invalid or
   overlong keys/refs/reasons, agent/model/runtime/cwd/thread/context overrides, attachments,
   secrets, DevTicket implementation, and tool widening. Closed-schema or server admission rejects
   all before native dispatch and produces safe audit.
5. **Authorization:** another tenant/user, revoked role, deleted conversation, stale policy, guessed
   opaque ref, and stale cancellation key cannot start/read/cancel or receive a result.
6. **Cancellation:** reservation cancellation, running cancellation, cancellation/completion race,
   crash after `cancel_pending`, restart/reissue, post-dispatch deadline, provider loss, and late
   duplicate terminal observations preserve the state rules above and never project cancellation
   from request intent alone.
7. **Push projection:** native completion produces one sanitized durable/realtime result; browser
   reconnect backfills it without polling or duplication.
8. **Extension boundary:** the exact-scope Mainframe extension uses its non-evicting transactional
   ledger to replay one `dispatchId`, rejects start when that ledger is unavailable/full, retrieves
   only its owned visible assistant result, emits authenticated monotonic lifecycle events, cancels
   only its owned session without `operator.admin`, and rejects cross-plugin/session targeting.
9. **Retention:** exact acknowledgement and lost-ack/restart races preserve product result state;
   ack before product commit is rejected, crash after `archive_pending` reissues the exact owned
   effect, the hard-purge sweep removes native prompt/session/result artifacts within 24 hours,
   preserves a non-replayable content-free tombstone, and creates visible attention while blocking
   new starts when cleanup fails.
10. **Boundary enforcement:** support output cannot create/assign/claim/move/approve/complete a
    DevTicket, create an `Assignment`/`AgentDispatch`, mutate GitHub, operate a Runner, or satisfy
    Review.
11. **User-level ordinary work:** an authenticated admin asks Ask Admin to work on Todo ticket #407.
    The chat shows the accepted owner command and Starting state; the Card reaches In Progress only
    after the exact Runner-signed start receipt. A simultaneous UI/Slack/CLI claim has one winner.
12. **Disconnect:** after local start, disconnect produces owner-reported containment/Blocked and a
    safe Slack/chat next action. No cloud or support-subagent failover occurs.
13. **Managed employee + DevTicket:** assign an `AgentEmployee` to a Ready Todo DevTicket and prove
    the linked `AgentDispatch`/`Assignment` reports employee identity/session while the Card remains
    Todo/Starting until Dev Board independently accepts the exact Runner-signed start receipt.
14. **Real browser:** authenticated local-stack journeys show start/status/cancel, unknown runtime,
    revocation, safe terminal result, keyboard/focus/live-region behavior, and redaction at mobile
    and desktop widths in light/dark mode.

Support-child model output may be exercised in a separately labeled optional compatibility smoke. It
is never the deterministic contract gate.

## Required implementation ordering

1. #220 consumes this resolution together with #212/#219 and defines one exact Ask Admin effective
   tool inventory. It supersedes WF-212's raw delegation-session-tool shortlist.
2. Build and prove `extensions/opzava-support-delegation`, including durable `dispatchId` replay,
   exact-scope lifecycle push, plugin-owned result/cancel handling, acknowledgement, archive, and
   the bounded hard-purge path. The product tool remains disabled until this prerequisite passes.
3. Build the product-owned tool, `SupportDelegationAttempt`, coordinator,
   `AssistantSupportRuntimePort` adapter, authorization, retention, and safe projection before
   changing Ask Admin's agent policy.
4. Configure/prove the sterile support role, deny-all empty child inventory, sandbox, bounds,
   bootstrap/skill/MCP/network exclusions, and native completion adapter.
5. Atomically install the new Ask Admin policy and broker expected inventory; remove the current
   additive `ASK_ADMIN_DELEGATION_TOOL_ALLOW` behavior and every raw native delegation tool.
6. Run deterministic contract tests and the real local-stack user journeys before any ticket claims
   support delegation works.

## Rejected alternatives

- **Expose `sessions_spawn` plus `group:sessions`:** rejected because it exposes unsafe arguments,
  lacks product idempotency, leaks runtime identity/control, and blurs support with governed work.
- **Use `subagents`/history as the product status surface:** rejected because native runtime lists
  are not Opzava authorization, retention, audit, or durable workflow state.
- **Treat every child as an `AgentEmployee`:** rejected because bounded conversation analysis is not
  a workforce allocation or project responsibility.
- **Reuse Q17 dispatch:** rejected because Q17 is quarantined and conflicts with the Dev Board
  command/Runner model.
- **Fallback from unavailable Dev Board execution to a coding subagent:** rejected because it would
  bypass Ready, claim, lease, Runner, worktree, Review, dependency, and approval gates.
- **Mark a timed-out spawn failed/expired and retry:** rejected because OpenClaw may still own a
  live child and `taskName` is not an idempotency key.
- **Give the child generic read/web/memory tools:** rejected for v1 because filesystem corpus,
  tenant-memory scope, prompt-injection, SSRF/private-network, spend, and data-retention boundaries
  are not yet represented by purpose-built support tools.

## Exact synthesis handoff

#220 must:

- make this three-path separation normative in the final Ask Admin v1 spec;
- amend WF-212's tool policy so `opzava_support_delegate` is the only delegation tool and raw native
  session/subagent tools are denied;
- preserve #219 skill etiquette as prompt guidance only, never enforcement or authority;
- define the exact UI copy/projection for long-running support separately from DevTicket progress;
- reconcile #213 conversation retention and #225 degraded states with the attempt lifecycle;
- carry #222 verified-human provenance and current authorization into every operation;
- cut implementation tickets only after its remaining dependencies are resolved, with the tests and
  behavioral contracts above copied into their acceptance gates.
