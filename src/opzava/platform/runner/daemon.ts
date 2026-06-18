import type { RunnerWorker } from './worker'

export type RunnerDaemonSleep = (ms: number, signal: AbortSignal) => Promise<void>

export type RunnerDaemonOptions = Readonly<{
  worker: RunnerWorker
  signal: AbortSignal
  idleDelayMs: number
  errorDelayMs: number
  sleep?: RunnerDaemonSleep
}>

export type RunnerDaemonRunOptions = Readonly<{
  maxPolls?: number
}>

export type RunnerDaemonResult = Readonly<{
  stopped: 'signal' | 'max-polls'
  polls: number
  jobsRun: number
  idlePolls: number
  errors: number
}>

export type RunnerDaemon = Readonly<{
  run: (options?: RunnerDaemonRunOptions) => Promise<RunnerDaemonResult>
}>

export function createRunnerDaemon(options: RunnerDaemonOptions): RunnerDaemon {
  assertPositiveInteger(options.idleDelayMs, 'idleDelayMs')
  assertPositiveInteger(options.errorDelayMs, 'errorDelayMs')
  const sleep = options.sleep ?? abortableSleep

  async function run(runOptions: RunnerDaemonRunOptions = {}): Promise<RunnerDaemonResult> {
    if (runOptions.maxPolls !== undefined) {
      assertPositiveInteger(runOptions.maxPolls, 'maxPolls')
    }

    let polls = 0
    let jobsRun = 0
    let idlePolls = 0
    let errors = 0

    while (!options.signal.aborted && !reachedMaxPolls(polls, runOptions.maxPolls)) {
      polls += 1

      try {
        const result = await options.worker.runNext()
        if (result.status === 'idle') {
          idlePolls += 1
          await sleep(options.idleDelayMs, options.signal)
        } else {
          jobsRun += 1
        }
      } catch {
        errors += 1
        await sleep(options.errorDelayMs, options.signal)
      }
    }

    return Object.freeze({
      stopped: options.signal.aborted ? 'signal' : 'max-polls',
      polls,
      jobsRun,
      idlePolls,
      errors,
    })
  }

  return Object.freeze({ run })
}

function reachedMaxPolls(polls: number, maxPolls: number | undefined): boolean {
  return maxPolls !== undefined && polls >= maxPolls
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()

  return new Promise((resolve) => {
    let timeout: ReturnType<typeof setTimeout> | null = null
    const done = () => {
      if (timeout !== null) clearTimeout(timeout)
      signal.removeEventListener('abort', done)
      resolve()
    }

    timeout = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
  })
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
}
