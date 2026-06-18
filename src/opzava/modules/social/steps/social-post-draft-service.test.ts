import { describe, it, expect } from 'vitest'
import {
  createSocialPostDraftStepService,
  createMockSocialPostDraftProvider,
  parseSocialPostDraftInput,
} from './social-post-draft-service'

function deps() {
  return {
    provider: createMockSocialPostDraftProvider(),
    newId: () => 'soc-1',
    now: () => '2026-07-01T00:00:00.000Z',
  }
}

const validInput = {
  briefArtifactId: 'brief-1',
  topic: 'Cold Brew',
  platform: 'x',
  sourceStepRunId: 'step-1',
}

describe('social-post-draft-service', () => {
  it('produces a social-post-draft artifact from a brief', () => {
    const svc = createSocialPostDraftStepService(deps())
    const art = svc.run(validInput)
    expect(art.artifactType).toBe('social-post-draft')
    expect(art.artifactId).toBe('soc-1')
    expect(art.sourceStepRunId).toBe('step-1')
    expect(art.lineage.inputArtifactIds).toEqual(['brief-1'])
    expect(art.validation.status).toBe('valid')
  })

  it('carries the provider draft as content', () => {
    const art = createSocialPostDraftStepService(deps()).run(validInput)
    const content = art.content as unknown as { platform: string; text: string; hashtags: readonly string[] }
    expect(content.platform).toBe('x')
    expect(content.text).toContain('Cold Brew')
    expect(content.hashtags).toEqual(['#coldbrew'])
  })

  it('parseSocialPostDraftInput rejects a missing field', () => {
    expect(() =>
      parseSocialPostDraftInput({ briefArtifactId: 'b', topic: 't', platform: 'x' }),
    ).toThrow(/invalid social post draft input/)
    expect(() =>
      parseSocialPostDraftInput({
        briefArtifactId: '',
        topic: 't',
        platform: 'x',
        sourceStepRunId: 's',
      }),
    ).toThrow()
  })

  it('createMockSocialPostDraftProvider returns a deterministic draft', () => {
    const p = createMockSocialPostDraftProvider()
    const d = p({ briefArtifactId: 'b', topic: 'Cold Brew', platform: 'instagram', sourceStepRunId: 's' })
    expect(d.platform).toBe('instagram')
    expect(d.text).toContain('Cold Brew')
    expect(d.hashtags).toEqual(['#coldbrew'])
  })

  it('the run output is a frozen Artifact', () => {
    const art = createSocialPostDraftStepService(deps()).run(validInput)
    expect(Object.isFrozen(art)).toBe(true)
  })
})
