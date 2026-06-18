import { describe, expect, it } from 'vitest'
import { createResendCampaignSender } from './resend-campaign-sender'
import { createLiveResendProviderAdapter, createLiveResendProviderProfile } from './resend-live-adapter'
import type { ResendHttpClient } from './resend-live-sender'

const connection = Object.freeze({ fromAddress: 'news@example.com', apiKey: 're_1' })

function sender(http: ResendHttpClient) {
  let n = 0
  return createResendCampaignSender({
    adapter: createLiveResendProviderAdapter({ connection, http, now: () => 't' }),
    profile: createLiveResendProviderProfile('secret_re_1'),
    workflowRunId: 'run',
    newId: () => `id_${++n}`,
    now: () => 't'
  })
}

describe('createResendCampaignSender', () => {
  it('sends an email through the live resend adapter and returns ok + messageId', async () => {
    const http: ResendHttpClient = async () => ({ ok: true, status: 200, json: async () => ({ id: 'msg_9' }) })
    const r = await sender(http)({ to: 'r@x.com', subject: 'Hi', html: '<p>Hi</p>' })
    expect(r.ok).toBe(true)
    expect(r.messageId).toBe('msg_9')
  })

  it('returns ok=false when the adapter call fails', async () => {
    const http: ResendHttpClient = async () => ({ ok: false, status: 401, json: async () => ({}) })
    const r = await sender(http)({ to: 'r@x.com', subject: 'Hi', html: '<p>Hi</p>' })
    expect(r.ok).toBe(false)
    expect(r.messageId).toBeNull()
  })

  it('is usable as a CampaignEmailSender by runEmailCampaign', async () => {
    const http: ResendHttpClient = async () => ({ ok: true, status: 200, json: async () => ({ id: 'm' }) })
    const { runEmailCampaign, parseEmailCampaign, EMAIL_CAMPAIGN_SCHEMA_VERSION } = await import('../workflow/email-campaign')
    const campaign = parseEmailCampaign({
      schemaVersion: EMAIL_CAMPAIGN_SCHEMA_VERSION,
      campaignId: 'c',
      name: 'n',
      recipients: ['a@x.com'],
      steps: [{ stepId: 's', subject: 'x', html: '<p>x</p>' }],
      createdAt: 't'
    })
    const res = await runEmailCampaign({ sender: sender(http), approvalGranted: true }, campaign)
    expect(res.status).toBe('sent')
    expect(res.records[0].messageId).toBe('m')
  })
})
