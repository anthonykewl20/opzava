import type Database from 'better-sqlite3'

// ProjectHealth + NeedsYouRollup (doc 100 T1; CONTEXT.md "ProjectHealth"/"NeedsYouRollup").
// Pure, deterministic core: the health facet (needs_you|blocked, disjoint) and the cross-project
// rollup. v1 honest floor — needs_you derives from the one entity with a project_id (tasks);
// goals/mentions, the tool-dependency edge (blocked), and the running activity signal degrade to
// absent until those linkages exist (never invented). Approvals lack a project_id, so they are
// surfaced separately by the Digest (composeDigest), not folded into the rollup.

/** The health facet: what the operator must act on. `null` = nothing needs you and not blocked. */
export type HealthFacet = 'needs_you' | 'blocked' | null

/** The activity facet. v1 reports only `idle` (running/scheduled/planning need linkage that does not exist yet). */
export type ActivityFacet = 'running' | 'scheduled' | 'idle' | 'planning'

/** Display precedence: blocked > needs_you > running > scheduled > idle > planning. */
export type DisplayLabel = 'blocked' | 'needs_you' | ActivityFacet

export interface ProjectHealth {
  readonly projectId: string
  readonly name: string
  readonly health: HealthFacet
  readonly activity: ActivityFacet
  readonly displayLabel: DisplayLabel
  /** Honest, count-derived one-liner for the digest row (never fabricated narrative). */
  readonly summary: string
}

/** Per-project signals gathered from the data sources that exist today. */
export interface ProjectTaskSignals {
  readonly projectId: string
  readonly name: string
  /** Tasks in {review, quality_review} — the human-review states. */
  readonly reviewCount: number
  /** Open (non-done) tasks past their due_date. */
  readonly overdueOpenCount: number
  /** Open (non-done) tasks total — drives the activity floor. */
  readonly openCount: number
  /** Honest floor: false until a tool-dependency edge config exists (#35 territory). */
  readonly blockedByTool: boolean
}

function summarize(s: ProjectTaskSignals, health: HealthFacet): string {
  if (health === 'blocked') return 'Blocked — needs attention'
  if (s.reviewCount > 0) return `${s.reviewCount} awaiting your review`
  if (s.overdueOpenCount > 0) return `${s.overdueOpenCount} overdue`
  if (s.openCount > 0) return `${s.openCount} ${s.openCount === 1 ? 'task' : 'tasks'} in progress`
  return 'On track'
}

export interface NeedsYouRollup {
  /** Count of projects whose health facet is needs_you (disjoint from blocked). */
  readonly needsYou: number
  /** Count of projects whose health facet is blocked. */
  readonly blocked: number
  readonly projects: readonly ProjectHealth[]
}

export function projectHealthFromSignals(s: ProjectTaskSignals): ProjectHealth {
  // blocked takes precedence over needs_you in the health facet (they are disjoint).
  const health: HealthFacet = s.blockedByTool
    ? 'blocked'
    : s.reviewCount > 0 || s.overdueOpenCount > 0
      ? 'needs_you'
      : null
  // Activity is deferred to the honest floor: no runner↔project linkage, so 'idle'.
  const activity: ActivityFacet = 'idle'
  const displayLabel: DisplayLabel = health ?? activity
  return Object.freeze({ projectId: s.projectId, name: s.name, health, activity, displayLabel, summary: summarize(s, health) })
}

export function computeNeedsYouRollup(projects: readonly ProjectHealth[]): NeedsYouRollup {
  let needsYou = 0
  let blocked = 0
  for (const p of projects) {
    if (p.health === 'blocked') blocked += 1
    else if (p.health === 'needs_you') needsYou += 1
  }
  return Object.freeze({ needsYou, blocked, projects })
}

/** The seam the Digest (S1) reads. Workspace-singleton scoped (v1, per doc 100 T1). */
export interface NeedsYouRollupReader {
  read(workspaceId: number): NeedsYouRollup
}

function tableExists(db: Database.Database, name: string): boolean {
  return (
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name) !== undefined
  )
}

/**
 * Reads per-project task signals from inherited `tasks` (the one entity with a project_id) and
 * folds them into a NeedsYouRollup. Every workspace project is listed (clear ones included). The
 * tool-dependency `blocked` edge, goals, mentions, and the `running` activity signal degrade to
 * absent (honest floor). `now` is injectable for deterministic overdue tests (seconds, matching
 * `tasks.due_date`).
 */
export function createSqliteNeedsYouRollupReader(
  db: Database.Database,
  opts: { now?: () => number } = {},
): NeedsYouRollupReader {
  const now = opts.now ?? (() => Math.floor(Date.now() / 1000))
  return {
    read(workspaceId) {
      if (!tableExists(db, 'projects') || !tableExists(db, 'tasks')) {
        return Object.freeze({ needsYou: 0, blocked: 0, projects: [] })
      }
      const nowSec = now()
      const projectRows = db
        .prepare('SELECT id, name FROM projects WHERE workspace_id = ?')
        .all(workspaceId) as Array<{ id: number; name: string }>
      const signalRows = db
        .prepare(
          `SELECT project_id AS projectId,
             SUM(CASE WHEN status IN ('review','quality_review') THEN 1 ELSE 0 END) AS reviewCount,
             SUM(CASE WHEN status != 'done' AND due_date IS NOT NULL AND due_date < ? THEN 1 ELSE 0 END) AS overdueOpenCount,
             SUM(CASE WHEN status != 'done' THEN 1 ELSE 0 END) AS openCount
           FROM tasks WHERE workspace_id = ? GROUP BY project_id`,
        )
        .all(nowSec, workspaceId) as Array<{
        projectId: number | string | null
        reviewCount: number
        overdueOpenCount: number
        openCount: number
      }>
      const byProject = new Map(signalRows.map((r) => [String(r.projectId), r]))
      const healths = projectRows.map((p) => {
        const id = String(p.id)
        const s = byProject.get(id)
        return projectHealthFromSignals({
          projectId: id,
          name: p.name,
          reviewCount: s?.reviewCount ?? 0,
          overdueOpenCount: s?.overdueOpenCount ?? 0,
          openCount: s?.openCount ?? 0,
          blockedByTool: false,
        })
      })
      return computeNeedsYouRollup(healths)
    },
  }
}
