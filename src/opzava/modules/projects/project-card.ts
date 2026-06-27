import Database from 'better-sqlite3'
import {
  createSqliteProjectReadSeam,
  createSqliteTaskReadSeam,
  type ProjectProjection,
  type ProjectReadSeam,
  type TaskCounts,
  type TaskReadSeam,
} from '@/opzava/platform/composition'
import {
  defaultTilesForType,
  type ProjectProfile,
  type ProjectType,
  type TileId,
} from './project-profile'
import { createProjectProfileRepository } from './project-profile-repository'

/**
 * The Home-lineup / project-header view: an inherited project enriched with its
 * Engine-B profile overlay and live task counts (95 §A). Identity (name/color/
 * description) is read from inherited `projects` by value — never duplicated.
 */
export type ProjectCard = Readonly<{
  projectId: string
  name: string
  color: string | null
  description: string | null
  type: ProjectType
  enabledTiles: readonly TileId[]
  cover?: string
  blurb?: string
  taskCounts: TaskCounts
}>

/** Pure projector: assemble a card from the three already-read sources. */
export function projectCardFrom(
  projectId: string,
  project: ProjectProjection,
  profile: ProjectProfile | null,
  taskCounts: TaskCounts,
): ProjectCard {
  const type: ProjectType = profile?.type ?? 'blank'
  const enabledTiles = profile?.enabledTiles ?? defaultTilesForType(type)
  return Object.freeze({
    projectId,
    name: project.name,
    color: project.color,
    description: project.description,
    type,
    enabledTiles,
    ...(profile?.cover !== undefined ? { cover: profile.cover } : {}),
    ...(profile?.blurb !== undefined ? { blurb: profile.blurb } : {}),
    taskCounts,
  })
}

export type ReadProjectCardDeps = Readonly<{
  projectReadSeam?: ProjectReadSeam
  taskReadSeam?: TaskReadSeam
}>

/**
 * Compose a project card. Degrades per-source: missing project → null; missing
 * profile → synthesized `blank` default; missing tasks → zero counts. Never throws.
 */
export function readProjectCard(
  db: Database.Database,
  projectId: string,
  deps: ReadProjectCardDeps = {},
): ProjectCard | null {
  const projectReadSeam = deps.projectReadSeam ?? createSqliteProjectReadSeam(db)
  const taskReadSeam = deps.taskReadSeam ?? createSqliteTaskReadSeam(db)

  const project = projectReadSeam.readProjectsByIds([projectId])[projectId]
  if (!project) return null

  const profile = createProjectProfileRepository(db).getProfileByProjectId(projectId)
  const taskCounts = taskReadSeam.countTasksByProject(projectId)
  return projectCardFrom(projectId, project, profile, taskCounts)
}
