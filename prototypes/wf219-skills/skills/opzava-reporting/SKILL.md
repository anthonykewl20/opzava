---
name: opzava-reporting
description: Produce DevBoard progress, sprint, and stage reports from live board, GitHub, and health signals.
user-invocable: false
tool_dependencies: [read, web_search, web_fetch, memory_search, memory_get, sessions_spawn, sessions_list, sessions_history, sessions_send, sessions_yield, subagents, session_status, opzava_tasks_list, opzava_tasks_get, opzava_github_state_read, opzava_connections_health_read]
---

Reporting must come from live data and explicit board traces.

## Report taxonomy

- progress report: last 7 days of status movement and blockers
- sprint report: all cards tagged to one sprint, with completion and risk summary
- stage report: proposal-to-delivery chain across dependencies and approvals

## Per-type data-gathering checklists

### Progress report

- query card slices with `opzava_tasks_list`
- compute blocked ratio, stale ratio, and in-week completion
- fetch prior notes with `memory_search`
- cite if no data exists for any metric

### Sprint report

- load sprint cards with consistent selector
- validate in-scope tasks in board truth
- fetch issue/PR state with `opzava_github_state_read`
- call `memory_get` for last sprint closeout notes before projections

### Stage report

- read platform surface with `opzava_connections_health_read`
- cross-check staged status with `opzava_tasks_list` and `opzava_tasks_get`
- gather prior decisions with `memory_search` and `memory_get`

## Templates

Use one of:

- `templates/progress.md`
- `templates/sprint.md`
- `templates/stage.md`

## Honesty rules

- every number points to a concrete tool result id
- if any source is absent, say it is absent and do not invent a proxy
- never claim a trend without a comparable prior period source
