# 0088: Job Kind Executor

## Problem

The durable runner worker exposes a single executor slot, but Opzava must process multiple job kinds — content-workflow steps and campaign-send emails. Without a routing layer, the worker would need monolithic knowledge of every kind, coupling dispatch logic to business logic and making new kinds a core-code change.

## Approach

Extract a thin routing executor: `createJobKindExecutor` accepts a `resolveKind` function and a registry of per-kind executors. On each `execute(job, attempt, signal)` call it resolves the kind string, looks up the matching executor, and delegates — passing all arguments through unchanged. If no executor is registered for the resolved kind, it throws a `RunnerExecutionError('validation-error')`, causing the job to dead-letter rather than be silently dropped or misrouted.

## Contract

```ts
createJobKindExecutor(deps: {
  resolveKind: (job: Job) => string;
  executors: Record<string, RunnerExecutor>;
}): RunnerExecutor;
```

- **resolveKind** — pure function; inspects the job and returns a kind discriminator string.
- **executors** — map of kind → executor; each executor owns its own secret boundary.
- **Returns** — a `RunnerExecutor` with the standard `(job, attempt, signal) => Promise<Result>` signature.

## Validation

Three focused tests:

1. **Routes to the correct executor** — given kinds `a` and `b`, a job resolving to `a` calls executor `a` exactly once with the original `job`, `attempt`, and `signal`; executor `b` is never touched.
2. **Throws on unknown kind** — when `resolveKind` returns a string not in the registry, the call rejects with `RunnerExecutionError('validation-error')`; no executor is invoked.
3. **Propagates downstream rejection** — if the matched executor rejects, the rejection (and its reason) propagates unchanged to the caller.

## Security & Audit

No secret values, private credentials, tokens are introduced by the dispatcher — it only inspects the job to pick a handler; each downstream executor keeps its own secret boundary. Unknown kinds fail closed (dead-letter) rather than failing open, so a malformed or unexpected job can never run an unintended handler.

## Next Case Study Thread

Assemble the concrete runner wiring: `resolveKind` reads a `job.kind` discriminator; register the `campaign-send` executor alongside the `content-step` executor. Pair this with a runner worker integration test that produces a campaign via `runCampaignSendWithRepository` then drains it through `createRunnerWorker`. After that, a campaign compose/approve UI slice (designed separately by the UI owner) can surface send status.
