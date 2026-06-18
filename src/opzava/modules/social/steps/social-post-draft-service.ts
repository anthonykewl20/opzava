import { createSocialArtifact } from '../artifacts/social-artifact'
import { type Artifact } from '@/opzava/core/artifacts/contracts'

export type SocialPostDraftInput = Readonly<{
  briefArtifactId: string
  topic: string
  platform: string
  sourceStepRunId: string
}>

export type SocialPostDraft = Readonly<{
  text: string
  platform: string
  hashtags: readonly string[]
}>

export type SocialPostDraftProvider = (input: SocialPostDraftInput) => SocialPostDraft

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

export function parseSocialPostDraftInput(payload: unknown): SocialPostDraftInput {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('invalid social post draft input')
  }
  const p = payload as Record<string, unknown>
  if (
    !isNonEmptyString(p.briefArtifactId) ||
    !isNonEmptyString(p.topic) ||
    !isNonEmptyString(p.platform) ||
    !isNonEmptyString(p.sourceStepRunId)
  ) {
    throw new Error('invalid social post draft input')
  }
  return Object.freeze({
    briefArtifactId: p.briefArtifactId,
    topic: p.topic,
    platform: p.platform,
    sourceStepRunId: p.sourceStepRunId,
  })
}

export function createMockSocialPostDraftProvider(): SocialPostDraftProvider {
  return (input) => {
    const tag = `#${input.topic.replace(/\s+/g, '').toLowerCase()}`
    return Object.freeze({
      text: `Draft post about ${input.topic} for ${input.platform}.`,
      platform: input.platform,
      hashtags: Object.freeze([tag]),
    })
  }
}

export type SocialPostDraftStepDeps = Readonly<{
  provider: SocialPostDraftProvider
  newId: () => string
  now: () => string
}>

export function createSocialPostDraftStepService(
  deps: SocialPostDraftStepDeps,
): Readonly<{ run: (payload: unknown) => Artifact }> {
  return {
    run: (payload: unknown): Artifact => {
      const input = parseSocialPostDraftInput(payload)
      const draft = deps.provider(input)
      return createSocialArtifact({
        artifactId: deps.newId(),
        artifactType: 'social-post-draft',
        sourceStepRunId: input.sourceStepRunId,
        content: draft,
        inputArtifactIds: [input.briefArtifactId],
        validatedAt: deps.now(),
      })
    },
  }
}
