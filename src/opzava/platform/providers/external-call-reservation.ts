import type Database from 'better-sqlite3'

export type ExternalCallReservationInput = Readonly<{
  idempotencyKey: string
  externalCallId: string
  reservedAt: string
}>

export type ExternalCallReservationResult =
  | Readonly<{ ok: true, outcome: 'reserved' }>
  | Readonly<{ ok: true, outcome: 'already-reserved' }>

export type ExternalCallReservation = Readonly<{
  reserveExternalCall: (input: ExternalCallReservationInput) => ExternalCallReservationResult
  releaseExternalCall: (idempotencyKey: string) => void
}>

// Atomic reserve-or-skip for a provider idempotency key. The reservation table's PRIMARY KEY on
// idempotency_key makes the INSERT the serialization point: SQLite admits exactly one writer, so
// of two concurrent reservations for the same key exactly one inserts (changes === 1) and wins.
// ON CONFLICT DO NOTHING leaves the first winner's row untouched. Releasing a key deletes its row
// so a failed action can be retried and win the reservation again.
export function createExternalCallReservation(db: Database.Database): ExternalCallReservation {
  let insert: Database.Statement | null = null
  let remove: Database.Statement | null = null

  return Object.freeze({
    reserveExternalCall(input: ExternalCallReservationInput): ExternalCallReservationResult {
      insert ??= db.prepare(
        `INSERT INTO opzava_runner_external_call_reservations (idempotency_key, external_call_id, reserved_at)
         VALUES (?, ?, ?)
         ON CONFLICT(idempotency_key) DO NOTHING`,
      )

      const result = insert.run(input.idempotencyKey, input.externalCallId, input.reservedAt)
      return result.changes === 1
        ? Object.freeze({ ok: true, outcome: 'reserved' })
        : Object.freeze({ ok: true, outcome: 'already-reserved' })
    },

    releaseExternalCall(idempotencyKey: string): void {
      remove ??= db.prepare('DELETE FROM opzava_runner_external_call_reservations WHERE idempotency_key = ?')
      remove.run(idempotencyKey)
    },
  })
}
