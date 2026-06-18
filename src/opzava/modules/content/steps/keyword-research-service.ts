import { z } from 'zod'
import { parseIdeaIntake, type IdeaIntake } from '../contracts/idea-intake'
import { parseKeywordResearch } from '../contracts/keyword-research'
import { createContentArtifact } from '../artifacts/content-artifact'
import type { Artifact } from '@/opzava/core/artifacts/contracts'
import { getContentStepOutput } from '../workflow/content-step-outputs'
import type { ContentStepService } from './step-service'
import type { KeywordResearchProvider } from './keyword-research-provider'

export type KeywordResearchStepInput = Readonly<{
  idea: IdeaIntake
  sourceStepRunId: string
}>

const keywordResearchStepInputSchema = z
  .object({
    idea: z.unknown(),
    sourceStepRunId: z.string().min(1).max(120)
  })
  .strict()

export function parseKeywordResearchStepInput(payload: unknown): KeywordResearchStepInput {
  const parsed = keywordResearchStepInputSchema.parse(payload)
  return Object.freeze({
    idea: parseIdeaIntake(parsed.idea),
    sourceStepRunId: parsed.sourceStepRunId
  })
}

export function createKeywordResearchStepService(
  deps: Readonly<{
    provider: KeywordResearchProvider
    newId: () => string
    now: () => string
  }>
): ContentStepService<KeywordResearchStepInput, Artifact> {
  return Object.freeze({
    stepId: 'keyword-research',
    run: (input: KeywordResearchStepInput) => {
      const draft = deps.provider(input.idea)
      const research = parseKeywordResearch({
        schemaVersion: 1,
        researchId: deps.newId(),
        ideaId: input.idea.ideaId,
        primaryKeyword: draft.primaryKeyword,
        candidates: draft.candidates,
        createdAt: deps.now()
      })
      const artifact = createContentArtifact({
        artifactId: deps.newId(),
        artifactType: 'keyword-research',
        sourceStepRunId: input.sourceStepRunId,
        content: research,
        inputArtifactIds: [input.idea.ideaId],
        validatedAt: deps.now()
      })
      return Object.freeze({
        stepId: 'keyword-research',
        output: getContentStepOutput('keyword-research'),
        record: artifact
      })
    }
  })
}
