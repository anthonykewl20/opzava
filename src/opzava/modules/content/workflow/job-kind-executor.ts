import { RunnerExecutionError, type RunnerExecutor } from '@/opzava/platform/runner/worker'
import { type Job, type Attempt } from '@/opzava/platform/runner/contracts'

export type JobKindExecutorDeps = Readonly<{
  resolveKind: (job: Job) => string
  executors: Readonly<Record<string, RunnerExecutor>>
}>

export function createJobKindExecutor(deps: JobKindExecutorDeps): RunnerExecutor {
  return {
    execute: async (job: Job, attempt: Attempt, signal: AbortSignal): Promise<void> => {
      const kind = deps.resolveKind(job)
      const executor = deps.executors[kind]
      if (!executor) {
        throw new RunnerExecutionError('validation-error', `no executor registered for job kind ${kind}`)
      }
      return executor.execute(job, attempt, signal)
    },
  }
}
