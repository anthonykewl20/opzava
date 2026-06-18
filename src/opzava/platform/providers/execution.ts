import { parseOperationalEventStorageRecord, RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION, type OperationalEventStorageRecord } from '../runner/repository-contracts'
import {
  PROVIDER_ADAPTER_RESULT_SCHEMA_VERSION,
  createExternalCallRecordFromProviderAdapterResult,
  parseProviderAdapterResult,
  type ExternalCallRecord,
  type ProviderAdapter,
  type ProviderAdapterRequest,
  type ProviderAdapterResult,
} from './contracts'

export type ProviderExecutionEventSink = Readonly<{
  appendOperationalEvent: (record: OperationalEventStorageRecord) => void
}>

export type ProviderExecutionClock = Readonly<{
  now: () => Date
}>

export type ProviderExecutionInput = Readonly<{
  adapter: ProviderAdapter
  request: ProviderAdapterRequest
  externalCallId: string
  eventSink: ProviderExecutionEventSink
  signal: AbortSignal
  clock?: ProviderExecutionClock
}>

export type ProviderExecutionResult = Readonly<{
  result: ProviderAdapterResult
  externalCallRecord: ExternalCallRecord
}>

export async function executeProviderAdapterWithEvents(input: ProviderExecutionInput): Promise<ProviderExecutionResult> {
  const result = await executeProviderAdapter(input)
  const externalCallRecord = createExternalCallRecordFromProviderAdapterResult({
    externalCallId: input.externalCallId,
    request: input.request,
    result,
  })
  const eventRecord = parseOperationalEventStorageRecord({
    schemaVersion: RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION,
    recordId: `operational_event_${externalCallRecord.externalCallId}`,
    kind: 'external-call',
    workflowRunId: externalCallRecord.workflowRunId,
    stepRunId: externalCallRecord.stepRunId,
    occurredAt: externalCallRecord.finishedAt ?? externalCallRecord.startedAt,
    event: externalCallRecord,
  })

  input.eventSink.appendOperationalEvent(eventRecord)

  return Object.freeze({ result, externalCallRecord })
}

class ProviderAdapterTimeoutError extends Error {
  constructor() {
    super('provider adapter timed out')
    this.name = 'ProviderAdapterTimeoutError'
  }
}

class ProviderAdapterAbortedError extends Error {
  constructor() {
    super('provider adapter aborted')
    this.name = 'ProviderAdapterAbortedError'
  }
}

async function executeProviderAdapter(input: ProviderExecutionInput): Promise<ProviderAdapterResult> {
  try {
    const rawResult = await executeAdapterWithTimeout(input)
    return parseProviderAdapterResult(rawResult)
  } catch (error) {
    if (error instanceof ProviderAdapterTimeoutError) {
      return createFailureResult(input, 'timed-out', 'timeout', 'provider adapter timed out')
    }

    if (error instanceof ProviderAdapterAbortedError || isAbortError(error)) {
      return createFailureResult(input, 'failed', 'unknown', 'provider adapter aborted before returning a result')
    }

    return createFailureResult(input, 'failed', 'provider-error', 'provider adapter failed before returning a result')
  }
}

async function executeAdapterWithTimeout(input: ProviderExecutionInput): Promise<unknown> {
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | null = null
  let onAbort: (() => void) | null = null

  const execution = Promise.resolve().then(() => input.adapter.execute(input.request, controller.signal))
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort()
      reject(new ProviderAdapterTimeoutError())
    }, input.request.timeoutMs)
  })
  const abortPromise = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      controller.abort()
      reject(new ProviderAdapterAbortedError())
    }

    if (input.signal.aborted) {
      onAbort()
      return
    }

    input.signal.addEventListener('abort', onAbort, { once: true })
  })

  try {
    return await Promise.race([execution, timeoutPromise, abortPromise])
  } finally {
    if (timeout !== null) clearTimeout(timeout)
    if (onAbort !== null) input.signal.removeEventListener('abort', onAbort)
    execution.catch(() => undefined)
  }
}

function createFailureResult(
  input: ProviderExecutionInput,
  status: 'failed' | 'timed-out',
  errorClass: NonNullable<ProviderAdapterResult['error']>['class'],
  message: string,
): ProviderAdapterResult {
  return parseProviderAdapterResult({
    schemaVersion: PROVIDER_ADAPTER_RESULT_SCHEMA_VERSION,
    requestId: input.request.requestId,
    status,
    output: null,
    outputSummary: null,
    error: {
      class: errorClass,
      message,
    },
    finishedAt: (input.clock?.now() ?? new Date()).toISOString(),
  })
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
