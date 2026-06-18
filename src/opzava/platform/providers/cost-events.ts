import { COST_EVENT_SCHEMA_VERSION, parseCostEvent } from '../costs/contracts'
import {
  parseOperationalEventStorageRecord,
  RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION,
  type OperationalEventStorageRecord,
} from '../runner/repository-contracts'

export type ProviderExecutionCostEventInput = Readonly<{
  recordId: string
  costEventId: string
  actorId: string
  occurredAt: string
  requestId: string
  providerId: string
  operation: string
  workflowRunId: string
  stepRunId: string | null
  externalCallId: string | null
  units: Readonly<Record<string, number>>
  estimatedCostCents: number
  actualCostCents?: number | null
  currency: string
}>

export function createProviderExecutionCostOperationalEvent(
  input: ProviderExecutionCostEventInput,
): OperationalEventStorageRecord {
  const event = parseCostEvent({
    schemaVersion: COST_EVENT_SCHEMA_VERSION,
    costEventId: input.costEventId,
    workflowRunId: input.workflowRunId,
    stepRunId: input.stepRunId,
    externalCallId: input.externalCallId,
    providerId: input.providerId,
    operation: input.operation,
    units: createUnitsSummary(input.units),
    estimatedCostCents: input.estimatedCostCents,
    actualCostCents: input.actualCostCents ?? null,
    currency: input.currency,
    recordedAt: input.occurredAt,
  })

  return parseOperationalEventStorageRecord({
    schemaVersion: RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION,
    recordId: input.recordId,
    kind: 'cost',
    workflowRunId: input.workflowRunId,
    stepRunId: input.stepRunId,
    occurredAt: input.occurredAt,
    event,
  })
}

function createUnitsSummary(units: Readonly<Record<string, number>>): Record<string, number> {
  const summary: Record<string, number> = {}
  for (const key of Object.keys(units)) {
    summary[key] = units[key]
  }

  return summary
}
