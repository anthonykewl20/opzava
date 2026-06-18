import { describe, expect, it } from 'vitest'
import { computeCampaignSchedule } from './campaign-schedule'

describe('computeCampaignSchedule', () => {
  it('computes sendAt from the start time plus each step offset', () => {
    const s = computeCampaignSchedule({
      startAt: '2026-06-17T00:00:00.000Z',
      steps: [
        { stepId: 's1', offsetHours: 0 },
        { stepId: 's2', offsetHours: 24 },
        { stepId: 's3', offsetHours: 72 }
      ]
    })
    expect(s.length).toBe(3)
    expect(s[0].sendAt).toBe('2026-06-17T00:00:00.000Z')
    expect(s[1].sendAt).toBe('2026-06-18T00:00:00.000Z')
    expect(s[2].sendAt).toBe('2026-06-20T00:00:00.000Z')
  })

  it('rejects a negative offset', () => {
    expect(() => computeCampaignSchedule({
      startAt: '2026-06-17T00:00:00.000Z',
      steps: [{ stepId: 's', offsetHours: -1 }]
    })).toThrow()
  })

  it('rejects an invalid start date', () => {
    expect(() => computeCampaignSchedule({
      startAt: 'not-a-date',
      steps: [{ stepId: 's', offsetHours: 0 }]
    })).toThrow(/valid date/)
  })

  it('rejects duplicate step ids', () => {
    expect(() => computeCampaignSchedule({
      startAt: '2026-06-17T00:00:00.000Z',
      steps: [
        { stepId: 'x', offsetHours: 0 },
        { stepId: 'x', offsetHours: 1 }
      ]
    })).toThrow(/duplicate/)
  })
})
