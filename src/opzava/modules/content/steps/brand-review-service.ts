import { z } from 'zod'
import { parseArticleDraft, type ArticleDraft } from '../contracts/article-draft'
import { parseBrandReview } from '../contracts/brand-review'
import { createContentArtifact } from '../artifacts/content-artifact'
import { parseArtifact, type Artifact } from '@/opzava/core/artifacts/contracts'
import { getContentStepOutput } from '../workflow/content-step-outputs'
import type { ContentStepService } from './step-service'
import type { BrandReviewProvider } from './brand-review-provider'

export type BrandReviewStepInput = Readonly<{
  articleDraftArtifact: Artifact
  articleDraft: ArticleDraft
  sourceStepRunId: string
}>

export function parseBrandReviewStepInput(payload: unknown): BrandReviewStepInput {
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

export function createBrandReviewStepService(
  deps: Readonly<{ provider: BrandReviewProvider; newId: () => string; now: () => string }>
): ContentStepService<BrandReviewStepInput, Artifact> {
  return Object.freeze({
    stepId: 'brand-review',
    run: (input) => {
      const draft = deps.provider({ articleDraft: input.articleDraft })

      const review = parseBrandReview({
        schemaVersion: 1,
        reviewId: deps.newId(),
        draftId: input.articleDraftArtifact.artifactId,
        ideaId: input.articleDraft.ideaId,
        status: draft.status,
        checks: draft.checks,
        reviewedAt: deps.now()
      })

      const artifact = createContentArtifact({
        artifactId: deps.newId(),
        artifactType: 'brand-review',
        sourceStepRunId: input.sourceStepRunId,
        content: review,
        inputArtifactIds: [input.articleDraft.ideaId, input.articleDraftArtifact.artifactId],
        validatedAt: deps.now()
      })

      return Object.freeze({
        stepId: 'brand-review',
        output: getContentStepOutput('brand-review'),
        record: artifact
      })
    }
  })
}
