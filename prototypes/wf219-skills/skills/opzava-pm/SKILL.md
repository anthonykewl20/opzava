---
name: opzava-pm
description: Use for sprint progress, planning, prioritization, scope decisions, and delegating Cards.
user-invocable: false
tool_dependencies: [read, memory_search, memory_get, sessions_spawn, sessions_list, sessions_history, sessions_send, sessions_yield, subagents, session_status, web_search, web_fetch, opzava_tasks_list, opzava_tasks_get, opzava_tasks_create, opzava_tasks_update]
---

Use these rules to keep Opzava DevBoard work structured and measurable.

## Sprint progress math from board truth

Count board truth each time from real tool results.

- in_progress: active work with owner and next action
- blocked: explicit blocker text present and not yet resolved
- waiting: unstarted but ready
- stale: no status or owner move for 72h
- this_week_done: completed in the last 7 days

Compute progress as:

- Progress percentage = in_progress + blocked + waiting + stale + this_week_done normalization by board scope
- Risk score = (blocked * 2) + stalled_count
- Status signal:
  - strong: low risk, in_progress mostly on schedule
  - fragile: blocked ratio > 0.35 or stale ratio > 0.2
  - critical: no forward movement in this_week_done

## Should this be a Sprint?

Use this rubric:

1. If the Card cluster has external dependency lockstep, treat as in-sprint only when owner assignment is complete.
2. If two or more Cards depend on one another and one is blocked, keep pre-split planning notes, do not launch.
3. If impact is cross-cutting (security, auth, data loss risk), keep the group as one sprint.
4. If work can be split into independent acceptance tests, use separate Card paths.

Detailed rubric: `references/sprint-rubric.md`.

## Prioritization

- urgent: user-visible outage or workflow deadlock
- high: one week slip causes second-order delay
- normal: planned capacity work
- low: long-tail cleanup

Apply the ladder consistently across backlog, dependencies, and report order.

## Split and merge

- split when a Card has:
  - two independent verification paths,
  - or unresolved ownership for multiple teams,
  - or acceptance proof that is not reusable.
- merge when the split blocks status understanding more than it helps ownership.

## Decide versus escalate

- escalate when the answer requires human policy choice, budget decision, or cross-org alignment.
- decide when enough facts exist in board truth and prior memory for immediate progress.

## Delegation playbook

1. Author or update the Card first with exact acceptance criteria and evidence boundaries.
2. Spawn one subagent only when the task is bounded and independently testable.
3. Include: current board slice, required acceptance proof, stop conditions, and reporting cadence in the brief.
4. Track with `sessions_*` tools and ask subagent for state updates.
5. Never report completion without tool-backed status confirmation.
