import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runMigrations } from '@/lib/migrations'
import {
  projectHealthFromSignals,
  computeNeedsYouRollup,
  createSqliteNeedsYouRollupReader,
} from './needs-you-rollup'

// doc 100 T1 — deterministic signal membership (no invented thresholds), honest floor:
// blocked > needs_you (disjoint health facet); activity deferred to 'idle' until runner↔project
// linkage. needs_you = tasks ∈{review,quality_review} OR an overdue open task.

describe('ProjectHealth signal membership (doc 100 T1)', () => {
  it('flags needs_you when a project has a task in review', () => {
    const h = projectHealthFromSignals({
      projectId: 'p1',
      reviewCount: 1,
      overdueOpenCount: 0,
      openCount: 3,
      blockedByTool: false,
    })
    expect(h.health).toBe('needs_you')
    expect(h.displayLabel).toBe('needs_you')
  })

  it('flags needs_you when a project has an overdue open task', () => {
    const h = projectHealthFromSignals({
      projectId: 'p1',
      reviewCount: 0,
      overdueOpenCount: 2,
      openCount: 4,
      blockedByTool: false,
    })
    expect(h.health).toBe('needs_you')
  })

  it('reports no health and an idle activity floor when nothing needs you', () => {
    const h = projectHealthFromSignals({
      projectId: 'p1',
      reviewCount: 0,
      overdueOpenCount: 0,
      openCount: 5,
      blockedByTool: false,
    })
    expect(h.health).toBeNull()
    expect(h.activity).toBe('idle')
    expect(h.displayLabel).toBe('idle')
  })

  it('blocked takes precedence over needs_you in the health facet', () => {
    const h = projectHealthFromSignals({
      projectId: 'p1',
      reviewCount: 3,
      overdueOpenCount: 1,
      openCount: 6,
      blockedByTool: true,
    })
    expect(h.health).toBe('blocked')
    expect(h.displayLabel).toBe('blocked')
  })
})

describe('NeedsYouRollup (cross-project, disjoint counts)', () => {
  const health = (projectId: string, s: Partial<Parameters<typeof projectHealthFromSignals>[0]> = {}) =>
    projectHealthFromSignals({ projectId, reviewCount: 0, overdueOpenCount: 0, openCount: 0, blockedByTool: false, ...s })

  it('tallies needs_you and blocked as disjoint counts', () => {
    const rollup = computeNeedsYouRollup([
      health('p1', { reviewCount: 1 }), // needs_you
      health('p2', { blockedByTool: true, reviewCount: 1 }), // blocked (NOT double-counted as needs_you)
      health('p3'), // clear
      health('p4', { overdueOpenCount: 1 }), // needs_you
    ])
    expect(rollup.needsYou).toBe(2)
    expect(rollup.blocked).toBe(1)
    expect(rollup.projects).toHaveLength(4)
  })

  it('reports zeros when every project is clear', () => {
    const rollup = computeNeedsYouRollup([health('p1'), health('p2')])
    expect(rollup.needsYou).toBe(0)
    expect(rollup.blocked).toBe(0)
  })
})

describe('createSqliteNeedsYouRollupReader (reads tasks, the entity with project_id)', () => {
  let db: Database.Database
  let p1: number
  let p2: number
  let p3: number

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
    const proj = db.prepare(
      `INSERT INTO projects (workspace_id, name, slug, ticket_prefix) VALUES (1, ?, ?, ?)`,
    )
    p1 = Number(proj.run('Series B', 'series-b', 'SB').lastInsertRowid)
    p2 = Number(proj.run('Q2 Content', 'q2-content', 'QC').lastInsertRowid)
    p3 = Number(proj.run('Calm Project', 'calm', 'CP').lastInsertRowid)
    const task = db.prepare(
      `INSERT INTO tasks (title, status, project_id, workspace_id, due_date) VALUES (?, ?, ?, 1, ?)`,
    )
    task.run('review me', 'review', p1, null) // p1 → needs_you (review)
    task.run('overdue', 'in_progress', p2, 500) // p2 → needs_you (overdue: 500 < now 1000)
    task.run('on time', 'in_progress', p3, 2000) // p3 → clear (not overdue)
  })

  afterEach(() => db.close())

  it('rolls up needs_you across projects from real task signals', () => {
    const reader = createSqliteNeedsYouRollupReader(db, { now: () => 1000 })
    const rollup = reader.read(1)
    expect(rollup.needsYou).toBe(2)
    expect(rollup.blocked).toBe(0)
    const find = (id: number) => rollup.projects.find((p) => p.projectId === String(id))
    expect(find(p1)?.health).toBe('needs_you')
    expect(find(p2)?.health).toBe('needs_you')
    expect(find(p3)?.health).toBeNull() // clear projects are still listed
  })

  it('degrades to an empty rollup when the tasks table is absent (never throws)', () => {
    const bare = new Database(':memory:')
    const rollup = createSqliteNeedsYouRollupReader(bare).read(1)
    expect(rollup).toEqual({ needsYou: 0, blocked: 0, projects: [] })
    bare.close()
  })
})
