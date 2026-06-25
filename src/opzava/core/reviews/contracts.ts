/**
 * core/reviews contracts (ARD 0025 C1). The Engine-B canonical review primitives the fleet's graph
 * execution uses for per-Step quality review — the pure half of Aegis. The engine boundary means
 * Engine-A's inherited `runAegisReviews` keeps its own copy; this is the fleet/graph path.
 *
 * Pure `core/` (layering-guarded). Verdict aligns with `core/workflow-engine`'s `ReviewVerdict`, so
 * the impure Aegis adapter (platform, built with the provider seam) satisfies `ReviewStrategy`
 * directly. See CONTEXT.md: ReviewStrategy, Aegis.
 */

/** The reviewable unit: a Step's (or task's) output evaluated against its intent. */
export interface ReviewInput {
  /** Display ref, e.g. `CS-001` or `TASK-42` (optional). */
  readonly ref?: string
  readonly title: string
  readonly description?: string
  /** The agent's resolution / Step output under review. */
  readonly output: string
}

// The verdict shape is owned by the workflow-engine's quality seam; re-exported for convenience so
// `core/reviews` callers and the `ReviewStrategy` adapter speak one type.
export type { ReviewVerdict } from '@/opzava/core/workflow-engine/contracts'
