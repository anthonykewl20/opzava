import { z } from 'zod'
import { parseIdeaIntake, type IdeaIntake } from '../contracts/idea-intake'
import { parseSourceCapture } from '../contracts/source-capture'
import { createContentArtifact } from '../artifacts/content-artifact'
import type { Artifact } from '@/opzava/core/artifacts/contracts'
import { getContentStepOutput } from '../workflow/content-step-outputs'
import type { ContentStepService } from './step-service'
import type { SourceCaptureProvider } from './source-capture-provider'

export type SourceCaptureStepInput = Readonly<{
  idea: IdeaIntake
  sourceStepRunId: string
}>

const sourceCaptureStepInputSchema = z
  .object({
    idea: z.unknown(),
    sourceStepRunId: z.string().min(1).max(120),
  })
  .strict()

export function parseSourceCaptureStepInput(payload: unknown): SourceCaptureStepInput {
  const parsed = sourceCaptureStepInputSchema.parse(payload)
  return Object.freeze({
    idea: parseIdeaIntake(parsed.idea),
    sourceStepRunId: parsed.sourceStepRunId,
  })
}

export function createSourceCaptureStepService(
  deps: Readonly<{
    provider: SourceCaptureProvider
    newId: () => string
    now: () => string
  }>,
): ContentStepService<SourceCaptureStepInput, Artifact> {
  return Object.freeze({
    stepId: 'source-capture',
    run: (input) => {
      const draft = deps.provider(input.idea)
      const capture = parseSourceCapture({
        schemaVersion: 1,
        captureId: deps.newId(),
        ideaId: input.idea.ideaId,
        sources: draft.sources,
        createdAt: deps.now(),
      })
      const artifact = createContentArtifact({
        artifactId: deps.newId(),
        artifactType: 'source-capture',
        sourceStepRunId: input.sourceStepRunId,
        content: capture,
        inputArtifactIds: [input.idea.ideaId],
        validatedAt: deps.now(),
      })
      return Object.freeze({
        stepId: 'source-capture',
        output: getContentStepOutput('source-capture'),
        record: artifact,
      })
    },
  })
}
