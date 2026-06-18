import Database from 'better-sqlite3'
import { parseDeadLetterStorageRecord, type DeadLetterStorageRecord } from './repository-contracts'
import { applyOpzavaRunnerRepositorySchema } from './migrations'

export type RecentDeadLetterQuery = Readonly<{ limit?: number }>

export function listRecentDeadLetters(
  db: Database.Database,
  query: RecentDeadLetterQuery = {}
): DeadLetterStorageRecord[] {
  applyOpzavaRunnerRepositorySchema(db)
  const limit = Math.min(Math.max(Math.trunc(query.limit ?? 50), 1), 200)
  const rows = db
    .prepare(
      'SELECT record_json FROM opzava_runner_dead_letters ORDER BY stored_at DESC, dead_letter_id DESC LIMIT ?'
    )
    .all(limit) as Array<{ record_json: string }>
  return rows.map((r) => parseDeadLetterStorageRecord(JSON.parse(r.record_json)))
}
