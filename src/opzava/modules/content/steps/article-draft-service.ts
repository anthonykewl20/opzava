import { z } from 'zod'
import { parseIdeaIntake, type IdeaIntake } from '../contracts/idea-intake'
import { parseOutline, type Outline } from '../contracts/outline'
import { parseSourceCapture, type SourceCapture } from '../contracts/source-capture'
import { parseArticleDraft } from '../contracts/article-draft'
import { createContentArtifact } from '../artifacts/content-artifact'
import { parseArtifact, type Artifact } from '@/opzava/core/artifacts/contracts'
import { getContentStepOutput } from '../workflow/content-step-outputs'
import type { ContentStepService } from './step-service'
import type { ArticleDraftProvider } from './article-draft-provider'

export type ArticleDraftStepInput = Readonly<{
  idea: IdeaIntake
  outlineArtifact: Artifact
  outline: Outline
  sourceCaptureArtifact: Artifact
  sourceCapture: SourceCapture
  sourceStepRunId: string
}>

export function parseArticleDraftStepInput(payload: unknown): ArticleDraftStepInput {
  const schema = z.object({
    idea: z.unknown(),
    outlineArtifact: z.unknown(),
    sourceCaptureArtifact: z.unknown(),
    sourceStepRunId: z.string().min(1).max(120)
  }).strict()

  const parsed = schema.parse(payload)
  const outlineArtifact = parseArtifact(parsed.outlineArtifact)
  if (outlineArtifact.artifactType !== 'outline') {
    throw new Error('expected an outline artifact')
  }
  const sourceCaptureArtifact = parseArtifact(parsed.sourceCaptureArtifact)
  if (sourceCaptureArtifact.artifactType !== 'source-capture') {
    throw new Error('expected a source-capture artifact')
  }

  return Object.freeze({
    idea: parseIdeaIntake(parsed.idea),
    outlineArtifact,
    outline: parseOutline(outlineArtifact.content),
    sourceCaptureArtifact,
    sourceCapture: parseSourceCapture(sourceCaptureArtifact.content),
    sourceStepRunId: parsed.sourceStepRunId
  })
}

export function createArticleDraftStepService(
  deps: Readonly<{
    provider: ArticleDraftProvider
    newId: () => string
    now: () => string
  }>
): ContentStepService<ArticleDraftStepInput, Artifact> {
  return Object.freeze({
    stepId: 'article-draft',
    run: (input) => {
      const draft = deps.provider({
        idea: input.idea,
        outline: input.outline,
        sourceCapture: input.sourceCapture
      })

      const articleDraft = parseArticleDraft({
        schemaVersion: 1,
        draftId: deps.newId(),
        outlineId: input.outlineArtifact.artifactId,
        briefId: input.outline.briefId,
        ideaId: input.idea.ideaId,
        title: draft.title,
        sections: draft.sections,
        wordCount: draft.wordCount,
        createdAt: deps.now()
      })

      const artifact = createContentArtifact({
        artifactId: deps.newId(),
        artifactType: 'article-draft',
        sourceStepRunId: input.sourceStepRunId,
        content: articleDraft,
        inputArtifactIds: [
          input.idea.ideaId,
          input.outlineArtifact.artifactId,
          input.sourceCaptureArtifact.artifactId
        ],
        validatedAt: deps.now()
      })

      return Object.freeze({
        stepId: 'article-draft',
        output: getContentStepOutput('article-draft'),
        record: artifact
      })
    }
  })
}
