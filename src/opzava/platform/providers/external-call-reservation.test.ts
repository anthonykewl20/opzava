import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { applyOpzavaExternalCallReservationSchema } from '../runner/migrations'
import { createExternalCallReservation, type ExternalCallReservation } from './external-call-reservation'

describe('Opzava external-call reservation', () => {
  let db: Database.Database | null = null

  afterEach(() => {
    db?.close()
    db = null
  })

  function reservation() {
    db = new Database(':memory:')
    applyOpzavaExternalCallReservationSchema(db)
    return createExternalCallReservation(db)
  }

  function reserve(r: ExternalCallReservation, idempotencyKey: string, externalCallId: string, at = '2026-06-15T00:00:00.000Z') {
    return r.reserveExternalCall({ idempotencyKey, externalCallId, reservedAt: at })
  }

  it('reserves an idempotency key for the first caller', () => {
    const r = reservation()

    expect(reserve(r, 'k1', 'ec1')).toEqual({ ok: true, outcome: 'reserved' })
  })

  it('refuses a second reservation for the same idempotency key', () => {
    const r = reservation()

    reserve(r, 'k1', 'ec1')

    expect(reserve(r, 'k1', 'ec2', '2026-06-15T00:00:01.000Z')).toEqual({ ok: true, outcome: 'already-reserved' })
  })

  it('allows reservations for distinct idempotency keys', () => {
    const r = reservation()

    expect(reserve(r, 'k1', 'ec1').outcome).toBe('reserved')
    expect(reserve(r, 'k2', 'ec2', '2026-06-15T00:00:01.000Z').outcome).toBe('reserved')
  })

  it('keeps the first winner external call id when a later reservation loses', () => {
    const r = reservation()

    reserve(r, 'k1', 'ec_first')
    reserve(r, 'k1', 'ec_second', '2026-06-15T00:00:01.000Z')

    const row = (db as Database.Database)
      .prepare('SELECT external_call_id FROM opzava_runner_external_call_reservations WHERE idempotency_key = ?')
      .get('k1')

    expect(row).toEqual({ external_call_id: 'ec_first' })
  })

  it('releases a reservation so the key can be reserved again', () => {
    const r = reservation()

    reserve(r, 'k1', 'ec1')
    r.releaseExternalCall('k1')

    expect(reserve(r, 'k1', 'ec2', '2026-06-15T00:00:02.000Z').outcome).toBe('reserved')
  })
})
