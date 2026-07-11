---
name: Build task (ADR / PRD / slice)
about: A gated implementation task for Opzava
title: "ADR-0NN | PRD-0NN: <title>"
labels: []
---

**Doc:** `docs/adr|prd/...`  ·  **Tier:** P0–P4  ·  **Build order:** see `docs/plan/EXECUTION.md`

## Goal
<!-- what to build, tied to the ADR/PRD -->

## 🤖 AI agent — gated workflow (STRICT; do not skip)
1. Read `CLAUDE.md`, `docs/plan/EXECUTION.md`, and the `opzava-conventions` skill FIRST. Work only the current slice; never skip ahead.
2. **Use these skills:** `opzava-conventions` (always) · <specialized skills> · `tdd` · `code-review`. Author any missing skill with `writing-great-skills` first.
3. Validate every API against official docs before coding: `docs/plan/official-docs.md`, `docs/openclaw`, and current framework/library docs.
4. Build strictly to the linked ADR/PRD; honor every invariant in `opzava-conventions` and `ARCHITECTURE.md`; design to `docs/openclaw` (parity).
5. **Definition of Done:** deliverables complete · acceptance passes · `tdd` tests + lint + typecheck green · local↔Dokploy parity intact · `docs/plan/EXECUTION.md` updated · committed on a branch off `development`.

## Acceptance signal
<!-- the concrete "now usable" check -->
