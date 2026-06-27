// Public barrel for platform/composition — the sanctioned cross-engine read
// location (peer of platform/costs). Engine-B modules consume these seam
// interfaces; the inherited-table SQL stays sealed inside the adapters.

export {
  createSqliteProjectReadSeam,
  NULL_PROJECT_READ_SEAM,
  type ProjectReadSeam,
  type ProjectProjection,
} from './project-read-seam'

export {
  createSqliteTaskReadSeam,
  NULL_TASK_READ_SEAM,
  type TaskReadSeam,
  type TaskCounts,
} from './task-read-seam'
