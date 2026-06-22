import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { mutationLimiter } from '@/lib/rate-limit'
import { randomUUID } from 'crypto'
import { createAdminSettingsRepository } from '@/opzava/platform/admin-config/repository'
import {
  parseOpzavaAdminSettings,
  defaultOpzavaAdminSettings,
} from '@/opzava/platform/admin-config/settings'

// F6: read/write the opzava runtime settings singleton (runner delays, retry policy, provider
// timeouts, rate/cost limits). Settings store SecretReferences, never secret values, so the payload
// is safe to return. Admin-only.
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const repo = createAdminSettingsRepository(getDatabase())
  const current = repo.getSettings()
  if (current) return NextResponse.json(current)

  // Nothing persisted yet — return the defaults (version 0) so the UI has a baseline to edit.
  return NextResponse.json({
    settings: defaultOpzavaAdminSettings(),
    version: 0,
    updatedAt: null,
    updatedBy: null,
  })
}

export async function PUT(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = mutationLimiter(request)
  if (limited) return limited

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const hasWrapper = body !== null && typeof body === 'object' && 'settings' in body
  const rawSettings = hasWrapper ? (body as { settings: unknown }).settings : body
  const reason =
    hasWrapper && typeof (body as { reason?: unknown }).reason === 'string'
      ? (body as { reason: string }).reason
      : 'updated via admin settings'

  let settings
  try {
    settings = parseOpzavaAdminSettings(rawSettings)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'invalid settings' },
      { status: 400 },
    )
  }

  const repo = createAdminSettingsRepository(getDatabase())
  const result = repo.saveSettings({
    settings,
    actorId: auth.user.username,
    reason,
    correlationId: randomUUID(),
    updatedAt: new Date().toISOString(),
    auditEventId: randomUUID(),
  })
  return NextResponse.json(result)
}
