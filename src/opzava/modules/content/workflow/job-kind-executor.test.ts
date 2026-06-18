import { describe, it, expect, vi } from 'vitest'
import { RunnerExecutionError, type RunnerExecutor } from '@/opzava/platform/runner/worker'
import { type Job, type Attempt } from '@/opzava/platform/runner/contracts'
import { createJobKindExecutor } from './job-kind-executor'

function makeJob(jobId = 'job-1'): Job {
  return { jobId } as unknown as Job
}

function makeAttempt(): Attempt {
  return {} as unknown as Attempt
}

function makeSignal(): AbortSignal {
  return new AbortController().signal
}

describe('createJobKindExecutor', () => {
  it('routes a job to the executor for its kind', async () => {
    const emailExec: RunnerExecutor = { execute: vi.fn().mockResolvedValue(undefined) }
    const contentExec: RunnerExecutor = { execute: vi.fn().mockResolvedValue(undefined) }
    const resolveKind = (): string => 'email'
    const dispatcher = createJobKindExecutor({
      resolveKind,
      executors: { email: emailExec, content: contentExec },
    })
    const job = makeJob()
    const attempt = makeAttempt()
    const signal = makeSignal()

    await dispatcher.execute(job, attempt, signal)

    expect(emailExec.execute).toHaveBeenCalledTimes(1)
    expect(emailExec.execute).toHaveBeenCalledWith(job, attempt, signal)
    expect(contentExec.execute).not.toHaveBeenCalled()
  })

  it('throws a validation-error when no executor is registered for the kind', async () => {
    const emailExec: RunnerExecutor = { execute: vi.fn().mockResolvedValue(undefined) }
    const resolveKind = (): string => 'unknown-kind'
    const dispatcher = createJobKindExecutor({
      resolveKind,
      executors: { email: emailExec },
    })
    const signal = makeSignal()

    await expect(dispatcher.execute(makeJob(), makeAttempt(), signal)).rejects.toMatchObject({
      name: 'RunnerExecutionError',
      errorClass: 'validation-error',
    })
    expect(emailExec.execute).not.toHaveBeenCalled()
  })

  it("propagates the chosen executor's rejection", async () => {
    const emailExec: RunnerExecutor = {
      execute: vi.fn().mockRejectedValue(new Error('boom')),
    }
    const resolveKind = (): string => 'email'
    const dispatcher = createJobKindExecutor({
      resolveKind,
      executors: { email: emailExec },
    })
    const signal = makeSignal()

    await expect(dispatcher.execute(makeJob(), makeAttempt(), signal)).rejects.toThrow('boom')
  })

  it('uses RunnerExecutionError as the rejection constructor for unknown kinds', async () => {
    const dispatcher = createJobKindExecutor({
      resolveKind: () => 'nope',
      executors: {},
    })
    await expect(dispatcher.execute(makeJob(), makeAttempt(), makeSignal())).rejects.toBeInstanceOf(
      RunnerExecutionError,
    )
  })
})
