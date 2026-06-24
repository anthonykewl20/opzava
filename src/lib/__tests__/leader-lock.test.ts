import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import {
  acquireLeadership,
  ensureLeaderLockSchema,
  getNodeId,
  LEADER_LOCK_TTL_MS,
  releaseLeadership,
} from '@/lib/leader-lock'

// G1 single-active-writer foundation. These tests prove the acquire/renew/deny/failover
// semantics of the advisory lock in isolation. The scheduler gating that uses it is wired
// separately (deferred — needs 2-replica validation).

describe('leader-lock (G1 foundation)', () => {
  let db: Database.Database | null = null

  afterEach(() => {
    db?.close()
    db = null
  })

  function fresh(): Database.Database {
    const d = new Database(':memory:')
    ensureLeaderLockSchema(d)
    db = d
    return d
  }

  it('first caller acquires leadership', () => {
    const d = fresh()
    expect(acquireLeadership(d, 'A', 1000)).toBe(true)
  })

  it('the holder renews and stays leader', () => {
    const d = fresh()
    expect(acquireLeadership(d, 'A', 1000)).toBe(true)
    expect(acquireLeadership(d, 'A', 1000 + 30_000)).toBe(true)
  })

  it('a second live node does NOT take over while the lock is unexpired', () => {
    const d = fresh()
    acquireLeadership(d, 'A', 1000) // expires at 1000 + 90s
    expect(acquireLeadership(d, 'B', 1000 + 30_000)).toBe(false)
    const row = d.prepare('SELECT holder FROM leader_locks WHERE id = 1').get() as { holder: string }
    expect(row.holder).toBe('A')
  })

  it('a second node takes over AFTER the lock expires (failover)', () => {
    const d = fresh()
    acquireLeadership(d, 'A', 1000) // expires at 1000 + LEADER_LOCK_TTL_MS
    expect(acquireLeadership(d, 'B', 1000 + LEADER_LOCK_TTL_MS + 1)).toBe(true)
  })

  it('lock TTL < lease TTL invariant (90s lock vs 10min task lease)', () => {
    // If this breaks, failover can double-dispatch — see leader-lock.ts invariant.
    expect(LEADER_LOCK_TTL_MS).toBeLessThan(10 * 60 * 1000)
  })

  it('releaseLeadership lets another node immediately acquire', () => {
    const d = fresh()
    acquireLeadership(d, 'A', 1000)
    releaseLeadership(d, 'A')
    expect(acquireLeadership(d, 'B', 1000)).toBe(true)
  })

  it('releaseLeadership is a no-op for a non-holder', () => {
    const d = fresh()
    acquireLeadership(d, 'A', 1000)
    releaseLeadership(d, 'B')
    const row = d.prepare('SELECT holder FROM leader_locks WHERE id = 1').get() as { holder: string }
    expect(row.holder).toBe('A')
  })

  it('getNodeId is stable for the process lifetime', () => {
    expect(getNodeId()).toBe(getNodeId())
    expect(getNodeId().length).toBeGreaterThan(0)
  })
})
