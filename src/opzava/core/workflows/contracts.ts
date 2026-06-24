import { z } from 'zod'

export const WORKFLOW_CONTRACT_SCHEMA_VERSION = 1 as const

const workflowStepSchema = z.object({
  stepId: z.string().min(1).max(100),
  displayName: z.string().min(1).max(120),
  kind: z.enum(['manual-input', 'artifact-transform', 'provider-call', 'approval-gate', 'external-action']),
  nextStepIds: z.array(z.string().min(1).max(100)),
}).strict()

export const workflowDefinitionSchema = z.object({
  schemaVersion: z.literal(WORKFLOW_CONTRACT_SCHEMA_VERSION),
  workflowId: z.string().min(1).max(100),
  version: z.number().int().positive(),
  displayName: z.string().min(1).max(120),
  entryStepId: z.string().min(1).max(100),
  steps: z.array(workflowStepSchema).min(1),
  allowedInputArtifactTypes: z.array(z.string().min(1).max(100)).min(1),
}).strict().superRefine((definition, ctx) => {
  const stepIds = new Set<string>()

  for (const step of definition.steps) {
    if (stepIds.has(step.stepId)) {
      ctx.addIssue({ code: 'custom', path: ['steps'], message: `duplicate step ID: ${step.stepId}` })
    }

    stepIds.add(step.stepId)
  }

  if (!stepIds.has(definition.entryStepId)) {
    ctx.addIssue({ code: 'custom', path: ['entryStepId'], message: 'entry step points at an unknown step' })
  }

  for (const step of definition.steps) {
    for (const nextStepId of step.nextStepIds) {
      if (!stepIds.has(nextStepId)) {
        ctx.addIssue({ code: 'custom', path: ['steps', step.stepId], message: `unknown step edge: ${nextStepId}` })
      }
    }
  }

  if (hasCycle(definition.steps)) {
    ctx.addIssue({ code: 'custom', path: ['steps'], message: 'workflow step graph contains a cycle' })
  }
})

type WorkflowStep = z.infer<typeof workflowStepSchema>

export type WorkflowDefinition = Readonly<z.infer<typeof workflowDefinitionSchema>>

export function parseWorkflowDefinition(input: unknown): WorkflowDefinition {
  return Object.freeze(workflowDefinitionSchema.parse(input))
}

function hasCycle(steps: WorkflowStep[]): boolean {
  const graph = new Map(steps.map((step) => [step.stepId, step.nextStepIds]))
  const visiting = new Set<string>()
  const visited = new Set<string>()

  return steps.some((step) => visitStep(step.stepId, graph, visiting, visited))
}

function visitStep(
  stepId: string,
  graph: Map<string, string[]>,
  visiting: Set<string>,
  visited: Set<string>,
): boolean {
  if (visiting.has(stepId)) return true
  if (visited.has(stepId)) return false

  visiting.add(stepId)

  for (const nextStepId of graph.get(stepId) ?? []) {
    if (visitStep(nextStepId, graph, visiting, visited)) return true
  }

  visiting.delete(stepId)
  visited.add(stepId)
  return false
}
