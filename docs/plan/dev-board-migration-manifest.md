# Dev Board migration and stale-context manifest

Status: **Target migration manifest — no cutover has occurred**

This manifest classifies the old Tasks/Issues artifacts, execution history, ledgers, and tracker
records after the pivot to Dev Board. Its purpose is to clean active context without deleting
history or misrepresenting target behavior as built.

## Classification rules

| Class                          | Meaning                                                                                                            | Required treatment                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Target truth**               | Approved description of the future Dev Board domain and behavior                                                   | Use for decomposition and future implementation. Keep explicit “not built” markers until verified.                                                   |
| **Current as-built**           | Truthful description or implementation of what runs today                                                          | Preserve until expand-contract cutover. Use as a migration source, not as the target contract.                                                       |
| **Frozen historical**          | Evidence of prior decisions, delivered slices, experiments, migrations, reviews, or worklogs                       | Do not delete or rewrite to match the pivot. Add a pointer or status note when it could be mistaken for current guidance.                            |
| **Superseded active guidance** | A plan, PRD section, issue, or queue entry that previously instructed future work and now conflicts with Dev Board | Stop implementing it verbatim. Add supersession pointers, quarantine tracker work, and map useful intent many-to-many into future Dev Board tickets. |

Classification may apply at section level when a document mixes durable history and stale active
instructions. `docs/plan/EXECUTION.md` previously mixed those roles; its active queue is now retired
and its completed slice plan and Worklog are preserved as non-executable history.

## 1. Target truth register

| Artifact                                                 | Scope                                                                                                  | Disposition                                                                                                                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/prd/PRD-019-dev-board.md`                          | User-facing Dev Board target                                                                           | Canonical PRD. Decompose only after Review/Release boundaries are respected. Do not claim its target stories are built.                                                                                    |
| `docs/adr/ADR-017-dev-board-authority-sync-execution.md` | Bounded context, authority, sync, runner trust, and ledgers                                            | Canonical architecture decision. It explicitly supersedes Q17 platform-development guidance without superseding retained outbox/runtime/incident principles.                                               |
| `docs/plan/dev-board-foundation-decisions.md`            | Full locked foundation ledger                                                                          | Canonical fine-grained decision source. New planning must use its terms and cite decisions rather than revive “Task” assumptions.                                                                          |
| `docs/plan/dev-board-migration-manifest.md`              | Cleanup, migration, cutover, and tracker disposition                                                   | Canonical transition map. Update it as records are reconciled and old surfaces retire.                                                                                                                     |
| `docs/plan/research/wf236-releases-gate-contract.md`     | Release aggregate, build-once, staging/production, approval, rollback, evidence, and Incident boundary | Current canonical #236 target input. Canonical docs project the accepted amendment; root issue integration/final closure remains pending. It is not an implementation claim.                               |
| ADR-004 retained principles                              | Postgres authority for Opzava state, projections as cache, outbox/idempotency, runtime refs            | Retain. ADR-017 adds Dev Board as a dedicated context and a GitHub/local-runner authority matrix. Do not use ADR-004's old Project Management platform-board wording to collapse DevTicket into `pm.Card`. |
| ADR-008 retained principles                              | AI Workforce identity, delegation, `AgentDispatch`, OpenClaw runtime separation                        | Retain outside Dev Board. Dev Board owns its assignments, contracts, and leases; runtime refs remain opaque/projected.                                                                                     |
| ADR-013 retained principles                              | Incident/ErrorGroup and remediation authority                                                          | Retain. Incident is a Dev Board projection only and never a DevTicket Type or Sprint member.                                                                                                               |
| ADR-015 retained principles                              | Local Docker to Dokploy parity and Release artifact identity                                           | Retain as amended. Dev Board Review uses the shared local Docker stack; trusted Release builds occur once and staging/production deploy the same manifest-pinned OCI digests without rebuild.              |
| ADR-016 retained principles                              | Mainframe tracked-fork boundary                                                                        | Retain. OpenClaw Workboard remains runtime-owned and is not ported or renamed Dev Board.                                                                                                                   |

### Target vocabulary that every dependent spec must adopt

- Dev Board: admin platform-development workspace.
- DevTicket: canonical work unit.
- Card: visual representation of a DevTicket.
- GitHub Issue: durable synchronized mirror of an accepted DevTicket.
- Proposal: pre-acceptance discovery.
- Incident/ErrorGroup: separate operational aggregate, projected only.
- Runner: execution location and receipt source, not agent identity.
- Implementation capacity: a per-enrolled-Runner admission limit expressed as Focused, Balanced, or
  capability-bounded Custom; never one organization-global slot.
- Ordinary DevTicket: a Ready non-Sprint DevTicket admitted only by explicit governed claim.
- Six lanes: Backlog, Todo, Blocked, In Progress, Review, Done.
- Release: separate desired-promotion aggregate; never a DevTicket lane or Incident lifecycle.
- Release Candidate / Release Manifest: immutable source and build-once artifact identity after
  seal.
- Current Environment Deployment / Last Known Good: distinct truthful observed pointers; unknown or
  mixed current state never overwrites known-good evidence.

## 2. Current as-built register

The entries below are real code or schema today. They are not the Dev Board target.

### Domain, application, and storage

| Current artifact                                                               | Current responsibility                                                                         | Migration disposition                                                                                                                                                            |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/project-management/src/domain/task.ts`                               | Generic `Task`, four statuses `todo/in_progress/blocked/done`, low/normal/high/urgent priority | Preserve as source during expand-contract. Do not rename in place and pretend it implements DevTicket. Retire after all callers and rows migrate.                                |
| `packages/project-management/src/application/tasks.ts`                         | Task CRUD, moves, card detail, steps, watchers, comments, evidence, and quality operations     | Reuse validated infrastructure only behind explicit adapters/backfill. Replace public workflow authority with Dev Board commands before write cutover.                           |
| `packages/project-management/src/application/issues.ts`                        | GitHub issue projection sync, create intent, Task provenance linking, and issue-close outbox   | Treat as integration source. New Dev Board sync needs managed body regions, labels, comments/worklogs, conflicts, health, and generic outbox rather than close-only behavior.    |
| `packages/project-management/src/events/task-events.ts`                        | Task event shapes                                                                              | Freeze at cutover. Do not assume an emitted legacy event is a durable Dev Board history record unless it was actually persisted.                                                 |
| `packages/project-management/src/adapters/postgres/schema/tasks.ts`            | `tasks`, steps, watchers, comments, and read markers with RLS                                  | Preserve rows and IDs. Backfill to Dev Board tables; remove only in a later forward migration after verification and rollback window.                                            |
| `packages/project-management/src/adapters/postgres/schema/issues.ts`           | `issue_projection`, `issue_close_outbox`, and `issue_create_intent` with RLS                   | Reconcile every issue/outbox row into GitHub mirror and sync-ledger state before retirement.                                                                                     |
| `packages/project-management/src/adapters/postgres/schema/evidence-quality.ts` | Task evidence, quality review, checks, and reviewers                                           | Import as historical evidence/review facts. Existing records do not satisfy the new locked-contract/SHA independent Review gate unless explicitly verified.                      |
| `packages/ports/src/issue-tracker.ts`                                          | Current issue-only provider port                                                               | Expand or replace behind Dev Board's GitHub App integration. Preserve provider abstraction; add PR/check/comment/webhook capability without leaking GitHub DTOs into the domain. |
| `packages/adapters/src/github/issues.ts`                                       | GitHub issue list/create/close adapter; skips PRs                                              | Current provider adapter and valuable test seam. It is insufficient for target two-way sync and repository delivery facts.                                                       |
| `apps/workers/src/issues/process-close-outbox.ts`                              | Process-only issue-close outbox runner                                                         | Drain/reconcile before cutover, then replace with the durable Dev Board sync/outbox worker. Do not drop pending or dead items.                                                   |

### Historical database migrations that must never be rewritten

| Migration group                                                                  | What it introduced                                     | Disposition                                                                          |
| -------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `0002_slice1e_tasks.sql`                                                         | Initial Tasks storage                                  | Frozen migration history; add forward migrations only.                               |
| `0004_slice25_card.sql`                                                          | Card detail children, comments, watchers, read markers | Frozen migration history and backfill source.                                        |
| `0006_slice25_issues.sql`                                                        | Issue projection and close outbox                      | Frozen migration history and sync-ledger source.                                     |
| `0007_slice25_evidence_quality.sql`                                              | Evidence and quality tables                            | Frozen migration history and evidence source.                                        |
| `0008_slice25_issue_outbox_hardening.sql`, `0009_slice25_outbox_claim_token.sql` | Create intent, outbox hardening, claims                | Frozen migration history; salvage idempotent claim/retry lessons for the new outbox. |
| `0010_slice25_mutation_idempotency.sql`, `0011_slice25_drop_position_unique.sql` | Mutation dedupe and ordering correction                | Frozen migration history; preserve source semantics during backfill.                 |
| `0013_slice3_per_workspace_card_numbers.sql`                                     | Workspace-scoped card numbers                          | Frozen migration history; retain migrated numbers as historical aliases.             |

### Runtime tools and execution projections

| Current artifact                                                     | Current responsibility                                                | Migration disposition                                                                                                                                                                                         |
| -------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/runtime-control/src/application/task-tools.ts`             | Agent-facing Task list/create/update, including old status vocabulary | Replace with Dev Board command adapters. Remove any path that can create/update directly to Done. Preserve stored tool outcomes as execution history.                                                         |
| `packages/runtime-control/src/application/tool-execution-harness.ts` | Outcome-first tool execution/idempotency harness                      | Retain as reusable runtime infrastructure if it can carry DevTicket version, actor, lease, preset/admission, and command provenance. It is not by itself the Runner admission controller or execution ledger. |
| Runtime-Control assistant conversations/turns/tool outcomes          | Current Ask Admin runtime history                                     | Preserve as OpenClaw/assistant runtime history. Link to DevTicket commands by stable refs where available; do not fold raw turns into Dev Board activity.                                                     |
| `apps/mcp-server/src/tools.ts`                                       | Richer current Task/Card tool surface under a separate principal      | Inventory every operation, then replace with one governed Dev Board application seam. Do not port caller-selectable human/reviewer provenance or Done capability unchanged.                                   |
| `apps/workers/src/link-tokens/issue-mcp-link-token.ts`               | Current MCP link-token support for issue/task work                    | Preserve auth history and evaluate as a connection adapter. It does not replace enrolled-machine keys, leases, fencing, or runner receipts.                                                                   |

### Web routes, views, and activity

| Current artifact group                                                                                                                   | Current responsibility                                                         | Migration disposition                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/(app)/tasks/**`, `apps/web/components/tasks/**`                                                                            | Current Task Board, Card detail, actions, Ask Admin panel                      | Keep live until cutover. Build `/dev-board` separately, dual-read for comparison, then redirect legacy routes and retire components.                          |
| `apps/web/app/(app)/issues/**`, `apps/web/lib/issues.ts`, `apps/web/lib/issues-state.ts`                                                 | Current standalone GitHub Issues page, sync/create actions, filters and stages | Keep live until Dev Board GitHub mirror is complete. Do not preserve a standalone Issues product after cutover.                                               |
| `apps/web/app/api/tasks/[cardId]/activity/route.ts`                                                                                      | Task Card activity stream                                                      | Migrate clients to Dev Board activity/history plus separately linked runner and sync ledgers.                                                                 |
| `apps/web/app/api/tasks/ask-admin/turn/route.ts`                                                                                         | Current Ask Admin Task tool bridge                                             | Move to an audience-correct Ask Admin/Dev Board command seam; preserve outcome attribution and idempotency.                                                   |
| `apps/web/lib/task-card-activity*`, `task-card-ai-run*`, `task-card-comments.ts`, `task-card-detail.ts`, `task-card-evidence-quality.ts` | Current Card projections for comments, run summaries, evidence, and quality    | Treat as backfill and UI-reference sources. Split target activity, worklog, runner receipts, and Review evidence rather than retaining one overloaded stream. |
| `apps/web/lib/tasks-board-view.ts`                                                                                                       | Current visual mapping that treats `blocked` as Review                         | Supersede. Target has both Blocked and Review as distinct lanes.                                                                                              |
| `apps/web/lib/shell-state.ts`, `apps/web/components/shell/admin-nav.tsx`, notification and Ask Admin links                               | Separate Tasks and Issues destinations and deep links                          | Switch to Dev Board navigation only after cutover. Preserve `/tasks/<card>` and issue deep-link redirects.                                                    |

### Current tests

The current Task, Card, Issue, GitHub adapter, runtime-control, shell, and browser tests are
as-built regression coverage. Preserve them during expand-contract. Add target tests first; change
or remove legacy expectations only after the new vertical story and migration reconciliation prove
equivalent retained behavior. Important groups include:

- `packages/project-management/src/__tests__/slice1e-tasks.integration.test.ts`
- `packages/project-management/src/__tests__/slice25e-issues.integration.test.ts`
- `packages/project-management/src/__tests__/slice25e-issues.test.ts`
- `packages/adapters/src/github/__tests__/issues.test.ts`
- `packages/runtime-control/src/__tests__/slice2a-runtime-control.integration.test.ts`
- `apps/web/test/tasks-board-view.test.ts`
- `apps/web/test/task-card-detail.test.ts`
- `apps/web/test/issues-page.test.ts`
- `apps/web/test/shell-state.test.ts`
- `apps/web/test/ask-admin-route.test.ts`
- `tests/e2e/drives/connections-github.mjs`

## 3. Frozen historical register

| Artifact                                                                                                 | Why it remains                                                                            | Disposition                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plan/EXECUTION.md` Worklog                                                                         | Records what agents actually built, tested, failed, and resumed                           | Preserve verbatim or move verbatim to a dated execution-history file with a source pointer. Never rewrite past claims into Dev Board terminology. |
| `docs/plan/grilling-decisions.md` Q17 body                                                               | Records the old five-lane/Blocked-flag, Lead-Orchestrator-review design and its reasoning | Add/retain a superseded pointer to PRD-019/ADR-017; keep the text as history.                                                                     |
| `docs/plan/consensus/slice1e-review.spark.md` and Slice 2/2.5 task/MCP reviews                           | Evidence for the current Task and local-tool implementation                               | Freeze. They explain as-built behavior and migration hazards but do not define target gates.                                                      |
| `docs/plan/research/slice2-ask-admin-opzava.md`, `slice2.5-cc-mcp-live-card.md`, and related 2.5 reviews | Historical research and verification for Ask Admin/Task tooling                           | Freeze and cite from dependent Ask Admin work where still relevant. Do not treat as runner-protocol specification.                                |
| `docs/plan/research/wf212-ask-admin-tool-inventory.md`                                                   | Current tool inventory and security findings                                              | Freeze as evidence; remap its Task tool recommendations to Dev Board after #215. Preserve the discovered Done/provenance bypass risks.            |
| Dated docs audits and consensus reviewer outputs                                                         | Explain prior architecture and review decisions                                           | Freeze. Add a target pointer only when search results could mislead an implementer.                                                               |
| Database migrations `0002`–`0013` listed above                                                           | Immutable schema history                                                                  | Never edit or delete; create forward migrations.                                                                                                  |
| Prototype branch `prototype/dev-board-v1`, commits `27aa4660`, `a4ecf553`, `8ebfecf5`                    | Approved visual planning evidence for Board B, Card detail A, Sprints A                   | Freeze as throwaway visual artifacts. Do not merge prototype code as production.                                                                  |
| Prototype branch `prototype/admin-shell-v1`, commit `0dd1bff3`                                           | Selected Admin Overview Variant A evidence for the PRD-020 control-center projection      | Freeze as throwaway visual evidence only. It may display Dev Board capacity but does not define or own admission behavior.                        |
| Closed/delivered slice issue comments, PRs, commits, CI runs, and GitHub history                         | Durable record of the old implementation                                                  | Preserve. Link from migration audit where a record is imported or quarantined.                                                                    |
| Vendored `docs/openclaw/**` task/Workboard docs and `mainframe/` runtime code                            | Upstream/runtime concepts, not the stale Opzava Tasks product                             | Do not rename or purge as part of Dev Board cleanup. OpenClaw Workboard remains a distinct runtime concern.                                       |

## 4. Superseded active-guidance register

| Artifact or section                                                                                                                                 | Conflict with target                                                                                                              | Required cleanup                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/plan/consensus/tasks-ai-workforce-design.md`                                                                                                  | Five lanes with Blocked as a flag; Task as execution unit; Lead Orchestrator as Reviewer; old hosted-MCP/dispatch assumptions     | Mark entire contract superseded by PRD-019/ADR-017 and freeze. Extract useful implementation lessons only through new tickets.                                                                                                             |
| `docs/plan/EXECUTION.md` former Tasks-first execution queue; Slices 1, 2, and 2.5 when read as future design                                        | Called admin Tasks the MVP/source and retained separate Tasks/Issues surface assumptions                                          | The file is now explicitly historical. Preserve completed slice facts and Worklog; do not recreate an active queue inside it or “continue Q17” from an unchecked item. Approved replacement issues and this manifest control current work. |
| `docs/plan/grilling-decisions.md` Q17 status as current lock                                                                                        | Conflicts with the later all-day Dev Board grilling                                                                               | Add a supersession note at the Q17 heading pointing to PRD-019, ADR-017, and the foundation ledger. Keep old decision text frozen.                                                                                                         |
| roadmap.md (deleted 2026-07-16 focus cleanup) — former P0.5 Tasks-MVP and P1 “AI task board” assumptions                                            | Treats the old board as the operating target                                                                                      | Label historical/delivered portions; replace future platform-development references with Dev Board. Keep generic AI Workforce runtime projections separate.                                                                                |
| `docs/plan/capability-parity.md` standalone Tasks/Issues rows                                                                                       | Old surface inventory can be mistaken for target IA                                                                               | Keep current rows explicitly labeled migration input and add one target Dev Board row. Never classify OpenClaw Workboard as the replacement.                                                                                               |
| PRD-003 (deleted 2026-07-16 focus cleanup) — former admin Task Board and external issue-to-`pm.Card` development pipeline portions                  | Conflates generic PM, platform DevTicket, and GitHub work                                                                         | Retain generic Projects/`pm.Card` requirements. Supersede only admin platform-development Task/Issue ownership with PRD-019.                                                                                                               |
| `docs/prd/PRD-006-agent-roster-automation.md` Agent Task Board portions                                                                             | Treats platform work as an AI Workforce runtime board                                                                             | Retain roster, automation, and runtime trace concepts. Dev Board owns platform work; AI Workforce/OpenClaw only project execution facts into it.                                                                                           |
| `docs/prd/PRD-012-admin-observability.md` “Issues”/ADMIN board wording where it overlaps development issues                                         | Risks making Incident a DevTicket or merging two lifecycles                                                                       | Retain Incident/ErrorGroup and remediation authority. Rename/disambiguate its projection; Incident remains non-Sprint operational work.                                                                                                    |
| `docs/prd/PRD-013-connections-tools.md` local tool/link and GitHub-adjacent setup where treated as enough for execution                             | Link tokens and generic health do not provide runner fencing, GitHub App capability health, Review configuration, or Docker setup | Retain general Connections policy. Extend Admin setup from PRD-019; do not claim existing tool links are enrolled runners.                                                                                                                 |
| `docs/prd/PRD-002-app-shell-nav.md` separate Tasks/Issues nav                                                                                       | Conflicts with one Dev Board destination                                                                                          | Change navigation only at verified route cutover; keep historical mockup references annotated.                                                                                                                                             |
| `docs/prd/PRD-007-knowledge-skills.md` generic Docs where read as Dev Board contract authority                                                      | Generic knowledge does not specify version-bound planning documents                                                               | Retain Knowledge scope; PRD-019 owns Dev Board Docs lifecycle and GitHub Markdown mirror. Integrate through explicit document ports/refs.                                                                                                  |
| `docs/architecture/modules/project-management.md`, `runtime-control.md`, `web.md`, `workers.md`, `SEAM-MAP.md`, and `ubiquitous-language-bridge.md` | Truthfully document current Task/Issue seams but may be read as target architecture                                               | Keep as-built statements. Add target/current markers now; regenerate module maps after cutover rather than pre-editing them into fiction.                                                                                                  |
| `docs/agents/issue-tracker.md` pre-cutover GitHub workflow                                                                                          | GitHub remains the interim human workflow until Dev Board exists                                                                  | Keep the interim instructions with an explicit cutover condition and target pointer. Do not tell agents to use an unbuilt Dev Board.                                                                                                       |

## 5. Tracker issue disposition

The first published delivery map is a planning Wayfinder, not an implementation backlog. Two
independent plan audits blocked the provisional implementation draft, so those implementation tracer
bullets were not published. A DeepSeek tiebreaker approved the smaller planning graph after
requiring content corrections. Qwen 3.7 Max then independently approved the final map with warnings;
its Q2-to-Q7 dependency and authorization correction is reflected in the blocking edges below.

### Published planning Wayfinder

| Issue                                                                                                           | Planning outcome                                                                                                                                                                                                                                                                                                                                                                         | Blocked by                                     |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| #228 — Wayfinder: Dev Board implementation delivery graph                                                       | Parent map for resolving the remaining architectural unknowns before implementation decomposition                                                                                                                                                                                                                                                                                        | —                                              |
| #229 — Grill and lock the independent Review Gate contract                                                      | Resolve independent reviewer execution, Review WIP, the exclusive shared-Docker lease, locked-SHA evidence, approval, retry, merge, and Done boundaries                                                                                                                                                                                                                                  | —                                              |
| #230 — Reconcile DevTicket commands, claims, Blocked, revisions, dependencies, and archive                      | **Resolved 2026-07-16.** [`wf230-devticket-command-model.md`](research/wf230-devticket-command-model.md) locks the aggregate/module split, trusted command envelope, versioned Ready and exception decisions, claim/start and interruption/loss sagas, dependency/queue concurrency, archive/history distinction, event catalog, and four-ledger ownership.                              | —                                              |
| #231 — Reconcile GitHub bootstrap, two-way sync, delivery facts, Actions exceptions, and conflict remediation   | Resolve two-way GitHub authority, idempotency, conflict, capability health, and reconciliation against the command boundary                                                                                                                                                                                                                                                              | #230                                           |
| #232 — Reconcile Runner, Slack Personal Assistant, Ask Admin, and secret trust seams                            | **Resolved 2026-07-17.** [`wf232-runner-control-protocol.md`](research/wf232-runner-control-protocol.md) locks enrolled local/cloud identity, connection/capability ceremonies, typed signed delivery/receipt/Enforcer authority, pre-spawn/grant/process containment, exact-ref handoff, reconnect/no-failover, Slack/Ask Admin/MCP provenance, and deterministic real-seam validation. | #230                                           |
| #233 — Reconcile Incident projections, governed interruption, strict Sprint order, and ordinary-work preemption | Resolve Focused/Balanced/Custom admission, Sprint waiting and serial reservation, ordinary claims, governed pause/preemption, blocking discoveries, and dependency ordering                                                                                                                                                                                                              | #230, #232                                     |
| #234 — Complete the governed Docs type, planning-log, and invalidation matrix                                   | Resolve PRD/planning/research document authority, version binding, mirroring, and links to DevTickets                                                                                                                                                                                                                                                                                    | #230, #231                                     |
| #235 — Lock archive, retention, exceptional redaction, tombstone, and revocation behavior                       | Resolve durable history, secret/redaction boundaries, imported records, and four-ledger retention across command, GitHub, and Runner seams                                                                                                                                                                                                                                               | #230, #231, #232                               |
| #236 — Grill and lock the Releases Gate contract                                                                | Canonical target contract prepared in `wf236-releases-gate-contract.md` and projected into canonical docs; root issue integration/final closure remains pending. It defines staging/live separation, build-once manifests, approvals, failure, rollback, evidence, history, and Incident boundaries without claiming implementation.                                                     | —                                              |
| #237 — Produce and audit the final implementation ticket graph and reciprocal Q17 mapping                       | Integrate #229–#236, pass independent audit, publish implementation tracer bullets, and record exact reciprocal mappings for #147–#157                                                                                                                                                                                                                                                   | #229, #230, #231, #232, #233, #234, #235, #236 |

This graph satisfies the manifest's sequencing rule: implementation tracer bullets remain unassigned
and unpublished until the Review Gate and every planning child resolve and #237 passes an
independent audit. A planning issue being open does not authorize implementation work, and a future
implementation issue is not claimable merely because its likely shape appears in PRD-019 or the
foundation ledger.

While #228 remains open, only resolved research memos explicitly designated **current input** by
this manifest or the map are current for their downstream children; linkage alone is insufficient,
and a frozen/consumed disposition always wins. This manifest designates
`research/wf230-devticket-command-model.md` and `research/wf236-releases-gate-contract.md` current
inputs until #237 synthesizes and independently audits them into the final tracer-bullet graph;
after that they become frozen planning evidence rather than parallel implementation authority.

This manifest also designates `research/wf232-runner-control-protocol.md` current input for #233,
#235, and #237 until #237 synthesizes and independently audits its enrolled Runner, command/receipt,
Lease Enforcer/containment, secret-grant, reconnect, Slack/Ask Admin/MCP provenance, and local/cloud
boundaries into the final tracer-bullet graph. Its `research/wf232-runner-vendor-evidence.md`
appendix remains supporting evidence only. After #237, both freeze as planning evidence rather than
parallel implementation authority.

Runner/trust investigation #232 has resolved the enrolled endpoint, hard safe capability, transport,
receipt, Lease Enforcer, containment, secret, and reconnect boundaries. Preset scheduling,
reservation, waiting, pause, and preemption remain owned by Sprint/admission investigation #233.
Reviewer execution and the exclusive shared local Docker lease remain owned by Review investigation
#229. The selected Admin Variant A prototype is projection evidence only; PRD-020 may display these
states but cannot settle or own their implementation details.

### Superseded/quarantined Q17 issues #147–#157

All eleven are many-to-many migration sources. They received planning-map comments on 2026-07-16 and
remain open, `superseded`, and unclaimable. Keep their discussion and links, remove any ready/claim
signal, and retain pointers to PRD-019, ADR-017, this manifest, and Wayfinder #228. Issue #237 owns
the exact reciprocal mapping from every old acceptance item to the audited implementation graph.
Only that mapping and audit authorize closing these issues as `not planned`; they must never be
closed as “implemented by Dev Board.”

| Issue | Old slice                                          | Disposition                                                                                                                                                                                                                                              |
| ----- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #147  | Five-lane Task data model; Blocked flag            | Quarantine. Replace with dedicated DevTicket expand-contract, six lanes, versioned contracts, dependencies, proposals, Sprints, ledgers, and migration. Preserve RLS/projection test intent.                                                             |
| #148  | Task transitions and ownership                     | Quarantine. Recut around Ready, atomic claim/lease, Blocked recovery, independent Review, and Done-after-merge. Preserve command/audit and fail-closed intent.                                                                                           |
| #149  | Governed task/review tools                         | Quarantine. Recut around one Dev Board command seam, trusted provenance, independent Reviewer, Slack commands, and runner receipts. Do not retain Lead-Orchestrator-only Review or caller-selected human provenance.                                     |
| #150  | Issue/Task/PR port                                 | Quarantine but salvage heavily. Recut around GitHub App two-way sync, managed body/labels/comments, PR/check facts, health, outbox, conflicts, and one repo.                                                                                             |
| #151  | Hosted MCP and OAuth                               | Quarantine. The hosted-MCP/OAuth-server-only design is not carried forward. Its governed connectivity/control intent is being reallocated across the command, GitHub, Runner, and Slack investigations; #237 must record final ownership before closure. |
| #152  | Dispatcher worker, push/poll                       | Quarantine. Recut around Runner-local Focused/Balanced/Custom admission, ordinary explicit claims versus Sprint `autonomous_serial`, governed pause/preemption, durable outbox, fenced leases, and runner selection.                                     |
| #153  | Gateway-side sandboxed subagent                    | Quarantine. Recut as explicit orchestrator/cloud runner capability; never automatic failover from local. Local-only Review and Docker remain mandatory.                                                                                                  |
| #154  | Evidence gate and Lead Orchestrator Quality Review | Quarantine pending the separate Review Gate grilling. Preserve adversarial/evidence reality goals, but replace reviewer identity and bind evidence to contract version/SHA/local Docker.                                                                 |
| #155  | Human-only Done and merge                          | Quarantine pending Review details. Target Done occurs only after review/approval and confirmed merge into `development`; staging/production are Releases.                                                                                                |
| #156  | Five-lane Tasks UI                                 | Quarantine. Replace with selected Dev Board IA, six lanes, Board B, Card detail A, Sprints A, global themes, List/Docs/Development/Releases.                                                                                                             |
| #157  | E2E and MCP compatibility proof                    | Quarantine. Recut around one real authenticated local-Docker browser vertical plus Postgres/outbox, signed GitHub webhook/conflict, and deterministic runner-protocol seams. Keep client compatibility as a separate Connections concern.                |

### Capture and active dependent issues

| Issue                              | Status in the pivot  | Required action                                                                                                                                                                                                                                                     |
| ---------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #215 — Capture the Dev Board model | **Capture bridge**   | Update with links to PRD-019, ADR-017, foundation decisions, migration manifest, and the selected prototype commits. Summarize the authority, six lanes, Review, Sprints, GitHub mirror, and runner model; then close only when dependents acknowledge the capture. |
| #210 — Ask Admin Opzava v1 map     | **Active dependent** | Replace “consume Q17” references with “consume PRD-019/ADR-017.” Keep Ask Admin scope separate from Dev Board domain design.                                                                                                                                        |
| #216 — delegation path             | **Active dependent** | Consume explicit Runner identity, fenced per-Runner capacity, Focused/Balanced/Custom admission, ordinary claim versus serial Sprint mode, offline pause/no automatic failover, and worklog/checkpoint ledgers. Do not inherit #152/#153 unchanged.                 |
| #218 — governed Card authority     | **Active dependent** | Use ADR-017's authority matrix, version-bound Slack confirmation, Absolute Stops, independent Review, and Done-after-merge. Use DevTicket/Card terms.                                                                                                               |
| #219 — v1 skills                   | **Active dependent** | Rename task-authoring concepts to DevTicket/Ready Contract/Proposal/Sprint vocabulary. Skills guide behavior; server commands enforce gates.                                                                                                                        |
| #220 — assembled Ask Admin v1 spec | **Active dependent** | Cite the canonical Dev Board docs, not the old Q17 contract. Keep Ask Admin implementation slices separate from the future Dev Board issue decomposition.                                                                                                           |

### ADR/PRD pointer issues

| Issue | Pointer                      | Disposition                                                                                                                               |
| ----- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| #91   | ADR-004                      | Keep open/pointer status. Add ADR-017 related decision; retain outbox/projection principles and clarify dedicated Dev Board context.      |
| #95   | ADR-008                      | Keep. Clarify Dev Board-specific assignment/runner authority while retaining general AI Workforce/AgentDispatch.                          |
| #100  | ADR-013                      | Keep. Clarify Incident is projection-only in Dev Board and remediation links to Bug/Technical Task.                                       |
| #104  | PRD-002                      | Amend target nav to one Dev Board route after cutover; preserve interim routes until then.                                                |
| #105  | PRD-003 (deleted 2026-07-16) | Generic Projects/`pm.Card` remains under the Project Management context (ADR-004); platform Tasks/Issues ownership superseded by PRD-019. |
| #107  | PRD-005                      | Keep Ask Admin/assistant scope; link its Dev Board commands to #218 and ADR-017.                                                          |
| #108  | PRD-006                      | Keep roster/automation/run traces; remove Dev Board ownership from generic Agent Task Board language.                                     |
| #109  | PRD-007                      | Keep Knowledge/Skills; link Dev Board's versioned Docs mirror rather than merging domains.                                                |
| #114  | PRD-012                      | Keep Incident/Admin Observability; disambiguate “Issues” from GitHub-backed DevTickets.                                                   |
| #115  | PRD-013                      | Keep Connections; add GitHub App health, local machine enrollment, tool selector, Reviewer config, Docker/preview setup dependencies.     |

## 6. Record mapping and quarantine rules

| Legacy source                                     | Target mapping                                                                                                                | Safety rule                                                                                                                                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tasks.id`                                        | Preserve as DevTicket UUID where collision-free                                                                               | Never generate a new ID merely to simplify migration. Record explicit aliases if target identity constraints force a new key.                                                                                        |
| `tasks.card_number`                               | Preserve as historical card alias                                                                                             | GitHub issue number becomes primary visible ID. Do not discard old deep links.                                                                                                                                       |
| `title` and `description`                         | Summary/context plus candidate contract material                                                                              | An old description does not automatically pass Ready. Missing contract fields send the record to Backlog shaping.                                                                                                    |
| `status=todo`                                     | Backlog by default; Todo only after validation of a new Ready Contract Version and Ready Approval                             | Never bulk-promote old Todo rows into executable Ready work.                                                                                                                                                         |
| `status=in_progress`                              | Blocked/legacy-execution-reconciliation until actor, branch/worktree/SHA, lease, and contract can be established              | Never mint a lease around an unknown process or pretend work is active.                                                                                                                                              |
| `status=blocked`                                  | Blocked with legacy source, reason if available, and required resolution action                                               | Do not map Blocked to Review as the current visual projection does.                                                                                                                                                  |
| `status=done`                                     | Frozen historical completion with legacy gate version; optionally display in Done history after evidence/merge reconciliation | Do not retroactively claim it passed the new Review contract, and do not reopen completed historical work solely because the gate did not exist. Exclude unverified legacy completion from new-gate quality metrics. |
| `priority=urgent/high/normal/low`                 | Candidate P1/P1/P2/P3 mapping                                                                                                 | Never auto-create P0 from legacy `urgent`; P0 requires current critical incident/security semantics. Require human confirmation for active work.                                                                     |
| `assignee_user_id`                                | Legacy assignee attribution                                                                                                   | Do not infer Human Owner or active Execution Assignee/lease. Require role confirmation.                                                                                                                              |
| `labels`                                          | Preserve as legacy/unmanaged labels; deterministically map recognized managed taxonomy only                                   | Do not guess Type, Work Area, Severity, or Risk from arbitrary strings.                                                                                                                                              |
| `provenance_source` and `provenance_external_ref` | Source audit and GitHub mirror link candidate                                                                                 | Validate repository and issue identity with the GitHub App before accepting it as the mirror.                                                                                                                        |
| Task steps                                        | Imported checklist/history                                                                                                    | Do not reinterpret as acceptance criteria or Ready Contract without explicit mapping.                                                                                                                                |
| Task watchers/read markers                        | DevTicket subscriptions/read state                                                                                            | Preserve per-user semantics and RLS.                                                                                                                                                                                 |
| Task comments                                     | Dev Board Comments plus imported activity records                                                                             | Preserve original author kind, identity, body, idempotency, and timestamp. Do not rewrite into worklogs.                                                                                                             |
| Task evidence                                     | Imported historical evidence                                                                                                  | Preserve object/link provenance. It satisfies new Review only when contract version, exact SHA, runner, and check meaning are provable.                                                                              |
| Quality review/check/reviewer rows                | Imported legacy Review history                                                                                                | Preserve verdict and actors with a `legacy review contract` marker. Do not grant new Done eligibility automatically.                                                                                                 |
| `issue_projection`                                | GitHub mirror snapshot and reconciliation seed                                                                                | Re-fetch through authenticated GitHub App and compare number, URL, state, labels, assignee, and update time.                                                                                                         |
| `issue_create_intent`                             | Sync-ledger create attempt/confirmation                                                                                       | Preserve idempotency and failure history; resolve every processing/failed row before cutover.                                                                                                                        |
| `issue_close_outbox`                              | Sync outbox/conflict ledger                                                                                                   | Drain or migrate pending/processing/failed rows with their dedupe keys and attempts. Never drop a deadletter silently.                                                                                               |
| Runtime tool outcomes and AI Run projections      | Runner/execution history links where attributable                                                                             | Preserve raw runtime authority in Runtime-Control/OpenClaw. Import only sanitized receipts/summaries, never forge local-runner signatures.                                                                           |

Every source record must end in exactly one migration disposition: migrated, merged into a named
target, frozen historical, archived, or quarantined with reason and owner. “Skipped” without a
disposition is a cutover blocker.

## 7. Four-ledger migration

### Planning decision ledger

- Seed from PRD-019, ADR-017, the foundation ledger, approved Docs, Planning Session Logs, Q17
  historical decisions, Sprint Plan revisions, and Proposal decisions.
- Preserve timestamps and actors where known. Mark synthesized decisions as syntheses; do not invent
  original timestamps for individual statements.
- Keep rejected alternatives and superseded versions addressable.
- Never copy hidden model reasoning, raw tool output, secrets, or noisy execution telemetry.

### Dev Board activity/history ledger

- Backfill Task create/update/move, comments, watchers, evidence attachment, legacy quality
  decisions, issue link/create/close confirmation, and known human/assistant attribution.
- Mark imported events with source table/record/commit and legacy gate version.
- Do not manufacture missing transitions from current final state. A snapshot is not proof that
  every intermediate event occurred.

### Runner execution/checkpoint ledger

- Preserve current AI Run/tool outcome/runtime refs as legacy execution observations, with source
  authority and sanitization.
- Do not treat old tool outcomes as signed local-runner receipts.
- New entries require machine key, lease/fence, nonce, monotonic sequence, contract version,
  worktree/branch/SHA, heartbeat/checkpoint, and reconciliation semantics from ADR-017.
- Do not infer a legacy organization-wide or Runner capacity limit from concurrent process history.
  New admissions record the selected Runner preset, effective safe limit, Sprint/ordinary class, and
  authorized command. Preset, pause/preemption, downgrade, and reconciliation decisions belong in
  durable Dev Board activity/audit history and cross-link to affected Runner receipts.

### Synchronization/outbox/conflict ledger

- Import issue create intents, close-outbox records, current issue snapshots, provider request IDs
  where available, and adapter errors.
- Preserve dedupe keys, attempt counts, claims, last errors, and confirmations.
- Start GitHub delivery/event dedupe and per-aggregate versions at an explicit cutover epoch;
  reconcile a full provider snapshot before enabling two-way writes.

## 8. Expand-contract sequence

1. **Freeze the target and stale guidance.** Land PRD-019, ADR-017, this ledger, and this manifest.
   Mark Q17 docs/issues superseded without deleting them. Update #215 and dependent issue pointers.
2. **Inventory and backup.** Count every Task, child row, evidence/review row, issue projection,
   create intent, outbox row, runtime outcome ref, route deep link, and relevant GitHub
   issue/comment. Capture a reproducible migration report before schema changes.
3. **Add target storage and commands.** Create the dedicated Dev Board context, RLS-protected
   schema, authority-aware commands, four ledgers, GitHub App sync, Runner-local admission/presets,
   and runner protocol without redirecting current routes.
4. **Backfill deterministically.** Preserve IDs and aliases, apply the mapping table above, attach
   source refs, and quarantine every ambiguous record. Do not silently promote Ready, assign roles,
   or bless legacy evidence.
5. **Dual-read and reconcile.** Render Dev Board from target state while legacy writes remain
   authoritative. Compare counts, identifiers, fields, comments, evidence, issue facts, outbox
   state, and permissions. Dual-read is bounded; avoid permanent dual writes.
6. **Shadow synchronization.** Verify signed webhooks, dedupe, full snapshot reconciliation, managed
   body/labels/comments, conflict behavior, health, and outbound confirmations without allowing the
   new integration to create duplicate provider writes.
7. **Cut over commands.** After the real vertical acceptance story passes, make Dev Board the only
   product write authority. Disable legacy Task/Issue mutations and old agent/MCP paths or adapt
   them to Dev Board commands.
8. **Cut over navigation and deep links.** Replace Tasks/Issues nav with Dev Board. Redirect
   `/tasks`, `/tasks/<card>`, and `/issues` only after record-level reconciliation proves the target
   destination. Preserve direct GitHub issue links.
9. **Retire legacy code and tables.** Remove legacy routes/components/tools/workers after a
   monitored rollback window. Use forward migrations. Retain immutable migration history and frozen
   docs.
10. **Regenerate architecture and execution context.** Update module maps, seam map, ubiquitous
    language, capability parity, PRD pointers, and this migration manifest to match verified code.
    Keep `EXECUTION.md` historical and preserve its Worklog unchanged unless a separately named
    successor control document is explicitly approved.

## 9. Cutover gates

Cutover is blocked until all of the following are true:

- Every legacy source row has a migration disposition and source-to-target audit ref.
- Task UUID and card-number preservation is verified, including deep links.
- GitHub mirror identity is reconciled for every accepted/migrated DevTicket that requires one.
- Comments, watchers/read state, steps/checklists, evidence, quality history, and timestamps match
  migration counts or have named quarantine reasons.
- Pending, processing, retrying, and dead issue outbox/create-intent records are drained or migrated
  without dedupe loss.
- No legacy `todo` is executable without a new Ready Contract Version and Ready Approval.
- No legacy `in_progress` has an invented active lease.
- No legacy quality row is represented as passing the new Review contract without exact contract/SHA
  proof.
- GitHub App authentication, permissions, webhooks, rate state, outbox, and snapshot reconciliation
  are healthy and observable.
- Secret exposure and unverifiable-GitHub bypass attempts fail through UI, Slack, GitHub, agent, and
  command seams.
- The deterministic Postgres/outbox, signed GitHub webhook/conflict, and runner lease/reconnect
  tests pass.
- Runner-local admission tests pass for Focused contention, Balanced one-Sprint-plus-one-ordinary
  and two-ordinary modes, Sprint Waiting for capacity without lease termination, Custom safe-range
  failure, capacity downgrade without termination, and rejection of a second Active Sprint or
  concurrent second Sprint DevTicket.
- Review Handoff tests prove a checkpoint alone never releases implementation capacity; release
  requires a finalized Review Handoff with verified no-process or stopped/quarantined
  process/worktree and every credential/tunnel confirmation. Fresh Reviewer authority and execution
  start only after the finalized `ReviewRequested` fact. The one exclusive shared-Docker lease
  serializes only stack-using/mutating or locked-SHA-invalidating work, and unrelated coding
  continues. Material Revision after finalization preserves that handoff and exits Review only with
  the exact #229-authenticated **Review Containment Proof** for Reviewer/Docker/tunnel/evidence
  authority.
- Release tests prove unique stable-version reservation, exact Git composition, immutable
  candidate/manifest/tag identities, trusted build once, identical staging/production digests,
  fenced attempts, deterministic staging verification, distinct current human Staging/Production
  Approvals, protected-main promotion, publication pending, rollback/Incident separation, mixed and
  unknown provider truth, Cards remaining Done, and secret absence. No Release target behavior is
  described as built before those gates and the authenticated Releases story pass.
- Admission, preset, governed pause/preemption, downgrade, disconnect, and reconciliation changes
  are authorized and audited. No Overview projection or automatic local-to-cloud failover can mutate
  this state outside the Dev Board command boundary. **Pre-Start Admission Loss** proves no start,
  remains Todo without Blocked, and releases held resources only after every grant/tunnel
  confirmation; provider denial, provisioning expiry, pre-start cancellation, disconnect, and final
  activation race it under the same locks.
- One real authenticated browser vertical story passes on the real local Docker stack.
- `/tasks` and `/issues` redirects resolve to the correct migrated DevTicket or explicit
  archived/quarantined explanation.
- Search, nav, notifications, Ask Admin, Docs, List, Board, Sprint, and Development surfaces no
  longer emit stale Task/Issue identity as target vocabulary.
- A rollback procedure can restore legacy reads without accepting new writes into both models.

## 10. Cleanup completion definition

The old context is clean when:

- no active plan or unquarantined tracker issue instructs an agent to implement Q17 or the separate
  Tasks/Issues target;
- all searches for “Tasks board” or standalone development “Issues” lead either to current-as-built
  inventory, frozen history, or an explicit Dev Board pointer;
- `EXECUTION.md` is explicitly historical and no unchecked item in it is executable; this manifest
  plus explicitly approved replacement issues control current work;
- Project Management docs keep `pm.Card` and generic to-dos without claiming DevTicket ownership;
- Admin Observability docs keep Incident/ErrorGroup without calling Incident a DevTicket Type;
- OpenClaw Workboard/runtime docs remain intact and clearly separate;
- current implementation maps remain truthful until code changes, then are regenerated from verified
  code;
- four ledgers have explicit ownership, retention, and cross-links;
- no target guidance describes one organization-global implementation slot or says ordinary work
  must always queue behind an Active Sprint; the per-Runner preset and single serial Sprint rules
  appear together wherever concurrency is described;
- legacy code, routes, and tables are retired only after verified cutover; and
- GitHub history, old worklogs, migrations, prototypes, and decisions remain accessible as
  historical evidence.
