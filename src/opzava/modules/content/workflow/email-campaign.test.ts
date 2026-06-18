import { describe, expect, it, vi } from 'vitest'
import {
  parseEmailCampaign,
  runEmailCampaign,
  EMAIL_CAMPAIGN_SCHEMA_VERSION,
  type CampaignEmailSender
} from './email-campaign'

function campaign() {
  return parseEmailCampaign({
    schemaVersion: EMAIL_CAMPAIGN_SCHEMA_VERSION,
    campaignId: 'c1',
    name: 'Launch',
    recipients: ['a@x.com', 'b@x.com'],
    steps: [
      { stepId: 's1', subject: 'Hi', html: '<p>Hi</p>' },
      { stepId: 's2', subject: 'Day 2', html: '<p>2</p>' }
    ],
    createdAt: 't'
  })
}

const okSender: CampaignEmailSender = async () => ({ ok: true, messageId: 'm' })

describe('email-campaign', () => {
  it('sends every step to every recipient when approved', async () => {
    const sender = vi.fn(okSender)
    const r = await runEmailCampaign({ sender, approvalGranted: true }, campaign())
    expect(r.status).toBe('sent')
    expect(r.records.length).toBe(4)
    expect(sender).toHaveBeenCalledTimes(4)
  })

  it('halts before sending when approval is not granted', async () => {
    const sender = vi.fn(okSender)
    await expect(
      runEmailCampaign({ sender, approvalGranted: false }, campaign())
    ).rejects.toThrow(/approval not granted/)
    expect(sender).not.toHaveBeenCalled()
  })

  it('reports partial when a send fails', async () => {
    let n = 0
    const sender: CampaignEmailSender = async () => {
      n++
      return { ok: n !== 1, messageId: n !== 1 ? 'm' : null }
    }
    const r = await runEmailCampaign({ sender, approvalGranted: true }, campaign())
    expect(r.status).toBe('partial')
  })

  it('rejects a campaign with a non-email recipient', () => {
    expect(() =>
      parseEmailCampaign({
        schemaVersion: EMAIL_CAMPAIGN_SCHEMA_VERSION,
        campaignId: 'c',
        name: 'n',
        recipients: ['bad'],
        steps: [{ stepId: 's', subject: 'x', html: '<p>x</p>' }],
        createdAt: 't'
      })
    ).toThrow()
  })
})
