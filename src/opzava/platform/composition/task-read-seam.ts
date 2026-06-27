import Database from 'better-sqlite3'

/** Open vs total work-item counts for a project (inherited Engine-A `tasks`). */
export type TaskCounts = Readonly<{ open: number; total: number }>

/**
 * Composition-only read of inherited `tasks` (the sanctioned cross-engine
 * location). Consumer-driven: `countTasksByProject` is what the project card +
 * needs-you rollup need; by-id projections (todos/goals) accrete here later.
 */
export interface TaskReadSeam {
  /** Open (status != 'done') vs total tasks in a project. Absent table → zeros (degrade, never throw). */
  countTasksByProject(projectId: string): TaskCounts
}

export const NULL_TASK_READ_SEAM: TaskReadSeam = {
  countTasksByProject: () => ({ open: 0, total: 0 }),
}

function tableExists(db: Database.Database, name: string): boolean {
  return (
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
      .get(name) !== undefined
  )
}

export function createSqliteTaskReadSeam(db: Database.Database): TaskReadSeam {
  return {
    countTasksByProject(projectId) {
      if (!tableExists(db, 'tasks')) return { open: 0, total: 0 }
      const rows = db
        .prepare(
          'SELECT status, COUNT(*) AS c FROM tasks WHERE project_id = ? GROUP BY status',
        )
        .all(projectId) as Array<{ status: string; c: number }>
      let open = 0
      let total = 0
      for (const r of rows) {
        total += r.c
        if (r.status !== 'done') open += r.c
      }
      return { open, total }
    },
  }
}
