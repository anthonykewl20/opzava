/**
 * core/triage (ARD 0026 H3) — decides whether a Card needs **decomposition** (→ the MainOrchestrator
 * plans it as a graph) or flows through plain **direct dispatch** (autoRoute → one agent). This is the
 * decision UPSTREAM of the orchestrator, so "halt-orchestration-only" degradation has a well-defined,
 * frontier-independent set of simple cards.
 *
 * The signal is set by the **operator** (an explicit override) or this **cheap, deterministic**
 * heuristic — NEVER the frontier model (that would be circular: needing the orchestrator to decide
 * whether to invoke the orchestrator). Pure `core/`. Conservative default: do NOT decompose (the
 * cheaper path) unless a multi-step signal is present.
 */

export interface TriageInput {
  readonly title: string
  readonly description?: string | null
  readonly estimatedHours?: number | null
  /** Explicit operator decision (from card metadata). When set, it wins over the heuristic. */
  readonly override?: boolean
}

/** Multi-step signal phrases — work that reads as a sequence/pipeline rather than one action. */
const MULTI_STEP_SIGNALS = [
  'and then',
  'multi-step',
  'multiple steps',
  'step by step',
  'pipeline',
  'end-to-end',
  'phases',
  'milestones',
  'research and',
  'design and implement',
  'plan and',
] as const

const LONG_DESCRIPTION_CHARS = 1500
const BIG_TASK_HOURS = 8

export function needsDecomposition(input: TriageInput): boolean {
  // The operator's explicit decision always wins.
  if (typeof input.override === 'boolean') return input.override

  const text = `${input.title} ${input.description ?? ''}`.toLowerCase()
  if (MULTI_STEP_SIGNALS.some((s) => text.includes(s))) return true
  if ((input.estimatedHours ?? 0) >= BIG_TASK_HOURS) return true
  if ((input.description?.length ?? 0) >= LONG_DESCRIPTION_CHARS) return true

  // Conservative default: a simple card goes to direct dispatch, not the (costlier) orchestrator.
  return false
}
