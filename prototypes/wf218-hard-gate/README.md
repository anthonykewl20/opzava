# wf218 corrected hard-gate prototype

## Contract proved

This dependency-free, in-memory Node ESM prototype models the corrected Dev Board authority boundary:

- Ask Admin tool commands `moveTask` and `createTask` can never write `done`.
- A direct `moveTask(..., status: 'done')` is rejected with `done-requires-admit-done`, whether it is autonomous or carries a valid human confirm token. The valid token is necessary-but-not-sufficient evidence and is not consumed by the rejected attempt.
- `createTask(..., status: 'done')` is rejected with `create-with-terminal-status`.
- `admitDone(ticket, proofs, actor)` is the only path to `done`. It is system-owned, requires the ticket to be in Review, and requires every proof to be exactly `true`: Ready approval, the #229 review-exit containment proof, merge authorization, and confirmed merge into `development`.
- Missing proof data rejects fail-closed with a specific hard reason. There is no direct In-Progress-to-Done transition.
- Admission authorization, aggregate mutation, and accepted-ledger append behave as one atomic unit. A failure-injection hook demonstrates rollback after authorization: status and accepted-ledger state are restored, while the blocked attempt is retained as security telemetry.

## Two audit sinks (DBF-174 correction)

`activityLedger[]` contains accepted product commands only. `securityLog[]` contains rejected or blocked attempts and bypass telemetry only. Rejected direct-Done attempts and rejected `AdmitDone` gates never appear in the accepted activity ledger.

## Confirm-token mechanism evidence

The prototype retains confirm-token mechanics on the representative non-terminal `move-to-review` action:

- single-use compare-and-swap consumption;
- scope binding to `taskId + action`;
- finite, future expiry at issuance and expiry checking at use;
- principal binding to `adminId`;
- `source` derived from validated scope and principal binding, never from raw envelope presence.

The S7 cases prove fail-closed principal mismatch, expiry, replay/conflict, forged token, and absent principal binding. A forged token is classified as `autonomous`. These scenarios are mechanism evidence only: **which v1 Ask Admin actions require a confirm token remains an open question for #220**.

## Run

```sh
node prototypes/wf218-hard-gate/demo.mjs
```

The process prints PASS/FAIL for S1 through S7, dumps `activityLedger` and `securityLog`, prints `SCENARIO_SUMMARY=PASS|FAIL`, and exits non-zero on any failure.

## Mapping to real code and authority records

| Prototype boundary | Real insertion point / authority | Intent |
|---|---|---|
| Tool-path `moveTask` terminal rejection | `packages/project-management/src/application/tasks.ts:1745` | Reject every direct move to `done` and direct callers to governed `AdmitDone`; never consume a supplied confirm token. |
| Tool-path `createTask` terminal rejection | `packages/project-management/src/application/tasks.ts:1386` | Reject cards created in `done` before mutation. |
| System-owned `admitDone` | `docs/plan/research/wf230-devticket-command-model.md:1525-1547` | Make `AdmitDone` the sole Done writer, after mandatory Review and the complete Ready/review/merge proof chain. |
| Review-exit containment proof | GitHub #229 and ADR-017 | Treat review containment as a required admission proof, not an optional human assertion. |
| Accepted command ledger and rejection telemetry | DBF-174 | Preserve the corrected two-sink rule: accepted product commands in `activityLedger`; rejects, blocks, and bypass telemetry in `securityLog`. |

## Scope

This is a throwaway contract simulation, not production code. It intentionally omits Postgres transactions, transport wiring, persistence adapters, real review/merge integrations, and the #220 decision about which non-terminal Ask Admin commands require confirmation.
