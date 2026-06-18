# 0002: Durable Runner Contracts Before Execution

Date: 2026-06-15
Status: Draft
Thread: Making Opzava reliable before making it busy.

## Hook

The most dangerous automation demo is the one that works once.

One successful run can hide every problem that matters: duplicate side effects, invisible retries, lost failures, expired locks, missing replay context, and secret-bearing payloads drifting into logs.

So before Opzava executes durable workflow jobs, we defined what a durable job is allowed to be.

## Product Stakes

Opzava is an automation tool for real operational work. That means a workflow cannot just “try again” and hope. It needs a durable unit of work, a retry budget, a visible attempt history, and a dead-letter record when the system decides the job should stop.

For the first content workflow, this matters before a single WordPress draft exists. If an SEO brief step times out, Opzava needs to know whether the job is safe to retry, whether the retry budget is exhausted, and whether an operator can replay from the failed step without rerunning the whole workflow.

## Industry Counterfactual

A fragile automation chain usually treats failure as a log line.

Maybe the webhook fails. Maybe the model provider times out. Maybe a retry runs the same external action twice. Maybe the operator gets a red toast and no durable record of what happened.

That kind of system can look fast in a demo, but it cannot earn trust in a real workflow.

Opzava is being built with a different contract: failures become structured records. Retry decisions are explicit. Dead letters preserve replay context. Job payloads cannot carry secret references. Idempotency keys exist before external actions exist.

The result is not “the runner is done.” The result is more important at this stage: the runner now has a shape it must obey when it is built.

## What We Built

We added the first durable runner contracts under `src/opzava/platform/runner/`.

The new contract layer defines:

- `Job`: a persisted unit of work with workflow/run linkage, step linkage, status, idempotency key, payload, priority, schedule time, lease, attempt count, and retry budget.
- `Attempt`: an execution attempt with attempt number, status, timestamps, error class, and retry decision.
- `RetryDecision`: a typed decision to retry, dead-letter, or stop without retrying.
- `DeadLetter`: a failed job snapshot with final error, replay eligibility, replay source, and idempotency-preserving payload summary.
- Job state transitions that reject invalid moves after terminal states.
- Payload guards that reject `SecretReference` values in job and dead-letter payloads.

## What We Refused To Fake

We did not build the runner loop.

We did not create database tables yet.

We did not start background workers.

We did not wire retries to timers.

We did not call providers.

We did not pretend dead-letter replay works before replay contracts and persistence exist.

This slice is deliberately narrow: it defines the durable runner’s rules before code starts moving jobs around.

## Evidence

Runner contract files added:

- `src/opzava/platform/runner/contracts.ts`
- `src/opzava/platform/runner/contracts.test.ts`

The tests cover:

- durable jobs with idempotency keys and retry budgets
- secret-reference rejection inside job payloads
- explicit job transitions
- retryable and terminal attempt outcomes
- replayable dead-letter records

Related contract foundation from the previous entry:

- `src/opzava/core/workflows/contracts.ts`
- `src/opzava/core/artifacts/contracts.ts`
- `src/opzava/core/approvals/contracts.ts`
- `src/opzava/platform/admin-config/contracts.ts`

## Validation

Validation completed locally after the runner contract slice:

```text
pnpm vitest run src/opzava/platform/runner/contracts.test.ts: passed 5/5
pnpm run typecheck: passed
pnpm test: passed 104 files, 1102 tests
pnpm run lint: passed with 0 errors and existing warnings
node --test test/*.test.mjs: passed 21/21
```

Red-first evidence was observed:

- The runner contract test failed first because `src/opzava/platform/runner/contracts.ts` did not exist.
- The first implementation failed on a TypeScript syntax issue in a hyphenated state key.
- The focused runner tests and typecheck passed after the key was corrected.

## The Automation Lesson

Durability is not a worker process.

Durability is the set of promises the worker process is forced to keep.

Today, Opzava gained those promises on paper and in tests: every job needs an idempotency key, every attempt needs a retry decision, and every exhausted failure needs enough context to become visible and replayable later.

## Next Case Study Thread

The next build thread should turn these contracts toward persistence:

- runner tables or repository contracts
- migration tests
- durable job storage
- dead-letter storage
- replay queries
- restart-safe recovery rules

That is the point where Opzava starts moving from contract correctness into operational resilience.
