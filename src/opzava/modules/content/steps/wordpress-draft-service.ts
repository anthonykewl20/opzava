import { z } from 'zod'
import { parseArticleDraft, type ArticleDraft } from '../contracts/article-draft'
import { parseWordpressDraftRequest } from '../contracts/wordpress-draft-request'
import { parseApproval, isApprovalGranted, type Approval } from '@/opzava/core/approvals/contracts'
import { parseArtifact, type Artifact } from '@/opzava/core/artifacts/contracts'
import { getContentStepOutput } from '../workflow/content-step-outputs'
import type { ContentStepService } from './step-service'
import type { WordpressDraftProvider } from './wordpress-draft-provider'

export type WordpressDraftStepInput = Readonly<{
  articleDraftArtifact: Artifact
  articleDraft: ArticleDraft
  sourceCaptureArtifact: Artifact
  factCheckArtifact: Artifact
  brandReviewArtifact: Artifact
  antiSlopArtifact: Artifact
  approval: Approval
  sourceStepRunId: string
}>

export function parseWordpressDraftStepInput(payload: unknown): WordpressDraftStepInput {
  const schema = z.object({
    articleDraftArtifact: z.unknown(),
    sourceCaptureArtifact: z.unknown(),
    factCheckArtifact: z.unknown(),
    brandReviewArtifact: z.unknown(),
    antiSlopArtifact: z.unknown(),
    approval: z.unknown(),
    sourceStepRunId: z.string().min(1).max(120),
  }).strict()

  const parsed = schema.parse(payload)

  const articleDraftArtifact = parseArtifact(parsed.articleDraftArtifact)
  if (articleDraftArtifact.artifactType !== 'article-draft') {
    throw new Error('expected an article-draft artifact')
  }

  const sourceCaptureArtifact = parseArtifact(parsed.sourceCaptureArtifact)
  if (sourceCaptureArtifact.artifactType !== 'source-capture') {
    throw new Error('expected a source-capture artifact')
  }

  const factCheckArtifact = parseArtifact(parsed.factCheckArtifact)
  if (factCheckArtifact.artifactType !== 'fact-check-report') {
    throw new Error('expected a fact-check-report artifact')
  }

  const brandReviewArtifact = parseArtifact(parsed.brandReviewArtifact)
  if (brandReviewArtifact.artifactType !== 'brand-review') {
    throw new Error('expected a brand-review artifact')
  }

  const antiSlopArtifact = parseArtifact(parsed.antiSlopArtifact)
  if (antiSlopArtifact.artifactType !== 'anti-slop-review') {
    throw new Error('expected an anti-slop-review artifact')
  }

  const approval = parseApproval(parsed.approval)
  if (!isApprovalGranted(approval)) {
    throw new Error('wordpress-draft requires a granted approval')
  }

  return Object.freeze({
    articleDraftArtifact,
    articleDraft: parseArticleDraft(articleDraftArtifact.content),
    sourceCaptureArtifact,
    factCheckArtifact,
    brandReviewArtifact,
    antiSlopArtifact,
    approval,
    sourceStepRunId: parsed.sourceStepRunId,
  })
}

export function createWordpressDraftStepService(
  deps: Readonly<{
    provider: WordpressDraftProvider
    newId: () => string
    now: () => string
  }>
): ContentStepService<WordpressDraftStepInput, ReturnType<typeof parseWordpressDraftRequest>> {
  return Object.freeze({
    stepId: 'wordpress-draft',
    run: (input) => {
      const rendered = deps.provider({ articleDraft: input.articleDraft })

      const request = parseWordpressDraftRequest({
        schemaVersion: 1,
        requestId: deps.newId(),
        ideaId: input.articleDraft.ideaId,
        draftId: input.articleDraftArtifact.artifactId,
        approvalId: input.approval.approvalId,
        title: input.articleDraft.title,
        bodyMarkdown: rendered.bodyMarkdown,
        status: 'draft',
        gateArtifacts: {
          sourceCaptureId: input.sourceCaptureArtifact.artifactId,
          factCheckReportId: input.factCheckArtifact.artifactId,
          brandReviewId: input.brandReviewArtifact.artifactId,
          antiSlopReviewId: input.antiSlopArtifact.artifactId,
        },
        createdAt: deps.now(),
      })

      return Object.freeze({
        stepId: 'wordpress-draft',
        output: getContentStepOutput('wordpress-draft'),
        record: request,
      })
    },
  })
}
