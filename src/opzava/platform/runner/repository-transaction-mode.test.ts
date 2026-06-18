import { describe, expect, it, vi } from 'vitest'

import { createRunnerRepository } from './repository'

describe('Opzava runner repository transaction mode', () => {
  it('uses immediate transactions for write paths that coordinate job and attempt state', () => {
    const calls: string[] = []
    const db = {
      exec: vi.fn(),
      prepare: vi.fn((sql: string) => ({
        get: vi.fn(() => undefined),
        all: vi.fn(() => []),
        run: vi.fn(() => ({ changes: 0, lastInsertRowid: 0 })),
        sql,
      })),
      transaction: vi.fn((fn: () => unknown) => {
        const tx = vi.fn(() => {
          calls.push('default')
          return fn()
        }) as unknown as (() => unknown) & { immediate: () => unknown }
        tx.immediate = vi.fn(() => {
          calls.push('immediate')
          return fn()
        })
        return tx
      }),
    }
    const repo = createRunnerRepository(db as never)

    repo.leaseNextJobForAttempt({
      workerId: 'worker:local:1',
      attemptId: 'attempt_noop_001',
      leasedAt: '2026-06-15T00:01:00.000Z',
      leaseExpiresAt: '2026-06-15T00:06:00.000Z',
    })

    expect(calls).toEqual(['immediate'])
  })

  it('retries immediate transactions after SQLITE_BUSY before giving up', () => {
    const calls: string[] = []
    const db = {
      exec: vi.fn(),
      prepare: vi.fn((sql: string) => ({
        get: vi.fn(() => undefined),
        all: vi.fn(() => []),
        run: vi.fn(() => ({ changes: 0, lastInsertRowid: 0 })),
        sql,
      })),
      transaction: vi.fn((fn: () => unknown) => {
        const tx = vi.fn(() => fn()) as unknown as (() => unknown) & { immediate: () => unknown }
        tx.immediate = vi.fn(() => {
          calls.push('immediate')
          if (calls.length === 1) {
            const error = new Error('database is locked') as Error & { code: string }
            error.code = 'SQLITE_BUSY'
            throw error
          }

          return fn()
        })
        return tx
      }),
    }
    const repo = createRunnerRepository(db as never)

    const lease = repo.leaseNextJobForAttempt({
      workerId: 'worker:local:1',
      attemptId: 'attempt_busy_retry_001',
      leasedAt: '2026-06-15T00:01:00.000Z',
      leaseExpiresAt: '2026-06-15T00:06:00.000Z',
    })

    expect(lease).toBeNull()
    expect(calls).toEqual(['immediate', 'immediate'])
  })

  it('does not retry non-busy transaction errors', () => {
    const calls: string[] = []
    const db = {
      exec: vi.fn(),
      prepare: vi.fn((sql: string) => ({
        get: vi.fn(() => undefined),
        all: vi.fn(() => []),
        run: vi.fn(() => ({ changes: 0, lastInsertRowid: 0 })),
        sql,
      })),
      transaction: vi.fn((fn: () => unknown) => {
        const tx = vi.fn(() => fn()) as unknown as (() => unknown) & { immediate: () => unknown }
        tx.immediate = vi.fn(() => {
          calls.push('immediate')
          throw new Error('validation failed')
        })
        return tx
      }),
    }
    const repo = createRunnerRepository(db as never)

    expect(() => repo.leaseNextJobForAttempt({
      workerId: 'worker:local:1',
      attemptId: 'attempt_non_busy_001',
      leasedAt: '2026-06-15T00:01:00.000Z',
      leaseExpiresAt: '2026-06-15T00:06:00.000Z',
    })).toThrow('validation failed')
    expect(calls).toEqual(['immediate'])
  })

  it('gives up after the bounded SQLITE_BUSY retry budget', () => {
    const calls: string[] = []
    const db = {
      exec: vi.fn(),
      prepare: vi.fn((sql: string) => ({
        get: vi.fn(() => undefined),
        all: vi.fn(() => []),
        run: vi.fn(() => ({ changes: 0, lastInsertRowid: 0 })),
        sql,
      })),
      transaction: vi.fn((fn: () => unknown) => {
        const tx = vi.fn(() => fn()) as unknown as (() => unknown) & { immediate: () => unknown }
        tx.immediate = vi.fn(() => {
          calls.push('immediate')
          const error = new Error('database is locked') as Error & { code: string }
          error.code = 'SQLITE_BUSY'
          throw error
        })
        return tx
      }),
    }
    const repo = createRunnerRepository(db as never)

    expect(() => repo.leaseNextJobForAttempt({
      workerId: 'worker:local:1',
      attemptId: 'attempt_busy_budget_001',
      leasedAt: '2026-06-15T00:01:00.000Z',
      leaseExpiresAt: '2026-06-15T00:06:00.000Z',
    })).toThrow('database is locked')
    expect(calls).toEqual(['immediate', 'immediate'])
  })
})
