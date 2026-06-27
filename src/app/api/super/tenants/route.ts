import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { listTenants } from '@/lib/super-admin'

/**
 * GET /api/super/tenants - List tenants and latest provisioning status
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  return NextResponse.json({ tenants: listTenants() })
}

/**
 * POST /api/super/tenants - Create tenant and queue bootstrap job
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  return NextResponse.json(
    {
      error: 'Per-tenant host OpenClaw gateway provisioning is disabled.',
      hint: 'Use the shared Docker sidecar instead: OPENCLAW_ENABLED=1 make up openclaw.',
    },
    { status: 400 },
  )
}
