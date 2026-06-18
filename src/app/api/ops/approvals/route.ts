import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { createApprovalRepository } from '@/opzava/core/approvals/approval-repository'

const STATUSES = ['requested', 'approved', 'rejected', 'expired', 'cancelled'] as const

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const url = new URL(request.url)
  const statusParam = url.searchParams.get('status')
  const status = STATUSES.includes(statusParam as (typeof STATUSES)[number])
    ? (statusParam as (typeof STATUSES)[number])
    : undefined

  const repo = createApprovalRepository(getDatabase())
  repo.ensureSchema()
  const approvals = repo.listApprovals(status ? { status } : undefined)

  return NextResponse.json({ approvals })
}
