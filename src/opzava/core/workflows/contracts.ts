import { z } from 'zod'

export const WORKFLOW_CONTRACT_SCHEMA_VERSION = 1 as const

export const workflowRunStatusSchema = z.enum([
  'queued',
  'running',
  'blocked',
  'succeeded',
  'failed',
  'cancelled',
])

export const stepRunStatusSchema = z.enum([
  'pending',
  'running',
  'blocked',
  'succeeded',
  'failed',
  'skipped',
])

export type WorkflowRunStatus = z.infer<typeof workflowRunStatusSchema>
export type StepRunStatus = z.infer<typeof stepRunStatusSchema>

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

export const workflowRunSchema = z.object({
  schemaVersion: z.literal(WORKFLOW_CONTRACT_SCHEMA_VERSION),
  runId: z.string().min(1).max(120),
  workflowId: z.string().min(1).max(100),
  workflowVersion: z.number().int().positive(),
  status: workflowRunStatusSchema,
  actorId: z.string().min(1).max(200),
  currentStepId: z.string().min(1).max(100).nullable(),
  startedAt: z.string().min(1).nullable(),
  finishedAt: z.string().min(1).nullable(),
}).strict()

export const stepRunSchema = z.object({
  schemaVersion: z.literal(WORKFLOW_CONTRACT_SCHEMA_VERSION),
  stepRunId: z.string().min(1).max(120),
  runId: z.string().min(1).max(120),
  stepId: z.string().min(1).max(100),
  status: stepRunStatusSchema,
  inputArtifactIds: z.array(z.string().min(1).max(120)),
  outputArtifactIds: z.array(z.string().min(1).max(120)),
  attemptCount: z.number().int().min(0),
  failureReason: z.string().min(1).max(1000).nullable(),
}).strict()

export type WorkflowDefinition = Readonly<z.infer<typeof workflowDefinitionSchema>>
export type WorkflowRun = Readonly<z.infer<typeof workflowRunSchema>>
export type StepRun = Readonly<z.infer<typeof stepRunSchema>>

const workflowRunTransitions = {
  queued: ['running', 'cancelled'],
  running: ['blocked', 'succeeded', 'failed', 'cancelled'],
  blocked: ['running', 'failed', 'cancelled'],
  succeeded: [],
  failed: [],
  cancelled: [],
} satisfies Record<WorkflowRunStatus, readonly WorkflowRunStatus[]>

const stepRunTransitions = {
  pending: ['running', 'skipped'],
  running: ['blocked', 'succeeded', 'failed'],
  blocked: ['running', 'failed'],
  succeeded: [],
  failed: [],
  skipped: [],
} satisfies Record<StepRunStatus, readonly StepRunStatus[]>

export function parseWorkflowDefinition(input: unknown): WorkflowDefinition {
  return Object.freeze(workflowDefinitionSchema.parse(input))
}

export function parseWorkflowRun(input: unknown): WorkflowRun {
  return Object.freeze(workflowRunSchema.parse(input))
}

export function parseStepRun(input: unknown): StepRun {
  return Object.freeze(stepRunSchema.parse(input))
}

export function transitionWorkflowRunStatus(run: WorkflowRun, nextStatus: WorkflowRunStatus): WorkflowRun {
  const allowedTransitions = workflowRunTransitions[run.status] as readonly WorkflowRunStatus[]

  if (!allowedTransitions.includes(nextStatus)) {
    throw new Error(`invalid workflow transition: ${run.status} -> ${nextStatus}`)
  }

  return Object.freeze({ ...run, status: nextStatus })
}

export function transitionStepRunStatus(stepRun: StepRun, nextStatus: StepRunStatus): StepRun {
  const allowedTransitions = stepRunTransitions[stepRun.status] as readonly StepRunStatus[]

  if (!allowedTransitions.includes(nextStatus)) {
    throw new Error(`invalid step transition: ${stepRun.status} -> ${nextStatus}`)
  }

  return Object.freeze({ ...stepRun, status: nextStatus })
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
