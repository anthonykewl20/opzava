import Database from 'better-sqlite3'
import { applyOpzavaRunnerRepositorySchema } from './migrations'

export type RunnerRetentionInput = Readonly<{ olderThan: string }>

export type RunnerRetentionReport = Readonly<{
  operationalEvents: number
  deadLetters: number
  succeededJobs: number
}>

export function pruneRunnerData(
  db: Database.Database,
  input: RunnerRetentionInput
): RunnerRetentionReport {
  if (!input.olderThan) {
    throw new Error('pruneRunnerData requires an olderThan cutoff')
  }

  applyOpzavaRunnerRepositorySchema(db)

  const result = db.transaction(() => {
    const ev = db
      .prepare(
        'DELETE FROM opzava_runner_operational_events WHERE occurred_at < ?'
      )
      .run(input.olderThan).changes

    const dl = db
      .prepare('DELETE FROM opzava_runner_dead_letters WHERE stored_at < ?')
      .run(input.olderThan).changes

    const jobs = db
      .prepare(
        "DELETE FROM opzava_runner_jobs WHERE status = 'succeeded' AND updated_at < ?"
      )
      .run(input.olderThan).changes

    return { operationalEvents: ev, deadLetters: dl, succeededJobs: jobs }
  })()

  return Object.freeze({
    operationalEvents: result.operationalEvents,
    deadLetters: result.deadLetters,
    succeededJobs: result.succeededJobs,
  })
}
