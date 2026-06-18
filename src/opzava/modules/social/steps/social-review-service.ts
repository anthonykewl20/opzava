import { createSocialArtifact } from '../artifacts/social-artifact'
import { type Artifact } from '@/opzava/core/artifacts/contracts'

export type SocialReviewInput = Readonly<{
  postDraftArtifactId: string
  text: string
  platform: string
  sourceStepRunId: string
}>

export type SocialReviewIssue = Readonly<{ code: string; reason: string }>

export type SocialReviewDraft = Readonly<{
  status: 'passed' | 'rejected'
  issues: readonly SocialReviewIssue[]
}>

export type SocialReviewProvider = (input: SocialReviewInput) => SocialReviewDraft

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0

export function parseSocialReviewInput(payload: unknown): SocialReviewInput {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('invalid social review input')
  }
  const candidate = payload as Record<string, unknown>
  const postDraftArtifactId = candidate['postDraftArtifactId']
  const text = candidate['text']
  const platform = candidate['platform']
  const sourceStepRunId = candidate['sourceStepRunId']
  if (
    !isNonEmptyString(postDraftArtifactId) ||
    !isNonEmptyString(text) ||
    !isNonEmptyString(platform) ||
    !isNonEmptyString(sourceStepRunId)
  ) {
    throw new Error('invalid social review input')
  }
  return Object.freeze({
    postDraftArtifactId,
    text,
    platform,
    sourceStepRunId,
  })
}

export function assertSocialReviewVerdict(draft: SocialReviewDraft): SocialReviewDraft {
  const status = draft.status
  const issues = draft.issues
  if (status === 'passed') {
    if (issues.length !== 0) {
      throw new Error('a passed social review must have no issues')
    }
    return draft
  }
  if (status === 'rejected') {
    if (issues.length === 0) {
      throw new Error('a rejected social review must list issues with reasons')
    }
    for (const issue of issues) {
      if (!isNonEmptyString(issue.code) || !isNonEmptyString(issue.reason)) {
        throw new Error('a rejected social review must list issues with reasons')
      }
    }
    return draft
  }
  throw new Error('invalid social review verdict status')
}

export function createMockSocialReviewProvider(): SocialReviewProvider {
  return () => Object.freeze({ status: 'passed', issues: Object.freeze([]) })
}

export type SocialReviewStepDeps = Readonly<{
  provider: SocialReviewProvider
  newId: () => string
  now: () => string
}>

export function createSocialReviewStepService(
  deps: SocialReviewStepDeps,
): Readonly<{ run: (payload: unknown) => Artifact }> {
  return {
    run: (payload: unknown): Artifact => {
      const input = parseSocialReviewInput(payload)
      const draft = assertSocialReviewVerdict(deps.provider(input))
      return createSocialArtifact({
        artifactId: deps.newId(),
        artifactType: 'social-review',
        sourceStepRunId: input.sourceStepRunId,
        content: draft,
        inputArtifactIds: [input.postDraftArtifactId],
        validatedAt: deps.now(),
      })
    },
  }
}
