import { describe, it, expect } from 'vitest'
import {
  createSocialReviewStepService,
  createMockSocialReviewProvider,
  parseSocialReviewInput,
  assertSocialReviewVerdict,
  type SocialReviewProvider,
} from './social-review-service'

const validInput = {
  postDraftArtifactId: 'soc-1',
  text: 'Hello',
  platform: 'x',
  sourceStepRunId: 'step-2',
}

const deps = (provider?: SocialReviewProvider) => ({
  provider: provider ?? createMockSocialReviewProvider(),
  newId: () => 'rev-1',
  now: () => '2026-07-01T00:00:00.000Z',
})

describe('social-review-service', () => {
  it('produces a passed social-review artifact by default', () => {
    const art = createSocialReviewStepService(deps()).run(validInput)
    expect(art.artifactType).toBe('social-review')
    expect(art.lineage.inputArtifactIds).toEqual(['soc-1'])
    const c = art.content as unknown as { status: string; issues: unknown[] }
    expect(c.status).toBe('passed')
    expect(c.issues).toEqual([])
  })

  it('produces a rejected review with issues', () => {
    const provider = () => ({
      status: 'rejected' as const,
      issues: [{ code: 'tone', reason: 'Off-brand tone.' }],
    })
    const art = createSocialReviewStepService(deps(provider)).run(validInput)
    const c = art.content as unknown as { status: string; issues: { code: string; reason: string }[] }
    expect(c.status).toBe('rejected')
    expect(c.issues).toHaveLength(1)
    expect(c.issues[0]!.reason).toBe('Off-brand tone.')
  })

  it('assertSocialReviewVerdict rejects a passed verdict that carries issues', () => {
    expect(() =>
      assertSocialReviewVerdict({
        status: 'passed',
        issues: [{ code: 'x', reason: 'y' }],
      }),
    ).toThrow(/passed social review must have no issues/)
  })

  it('assertSocialReviewVerdict rejects a rejected verdict with no issues', () => {
    expect(() =>
      assertSocialReviewVerdict({ status: 'rejected', issues: [] }),
    ).toThrow(/rejected social review must list issues/)
  })

  it('assertSocialReviewVerdict rejects a rejected issue missing a reason', () => {
    expect(() =>
      assertSocialReviewVerdict({
        status: 'rejected',
        issues: [{ code: 'x', reason: '' }],
      }),
    ).toThrow()
  })

  it('parseSocialReviewInput rejects a missing field', () => {
    expect(() =>
      parseSocialReviewInput({
        postDraftArtifactId: 'a',
        text: 't',
        platform: 'x',
      }),
    ).toThrow(/invalid social review input/)
  })
})
