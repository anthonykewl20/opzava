import Database from 'better-sqlite3'
import { parseProjectProfile, type ProjectProfile } from './project-profile'

export type ProjectProfileRepository = Readonly<{
  ensureSchema: () => void
  saveProfile: (profile: ProjectProfile) => void
  getProfileByProjectId: (projectId: string) => ProjectProfile | null
  listProfiles: () => ProjectProfile[]
}>

export function createProjectProfileRepository(
  db: Database.Database,
): ProjectProfileRepository {
  let schemaReady = false

  const ensureSchema = (): void => {
    if (schemaReady) return
    db.exec(
      'CREATE TABLE IF NOT EXISTS opzava_project_profile (' +
        'project_id TEXT PRIMARY KEY, ' +
        'type TEXT NOT NULL, ' +
        "enabled_tiles TEXT NOT NULL DEFAULT '[]', " +
        'cover TEXT, ' +
        'blurb TEXT, ' +
        'record_json TEXT NOT NULL, ' +
        'updated_at TEXT NOT NULL' +
        ');',
    )
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_opzava_project_profile_type ' +
        'ON opzava_project_profile(type);',
    )
    schemaReady = true
  }

  ensureSchema()

  const insertStmt = db.prepare(
    'INSERT INTO opzava_project_profile ' +
      '(project_id, type, enabled_tiles, cover, blurb, record_json, updated_at) ' +
      'VALUES (@project_id, @type, @enabled_tiles, @cover, @blurb, @record_json, @updated_at) ' +
      'ON CONFLICT(project_id) DO UPDATE SET ' +
      'type = excluded.type, ' +
      'enabled_tiles = excluded.enabled_tiles, ' +
      'cover = excluded.cover, ' +
      'blurb = excluded.blurb, ' +
      'record_json = excluded.record_json, ' +
      'updated_at = excluded.updated_at;',
  )

  const selectByIdStmt = db.prepare(
    'SELECT record_json FROM opzava_project_profile WHERE project_id = ?;',
  )

  const selectAllStmt = db.prepare(
    'SELECT record_json FROM opzava_project_profile ' +
      'ORDER BY updated_at DESC, project_id ASC;',
  )

  const saveProfile = (profile: ProjectProfile): void => {
    const p = parseProjectProfile(profile)
    insertStmt.run({
      project_id: p.projectId,
      type: p.type,
      enabled_tiles: JSON.stringify(p.enabledTiles),
      cover: p.cover ?? null,
      blurb: p.blurb ?? null,
      record_json: JSON.stringify(p),
      updated_at: p.updatedAt,
    })
  }

  const getProfileByProjectId = (projectId: string): ProjectProfile | null => {
    const row = selectByIdStmt.get(projectId) as
      | { record_json: string }
      | undefined
    if (!row) return null
    return parseProjectProfile(JSON.parse(row.record_json))
  }

  const listProfiles = (): ProjectProfile[] => {
    const rows = selectAllStmt.all() as Array<{ record_json: string }>
    return rows.map((r) => parseProjectProfile(JSON.parse(r.record_json)))
  }

  return Object.freeze({
    ensureSchema,
    saveProfile,
    getProfileByProjectId,
    listProfiles,
  })
}
