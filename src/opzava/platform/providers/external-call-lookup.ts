import type Database from 'better-sqlite3'

import { parseExternalCallRecord, type ExternalCallRecord } from './contracts'
import type { ExistingExternalCallLookup } from './live-execution-runtime'

type OperationalEventRow = Readonly<{ record_json: string }>

// Backs the injected idempotency port with a real query over stored external-call operational
// events. External-call records are persisted by the runner repository as operational events of
// kind 'external-call', with the ExternalCallRecord nested at `$.event` of record_json; the
// idempotency key therefore lives at `$.event.idempotencyKey`.
//
// This read-query closes the "no real store" gap, not the concurrency window: two callers can
// still both read null before either writes. Atomic reserve-or-skip is a follow-up slice; until
// then the runner's atomic job lease keeps same-step execution sequential.
export function createExternalCallIdempotencyLookup(db: Database.Database): ExistingExternalCallLookup {
  // Prepared lazily so the lookup can be constructed before the runner schema is applied;
  // by the time a query runs at startup, the operational-events table exists.
  let selectByIdempotencyKey: Database.Statement | null = null

  return Object.freeze({
    findExistingExternalCall(idempotencyKey: string): ExternalCallRecord | null {
      selectByIdempotencyKey ??= db.prepare(
        // Only a SUCCEEDED external call counts as "already executed". A failed or timed-out call
        // must not short-circuit a retry, which (with the reservation released on failure) re-runs.
        `SELECT record_json FROM opzava_runner_operational_events
         WHERE kind = 'external-call'
           AND json_extract(record_json, '$.event.idempotencyKey') = ?
           AND json_extract(record_json, '$.event.status') = 'succeeded'
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
