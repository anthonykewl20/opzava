import { z } from 'zod'

export const COST_EVENT_SCHEMA_VERSION = 1 as const
const safeNonNegativeIntegerSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)

export const costEventSchema = z.object({
  schemaVersion: z.literal(COST_EVENT_SCHEMA_VERSION),
  costEventId: z.string().min(1).max(120),
  workflowRunId: z.string().min(1).max(120),
  stepRunId: z.string().min(1).max(120).nullable(),
  externalCallId: z.string().min(1).max(120).nullable(),
  providerId: z.string().min(1).max(100),
  operation: z.string().min(1).max(120),
  units: z.record(z.string(), safeNonNegativeIntegerSchema),
  estimatedCostCents: safeNonNegativeIntegerSchema,
  actualCostCents: safeNonNegativeIntegerSchema.nullable(),
  currency: z.string().length(3),
  recordedAt: z.string().min(1),
}).strict()

export type CostEvent = Readonly<z.infer<typeof costEventSchema>>

export function parseCostEvent(input: unknown): CostEvent {
  return Object.freeze(costEventSchema.parse(input))
}
