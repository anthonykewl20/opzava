import { z } from 'zod'
import { parseIdeaIntake, type IdeaIntake } from '../contracts/idea-intake'
import { parseSeoBrief, type SeoBrief } from '../contracts/seo-brief'
import { parseOutline } from '../contracts/outline'
import { createContentArtifact } from '../artifacts/content-artifact'
import { parseArtifact, type Artifact } from '@/opzava/core/artifacts/contracts'
import { getContentStepOutput } from '../workflow/content-step-outputs'
import type { ContentStepService } from './step-service'
import type { OutlineProvider } from './outline-provider'

export type OutlineStepInput = Readonly<{
  idea: IdeaIntake
  seoBriefArtifact: Artifact
  seoBrief: SeoBrief
  sourceStepRunId: string
}>

export function parseOutlineStepInput(payload: unknown): OutlineStepInput {
  const schema = z
    .object({
      idea: z.unknown(),
      seoBriefArtifact: z.unknown(),
      sourceStepRunId: z.string().min(1).max(120)
    })
    .strict()
  const parsed = schema.parse(payload)
  const seoBriefArtifact = parseArtifact(parsed.seoBriefArtifact)
  if (seoBriefArtifact.artifactType !== 'seo-brief') {
    throw new Error('expected an seo-brief artifact')
  }
  return Object.freeze({
    idea: parseIdeaIntake(parsed.idea),
    seoBriefArtifact,
    seoBrief: parseSeoBrief(seoBriefArtifact.content),
    sourceStepRunId: parsed.sourceStepRunId
  })
}

export function createOutlineStepService(
  deps: Readonly<{ provider: OutlineProvider; newId: () => string; now: () => string }>
): ContentStepService<OutlineStepInput, Artifact> {
  return Object.freeze({
    stepId: 'outline',
    run: (input) => {
      const draft = deps.provider({ idea: input.idea, seoBrief: input.seoBrief })
      const outline = parseOutline({
        schemaVersion: 1,
        outlineId: deps.newId(),
        briefId: input.seoBriefArtifact.artifactId,
        ideaId: input.idea.ideaId,
        title: draft.title,
        sections: draft.sections,
        createdAt: deps.now()
      })
      const artifact = createContentArtifact({
        artifactId: deps.newId(),
        artifactType: 'outline',
        sourceStepRunId: input.sourceStepRunId,
        content: outline,
        inputArtifactIds: [input.idea.ideaId, input.seoBriefArtifact.artifactId],
        validatedAt: deps.now()
      })
      return Object.freeze({
        stepId: 'outline',
        output: getContentStepOutput('outline'),
        record: artifact
      })
    }
  })
}
