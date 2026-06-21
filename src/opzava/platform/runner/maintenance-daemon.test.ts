import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { createRunnerRepository } from './repository'
import {
  runRunnerMaintenanceOnce,
  createRunnerMaintenanceDaemon,
} from './maintenance-daemon'

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  createRunnerRepository(db).ensureSchema()
  return db
}

const NOW = new Date('2026-07-05T00:00:00.000Z')

function deps(db: Database.Database) {
  let n = 0
  return {
    db,
    now: () => NOW,
    newId: () => `rp-${++n}`,
    workerId: 'maintenance-test',
    retentionMs: 1000,
  }
}

describe('runner maintenance', () => {
  it('runs recovery + retention and returns a combined report on an empty runner', () => {
    const db = makeDb()
    const report = runRunnerMaintenanceOnce(deps(db))
    expect(report.requeued).toBe(0)
    expect(report.deadLettered).toBe(0)
    expect(report.retention).toEqual({ operationalEvents: 0, deadLetters: 0, succeededJobs: 0 })
  })

  it('prunes operational events older than the retention window', () => {
    const db = makeDb()
    db.prepare(
      `INSERT INTO opzava_runner_operational_events (record_id, kind, workflow_run_id, occurred_at, record_json)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('ev-old', 'audit', 'wf-old', '2000-01-01T00:00:00.000Z', '{}')
    const report = runRunnerMaintenanceOnce(deps(db))
    expect(report.retention.operationalEvents).toBe(1)
  })

  it('loops maxCycles times, sleeping between cycles', async () => {
    const db = makeDb()
    const controller = new AbortController()
    const sleeps: number[] = []
    let cycles = 0
    const daemon = createRunnerMaintenanceDaemon({
      ...deps(db),
      intervalMs: 60_000,
      signal: controller.signal,
      sleep: async (ms) => { sleeps.push(ms) },
      onCycle: () => { cycles += 1 },
    })
    const result = await daemon.run({ maxCycles: 3 })
    expect(result.cycles).toBe(3)
    expect(result.errors).toBe(0)
    expect(cycles).toBe(3)
    expect(sleeps).toEqual([60_000, 60_000, 60_000])
  })

  it('does not run when the signal is already aborted', async () => {
    const db = makeDb()
    const controller = new AbortController()
    controller.abort()
    const daemon = createRunnerMaintenanceDaemon({
      ...deps(db),
      intervalMs: 60_000,
      signal: controller.signal,
      sleep: async () => {},
    })
    const result = await daemon.run()
    expect(result.cycles).toBe(0)
  })

  it('counts errors and keeps looping when a cycle throws', async () => {
    const db = makeDb()
    db.close() // force runRunnerMaintenanceOnce to throw
    const controller = new AbortController()
    const daemon = createRunnerMaintenanceDaemon({
      ...deps(db),
      intervalMs: 1,
      signal: controller.signal,
      sleep: async () => {},
    })
    const result = await daemon.run({ maxCycles: 2 })
    expect(result.errors).toBe(2)
  })

  it('rejects a non-positive interval', () => {
    const db = makeDb()
    expect(() =>
      createRunnerMaintenanceDaemon({ ...deps(db), intervalMs: 0, signal: new AbortController().signal, sleep: async () => {} }),
    ).toThrow(/positive integer/)
  })
})
