import { z } from 'zod'

export const BRAND_REVIEW_SCHEMA_VERSION = 1 as const

// A brand check: one dimension of the draft judged against brand/style rules. A 'fail' verdict must
// carry a note — a failed dimension without a reason is a veto without an explanation.
const brandCheckSchema = z.object({
  dimension: z.enum(['voice', 'structure', 'positioning', 'clarity', 'tone']),
  verdict: z.enum(['pass', 'fail']),
  note: z.string().min(1).max(1000).optional(),
}).strict()

// A brand review artifact: a draft judged across explicit brand dimensions. Lineage references the
// originating draft and the idea behind it. A 'passed' status structurally requires every dimension
// check to pass, and every failed check must say why — the schema makes the verdict mean something.
// Pure, versioned value object — no providers, runner, or side effects.
export const brandReviewSchema = z.object({
  schemaVersion: z.literal(BRAND_REVIEW_SCHEMA_VERSION),
  reviewId: z.string().min(1).max(120),
  draftId: z.string().min(1).max(120),
  ideaId: z.string().min(1).max(120),
  status: z.enum(['passed', 'changes-requested']),
  checks: z.array(brandCheckSchema).min(1),
  reviewedAt: z.string().min(1),
}).strict().superRefine((review, ctx) => {
  review.checks.forEach((check, i) => {
    if (check.verdict === 'fail' && check.note === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['checks', i, 'note'],
        message: 'a failed brand check must include a note',
      })
    }
  })
  if (review.status === 'passed' && review.checks.some((c) => c.verdict === 'fail')) {
    ctx.addIssue({
      code: 'custom',
      path: ['status'],
      message: 'a passed brand review cannot contain a failed check',
    })
  }
})

export type BrandCheck = Readonly<z.infer<typeof brandCheckSchema>>
export type BrandReview = Readonly<z.infer<typeof brandReviewSchema>>

export function parseBrandReview(input: unknown): BrandReview {
  return Object.freeze(brandReviewSchema.parse(input))
}
