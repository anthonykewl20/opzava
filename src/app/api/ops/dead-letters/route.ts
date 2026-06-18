import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { listRecentDeadLetters } from '@/opzava/platform/runner/dead-letter-queries'

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const url = new URL(request.url)
  const limitParam = url.searchParams.get('limit')
  const limit = limitParam ? Number(limitParam) : undefined

  const deadLetters = listRecentDeadLetters(
    getDatabase(),
    Number.isFinite(limit) ? { limit } : {},
  )

  return NextResponse.json({ deadLetters })
}
