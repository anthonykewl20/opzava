import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { createRunnerMaintenanceDaemon } from './maintenance-daemon'

const DEFAULT_INTERVAL_MS = 60_000
const DEFAULT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000 // 90 days

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timeout = setTimeout(done, ms)
    // unref() so the daemon's sleep timer never keeps the event loop alive on
    // its own (PROC-2). The loop is driven by this promise; without unref a
    // pending sleep would be the lone reason Node refuses to exit between cycles.
    timeout.unref?.()
    signal.addEventListener('abort', done, { once: true })
  })
}

/**
 * Boot the background runner-maintenance loop (F5). Fire-and-forget; returns an AbortController so a
 * caller (or a future graceful-shutdown hook) can stop it. Defaults are conservative; once admin
 * settings are wired (F6) these can be sourced from runtime config.
 */
export function startRunnerMaintenance(
  db: Database.Database,
  options?: Readonly<{ intervalMs?: number; retentionMs?: number; onError?: (error: unknown) => void }>,
): AbortController {
  const controller = new AbortController()
  const daemon = createRunnerMaintenanceDaemon({
    db,
    now: () => new Date(),
    newId: () => randomUUID(),
    workerId: 'opzava-runner-maintenance',
    retentionMs: options?.retentionMs ?? DEFAULT_RETENTION_MS,
    intervalMs: options?.intervalMs ?? DEFAULT_INTERVAL_MS,
    signal: controller.signal,
    sleep: abortableSleep,
    onError: options?.onError,
  })
  void daemon.run()
  return controller
}
