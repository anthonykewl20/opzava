import { z } from 'zod'

export const SEO_BRIEF_SCHEMA_VERSION = 1 as const

// An SEO brief artifact: the first content artifact that composes three upstream lineage links
// (idea + keyword research + source capture) into a structured brief before any drafting begins.
// Pure, versioned value object — no providers, runner, or side effects.
export const seoBriefSchema = z.object({
  schemaVersion: z.literal(SEO_BRIEF_SCHEMA_VERSION),
  briefId: z.string().min(1).max(120),
  ideaId: z.string().min(1).max(120),
  keywordResearchId: z.string().min(1).max(120),
  sourceCaptureId: z.string().min(1).max(120),
  primaryKeyword: z.string().min(1).max(200),
  secondaryKeywords: z.array(z.string().min(1).max(200)).optional(),
  targetAudience: z.string().min(1).max(500),
  searchIntent: z.enum(['informational', 'commercial', 'transactional', 'navigational']),
  recommendedHeadings: z.array(z.string().min(1).max(200)).min(1),
  wordCountTarget: z.number().int().positive(),
  createdAt: z.string().min(1),
}).strict()

export type SeoBrief = Readonly<z.infer<typeof seoBriefSchema>>

export function parseSeoBrief(input: unknown): SeoBrief {
  return Object.freeze(seoBriefSchema.parse(input))
}
