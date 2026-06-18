import Database from 'better-sqlite3'
import { parseArtifact, type Artifact } from '@/opzava/core/artifacts/contracts'

export type StoredArtifactContext = Readonly<{ workflowRunId: string; createdAt: string }>
export type ArtifactListFilter = Readonly<{ artifactType?: string; workflowRunId?: string }>
export type ArtifactRepository = Readonly<{
  ensureSchema: () => void
  saveArtifact: (artifact: Artifact, context: StoredArtifactContext) => void
  getArtifactById: (artifactId: string) => Artifact | null
  listArtifacts: (filter?: ArtifactListFilter) => Artifact[]
  listArtifactSummaries: (filter?: ArtifactListFilter) => ArtifactSummary[]
}>

export type ArtifactSummary = Readonly<{
  artifactId: string
  artifactType: string
  workflowRunId: string
  createdAt: string
}>

type ArtifactRow = Readonly<{ record_json: string }>
type ArtifactSummaryRow = Readonly<{
  artifact_id: string
  artifact_type: string
  workflow_run_id: string
  created_at: string
}>

export function createArtifactRepository(db: Database.Database): ArtifactRepository {
  let schemaReady = false

  const ensureSchema = (): void => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS opzava_content_artifacts (
        artifact_id TEXT PRIMARY KEY,
        artifact_type TEXT NOT NULL,
        source_step_run_id TEXT NOT NULL,
        workflow_run_id TEXT NOT NULL,
        validation_status TEXT NOT NULL,
        record_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_opzava_content_artifacts_type ON opzava_content_artifacts(artifact_type);
      CREATE INDEX IF NOT EXISTS idx_opzava_content_artifacts_run ON opzava_content_artifacts(workflow_run_id);
      CREATE INDEX IF NOT EXISTS idx_opzava_content_artifacts_created ON opzava_content_artifacts(created_at);
    `)
    schemaReady = true
  }

  ensureSchema()

  const insertStmt = db.prepare(`
    INSERT INTO opzava_content_artifacts
      (artifact_id, artifact_type, source_step_run_id, workflow_run_id, validation_status, record_json, created_at)
    VALUES
      (@artifact_id, @artifact_type, @source_step_run_id, @workflow_run_id, @validation_status, @record_json, @created_at)
    ON CONFLICT(artifact_id) DO UPDATE SET
      artifact_type = excluded.artifact_type,
      source_step_run_id = excluded.source_step_run_id,
      workflow_run_id = excluded.workflow_run_id,
      validation_status = excluded.validation_status,
      record_json = excluded.record_json,
      created_at = excluded.created_at
  `)

  const selectByIdStmt = db.prepare(
    `SELECT record_json FROM opzava_content_artifacts WHERE artifact_id = ?`,
  )

  const selectAllStmt = db.prepare(
    `SELECT record_json FROM opzava_content_artifacts ORDER BY created_at DESC`,
  )

  const selectByTypeStmt = db.prepare(
    `SELECT record_json FROM opzava_content_artifacts WHERE artifact_type = ? ORDER BY created_at DESC`,
  )

  const selectByRunStmt = db.prepare(
    `SELECT record_json FROM opzava_content_artifacts WHERE workflow_run_id = ? ORDER BY created_at DESC`,
  )

  const selectByTypeAndRunStmt = db.prepare(
    `SELECT record_json FROM opzava_content_artifacts
     WHERE artifact_type = ? AND workflow_run_id = ?
     ORDER BY created_at DESC`,
  )

  const summaryCols = 'artifact_id, artifact_type, workflow_run_id, created_at'
  const summaryAllStmt = db.prepare(
    `SELECT ${summaryCols} FROM opzava_content_artifacts ORDER BY created_at DESC`,
  )
  const summaryByTypeStmt = db.prepare(
    `SELECT ${summaryCols} FROM opzava_content_artifacts WHERE artifact_type = ? ORDER BY created_at DESC`,
  )
  const summaryByRunStmt = db.prepare(
    `SELECT ${summaryCols} FROM opzava_content_artifacts WHERE workflow_run_id = ? ORDER BY created_at DESC`,
  )
  const summaryByTypeAndRunStmt = db.prepare(
    `SELECT ${summaryCols} FROM opzava_content_artifacts
     WHERE artifact_type = ? AND workflow_run_id = ? ORDER BY created_at DESC`,
  )

  const mapSummaries = (rows: ArtifactSummaryRow[]): ArtifactSummary[] =>
    rows.map((r) => ({
      artifactId: r.artifact_id,
      artifactType: r.artifact_type,
      workflowRunId: r.workflow_run_id,
      createdAt: r.created_at,
    }))

  const mapRows = (rows: ArtifactRow[]): Artifact[] =>
    rows.map((row) => parseArtifact(JSON.parse(row.record_json)))

  const saveArtifact = (artifact: Artifact, context: StoredArtifactContext): void => {
    if (!schemaReady) ensureSchema()
    const a = parseArtifact(artifact)
    insertStmt.run({
      artifact_id: a.artifactId,
      artifact_type: a.artifactType,
      source_step_run_id: a.sourceStepRunId,
      workflow_run_id: context.workflowRunId,
      validation_status: a.validation.status,
      record_json: JSON.stringify(a),
      created_at: context.createdAt,
    })
  }

  const getArtifactById = (artifactId: string): Artifact | null => {
    if (!schemaReady) ensureSchema()
    const row = selectByIdStmt.get(artifactId) as ArtifactRow | undefined
    if (!row) return null
    return parseArtifact(JSON.parse(row.record_json))
  }

  const listArtifacts = (filter?: ArtifactListFilter): Artifact[] => {
    if (!schemaReady) ensureSchema()
    if (filter?.artifactType !== undefined && filter.workflowRunId !== undefined) {
      const rows = selectByTypeAndRunStmt.all(filter.artifactType, filter.workflowRunId) as ArtifactRow[]
      return mapRows(rows)
    }
    if (filter?.artifactType !== undefined) {
      const rows = selectByTypeStmt.all(filter.artifactType) as ArtifactRow[]
      return mapRows(rows)
    }
    if (filter?.workflowRunId !== undefined) {
      const rows = selectByRunStmt.all(filter.workflowRunId) as ArtifactRow[]
      return mapRows(rows)
    }
    const rows = selectAllStmt.all() as ArtifactRow[]
    return mapRows(rows)
  }

  const listArtifactSummaries = (filter?: ArtifactListFilter): ArtifactSummary[] => {
    if (!schemaReady) ensureSchema()
    if (filter?.artifactType !== undefined && filter.workflowRunId !== undefined) {
      return mapSummaries(summaryByTypeAndRunStmt.all(filter.artifactType, filter.workflowRunId) as ArtifactSummaryRow[])
    }
    if (filter?.artifactType !== undefined) {
      return mapSummaries(summaryByTypeStmt.all(filter.artifactType) as ArtifactSummaryRow[])
    }
    if (filter?.workflowRunId !== undefined) {
      return mapSummaries(summaryByRunStmt.all(filter.workflowRunId) as ArtifactSummaryRow[])
    }
    return mapSummaries(summaryAllStmt.all() as ArtifactSummaryRow[])
  }

  return Object.freeze({
    ensureSchema,
    saveArtifact,
    getArtifactById,
    listArtifacts,
    listArtifactSummaries,
  })
}
