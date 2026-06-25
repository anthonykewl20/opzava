import {
  EDGE_HANDLE,
  type NodeRunResult,
  type StepContract,
  type StepRunContext,
} from '@/opzava/core/workflow-engine/contracts'
import { buildReviewPrompt, parseReviewVerdict } from '@/opzava/core/reviews/reviews'

import type { ExecutorPlan, ExecutorTask, ProviderPort, TaskExecutor } from './contracts'

/**
 * StepContract adapters (E0) — the bridge that lets the workflow-engine run a CardDecomposition
 * graph: a `dispatch` Step delegates to the `TaskExecutor`; a `review` Step runs `core/reviews`
 * over a prior Step's output and branches on the verdict via the `approved`/`rejected` edge handle.
 * Register these in the engine's `kind → StepContract` map.
 */

export const DISPATCH_STEP_KIND = 'dispatch'
export const REVIEW_STEP_KIND = 'review'

export function makeDispatchStep(executor: TaskExecutor): StepContract {
  return {
    kind: DISPATCH_STEP_KIND,
    inputs: [
      { name: 'task', required: true },
      { name: 'plan', required: true },
    ],
    outputs: [{ name: 'text', required: false }],
    async run(ctx: StepRunContext): Promise<NodeRunResult> {
      const task = ctx.inputs.task as ExecutorTask
      const plan = ctx.inputs.plan as ExecutorPlan
      const outcome = await executor.execute({ task, plan }, ctx.signal)
      if (outcome.kind === 'completed') return { status: 'succeeded', outputs: { text: outcome.resultText } }
      if (outcome.kind === 'deferred') return { status: 'paused', outputs: { runId: outcome.runId } }
      return { status: 'failed', outputs: {}, error: outcome.errorMessage }
    },
  }
}

export function makeReviewStep(provider: ProviderPort, model: string): StepContract {
  return {
    kind: REVIEW_STEP_KIND,
    inputs: [
      { name: 'title', required: true },
      { name: 'sourceStep', required: true },
    ],
    outputs: [
      { name: 'valid', required: false },
      { name: 'feedback', required: false },
    ],
    async run(ctx: StepRunContext): Promise<NodeRunResult> {
      const title = String(ctx.inputs.title ?? '')
      const sourceStep = String(ctx.inputs.sourceStep ?? '')
      // Inter-step data flow: review the upstream Step's `text` output from the RunContext.
      const output = String(ctx.context.get(sourceStep, 'text') ?? '')

      const prompt = buildReviewPrompt({ title, output })
      const result = await provider.invoke({ prompt, model, signal: ctx.signal })
      const verdict = parseReviewVerdict(result.text)

      // A verdict is a BRANCH, not a step failure: route via the approved/rejected edge handle.
      return {
        status: 'succeeded',
        edgeSourceHandle: verdict.valid ? EDGE_HANDLE.APPROVED : EDGE_HANDLE.REJECTED,
        outputs: { valid: verdict.valid, feedback: verdict.feedback },
      }
    },
  }
}
