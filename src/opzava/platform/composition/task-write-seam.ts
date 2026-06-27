import type Database from 'better-sqlite3'

// Composition-only WRITE into inherited Engine-A `tasks` — the sanctioned cross-engine write seam,
// peer of task-read-seam.ts. The conversations module (Engine B) launches fleet work through this
// port; it never SQLs `tasks` nor imports `src/lib`. Reproduces the POST /api/tasks idempotency
// (client_request_id) + per-project ticket allocation so a chat-launched Card is indistinguishable
// from a UI-created one. (A Card IS a task — no opzava_card table; ARD 0013 D1.)

export interface CardCreationInput {
  readonly workspaceId: number
  readonly title: string
  readonly description?: string | null
  readonly projectId: number
  readonly assignedTo?: string | null
  readonly actor: string
  readonly metadata: Record<string, unknown>
  /** Idempotency key — a duplicate launch returns the same Card (partial unique idx_tasks_client_request_id). */
  readonly clientRequestId: string
}

export interface CardCreationResult {
  readonly cardId: number
  /** false ⇒ a Card already existed for this clientRequestId (idempotent no-op). */
  readonly created: boolean
}

export interface CardCreationPort {
  createCard(input: CardCreationInput): CardCreationResult
}

export function createSqliteCardCreationPort(db: Database.Database): CardCreationPort {
  return {
    createCard(input) {
      const existing = db
        .prepare('SELECT id FROM tasks WHERE workspace_id = ? AND client_request_id = ?')
        .get(input.workspaceId, input.clientRequestId) as { id: number } | undefined
      if (existing) return { cardId: existing.id, created: false }

      const create = db.transaction((): number => {
        db.prepare(
          `UPDATE projects SET ticket_counter = ticket_counter + 1, updated_at = unixepoch()
           WHERE id = ? AND workspace_id = ?`,
        ).run(input.projectId, input.workspaceId)
        const row = db
          .prepare('SELECT ticket_counter FROM projects WHERE id = ? AND workspace_id = ?')
          .get(input.projectId, input.workspaceId) as { ticket_counter: number } | undefined
        if (!row || !row.ticket_counter) throw new Error('Failed to allocate project ticket number')

        const result = db
          .prepare(
            `INSERT INTO tasks
               (title, description, status, priority, project_id, project_ticket_no, assigned_to, created_by,
                created_at, updated_at, metadata, workspace_id, client_request_id)
             VALUES (?, ?, 'inbox', 'medium', ?, ?, ?, ?, unixepoch(), unixepoch(), ?, ?, ?)`,
          )
          .run(
            input.title,
            input.description ?? null,
            input.projectId,
            row.ticket_counter,
            input.assignedTo ?? null,
            input.actor,
            JSON.stringify(input.metadata),
            input.workspaceId,
            input.clientRequestId,
          )
        return Number(result.lastInsertRowid)
      })

      try {
        return { cardId: create(), created: true }
      } catch (err) {
        // Lost a concurrent race on the client_request_id unique index → return the winner.
        const winner = db
          .prepare('SELECT id FROM tasks WHERE workspace_id = ? AND client_request_id = ?')
          .get(input.workspaceId, input.clientRequestId) as { id: number } | undefined
        if (winner) return { cardId: winner.id, created: false }
        throw err
      }
    },
  }
}
