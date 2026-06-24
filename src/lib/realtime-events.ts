import { getDatabase } from './db'
import type { ServerEvent } from './event-bus'

export const SSE_RETRY_MS = 5_000
export const SSE_HEARTBEAT_MS = 15_000
export const SSE_POLL_MS = 1_000
export const SSE_REPLAY_LIMIT = 200
export const SSE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
export const SSE_RETENTION_MAX_ROWS = 50_000
export const SSE_PRUNE_INTERVAL_MS = 60_000

export interface StoredServerEvent extends ServerEvent {
  id: number
  workspace_id: number | null
}

let lastPruneAt = 0

function toWorkspaceId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function workspaceIdFromData(type: string, data: unknown): number | null {
  if (!data || typeof data !== 'object') return null
  const direct = toWorkspaceId((data as { workspace_id?: unknown }).workspace_id)
    ?? toWorkspaceId((data as { workspaceId?: unknown }).workspaceId)
  if (direct) return direct

  const db = getDatabase()

  if (type.startsWith('run.')) {
    const runId = (data as { id?: unknown }).id
    if (typeof runId !== 'string' || runId.length === 0 || runId.length > 200) return null
    try {
      const row = db.prepare('SELECT workspace_id FROM runs WHERE id = ? LIMIT 1').get(runId) as { workspace_id?: number | string } | undefined
      return toWorkspaceId(row?.workspace_id)
    } catch {
      return null
    }
  }

  const id = (data as { id?: unknown }).id
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return null

  const table = type.startsWith('task.')
    ? 'tasks'
    : type.startsWith('agent.')
      ? 'agents'
      : type.startsWith('notification.')
        ? 'notifications'
        : type.startsWith('activity.')
          ? 'activities'
          : null

  if (!table) return null

  try {
    const row = db.prepare(`SELECT workspace_id FROM ${table} WHERE id = ? LIMIT 1`).get(id) as { workspace_id?: number } | undefined
    return toWorkspaceId(row?.workspace_id)
  } catch {
    return null
  }
}

export function serverEventWorkspaceId(event: Pick<ServerEvent, 'workspace_id' | 'data'>): number | null {
  return toWorkspaceId(event.workspace_id)
    ?? (
      event.data && typeof event.data === 'object'
        ? toWorkspaceId((event.data as { workspace_id?: unknown }).workspace_id)
          ?? toWorkspaceId((event.data as { workspaceId?: unknown }).workspaceId)
        : null
    )
}

function parseStoredEvent(row: {
  id: number
  type: string
  data: string
  timestamp: number
  workspace_id: number | null
}): StoredServerEvent {
  return {
    id: row.id,
    type: row.type,
    data: JSON.parse(row.data),
    timestamp: row.timestamp,
    workspace_id: row.workspace_id ?? null,
  }
}

export function recordServerEvent(input: Omit<ServerEvent, 'id' | 'workspace_id'>): StoredServerEvent {
  const db = getDatabase()
  const workspaceId = workspaceIdFromData(input.type, input.data)
  const result = db.prepare(`
    INSERT INTO realtime_events (type, data, timestamp, workspace_id)
    VALUES (?, ?, ?, ?)
  `).run(input.type, JSON.stringify(input.data ?? null), input.timestamp, workspaceId)

  return {
    ...input,
    id: Number(result.lastInsertRowid),
    workspace_id: workspaceId,
  }
}

export function pruneRealtimeEvents(now: number = Date.now()): void {
  if (now - lastPruneAt < SSE_PRUNE_INTERVAL_MS) return
  lastPruneAt = now

  const db = getDatabase()
  const cutoff = now - SSE_RETENTION_MS
  db.prepare('DELETE FROM realtime_events WHERE timestamp < ?').run(cutoff)

  const countRow = db.prepare('SELECT COUNT(*) as count FROM realtime_events').get() as { count?: number } | undefined
  const count = countRow?.count || 0
  if (count <= SSE_RETENTION_MAX_ROWS) return

  const threshold = db.prepare(`
    SELECT id FROM realtime_events
    ORDER BY id DESC
    LIMIT 1 OFFSET ?
  `).get(SSE_RETENTION_MAX_ROWS - 1) as { id?: number } | undefined
  if (typeof threshold?.id === 'number') {
    db.prepare('DELETE FROM realtime_events WHERE id < ?').run(threshold.id)
  }
}

let prunerHandle: ReturnType<typeof setInterval> | null = null

/**
 * Prune the realtime_events retention window on a periodic timer, OFF the broadcast
 * hot path. recordServerEvent no longer prunes inline (P3-4), so publishing never pays
 * the DELETE + COUNT while a caller holds a write lock. Idempotent: one timer/process.
 */
export function startRealtimePruner(): void {
  if (prunerHandle) return
  const tick = () => {
    try {
      pruneRealtimeEvents()
    } catch {
      // best-effort; a failed prune must not down the process
    }
  }
  tick()
  prunerHandle = setInterval(tick, SSE_PRUNE_INTERVAL_MS)
  // unref() so the pruner never keeps the event loop alive on its own (PROC-2).
  prunerHandle.unref?.()
}

/**
 * Stop the realtime retention pruner and clear its handle (PROC-2). Idempotent:
 * a no-op when the pruner was never started or already stopped, so it is safe to
 * call from a coordinated process-shutdown path alongside stopScheduler().
 */
export function stopRealtimePruner(): void {
  if (prunerHandle) {
    clearInterval(prunerHandle)
    prunerHandle = null
  }
}

export function readServerEventsAfter(input: {
  afterId: number
  workspaceId: number
  limit?: number
}): StoredServerEvent[] {
  const db = getDatabase()
  const requestedLimit = Number.isSafeInteger(input.limit) ? input.limit as number : SSE_REPLAY_LIMIT
  const limit = Math.max(1, Math.min(requestedLimit, SSE_REPLAY_LIMIT))
  const rows = db.prepare(`
    SELECT id, type, data, timestamp, workspace_id
    FROM realtime_events
    WHERE id > ?
      AND workspace_id = ?
    ORDER BY id ASC
    LIMIT ?
  `).all(input.afterId, input.workspaceId, limit) as Array<{
    id: number
    type: string
    data: string
    timestamp: number
    workspace_id: number | null
  }>

  return rows.map(parseStoredEvent)
}

export function minRealtimeEventId(workspaceId: number): number | null {
  const db = getDatabase()
  const row = db.prepare(`
    SELECT MIN(id) as id
    FROM realtime_events
    WHERE workspace_id = ?
  `).get(workspaceId) as { id?: number | null } | undefined
  const minId = row?.id
  return typeof minId === 'number' && Number.isSafeInteger(minId) ? minId : null
}

export function parseLastEventId(value: string | null): number {
  if (!value) return 0
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

export function formatSseFrame(event: ServerEvent): string {
  const lines: string[] = []
  if (typeof event.id === 'number' && Number.isSafeInteger(event.id) && event.id > 0) {
    lines.push(`id: ${event.id}`)
  }
  lines.push(`data: ${JSON.stringify(event)}`)
  return `${lines.join('\n')}\n\n`
}

export function formatSseRetryFrame(base: number = SSE_RETRY_MS, jitter: number = 2000): string {
  return `retry: ${base + Math.floor(Math.random() * jitter)}\n\n`
}
