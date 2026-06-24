import type Database from 'better-sqlite3'

import { parseExternalCallRecord, type ExternalCallRecord } from './contracts'
import type { ExistingExternalCallLookup } from './live-execution-runtime'

type OperationalEventRow = Readonly<{ record_json: string }>

// Backs the injected idempotency port with a real query over stored external-call operational
// events. External-call records are persisted by the runner repository as operational events of
// kind 'external-call', with the ExternalCallRecord nested at `$.event` of record_json; the
// idempotency key therefore lives at `$.event.idempotencyKey`.
//
// A completed external call short-circuits a retry regardless of outcome: for side-effecting calls
// (an email send), a transient/ambiguous provider failure may have delivered before returning the
// error, so re-running would risk a duplicate. The reservation (see external-call-reservation.ts)
// is also retained on a returned failure, so the concurrency window is closed by the persisted
// record plus the atomic reservation rather than by this read query alone.
export function createExternalCallIdempotencyLookup(db: Database.Database): ExistingExternalCallLookup {
  // Prepared lazily so the lookup can be constructed before the runner schema is applied;
  // by the time a query runs at startup, the operational-events table exists.
  let selectByIdempotencyKey: Database.Statement | null = null

  return Object.freeze({
    findExistingExternalCall(idempotencyKey: string): ExternalCallRecord | null {
      selectByIdempotencyKey ??= db.prepare(
        // A completed external call counts as "already executed" regardless of whether it succeeded
        // or failed. A side-effecting provider call (e.g. an email send) that returns a transient or
        // ambiguous failure may have already delivered, so re-running it risks a duplicate. The
        // record therefore short-circuits a retry via already-executed; only a pending attempt (a
        // reservation with no completed outcome) is treated as not-yet-executed.
        `SELECT record_json FROM opzava_runner_operational_events
         WHERE kind = 'external-call'
           AND json_extract(record_json, '$.event.idempotencyKey') = ?
           AND json_extract(record_json, '$.event.status') != 'pending'
         ORDER BY occurred_at ASC
         LIMIT 1`,
      )

      const row = selectByIdempotencyKey.get(idempotencyKey) as OperationalEventRow | undefined
      if (row === undefined) {
        return null
      }

      const stored = JSON.parse(row.record_json) as Readonly<{ event: unknown }>
      return parseExternalCallRecord(stored.event)
    },
  })
}
