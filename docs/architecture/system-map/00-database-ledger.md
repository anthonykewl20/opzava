# 00 — Database Ledger

> The single SQLite database is the spine of the whole system. Both engines persist here.
> This ledger is the authoritative table inventory; every other zone doc references it.
>
> **✅ Second-pass verified:** every table / column / migration claim below was re-checked against source
> (`schema.sql`, `migrations.ts`, the opzava repos). 51 inherited migrations (ids 001–053, 030/031 absent),
> `035` drops+recreates `api_keys`, and all six opzava module-table column sets confirmed. Corrections logged
> in [`99-verification-register.md`](./99-verification-register.md).

**Engine & connection** ✅ (`src/lib/db.ts:23-59`)
- One `better-sqlite3` handle, opened lazily by `getDatabase()` (singleton; self-initializes on
  module import outside `next build` — `db.ts:602`).
- File: `config.dbPath` = `MISSION_CONTROL_DB_PATH` or `<MISSION_CONTROL_DATA_DIR>/mission-control.db`
  (default `.data/mission-control.db`).
- Pragmas: `journal_mode=WAL`, `synchronous=NORMAL`, `cache_size=1000`, `foreign_keys=ON`,
  `busy_timeout=5000` (5 s retry against `SQLITE_BUSY` under concurrent route handlers).
- On open, `initializeSchema()` runs: `registerOpzavaRunnerMigrations()` → `runMigrations(db)` →
  `seedAdminUserFromEnv(db)` → (once) webhook listener + scheduler (skipped in build / test mode).

**Migration mechanism** ✅ (`src/lib/migrations.ts`)
- A `schema_migrations(id TEXT PK, applied_at INTEGER)` table records applied ids.
- `runMigrations(db)` iterates `[...migrations, ...extraMigrations]`; each unapplied migration runs
  inside a `db.transaction()` calling `migration.up(db)` then recording its id. Applied at-most-once.
- `001_init` executes `src/lib/schema.sql` statement-by-statement. Later migrations are mostly
  additive `ALTER TABLE … ADD COLUMN` guarded by `PRAGMA table_info` existence checks (idempotent).
- Plugins inject via `registerMigrations()`; the opzava runner registers 3 migrations this way
  (`registerOpzavaRunnerMigrations()`, called from `db.ts:69`).
- **51 inherited migrations**, ids `001`–`053` with exactly **two genuine gaps: `030` and `031`
  are absent** ✅ (verified by extracting all ids). `035_api_keys_v2` explicitly **drops & recreates**
  `api_keys` because "previous migrations (027/030) may have created an api_keys table with a
  different schema" ✅ (`migrations.ts:1048-1082`). → **Parity risk:** a fresh install vs. an
  upgraded fork can have divergent `api_keys` history. (Register Q5 resolved: gaps are real.)
- **opzava module/platform tables are NOT in the migration ladder.** They are created lazily via
  `CREATE TABLE IF NOT EXISTS` inside their repositories' `ensureSchema()` (memoized), invoked on
  first use by routes. Only the 5 *runner* tables go through the migration registry.

---

## Complete table inventory (59 tables) ✅

Grouped by owner. "Created by" tells you where the DDL lives — this is the difference between a
migration-managed table and a lazily-provisioned one.

### Engine A — inherited base (48 tables, `src/lib`)

| domain | tables | created by |
|--------|--------|-----------|
| Auth / identity | `users`, `user_sessions`, `api_keys`, `agent_api_keys`, `access_requests`, `audit_log`, `security_events`, `agent_trust_scores` | migrations 005/035/040/014/007/037 |
| Tenancy | `tenants`, `workspaces`, `provision_jobs`, `provision_events`, `adapter_configs` | migrations 012/021/032 |
| Agents | `agents`, `direct_connections`, `spawn_history`, `mcp_call_log` | schema.sql + 016/044/037 |
| Tasks / projects | `tasks`, `comments`, `task_subscriptions`, `quality_reviews`, `standup_reports`, `projects`, `project_agent_assignments` | schema.sql + 024/027 |
| Collaboration / feed | `activities`, `notifications`, `messages` | schema.sql + 004 |
| Workflows / pipelines | `workflow_templates`, `workflow_pipelines`, `pipeline_runs` | migrations 006/009 |
| Runs / evals | `runs`, `eval_runs`, `eval_golden_sets`, `eval_traces` | migrations 046/038 |
| Integrations / ops | `webhooks`, `webhook_deliveries`, `github_syncs`, `gateway_health_logs`, `alert_rules`, `settings`, `token_usage`, `claude_sessions`, `skills`, `realtime_events` | migrations 008/017/041/011/010/018/020/033/053 |
| Memory (FTS) | `memory_fts` (FTS5 virtual), `memory_fts_meta` | migration 048 |
| Meta | `schema_migrations` | migrations runner |
| **Lazy (NOT in migrations)** | `gateways` | ⚠️ created by API routes on demand: `api/gateways/route.ts:24`, `health/route.ts:7`, `connect/route.ts:104` |

> ⚠️ `gateways` being created by 3 separate routes (not a migration) means migration `013`'s
> `tenant_owner_gateway` backfill can run before the table exists, falling back to a default. ✅

### Engine B — opzava (11 tables, `src/opzava`)

| group | table | created by | status |
|-------|-------|-----------|--------|
| Runner | `opzava_runner_jobs` | `runner/migrations.ts:33` (migration `opzava_runner_001`) | ✅ |
| Runner | `opzava_runner_attempts` | `runner/migrations.ts:52` | ✅ |
| Runner | `opzava_runner_dead_letters` | `runner/migrations.ts:64` | ✅ |
| Runner | `opzava_runner_operational_events` | `runner/migrations.ts:76` | ✅ |
| Runner | `opzava_runner_external_call_reservations` | `runner/migrations.ts:91` (migration `opzava_runner_003`) | ✅ |
| Core | `opzava_approvals` | `core/approvals/approval-repository.ts` (lazy `ensureSchema`) | ✅ |
| Content | `opzava_content_artifacts` | `modules/content/artifacts/artifact-repository.ts` (lazy) | ✅ |
| Content | `opzava_campaigns` | `modules/content/campaign/campaign-repository.ts` (lazy) | ✅ |
| Team | `opzava_agent_roles` | `modules/team/agent-role-repository.ts` (lazy) | ✅ |
| Admin | `opzava_admin_settings` | `platform/admin-config/repository.ts` (lazy) | ✅ |
| Admin | `opzava_admin_settings_audit_events` | `platform/admin-config/repository.ts` (lazy) | ✅ |

---

## opzava runner tables — full column detail ✅

All verified directly against `src/opzava/platform/runner/migrations.ts`.

**`opzava_runner_jobs`** — the durable job queue.
```
job_id TEXT PRIMARY KEY · workflow_run_id TEXT NOT NULL · step_run_id TEXT ·
status TEXT NOT NULL · priority INTEGER NOT NULL ·
idempotency_key TEXT NOT NULL UNIQUE   ← producer-side dedup key
scheduled_at TEXT NOT NULL · lease_expires_at TEXT · record_json TEXT NOT NULL ·
created_at TEXT NOT NULL · updated_at TEXT NOT NULL
INDEX status · (status,scheduled_at,priority) lease-order · (workflow_run_id,step_run_id) ·
      (status,lease_expires_at)
```
Note: `priority` is added by migration `opzava_runner_002` via guarded `ALTER TABLE` for
forward-compat with pre-priority DBs (`migrations.ts:99-106`). ✅

**`opzava_runner_attempts`** — one row per execution try.
```
attempt_id TEXT PRIMARY KEY · job_id TEXT NOT NULL · attempt_number INTEGER NOT NULL ·
status TEXT NOT NULL · stored_at TEXT NOT NULL · record_json TEXT NOT NULL ·
UNIQUE(job_id, attempt_number)        ← double-lease guard
INDEX (job_id, attempt_number)
```

**`opzava_runner_dead_letters`** — exhausted jobs with replay snapshot.
```
dead_letter_id TEXT PRIMARY KEY · job_id TEXT NOT NULL · workflow_run_id TEXT NOT NULL ·
step_run_id TEXT · replay_eligible INTEGER NOT NULL · stored_at TEXT NOT NULL ·
record_json TEXT NOT NULL
INDEX (workflow_run_id, step_run_id, replay_eligible, stored_at)
```

**`opzava_runner_operational_events`** — the unified event log: `external-call` · `cost` · `audit`.
```
record_id TEXT PRIMARY KEY · kind TEXT NOT NULL · workflow_run_id TEXT NOT NULL ·
step_run_id TEXT · occurred_at TEXT NOT NULL · record_json TEXT NOT NULL
INDEX (workflow_run_id, occurred_at, record_id)
```
This one table backs `/api/ops/runs`, `/api/ops/costs`, and provider audit/idempotency. The
external-call record nests at `$.event` of `record_json`; idempotency lookup uses
`json_extract(record_json,'$.event.idempotencyKey')` with **no functional index** (full scan
filtered by `kind`) — a scaling risk. ✅

**`opzava_runner_external_call_reservations`** — atomic exactly-once lock for live provider calls.
```
idempotency_key TEXT PRIMARY KEY NOT NULL · external_call_id TEXT NOT NULL · reserved_at TEXT NOT NULL
```
DDL lives in the runner; the table is read/written by `platform/providers/external-call-reservation.ts`.
✅ **Wired (2026-06-22):** the guarded campaign send path (`guarded-campaign-send-runtime.ts`) injects
`createExternalCallReservation` into the guard, so each live send now reserves-before-execute — atomic
exactly-once for concurrent callers, beyond the runner's job lease.

---

## opzava module tables — columns (✅ verified second pass — all six column sets confirmed against the repos)

| table | columns (canonical record always in `record_json`) | indexes |
|-------|------|---------|
| `opzava_approvals` | `approval_id` PK · `status` · `requested_action` · `requester_id` · `record_json` · `requested_at` · `decided_at` | status, requested_at |
| `opzava_content_artifacts` | `artifact_id` PK · `artifact_type` · `source_step_run_id` · `workflow_run_id` · `validation_status` · `record_json` · `created_at` | artifact_type, workflow_run_id, created_at |
| `opzava_campaigns` | `campaign_id` PK · `name` · `status` · `start_at` · `record_json` · `created_at` · `updated_at` | status, created_at |
| `opzava_agent_roles` | `agent_id` PK · `name` · `department` · `status` · `record_json` | department, status |
| `opzava_admin_settings` | `settings_id` PK (`'singleton'`) · `version` · `updated_at` · `updated_by` · `record_json` | — |
| `opzava_admin_settings_audit_events` | `audit_event_id` PK · `occurred_at` · `record_json` | occurred_at |

Common pattern (✅): each opzava table denormalizes a few filter/sort columns out of an
authoritative `record_json` blob; every read re-parses the JSON through the Zod contract, so a
corrupt row throws on read rather than silently returning bad data. Writes are UPSERT
(`ON CONFLICT(<pk>) DO UPDATE`).

---

## Key inherited tables — columns (✅ verified second pass; migration-gap and column claims confirmed)

These are the highest-traffic inherited tables. Full per-column detail for the long tail
(`runs`, `eval_*`, `provision_*`, etc.) lives in [`50-inherited-agent-task.md`](./50-inherited-agent-task.md).

**`tasks`** ✅ base shape (`schema.sql:5-20`) — extended heavily by migrations 024/026/028/036/045:
```
id INTEGER PK AUTOINC · title · description · status DEFAULT 'inbox' · priority DEFAULT 'medium' ·
assigned_to · created_by · created_at · updated_at · due_date · estimated_hours · actual_hours ·
tags(JSON) · metadata(JSON)
+ migrations: outcome, error_message, resolution, feedback_rating, retry_count, completed_at (026);
  github_issue_number/repo/synced_at/branch/pr_number/pr_state (028); project_id, project_ticket_no
  (024); dispatch_attempts (045); workspace_id (021)
```
Status vocabulary (runtime, `db.ts:206`): `backlog | inbox | assigned | awaiting_owner |
in_progress | review | quality_review | done | failed`. ✅

**`agents`** ✅ base shape (`schema.sql:23-35`): `id` PK · `name` UNIQUE · `role` · `session_key`
UNIQUE · `soul_content` · `status DEFAULT 'offline'` · `last_seen` · `last_activity` · `config`
(JSON). Runtime status enum: `offline | idle | busy | error`. Migrations add `source`,
`content_hash`, `workspace_path`, `hidden`, `working_memory`, `runtime_type`. ✅

> **Two agent models.** This inherited `agents` table (int PK, `offline/idle/busy/error`,
> OpenClaw/runtime-coupled) is a *different* table from opzava `opzava_agent_roles` (string slug
> PK, `active/planned/paused`, owns workflow step ids). Nothing joins them. Top parity finding —
> see [`90-parity-findings.md`](./90-parity-findings.md).

**Workspace scoping invariant** ✅: migrations 021/022/023 add `workspace_id` (default 1) to ~19
tables; the default workspace row `id=1` always exists. Sessions/api-keys also carry `tenant_id`.
**All opzava tables are single-workspace** (no tenant column) — a tenant-isolation gap to audit.

**`realtime_events`** ✅ (`migrations.ts`, migration `053_realtime_events`): durable SSE replay log with
`id INTEGER PRIMARY KEY AUTOINCREMENT`, `type`, JSON `data`, `timestamp`, nullable `workspace_id`, and indexes
on `(id)`, `(workspace_id, id)`, and `timestamp`. `/api/events` and `/api/v1/runs/stream` replay rows by
`Last-Event-ID` and workspace.

**Secrets-in-DB invariant** ✅: session tokens and API keys are stored only as **SHA-256 hashes**
(migration `043` hashed legacy plaintext). A row written to `settings` under `security.api_key`
**overrides** the env `API_KEY` for global admin auth (read at `auth.ts:571`; `resolveActiveApiKey()` head is `:567`) — a DB-write path controls
auth.

---

## What to verify next (upgrades for this doc)

- [x] Re-read each opzava module repository to upgrade the module-table columns — **done (2nd pass)**; all six column sets ✅.
- [ ] Spot-verify 3-4 inherited table column sets against their migration bodies.
- [ ] Confirm the `gateways` lazy-creation columns are consistent across the 3 route definitions.
