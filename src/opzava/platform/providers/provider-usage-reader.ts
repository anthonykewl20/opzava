import Database from 'better-sqlite3'
import { type ProviderUsageSnapshot } from './limit-enforcement'

/**
 * F6b — read the current provider usage snapshot the limit gate evaluates: live external calls in the
 * trailing minute (rate) and USD spent in the trailing hour/day (budget), from the runner's
 * operational-event store. Cost events carry cents; this converts to USD to match the limit units.
 * When the store is absent (a fresh DB), usage reads as zero — nothing spent, nothing rate-limited.
 */

export type ProviderUsageReaderClock = Readonly<{ now: () => Date }>

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

function tableExists(db: Database.Database): boolean {
  const row = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'opzava_runner_operational_events'")
    .get() as { ok: number } | undefined
  return row !== undefined
}

export function createProviderUsageReader(
  db: Database.Database,
  clock: ProviderUsageReaderClock,
): () => ProviderUsageSnapshot {
  return (): ProviderUsageSnapshot => {
    if (!tableExists(db)) {
      return Object.freeze({ requestsInLastMinute: 0, usdSpentThisHour: 0, usdSpentThisDay: 0 })
    }
    const nowMs = clock.now().getTime()
    const since = (windowMs: number): string => new Date(nowMs - windowMs).toISOString()

    const requestsInLastMinute = (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM opzava_runner_operational_events WHERE kind = 'external-call' AND occurred_at >= ?",
        )
        .get(since(MINUTE_MS)) as { n: number }
    ).n

    const usdSpentSince = (windowMs: number): number => {
      const cents = (
        db
          .prepare(
            "SELECT COALESCE(SUM(json_extract(record_json, '$.event.estimatedCostCents')), 0) AS cents FROM opzava_runner_operational_events WHERE kind = 'cost' AND occurred_at >= ?",
          )
          .get(since(windowMs)) as { cents: number }
      ).cents
      return cents / 100
    }

    return Object.freeze({
      requestsInLastMinute,
      usdSpentThisHour: usdSpentSince(HOUR_MS),
      usdSpentThisDay: usdSpentSince(DAY_MS),
    })
  }
}
