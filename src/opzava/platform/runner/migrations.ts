import type Database from 'better-sqlite3'

import { registerMigrations, type Migration } from '@/lib/migrations'

let registered = false

export function registerOpzavaRunnerMigrations(): void {
  if (registered) return

  registerMigrations(getOpzavaRunnerMigrations())
  registered = true
}

export function getOpzavaRunnerMigrations(): Migration[] {
  return [
    {
      id: 'opzava_runner_001_repository',
      up: applyOpzavaRunnerRepositorySchema,
    },
    {
      id: 'opzava_runner_002_job_priority_index',
      up: applyOpzavaRunnerJobPrioritySchema,
    },
    {
      id: 'opzava_runner_003_external_call_reservations',
      up: applyOpzavaExternalCallReservationSchema,
    },
  ]
}

export function applyOpzavaRunnerRepositorySchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS opzava_runner_jobs (
      job_id TEXT PRIMARY KEY,
      workflow_run_id TEXT NOT NULL,
      step_run_id TEXT,
      status TEXT NOT NULL,
      priority INTEGER NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      scheduled_at TEXT NOT NULL,
      lease_expires_at TEXT,
      record_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_opzava_runner_jobs_status ON opzava_runner_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_opzava_runner_jobs_lease_order ON opzava_runner_jobs(status, scheduled_at, priority);
    CREATE INDEX IF NOT EXISTS idx_opzava_runner_jobs_workflow ON opzava_runner_jobs(workflow_run_id, step_run_id);
    CREATE INDEX IF NOT EXISTS idx_opzava_runner_jobs_lease ON opzava_runner_jobs(status, lease_expires_at);

    CREATE TABLE IF NOT EXISTS opzava_runner_attempts (
      attempt_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      status TEXT NOT NULL,
      stored_at TEXT NOT NULL,
      record_json TEXT NOT NULL,
      UNIQUE(job_id, attempt_number)
    );

    CREATE INDEX IF NOT EXISTS idx_opzava_runner_attempts_job ON opzava_runner_attempts(job_id, attempt_number);

    CREATE TABLE IF NOT EXISTS opzava_runner_dead_letters (
      dead_letter_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      workflow_run_id TEXT NOT NULL,
      step_run_id TEXT,
      replay_eligible INTEGER NOT NULL,
      stored_at TEXT NOT NULL,
      record_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_opzava_runner_dead_letters_replay ON opzava_runner_dead_letters(workflow_run_id, step_run_id, replay_eligible, stored_at);

    CREATE TABLE IF NOT EXISTS opzava_runner_operational_events (
      record_id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      workflow_run_id TEXT NOT NULL,
      step_run_id TEXT,
      occurred_at TEXT NOT NULL,
      record_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_opzava_runner_operational_events_workflow ON opzava_runner_operational_events(workflow_run_id, occurred_at, record_id);
  `)
}

export function applyOpzavaExternalCallReservationSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS opzava_runner_external_call_reservations (
      idempotency_key TEXT PRIMARY KEY NOT NULL,
      external_call_id TEXT NOT NULL,
      reserved_at TEXT NOT NULL
    );
  `)
}

export function applyOpzavaRunnerJobPrioritySchema(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(opzava_runner_jobs)').all() as Array<{ name: string }>
  if (!columns.some((column) => column.name === 'priority')) {
    db.exec('ALTER TABLE opzava_runner_jobs ADD COLUMN priority INTEGER NOT NULL DEFAULT 0')
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_opzava_runner_jobs_lease_order ON opzava_runner_jobs(status, scheduled_at, priority)')
}
