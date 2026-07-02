# Opzava Docs Audit - 2026-07-02

## Summary verdict

The docs are mostly navigable: scoped inline Markdown links resolve, worklog consensus/research file refs resolve, `CLAUDE.md` counts match the repo (15 ADRs, 18 PRDs), and Slice 1 completion is reflected in `EXECUTION.md`.

The main problem is sync, not missing files. `EXECUTION.md` is the stated control surface, but `roadmap.md`, `grilling-decisions.md`, ADR-014/PRD-014, and older consensus memos still carry pre-Slice-1 or pre-governance language. The highest-risk cleanup is to mark the roadmap/consensus backlog as superseded or current, then reconcile the Marketing+CRM operating mode, billing deferral, and Q15 coverage.

## S1 - out-of-sync / contradiction

### S1-1. `roadmap.md` still presents itself as executable even though `EXECUTION.md` supersedes it

- Evidence: `docs/plan/EXECUTION.md:5` - "This doc supersedes the generic walking-skeleton MVP in `docs/plan/roadmap.md`."
- Evidence: `docs/plan/roadmap.md:3` - "This roadmap is the executable build order for Opzava."
- Evidence: `docs/plan/roadmap.md:48` - "## P0.5 - Walking-Skeleton MVP"
- Fix: Add a top-of-file superseded/current-scope banner to `roadmap.md`, rename P0.5 as historical, and say `EXECUTION.md` controls MVP and execution order.

### S1-2. Marketing+CRM operating mode is stated but not operationalized in the current build order

- Evidence: `ARCHITECTURE.md:7` - "The first business-value build after the admin-Tasks MVP is Marketing + CRM."
- Evidence: `docs/plan/EXECUTION.md:38` - "The first business-value build after the admin-Tasks MVP is Marketing + CRM."
- Evidence: `docs/plan/EXECUTION.md:33` - "Begin Slice 2: provision one platform OpenClaw agent..."
- Evidence: `docs/plan/EXECUTION.md:166` - "### P1 - AI Workforce"
- Evidence: `docs/plan/EXECUTION.md:238` - "### P4 - CRM"
- Evidence: `docs/plan/EXECUTION.md:262` - "### P5 - Dept-Workflows + Marketing"
- Fix: Decide whether Slice 2/P1-P3 remain before Marketing+CRM or whether Marketing+CRM is next; update Current State, The Build, roadmap, and seeded Tasks together.

### S1-3. Q15 exists but `grilling-decisions.md` still claims Q13 is current and Q1-Q14 are the canonical set

- Evidence: `docs/plan/consensus/q15-mvp-roadmap.mmx.md:1` - "```"
- Evidence: `docs/plan/roadmap.md:5` - "Source spine: `docs/plan/consensus/q15-mvp-roadmap.mmx.md`..."
- Evidence: `CLAUDE.md:11` - "`docs/plan/grilling-decisions.md` - the canonical design record (Q1-Q14, every invariant)."
- Evidence: `docs/plan/EXECUTION.md:46` - "Locked design record and sad-path invariants from Q1-Q14."
- Evidence: `docs/plan/grilling-decisions.md:364` - "## Next - Q13 (the original goal)"
- Evidence: `docs/plan/grilling-decisions.md:366` - "generate ADR/PRD docs one-by-one via codex-exec.**  <- current"
- Fix: Add/record Q15 in `grilling-decisions.md`, remove the stale "Next - Q13" queue, and update doc maps to describe Q coverage accurately.

### S1-4. Billing deferral conflicts with Stripe-first billing language

- Evidence: `ARCHITECTURE.md:79` - "Deferred null adapter; payment provider added only when external monetization starts"
- Evidence: `docs/plan/grilling-decisions.md:315` - "Billing status: DEFERRED (2026-07-02)."
- Evidence: `docs/adr/ADR-014-billing-metering.md:3` - "No payment provider, including Stripe, is implemented until external monetization."
- Evidence: `docs/adr/ADR-014-billing-metering.md:21` - "Use Stripe as the first payment and invoicing provider behind `BillingPort`."
- Evidence: `docs/adr/ADR-014-billing-metering.md:55` - "Stripe is replaceable at the boundary but not absent from the first implementation."
- Evidence: `docs/prd/PRD-014-billing-settings.md:3` - "No payment provider, including Stripe, is implemented until external monetization."
- Evidence: `docs/prd/PRD-014-billing-settings.md:19` - "with Stripe isolated behind `BillingPort`"
- Fix: Rewrite ADR-014/PRD-014 provider language as retained future design, with the current implementation explicitly being a null adapter/local entitlement only.

### S1-5. Official-docs registry is not synced with locked version pins

- Evidence: `docs/plan/official-docs.md:5` - "| Tech | Official documentation source | Notes |"
- Evidence: `docs/plan/official-docs.md:8` - "| Next.js | https://nextjs.org/docs |"
- Evidence: `docs/plan/official-docs.md:18` - "| Better Auth | https://better-auth.com/docs |"
- Evidence: `docs/plan/research/slice1-foundation-stack.md:196` - "Locked pins for the Slice 1 scaffold:"
- Evidence: `docs/plan/research/slice1-foundation-stack.md:198` - "TypeScript: pin `5.9.x`, NOT `6.0.3`."
- Evidence: `docs/plan/research/slice1-foundation-stack.md:201` - "Everything else per the version table above..."
- Evidence: `docs/plan/EXECUTION.md:379` - "Node 24.18, pnpm 11.9, Next 16.2.9..."
- Fix: Add a pinned/current-version column or a "current pins" section covering Node 24.18, pnpm 11.9, Next 16.2.9, React 19.2.7, Drizzle 0.45.2, Postgres 18.4, Better Auth 1.6.23, Tailwind 4.3, Traefik 3.6.1, and TS 5.9.x.

### S1-6. Official-docs registry is missing first-class entries for pinned foundation tools

- Evidence: `docs/plan/official-docs.md:7` - "| OpenClaw | `docs/openclaw` |"
- Evidence: `docs/plan/official-docs.md:24` - "| `ws` | https://github.com/websockets/ws |"
- Evidence: `docs/plan/research/slice1-foundation-stack.md:9` - "| Node.js LTS | `24.18.0` LTS..."
- Evidence: `docs/plan/research/slice1-foundation-stack.md:10` - "| pnpm | `11.9.0`..."
- Evidence: `docs/plan/research/slice1-foundation-stack.md:206` - "Pooler-aware DB client: Drizzle over `pg` behind PgBouncer TRANSACTION mode."
- Fix: Add registry rows for Node.js, pnpm, Turborepo, PgBouncer, node-postgres/pg, Vitest, and Playwright, or explicitly link to the Slice 1 foundation memo as the pin registry.

### S1-7. `grilling-decisions.md` still has Drizzle unresolved

- Evidence: `docs/plan/grilling-decisions.md:58` - "## Q1b - Tech stack - LOCKED (user)"
- Evidence: `docs/plan/grilling-decisions.md:59` - "Postgres (Prisma|Drizzle TBD)"
- Evidence: `ARCHITECTURE.md:13` - "Drizzle/Postgres ownership per context"
- Evidence: `docs/plan/EXECUTION.md:377` - "Pins: drizzle-orm 0.45.2, drizzle-kit 0.31.10, pg 8.22.0."
- Fix: Replace `Prisma|Drizzle TBD` with Drizzle/Postgres and link the Slice 1 foundation/data-layer research memos.

### S1-8. Older consensus memos contradict the accepted two-token model

- Evidence: `docs/adr/ADR-003-gateway-broker-acl-two-token.md:5` - "hot-path paired device token... plus a separate short-lived JIT `operator.admin`"
- Evidence: `docs/adr/ADR-003-gateway-broker-acl-two-token.md:57` - "Use the two-token model."
- Evidence: `docs/plan/consensus/q15-mvp-roadmap.mmx.md:5` - "Broker: two-token ACL (user JWT + gw API key)"
- Evidence: `docs/plan/consensus/q13-backlog.mmx.md:5` - "two-token auth model (tenant JWT + delegation JWT)"
- Fix: Mark q13/q15 consensus as historical/superseded where appropriate, or edit their summaries to say paired device token plus JIT admin token.

### S1-9. Capability parity source line is stale on decision coverage

- Evidence: `docs/plan/capability-parity.md:3` - "locked architecture (Q1-Q12 plus Q4b/Q4c)"
- Evidence: `docs/plan/grilling-decisions.md:330` - "## Q14 - Local Docker stack <-> live Dokploy parity (Traefik) - LOCKED"
- Evidence: `docs/plan/roadmap.md:5` - "Source spine: `docs/plan/consensus/q15-mvp-roadmap.mmx.md`..."
- Fix: Update the source line to include Q13/Q14/Q15 or state that the map only classifies the earlier capability-parity decision set.

## S2 - broken reference

### S2-1. `q13-backlog.mmx.md` references non-existent PRDs and ADR-016

- Evidence: `docs/plan/consensus/q13-backlog.mmx.md:21` - "| PRD-019 | AI-Workforce UX..."
- Evidence: `docs/plan/consensus/q13-backlog.mmx.md:28` - "| PRD-026 | PWA + WebPush + offline shell |"
- Evidence: `docs/plan/consensus/q13-backlog.mmx.md:29` - "| PRD-027 | Discovery surfaces... | ADR-010, ADR-016 |"
- Evidence: `docs/plan/consensus/q13-backlog.mmx.md:30` - "| PRD-028 | Goal-create + advanced PM..."
- Evidence: `CLAUDE.md:13` - "`docs/adr/` - 15 ADRs ... `docs/prd/` - 18 PRDs"
- Fix: Mark the q13 backlog memo as superseded by `docs/plan/backlog.md`, or rewrite its IDs to ADR-001..015 and PRD-001..018.

### S2-2. `q8-ai-workforce.codex.md` has vendored doc paths that do not resolve as written

- Evidence: `docs/plan/consensus/q8-ai-workforce.codex.md:13` - "`multi-agent.md`, `soul.md`, `agent-workspace.md`, `agent.md`"
- Evidence: `docs/plan/consensus/q8-ai-workforce.codex.md:13` - "`cron-jobs.md`, `tasks.md`, `channels/channel-routing.md`"
- Fix: Expand every shorthand to its real repo path, for example `docs/openclaw/concepts/multi-agent.md` and `docs/openclaw/automation/cron-jobs.md`.

### S2-3. `q9-error-pipeline.codex.md` has vendored doc paths that do not resolve as written

- Evidence: `docs/plan/consensus/q9-error-pipeline.codex.md:17` - "`cli/logs.md`, `automation/tasks.md`, `cli/tasks.md`"
- Evidence: `docs/plan/consensus/q9-error-pipeline.codex.md:17` - "`plan/grilling-decisions.md`"
- Fix: Prefix OpenClaw refs with `docs/openclaw/` and the plan ref with `docs/plan/`, or convert them to Markdown links.

### S2-4. `q11-dept-workflows.codex.md` uses a brace path that is not a concrete file reference

- Evidence: `docs/plan/consensus/q11-dept-workflows.codex.md:17` - "`docs/openclaw/automation/{index,standing-orders,cron-jobs,taskflow,tasks}.md`"
- Evidence: `docs/plan/consensus/q11-dept-workflows.codex.md:17` - "`docs/openclaw/cli/approvals.md`"
- Fix: Expand the brace expression into five concrete links so link/path checks can validate each vendored page.

## S3 - organization gap

### S3-1. The main doc maps omit important scoped doc families

- Evidence: `CLAUDE.md:8` - "## Doc map (reference - `EXECUTION.md` is the control surface)"
- Evidence: `CLAUDE.md:9` - "`ARCHITECTURE.md` - the whole system..."
- Evidence: `CLAUDE.md:15` - "`docs/openclaw/` - vendored OpenClaw docs."
- Evidence: `docs/plan/EXECUTION.md:40` - "## Reference Map"
- Evidence: `docs/plan/EXECUTION.md:51` - "`docs/openclaw/` | Vendored OpenClaw docs..."
- Evidence: `docs/plan/roadmap.md:5` - "Source spine: `docs/plan/consensus/q15-mvp-roadmap.mmx.md`, `docs/plan/backlog.md`..."
- Evidence: `docs/ux-law/README.md:1` - "# UX Research & Frontend-UX Reference Library"
- Fix: Add `docs/plan/backlog.md`, `docs/plan/consensus/`, `docs/plan/research/`, and `docs/ux-law/` to the maps, with short usage guidance.

### S3-2. Consensus and research docs lack an index explaining current vs historical status

- Evidence: `docs/plan/grilling-decisions.md:4` - "Consensus memos ... live in `docs/plan/consensus/`."
- Evidence: `docs/plan/consensus/q13-backlog.mmx.md:1` - "| id | title | tier | depends-on | effort |"
- Evidence: `docs/plan/consensus/q15-mvp-roadmap.mmx.md:2` - "WALKING-SKELETON MVP"
- Evidence: `docs/plan/research/q6-auth-stack.md:3` - "Raw: `q6-auth-stack.deepresearch.json`."
- Fix: Add `docs/plan/consensus/README.md` and `docs/plan/research/README.md` that classify files as authoritative, supporting evidence, review-only, or superseded.

### S3-3. `backlog.md` has an incomplete "Top Dependency Chain"

- Evidence: `docs/plan/backlog.md:39` - "| ADR-011 | CRM, external channel ACL..."
- Evidence: `docs/plan/backlog.md:42` - "| ADR-014 | Billing, usage metering..."
- Evidence: `docs/plan/backlog.md:72` - "## Top Dependency Chain"
- Evidence: `docs/plan/backlog.md:87` - "| 12 | ADR-012 Department workflow engine..."
- Fix: Complete the chain through ADR-015 and PRD-001..018, or rename it to "Initial Dependency Chain" and state it is intentionally partial.

### S3-4. `docs/ux-law/` is a useful repo-local reference library but is invisible from the agent control docs

- Evidence: `docs/ux-law/README.md:3` - "A curated, distilled set of **20 frontend-actionable UX references**"
- Evidence: `docs/ux-law/README.md:18` - "## How to use this"
- Evidence: `CLAUDE.md:8` - "## Doc map"
- Evidence: `docs/plan/EXECUTION.md:40` - "## Reference Map"
- Fix: Add `docs/ux-law/` to `CLAUDE.md` and `EXECUTION.md` as optional frontend/UX supporting docs, especially for PRD-017 and frontend work.

## S4 - cosmetic / cleanliness

### S4-1. `EXECUTION.md` Current State lacks the exact PR number and commit from ground truth

- Evidence: `docs/plan/EXECUTION.md:33` - "branch `slice/1-admin-tasks-mvp` (PR open to `development`)"
- Fix: Add "PR #121" and commit `50de556` to the Current State row or latest worklog entry.

### S4-2. `grilling-decisions.md` contains duplicated/stale "Next" bullets

- Evidence: `docs/plan/grilling-decisions.md:364` - "## Next - Q13 (the original goal)"
- Evidence: `docs/plan/grilling-decisions.md:365` - "Q13 - Capability-parity map..."
- Evidence: `docs/plan/grilling-decisions.md:367` - "- Q11 - Marketing + Finance + Support department workflows"
- Evidence: `docs/plan/grilling-decisions.md:369` - "- **Q13 - Capability-parity map + priority-ordered ADR/PRD backlog..."
- Fix: Remove the stale queue entirely or replace it with a short "Historical sequence complete" note.

### S4-3. `q15-mvp-roadmap.mmx.md` is fenced as a whole file instead of normal Markdown

- Evidence: `docs/plan/consensus/q15-mvp-roadmap.mmx.md:1` - "```"
- Evidence: `docs/plan/consensus/q15-mvp-roadmap.mmx.md:2` - "WALKING-SKELETON MVP"
- Evidence: `docs/plan/consensus/q15-mvp-roadmap.mmx.md:26` - "```"
- Fix: Remove the outer fence and add a proper heading/status note, so headings, links, and path checks work normally.

### S4-4. Raw research memo still shows the superseded TypeScript 6.0.3 pin before the later override

- Evidence: `docs/plan/research/slice1-foundation-stack.md:13` - "| TypeScript | `6.0.3` |"
- Evidence: `docs/plan/research/slice1-foundation-stack.md:194` - "Where noted, these override the raw pins above."
- Evidence: `docs/plan/research/slice1-foundation-stack.md:198` - "TypeScript: pin `5.9.x`, NOT `6.0.3`."
- Fix: Add "superseded below" directly in the version table row, or split raw research from final locked pins.

## Prioritized fix list

1. Reconcile execution order: decide whether Marketing+CRM is next or whether Slice 2/P1-P3 remain first, then update `EXECUTION.md`, `roadmap.md`, and seeded Tasks.
2. Add superseded/current banners to `roadmap.md`, `q13-backlog.mmx.md`, and `q15-mvp-roadmap.mmx.md`.
3. Update `grilling-decisions.md` for Q15 coverage, Drizzle selection, and removal of the stale "Next Q13" section.
4. Rewrite ADR-014 and PRD-014 so current billing is a null adapter/local entitlement and Stripe is future retained design only.
5. Update `official-docs.md` with locked versions and missing foundation-tool rows.
6. Fix broken textual path refs in q8/q9/q11 consensus docs, expanding shorthand vendored refs into concrete repo paths.
7. Add doc-map entries or indexes for `backlog.md`, consensus, research, and `docs/ux-law/`.
8. Add PR #121 and commit `50de556` to the latest execution state/worklog.
