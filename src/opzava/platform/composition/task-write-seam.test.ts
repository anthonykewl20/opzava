import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runMigrations } from '@/lib/migrations'
import { createSqliteCardCreationPort } from './task-write-seam'

let db: Database.Database
let projectId: number

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
  projectId = Number(
    db
      .prepare(`INSERT INTO projects (workspace_id, name, slug, ticket_prefix) VALUES (1, 'Series B', 'series-b', 'SB')`)
      .run().lastInsertRowid,
  )
})

afterEach(() => db.close())

describe('createSqliteCardCreationPort', () => {
  it('creates a Card (task) with an allocated ticket number and stamped metadata', () => {
    const port = createSqliteCardCreationPort(db)
    const result = port.createCard({
      workspaceId: 1,
      title: 'Series B outreach sequence',
      description: 'Draft + send the follow-up',
      projectId,
      actor: 'admin',
      metadata: { opzava: { decompose: { needs: true, status: 'queued', conversationId: 'coord:admin:opzava', runId: 'run-1' } } },
      clientRequestId: 'launch:coord:admin:opzava:act-1',
    })
    expect(result.created).toBe(true)

    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.cardId) as {
      title: string
      project_id: number
      project_ticket_no: number
      created_by: string
      metadata: string
      client_request_id: string
    }
    expect(row.title).toBe('Series B outreach sequence')
    expect(row.project_id).toBe(projectId)
    expect(row.project_ticket_no).toBe(1) // allocated from the project ticket counter
    expect(row.created_by).toBe('admin')
    expect(JSON.parse(row.metadata)).toMatchObject({ opzava: { decompose: { needs: true, runId: 'run-1' } } })
  })

  it('is idempotent on clientRequestId — a duplicate launch returns the same card', () => {
    const port = createSqliteCardCreationPort(db)
    const first = port.createCard({ workspaceId: 1, title: 'X', projectId, actor: 'admin', metadata: {}, clientRequestId: 'launch:dup' })
    const second = port.createCard({ workspaceId: 1, title: 'X', projectId, actor: 'admin', metadata: {}, clientRequestId: 'launch:dup' })

    expect(second.cardId).toBe(first.cardId)
    expect(second.created).toBe(false)
    expect((db.prepare('SELECT COUNT(*) AS c FROM tasks').get() as { c: number }).c).toBe(1)
  })
})
