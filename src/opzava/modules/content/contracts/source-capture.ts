import { z } from 'zod'

export const SOURCE_CAPTURE_SCHEMA_VERSION = 1 as const

// One captured source with provenance fields (origin, capturedAt, extractionSummary) and optional
// trust/claim linkage. Optional fields stay out unless a provider supplies them.
const capturedSourceSchema = z.object({
  sourceId: z.string().min(1).max(120),
  origin: z.string().min(1).max(500),
  capturedAt: z.string().min(1),
  extractionSummary: z.string().min(1).max(2000),
  trustNotes: z.string().min(1).max(1000).optional(),
  supportsClaims: z.array(z.string().min(1).max(500)).optional(),
}).strict()

// A source-capture artifact: traceable sources for one idea. Pure, versioned value object.
// `ideaId` is a lineage reference to the originating IdeaIntake; source ids must be unique.
export const sourceCaptureSchema = z.object({
  schemaVersion: z.literal(SOURCE_CAPTURE_SCHEMA_VERSION),
  captureId: z.string().min(1).max(120),
  ideaId: z.string().min(1).max(120),
  sources: z.array(capturedSourceSchema).min(1),
  createdAt: z.string().min(1),
}).strict().superRefine((capture, ctx) => {
  const ids = capture.sources.map((s) => s.sourceId)
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['sources'],
      message: 'source ids must be unique within a capture',
    })
  }
})

export type CapturedSource = Readonly<z.infer<typeof capturedSourceSchema>>
export type SourceCapture = Readonly<z.infer<typeof sourceCaptureSchema>>

export function parseSourceCapture(input: unknown): SourceCapture {
  return Object.freeze(sourceCaptureSchema.parse(input))
}
