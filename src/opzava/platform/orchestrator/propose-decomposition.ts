import type { ModelTierSeed } from '@/opzava/core/model-tier/contracts'
import { isFrontier } from '@/opzava/core/model-tier/model-tier'
import { workflowGraphSchema, type WorkflowGraph } from '@/opzava/core/workflow-engine/contracts'
import type { ProviderPort } from '@/opzava/platform/execution/contracts'

/**
 * proposeDecomposition (ARD 0026 M2) — the orchestrator's *proposal*: a frontier model emits a
 * candidate `WorkflowGraph` for a card. The orchestrator proposes; it never persists — the output
 * flows into `executeDecompose`, where the gate (G0) validates shape/caps/kinds and persists.
 *
 * Enforces the frontier-lock AT THE PROPOSAL SITE (H4/H8): a non-frontier model is refused before
 * any call. LLM emission is error-prone (ARD 0026 negative consequence), so the output is parsed +
 * schema-validated here and gated downstream — a malformed emission is a clean rejection, never a
 * throw. Platform (Engine B): composes core/model-tier + core/workflow-engine + the provider seam.
 */

export interface ProposeCard {
  readonly id: number
  readonly title: string
  readonly description?: string | null
}

export interface ProposeInput {
  readonly card: ProposeCard
  /** The orchestrator's model — MUST resolve to frontier tier (the lock is enforced here). */
  readonly model: string
  readonly maxSteps?: number
}

export interface ProposeDeps {
  readonly provider: ProviderPort
  /** Precise model-id→tier seed injected by the platform (else the family heuristic decides). */
  readonly modelTierSeed?: ModelTierSeed
}

export type ProposeOutcome =
  | { readonly kind: 'proposed'; readonly graph: WorkflowGraph }
  | {
      readonly kind: 'rejected'
      readonly reason: 'not-frontier' | 'malformed-emission' | 'invalid-graph'
      readonly detail: string
    }

export function buildDecompositionPrompt(card: ProposeCard, maxSteps: number): string {
  return [
    'You are the Main Orchestrator for Opzava. Decompose the following card into a WorkflowGraph.',
    '',
    `**[CARD-${card.id}] ${card.title}**`,
    ...(card.description ? ['', card.description] : []),
    '',
    '## Rules',
    `- At most ${maxSteps} steps. Shape must be LINEAR or FAN-OUT only (no cycles, no arbitrary DAGs).`,
    '- Each step.kind is one of: "dispatch" (agent does work) or "review" (Aegis reviews a prior step).',
    '- Respond with ONLY a JSON object, no prose:',
    '  {"steps":[{"id":"s1","kind":"dispatch","data":{}}],"edges":[{"source":"s1","target":"s2","sourceHandle":"source"}]}',
  ].join('\n')
}

/** Pull the first balanced-ish JSON object out of model output (tolerates ```json fences + prose). */
function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  return candidate.slice(start, end + 1)
}

export async function proposeDecomposition(input: ProposeInput, deps: ProposeDeps): Promise<ProposeOutcome> {
  // Frontier-lock at the proposal site (H4/H8): refuse before any model call.
  if (!isFrontier(input.model, deps.modelTierSeed)) {
    return { kind: 'rejected', reason: 'not-frontier', detail: `orchestrator model '${input.model}' is not frontier-tier` }
  }

  const prompt = buildDecompositionPrompt(input.card, input.maxSteps ?? 8)
  const result = await deps.provider.invoke({ prompt, model: input.model })

  const json = extractJsonObject(result.text)
  if (json === null) {
    return { kind: 'rejected', reason: 'malformed-emission', detail: 'no JSON object found in model output' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { kind: 'rejected', reason: 'malformed-emission', detail: 'model output is not valid JSON' }
  }

  const validated = workflowGraphSchema.safeParse(parsed)
  if (!validated.success) {
    return { kind: 'rejected', reason: 'invalid-graph', detail: validated.error.issues[0]?.message ?? 'graph failed schema' }
  }

  return { kind: 'proposed', graph: validated.data }
}
