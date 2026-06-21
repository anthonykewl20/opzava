# Opzava SYSTEM-MAP — Source-of-Truth Ledger

> **Purpose.** One canonical, code-verified inventory of how *every* part of this system
> works — the baseline against which external repos are measured for architectural parity.
> This is not a tour or a tutorial. Each statement is meant to be *true against the source
> at the cited `file:line`*. If a fact here is wrong, treat it as a defect and fix it; do not
> work around it.

**Scope of the codebase:** ~143k lines. `src/lib` 37k (inherited base), `src/opzava` 28k
(new product code, 268 files), `src/components` 45k (44 panels), `src/app` 31k (165 API routes).

---

## How this ledger is built (accuracy contract)

This map was produced by a fan-out of 14 read-only zone agents, **then re-verified against
source**. Agent research is *not* treated as truth — it is a lead. Every load-bearing fact
(table columns, enum values, state transitions, "who calls what", live-vs-dormant) is
re-checked against the actual file before it is asserted here.

**Verification legend** — every non-trivial claim carries one of:

| Mark | Meaning |
|------|---------|
| ✅ | Verified directly against source in this pass (file/line read and confirmed) |
| 🔎 | From agent research, **not yet** re-verified — treat as probable, not certain |
| ⚠️ | Verification found the agent claim **wrong or misleading**; corrected here |
| ❓ | Open question — could not be confirmed; needs a decision or deeper read |

A claim is never written without a mark. When you verify a 🔎, upgrade it to ✅ and cite the line.
Corrections and open questions are tracked centrally in [`99-verification-register.md`](./99-verification-register.md).

---

## The one thing to understand first: there are TWO orchestration engines

Opzava is an open-source agent-orchestration base ("Mission Control" / "OpenClaw") that was
forked and then grown a second, independent product engine beside it under `src/opzava/`.
**They share one SQLite database and one Next.js process, but they do not share orchestration
code, status vocabularies, or agent models.** Understanding the map means understanding both
engines and where they touch.

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                          ONE Next.js 16 process · ONE SQLite DB                         │
│      .data/mission-control.db (better-sqlite3, WAL, foreign_keys=ON, busy_timeout=5s)   │  ✅ db.ts:28-52
├───────────────────────────────────┬────────────────────────────────────────────────────┤
│   ENGINE A — INHERITED TASK BOARD  │            ENGINE B — OPZAVA WORKFLOW ENGINE        │
│   (src/lib, "agents are operators")│            (src/opzava, "agents are workers")        │
│                                    │                                                      │
│   tasks table (Kanban, status      │   WorkflowRun → StepRun (typed, versioned graph)      │
│   strings)                         │   Artifact (schema-validated, lineage, no secrets)    │
│   60s scheduler tick drives:       │   Durable runner: Job → Attempt → lease → DeadLetter  │
│     autoRoute → dispatch →         │   Approval gate (human) before any external action    │
│     reconcile → Aegis review       │   ProviderAdapter (mock|live) exactly-once + approval │
│   agents table (offline/idle/      │   opzava_agent_roles (active/planned/paused, owns     │
│     busy/error)                    │     workflow step ids)                                │
│                                    │   operational events: external-call · cost · audit    │
│                                    │                                                      │
│   ⚠️ The two engines are LARGELY NOT INTEGRATED. Two agent models, two task models,    │
│   two cost surfaces, two audit systems. This is the #1 architectural-parity finding.   │
│   See 90-parity-findings.md.                                                            │
└───────────────────────────────────┴────────────────────────────────────────────────────┘
                                     │
        Shared substrate ───────────┼───────────────────────────────────────────
        · Auth: requireRole(viewer<operator<admin) — proxy hdr → session cookie → API key  ✅ auth.ts
        · Single SPA shell ([[...panel]]) + Zustand store + SSE(/api/events) + gateway WS
        · settings table = the bridge: inherited /api/settings writes provider secret refs,
          opzava connection resolvers read them                                            🔎
```

---

## Master end-to-end flow — ENGINE B (the opzava product path)

This is the path the new product code runs. It is the request the user cares most about:
"a content idea becomes a human-approved WordPress draft, durably and auditable."

```
 HTTP (admin)  POST /api/ops/runs                                                    ✅ route exists
      │        requireRole('admin') → mutationLimiter → Zod parse(body)
      ▼
 ┌─ runAndRecordContentWorkflow(deps, idea) ─ modules/content/workflow ──────────────────────┐
 │                                                                                            │
 │  idea-intake ─manual─► keyword-research ─PROVIDER─► source-capture ─PROVIDER─►             │
 │       seo-brief ─transform─► outline ─transform─► article-draft ─PROVIDER─►                │
 │            fact-check ─PROVIDER─► brand-review ─► anti-slop-review ─►                       │
 │                 human-approval  ◄── HARD GATE: isApprovalGranted()==='approved'            │
 │                      │  not granted → THROW "external action refused"  (run halts)         │
 │                      ▼ granted                                                             │
 │                 wordpress-draft  (status literal 'draft' — publishing structurally impossible)│
 │                                                                                            │
 │  each step emits a schema-validated Artifact (lineage + no-secret scan) → upsert           │
 │  opzava_content_artifacts                                                                  │
 └────────────────────────────────────────────────────────────────────────────────────────────┘
      │   each PROVIDER step (durable variant) runs through the provider-execution layer:
      ▼
 ┌─ ProviderAdapter.execute(request, signal) ─ platform/providers ───────────────────────────┐
 │   preflight (runtime settings + secret resolution)                                         │
 │     → approval guard (live only: granted, target match, unexpired)                         │
 │       → reserve-before-execute (idempotency_key PK, atomic)                                 │
 │         → execute under timeout/abort race                                                  │
 │           → record ExternalCallRecord  +  CostEvent  +  AuditEvent                          │
 │              as operational events → opzava_runner_operational_events                       │
 │   ⚠️ today the wired content route uses MOCK adapters only; the live guard exists but the   │
 │      one live path (campaign Resend send) BYPASSES it. See 90-parity-findings.md.          │
 └────────────────────────────────────────────────────────────────────────────────────────────┘
      │   durable execution (when steps run as runner jobs / for campaign sends):
      ▼
 ┌─ Durable Runner ─ platform/runner ────────────────────────────────────────────────────────┐
 │   saveJob(queued) → leaseNextJobForAttempt (BEGIN IMMEDIATE, status queued→leased,          │
 │     attemptCount++) → worker.runNext executes with timeout                                  │
 │       success → recordAttemptSuccess (job→succeeded)                                         │
 │       fail + attempts left → recordAttemptFailure (job→queued, exp-backoff scheduledAt)      │
 │       fail + exhausted → recordAttemptFailure (job→dead-lettered, replayable snapshot)       │
 │   crash recovery: executeExpiredLeaseRecovery (lease_expires_at passed → requeue|dead-letter)│
 │   tables: opzava_runner_jobs · _attempts · _dead_letters · _operational_events ·            │
 │           _external_call_reservations   (all ✅ verified — runner/migrations.ts)             │
 └────────────────────────────────────────────────────────────────────────────────────────────┘
      │   read models surface back over HTTP:
      ▼
   GET /api/ops/runs · /api/ops/artifacts · /api/ops/approvals · /api/ops/costs ·
   /api/ops/dead-letters · POST /api/ops/maintenance/prune
      │   rendered by thin React panels:
      ▼
   content-runs · artifacts · approval-queue · ops-costs · ops-failures · maintenance · team-dashboard · campaigns
```

---

## Master end-to-end flow — ENGINE A (the inherited task board)

This is the upstream engine. It still runs and is wired to the scheduler. (🔎 from agent
research; the task-board state machine is re-verified in [`50-inherited-agent-task.md`](./50-inherited-agent-task.md).)

```
 create task (HTTP / coordinator / recurring spawner)
      ▼
   backlog / inbox ──autoRouteInboxTasks() (score agents, cap 3 in_progress)──► assigned
      │ dispatchAssignedTasks(): atomic claim UPDATE...WHERE status='assigned'
      ▼
   in_progress ── direct-API (sync text) ─────────────────► review
      │       └─ gateway/targeted (async, async_state=pending)
      │             │ reconcileDeferredTaskCompletions() (agent.wait(runId))
      │             ▼
      │           review
      ▼
   review ── runAegisReviews() flips to quality_review, invokes Aegis reviewer ──┐
      │        approved → done                                                    │
      │        rejected → assigned (+feedback comment); ≥3 rejects → failed       │
      └────────────────────────────────────────────────────────────────────────► (retry)
   driver: scheduler.ts 60s tick → task_dispatch job chains the above   🔎
```

---

## Document index

Read in this order. Status reflects how much of each doc is ✅-verified vs 🔎-research.

| # | Document | Covers | Verification depth |
|---|----------|--------|--------|
| 00 | [`00-database-ledger.md`](./00-database-ledger.md) | Every SQLite table: inherited schema + migrations + opzava tables | inventory + runner ✅; module cols 🔎 |
| 10 | [`10-durable-runner.md`](./10-durable-runner.md) | Jobs/attempts/leases/dead-letters/recovery/retention | ✅✅ deep (8 adversarial re-checks) |
| 11 | [`11-core-contracts.md`](./11-core-contracts.md) | Workflow/StepRun/Artifact/Approval contracts + state machines | ✅✅ deep |
| 12 | [`12-providers-infra.md`](./12-providers-infra.md) | Provider contract, approval guard, exactly-once, secrets | ✅✅ deep (F1 triple-checked) |
| 13 | [`13-admin-config-audit-costs.md`](./13-admin-config-audit-costs.md) | Admin settings, secret references, audit, costs | F4/F6 ✅✅; detail 🔎 |
| 20 | [`20-content-module.md`](./20-content-module.md) | Content contracts/artifacts/steps/workflow/providers/campaign | F1/F3 ✅✅; pipeline 🔎 |
| 21 | [`21-team-social-va-modules.md`](./21-team-social-va-modules.md) | team / social / general-va modules | F2 ✅✅; detail 🔎 |
| 50 | [`50-inherited-agent-task.md`](./50-inherited-agent-task.md) | Inherited agent/task/memory/cron/tokens + backbone | scheduler ✅; F2/F7 ✅✅; rest 🔎 |
| 51 | [`51-inherited-integrations.md`](./51-inherited-integrations.md) | Gateway, CLI bridges, GitHub sync, realtime, webhooks | webhook/poller ✅; rest 🔎 |
| 60 | [`60-api-layer.md`](./60-api-layer.md) | 165 API routes; deep on opzava-native surfaces | 🔎 |
| 61 | [`61-frontend.md`](./61-frontend.md) | SPA shell, Zustand store, 44 panels | 🔎 |
| 62 | [`62-tooling-build-governance.md`](./62-tooling-build-governance.md) | mc CLI/MCP/TUI, Docker/standalone, governance gates | F8 ✅✅; entropy-guard ✅; rest 🔎 |
| 90 | [`90-parity-findings.md`](./90-parity-findings.md) | Cross-cutting risks & the two-engine divergence (for the audit) | 8 findings, all ✅✅ |
| 99 | [`99-verification-register.md`](./99-verification-register.md) | Corrected agent claims + open questions | living |

> **Current state:** the full map is written — all 15 documents, ~2,100 lines. The opzava namespace
> (the new product code) is mapped at ✅✅ deep fidelity; the 8 cross-cutting parity findings are all
> double-verified (two independent passes), three of them triple-verified with a deterministic grep.
> Inherited-layer detail and the API/UI docs are pass-1 research (🔎) with their highest-stakes claims
> double-verified. **Remaining work** to reach all-✅: a second pass on the 🔎 inherited-layer and
> module-detail claims, and consuming the Understand-Anything Tree-sitter graph (once generated) as a
> fourth deterministic corroboration source.
