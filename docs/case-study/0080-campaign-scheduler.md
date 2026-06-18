# 0080: Campaign Scheduler

Date: 2026-06-17
Status: Draft
Thread: Opzava owns the timing of every email-campaign step so a single, testable scheduling engine decides when each send runs. This case study covers the pure scheduler that turns a campaign definition into a list of concrete `sendAt` timestamps the durable runner will later enforce.

## Hook

Email-campaign timing is usually a black box: a vendor schedules, an orchestration tool re-schedules, and a queue redispatches. By the time something fires at the wrong hour, three systems have opinions. Opzava instead treats the schedule as data the platform owns outright — one module, one function, one deterministic answer.

## Product Stakes

If the scheduler is a side effect, every downstream guarantee collapses:

- **Auditability** — "why did this send at 03:14?" must have a single, replayable answer.
- **Replays** — re-running a campaign for QA cannot drift because the wall clock moved.
- **Provider trust** — Opzava's contract with ESPs is "deliver at `sendAt`", not "optimise our timing".

The scheduler is the smallest, sharpest place to enforce that contract.

## Industry Counterfactual

Most ESPs and marketing clouds treat scheduling as infrastructure: cron jobs, workflow editors, timezone pickers. The schedule lives in their database, is mutated by their UI, and is only loosely tied to the campaign definition you authored. Two consequences:

- **Non-determinism** — the same campaign definition can produce different `sendAt` values across environments.
- **Hidden state** — pausing, resuming, or "sending now" rewrite the schedule silently, and the change is not visible in your source-of-truth campaign document.

Opzava's stance: the schedule is a pure function of the campaign + a supplied `startAt`. Nothing else.

## What We Built

`src/opzava/modules/content/workflow/campaign-schedule.ts` (+ `campaign-schedule.test.ts`).

- `computeCampaignSchedule(input)` validates `{ startAt: ISO, steps: [{ stepId, offsetHours: int 0..8760 }] }`.
- Returns `[{ stepId, sendAt }]` where `sendAt = startAt + offsetHours`.
- Deterministic: `startAt` is passed in, never read from `Date.now`.
- Rejects: invalid `startAt`, negative `offsetHours`, duplicate `stepId`.
- Downstream, the durable runner enqueues a send job at each `sendAt` — the scheduler never enqueues itself.

## What We Refused To Fake

- **No "schedule at construction"** — `startAt` is an input, not a side effect of when the function happens to run.
- **No silent clamping** — invalid offsets and dates are rejected, not coerced into something plausible.
- **No provider-as-orchestrator** — Opzava owns the schedule; the ESP receives `sendAt` and obeys it. Consistent with ARD 0004: no second orchestration engine, no parallel truth.

## Evidence

- 4/4 targeted tests pass: computes `sendAt` for 0h/24h/72h offsets; rejects negative offset; rejects invalid start date; rejects duplicate step ids.
- Full `vitest` suite: ~1542 tests across ~197 files, green.
- `tsc` clean.
- `eslint` 0 warnings.

## Validation

The interesting property is not "does it compute arithmetic" but "can we replay last quarter's campaign tomorrow and get the same `sendAt`". Because the function has no clock dependency and no I/O, the answer is yes — a property the wider workflow module can now lean on when it needs a fixed timeline for audit or for testing the runner in isolation.

## The Automation Lesson

Schedulers that read the wall clock at the moment they run are not schedulers — they are timers dressed up as logic. The moment you inject `startAt` as data, scheduling becomes a pure function you can unit-test, snapshot, replay, and reason about. Push the side effect out to the edge (the durable runner), and your campaign timing stops being a mystery and starts being a contract.

## Next Case Study Thread

Next: an audience contract — a validated, deduped recipient list that the scheduler's output can be paired against — followed by wiring the schedule into the durable runner so an approved, scheduled campaign enqueues exactly one send job per step at its `sendAt`.
