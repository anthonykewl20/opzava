import { describe, it, expect } from 'vitest'
import {
  createSocialScheduleRequestStepService,
  parseSocialScheduleRequestInput,
} from './social-schedule-request-service'

const deps = () => ({
  newId: () => 'sched-1',
  now: () => '2026-07-03T00:00:00.000Z',
})

const validInput = {
  postDraftArtifactId: 'soc-1',
  reviewArtifactId: 'rev-1',
  approvalId: 'apr-soc-1',
  approvalGranted: true,
  platform: 'x',
  scheduledAt: '2026-07-10T09:00:00.000Z',
  sourceStepRunId: 'step-5',
} as const

describe('social-schedule-request step service', () => {
  it('produces a scheduled social-schedule-request artifact', () => {
    const art = createSocialScheduleRequestStepService(deps()).run(validInput)
    expect(art.artifactType).toBe('social-schedule-request')
    const c = art.content as unknown as { status: string; platform: string; scheduledAt: string }
    expect(c.status).toBe('scheduled')
    expect(c.platform).toBe('x')
    expect(c.scheduledAt).toBe('2026-07-10T09:00:00.000Z')
  })

  it('records the upstream artifacts and the approval in lineage', () => {
    const art = createSocialScheduleRequestStepService(deps()).run(validInput)
    expect(art.lineage.inputArtifactIds).toEqual(['soc-1', 'rev-1', 'apr-soc-1'])
  })

  it("honors desiredStatus 'draft' but there is no published path", () => {
    const art = createSocialScheduleRequestStepService(deps()).run({
      ...validInput,
      desiredStatus: 'draft',
    })
    expect((art.content as unknown as { status: string }).status).toBe('draft')
  })

  it('rejects an ungranted approval (no scheduling without approval)', () => {
    expect(() =>
      createSocialScheduleRequestStepService(deps()).run({
        ...validInput,
        approvalGranted: false,
      })
    ).toThrow(/social scheduling requires a granted approval/)
  })

  it("parseSocialScheduleRequestInput rejects a 'published' desiredStatus", () => {
    expect(() =>
      parseSocialScheduleRequestInput({ ...validInput, desiredStatus: 'published' })
    ).toThrow(/invalid social schedule request input/)
  })

  it('parseSocialScheduleRequestInput rejects a missing field', () => {
    expect(() =>
      parseSocialScheduleRequestInput({
        postDraftArtifactId: 'a',
        reviewArtifactId: 'b',
        approvalId: 'c',
        approvalGranted: true,
        platform: 'x',
      })
    ).toThrow()
  })
})
