import { z } from 'zod'

export const ANTI_SLOP_REVIEW_SCHEMA_VERSION = 1 as const

// A slop finding: one instance of generic, unsupported, formulaic, repetitive, or low-information
// output detected in the draft. A finding must name the pattern, its severity, the offending excerpt,
// and the specific fix required — a rejection without a required fix is a veto without a remedy.
const slopFindingSchema = z.object({
  pattern: z.enum(['generic', 'unsupported', 'formulaic', 'repetitive', 'low-information']),
  severity: z.enum(['low', 'medium', 'high']),
  excerpt: z.string().min(1).max(1000),
  requiredFix: z.string().min(1).max(1000),
}).strict()

// An anti-slop review artifact: a fact-checked and brand-reviewed draft judged for AI slop. Lineage
// references the originating draft and the idea behind it. A 'passed' status structurally requires
// zero detected patterns, and a 'rejected' status structurally requires at least one finding with a
// required fix — the schema makes the verdict mean what it says. Pure, versioned value object.
export const antiSlopReviewSchema = z.object({
  schemaVersion: z.literal(ANTI_SLOP_REVIEW_SCHEMA_VERSION),
  reviewId: z.string().min(1).max(120),
  draftId: z.string().min(1).max(120),
  ideaId: z.string().min(1).max(120),
  status: z.enum(['passed', 'rejected']),
  detectedPatterns: z.array(slopFindingSchema),
  reviewedAt: z.string().min(1),
}).strict().superRefine((review, ctx) => {
  if (review.status === 'passed' && review.detectedPatterns.length > 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['detectedPatterns'],
      message: 'a passed anti-slop review cannot list detected patterns',
    })
  }
  if (review.status === 'rejected' && review.detectedPatterns.length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['detectedPatterns'],
      message: 'a rejected anti-slop review must cite at least one detected pattern',
    })
  }
})

export type SlopFinding = Readonly<z.infer<typeof slopFindingSchema>>
export type AntiSlopReview = Readonly<z.infer<typeof antiSlopReviewSchema>>

export function parseAntiSlopReview(input: unknown): AntiSlopReview {
  return Object.freeze(antiSlopReviewSchema.parse(input))
}
