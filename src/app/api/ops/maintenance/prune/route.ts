import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { mutationLimiter } from '@/lib/rate-limit'
import { pruneRunnerData } from '@/opzava/platform/runner/retention'

function isValidIso(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && !Number.isNaN(Date.parse(v))
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = mutationLimiter(request)
  if (limited) return limited

  let body: { olderThan?: string; retentionDays?: number }
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const days =
    typeof body?.retentionDays === 'number' && body.retentionDays >= 0
      ? body.retentionDays
      : 90

  const cutoff = isValidIso(body?.olderThan)
    ? body.olderThan!
    : new Date(Date.now() - days * 86_400_000).toISOString()

  const report = pruneRunnerData(getDatabase(), { olderThan: cutoff })
  return NextResponse.json({ prunedAt: new Date().toISOString(), cutoff, report })
}
