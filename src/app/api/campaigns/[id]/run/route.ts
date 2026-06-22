import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { mutationLimiter } from '@/lib/rate-limit'
import { randomUUID } from 'crypto'
import {
  resolveResendCampaignConnection,
  RESEND_API_KEY_SECRET_REFERENCE,
  createLiveResendProviderAdapter,
  createLiveResendProviderProfile,
  createGuardedCampaignSendExecutorForCampaign,
  campaignSendApprovalId,
  runApprovedCampaign,
} from '@/opzava/modules/content'
import { createEnvSecretResolver } from '@/opzava/platform/providers/env-secret-resolver'
import { createApprovalRepository } from '@/opzava/core/approvals/approval-repository'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const limited = mutationLimiter(request)
  if (limited) return limited

  const { id } = await params
  const db = getDatabase()

  const read = (key: string) =>
    (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined)?.value

  // ARD 0008: the API key resolves from the environment via the SecretReference boundary, never
  // cleartext from the settings table. The process.env read stays at this app boundary.
  const resolver = createEnvSecretResolver({ readEnv: (name) => process.env[name] })
  const resolved = await resolveResendCampaignConnection({ readSetting: read, resolver })
  if (!resolved.ok) {
    const error =
      resolved.reason === 'secret-unavailable'
        ? 'Resend API key is not available (set the RESEND_API_KEY secret)'
        : 'Resend is not configured'
    return NextResponse.json({ error }, { status: resolved.reason === 'secret-unavailable' ? 503 : 400 })
  }
  const connection = resolved.connection

  const now = () => new Date().toISOString()

  const http = async (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
  ) => {
    const res = await fetch(url, init)
    return { ok: res.ok, status: res.status, json: () => res.json() }
  }

  const adapter = createLiveResendProviderAdapter({ connection, http, now })
  const profile = createLiveResendProviderProfile(RESEND_API_KEY_SECRET_REFERENCE.id)
  const workflowRunId = `campaign-run:${id}`

  // F1b: drain the live send through the guarded executor — every send leaves an external-call
  // receipt + redacted audit and is provider-level exactly-once. The granted, bounded approval is
  // re-checked at the provider layer (defence in depth).
  const approval = createApprovalRepository(db).getApprovalById(campaignSendApprovalId(id))
  const sendExecutor = createGuardedCampaignSendExecutorForCampaign({
    db,
    adapter,
    profile,
    resolver,
    approval,
    campaignId: id,
    newId: () => randomUUID(),
    clock: { now: () => new Date(), nowIso: now },
  })

  try {
    const result = await runApprovedCampaign(
      {
        db,
        sendExecutor,
        newId: () => randomUUID(),
        now,
        workflowRunId,
        clock: { now: () => new Date() },
        ids: {
          attemptId: () => randomUUID(),
          deadLetterId: ({ jobId, attemptId }) => `dl-${jobId}-${attemptId}`,
        },
      },
      { campaignId: id },
    )
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Run failed'
    if (/not found/.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 404 })
    }
    if (/approval not granted/.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 403 })
    }
    if (/not approved/.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
