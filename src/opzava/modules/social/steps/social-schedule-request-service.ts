import { createSocialArtifact } from '../artifacts/social-artifact'
import { type Artifact } from '@/opzava/core/artifacts/contracts'

export type SocialScheduleStatus = 'scheduled' | 'draft'

export type SocialScheduleRequestInput = Readonly<{
  postDraftArtifactId: string
  reviewArtifactId: string
  approvalId: string
  approvalGranted: boolean
  platform: string
  scheduledAt: string
  desiredStatus?: SocialScheduleStatus
  sourceStepRunId: string
}>

export type SocialScheduleRequest = Readonly<{
  status: SocialScheduleStatus
  platform: string
  scheduledAt: string
}>

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

function isValidDesiredStatus(v: unknown): v is SocialScheduleStatus {
  return v === 'scheduled' || v === 'draft'
}

export function parseSocialScheduleRequestInput(payload: unknown): SocialScheduleRequestInput {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('invalid social schedule request input')
  }
  const p = payload as Record<string, unknown>
  if (
    !isNonEmptyString(p.postDraftArtifactId) ||
    !isNonEmptyString(p.reviewArtifactId) ||
    !isNonEmptyString(p.approvalId) ||
    !isNonEmptyString(p.platform) ||
    !isNonEmptyString(p.scheduledAt) ||
    !isNonEmptyString(p.sourceStepRunId)
  ) {
    throw new Error('invalid social schedule request input')
  }
  if (typeof p.approvalGranted !== 'boolean') {
    throw new Error('invalid social schedule request input')
  }
  if (p.desiredStatus !== undefined && !isValidDesiredStatus(p.desiredStatus)) {
    throw new Error('invalid social schedule request input')
  }
  return Object.freeze({
    postDraftArtifactId: p.postDraftArtifactId,
    reviewArtifactId: p.reviewArtifactId,
    approvalId: p.approvalId,
    approvalGranted: p.approvalGranted,
    platform: p.platform,
    scheduledAt: p.scheduledAt,
    desiredStatus: p.desiredStatus as SocialScheduleStatus | undefined,
    sourceStepRunId: p.sourceStepRunId,
  })
}

export type SocialScheduleStepDeps = Readonly<{
  newId: () => string
  now: () => string
}>

export function createSocialScheduleRequestStepService(
  deps: SocialScheduleStepDeps
): Readonly<{ run: (payload: unknown) => Artifact }> {
  return {
    run(payload: unknown): Artifact {
      const input = parseSocialScheduleRequestInput(payload)
      if (!input.approvalGranted) {
        throw new Error('social scheduling requires a granted approval')
      }
      const status: SocialScheduleStatus = input.desiredStatus ?? 'scheduled'
      const request: SocialScheduleRequest = {
        status,
        platform: input.platform,
        scheduledAt: input.scheduledAt,
      }
      return createSocialArtifact({
        artifactId: deps.newId(),
        artifactType: 'social-schedule-request',
        sourceStepRunId: input.sourceStepRunId,
        content: request,
        inputArtifactIds: [
          input.postDraftArtifactId,
          input.reviewArtifactId,
          input.approvalId,
        ],
        validatedAt: deps.now(),
      })
    },
  }
}
