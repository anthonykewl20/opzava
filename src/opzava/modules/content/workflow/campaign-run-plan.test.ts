import { describe, expect, it } from 'vitest'
import { planCampaignRun } from './campaign-run-plan'
import {
  parseCampaignAudience,
  CAMPAIGN_AUDIENCE_SCHEMA_VERSION,
} from './campaign-audience'

function audience() {
  return parseCampaignAudience({
    schemaVersion: CAMPAIGN_AUDIENCE_SCHEMA_VERSION,
    audienceId: 'a',
    name: 'List',
    recipients: ['x@a.com', 'y@a.com'],
    createdAt: 't',
  })
}

const steps = [
  { stepId: 's1', subject: 'Hi', html: '<p>1</p>', offsetHours: 0 },
  { stepId: 's2', subject: 'Day2', html: '<p>2</p>', offsetHours: 24 },
]

function input() {
  return {
    campaignId: 'c1',
    startAt: '2026-06-17T00:00:00.000Z',
    steps,
    audience: audience(),
  }
}

it('plans one send per step per recipient with correct sendAt', () => {
  const plan = planCampaignRun({ approvalGranted: true }, input())
  expect(plan.sends.length).toBe(4)

  const s1 = plan.sends.filter((s) => s.stepId === 's1')
  expect(s1.every((s) => s.sendAt === '2026-06-17T00:00:00.000Z')).toBe(true)

  const s2 = plan.sends.find((s) => s.stepId === 's2')
  expect(s2!.sendAt).toBe('2026-06-18T00:00:00.000Z')
})

it('gives each send a unique per-recipient idempotency key', () => {
  const plan = planCampaignRun({ approvalGranted: true }, input())
  const keys = plan.sends.map((s) => s.idempotencyKey)
  expect(new Set(keys).size).toBe(4)
})

it('refuses to plan without approval', () => {
  expect(() => planCampaignRun({ approvalGranted: false }, input())).toThrow(
    /approval not granted/
  )
})
