import type { Attempt, Job } from './contracts'
import type { RunnerRepository } from './repository'
import type { RetryPolicy } from './retry-policy'

type RunnerExecutionErrorClass = 'timeout' | 'provider-error' | 'validation-error' | 'permission-error' | 'unknown'

export class RunnerExecutionError extends Error {
  readonly errorClass: RunnerExecutionErrorClass

  constructor(errorClass: RunnerExecutionErrorClass, message: string) {
    super(message)
    this.name = 'RunnerExecutionError'
    this.errorClass = errorClass
  }
}

export type RunnerExecutor = Readonly<{
  execute: (job: Job, attempt: Attempt, signal: AbortSignal) => Promise<void>
}>

export type RunnerWorkerOptions = Readonly<{
  repository: RunnerRepository
  executor: RunnerExecutor
  workerId: string
  leaseDurationMs: number
  executionTimeoutMs: number
  retryPolicy: RetryPolicy
  clock: Readonly<{ now: () => Date }>
  ids: Readonly<{
    attemptId: () => string
    deadLetterId: (input: { jobId: string, attemptId: string }) => string
  }>
}>

export type RunnerWorkerResult =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'succeeded', jobId: string, attemptId: string }>
  | Readonly<{ status: 'failed-retry', jobId: string, attemptId: string }>
  | Readonly<{ status: 'failed-dead-letter', jobId: string, attemptId: string }>

export type RunnerWorker = Readonly<{
  runNext: () => Promise<RunnerWorkerResult>
}>

export function createRunnerWorker(options: RunnerWorkerOptions): RunnerWorker {
  assertPositiveMs(options.leaseDurationMs, 'leaseDurationMs')
  assertPositiveMs(options.executionTimeoutMs, 'executionTimeoutMs')
  if (options.executionTimeoutMs > options.leaseDurationMs) {
    throw new Error('executionTimeoutMs must not exceed leaseDurationMs')
  }

  async function runNext(): Promise<RunnerWorkerResult> {
    const leasedAt = options.clock.now()
    const attemptId = options.ids.attemptId()
    const lease = options.repository.leaseNextJobForAttempt({
      workerId: options.workerId,
      attemptId,
      leasedAt: leasedAt.toISOString(),
      leaseExpiresAt: addMs(leasedAt, options.leaseDurationMs).toISOString(),
    })

    if (lease === null) return Object.freeze({ status: 'idle' })

    try {
      await executeWithTimeout(options.executor, lease.jobRecord.job, lease.attemptRecord.attempt, options.executionTimeoutMs)
      options.repository.recordAttemptSuccess({
        jobId: lease.jobRecord.job.jobId,
        attemptId,
        finishedAt: options.clock.now().toISOString(),
      })

      return Object.freeze({ status: 'succeeded', jobId: lease.jobRecord.job.jobId, attemptId })
    } catch (error) {
      const finishedAt = options.clock.now()
      const executionError = normalizeExecutionError(error)
      const shouldRetry = lease.jobRecord.job.attemptCount < lease.jobRecord.job.maxAttempts
      const retryDecision = shouldRetry
        ? options.retryPolicy.nextRetry({
          attemptNumber: lease.attemptRecord.attempt.attemptNumber,
          failedAt: finishedAt,
          errorClass: executionError.errorClass,
        })
        : null
      const deadLetterId = shouldRetry ? null : options.ids.deadLetterId({ jobId: lease.jobRecord.job.jobId, attemptId })

      options.repository.recordAttemptFailure({
        jobId: lease.jobRecord.job.jobId,
        attemptId,
        finishedAt: finishedAt.toISOString(),
        errorClass: executionError.errorClass,
        errorMessage: executionError.message,
        retryScheduledAt: retryDecision ? retryDecision.scheduledAt.toISOString() : null,
        deadLetterId,
      })

      return Object.freeze({
        status: shouldRetry ? 'failed-retry' : 'failed-dead-letter',
        jobId: lease.jobRecord.job.jobId,
        attemptId,
      })
    }
  }

  return Object.freeze({ runNext })
}

async function executeWithTimeout(
  executor: RunnerExecutor,
  job: Job,
  attempt: Attempt,
  timeoutMs: number,
): Promise<void> {
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | null = null
  const execution = Promise.resolve().then(() => executor.execute(job, attempt, controller.signal))
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort()
      reject(new RunnerExecutionError('timeout', 'execution timed out'))
    }, timeoutMs)
  })

  try {
    await Promise.race([execution, timeoutPromise])
  } finally {
    if (timeout !== null) clearTimeout(timeout)
    execution.catch(() => undefined)
  }
}

function normalizeExecutionError(error: unknown): RunnerExecutionError {
  if (error instanceof RunnerExecutionError) return error
  if (error instanceof Error) return new RunnerExecutionError('unknown', error.message)
  return new RunnerExecutionError('unknown', String(error))
}

function assertPositiveMs(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
}

function addMs(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms)
}
