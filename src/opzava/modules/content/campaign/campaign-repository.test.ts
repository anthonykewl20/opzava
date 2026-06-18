import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { createCampaignRepository } from './campaign-repository'
import {
  parseCampaign,
  type Campaign,
  type CampaignStatus,
} from './campaign'

function campaign(
  overrides: Partial<Campaign> & Record<string, unknown> = {}
): Campaign {
  const base: Record<string, unknown> = {
    schemaVersion: 1,
    campaignId: 'camp-1',
    name: 'Launch',
    status: 'draft',
    startAt: '2026-07-01T09:00:00.000Z',
    steps: [
      {
        stepId: 's1',
        subject: 'Hi',
        html: '<p>1</p>',
        offsetHours: 0,
      },
    ],
    audience: {
      schemaVersion: 1,
      audienceId: 'aud-1',
      name: 'A',
      recipients: ['a@x.com'],
      createdAt: '2026-07-01T00:00:00.000Z',
    },
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  }
  const merged: Record<string, unknown> = { ...base, ...overrides }
  return parseCampaign(merged)
}

describe('createCampaignRepository', () => {
  let db: Database.Database
  let repo: ReturnType<typeof createCampaignRepository>

  beforeEach(() => {
    db = new Database(':memory:')
    repo = createCampaignRepository(db)
    repo.ensureSchema()
  })

  it('saveCampaign + getCampaignById round-trips a campaign', () => {
    const c = campaign({ campaignId: 'camp-1' })
    repo.saveCampaign(c)

    const fetched = repo.getCampaignById('camp-1')
    expect(fetched).not.toBeNull()
    expect(fetched).toEqual(c)
    expect(JSON.parse(JSON.stringify(fetched))).toEqual(
      JSON.parse(JSON.stringify(c))
    )

    const missing = repo.getCampaignById('does-not-exist')
    expect(missing).toBeNull()
  })

  it('saveCampaign upserts by campaignId', () => {
    const draft = campaign({
      campaignId: 'camp-1',
      status: 'draft',
      updatedAt: '2026-07-01T00:00:00.000Z',
    })
    repo.saveCampaign(draft)

    const approved = campaign({
      campaignId: 'camp-1',
      status: 'approved',
      updatedAt: '2026-07-02T00:00:00.000Z',
    })
    repo.saveCampaign(approved)

    const fetched = repo.getCampaignById('camp-1')
    expect(fetched).not.toBeNull()
    expect(fetched!.status).toBe('approved')
    expect(fetched!.updatedAt).toBe('2026-07-02T00:00:00.000Z')

    const all = repo.listCampaigns()
    expect(all).toHaveLength(1)
    expect(all[0]!.campaignId).toBe('camp-1')
  })

  it('listCampaigns returns newest-first by createdAt DESC', () => {
    const campA = campaign({
      campaignId: 'camp-a',
      createdAt: '2026-06-30T00:00:00.000Z',
      updatedAt: '2026-06-30T00:00:00.000Z',
    })
    const campB = campaign({
      campaignId: 'camp-b',
      createdAt: '2026-07-02T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    })

    repo.saveCampaign(campA)
    repo.saveCampaign(campB)

    const all = repo.listCampaigns()
    expect(all).toHaveLength(2)
    expect(all[0]!.campaignId).toBe('camp-b')
    expect(all[1]!.campaignId).toBe('camp-a')
  })

  it('listCampaigns({status}) returns only matching campaigns', () => {
    const draft = campaign({
      campaignId: 'camp-draft',
      status: 'draft',
    })
    const approved = campaign({
      campaignId: 'camp-approved',
      status: 'approved',
    })

    repo.saveCampaign(draft)
    repo.saveCampaign(approved)

    const onlyApproved = repo.listCampaigns({ status: 'approved' })
    expect(onlyApproved).toHaveLength(1)
    expect(onlyApproved[0]!.status).toBe('approved')
    expect(onlyApproved[0]!.campaignId).toBe('camp-approved')

    const onlyDraft = repo.listCampaigns({ status: 'draft' })
    expect(onlyDraft).toHaveLength(1)
    expect(onlyDraft[0]!.campaignId).toBe('camp-draft')

    const noFilter = repo.listCampaigns()
    expect(noFilter).toHaveLength(2)
  })

  it('deleteCampaign removes a campaign', () => {
    const c = campaign({ campaignId: 'camp-del' })
    repo.saveCampaign(c)

    expect(repo.getCampaignById('camp-del')).not.toBeNull()
    expect(repo.listCampaigns()).toHaveLength(1)

    repo.deleteCampaign('camp-del')

    expect(repo.getCampaignById('camp-del')).toBeNull()
    expect(repo.listCampaigns()).toHaveLength(0)
  })

  it('getCampaignById returns a value validated by the schema', () => {
    const c = campaign({
      campaignId: 'camp-validated',
      status: 'sending',
    })
    repo.saveCampaign(c)

    const fetched = repo.getCampaignById('camp-validated')
    expect(fetched).not.toBeNull()
    expect(fetched!.campaignId).toBe('camp-validated')

    const allowed: ReadonlyArray<CampaignStatus> = [
      'draft',
      'approved',
      'sending',
      'sent',
      'failed',
    ]
    expect(allowed).toContain(fetched!.status)
    expect(fetched!.campaignId).toBe(c.campaignId)
  })
})
