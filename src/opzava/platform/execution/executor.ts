import type { ExecutorDeps, ExecutorTask, TaskExecutor } from './contracts'

/**
 * Build the dispatch prompt for a task. Faithful to the inherited Engine-A prompt (task-dispatch.ts
 * :148) but Engine-B-owned (the boundary forbids importing it). Rejection feedback, when present,
 * is appended so a re-dispatch addresses the prior Aegis notes.
 */
export function buildTaskPrompt(task: ExecutorTask): string {
  const lines = [
    'You have been assigned a task in Opzava.',
    '',
    `**[TASK-${task.id}] ${task.title}**`,
  ]
  if (task.priority) lines.push(`Priority: ${task.priority}`)
  if (task.description) lines.push('', task.description)
  if (task.rejectionFeedback) {
    lines.push('', '## Previous Review Feedback', task.rejectionFeedback, '', 'Please address this feedback in your response.')
  }
  lines.push('', 'Complete this task and provide your response. Be concise and actionable.')
  return lines.join('\n')
}

/**
 * The deep execution module: `claim` already happened (the spine); here we plan→prompt→invoke→
 * capture→map. One method hides the provider fan-out + prompt build + usage capture. Never touches
 * the `tasks` row — returns a `TaskOutcome` the spine transitions on.
 */
export function makeTaskExecutor(deps: ExecutorDeps): TaskExecutor {
  return {
    async execute({ task, plan }, signal) {
      const prompt = buildTaskPrompt(task)
      try {
        const result = await deps.provider.invoke({ prompt, model: plan.model, signal })
        if (result.usage) deps.usageSink.record(task, result.usage)

        if (result.deferred) {
          if (!result.runId) {
            return { kind: 'failed', errorClass: 'DeferredWithoutRunId', errorMessage: 'provider returned deferred with no runId' }
          }
          return { kind: 'deferred', runId: result.runId, sessionId: result.sessionId }
        }

        return { kind: 'completed', resultText: result.text, sessionId: result.sessionId, usage: result.usage }
      } catch (err) {
        return {
          kind: 'failed',
          errorClass: err instanceof Error ? err.constructor.name : 'Error',
          errorMessage: err instanceof Error ? err.message : String(err),
        }
      }
    },
  }
}
