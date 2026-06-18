import { describe, expect, it } from 'vitest'
import {
  parseCampaignAudience,
  dedupeRecipients,
  CAMPAIGN_AUDIENCE_SCHEMA_VERSION,
} from './campaign-audience'

describe('campaignAudience', () => {
  it('parses a valid audience', () => {
    const a = parseCampaignAudience({
      schemaVersion: CAMPAIGN_AUDIENCE_SCHEMA_VERSION,
      audienceId: 'a1',
      name: 'List',
      recipients: ['x@a.com', 'y@a.com'],
      createdAt: 't',
    })
    expect(a.recipients.length).toBe(2)
  })

  it('rejects duplicate recipients case-insensitively', () => {
    expect(() =>
      parseCampaignAudience({
        schemaVersion: CAMPAIGN_AUDIENCE_SCHEMA_VERSION,
        audienceId: 'a',
        name: 'n',
        recipients: ['X@a.com', 'x@a.com'],
        createdAt: 't',
      }),
    ).toThrow(/unique/)
  })

  it('rejects a non-email recipient', () => {
    expect(() =>
      parseCampaignAudience({
        schemaVersion: CAMPAIGN_AUDIENCE_SCHEMA_VERSION,
        audienceId: 'a',
        name: 'n',
        recipients: ['bad'],
        createdAt: 't',
      }),
    ).toThrow()
  })

  it('dedupes case-insensitively preserving first-seen', () => {
    expect(dedupeRecipients(['A@x.com', 'b@x.com', 'a@x.com'])).toEqual([
      'A@x.com',
      'b@x.com',
    ])
  })
})
