import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runMigrations } from '@/lib/migrations'
import { makeTaskKanban } from './kanban'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
})

afterEach(() => {
  db.close()
})

interface SeedTask {
  status?: string
  workspaceId?: number
  assignedTo?: string | null
  accountProfile?: string | null
  claimedAt?: number | null
  priority?: string
  title?: string
}

function seedTask(t: SeedTask = {}): number {
  const info = db
    .prepare(
      `INSERT INTO tasks (title, status, priority, assigned_to, workspace_id, account_profile, claimed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      t.title ?? 'a task',
      t.status ?? 'assigned',
      t.priority ?? 'medium',
      t.assignedTo ?? null,
      t.workspaceId ?? 1,
      t.accountProfile ?? null,
      t.claimedAt ?? null,
    )
  return Number(info.lastInsertRowid)
}

function statusOf(id: number): string {
  return (db.prepare('SELECT status FROM tasks WHERE id = ?').get(id) as { status: string }).status
}

describe('TaskKanban spine', () => {
  it('claims an eligible task from→to and stamps the lease', () => {
    const id = seedTask({ status: 'assigned' })
    const kanban = makeTaskKanban(db, () => 1000)

    const results = kanban.claimNext({ from: ['assigned'], to: 'in_progress', workspaceId: 1 })

    expect(results).toHaveLength(1)
    expect(results[0].kind).toBe('claimed')
    if (results[0].kind === 'claimed') {
      expect(results[0].task.id).toBe(id)
      expect(results[0].task.status).toBe('in_progress')
      expect(results[0].task.claimedAt).toBe(1000)
    }
    expect(statusOf(id)).toBe('in_progress')
  })

  it('returns empty when no row matches the predicate', () => {
    seedTask({ status: 'done' })
    const kanban = makeTaskKanban(db, () => 1000)
    const results = kanban.claimNext({ from: ['assigned'], to: 'in_progress', workspaceId: 1 })
    expect(results).toEqual([{ kind: 'empty' }])
  })

  it('claims under an account cap and stamps account_profile', () => {
    seedTask({ status: 'in_progress', accountProfile: 'anthropic:max' }) // 1 in-flight
    const id = seedTask({ status: 'assigned' })
    const kanban = makeTaskKanban(db, () => 1000)

    const results = kanban.claimNext({
      from: ['assigned'],
      to: 'in_progress',
      workspaceId: 1,
      capacity: { accountProfile: 'anthropic:max', workspaceId: 1, cap: 3 },
    })

    expect(results[0].kind).toBe('claimed')
    const acct = (db.prepare('SELECT account_profile FROM tasks WHERE id = ?').get(id) as { account_profile: string }).account_profile
    expect(acct).toBe('anthropic:max')
  })

  it('refuses to claim when the account is at capacity (task untouched)', () => {
    seedTask({ status: 'in_progress', accountProfile: 'anthropic:max' })
    seedTask({ status: 'in_progress', accountProfile: 'anthropic:max' }) // 2 in-flight
    const id = seedTask({ status: 'assigned' })
    const kanban = makeTaskKanban(db, () => 1000)

    const results = kanban.claimNext({
      from: ['assigned'],
      to: 'in_progress',
      workspaceId: 1,
      capacity: { accountProfile: 'anthropic:max', workspaceId: 1, cap: 2 },
    })

    expect(results).toEqual([{ kind: 'failed', reason: 'at_cap' }])
    expect(statusOf(id)).toBe('assigned') // not claimed
  })

  it('counts the just-claimed row toward the cap (atomic, no overshoot)', () => {
    seedTask({ status: 'in_progress', accountProfile: 'anthropic:max' }) // 1 in-flight
    seedTask({ status: 'assigned' })
    seedTask({ status: 'assigned' })
    const kanban = makeTaskKanban(db, () => 1000)
    const cap = { accountProfile: 'anthropic:max', workspaceId: 1, cap: 2 }

    const first = kanban.claimNext({ from: ['assigned'], to: 'in_progress', workspaceId: 1, capacity: cap })
    expect(first[0].kind).toBe('claimed') // count was 1 < 2 → claims, now 2 in-flight

    const second = kanban.claimNext({ from: ['assigned'], to: 'in_progress', workspaceId: 1, capacity: cap })
    expect(second).toEqual([{ kind: 'failed', reason: 'at_cap' }]) // count is now 2, not < 2
  })

  it('counts quality_review rows as in-flight toward the cap', () => {
    seedTask({ status: 'quality_review', accountProfile: 'anthropic:max' }) // holds a slot
    const id = seedTask({ status: 'assigned' })
    const kanban = makeTaskKanban(db, () => 1000)

    const results = kanban.claimNext({
      from: ['assigned'],
      to: 'in_progress',
      workspaceId: 1,
      capacity: { accountProfile: 'anthropic:max', workspaceId: 1, cap: 1 },
    })

    expect(results).toEqual([{ kind: 'failed', reason: 'at_cap' }])
    expect(statusOf(id)).toBe('assigned')
  })

  it('transition wins when the current status matches and applies the patch', () => {
    const id = seedTask({ status: 'in_progress' })
    const kanban = makeTaskKanban(db, () => 2000)
    const result = kanban.transition(id, 'in_progress', 'review', { actual_hours: 5 })
    expect(result).toEqual({ result: 'won' })
    expect(statusOf(id)).toBe('review')
    const hrs = (db.prepare('SELECT actual_hours FROM tasks WHERE id = ?').get(id) as { actual_hours: number }).actual_hours
    expect(hrs).toBe(5)
  })

  it('transition loses (no-op) when the current status does not match', () => {
    const id = seedTask({ status: 'in_progress' })
    const kanban = makeTaskKanban(db, () => 2000)
    const result = kanban.transition(id, 'assigned', 'review')
    expect(result).toEqual({ result: 'lost' })
    expect(statusOf(id)).toBe('in_progress') // untouched
  })

  it('touchLease refreshes claimed_at', () => {
    const id = seedTask({ status: 'in_progress', claimedAt: 100 })
    const kanban = makeTaskKanban(db, () => 2000)
    kanban.touchLease(id)
    const c = (db.prepare('SELECT claimed_at FROM tasks WHERE id = ?').get(id) as { claimed_at: number }).claimed_at
    expect(c).toBe(2000)
  })

  it('reclaimExpiredLeases reclaims stale in_progress AND quality_review, clearing the lease', () => {
    const stale = seedTask({ status: 'in_progress', claimedAt: 100 })
    const fresh = seedTask({ status: 'in_progress', claimedAt: 5000 })
    const staleReview = seedTask({ status: 'quality_review', claimedAt: 100 })
    const kanban = makeTaskKanban(db, () => 9000)

    const reclaimed = kanban.reclaimExpiredLeases({
      workspaceId: 1,
      statuses: ['in_progress', 'quality_review'],
      staleAfter: 1000,
      to: 'assigned',
    })

    expect(reclaimed.map((r) => r.taskId).sort()).toEqual([stale, staleReview].sort())
    expect(statusOf(stale)).toBe('assigned')
    expect(statusOf(staleReview)).toBe('assigned')
    expect(statusOf(fresh)).toBe('in_progress') // within lease — untouched
    const clearedLease = db.prepare('SELECT claimed_at FROM tasks WHERE id = ?').get(stale) as { claimed_at: number | null }
    expect(clearedLease.claimed_at).toBeNull()
  })
})
