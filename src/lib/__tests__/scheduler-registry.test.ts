import { describe, expect, it } from 'vitest'

// Registry contract test: the scheduler previously hardcoded ~12 scheduled tasks
// inline in initScheduler (and re-derived their setting gates / handlers in both
// tick() and triggerTask()). The refactor moves that into a single internal
// registry that initScheduler iterates. This test pins the registry down so no
// task, setting gate, default-enabled flag, timing, or first-run offset is
// silently dropped or duplicated.

import {
  SCHEDULED_TASKS,
  getRegisteredTaskIds,
} from '../scheduler'

describe('scheduler registry', () => {
  it('exposes a non-empty registry of scheduled-task specs', () => {
    expect(Array.isArray(SCHEDULED_TASKS)).toBe(true)
    expect(SCHEDULED_TASKS.length).toBeGreaterThan(0)
  })

  it('every registered task id is unique', () => {
    const ids = SCHEDULED_TASKS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('getRegisteredTaskIds() mirrors the registry ids exactly', () => {
    const fromRegistry = SCHEDULED_TASKS.map((t) => t.id).sort()
    const fromHelper = getRegisteredTaskIds().sort()
    expect(fromHelper).toEqual(fromRegistry)
  })

  it('each spec carries the full registration shape', () => {
    for (const spec of SCHEDULED_TASKS) {
      expect(typeof spec.id).toBe('string')
      expect(spec.id.length).toBeGreaterThan(0)
      expect(typeof spec.name).toBe('string')
      expect(spec.name.length).toBeGreaterThan(0)
      expect(typeof spec.settingKey).toBe('string')
      expect(typeof spec.defaultEnabled).toBe('boolean')
      expect(typeof spec.intervalMs).toBe('number')
      expect(spec.intervalMs).toBeGreaterThan(0)
      // firstRunDelay is a resolver (now) => ms-until-first-run so the daily
      // tasks can compute their next-3AM/4AM offset. It must return a non-negative
      // duration bounded by the task's own interval.
      expect(typeof spec.firstRunDelay).toBe('function')
      const resolved = spec.firstRunDelay(Date.now())
      expect(resolved).toBeGreaterThanOrEqual(0)
      expect(resolved).toBeLessThanOrEqual(spec.intervalMs)
      expect(typeof spec.handler).toBe('function')
    }
  })

  it('registry covers exactly the previously-hardcoded tasks', () => {
    // These ids were each `tasks.set(...)` in the pre-refactor initScheduler.
    // Losing any one is a behavior regression (the API route's allow-list,
    // triggerTask, and the settings gates all depend on every id existing).
    // `wal_checkpoint` (MASTER-PLAN A0) is the one addition since.
    const expected = [
      'auto_backup',
      'auto_cleanup',
      'wal_checkpoint',
      'agent_heartbeat',
      'webhook_retry',
      'claude_session_scan',
      'skill_sync',
      'local_agent_sync',
      'gateway_agent_sync',
      'task_dispatch',
      'aegis_review',
      'recurring_task_spawn',
      'stale_task_requeue',
    ].sort()
    expect(getRegisteredTaskIds().sort()).toEqual(expected)
  })

  it('preserves the per-task setting gates and default-enabled flags', () => {
    const byId = new Map(SCHEDULED_TASKS.map((t) => [t.id, t]))
    // (settingKey, defaultEnabled) for every task — copied from the pre-refactor
    // ternary chains in tick() / getSchedulerStatus().
    const expected: Record<string, { settingKey: string; defaultEnabled: boolean }> = {
      auto_backup: { settingKey: 'general.auto_backup', defaultEnabled: false },
      auto_cleanup: { settingKey: 'general.auto_cleanup', defaultEnabled: false },
      wal_checkpoint: { settingKey: 'general.wal_checkpoint', defaultEnabled: true },
      agent_heartbeat: { settingKey: 'general.agent_heartbeat', defaultEnabled: true },
      webhook_retry: { settingKey: 'webhooks.retry_enabled', defaultEnabled: true },
      claude_session_scan: { settingKey: 'general.claude_session_scan', defaultEnabled: true },
      skill_sync: { settingKey: 'general.skill_sync', defaultEnabled: true },
      local_agent_sync: { settingKey: 'general.local_agent_sync', defaultEnabled: true },
      gateway_agent_sync: { settingKey: 'general.gateway_agent_sync', defaultEnabled: true },
      task_dispatch: { settingKey: 'general.task_dispatch', defaultEnabled: true },
      aegis_review: { settingKey: 'general.aegis_review', defaultEnabled: true },
      recurring_task_spawn: { settingKey: 'general.recurring_task_spawn', defaultEnabled: true },
      stale_task_requeue: { settingKey: 'general.stale_task_requeue', defaultEnabled: true },
    }
    for (const [id, want] of Object.entries(expected)) {
      const spec = byId.get(id)
      expect(spec, `missing task ${id}`).toBeDefined()
      expect(spec!.settingKey).toBe(want.settingKey)
      expect(spec!.defaultEnabled).toBe(want.defaultEnabled)
    }
  })

  it('preserves the per-task interval timing', () => {
    const byId = new Map(SCHEDULED_TASKS.map((t) => [t.id, t]))
    const DAILY = 24 * 60 * 60 * 1000
    const FIVE_MIN = 5 * 60 * 1000
    const TEN_MIN = 10 * 60 * 1000
    const TICK = 60 * 1000
    // auto_backup / auto_cleanup run daily; wal_checkpoint every 10m; agent_heartbeat
    // every 5m; the rest tick every 60s (claude_session_scan may be env-tuned but is >= TICK here).
    expect(byId.get('auto_backup')!.intervalMs).toBe(DAILY)
    expect(byId.get('auto_cleanup')!.intervalMs).toBe(DAILY)
    expect(byId.get('wal_checkpoint')!.intervalMs).toBe(TEN_MIN)
    expect(byId.get('agent_heartbeat')!.intervalMs).toBe(FIVE_MIN)
    for (const id of [
      'webhook_retry', 'skill_sync', 'local_agent_sync', 'gateway_agent_sync',
      'task_dispatch', 'aegis_review', 'recurring_task_spawn', 'stale_task_requeue',
    ]) {
      expect(byId.get(id)!.intervalMs).toBe(TICK)
    }
    // claude_session_scan interval is env-tunable (MC_CLAUDE_SCAN_INTERVAL_MS);
    // in the test env (unset) it must resolve to the TICK default.
    expect(byId.get('claude_session_scan')!.intervalMs).toBe(TICK)
  })
})
