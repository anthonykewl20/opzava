import { type RunnerWorker } from '@/opzava/platform/runner/worker'

export type CampaignWorkerDaemonDeps = Readonly<{
  worker: RunnerWorker
  sleep: (ms: number) => Promise<void>
  shouldStop: () => boolean
  idleDelayMs?: number
  onResult?: (result: { status: string }) => void
}>

export type CampaignWorkerDaemonReport = Readonly<{
  iterations: number
  processed: number
  idleSweeps: number
}>

export function createCampaignWorkerDaemon(
  deps: CampaignWorkerDaemonDeps
): Readonly<{ run: () => Promise<CampaignWorkerDaemonReport> }> {
  const idleDelayMs = deps.idleDelayMs ?? 1000

  return Object.freeze({
    run: async (): Promise<CampaignWorkerDaemonReport> => {
      let iterations = 0
      let processed = 0
      let idleSweeps = 0

      while (!deps.shouldStop()) {
        const result = await deps.worker.runNext()
        iterations++
        deps.onResult?.(result)
        if (result.status === 'idle') {
          idleSweeps++
          await deps.sleep(idleDelayMs)
        } else {
          processed++
        }
      }

      return Object.freeze({ iterations, processed, idleSweeps })
    },
  })
}
