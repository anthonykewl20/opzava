import { executeProviderAdapterWithEvents, type ProviderExecutionEventSink, type ProviderExecutionClock, type ProviderExecutionResult } from '@/opzava/platform/providers/execution'
import { createProviderExecutionCostOperationalEvent } from '@/opzava/platform/providers/cost-events'
import { createProviderExecutionAuditOperationalEvent } from '@/opzava/platform/providers/audit-events'
import { parseProviderAdapterRequest, type ProviderAdapter } from '@/opzava/platform/providers/contracts'
import type { IdeaIntake } from '../contracts/idea-intake'
import type { Outline } from '../contracts/outline'
import type { SourceCapture } from '../contracts/source-capture'
import { createMockArticleDraftProviderProfile, ARTICLE_DRAFT_OPERATION } from './article-draft-adapter'

export type ArticleDraftProviderCallInput = Readonly<{
  idea: IdeaIntake
  outline: Outline
  sourceCapture: SourceCapture
  workflowRunId: string
  stepRunId: string
}>

export type ArticleDraftProviderCallDeps = Readonly<{
  adapter: ProviderAdapter
  eventSink: ProviderExecutionEventSink
  newId: () => string
  now: () => string
  actorId: string
  clock?: ProviderExecutionClock
  signal?: AbortSignal
}>

export async function runArticleDraftProviderCall(
  deps: ArticleDraftProviderCallDeps,
  input: ArticleDraftProviderCallInput
): Promise<ProviderExecutionResult> {
  const startedAt = deps.now()

  const request = parseProviderAdapterRequest({
    schemaVersion: 1,
    requestId: deps.newId(),
    providerProfile: createMockArticleDraftProviderProfile(),
    operation: ARTICLE_DRAFT_OPERATION,
    workflowRunId: input.workflowRunId,
    stepRunId: input.stepRunId,
    idempotencyKey: `workflow:${input.workflowRunId}:step:${input.stepRunId}:${ARTICLE_DRAFT_OPERATION}`,
    timeoutMs: 30_000,
    retry: { attemptNumber: 1, maxAttempts: 3 },
    input: { idea: input.idea, outline: input.outline, sourceCapture: input.sourceCapture },
    requestSummary: { ideaId: input.idea.ideaId },
    startedAt
  })

  const externalCallId = deps.newId()

  const execution = await executeProviderAdapterWithEvents({
    adapter: deps.adapter,
    request,
    externalCallId,
    eventSink: deps.eventSink,
    signal: deps.signal ?? new AbortController().signal,
    clock: deps.clock
  })

  const occurredAt = execution.externalCallRecord.finishedAt ?? execution.externalCallRecord.startedAt

  deps.eventSink.appendOperationalEvent(
    createProviderExecutionCostOperationalEvent({
      recordId: `operational_event_cost_${externalCallId}`,
      costEventId: deps.newId(),
      actorId: deps.actorId,
      occurredAt,
      requestId: request.requestId,
      providerId: request.providerProfile.providerId,
      operation: request.operation,
      workflowRunId: input.workflowRunId,
      stepRunId: input.stepRunId,
      externalCallId,
      units: { requests: 1 },
      estimatedCostCents: 0,
      actualCostCents: 0,
      currency: 'USD'
    })
  )

  deps.eventSink.appendOperationalEvent(
    createProviderExecutionAuditOperationalEvent({
      recordId: `operational_event_audit_${externalCallId}`,
      auditEventId: deps.newId(),
      actorId: deps.actorId,
      occurredAt,
      requestId: request.requestId,
      providerId: request.providerProfile.providerId,
      operation: request.operation,
      workflowRunId: input.workflowRunId,
      stepRunId: input.stepRunId,
      externalCallId,
      status: execution.result.status
    })
  )

  return execution
}
