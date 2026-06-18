import { z } from 'zod'

export const WORDPRESS_DRAFT_REQUEST_SCHEMA_VERSION = 1 as const

// The terminal content artifact: a draft-only WordPress request payload. The `status` literal 'draft'
// makes publishing structurally impossible here — there is no field through which a draft can become a
// published post. The request also cannot be constructed without an `approvalId` (a prior human
// approval) and all four quality-gate artifact ids (source capture, fact-check report, brand review,
// anti-slop review) — the milestone's "no auto-publish, all gates required" rule encoded as a type.
// Pure, versioned value object; no providers, runner, or network.
const gateArtifactsSchema = z.object({
  sourceCaptureId: z.string().min(1).max(120),
  factCheckReportId: z.string().min(1).max(120),
  brandReviewId: z.string().min(1).max(120),
  antiSlopReviewId: z.string().min(1).max(120),
}).strict()

export const wordpressDraftRequestSchema = z.object({
  schemaVersion: z.literal(WORDPRESS_DRAFT_REQUEST_SCHEMA_VERSION),
  requestId: z.string().min(1).max(120),
  ideaId: z.string().min(1).max(120),
  draftId: z.string().min(1).max(120),
  approvalId: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  bodyMarkdown: z.string().min(1).max(100000),
  status: z.literal('draft'),
  gateArtifacts: gateArtifactsSchema,
  createdAt: z.string().min(1),
}).strict()

export type WordpressDraftGateArtifacts = Readonly<z.infer<typeof gateArtifactsSchema>>
export type WordpressDraftRequest = Readonly<z.infer<typeof wordpressDraftRequestSchema>>

export function parseWordpressDraftRequest(input: unknown): WordpressDraftRequest {
  return Object.freeze(wordpressDraftRequestSchema.parse(input))
}
