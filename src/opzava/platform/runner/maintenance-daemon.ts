import type Database from 'better-sqlite3'
import { createRunnerRepository } from './repository'
import { pruneRunnerData, type RunnerRetentionReport } from './retention'

/**
 * Background maintenance for the durable runner (F5). The runner's crash recovery
 * (`executeExpiredLeaseRecovery`) and retention (`pruneRunnerData`) otherwise only run when an admin
 * hits the maintenance route — nothing drives them on a timer, so an expired lease (process crash
 * mid-attempt) stays stuck and old rows accumulate. This daemon runs both on an interval, beside the
 * inherited scheduler (ARD 0007: the two timers coexist; engines are not merged).
 *
 * Job *execution* (draining the queue) is intentionally out of scope here — that needs per-kind
 * executor deps (and, for sends, resolved secrets); see F1b.
 */
export type RunnerMaintenanceDeps = Readonly<{
  db: Database.Database
  now: () => Date
  newId: () => string
  workerId: string
  retentionMs: number
}>

export type RunnerMaintenanceReport = Readonly<{
  requeued: number
  deadLettered: number
  retention: RunnerRetentionReport
}>

export function runRunnerMaintenanceOnce(deps: RunnerMaintenanceDeps): RunnerMaintenanceReport {
  const repository = createRunnerRepository(deps.db)
  const nowDate = deps.now()
  const nowIso = nowDate.toISOString()

  // Recover any lease that has already expired (process crashed before the attempt finished).
  const recovery = repository.executeExpiredLeaseRecovery({
    recoveryPlanId: deps.newId(),
    generatedAt: nowIso,
    workerId: deps.workerId,
    expiredLeaseCutoff: nowIso,
  })

  const retention = pruneRunnerData(deps.db, {
    olderThan: new Date(nowDate.getTime() - deps.retentionMs).toISOString(),
  })

  return Object.freeze({
    requeued: recovery.jobsToRequeue.length,
    deadLettered: recovery.jobsToDeadLetter.length,
    retention,
  })
}

export type RunnerMaintenanceSleep = (ms: number, signal: AbortSignal) => Promise<void>

export type RunnerMaintenanceDaemonOptions = RunnerMaintenanceDeps & Readonly<{
  intervalMs: number
  signal: AbortSignal
  sleep: RunnerMaintenanceSleep
  onCycle?: (report: RunnerMaintenanceReport) => void
  onError?: (error: unknown) => void
}>

export type RunnerMaintenanceDaemon = Readonly<{
  run: (runOptions?: Readonly<{ maxCycles?: number }>) => Promise<Readonly<{ cycles: number; errors: number }>>
}>

export function createRunnerMaintenanceDaemon(options: RunnerMaintenanceDaemonOptions): RunnerMaintenanceDaemon {
  if (!Number.isInteger(options.intervalMs) || options.intervalMs <= 0) {
    throw new Error('intervalMs must be a positive integer')
  }

  async function run(runOptions: Readonly<{ maxCycles?: number }> = {}) {
    let cycles = 0
    let errors = 0
    while (!options.signal.aborted && (runOptions.maxCycles === undefined || cycles < runOptions.maxCycles)) {
      try {
        const report = runRunnerMaintenanceOnce(options)
        options.onCycle?.(report)
      } catch (error) {
        errors += 1
        options.onError?.(error)
      }
      cycles += 1
      if (options.signal.aborted) break
      await options.sleep(options.intervalMs, options.signal)
    }
    return Object.freeze({ cycles, errors })
  }

  return Object.freeze({ run })
}
