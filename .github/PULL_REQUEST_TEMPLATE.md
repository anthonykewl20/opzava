<!-- Opzava PR — use default judgment; honor the Non-Negotiables in CLAUDE.md. -->

## What & why
Closes #<!-- issue --> — implements <!-- issue / PRD / ADR -->.

## Checklist
- [ ] Read `CLAUDE.md`; used the `opzava-conventions` skill (plus any skills named on the issue; authored missing ones via `writing-great-skills`).
- [ ] Validated every API against official docs before coding (`docs/plan/official-docs.md`, `docs/openclaw`, and current framework/library docs).
- [ ] Built to the linked issue/PRD; all `opzava-conventions` invariants honored — tenant RLS `withTenant` / 403-not-empty · two-token boundary · projections-are-a-cache · tool-policy-first · agnostic ports · no OpenClaw types in the core.
- [ ] Designed to `docs/openclaw` (parity) — harnessed, did not reinvent.
- [ ] Verified on the real local stack (`/verify` + the `tests/e2e/` drives); lint + typecheck green.
- [ ] Local ↔ Dokploy parity intact (single compose, Traefik labels; no routable orphan Gateway).
- [ ] Branched off `development`; commits follow the repo conventions; no force-push to shared branches.

## Acceptance signal
<!-- the concrete "now usable" check from the issue -->
