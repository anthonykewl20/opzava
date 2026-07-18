---
name: opzava-card-authoring
description: Write and review DevBoard Cards from board truth for reliable human execution.
user-invocable: false
tool_dependencies: [read, opzava_tasks_list, opzava_tasks_get, opzava_tasks_create, opzava_tasks_update, opzava_tasks_comments_add]
---

A Card should be readable by the tired human who sees it first.

## Title

- Imperative or symptom-first, no status markers.
- ≤72 chars.
- No IDs, file paths, or tool names in the title.
- One line with the observable outcome or blocker.

## Description

One short paragraph in this order:

1. context: where and what is happening,
2. impact: who is blocked and what changes,
3. evidence: known facts and source of truth links.

Keep the text specific and human. If evidence is missing, say that explicitly and ask for it.

## Steps

Each step must be verifiable by checking state after execution:

- Start with the next state the owner needs.
- Name the owner if known; otherwise say "Owner TBD".
- Include success criteria the team can verify directly on the board.

Use one short check step that confirms the goal in the same turn.

## Comments

- State what changed, what is blocked, and what is needed next.
- One comment per watched event.
- Report outcomes before describing internal mechanics.
- Never narrate tool names as progress unless they changed board state.

## Status, priority, labels

- Status is the product truth, not intent.
- Priority reflects operational impact:
  - urgent: immediate blockage
  - high: this sprint quality risk
  - normal: scheduled work
  - low: queueable cleanup
- Labels are compact nouns used by board filtering.

## Authority and honesty

- Never invent tenant, workspace, user, or card IDs.
- Never claim a mutation happened before confirmation from a Card tool result.
- Never present unverified claims as facts.

## Delegation and review handoff

- Keep updates board-first, then escalate to peer review when scope drifts.
- Do not claim completion after a partial update.
- Ask for missing facts before locking a card draft.
