import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { createTenantDecommissionJob } from '@/lib/super-admin'

/**
 * POST /api/super/tenants/[id]/decommission
 * Body: { dry_run?: boolean, remove_linux_user?: boolean, remove_state_dirs?: boolean, reason?: string }
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const params = await context.params
  const tenantId = Number(params.id)
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    return NextResponse.json({ error: 'Invalid tenant id' }, { status: 400 })
  }

  // SEC-1: decommission targets a tenant inferred from the path. Only the
  // owning tenant may queue a decommission for itself; reject any other id
  // before any privileged action.
  if (tenantId !== auth.user.tenant_id) {
    return NextResponse.json({ error: 'Forbidden: tenant scope violation' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const created = createTenantDecommissionJob(tenantId, {
      dry_run: body?.dry_run,
      remove_linux_user: body?.remove_linux_user,
      remove_state_dirs: body?.remove_state_dirs,
      reason: body?.reason,
    }, auth.user.username)

    return NextResponse.json(created, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to queue tenant decommission job' }, { status: 400 })
  }
}
