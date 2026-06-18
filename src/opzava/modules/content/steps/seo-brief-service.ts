import { z } from 'zod'
import { parseIdeaIntake, type IdeaIntake } from '../contracts/idea-intake'
import { parseKeywordResearch, type KeywordResearch } from '../contracts/keyword-research'
import { parseSourceCapture, type SourceCapture } from '../contracts/source-capture'
import { parseSeoBrief } from '../contracts/seo-brief'
import { createContentArtifact } from '../artifacts/content-artifact'
import { parseArtifact, type Artifact } from '@/opzava/core/artifacts/contracts'
import { getContentStepOutput } from '../workflow/content-step-outputs'
import type { ContentStepService } from './step-service'
import type { SeoBriefProvider } from './seo-brief-provider'

export type SeoBriefStepInput = Readonly<{
  idea: IdeaIntake
  keywordResearchArtifact: Artifact
  keywordResearch: KeywordResearch
  sourceCaptureArtifact: Artifact
  sourceCapture: SourceCapture
  sourceStepRunId: string
}>

export function parseSeoBriefStepInput(payload: unknown): SeoBriefStepInput {
  const schema = z
    .object({
      idea: z.unknown(),
      keywordResearchArtifact: z.unknown(),
      sourceCaptureArtifact: z.unknown(),
      sourceStepRunId: z.string().min(1).max(120),
    })
    .strict()
  const parsed = schema.parse(payload)
  const keywordResearchArtifact = parseArtifact(parsed.keywordResearchArtifact)
  const sourceCaptureArtifact = parseArtifact(parsed.sourceCaptureArtifact)
  if (keywordResearchArtifact.artifactType !== 'keyword-research') {
    throw new Error('expected a keyword-research artifact')
  }
  if (sourceCaptureArtifact.artifactType !== 'source-capture') {
    throw new Error('expected a source-capture artifact')
  }
  return Object.freeze({
    idea: parseIdeaIntake(parsed.idea),
    keywordResearchArtifact,
    keywordResearch: parseKeywordResearch(keywordResearchArtifact.content),
    sourceCaptureArtifact,
    sourceCapture: parseSourceCapture(sourceCaptureArtifact.content),
    sourceStepRunId: parsed.sourceStepRunId,
  })
}

export function createSeoBriefStepService(
  deps: Readonly<{ provider: SeoBriefProvider; newId: () => string; now: () => string }>,
): ContentStepService<SeoBriefStepInput, Artifact> {
  return Object.freeze({
    stepId: 'seo-brief',
    run: (input) => {
      const draft = deps.provider({
        idea: input.idea,
        keywordResearch: input.keywordResearch,
        sourceCapture: input.sourceCapture,
      })
      const brief = parseSeoBrief({
        schemaVersion: 1,
        briefId: deps.newId(),
        ideaId: input.idea.ideaId,
        keywordResearchId: input.keywordResearchArtifact.artifactId,
        sourceCaptureId: input.sourceCaptureArtifact.artifactId,
        primaryKeyword: input.keywordResearch.primaryKeyword,
        secondaryKeywords: draft.secondaryKeywords,
        targetAudience: draft.targetAudience,
        searchIntent: draft.searchIntent,
        recommendedHeadings: draft.recommendedHeadings,
        wordCountTarget: draft.wordCountTarget,
        createdAt: deps.now(),
      })
      const artifact = createContentArtifact({
        artifactId: deps.newId(),
        artifactType: 'seo-brief',
        sourceStepRunId: input.sourceStepRunId,
        content: brief,
        inputArtifactIds: [
          input.idea.ideaId,
          input.keywordResearchArtifact.artifactId,
          input.sourceCaptureArtifact.artifactId,
        ],
        validatedAt: deps.now(),
      })
      return Object.freeze({
        stepId: 'seo-brief',
        output: getContentStepOutput('seo-brief'),
        record: artifact,
      })
    },
  })
}
