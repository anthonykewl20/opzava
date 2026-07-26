# Opzava - AI agent guide

Concise, project-specific, scannable. Claude treats this as guidance, not enforcement; use hooks or
scripts for hard guarantees.

## Start Here

Three active sprints own current work. Everything else is shared foundation or frozen history.

- **Ask Admin Opzava** — the admin-facing assistant / Lead-Orchestrator chat (the WebChat-parity
  port; `chat.*` RPCs through the broker). Contract: `docs/prd/PRD-005-assistants-chat.md`. Read it
  and the current wayfinder research before changing the admin chat, orchestrator, or broker
  `chat.*` paths.
- **Dev Board** — the Opzava-primary developer-operations surface. Governed by
  `docs/prd/PRD-019-dev-board.md`, `docs/adr/ADR-017-dev-board-authority-sync-execution.md`,
  `docs/plan/dev-board-foundation-decisions.md`, and `docs/plan/dev-board-migration-manifest.md`;
  read all four before touching the legacy Tasks, Issues, MCP task-tool, execution-ledger,
  GitHub-integration, card-detail, or migration paths.
- **Admin Control Center** — shell, navigation, Admin Overview composition, and page placement are
  governed by `docs/prd/PRD-020-admin-control-center.md` and
  `docs/plan/admin-control-center-foundation-decisions.md`; read them with
  `docs/plan/capability-parity.md` before changing the root Overview, admin shell/nav, topbar,
  Admin placement, or cross-context composition.

Work one current approved GitHub issue at a time; never skip its dependency or readiness gates.
Record progress in that issue; Dev Board migration work also updates the migration manifest. Use
the `handoff` skill for clean stop, resume, and transfer.

**Frozen / superseded — never use as an executable brief:**
- Q17 and GitHub issues #147–#157 are superseded/quarantined historical evidence — never an
  executable brief. Replacement tickets require explicit human approval before publishing.
- `docs/plan/EXECUTION.md`, `docs/plan/grilling-decisions.md`, `docs/plan/consensus/`, and
  `docs/plan/audits/` are frozen historical evidence: don't rewrite them or read them as current
  instructions.
- A resolved Wayfinder memo remains current only when an active map or migration manifest
  explicitly designates it **current input** until a named synthesis consumes it. A link alone
  never revives a memo.

## Source Map
- `ARCHITECTURE.md`: system overview, bounded contexts, ports, invariants, deployment, ADR index.
- `CONTEXT.md`: canonical glossary; use these terms exactly.
- `docs/adr/`, `docs/prd/`: architecture decisions and product specs.
- `docs/plan/official-docs.md`: official docs registry; validate APIs here before coding.
- `docs/plan/capability-parity.md`: screen ownership and parity map.
- `docs/plan/dev-board-foundation-decisions.md`: locked Dev Board decision ledger.
- `docs/plan/dev-board-migration-manifest.md`: legacy-to-target inventory and migration sequence.
- `docs/plan/research/`: resolved memos; current only when an active map explicitly designates
  them so.
- `docs/plan/audits/`, `docs/runbooks/`: audits and ops runbooks.
- `docs/openclaw/`: vendored OpenClaw docs; design to these.
- `docs/ux-law/`, `ux-redesign/mockups/`: UX reference library and canonical mockups/tokens.
- `mainframe/`: Opzava-owned OpenClaw fork; customize only via `mainframe/PATCHES.md` rung 0-3.
- `docs/agents/delivery-workflow.md`: **the required order for every change** — read it first.
- `docs/agents/`: issue-tracker, triage-label, and domain-doc conventions.

## Non-Negotiables
- OpenClaw parity: harness OpenClaw's real capabilities; do not reinvent.
- Official-docs: verify current official docs for OpenClaw, frameworks, languages, libraries, and
  APIs before coding.
- Gateway: one static per-tenant `openclaw-platform-gateway`; dynamic provisioning waits for
  multi-tenant.
- Token: hot path uses `write` + `approvals`; the JIT admin path uses `admin`.
- ACL: `gateway-broker` is the only hot-path ACL to OpenClaw; the provisioning-worker owns the
  admin/JIT path. Browser code never calls OpenClaw or sees Gateway DTOs/secrets.
- Data: Opzava Postgres is product/workflow truth; GitHub owns native issue number/URL and
  PR/commit/check/merge facts; OpenClaw RPC snapshots own runtime truth; projections are rebuildable
  and WS events are hints.
- Security: tool policy beats SOUL claims; RLS denial is a hard 403, never an empty result.
- Ops: local docker-compose stays in parity with live Dokploy; no routable orphan Gateway.
- Architecture: scale-ready modular DDD, agnostic ports, sad-path-first behavior, lean VPS ops.
- Mockup parity: only a mockup/prototype linked by the current PRD and approved issue is a design
  contract. Match its structure and tokens, make every visible element work live with real data, and
  prove it with side-by-side screenshots.

## Repo Hygiene
- Keep files clean, clearly named, and easy to delete or reuse.
- Contain scratch work, prototypes, probes, generated artifacts, and disposable scripts in one
  folder that can be cleaned wholesale; never scatter `.local.*`, screenshot, log, fixture, or
  validation files across the repo root.
- Keep E2E scripts, fixtures, helpers, and drives in `tests/e2e/` (drives, probes, shared
  `lib/session.mjs`; see `tests/e2e/README.md`) so they stay available for future slices; promote
  useful probes into it rather than leaving ad hoc copies at the repo root.

## Working here

**Follow `docs/agents/delivery-workflow.md` — it is the required order for every change.** There is
no long-tenured engineer here: every task starts with someone new, so the process lives in the repo,
not in anyone's head. Orient from this file, the current approved GitHub issue or PRD, and any skills
it names. Scope to that one issue; keep local style and architecture; honor the Non-Negotiables.
Validate current docs before coding APIs. Record progress in the approved issue; Dev Board migration
also updates the migration manifest. Never rewrite the frozen `EXECUTION.md` worklog. Missing a
required skill means authoring it with `writing-great-skills` first.

**`ocask` is in development — do not use it on this project.** Route model calls and reviews through
`opencode` directly, not the `ocask` CLI, `/ocask` skill, or its model-flow routing.

**Diagnose by differential probe, not assumption:** when the live system rejects or breaks on
something, first find a nearby path that *works* (another model/provider/CLI/version) as a
**control**, then change **one variable** and re-run to localize the delta. Runtime probe > doc
inference > guess. Never run an expensive fix before the cheapest disproof of your hypothesis. Use
the `diagnosing-bugs` skill for hard bugs.

**Verify before done:** drive the affected flow on the real local stack
(`http://web.opzava.localhost:18088`, real login, real seeded data) and observe it working — the
`/verify` skill plus the real `tests/e2e/` drives. Keep it lean and high-signal: prove the exact
behavior that changed. Then commit on a branch off `development`.
