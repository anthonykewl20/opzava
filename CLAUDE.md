# Opzava - AI agent guide

Concise, project-specific, scannable. Claude treats this as guidance, not enforcement; use hooks or scripts for hard guarantees.

## Start Here
- `docs/plan/EXECUTION.md` (hereafter `EXECUTION.md`) is the living control doc: current phase, slice, next action, required skills, acceptance signal. Read it before any work.
- Work one slice or issue at a time; never skip ahead.
- Keep `EXECUTION.md` in sync with reality: tick deliverables, set status, append a dated worklog, then commit.
- Use the `handoff` skill for clean stop, resume, and transfer.

## Source Map
- `ARCHITECTURE.md`: system overview, bounded contexts, ports, invariants, deployment, ADR index.
- `CONTEXT.md`: canonical glossary; use these terms exactly.
- `docs/adr/`, `docs/prd/`: architecture decisions and product specs.
- `docs/plan/official-docs.md`: official docs registry; validate APIs here before coding.
- `docs/plan/roadmap.md`: post-MVP product roadmap.
- `docs/plan/grilling-decisions.md`: design record Q1-Q18.
- `docs/plan/capability-parity.md`: screen ownership and parity map.
- `docs/plan/backlog.md`: planning input only; `EXECUTION.md` controls work order.
- `docs/plan/consensus/`, `docs/plan/research/`: frozen evidence, not current truth.
- `docs/plan/audits/`, `docs/runbooks/`: audits and ops runbooks.
- `docs/openclaw/`: vendored OpenClaw docs; design to these.
- `docs/ux-law/`, `ux-redesign/mockups/`: UX reference library and canonical mockups/tokens.
- `mainframe/`: Opzava-owned OpenClaw fork; customize only via `mainframe/PATCHES.md` rung 0-3.
- `docs/agents/`: issue-tracker, triage-label, and domain-doc conventions for the engineering skills.

## Non-Negotiables
- OpenClaw parity: harness OpenClaw's real capabilities; do not reinvent.
- Official-docs: verify current official docs for OpenClaw, frameworks, languages, libraries, and APIs before coding.
- Gateway: one static per-tenant `openclaw-platform-gateway`; dynamic provisioning waits for multi-tenant.
- Token: hot path uses `write` + `approvals`; JIT path uses `admin`.
- ACL: `gateway-broker` is the only ACL to OpenClaw.
- Data: Postgres is truth; projections are rebuildable caches; RPC snapshots are truth, WS events are hints.
- Security: tool policy beats SOUL claims; RLS denial is a hard 403, never an empty result.
- Ops: local docker-compose stays in parity with live Dokploy; no routable orphan Gateway.
- Architecture: scale-ready modular DDD, agnostic ports, sad-path-first behavior, lean VPS ops.
- Mockup parity: corrected mockups are the design contract. Match structure, classes, and tokens (visual), and make every implemented element work live with real data and interactions (functional); prove with side-by-side screenshots.

## Repo Hygiene
- Keep files clean, clearly named, and easy to delete or reuse.
- Contain scratch work, prototypes, probes, generated artifacts, and disposable scripts in one folder that can be cleaned wholesale; never scatter `.local.*`, screenshot, log, fixture, or validation files across the repo root.
- Keep E2E scripts, fixtures, helpers, screenshots, and validation flows in the standard test area so they stay available for future slices; promote useful probes into it rather than leaving ad hoc copies, and if no standard location exists, create or document one first.

## Workflow
1. Orient: read this file and `EXECUTION.md`; load `opzava-conventions` and the slice's required skills named in `EXECUTION.md`.
2. Scope: work only the current slice or issue from `EXECUTION.md`.
3. Validate docs: check `docs/plan/official-docs.md`, `docs/openclaw`, vendor docs, and validation tools before coding APIs.
4. Build: implement only the linked ADR or PRD behavior; keep local style and architecture.
5. Prove: run `tdd`, `code-review`, and `qa`, then the final gate.
6. Record: update `EXECUTION.md` and the issue, then commit on a branch off `development`.

**Final gate (the Done bar):** `node real-world-validate.local.mjs` against `http://web.opzava.localhost:18088` with real login, real seeded data, and real screenshots, passing 2 consecutive clean runs. Procedure: `docs/runbooks/senior-qa-gate.md`. The gate is a script, not a skill — `code-review` and `qa` do the review and exploratory-QA work, but neither replaces the gate's exit code.

Done means every workflow gate passed. Missing a required skill means authoring it with `writing-great-skills` first.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`anthonykewl20/opzava`) via the `gh` CLI; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) map to identically named labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
