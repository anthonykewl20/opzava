# 0087: Campaign Send Executor

## Problem

Opzava's durable runner can lease campaign-send jobs, but nothing yet *executes* them. The enqueue path (plan → deduped job with `{to, subject, html, sendAt}`) is complete; the consume path is a gap. We need a thin, testable executor that validates the payload, delegates to a provider-agnostic email sender, and reports outcomes so the runner's retry/dead-letter machinery can do its job.

## Approach

A single factory — `createCampaignSendExecutor({ sender, onSent? })` — returns a `RunnerExecutor`. The executor is deliberately dumb: it owns no secrets, no retry logic, and no persistence. It reads the job payload, validates it with a local type guard, builds a `CampaignEmailMessage`, and awaits the injected `CampaignEmailSender`. The sender (backed by Resend) already closes over its resolved credential; the executor never sees it.

Outcome routing:

| Sender result | Executor action | Runner effect |
|---|---|---|
| `ok: true` | call `onSent?.({ jobId, to, messageId })`, resolve | Job completes |
| `ok: false` | throw `RunnerExecutionError('provider-error')` | Retry / dead-letter per policy |
| Malformed payload | throw `RunnerExecutionError('validation-error')` | Dead-letter immediately (poison) |

## Contract

```ts
createCampaignSendExecutor(deps: {
  sender: CampaignEmailSender;
  onSent?: (info: { jobId: string; to: string; messageId: string }) => void;
}): RunnerExecutor

// execute(job, _attempt, _signal) → Promise<void>
```

`job.payload` must satisfy `{ to: string, subject: string, html: string }`. Any missing or non-string field triggers validation-error *before* the sender is called.

## Validation

Three focused tests close the loop:

1. **Happy path** — sender returns `{ ok: true, messageId: 'msg_123' }`; `onSent` called once with `{ jobId, to, messageId }`; executor resolves.
2. **Provider failure** — sender returns `{ ok: false }`; executor throws `RunnerExecutionError('provider-error')`; `onSent` never called.
3. **Malformed payload** — `job.payload` missing `html`; executor throws `RunnerExecutionError('validation-error')`; sender never invoked.

## Security & Audit

No secret values, private credentials, tokens pass through the executor — it sees only the job payload (addresses, subject, html). The provider secret lives behind the sender's resolved `SecretReference`.

The error taxonomy (`provider-error` vs `validation-error`) lets the runner distinguish a retryable transport failure from a poison payload that should dead-letter without further attempts. Every successful send emits a structured `onSent` event carrying `jobId`, `to`, and `messageId` for downstream audit correlation.

## Next Case Study Thread

Register `createCampaignSendExecutor` with the durable runner worker, keyed on a `campaign-send` job kind — a dispatcher mapping job type → executor. After that, a campaign compose/approve UI (owned separately by the UI team) can surface send status by reading the runner's audit log.
