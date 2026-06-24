FINALIZED: docs/ard/0011-single-orchestrator-execution-model.md (105 lines, Status: Accepted, Date: 2026-06-24).

WHAT THE DOC DECIDES (honors the FINAL resolved decisions, no re-litigation):
- Make src/opzava/platform/runner the canonical execution path for all 3 engines (generalize createJobKindExecutor at job-kind-executor.ts:9 to register task-dispatch + content-step alongside CAMPAIGN_SEND_JOB_KIND); task-dispatch.ts enqueues instead of executing inline; task_id FK (opzava_runner_004) + read-only stuck-task detector.
- Single-active-writer via leader-lock seam NOW (exactly one replica tick runs the dispatch chain); Postgres (ARD 0006) tracked as future state, NOT P0. Lock-TTL < lease-TTL invariant (lock 90s / lease 10min).
- Lease as the sole reclamation authority: add claimed_at, reclaim in_progress AND quality_review past lease at all THREE claim sites, decoupled from the flaky agents.status heartbeat.
- Require explicit workspaceId everywhere; reframe CLAUDE.md/deployment.md horizontal-scale claims honestly.

CODE-WINS CORRECTION vs. the master-plan's resolved-decisions text: the master plan says "remove workspaceId ?? 1 in runAegisReviews (task-dispatch.ts:399)" but the verified code shows the ?? 1 default lives in reconcileDeferredTaskCompletions (:399), and runAegisReviews (:980) takes NO workspaceId param at all — its SELECT (:983-992) has no WHERE t.workspace_id filter and scans ALL workspaces. The ARD states the code-accurate reality: both runAegisReviews AND requeueStaleTasks lack a workspace filter.

EVERY FILE:LINE CITED IS VERIFIED AGAINST THE ACTUAL CODE:
- Three-engines-no-linkage finding: scheduler.ts:57-67 (runTaskDispatchChain), :163/:172/:190 (handler line numbers), :20 (TICK_MS), :498 (setInterval); task-dispatch.ts:980 (runAegisReviews, no workspaceId), :1005 (Aegis claim), :983-992 (unscoped SELECT), :1160-1175 (requeueStaleTasks), :1171 (in_progress-only WHERE — quality_review dead-zone), :1191-1195 (heartbeat gating), :1251/:1288 (dispatchAssignedTasks claim, guarded but lease-less); job-kind-executor.ts:9 (createJobKindExecutor, only CAMPAIGN_SEND registered); runner/MODULE.md (campaign-send-only wiring); runner/maintenance-daemon.ts:9-12 ("engines are not merged").
- Horizontal-scale contradiction: CLAUDE.md (ENFORCE horizontal scalability), deployment.md:625 (SQLite single-writer, verbatim), task-dispatch.ts:399 (workspaceId ?? 1), :1077/:1198/:1542 (dispatch_attempts TOCTOU); tasks/queue/route.ts:117-129 (third polling-queue claim site, lease-less).
- Cost-attribution gap: task-dispatch.ts:614-638 (recordUsage), :633 (cost hardcoded 0), :637 (error-swallowing catch); tokens/route.ts:119 (record.cost ?? fallback — 0 is not nullish so short-circuits); unified-cost-reader.ts (sums a never-populated cost_usd).

STANDARD ARD FORMAT MET: Status (Accepted), Date (2026-06-24), Context (3 findings grounded), Decision (4 numbered points + Sequencing), Rationale (5 points), Consequences (Positive/Negative/Neutral), Alternatives considered (Postgres-now / merge-tables / status-quo / external-coordinator — all with why-rejected), References (ARD 0006/0007/0010, master plan, key file:line).

The ARD also names the post-provider completion-write guard (WHERE id=? AND status='in_progress' AND claimed_at=?) and the runner-maintenance-daemon leader-gating open question surfaced by the grill — both load-bearing risks an implementing engineer must handle, captured so the doc is not aspirational.
