import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { listRecentCostEvents, summarizeCostEvents } from '@/opzava/platform/runner/cost-queries'
import { readUnifiedCostSummary } from '@/opzava/platform/costs/unified-cost-reader'

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const url = new URL(request.url)
  const limitParam = url.searchParams.get('limit')
  const limit = limitParam ? Number(limitParam) : undefined
  const db = getDatabase()
  const events = listRecentCostEvents(db, Number.isFinite(limit) ? { limit } : {})
  const summary = summarizeCostEvents(events)
  // F2b: the unified cost surface merges opzava + Engine A (inherited) spend into one view.
  const unified = readUnifiedCostSummary(db)
  return NextResponse.json({ events, summary, unified })
}
