import { getContentStepOutput, type ContentStepOutput } from '../workflow/content-step-outputs'
import { RunnerExecutionError, type RunnerExecutor } from '../../../platform/runner/worker'

// Key-order-independent equality for the flat, string-valued ContentStepOutput union.
// Avoids relying on JSON.stringify key ordering for the bridge's output-verification guard.
function contentStepOutputsMatch(a: ContentStepOutput, b: ContentStepOutput): boolean {
  const aEntries = Object.entries(a as Record<string, unknown>).sort(([x], [y]) => x.localeCompare(y))
  const bEntries = Object.entries(b as Record<string, unknown>).sort(([x], [y]) => x.localeCompare(y))
  return aEntries.length === bEntries.length
    && aEntries.every(([key, value], i) => key === bEntries[i][0] && value === bEntries[i][1])
}

export type ContentStepServiceResult<TRecord> = Readonly<{
  stepId: string
  output: ContentStepOutput
  record: TRecord
}>

export type ContentStepService<TInput, TRecord> = Readonly<{
  stepId: string
  run: (input: TInput) => ContentStepServiceResult<TRecord>
}>

export function createContentStepExecutor<TInput, TRecord>(args: Readonly<{
  service: ContentStepService<TInput, TRecord>
  parseInput: (payload: unknown) => TInput
  onResult: (result: ContentStepServiceResult<TRecord>) => void
}>): RunnerExecutor {
  return Object.freeze({
    execute: async (job, _attempt, _signal) => {
      try {
        const input = args.parseInput(job.payload)
        const result = args.service.run(input)
        const expected = getContentStepOutput(args.service.stepId)
        if (!contentStepOutputsMatch(result.output, expected)) {
          throw new RunnerExecutionError(
            'validation-error',
            `step ${args.service.stepId} produced output not matching its declared step output`
          )
        }
        args.onResult(result)
      } catch (err) {
        if (err instanceof RunnerExecutionError) {
          throw err
        }
        const detail = (err instanceof Error ? err.message : String(err)).replace(/\s+/g, ' ').slice(0, 200)
        throw new RunnerExecutionError(
          'validation-error',
          `step ${args.service.stepId} input validation failed: ${detail}`
        )
      }
    }
  })
}
