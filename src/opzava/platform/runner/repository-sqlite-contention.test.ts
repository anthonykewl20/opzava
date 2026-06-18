import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'

import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { parseJob, type Job } from './contracts'
import { parseJobStorageRecord } from './repository-contracts'
import { createRunnerRepository } from './repository'

describe('Opzava runner repository SQLite contention', () => {
  // The child lock deliberately outlives one busy timeout but exits before two.
  // That makes raw BEGIN IMMEDIATE fail while the repository lease can still
  // complete under the same real file-lock timing window.
  const childHoldMs = 300
  const parentBusyTimeoutMs = 200
  let db: Database.Database | null = null
  let tempDir: string | null = null
  let child: ChildProcessWithoutNullStreams | null = null

  afterEach(() => {
    if (child && child.exitCode === null) child.kill()
    child = null
    db?.close()
    db = null
    if (tempDir) rmSync(tempDir, { force: true, recursive: true })
    tempDir = null
  })

  it('confirms raw BEGIN IMMEDIATE fails when the external writer outlives busy_timeout', async () => {
    expect(childHoldMs).toBeGreaterThan(parentBusyTimeoutMs)
    tempDir = mkdtempSync(join(tmpdir(), 'opzava-runner-contention-'))
    const dbPath = join(tempDir, 'runner.sqlite')
    db = new Database(dbPath)
    expect(db.pragma('journal_mode = WAL', { simple: true })).toBe('wal')
    db.pragma(`busy_timeout = ${parentBusyTimeoutMs}`)
    db.exec('CREATE TABLE contention_probe (id INTEGER PRIMARY KEY)')

    child = holdImmediateWriteLock(dbPath, childHoldMs)
    await waitForOutput(child, 'locked')

    const started = performance.now()
    expect(() => db!.exec('BEGIN IMMEDIATE')).toThrow('database is locked')
    const elapsedMs = performance.now() - started

    expect(elapsedMs).toBeGreaterThanOrEqual(parentBusyTimeoutMs)
    await waitForExit(child)
  })

  it('leases after a real external writer releases during the bounded busy retry window', async () => {
    expect(childHoldMs).toBeGreaterThan(parentBusyTimeoutMs)
    expect(childHoldMs).toBeLessThan(parentBusyTimeoutMs * 2)
    tempDir = mkdtempSync(join(tmpdir(), 'opzava-runner-contention-'))
    const dbPath = join(tempDir, 'runner.sqlite')
    db = new Database(dbPath)
    expect(db.pragma('journal_mode = WAL', { simple: true })).toBe('wal')
    db.pragma(`busy_timeout = ${parentBusyTimeoutMs}`)
    const repo = createRunnerRepository(db)
    const job = baseJob()

    repo.saveJob(jobRecord(job))

    child = holdImmediateWriteLock(dbPath, childHoldMs)
    await waitForOutput(child, 'locked')

    const started = performance.now()
    const lease = repo.leaseNextJobForAttempt({
      workerId: 'worker:contention:parent',
      attemptId: 'attempt_contention_parent_001',
      leasedAt: '2026-06-15T00:01:00.000Z',
      leaseExpiresAt: '2026-06-15T00:06:00.000Z',
    })
    const elapsedMs = performance.now() - started

    expect(lease?.jobRecord.job.jobId).toBe(job.jobId)
    expect(lease?.jobRecord.job.status).toBe('leased')
    expect(lease?.attemptRecord.attempt.status).toBe('running')
    expect(repo.getJobById(job.jobId)?.job.status).toBe('leased')
    expect(elapsedMs).toBeGreaterThanOrEqual(parentBusyTimeoutMs)
    await waitForExit(child)
  })
})

function holdImmediateWriteLock(dbPath: string, holdMs: number): ChildProcessWithoutNullStreams {
  const script = `
    const Database = require('better-sqlite3');
    const db = new Database(process.argv[1]);
    db.pragma('busy_timeout = 1000');
    db.exec('BEGIN IMMEDIATE');
    process.stdout.write('locked\\n');
    setTimeout(() => {
      try { db.exec('ROLLBACK'); }
      finally {
        db.close();
        process.stdout.write('released\\n');
      }
    }, Number(process.argv[2]));
  `

  return spawn(process.execPath, ['-e', script, dbPath, String(holdMs)], {
    cwd: process.cwd(),
    env: process.env,
  })
}

function waitForOutput(child: ChildProcessWithoutNullStreams, expected: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for child output: ${expected}`)), 2000)
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8')
      if (output.includes(expected)) {
        clearTimeout(timer)
        resolve()
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8')
    })
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code) => {
      if (!output.includes(expected)) {
        clearTimeout(timer)
        reject(new Error(`Child exited with ${code} before output ${expected}: ${output}`))
      }
    })
  })
}

function waitForExit(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) return Promise.resolve()

  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Child exited with ${code}`))
    })
  })
}

function baseJob(): Job {
  return parseJob({
    schemaVersion: 1,
    jobId: 'job_contention_001',
    workflowRunId: 'run_contention_001',
    stepRunId: 'step_run_contention_001',
    status: 'queued',
    idempotencyKey: 'workflow:run_contention_001:step:contention:v1',
    payload: {
      inputArtifactIds: ['artifact_contention_001'],
    },
    priority: 50,
    scheduledAt: '2026-06-15T00:00:00.000Z',
    lease: null,
    attemptCount: 0,
    maxAttempts: 3,
  })
}

function jobRecord(job: Job) {
  return parseJobStorageRecord({
    schemaVersion: 1,
    recordId: `job_record_${job.jobId}`,
    storedAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:00.000Z',
    statusIndex: job.status,
    workflowRunId: job.workflowRunId,
    stepRunId: job.stepRunId,
    idempotencyKey: job.idempotencyKey,
    job,
  })
}
