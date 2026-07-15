# Opzava - AI agent guide

Concise, project-specific, scannable. Claude treats this as guidance, not enforcement; use hooks or scripts for hard guarantees.

## Start Here
- Dev Board migration work is governed by `docs/prd/PRD-019-dev-board.md`,
  `docs/adr/ADR-017-dev-board-authority-sync-execution.md`,
  `docs/plan/dev-board-foundation-decisions.md`, and
  `docs/plan/dev-board-migration-manifest.md`. Read all four before changing the legacy Tasks,
  Issues, MCP task-tool, execution-ledger, GitHub-integration, or card-detail paths.
- `docs/plan/EXECUTION.md` preserves the prior slice plan and dated worklog as historical evidence;
  its old "first unchecked slice" instruction is void. When changing legacy Tasks, Issues, MCP
  task-tool, execution, GitHub-integration, card-detail, or Dev Board migration paths, work only an
  approved replacement issue from the Dev Board migration manifest. General repository work remains
  allowed from its current approved GitHub issue or PRD.
- For Dev Board migration, Q17 and GitHub issues #147–#157 are superseded/quarantined. Do not
  implement, rewrite, or claim them as current authority; replacement tickets require explicit human
  approval before publishing.
- Work one current approved issue at a time; never skip its dependency or readiness gates.
- Record current progress in the current approved issue. Dev Board migration work also updates the
  migration manifest. Preserve the historical `EXECUTION.md` worklog verbatim.
- Use the `handoff` skill for clean stop, resume, and transfer.

## Source Map
- `ARCHITECTURE.md`: system overview, bounded contexts, ports, invariants, deployment, ADR index.
- `CONTEXT.md`: canonical glossary; use these terms exactly.
- `docs/adr/`, `docs/prd/`: architecture decisions and product specs.
- `docs/prd/PRD-019-dev-board.md`: target Dev Board product contract.
- `docs/adr/ADR-017-dev-board-authority-sync-execution.md`: DevTicket authority, sync, runner, and review boundaries.
- `docs/plan/dev-board-foundation-decisions.md`: detailed locked decision ledger from the Dev Board grilling.
- `docs/plan/dev-board-migration-manifest.md`: legacy-to-target inventory, quarantine mapping, and approved migration sequence.
- `docs/plan/official-docs.md`: official docs registry; validate APIs here before coding.
- `docs/plan/roadmap.md`: post-MVP product roadmap.
- `docs/plan/grilling-decisions.md`: design record Q1-Q18 plus the locked Dev Board pivot; Q17 is frozen historical evidence.
- `docs/plan/capability-parity.md`: screen ownership and parity map.
- `docs/plan/backlog.md`: planning catalogue only; the Dev Board migration manifest and approved replacement issues control work order.
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
- Data: Opzava Postgres is product/workflow truth; GitHub owns native issue number/URL and PR/commit/check/merge facts; OpenClaw RPC snapshots own runtime truth; projections are rebuildable and WS events are hints.
- Security: tool policy beats SOUL claims; RLS denial is a hard 403, never an empty result.
- Ops: local docker-compose stays in parity with live Dokploy; no routable orphan Gateway.
- Architecture: scale-ready modular DDD, agnostic ports, sad-path-first behavior, lean VPS ops.
- Mockup parity: only a mockup/prototype linked by the current PRD and approved issue is a design contract. Legacy `task-board.html`/`issues.html` are migration evidence, not the Dev Board target. For an active contract, match structure/tokens and make every visible element work live with real data; prove with side-by-side screenshots.

## Repo Hygiene
- Keep files clean, clearly named, and easy to delete or reuse.
- Contain scratch work, prototypes, probes, generated artifacts, and disposable scripts in one folder that can be cleaned wholesale; never scatter `.local.*`, screenshot, log, fixture, or validation files across the repo root.
- Keep E2E scripts, fixtures, helpers, screenshots, and validation flows in `tests/e2e/` (gate, drives, probes, shared `lib/session.mjs`; see `tests/e2e/README.md`) so they stay available for future slices; promote useful probes into it rather than leaving ad hoc copies at the repo root.

## Workflow
1. Orient: read this file, the current approved issue or PRD, and its required skills. For Dev Board
   migration, also read the four Dev Board authority documents named under Start Here.
2. Scope: work only the current approved issue. For Dev Board migration, it must be an approved
   replacement issue from the migration manifest; never use Q17 or #147–#157 as an executable brief.
3. Validate docs: check `docs/plan/official-docs.md`, `docs/openclaw`, vendor docs, and validation tools before coding APIs.
4. Build: implement only the behavior linked by the current issue or PRD; for Dev Board migration,
   also honor the migration slice. Keep local style and architecture.
5. Prove: run `tdd`, `code-review`, and `qa`, then the final gate.
6. Record: update the current approved issue; Dev Board migration also updates the migration
   manifest. Never rewrite the historical EXECUTION worklog. Then commit on a branch off
   `development`.

**Final validation gate:** `node tests/e2e/gate/real-world-validate.mjs` against `http://web.opzava.localhost:18088` with real login, real seeded data, and real screenshots, passing 2 consecutive clean runs. Procedure: `docs/runbooks/senior-qa-gate.md`. The script does not replace Dev Board's independent Review contract; a DevTicket becomes Done only after the exact reviewed change passes every applicable gate and is merged into `development`.

Done means every workflow gate passed. Missing a required skill means authoring it with `writing-great-skills` first.

## Agent skills

### Issue tracker

Until Dev Board ships, engineering issues use GitHub Issues (`anthonykewl20/opzava`) through the
`gh` CLI as an interim tracker. The target is Opzava-primary DevTicket workflow with a durable
GitHub Issue mirror. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical skill-facing triage roles remain transitional until Dev Board replaces them.
Target managed GitHub labels are namespaced (`priority:`, `type:`, `risk:`, `severity:`, `area:`,
`status:`) and must not collide with existing phase labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
