import { z } from 'zod'

export const PROJECT_PROFILE_SCHEMA_VERSION = 1 as const

/** Project archetype — selects the default tile layout (95 §A / ARD 0013 D2). */
export const PROJECT_TYPES = [
  'blank',
  'marketing',
  'sales',
  'support',
  'events',
] as const
export type ProjectType = (typeof PROJECT_TYPES)[number]

/**
 * The Essential tile vocabulary — the surfaces a project workspace can show.
 * Authoritative v1 set = the union of the per-type defaults in 95 §A.
 */
export const TILE_IDS = [
  'todos',
  'board',
  'docs',
  'updates',
  'marketing',
  'schedule',
  'approvals',
  'assets',
  'performance',
  'team',
  'assistant',
] as const
export type TileId = (typeof TILE_IDS)[number]

export const projectProfileSchema = z
  .object({
    schemaVersion: z.literal(PROJECT_PROFILE_SCHEMA_VERSION),
    projectId: z.string().min(1).max(120),
    type: z.enum(PROJECT_TYPES),
    enabledTiles: z.array(z.enum(TILE_IDS)),
    cover: z.string().max(2048).optional(),
    blurb: z.string().max(500).optional(),
    updatedAt: z.string().min(1),
  })
  .strict()

export type ProjectProfile = Readonly<z.infer<typeof projectProfileSchema>>

export function parseProjectProfile(input: unknown): ProjectProfile {
  return Object.freeze(projectProfileSchema.parse(input))
}

/**
 * The default tile layout per project type (95 §A, open-Q1 proposal — adopted
 * v1). Pure; the profile overlay may later diverge per-project, but a fresh
 * project of a given type starts here.
 */
const DEFAULT_TILES: Readonly<Record<ProjectType, readonly TileId[]>> =
  Object.freeze({
    blank: ['todos', 'board', 'docs', 'updates'],
    marketing: [
      'marketing',
      'schedule',
      'approvals',
      'assets',
      'performance',
      'team',
      'assistant',
    ],
    sales: ['todos', 'board', 'docs', 'performance', 'team'],
    support: ['board', 'docs', 'schedule', 'updates'],
    events: ['schedule', 'todos', 'assets', 'updates'],
  })

export function defaultTilesForType(type: ProjectType): readonly TileId[] {
  return DEFAULT_TILES[type]
}
