<!-- Opzava PR — the gated workflow is mandatory. See CLAUDE.md. -->

## What & why
Closes #<!-- issue --> — implements <!-- ADR-0NN / PRD-0NN / Slice -->.

## Gated workflow (all must be checked)
- [ ] Read `CLAUDE.md` + `docs/plan/EXECUTION.md`; used the `opzava-conventions` skill.
- [ ] Used the exact skills named on the issue (+ authored any missing skill via `writing-great-skills`).
- [ ] Validated every API against official docs before coding (`docs/plan/official-docs.md`, `docs/openclaw`, and current framework/library docs).
- [ ] Built strictly to the linked ADR/PRD; all `opzava-conventions` invariants honored — tenant RLS `withTenant` / 403-not-empty · two-token boundary · projections-are-a-cache · tool-policy-first · agnostic ports · no OpenClaw types in the core.
- [ ] Designed to `docs/openclaw` (parity) — harnessed, did not reinvent.
- [ ] `tdd` tests added and passing · lint + typecheck green (`verify-deep`) · `code-review` done.
- [ ] Local ↔ Dokploy parity intact (single compose, Traefik labels; no routable orphan Gateway).
- [ ] `docs/plan/EXECUTION.md` updated (slice status + worklog).
- [ ] Branched off `development`; commits follow `commit-style`; no force-push to shared branches.

## Acceptance signal
<!-- the concrete "now usable" check from the slice/issue -->
