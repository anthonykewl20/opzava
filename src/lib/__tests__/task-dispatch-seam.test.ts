import { describe, expect, it, vi } from 'vitest'

// These tests exercise the task-dispatch orchestrators at their public interface
// through the dependency-injected `deps` seam. They use NO `vi.mock` of
// task-dispatch internals — instead each orchestrator receives a deps-literal
// (a fake db + stubbed side-effects) built by the hoisted `makeFakeDeps`
// helper. This is the "test deps-literal adapter" that makes the seam REAL,
// per DEEPENING.md: behavior-preserving, no layering on top of mocks.

import {
  dispatchAssignedTasks,
  runAegisReviews,
  requeueStaleTasks,
  autoRouteInboxTasks,
  reconcileDeferredTaskCompletions,
  extractDeferredCompletionText,
  type TaskDispatchDeps,
} from '../task-dispatch'

/**
 * A single shared fake-db builder. Every orchestrator gets a fresh statement
 * router seeded with the rows it needs. The router discriminates purely on the
 * SQL text, so each orchestrator's distinct queries map to deterministic
 * results without any module-level mocking.
 */
interface FakeDbState {
  // Lookups match if the registered marker is a substring of the prepared SQL.
  // This keeps each orchestrator's distinct query on a deterministic result
  // even when the SQL is built dynamically (e.g. the reconcile SELECT), while
  // still failing loudly if a query drifts past every registered marker.
  rowsBySql: Map<string, (...args: unknown[]) => unknown>
  runBySql: Map<string, (...args: unknown[]) => { changes: number }>
  // Captured writes across all statements, keyed by normalized SQL marker.
  writes: Array<{ sql: string; args: unknown[] }>
}

function lookup<T>(map: Map<string, T>, sql: string): T | undefined {
  for (const [marker, impl] of map) {
    if (sql.includes(marker)) return impl
  }
  return undefined
}

function makeFakeDb(state: FakeDbState) {
  return {
    prepare: (sql: string) => {
      const allImpl = lookup(state.rowsBySql, sql)
      const getImpl = lookup(state.rowsBySql, sql)
      const runImpl = lookup(state.runBySql, sql)
      return {
        all: (...args: unknown[]) => {
          state.writes.push({ sql, args })
          return typeof allImpl === 'function' ? (allImpl as (...a: unknown[]) => unknown[])(...args) : []
        },
        get: (...args: unknown[]) => {
          state.writes.push({ sql, args })
          return typeof getImpl === 'function' ? (getImpl as (...a: unknown[]) => unknown)(...args) : undefined
        },
        run: (...args: unknown[]) => {
          state.writes.push({ sql, args })
          if (typeof runImpl === 'function') return runImpl(...args)
          return { changes: 1 }
        },
      }
    },
    transaction: (fn: (arg?: unknown) => unknown) => (arg?: unknown) => fn(arg),
  }
}

/** Build a full deps-literal with stubbed side effects. Callers override db. */
function makeFakeDeps(overrides: {
  dbState?: FakeDbState
  gateway?: TaskDispatchDeps['gateway']
  isGatewayAvailable?: () => boolean
  isDirectDispatchAvailable?: (provider?: string) => boolean
  dispatchDirect?: TaskDispatchDeps['dispatchDirect']
  recoverCompletionText?: TaskDispatchDeps['recoverCompletionText']
  clock?: Partial<TaskDispatchDeps['clock']>
} = {}): { deps: TaskDispatchDeps; state: FakeDbState; broadcasts: Array<{ type: string; payload: unknown }>; activities: unknown[] } {
  const state: FakeDbState = overrides.dbState ?? {
    rowsBySql: new Map(),
    runBySql: new Map(),
    writes: [],
  }
  const broadcasts: Array<{ type: string; payload: unknown }> = []
  const activities: unknown[] = []
  const fixedTime = 1_700_000_000
  const deps: TaskDispatchDeps = {
    db: makeFakeDb(state) as TaskDispatchDeps['db'],
    broadcast: (type, payload) => { broadcasts.push({ type, payload }) },
    logActivity: (...args: unknown[]) => { activities.push(args) },
    clock: {
      now: () => fixedTime,
      nowMs: () => fixedTime * 1000,
      ...(overrides.clock ?? {}),
    },
    gateway: overrides.gateway ?? (vi.fn() as unknown as TaskDispatchDeps['gateway']),
    isGatewayAvailable: overrides.isGatewayAvailable ?? (() => false),
    isDirectDispatchAvailable: overrides.isDirectDispatchAvailable ?? (() => false),
    dispatchDirect: overrides.dispatchDirect ?? (vi.fn() as unknown as TaskDispatchDeps['dispatchDirect']),
    recoverCompletionText: overrides.recoverCompletionText ?? (() => null),
  }
  return { deps, state, broadcasts, activities }
}

describe('autoRouteInboxTasks (deps seam)', () => {
  it('routes an inbox task to the best-scoring available agent', async () => {
    const { deps, state, broadcasts, activities } = makeFakeDeps({
      isGatewayAvailable: () => true,
    })
    const inboxTasks = [{
      id: 1, title: 'Fix the login bug', description: 'debug the auth flow',
      priority: 'high', tags: null, workspace_id: 1,
    }]
    const agents = [
      { id: 1, name: 'coder-bot', role: 'coder', status: 'idle', config: null },
      { id: 2, name: 'writer-bot', role: 'assistant', status: 'idle', config: null },
    ]
    // SELECT inbox tasks
    state.rowsBySql.set(
      inboxSelectSql(), () => inboxTasks,
    )
    // SELECT available agents
    state.rowsBySql.set(
      agentsSelectSql(), () => agents,
    )
    // capacity check COUNT(*) -> 0
    state.rowsBySql.set(
      capacityCountSql(), () => ({ c: 0 }),
    )
    // UPDATE inbox -> assigned
    state.runBySql.set(
      'UPDATE tasks SET status = ?, assigned_to = ?, updated_at = ? WHERE id = ?',
      () => ({ changes: 1 }),
    )

    const result = await autoRouteInboxTasks(deps)

    expect(result).toEqual({ ok: true, message: 'Auto-routed 1/1 inbox task(s)' })
    // coder-bot matches "fix"/"bug" keywords; should win over writer-bot
    const assigned = state.writes.find(w => w.sql.includes('UPDATE tasks SET status = ?, assigned_to'))
    expect(assigned?.args[1]).toBe('coder-bot')
    expect(broadcasts.some(b => b.type === 'task.status_changed' && (b.payload as any).assigned_to === 'coder-bot')).toBe(true)
    expect(activities).toHaveLength(1)
  })

  it('reports no inbox tasks when the table is empty', async () => {
    const { deps } = makeFakeDeps()
    const result = await autoRouteInboxTasks(deps)
    expect(result).toEqual({ ok: true, message: 'No inbox tasks to route' })
  })
})

describe('requeueStaleTasks (deps seam)', () => {
  it('requeues a stale in_progress task when its agent is offline', async () => {
    const { deps, state, broadcasts } = makeFakeDeps({
      isGatewayAvailable: () => true,
      isDirectDispatchAvailable: () => false,
    })
    const staleTasks = [{
      id: 5, title: 'Stuck task', assigned_to: 'ghost-agent', dispatch_attempts: 1,
      workspace_id: 1, agent_status: 'offline', agent_last_seen: null,
    }]
    state.rowsBySql.set(staleSelectSql(), () => staleTasks)
    state.runBySql.set(
      'UPDATE tasks SET status = ?, error_message = ?, dispatch_attempts = ?, updated_at = ? WHERE id = ?',
      () => ({ changes: 1 }),
    )
    state.runBySql.set(
      "INSERT INTO comments (task_id, author, content, created_at, workspace_id)\n        VALUES (?, 'scheduler', ?, ?, ?)",
      () => ({ changes: 1 }),
    )

    const result = await requeueStaleTasks(deps)

    expect(result.message).toContain('Requeued 1')
    expect(broadcasts.some(b => b.type === 'task.status_changed' && (b.payload as any).status === 'assigned')).toBe(true)
  })

  it('fails a task that has hit the max retries while offline', async () => {
    const { deps, state, broadcasts } = makeFakeDeps({
      isGatewayAvailable: () => true,
      isDirectDispatchAvailable: () => false,
    })
    const staleTasks = [{
      id: 6, title: 'Doomed task', assigned_to: 'ghost-agent', dispatch_attempts: 5,
      workspace_id: 1, agent_status: 'offline', agent_last_seen: null,
    }]
    state.rowsBySql.set(staleSelectSql(), () => staleTasks)
    state.runBySql.set(
      'UPDATE tasks SET status = ?, error_message = ?, dispatch_attempts = ?, updated_at = ? WHERE id = ?',
      () => ({ changes: 1 }),
    )

    const result = await requeueStaleTasks(deps)

    expect(result.message).toContain('failed 1')
    expect(broadcasts.some(b => (b.payload as any).status === 'failed')).toBe(true)
  })

  it('skips stale check entirely in direct-API mode (no gateway)', async () => {
    const { deps, state, broadcasts } = makeFakeDeps({
      isGatewayAvailable: () => false,
      isDirectDispatchAvailable: () => true,
    })
    state.rowsBySql.set(staleSelectSql(), () => [{
      id: 7, title: 'Direct mode task', assigned_to: 'direct-agent', dispatch_attempts: 0,
      workspace_id: 1, agent_status: 'offline', agent_last_seen: null,
    }])

    const result = await requeueStaleTasks(deps)

    expect(result.message).toContain('agents still online')
    expect(broadcasts).toHaveLength(0)
  })

  it('reports no stale tasks when table is empty', async () => {
    const { deps } = makeFakeDeps()
    const result = await requeueStaleTasks(deps)
    expect(result).toEqual({ ok: true, message: 'No stale tasks found' })
  })
})

describe('runAegisReviews (deps seam)', () => {
  it('approves a reviewable task via direct dispatch and marks it done', async () => {
    const { deps, state, broadcasts, activities } = makeFakeDeps({
      isGatewayAvailable: () => false,
      isDirectDispatchAvailable: () => true,
      dispatchDirect: (() => Promise.resolve({
        text: 'VERDICT: APPROVED\nNOTES: Looks good.',
        sessionId: null,
      })) as TaskDispatchDeps['dispatchDirect'],
    })
    const reviewTasks = [{
      id: 9, title: 'Done task', description: 'Built the feature', status: 'review',
      priority: 'medium', resolution: 'Implemented it.', assigned_to: 'coder-bot',
      agent_config: null, workspace_id: 1, project_id: null,
      ticket_prefix: null, project_ticket_no: null,
    }]
    state.rowsBySql.set(reviewSelectSql(), () => reviewTasks)
    // UPDATE review -> quality_review (and later quality_review -> done) share
    // the same SQL text 'UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?'
    state.runBySql.set(
      'UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?',
      () => ({ changes: 1 }),
    )
    // INSERT quality_reviews
    state.runBySql.set(
      "INSERT INTO quality_reviews (task_id, reviewer, status, notes, workspace_id)\n        VALUES (?, 'aegis', ?, ?, ?)",
      () => ({ changes: 1 }),
    )

    const result = await runAegisReviews(deps)

    expect(result.message).toContain('approved')
    // Final task status broadcasted to done
    expect(broadcasts.some(b => (b.payload as any).status === 'done')).toBe(true)
    expect(activities).toHaveLength(1)
  })

  it('rejects and requeues a task below max retries', async () => {
    const { deps, state, broadcasts } = makeFakeDeps({
      isGatewayAvailable: () => false,
      isDirectDispatchAvailable: () => true,
      dispatchDirect: (() => Promise.resolve({
        text: 'VERDICT: REJECTED\nNOTES: Missing tests.', sessionId: null,
      })) as TaskDispatchDeps['dispatchDirect'],
    })
    const reviewTasks = [{
      id: 10, title: 'Flawed task', description: 'Incomplete work', status: 'review',
      priority: 'medium', resolution: 'Partial.', assigned_to: 'coder-bot',
      agent_config: null, workspace_id: 1, project_id: null,
      ticket_prefix: null, project_ticket_no: null,
    }]
    state.rowsBySql.set(reviewSelectSql(), () => reviewTasks)
    state.runBySql.set(
      'UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?',
      () => ({ changes: 1 }),
    )
    state.rowsBySql.set(
      'SELECT dispatch_attempts FROM tasks WHERE id = ?',
      () => ({ dispatch_attempts: 1 }),
    )
    state.runBySql.set(
      'UPDATE tasks SET status = ?, error_message = ?, dispatch_attempts = ?, updated_at = ? WHERE id = ?',
      () => ({ changes: 1 }),
    )
    state.runBySql.set(
      "INSERT INTO comments (task_id, author, content, created_at, workspace_id)\n        VALUES (?, 'aegis', ?, ?, ?)",
      () => ({ changes: 1 }),
    )

    const result = await runAegisReviews(deps)

    expect(result.message).toContain('rejected')
    expect(broadcasts.some(b => (b.payload as any).status === 'assigned')).toBe(true)
  })

  it('reports no tasks when review table is empty', async () => {
    const { deps } = makeFakeDeps()
    const result = await runAegisReviews(deps)
    expect(result).toEqual({ ok: true, message: 'No tasks awaiting review' })
  })
})

describe('reconcileDeferredTaskCompletions (deps seam)', () => {
  it('uses injected clock.now() for the promoted_at timestamp', async () => {
    const clockNow = vi.fn(() => 9_999_999)
    const { deps, state } = makeFakeDeps({
      clock: { now: clockNow, nowMs: () => 9_999_999_000 },
    })
    const tasks = [{
      id: 20, title: 'Deferred', assigned_to: 'agent-one',
      metadata: JSON.stringify({ async_state: 'pending', dispatch_run_id: 'run-20' }),
      workspace_id: 1, ticket_prefix: null, project_ticket_no: null,
    }]
    state.rowsBySql.set(deferredSelectSql(), () => tasks)
    state.runBySql.set(deferredUpdateToReviewSql(), (...args: unknown[]) => {
      // capture the updated_at arg (index 2) — must equal deps.clock.now()
      capturedUpdatedAt.push(args[2] as number)
      return { changes: 1 }
    })
    state.runBySql.set(deferredCommentInsertSql(), () => ({ changes: 1 }))
    const capturedUpdatedAt: number[] = []

    const waitForRun = vi.fn(async () => ({ complete: true, text: 'Done text.' }))

    const result = await reconcileDeferredTaskCompletions(deps, { waitForRun })

    expect(result.promoted).toBe(1)
    expect(clockNow).toHaveBeenCalled()
    expect(capturedUpdatedAt[0]).toBe(9_999_999)
  })

  it('promotes a completed run using recovered transcript text via deps.recoverCompletionText', async () => {
    const { deps, state } = makeFakeDeps({
      recoverCompletionText: (() => 'Recovered via deps.') as TaskDispatchDeps['recoverCompletionText'],
    })
    const tasks = [{
      id: 21, title: 'Deferred no-wait-text', assigned_to: 'agent-one',
      metadata: JSON.stringify({ async_state: 'pending', dispatch_run_id: 'run-21' }),
      workspace_id: 1, ticket_prefix: null, project_ticket_no: null,
    }]
    state.rowsBySql.set(deferredSelectSql(), () => tasks)
    state.runBySql.set(deferredUpdateToReviewSql(), () => ({ changes: 1 }))
    state.runBySql.set(deferredCommentInsertSql(), () => ({ changes: 1 }))

    const waitForRun = vi.fn(async () => ({ complete: true, text: null }))

    const result = await reconcileDeferredTaskCompletions(deps, { waitForRun })

    expect(result.promoted).toBe(1)
    const update = state.writes.find(w => w.sql.includes("status = 'review'"))
    // The resolution written should be the deps-recovered text.
    expect(update?.args[0]).toBe('Recovered via deps.')
  })
})

describe('dispatchAssignedTasks (deps seam)', () => {
  it('claims and dispatches an assigned task via gateway into a pending deferred run', async () => {
    const { deps, state, broadcasts } = makeFakeDeps({
      isGatewayAvailable: () => true,
      isDirectDispatchAvailable: () => false,
      gateway: (vi.fn(async () => ({
        status: 'accepted',
        runId: 'run-100',
        sessionId: 'session-100',
      })) as unknown) as TaskDispatchDeps['gateway'],
    })
    const tasks = [{
      id: 100, title: 'Gateway task', description: 'Do work', status: 'assigned',
      priority: 'high', assigned_to: 'Arnold', workspace_id: 1,
      agent_name: 'Arnold', agent_id: 1, agent_config: null,
      ticket_prefix: null, project_ticket_no: null, project_id: null,
      tags: null, metadata: '{}',
    }]
    state.rowsBySql.set(assignedSelectSql(), () => tasks)
    state.runBySql.set(
      "UPDATE tasks SET status = ?, updated_at = ? WHERE id = ? AND status = 'assigned'",
      () => ({ changes: 1 }),
    )
    state.rowsBySql.set(
      "SELECT content FROM comments\n        WHERE task_id = ? AND author = 'aegis' AND content LIKE 'Quality Review Rejected:%'\n        ORDER BY created_at DESC LIMIT 1",
      () => undefined,
    )
    state.rowsBySql.set(
      'SELECT metadata FROM tasks WHERE id = ?',
      () => ({ metadata: '{}' }),
    )
    state.runBySql.set(
      'UPDATE tasks SET metadata = ?, updated_at = ? WHERE id = ?',
      () => ({ changes: 1 }),
    )

    const result = await dispatchAssignedTasks(deps)

    expect(result.ok).toBe(true)
    const metaUpdate = state.writes.filter(w => w.sql === 'UPDATE tasks SET metadata = ?, updated_at = ? WHERE id = ?')
    expect(metaUpdate).toHaveLength(1)
    const writtenMeta = JSON.parse(metaUpdate[0].args[0] as string)
    expect(writtenMeta).toMatchObject({
      dispatch_run_id: 'run-100',
      dispatch_session_id: 'session-100',
      async_state: 'pending',
    })
    expect(broadcasts.some(b => b.type === 'task.updated' && (b.payload as any).dispatch_run_id === 'run-100')).toBe(true)
  })

  it('reports no assigned tasks when the table is empty', async () => {
    const { deps } = makeFakeDeps()
    const result = await dispatchAssignedTasks(deps)
    expect(result).toEqual({ ok: true, message: 'No assigned tasks to dispatch' })
  })
})

describe('extractDeferredCompletionText (pure, retained)', () => {
  it('extracts from result.payloads', () => {
    expect(extractDeferredCompletionText({ status: 'completed', result: { payloads: [{ text: 'Hi.' }] } })).toBe('Hi.')
  })
})

// ---------------------------------------------------------------------------
// SQL discriminators — distinctive substrings of each orchestrator's query.
// The fake-db matches on `sql.includes(marker)`, so each query lands on a
// deterministic result. Markers are chosen to be unique within their
// orchestrator; if a query drifts past every marker the test fails loudly
// rather than silently matching the wrong statement.
// ---------------------------------------------------------------------------

function inboxSelectSql(): string { return "WHERE status = 'inbox' AND assigned_to IS NULL" }
function agentsSelectSql(): string { return 'FROM agents\n    WHERE hidden = 0' }
function capacityCountSql(): string { return "status = 'in_progress' AND workspace_id" }
function staleSelectSql(): string { return 'a.status as agent_status, a.last_seen as agent_last_seen' }
function reviewSelectSql(): string { return "WHERE t.status = 'review'" }
function deferredSelectSql(): string { return "AND t.metadata LIKE '%\"pending\"%'" }
function deferredUpdateToReviewSql(): string { return "SET status = 'review'," }
function deferredCommentInsertSql(): string { return 'INSERT INTO comments (task_id, author, content, created_at, workspace_id)\n      VALUES (?, ?, ?, ?, ?)' }
function assignedSelectSql(): string { return "WHERE t.status = 'assigned'\n      AND t.assigned_to IS NOT NULL" }
function reviewRejectCommentSql(): string { return "VALUES (?, 'aegis', ?, ?, ?)" }
function staleRequeueCommentSql(): string { return "VALUES (?, 'scheduler', ?, ?, ?)" }
