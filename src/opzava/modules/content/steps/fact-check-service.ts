import { z } from 'zod'
import { parseArticleDraft, type ArticleDraft } from '../contracts/article-draft'
import { parseSourceCapture, type SourceCapture } from '../contracts/source-capture'
import { parseFactCheckReport } from '../contracts/fact-check-report'
import { createContentArtifact } from '../artifacts/content-artifact'
import { parseArtifact, type Artifact } from '@/opzava/core/artifacts/contracts'
import { getContentStepOutput } from '../workflow/content-step-outputs'
import type { ContentStepService } from './step-service'
import type { FactCheckProvider } from './fact-check-provider'

export type FactCheckStepInput = Readonly<{
  articleDraftArtifact: Artifact
  articleDraft: ArticleDraft
  sourceCaptureArtifact: Artifact
  sourceCapture: SourceCapture
  sourceStepRunId: string
}>

export function parseFactCheckStepInput(payload: unknown): FactCheckStepInput {
  const schema = z.object({
    articleDraftArtifact: z.unknown(),
    sourceCaptureArtifact: z.unknown(),
    sourceStepRunId: z.string().min(1).max(120)
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
  return Object.freeze({
    articleDraftArtifact,
    articleDraft: parseArticleDraft(articleDraftArtifact.content),
    sourceCaptureArtifact,
    sourceCapture: parseSourceCapture(sourceCaptureArtifact.content),
    sourceStepRunId: parsed.sourceStepRunId
  })
}

export function createFactCheckStepService(
  deps: Readonly<{
    provider: FactCheckProvider
    newId: () => string
    now: () => string
  }>
): ContentStepService<FactCheckStepInput, Artifact> {
  return Object.freeze({
    stepId: 'fact-check',
    run: (input) => {
      const draft = deps.provider({
        articleDraft: input.articleDraft,
        sourceCapture: input.sourceCapture
      })
      const report = parseFactCheckReport({
        schemaVersion: 1,
        reportId: deps.newId(),
        draftId: input.articleDraftArtifact.artifactId,
        ideaId: input.articleDraft.ideaId,
        status: draft.status,
        checks: draft.checks,
        checkedAt: deps.now()
      })
      const artifact = createContentArtifact({
        artifactId: deps.newId(),
        artifactType: 'fact-check-report',
        sourceStepRunId: input.sourceStepRunId,
        content: report,
        inputArtifactIds: [
          input.articleDraft.ideaId,
          input.articleDraftArtifact.artifactId,
          input.sourceCaptureArtifact.artifactId
        ],
        validatedAt: deps.now()
      })
      return Object.freeze({
        stepId: 'fact-check',
        output: getContentStepOutput('fact-check'),
        record: artifact
      })
    }
  })
}
