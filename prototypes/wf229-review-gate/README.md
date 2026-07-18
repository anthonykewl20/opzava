# wf229-review-gate throwaway prototype

## Scope

This is a dependency-free, in-memory Node ESM demonstrator that models the #229 Independent Review Gate contract behavior required for the throwaway review-bench.
It exercises S1–S16 end-to-end and exits non-zero on any fail.

## What it proves

- Frozen Implementation Candidate captures immutable contract version + SHA and tracks generation ordering.
- Review Attempt starts only with a valid reviewer, runner, and shared-stack lease.
- Local Docker lease is exclusive per stack and enforced at module scope.
- Review Evidence Package is bound at bind time to candidate `contractVersion + sha`, attempt ID, and is single-binding only.
- Review Decision (`Pass` or `Changes Requested`) checks candidate freshness.
- Review Exit Containment Proof is required for `Done`.
- Merge authorization is single-use, single-target, and expires.
- Candidate and availability state are revalidated during every admission path.
- `Done` is admitted only with:
  - reviewed Pass,
  - current candidate,
  - matching single-use Merge Authorization,
  - matching confirmed merge target + contract version + SHA,
  - reviewer independence, and
  - fail-closed execution/runner availability checks.

## Scenario contract mapping

| Scenario | Result |
| --- | --- |
| S1 | Positive control path validates candidate -> attempt -> lease -> evidence -> pass -> exit containment -> auth -> done admission. |
| S2 | `Changes Requested` moves card to `todo`, emits exit containment, and cannot transition directly to done. |
| S3 | Reviewer cannot be the implementation assignee (`self-review-forbidden`). |
| S4 | Evidence bound to old `(contractVersion, sha)` after candidate change is rejected and no done is admitted. |
| S5 | Reviewer or Runner unavailable leads to fail-closed rejection and no done admission path. |
| S6 | Missing/undispatched merge authorization rejects Done. |
| S7 | Second concurrent attempt on the shared stack is queued/rejected while lease is held. |
| S8 | A consumed merge authorization cannot be replayed. |
| S9 | Superseded candidate after `Pass` cannot be admitted with done. |
| S10 | Candidate rollback to prior generation is rejected (monotonic promotion). |
| S11 | Expired merge authorization is rejected at done. |
| S12 | Different merge target in confirmed merge is rejected. |
| S13 | Evidence re-binding to the same running attempt is rejected. |
| S14 | Snapshot output is deeply cloned and reviewer independence is re-checked at done. |
| S15 | Two harness instances share module-level lease state; the second cannot hold lease while the first holds it. |
| S16 | Late unavailability at done step fails closed. |

## Contract/source mapping

- **WF-229 Review Gate contract:** independent review, immutable snapshots, exclusive review resources, evidence binding, and containment-to-done requirements are intentionally simulated.
- **#237 TB-RV1:** test matrix mirrors review/merge validation expectations for review-vs-done admission.
- **#218 Done-gate:** done-gate semantics are represented by fail-closed done admission requiring a matching, consumed proof chain.

## Out of scope

- Real Docker stack provisioning and lifecycle
- Real Runner/checkout/review execution
- Real GitHub merge/confimation APIs

## Run

```sh
node prototypes/wf229-review-gate/demo.mjs
```

## Validation target

Command must exit `0` with `SCENARIO_SUMMARY=PASS` and all `S1` … `S16` lines passing.
