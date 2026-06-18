import { describe, it, expect } from 'vitest'
import {
  parseCampaign,
  canTransitionCampaign,
  transitionCampaign,
  type Campaign,
} from './campaign'

function makeValidCampaign(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    campaignId: 'camp-1',
    name: 'Launch',
    status: 'draft',
    startAt: '2026-07-01T09:00:00.000Z',
    steps: [
      { stepId: 's1', subject: 'Hi', html: '<p>1</p>', offsetHours: 0 },
      { stepId: 's2', subject: 'Bye', html: '<p>2</p>', offsetHours: 24 },
    ],
    audience: {
      schemaVersion: 1,
      audienceId: 'aud-1',
      name: 'A',
      recipients: ['a@x.com', 'b@x.com'],
      createdAt: '2026-07-01T00:00:00.000Z',
    },
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  }
}

describe('parseCampaign', () => {
  it('accepts a valid draft campaign and returns it frozen', () => {
    const c = parseCampaign(makeValidCampaign()) as Campaign
    expect(c.status).toBe('draft')
    expect(c.campaignId).toBe('camp-1')
    expect(c.steps).toHaveLength(2)
    expect(Object.isFrozen(c)).toBe(true)
  })

  it('rejects duplicate step ids', () => {
    const bad = makeValidCampaign()
    bad.steps = [
      { stepId: 'dup', subject: 'A', html: '<p>a</p>', offsetHours: 0 },
      { stepId: 'dup', subject: 'B', html: '<p>b</p>', offsetHours: 1 },
    ]
    expect(() => parseCampaign(bad)).toThrow()
  })

  it('rejects unknown status and empty steps', () => {
    const badStatus = makeValidCampaign()
    ;(badStatus as { status: string }).status = 'live'
    expect(() => parseCampaign(badStatus)).toThrow()

    const noSteps = makeValidCampaign()
    ;(noSteps as { steps: unknown[] }).steps = []
    expect(() => parseCampaign(noSteps)).toThrow()
  })
})

describe('canTransitionCampaign', () => {
  it('follows the legal transition map', () => {
    expect(canTransitionCampaign('draft', 'approved')).toBe(true)
    expect(canTransitionCampaign('draft', 'sending')).toBe(false)
    expect(canTransitionCampaign('approved', 'sending')).toBe(true)
    expect(canTransitionCampaign('sent', 'approved')).toBe(false)
    expect(canTransitionCampaign('sent', 'failed')).toBe(false)
    expect(canTransitionCampaign('failed', 'sending')).toBe(true)
  })
})

describe('transitionCampaign', () => {
  it('transitions draft -> approved and updates updatedAt', () => {
    const original = parseCampaign(makeValidCampaign()) as Campaign
    const next = transitionCampaign(
      original,
      'approved',
      '2026-07-02T00:00:00.000Z',
    )
    expect(next.status).toBe('approved')
    expect(next.updatedAt).toBe('2026-07-02T00:00:00.000Z')
    expect(next.campaignId).toBe(original.campaignId)
    expect(original.status).toBe('draft')
    expect(original.updatedAt).toBe('2026-07-01T00:00:00.000Z')
    expect(Object.isFrozen(next)).toBe(true)
  })

  it('throws on an illegal transition', () => {
    const original = parseCampaign(makeValidCampaign()) as Campaign
    expect(() =>
      transitionCampaign(original, 'sending', '2026-07-02T00:00:00.000Z'),
    ).toThrow(/illegal campaign transition/)
  })
})
