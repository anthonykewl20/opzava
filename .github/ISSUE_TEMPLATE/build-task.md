---
name: Build task (issue / PRD / ADR)
about: An implementation task for Opzava
title: "<area>: <title>"
labels: []
---

**Doc:** `docs/adr|prd/...` (if any)  ·  **Sprint:** Ask Admin · Dev Board · foundation

## Goal
<!-- what to build, tied to the issue/PRD -->

## Working notes (default judgment — no rigid gate)
1. Read `CLAUDE.md` and the `opzava-conventions` skill first; scope to this one issue.
2. Use `opzava-conventions` (always) plus any specialized skills the issue names; author a missing skill with `writing-great-skills` first.
3. Validate every API against official docs before coding: `docs/plan/official-docs.md`, `docs/openclaw`, and current framework/library docs.
4. Build strictly to the linked issue/PRD; honor every invariant in `opzava-conventions` and `ARCHITECTURE.md`; design to `docs/openclaw` (parity).
5. **Verify before done:** drive the affected flow on the real local stack and observe it working (`/verify` + the `tests/e2e/` drives); lint + typecheck green; record progress in this issue; commit on a branch off `development`.

## Acceptance signal
<!-- the concrete "now usable" check -->
