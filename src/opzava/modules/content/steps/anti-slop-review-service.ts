import { z } from 'zod'
import { parseArticleDraft, type ArticleDraft } from '../contracts/article-draft'
import { parseAntiSlopReview } from '../contracts/anti-slop-review'
import { createContentArtifact } from '../artifacts/content-artifact'
import { parseArtifact, type Artifact } from '@/opzava/core/artifacts/contracts'
import { getContentStepOutput } from '../workflow/content-step-outputs'
import type { ContentStepService } from './step-service'
import type { AntiSlopReviewProvider } from './anti-slop-review-provider'

export type AntiSlopReviewStepInput = Readonly<{
  articleDraftArtifact: Artifact
  articleDraft: ArticleDraft
  sourceStepRunId: string
}>

export function parseAntiSlopReviewStepInput(payload: unknown): AntiSlopReviewStepInput {
  const schema = z.object({
    articleDraftArtifact: z.unknown(),
    sourceStepRunId: z.string().min(1).max(120)
  }).strict()
  const parsed = schema.parse(payload)
  const articleDraftArtifact = parseArtifact(parsed.articleDraftArtifact)
  if (articleDraftArtifact.artifactType !== 'article-draft') {
    throw new Error('expected an article-draft artifact')
  }
  return Object.freeze({
    articleDraftArtifact,
    articleDraft: parseArticleDraft(articleDraftArtifact.content),
    sourceStepRunId: parsed.sourceStepRunId
  })
}

export function createAntiSlopReviewStepService(
  deps: Readonly<{ provider: AntiSlopReviewProvider; newId: () => string; now: () => string }>
): ContentStepService<AntiSlopReviewStepInput, Artifact> {
  return Object.freeze({
    stepId: 'anti-slop-review',
    run: (input) => {
      const draft = deps.provider({ articleDraft: input.articleDraft })
      const review = parseAntiSlopReview({
        schemaVersion: 1,
        reviewId: deps.newId(),
        draftId: input.articleDraftArtifact.artifactId,
        ideaId: input.articleDraft.ideaId,
        status: draft.status,
        detectedPatterns: draft.detectedPatterns,
        reviewedAt: deps.now()
      })
      const artifact = createContentArtifact({
        artifactId: deps.newId(),
        artifactType: 'anti-slop-review',
        sourceStepRunId: input.sourceStepRunId,
        content: review,
        inputArtifactIds: [input.articleDraft.ideaId, input.articleDraftArtifact.artifactId],
        validatedAt: deps.now()
      })
      return Object.freeze({
        stepId: 'anti-slop-review',
        output: getContentStepOutput('anti-slop-review'),
        record: artifact
      })
    }
  })
}
