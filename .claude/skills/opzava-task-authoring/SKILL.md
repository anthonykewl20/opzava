---
name: opzava-task-authoring
description: Write Opzava task cards humans understand. Use whenever creating or updating a Task/card (title, description, steps, comments, labels) via the admin UI, MCP tools, or Ask Admin — or when reviewing agent-written cards for readability.
---

A card is read by a tired human scanning a board. Every field earns its place by answering the reader's next question before they ask it. The bar: **a card reads human** — like a sharp teammate wrote it, never like a log line.

## Title
- Imperative or symptom-first, ≤ 72 chars, no trailing period; `—` or `:` separators are fine: `Login keeps failing — 2FA error`, `Reorder dogfood seed to decided order`.
- Test: a reader can state the problem without opening the card. Title states the symptom/goal — never the first step ("Investigate…" is a step, not a title).
- Name the observable thing, not the implementation: "2FA error", not "TOTP window drift in auth adapter".
- Never: ids, hashes, file paths, "misc", "updates".

## Description — one short paragraph covering, in order: context, impact, evidence
- **Context** (what is happening and where), **impact** (who/what it blocks), **evidence** (what is already known — reproduction, measurements, links). Merge or drop a slot when it is genuinely empty.
- Example: "A customer can't finish signing in: after entering their 2-factor code the page shows 'invalid token'. Reproduced on a test account — the code seems to expire a few seconds early."
- Prose, not bullet fragments. No stack traces inline — attach as evidence and reference.

## Steps
- Each step is a **verifiable action with an owner**: someone can check done/not-done without asking ("Reproduce the issue on a test account", not "Investigate").
- 2–6 steps; order = the plan. Last step is always a check that the card's goal is demonstrably met (bug: fix confirmed; feature: behavior observed; chore: result verified).
- Assignee = whoever will execute that step, when known; otherwise leave unassigned rather than guessing.

## Comments — status-forward
- Lead with what changed or what you need: "Drafted a reply explaining the code-timing issue — ready for your review before it goes out."
- One comment per event a watcher would want to be notified about, not per thought. Never narrate internal tool mechanics ("calling opzava_tasks_update…"); state the outcome.
- If an action did NOT complete, the comment must say so plainly.

## Status, priority, labels
- Status is the board truth: `todo | in_progress | blocked | done`. `blocked` requires the blocker named in a comment.
- Priority = consequence of delay, not excitement: `urgent` (someone is waiting right now) · `high` (this week or things slip) · `normal` (default) · `low` (whenever).
- Labels are nouns the board filters by (area or workflow: `roadmap`, `customer-facing`, `ux-redesign`). Reuse existing labels before inventing; ≤ 3 per card.

## Authority and honesty (non-negotiable)
- Never fabricate assignees, watchers, due dates, or evidence. Absent facts stay absent.
- Ids (tenant/org/workspace/user/task) are never invented or echoed from user prompts — they come from the session context; a card that needs an id you don't have is a question to the human, not a guess.
