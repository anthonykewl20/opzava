import Database from 'better-sqlite3'
import { createCampaignRunnerWorker, type CampaignRunnerWorkerDeps } from './campaign-runner-worker'
import { createCampaignWorkerDaemon, type CampaignWorkerDaemonReport } from './campaign-worker-daemon'
import { type CampaignEmailSender } from './email-campaign'

export type TimerLike = (callback: () => void, ms: number) => unknown

export function createTimerSleep(setTimeoutFn: TimerLike = setTimeout): (ms: number) => Promise<void> {
  return (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeoutFn(() => resolve(), ms)
    })
}

export type StopSignal = Readonly<{
  stop: () => void
  shouldStop: () => boolean
}>

export function createStopSignal(): StopSignal {
  let stopped = false
  return {
    stop: () => {
      stopped = true
    },
    shouldStop: () => stopped,
  }
}

export type RunCampaignDaemonDeps = Readonly<{
  db: Database.Database
  sender: CampaignEmailSender
  workerId: string
  clock: Readonly<{ now: () => Date }>
  ids: Readonly<{
    attemptId: () => string
    deadLetterId: (input: { jobId: string; attemptId: string }) => string
  }>
  sleep?: (ms: number) => Promise<void>
  shouldStop?: () => boolean
  idleDelayMs?: number
  onResult?: (result: { status: string }) => void
}>

export function runCampaignDaemon(deps: RunCampaignDaemonDeps): Promise<CampaignWorkerDaemonReport> {
  const worker = createCampaignRunnerWorker({
    db: deps.db,
    sender: deps.sender,
    workerId: deps.workerId,
    clock: deps.clock,
    ids: deps.ids,
  })
  const daemon = createCampaignWorkerDaemon({
    worker,
    sleep: deps.sleep ?? createTimerSleep(),
    shouldStop: deps.shouldStop ?? (() => false),
    idleDelayMs: deps.idleDelayMs,
    onResult: deps.onResult,
  })
  return daemon.run()
}
