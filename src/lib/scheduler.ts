import { getDatabase, logAuditEvent } from './db'
import { syncAgentsFromConfig } from './agent-sync'
import { config, ensureDirExists } from './config'
import { join, dirname } from 'path'
import { readdirSync, statSync, unlinkSync } from 'fs'
import { logger } from './logger'
import { processWebhookRetries } from './webhooks'
import { syncClaudeSessions } from './claude-sessions'
import { pruneGatewaySessionsOlderThan, getAgentLiveStatuses } from './sessions'
import { eventBus } from './event-bus'
import { syncSkillsFromDisk } from './skill-sync'
import { syncLocalAgents } from './local-agent-sync'
import { dispatchAssignedTasks, runAegisReviews, requeueStaleTasks, autoRouteInboxTasks, reconcileDeferredTaskCompletions, makeDefaultDeps } from './task-dispatch'
import { spawnRecurringTasks } from './recurring-tasks'

const BACKUP_DIR = join(dirname(config.dbPath), 'backups')

const DAILY_MS = 24 * 60 * 60 * 1000
const FIVE_MINUTES_MS = 5 * 60 * 1000
const TICK_MS = 60 * 1000 // Check every minute
const WAL_CHECKPOINT_MS = 10 * 60 * 1000 // WAL checkpoint cadence (PASSIVE frequently; TRUNCATE off-peak)

// ---------------------------------------------------------------------------
// Scheduled-task registry.
//
// Every task the scheduler runs is declared ONCE here — id, display name, the
// settings-table key that gates it, the default-enabled fallback, the tick
// interval, the first-run delay resolver, and the handler. initScheduler,
// tick(), getSchedulerStatus(), and triggerTask() all read from this table, so
// a task's setting gate / timing / handler can never drift between them (the
// pre-refactor code re-derived the gate + handler in three places).
//
// This is an internal data table, NOT a public register() API: there is a
// single caller (this module). Behavior is preserved exactly — every entry
// below corresponds 1:1 to a former `tasks.set(...)` + ternary branch.
// ---------------------------------------------------------------------------

export interface ScheduledTaskContext {
  /** true when invoked via triggerTask() (manual run), false on a scheduled tick. */
  manual: boolean
}

export interface ScheduledTaskSpec {
  id: string
  name: string
  /** settings-table key whose `'true'`/`'false'` value gates this task. */
  settingKey: string
  /** fallback when the setting row is absent. */
  defaultEnabled: boolean
  intervalMs: number
  /** ms from scheduler init until the task's first eligible run. */
  firstRunDelay: (now: number) => number
  /** returns { ok, message }; the same handler backs both ticks and manual runs. */
  handler: (ctx: ScheduledTaskContext) => Promise<{ ok: boolean; message: string }>
}

/** The task_dispatch chain: route → reconcile → dispatch, in one place. */
async function runTaskDispatchChain(): Promise<{ ok: boolean; message: string }> {
  const deps = makeDefaultDeps()
  const routeResult = await autoRouteInboxTasks(deps)
  const reconcileResult = await reconcileDeferredTaskCompletions(deps)
  const dispatchResult = await dispatchAssignedTasks(deps)
  const parts = [reconcileResult.message, routeResult.message, dispatchResult.message]
    .filter(m => m && !m.includes('No ') && !m.includes('none completed'))
  return {
    ok: routeResult.ok && reconcileResult.ok && dispatchResult.ok,
    message: parts.join(' | ') || 'No tasks to reconcile, route, or dispatch',
  }
}

/** gateway_agent_sync differs between scheduled (live-status refresh) and manual. */
async function runGatewayAgentSync(ctx: ScheduledTaskContext): Promise<{ ok: boolean; message: string }> {
  const r = await syncAgentsFromConfig(ctx.manual ? 'manual' : 'scheduled')
  if (ctx.manual) {
    return { ok: true, message: `Gateway sync: ${r.created} created, ${r.updated} updated, ${r.synced} total` }
  }
  const refreshed = await syncAgentLiveStatuses()
  return {
    ok: true,
    message: `Gateway sync: ${r.created} created, ${r.updated} updated, ${r.synced} total | Live status: ${refreshed} refreshed`,
  }
}

export const SCHEDULED_TASKS: readonly ScheduledTaskSpec[] = [
  {
    id: 'auto_backup',
    name: 'Auto Backup',
    settingKey: 'general.auto_backup',
    defaultEnabled: true,
    intervalMs: DAILY_MS,
    firstRunDelay: () => getNextDailyMs(3), // ~3 AM UTC
    handler: () => runBackup(),
  },
  {
    id: 'auto_cleanup',
    name: 'Auto Cleanup',
    settingKey: 'general.auto_cleanup',
    defaultEnabled: false,
    intervalMs: DAILY_MS,
    firstRunDelay: () => getNextDailyMs(4), // ~4 AM UTC
    handler: () => runCleanup(),
  },
  {
    id: 'wal_checkpoint',
    name: 'WAL Checkpoint',
    settingKey: 'general.wal_checkpoint',
    defaultEnabled: true,
    intervalMs: WAL_CHECKPOINT_MS,
    firstRunDelay: () => 60_000, // first checkpoint 60s after startup
    handler: () => runWalCheckpoint(),
  },
  {
    id: 'agent_heartbeat',
    name: 'Agent Heartbeat Check',
    settingKey: 'general.agent_heartbeat',
    defaultEnabled: true,
    intervalMs: FIVE_MINUTES_MS,
    firstRunDelay: () => FIVE_MINUTES_MS,
    handler: () => runHeartbeatCheck(),
  },
  {
    id: 'webhook_retry',
    name: 'Webhook Retry',
    settingKey: 'webhooks.retry_enabled',
    defaultEnabled: true,
    intervalMs: TICK_MS,
    firstRunDelay: () => TICK_MS,
    handler: () => processWebhookRetries(),
  },
  {
    id: 'claude_session_scan',
    name: 'Claude Session Scan',
    settingKey: 'general.claude_session_scan',
    defaultEnabled: true,
    intervalMs: getEnvNumber('MC_CLAUDE_SCAN_INTERVAL_MS', TICK_MS),
    firstRunDelay: () => 5_000, // first scan 5s after startup
    handler: () => syncClaudeSessions(),
  },
  {
    id: 'skill_sync',
    name: 'Skill Sync',
    settingKey: 'general.skill_sync',
    defaultEnabled: true,
    intervalMs: TICK_MS,
    firstRunDelay: () => 10_000, // first scan 10s after startup
    handler: () => syncSkillsFromDisk(),
  },
  {
    id: 'local_agent_sync',
    name: 'Local Agent Sync',
    settingKey: 'general.local_agent_sync',
    defaultEnabled: true,
    intervalMs: TICK_MS,
    firstRunDelay: () => 15_000, // first scan 15s after startup
    handler: () => syncLocalAgents(),
  },
  {
    id: 'gateway_agent_sync',
    name: 'Gateway Agent Sync',
    settingKey: 'general.gateway_agent_sync',
    defaultEnabled: true,
    intervalMs: TICK_MS,
    firstRunDelay: () => 20_000, // first scan 20s after startup (after local sync)
    handler: runGatewayAgentSync,
  },
  {
    id: 'task_dispatch',
    name: 'Task Dispatch',
    settingKey: 'general.task_dispatch',
    defaultEnabled: true,
    intervalMs: TICK_MS,
    firstRunDelay: () => 10_000, // first check 10s after startup
    handler: () => runTaskDispatchChain(),
  },
  {
    id: 'aegis_review',
    name: 'Aegis Quality Review',
    settingKey: 'general.aegis_review',
    defaultEnabled: true,
    intervalMs: TICK_MS,
    firstRunDelay: () => 30_000, // first check 30s after startup (after dispatch)
    handler: () => runAegisReviews(makeDefaultDeps()),
  },
  {
    id: 'recurring_task_spawn',
    name: 'Recurring Task Spawn',
    settingKey: 'general.recurring_task_spawn',
    defaultEnabled: true,
    intervalMs: TICK_MS,
    firstRunDelay: () => 20_000, // first check 20s after startup
    handler: () => spawnRecurringTasks(),
  },
  {
    id: 'stale_task_requeue',
    name: 'Stale Task Requeue',
    settingKey: 'general.stale_task_requeue',
    defaultEnabled: true,
    intervalMs: TICK_MS,
    firstRunDelay: () => 25_000, // first check 25s after startup
    handler: () => requeueStaleTasks(makeDefaultDeps()),
  },
]

/** Ids of every registered task — the source of truth for the API allow-list. */
export function getRegisteredTaskIds(): string[] {
  return SCHEDULED_TASKS.map(t => t.id)
}

interface ScheduledTask {
  name: string
  intervalMs: number
  lastRun: number | null
  nextRun: number
  enabled: boolean
  running: boolean
  lastResult?: { ok: boolean; message: string; timestamp: number }
}

const tasks: Map<string, ScheduledTask> = new Map()
let tickInterval: ReturnType<typeof setInterval> | null = null

/** Check if a setting is enabled (reads from settings table, falls back to default) */
function isSettingEnabled(key: string, defaultValue: boolean): boolean {
  try {
    const db = getDatabase()
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    if (row) return row.value === 'true'
    return defaultValue
  } catch {
    return defaultValue
  }
}

function getSettingNumber(key: string, defaultValue: number): number {
  try {
    const db = getDatabase()
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    if (row) return parseInt(row.value) || defaultValue
    return defaultValue
  } catch {
    return defaultValue
  }
}

function getEnvNumber(key: string, defaultValue: number): number {
  const raw = process.env[key]
  if (!raw) return defaultValue

  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) && value > 0 ? value : defaultValue
}

/** Run a database backup */
async function runBackup(): Promise<{ ok: boolean; message: string }> {
  ensureDirExists(BACKUP_DIR)

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const backupPath = join(BACKUP_DIR, `mc-backup-${timestamp}.db`)

  try {
    const db = getDatabase()
    await db.backup(backupPath)

    const stat = statSync(backupPath)
    logAuditEvent({
      action: 'auto_backup',
      actor: 'scheduler',
      detail: { path: backupPath, size: stat.size },
    })

    // Prune old backups
    const maxBackups = getSettingNumber('general.backup_retention_count', 10)
    try {
      const files = readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('mc-backup-') && f.endsWith('.db'))
        .map(f => ({ name: f, mtime: statSync(join(BACKUP_DIR, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime)

      for (const file of files.slice(maxBackups)) {
        unlinkSync(join(BACKUP_DIR, file.name))
      }
    } catch {
      // Best-effort pruning
    }

    const sizeKB = Math.round(stat.size / 1024)
    return { ok: true, message: `Backup created (${sizeKB}KB)` }
  } catch (err: any) {
    return { ok: false, message: `Backup failed: ${err.message}` }
  }
}

/** Run data cleanup based on retention settings */
async function runCleanup(): Promise<{ ok: boolean; message: string }> {
  try {
    const db = getDatabase()
    const now = Math.floor(Date.now() / 1000)
    const ret = config.retention
    let totalDeleted = 0

    const targets = [
      { table: 'activities', column: 'created_at', days: ret.activities },
      { table: 'audit_log', column: 'created_at', days: ret.auditLog },
      { table: 'notifications', column: 'created_at', days: ret.notifications },
      { table: 'pipeline_runs', column: 'created_at', days: ret.pipelineRuns },
    ]

    for (const { table, column, days } of targets) {
      if (days <= 0) continue
      const cutoff = now - days * 86400
      try {
        const res = db.prepare(`DELETE FROM ${table} WHERE ${column} < ?`).run(cutoff)
        totalDeleted += res.changes
      } catch {
        // Table might not exist
      }
    }

    // Clean token usage file
    if (ret.tokenUsage > 0) {
      try {
        const { readFile, writeFile } = require('fs/promises')
        const raw = await readFile(config.tokensPath, 'utf-8')
        const data = JSON.parse(raw)
        const cutoffMs = Date.now() - ret.tokenUsage * 86400000
        const kept = data.filter((r: any) => r.timestamp >= cutoffMs)
        const removed = data.length - kept.length

        if (removed > 0) {
          await writeFile(config.tokensPath, JSON.stringify(kept, null, 2))
          totalDeleted += removed
        }
      } catch {
        // No token file
      }
    }

    if (ret.gatewaySessions > 0) {
      const sessionCleanup = pruneGatewaySessionsOlderThan(ret.gatewaySessions)
      totalDeleted += sessionCleanup.deleted
    }

    let analyzed = false
    try {
      db.prepare('ANALYZE').run()
      analyzed = true
    } catch (err) {
      logger.warn({ err }, 'Database ANALYZE failed during cleanup')
    }

    if (totalDeleted > 0) {
      logAuditEvent({
        action: 'auto_cleanup',
        actor: 'scheduler',
        detail: { total_deleted: totalDeleted, analyzed },
      })
    }

    return { ok: true, message: `Cleaned ${totalDeleted} stale record${totalDeleted === 1 ? '' : 's'}${analyzed ? ' and updated query planner statistics' : ''}` }
  } catch (err: any) {
    return { ok: false, message: `Cleanup failed: ${err.message}` }
  }
}

/**
 * Checkpoint the WAL so the -wal file stays bounded. PASSIVE is non-blocking and
 * runs every WAL_CHECKPOINT_MS; TRUNCATE (which truncates -wal to zero and
 * briefly blocks writers) is reserved for the 3-5 AM UTC off-peak window so it
 * never contends with live dispatch. Without this the -wal grows unbounded on a
 * long-running standalone deploy — the operational failure mode the durability
 * spine previously had no answer for (see ARD 0011 / MASTER-PLAN A0). The
 * leader-heartbeat write (G1) is counted into this cadence.
 */
async function runWalCheckpoint(): Promise<{ ok: boolean; message: string }> {
  try {
    const db = getDatabase()
    const hourUtc = new Date().getUTCHours()
    const offPeak = hourUtc >= 3 && hourUtc < 5
    const mode = offPeak ? 'TRUNCATE' : 'PASSIVE'
    const row = (offPeak ? db.pragma('wal_checkpoint(TRUNCATE)') : db.pragma('wal_checkpoint(PASSIVE)')) as Array<{ busy: number; log: number; checkpointed: number }>
    return { ok: true, message: `WAL checkpoint (${mode}): checkpointed ${row[0]?.checkpointed ?? 0} frame(s)` }
  } catch (err: any) {
    return { ok: false, message: `WAL checkpoint failed: ${err.message}` }
  }
}

/** Check agent liveness - mark agents offline if not seen recently */
async function runHeartbeatCheck(): Promise<{ ok: boolean; message: string }> {
  try {
    const db = getDatabase()
    const now = Math.floor(Date.now() / 1000)
    const timeoutMinutes = getSettingNumber('general.agent_timeout_minutes', 10)
    const threshold = now - timeoutMinutes * 60

    // Find agents that are not offline but haven't been seen recently
    const staleAgents = db.prepare(`
      SELECT id, name, status, last_seen FROM agents
      WHERE status != 'offline' AND (last_seen IS NULL OR last_seen < ?)
    `).all(threshold) as Array<{ id: number; name: string; status: string; last_seen: number | null }>

    if (staleAgents.length === 0) {
      return { ok: true, message: 'All agents healthy' }
    }

    // Mark stale agents as offline
    const markOffline = db.prepare('UPDATE agents SET status = ?, updated_at = ? WHERE id = ?')
    const logActivity = db.prepare(`
      INSERT INTO activities (type, entity_type, entity_id, actor, description)
      VALUES ('agent_status_change', 'agent', ?, 'heartbeat', ?)
    `)

    const names: string[] = []
    db.transaction(() => {
      for (const agent of staleAgents) {
        markOffline.run('offline', now, agent.id)
        logActivity.run(agent.id, `Agent "${agent.name}" marked offline (no heartbeat for ${timeoutMinutes}m)`)
        names.push(agent.name)

        // Create notification for each stale agent
        try {
          db.prepare(`
            INSERT INTO notifications (recipient, type, title, message, source_type, source_id)
            VALUES ('system', 'heartbeat', ?, ?, 'agent', ?)
          `).run(
            `Agent offline: ${agent.name}`,
            `Agent "${agent.name}" was marked offline after ${timeoutMinutes} minutes without heartbeat`,
            agent.id
          )
        } catch { /* notification creation failed */ }
      }
    })()

    logAuditEvent({
      action: 'heartbeat_check',
      actor: 'scheduler',
      detail: { marked_offline: names },
    })

    return { ok: true, message: `Marked ${staleAgents.length} agent(s) offline: ${names.join(', ')}` }
  } catch (err: any) {
    return { ok: false, message: `Heartbeat check failed: ${err.message}` }
  }
}

/** Sync live agent statuses from gateway session files into the DB */
async function syncAgentLiveStatuses(): Promise<number> {
  const liveStatuses = getAgentLiveStatuses()
  if (liveStatuses.size === 0) return 0

  const db = getDatabase()
  const agents = db.prepare('SELECT id, name, config FROM agents').all() as Array<{
    id: number; name: string; config: string | null
  }>

  const update = db.prepare('UPDATE agents SET status = ?, last_seen = ?, last_activity = ?, updated_at = ? WHERE id = ?')
  let refreshed = 0

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9._-]+/g, '-')

  db.transaction(() => {
    for (const agent of agents) {
      // Match by agent name or openclawId from config
      let openclawId: string | null = null
      if (agent.config) {
        try {
          const cfg = JSON.parse(agent.config)
          if (typeof cfg.openclawId === 'string' && cfg.openclawId.trim()) {
            openclawId = cfg.openclawId.trim()
          }
        } catch { /* ignore */ }
      }

      const candidates = [openclawId, agent.name].filter(Boolean).map(s => normalize(s!))
      let matched: { status: 'active' | 'idle' | 'offline'; lastActivity: number; channel: string } | undefined

      for (const [sessionAgent, info] of liveStatuses) {
        if (candidates.includes(normalize(sessionAgent))) {
          matched = info
          break
        }
      }

      if (!matched || matched.status === 'offline') continue

      const now = Math.floor(Date.now() / 1000)
      const activity = `Gateway session (${matched.channel || 'unknown'})`
      update.run(matched.status, now, activity, now, agent.id)
      refreshed++

      eventBus.broadcast('agent.status_changed', {
        id: agent.id,
        name: agent.name,
        status: matched.status,
        last_seen: now,
        last_activity: activity,
      })
    }
  })()

  return refreshed
}

/** Initialize the scheduler */
export function initScheduler() {
  if (tickInterval) return // Already running

  // Auto-sync agents from openclaw.json on startup
  syncAgentsFromConfig('startup').catch(err => {
    logger.warn({ err }, 'Agent auto-sync failed')
  })

  // Register every task from the registry — setting gate, timing, and first-run
  // offset are all carried by the spec, so this loop cannot drift from the
  // ternary chains that previously duplicated them.
  const now = Date.now()
  for (const spec of SCHEDULED_TASKS) {
    tasks.set(spec.id, {
      name: spec.name,
      intervalMs: spec.intervalMs,
      lastRun: null,
      nextRun: now + spec.firstRunDelay(now),
      enabled: true,
      running: false,
    })
  }

  // Start the tick loop. unref() so this timer never keeps the event loop alive
  // on its own (PROC-2) — the server's own listeners hold the process; the
  // scheduler must not be the lone reason Node refuses to exit.
  tickInterval = setInterval(tick, TICK_MS)
  tickInterval.unref?.()
  logger.info('Scheduler initialized - backup at ~3AM, cleanup at ~4AM, heartbeat every 5m, webhook/claude/skill/local-agent/gateway-agent sync every 60s')
}

/** Calculate ms until next occurrence of a given hour (UTC) */
function getNextDailyMs(hour: number): number {
  const now = new Date()
  const next = new Date(now)
  next.setUTCHours(hour, 0, 0, 0)
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1)
  }
  return next.getTime() - now.getTime()
}

/** Check and run due tasks */
async function tick() {
  const now = Date.now()

  for (const [id, task] of tasks) {
    if (task.running || now < task.nextRun) continue

    const spec = SCHEDULED_TASKS.find(s => s.id === id)
    if (!spec) continue

    // Setting gate: skip if disabled in settings (falling back to defaultEnabled).
    if (!isSettingEnabled(spec.settingKey, spec.defaultEnabled)) continue

    task.running = true
    try {
      const result = await spec.handler({ manual: false })
      task.lastResult = { ...result, timestamp: now }
    } catch (err: any) {
      task.lastResult = { ok: false, message: err.message, timestamp: now }
    } finally {
      task.running = false
      task.lastRun = now
      task.nextRun = now + task.intervalMs
    }
  }
}

/** Get scheduler status (for API) */
export function getSchedulerStatus() {
  const result: Array<{
    id: string
    name: string
    enabled: boolean
    lastRun: number | null
    nextRun: number
    running: boolean
    lastResult?: { ok: boolean; message: string; timestamp: number }
  }> = []

  for (const [id, task] of tasks) {
    const spec = SCHEDULED_TASKS.find(s => s.id === id)
    if (!spec) continue
    result.push({
      id,
      name: task.name,
      enabled: isSettingEnabled(spec.settingKey, spec.defaultEnabled),
      lastRun: task.lastRun,
      nextRun: task.nextRun,
      running: task.running,
      lastResult: task.lastResult,
    })
  }

  return result
}

/** Manually trigger a scheduled task */
export async function triggerTask(taskId: string): Promise<{ ok: boolean; message: string }> {
  const spec = SCHEDULED_TASKS.find(s => s.id === taskId)
  if (!spec) return { ok: false, message: `Unknown task: ${taskId}` }
  const task = tasks.get(taskId)
  // Respect the same overlap guard tick() uses: never run a handler twice
  // concurrently (a manual POST must not race an in-flight tick). Also mirror
  // tick's try/catch so a rejecting handler returns the {ok:false} contract
  // instead of an unhandled rejection.
  if (task?.running) return { ok: false, message: `${taskId} is already running` }
  if (task) task.running = true
  try {
    const result = await spec.handler({ manual: true })
    if (task) task.lastResult = { ...result, timestamp: Date.now() }
    return result
  } catch (err: any) {
    return { ok: false, message: err?.message ?? String(err) }
  } finally {
    if (task) task.running = false
  }
}

/** Stop the scheduler */
export function stopScheduler() {
  if (tickInterval) {
    clearInterval(tickInterval)
    tickInterval = null
  }
}
