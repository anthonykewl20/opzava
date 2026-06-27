import Database from 'better-sqlite3'

/**
 * By-value projection of an inherited Engine-A `projects` row. Composition-only
 * (the sanctioned cross-engine read location, peer of platform/costs) — Engine-B
 * modules consume this interface, never the SQL.
 */
export type ProjectProjection = Readonly<{
  name: string
  color: string | null
  description: string | null
}>

export interface ProjectReadSeam {
  /** Batch by-value read of inherited projects. Unknown ids → undefined (degrade, never throw). */
  readProjectsByIds(
    ids: readonly string[],
  ): Readonly<Record<string, ProjectProjection | undefined>>
}

export const NULL_PROJECT_READ_SEAM: ProjectReadSeam = {
  readProjectsByIds: () => ({}),
}

function tableExists(db: Database.Database, name: string): boolean {
  return (
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
      .get(name) !== undefined
  )
}

export function createSqliteProjectReadSeam(
  db: Database.Database,
): ProjectReadSeam {
  return {
    readProjectsByIds(ids) {
      const out: Record<string, ProjectProjection | undefined> = {}
      if (ids.length === 0 || !tableExists(db, 'projects')) return out
      const placeholders = ids.map(() => '?').join(',')
      const rows = db
        .prepare(
          `SELECT id, name, color, description FROM projects WHERE id IN (${placeholders})`,
        )
        .all(...ids) as Array<{
        id: number | string
        name: string
        color: string | null
        description: string | null
      }>
      for (const r of rows) {
        out[String(r.id)] = Object.freeze({
          name: r.name,
          color: r.color ?? null,
          description: r.description ?? null,
        })
      }
      return out
    },
  }
}
