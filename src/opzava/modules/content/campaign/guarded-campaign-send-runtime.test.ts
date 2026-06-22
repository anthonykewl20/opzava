import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createCampaignRepository } from './campaign-repository'
import { parseCampaign, type Campaign } from './campaign'
import { runApprovedCampaign } from './run-approved-campaign'
import { createCampaignSendApproval } from './campaign-send-approval'
import { createApprovalRepository } from '@/opzava/core/approvals/approval-repository'
import { createGuardedCampaignSendExecutorForCampaign } from './guarded-campaign-send-runtime'
import { createLiveResendProviderProfile } from '../providers/resend-live-adapter'
import { parseProviderAdapterResult, type ProviderAdapterRequest } from '@/opzava/platform/providers/contracts'
import { createSecretReference } from '@/opzava/platform/admin-config/contracts'
import type { SecretResolver } from '@/opzava/platform/providers/credentials-runtime'

const NOW_ISO = '2026-07-05T00:00:00.000Z'
const CREDENTIAL_ID = 'RESEND_API_KEY'

function makeCampaign(status: Campaign['status']): Campaign {
  return parseCampaign({
    schemaVersion: 1,
    campaignId: 'camp-1',
    name: 'Launch',
    status,
    startAt: '2026-07-01T09:00:00.000Z',
    steps: [{ stepId: 's1', subject: 'Hi', html: '<p>1</p>', offsetHours: 0 }],
    audience: {
      schemaVersion: 1,
      audienceId: 'aud-1',
      name: 'A',
      recipients: ['a@x.com', 'b@x.com'],
      createdAt: '2026-07-01T00:00:00.000Z',
    },
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  })
}

function fakeResolver(): SecretResolver {
  return {
    resolveSecret: vi.fn(async () => ({
      ok: true as const,
      value: {
        reference: createSecretReference({ id: CREDENTIAL_ID, scope: 'provider-credential', purpose: 'Resend API key' }),
        secretValue: 're_live_secret',
      },
    })),
  }
}

function succeedingAdapter() {
  const execute = vi.fn(async (request: ProviderAdapterRequest) =>
    parseProviderAdapterResult({
      schemaVersion: 1,
      requestId: request.requestId,
      status: 'succeeded',
      output: { messageId: `msg-${request.requestId}` },
      outputSummary: { messageId: 'ok' },
      error: null,
      finishedAt: NOW_ISO,
    }),
  )
  return { execute }
}

let db: Database.Database
let idCounter: number
const newId = () => `id-${++idCounter}`

beforeEach(() => {
  db = new Database(':memory:')
  idCounter = 0
})

function guardedDeps(adapter: { execute: ReturnType<typeof vi.fn> }) {
  return {
    db,
    sendExecutor: createGuardedCampaignSendExecutorForCampaign({
      db,
      adapter,
      profile: createLiveResendProviderProfile(CREDENTIAL_ID),
      resolver: fakeResolver(),
      approval: createApprovalRepository(db).getApprovalById('campaign-send:camp-1'),
      campaignId: 'camp-1',
      newId,
      clock: { now: () => new Date(NOW_ISO), nowIso: () => NOW_ISO },
    }),
    newId,
    now: () => NOW_ISO,
    workflowRunId: 'wf-1',
    clock: { now: () => new Date(NOW_ISO) },
    ids: {
      attemptId: () => newId(),
      deadLetterId: ({ jobId, attemptId }: { jobId: string; attemptId: string }) => `dl-${jobId}-${attemptId}`,
    },
  }
}

describe('guarded campaign send runtime (F1b live-send composition)', () => {
  it('drains an approved campaign to sent through the guard, emitting an external-call receipt per send', async () => {
    createCampaignRepository(db).saveCampaign(makeCampaign('approved'))
    createApprovalRepository(db).saveApproval(
      createCampaignSendApproval({ campaignId: 'camp-1', approverId: 'admin', now: NOW_ISO }),
    )
    const adapter = succeedingAdapter()

    const result = await runApprovedCampaign(guardedDeps(adapter), { campaignId: 'camp-1' })

    expect(result.status).toBe('sent')
    expect(result.total).toBe(2)
    expect(result.sent).toBe(2)
    expect(adapter.execute).toHaveBeenCalledTimes(2) // one live call per recipient
    // each send left a durable external-call receipt (provider-level record)
    const receipts = db
      .prepare("SELECT COUNT(*) AS n FROM opzava_runner_operational_events WHERE kind = 'external-call'")
      .get() as { n: number }
    expect(receipts.n).toBe(2)
  })

  it('refuses to send when there is no granted approval (F1 holds at the provider layer)', async () => {
    createCampaignRepository(db).saveCampaign(makeCampaign('approved')) // campaign row approved, but no Approval minted
    const adapter = succeedingAdapter()

    const result = await runApprovedCampaign(guardedDeps(adapter), { campaignId: 'camp-1' }).catch((e) => e)

    // run-approved-campaign rejects up front when no granted approval exists; the adapter never runs.
    expect(adapter.execute).toHaveBeenCalledTimes(0)
    expect(String(result)).toMatch(/approval not granted/)
  })
})
