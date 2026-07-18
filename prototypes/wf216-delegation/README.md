# wf216 delegation prototype

Throwaway prototype for the WF-216 Ask Admin delegation path, made as an in-memory Node ESM simulation.

## What this prototype proves

- `AskAdminCommandAdapter.requestCommand(turnContext, intent)` accepts a raw session token from the turn context, consults a real session verifier function, and derives authoritative `actorRef`/`source` from that verified result only.
- Requests with unverified sessions (caller asserted or missing-principal entries) are rejected before any DevBoard dispatch.
- The DevBoard adapter performs reauthorization checks (`principalRef`, `sourceRef`, `target`, `expectedVersion`, and `action`) before accepting a command.
- `requestClaimAndStart` only proceeds through `FakeExecutionAdmission` to create a synthetic lease + fence + nonce, and the Runner cannot move the projection to in-progress without a signed start receipt.
- Runner checkpoints/worklogs are appended only when the execution context matches the current lease, fence, and nonce (`runner-not-running`/`stale-lease` paths are rejected).
- `requestSubmitForReview` advances to `submitted_for_review` only after execution is in progress; no path in this model ever emits `Done`/`AdmitDone`/`approve-merge`.
- Disconnect while running enters explicit `blocked` with `execution_unknown`, increments `expectedVersion`, preserves the last trusted checkpoint, and has no automatic failover.
- Replays are idempotent when the same idempotency key is reused and the identity tuple (`principalRef`, `source`, `action`, `target`, `expectedVersion`, `payloadHash`) is the same.
- Missing idempotency key is rejected; no synthetic key is generated.

## Delegation verb set modeled

`draftProposal`, `requestCreateBacklogDevTicket`, `requestAssign`, `requestClaimAndStart`, `requestSubmitForReview`, `pauseOrEscalate`, `notify`.

Any other intent (for example `Done`, `approve-merge`, `finalize`) is rejected before dispatch.

## No-Done / no autonomous finalize invariant

The command set excludes terminalization verbs. Even if a forbidden intent is presented, the request fails with `forbidden-verb` in the adapter before DevBoard dispatch.

This concretizes the hard gate that `AdmitDone`/merge-finalization remains server-owned and never an Ask Admin delegated command in this path.

## No-failover rule

When the Runner disconnects mid-execution:

- card becomes `blocked`
- `execution_unknown: true`
- last trusted checkpoint remains attached
- no new Runner is auto-spawned
- resume requires an explicit governed action (`requestClaimAndStart`) with a fresh command envelope/nonce.

## Delegation-card states in this demo

`requested -> provisioning -> starting -> in_progress -> [blocked] -> submitted_for_review`

`blocked` includes `execution_unknown` when a disconnect loss is observed.

## Mapping to real implementation targets

- `ask-admin-agent.ts / buildAskAdminAgentEntry`
  - fixed delegation verb surface + command adapter entrypoint
  - session-derived provenance (`actorRef`, `source`) via verifier dependency
  - explicit-key idempotency and identity-bound dedupe tuple
- `wf230` command surface
  - `request*` command envelope contract and source-of-truth checks on actor/source/version
  - `ClaimAndStart` issuance of execution control facts (lease/fence/nonce)
- `wf232` runner protocol
  - Runner receives claim facts, emits signed start receipt
  - checkpoints/worklogs as inputs, not lifecycle authority
  - explicit containment and explicit retry/reclaim semantics on disconnect

Note: this models the #194 parallel fix behavior, not the pre-existing bug.

## Out of scope

- Real dispatch transport
- Postgres / WS / real persistence
- Real credential handling and Ed25519 / runner enrollment
- Real PR/merge or `#229` proof validation
- Real model/tool integrations

## How to run

```sh
node prototypes/wf216-delegation/demo.mjs
```

The script exits with code `0` when all scenarios PASS.

## Prototype limitations (throwaway)

This is an in-memory synchronous harness only. It intentionally models control semantics and
contains no persistence, transport, process boundaries, or real security/identity enforcement.
Real containment enforcement (revocation, lease/fence checks, and race containment) is implemented in
the actual DevBoard runtime-control layer and server-side OpenClaw integration, not this prototype.
