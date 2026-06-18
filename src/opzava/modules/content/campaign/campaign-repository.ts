import Database from 'better-sqlite3'
import { parseCampaign, type Campaign, type CampaignStatus } from './campaign'

export type CampaignRepository = Readonly<{
  ensureSchema: () => void
  saveCampaign: (campaign: Campaign) => void
  getCampaignById: (campaignId: string) => Campaign | null
  listCampaigns: (filter?: Readonly<{ status?: CampaignStatus }>) => Campaign[]
  deleteCampaign: (campaignId: string) => void
}>

type CampaignRow = Readonly<{
  campaign_id: string
  name: string
  status: string
  start_at: string
  record_json: string
  created_at: string
  updated_at: string
}>

export function createCampaignRepository(db: Database.Database): CampaignRepository {
  let schemaReady = false

  const ensureSchema = (): void => {
    if (schemaReady) return
    db.exec(`
      CREATE TABLE IF NOT EXISTS opzava_campaigns (
        campaign_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        start_at TEXT NOT NULL,
        record_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_opzava_campaigns_status ON opzava_campaigns(status);
      CREATE INDEX IF NOT EXISTS idx_opzava_campaigns_created ON opzava_campaigns(created_at);
    `)
    schemaReady = true
  }

  const saveCampaign = (campaign: Campaign): void => {
    ensureSchema()
    const c = parseCampaign(campaign)
    const stmt = db.prepare(
      `INSERT INTO opzava_campaigns
         (campaign_id, name, status, start_at, record_json, created_at, updated_at)
       VALUES
         (@campaign_id, @name, @status, @start_at, @record_json, @created_at, @updated_at)
       ON CONFLICT(campaign_id) DO UPDATE SET
         name = excluded.name,
         status = excluded.status,
         start_at = excluded.start_at,
         record_json = excluded.record_json,
         updated_at = excluded.updated_at`
    )
    stmt.run({
      campaign_id: c.campaignId,
      name: c.name,
      status: c.status,
      start_at: c.startAt,
      record_json: JSON.stringify(c),
      created_at: c.createdAt,
      updated_at: c.updatedAt,
    })
  }

  const getCampaignById = (campaignId: string): Campaign | null => {
    ensureSchema()
    const row = db
      .prepare(
        `SELECT record_json FROM opzava_campaigns WHERE campaign_id = ?`
      )
      .get(campaignId) as { record_json: string } | undefined
    if (!row) return null
    return parseCampaign(JSON.parse(row.record_json))
  }

  const listCampaigns = (
    filter?: Readonly<{ status?: CampaignStatus }>
  ): Campaign[] => {
    ensureSchema()
    const status = filter?.status
    const rows =
      status === undefined
        ? (db
            .prepare(
              `SELECT record_json FROM opzava_campaigns ORDER BY created_at DESC`
            )
            .all() as ReadonlyArray<{ record_json: string }>)
        : (db
            .prepare(
              `SELECT record_json FROM opzava_campaigns WHERE status = ? ORDER BY created_at DESC`
            )
            .all(status) as ReadonlyArray<{ record_json: string }>)
    return rows.map((r) => parseCampaign(JSON.parse(r.record_json)))
  }

  const deleteCampaign = (campaignId: string): void => {
    ensureSchema()
    db.prepare(`DELETE FROM opzava_campaigns WHERE campaign_id = ?`).run(
      campaignId
    )
  }

  return Object.freeze({
    ensureSchema,
    saveCampaign,
    getCampaignById,
    listCampaigns,
    deleteCampaign,
  })
}

// Reference CampaignRow so the type is not unused if a consumer uses it elsewhere.
export type { CampaignRow }
