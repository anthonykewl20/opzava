import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { mutationLimiter } from '@/lib/rate-limit'
import { randomUUID } from 'crypto'
import {
  resolveResendLiveConnection,
  createLiveResendProviderAdapter,
  createLiveResendProviderProfile,
  createResendCampaignSender,
  runApprovedCampaign,
} from '@/opzava/modules/content'

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

  const connection = resolveResendLiveConnection(read)
  if (!connection) {
    return NextResponse.json(
      { error: 'Resend is not configured' },
      { status: 400 },
    )
  }

  const now = () => new Date().toISOString()

  const http = async (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
  ) => {
    const res = await fetch(url, init)
    return { ok: res.ok, status: res.status, json: () => res.json() }
  }

  const adapter = createLiveResendProviderAdapter({ connection, http, now })
  const profile = createLiveResendProviderProfile('resend_api_key')
  const workflowRunId = `campaign-run:${id}`

  const sender = createResendCampaignSender({
    adapter,
    profile,
    workflowRunId,
    newId: () => randomUUID(),
    now,
  })

  try {
    const result = await runApprovedCampaign(
      {
        db,
        sender,
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
    if (/not approved/.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
