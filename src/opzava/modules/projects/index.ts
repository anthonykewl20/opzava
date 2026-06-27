// Public barrel for the projects module (95 §A foundation).
// Sibling modules and thin routes import from here only — never internal paths
// (enforced by src/opzava/architecture.test.ts).

export {
  PROJECT_PROFILE_SCHEMA_VERSION,
  PROJECT_TYPES,
  TILE_IDS,
  projectProfileSchema,
  parseProjectProfile,
  defaultTilesForType,
  type ProjectType,
  type TileId,
  type ProjectProfile,
} from './project-profile'

export {
  createProjectProfileRepository,
  type ProjectProfileRepository,
} from './project-profile-repository'

export {
  readProjectCard,
  projectCardFrom,
  type ProjectCard,
  type ReadProjectCardDeps,
} from './project-card'
