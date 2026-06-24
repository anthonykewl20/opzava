import { beforeEach, describe, expect, it, vi } from 'vitest'

const realtimeState = vi.hoisted(() => {
  const rows: Array<{
    id: number
    type: string
    data: string
    timestamp: number
    workspace_id: number | null
  }> = []

  return {
    rows,
    runWorkspaces: new Map<string, number>(),
    nextId: 1,
    prepare: vi.fn((sql: string) => {
      if (sql.includes('INSERT INTO realtime_events')) {
        return {
          run: (type: string, data: string, timestamp: number, workspaceId: number | null) => {
            const id = realtimeState.nextId++
            rows.push({ id, type, data, timestamp, workspace_id: workspaceId })
            return { lastInsertRowid: id }
          },
        }
      }

      if (sql.includes('DELETE FROM realtime_events WHERE timestamp <')) {
        return {
          run: (cutoff: number) => {
            const before = rows.length
            for (let index = rows.length - 1; index >= 0; index -= 1) {
              if (rows[index].timestamp < cutoff) rows.splice(index, 1)
            }
            return { changes: before - rows.length }
          },
        }
      }

      if (sql.includes('SELECT COUNT(*) as count FROM realtime_events')) {
        return {
          get: () => ({ count: rows.length }),
        }
      }

      if (sql.includes('SELECT id FROM realtime_events')) {
        return {
          get: (offset: number) => rows.slice().sort((a, b) => b.id - a.id)[offset],
        }
      }

      if (sql.includes('DELETE FROM realtime_events WHERE id <')) {
        return {
          run: (thresholdId: number) => {
            const before = rows.length
            for (let index = rows.length - 1; index >= 0; index -= 1) {
              if (rows[index].id < thresholdId) rows.splice(index, 1)
            }
            return { changes: before - rows.length }
          },
        }
      }

      if (sql.includes('SELECT workspace_id FROM tasks')) {
        return {
          get: (id: number) => rows.find((row) => row.type === 'task.created' && JSON.parse(row.data).id === id)
            ? { workspace_id: 7 }
            : undefined,
        }
      }

      if (sql.includes('SELECT MIN(id)')) {
        return {
          get: (workspaceId: number) => {
            const matching = rows.filter((row) => row.workspace_id === workspaceId)
            if (matching.length === 0) return undefined
            return { id: Math.min(...matching.map((row) => row.id)) }
          },
        }
      }

      if (sql.includes('SELECT workspace_id FROM runs')) {
        return {
          get: (id: string) => {
            const workspaceId = realtimeState.runWorkspaces.get(id)
            return workspaceId ? { workspace_id: workspaceId } : undefined
          },
        }
      }

      if (sql.includes('FROM realtime_events')) {
        return {
          all: (afterId: number, workspaceId: number, limit: number) =>
            rows
              .filter((row) => row.id > afterId && row.workspace_id === workspaceId)
              .slice(0, limit),
        }
      }

      return {
        run: vi.fn(),
        all: vi.fn(() => []),
      }
    }),
  }
})

vi.mock('../db', () => ({
  getDatabase: () => ({
    prepare: realtimeState.prepare,
  }),
}))

import {
  formatSseFrame,
  formatSseRetryFrame,
  minRealtimeEventId,
  parseLastEventId,
  pruneRealtimeEvents,
  readServerEventsAfter,
  recordServerEvent,
  SSE_PRUNE_INTERVAL_MS,
  SSE_REPLAY_LIMIT,
  SSE_RETENTION_MAX_ROWS,
  SSE_RETENTION_MS,
  SSE_RETRY_MS,
} from '../realtime-events'

describe('realtime SSE event helpers', () => {
  beforeEach(() => {
    realtimeState.rows.length = 0
    realtimeState.runWorkspaces.clear()
    realtimeState.nextId = 1
    realtimeState.prepare.mockClear()
  })

  it('formats id-bearing SSE frames using the browser EventSource contract', () => {
    const frame = formatSseFrame({
      id: 42,
      type: 'task.created',
      data: { id: 7 },
      timestamp: 123,
      workspace_id: 1,
    })

    expect(frame).toBe('id: 42\ndata: {"id":42,"type":"task.created","data":{"id":7},"timestamp":123,"workspace_id":1}\n\n')
  })

  it('publishes a jittered browser retry interval in [base, base+jitter)', () => {
    const frame = formatSseRetryFrame()
    const match = /^retry: (\d+)\n\n$/.exec(frame)
    expect(match).not.toBeNull()
    const retry = Number(match![1])
    expect(retry).toBeGreaterThanOrEqual(SSE_RETRY_MS)
    expect(retry).toBeLessThan(SSE_RETRY_MS + 2000)
  })

  it('honors explicit base and jitter for the retry frame', () => {
    const frame = formatSseRetryFrame(9000, 1000)
    const match = /^retry: (\d+)\n\n$/.exec(frame)
    expect(match).not.toBeNull()
    const retry = Number(match![1])
    expect(retry).toBeGreaterThanOrEqual(9000)
    expect(retry).toBeLessThan(10000)
  })

  it('accepts only positive integer Last-Event-ID values', () => {
    expect(parseLastEventId('9')).toBe(9)
    expect(parseLastEventId(null)).toBe(0)
    expect(parseLastEventId('0')).toBe(0)
    expect(parseLastEventId('-1')).toBe(0)
    expect(parseLastEventId('1.5')).toBe(0)
    expect(parseLastEventId('not-an-id')).toBe(0)
  })

  it('records durable events with a monotonic id and derived workspace id', () => {
    const event = recordServerEvent({
      type: 'task.updated',
      data: { id: 7, workspace_id: 3 },
      timestamp: 123,
    })

    expect(event).toEqual({
      id: 1,
      type: 'task.updated',
      data: { id: 7, workspace_id: 3 },
      timestamp: 123,
      workspace_id: 3,
    })
    expect(realtimeState.rows).toHaveLength(1)
    expect(realtimeState.rows[0].workspace_id).toBe(3)
  })

  it('records run events with string or persisted workspace ids', () => {
    const direct = recordServerEvent({
      type: 'run.created',
      data: { id: 'run-direct', workspace_id: '4' },
      timestamp: 123,
    })

    realtimeState.runWorkspaces.set('run-persisted', 5)
    const persisted = recordServerEvent({
      type: 'run.updated',
      data: { id: 'run-persisted' },
      timestamp: 124,
    })

    expect(direct.workspace_id).toBe(4)
    expect(persisted.workspace_id).toBe(5)
  })

  it('replays only events after the requested id for the caller workspace', () => {
    recordServerEvent({ type: 'task.created', data: { id: 1, workspace_id: 1 }, timestamp: 100 })
    recordServerEvent({ type: 'task.created', data: { id: 2, workspace_id: 2 }, timestamp: 101 })
    recordServerEvent({ type: 'security.event', data: { id: 3 }, timestamp: 102 })
    recordServerEvent({ type: 'task.updated', data: { id: 4, workspace_id: 1 }, timestamp: 103 })

    const replay = readServerEventsAfter({ afterId: 1, workspaceId: 1 })

    expect(replay.map((event) => event.id)).toEqual([4])
    expect(replay.map((event) => event.type)).toEqual(['task.updated'])
  })

  it('does not replay events without a resolved workspace id to scoped clients', () => {
    recordServerEvent({ type: 'security.event', data: { id: 3 }, timestamp: 102 })

    expect(readServerEventsAfter({ afterId: 0, workspaceId: 1 })).toEqual([])
    expect(realtimeState.rows[0].workspace_id).toBeNull()
  })

  it('minRealtimeEventId returns the lowest retained id for a workspace and null when empty', () => {
    expect(minRealtimeEventId(1)).toBeNull()

    recordServerEvent({ type: 'task.created', data: { id: 1, workspace_id: 1 }, timestamp: 100 })
    recordServerEvent({ type: 'task.created', data: { id: 2, workspace_id: 2 }, timestamp: 101 })
    recordServerEvent({ type: 'task.updated', data: { id: 3, workspace_id: 1 }, timestamp: 102 })

    expect(minRealtimeEventId(1)).toBe(1)
    expect(minRealtimeEventId(2)).toBe(2)
    expect(minRealtimeEventId(99)).toBeNull()
  })

  it('clamps replay batches to the bounded replay limit', () => {
    for (let index = 0; index < SSE_REPLAY_LIMIT + 20; index += 1) {
      recordServerEvent({ type: 'activity.created', data: { id: index, workspace_id: 1 }, timestamp: index })
    }

    const replay = readServerEventsAfter({ afterId: 0, workspaceId: 1, limit: SSE_REPLAY_LIMIT + 20 })

    expect(replay).toHaveLength(SSE_REPLAY_LIMIT)
    expect(replay.at(0)?.id).toBe(1)
    expect(replay.at(-1)?.id).toBe(SSE_REPLAY_LIMIT)
  })

  it('prunes retained events by age and maximum row count', () => {
    const now = Date.now() + SSE_RETENTION_MS + SSE_PRUNE_INTERVAL_MS + 10_000
    realtimeState.rows.push(
      { id: 1, type: 'activity.created', data: '{}', timestamp: now - SSE_RETENTION_MS - 1, workspace_id: 1 },
      { id: 2, type: 'activity.created', data: '{}', timestamp: now, workspace_id: 1 },
    )

    pruneRealtimeEvents(now)

    expect(realtimeState.rows.map((row) => row.id)).toEqual([2])

    realtimeState.rows.length = 0
    for (let index = 1; index <= SSE_RETENTION_MAX_ROWS + 2; index += 1) {
      realtimeState.rows.push({ id: index, type: 'activity.created', data: '{}', timestamp: now, workspace_id: 1 })
    }

    pruneRealtimeEvents(now + SSE_PRUNE_INTERVAL_MS + 1)

    expect(realtimeState.rows).toHaveLength(SSE_RETENTION_MAX_ROWS)
    expect(realtimeState.rows[0].id).toBe(3)
  })
})
