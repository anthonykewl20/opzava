import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'

const DOCKER_UPDATE_COMMAND = 'OPENCLAW_ENABLED=1 make upgrade openclaw'

export async function POST(request: Request) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const db = getDatabase()
    db.prepare(
      'INSERT INTO audit_log (action, actor, detail) VALUES (?, ?, ?)'
    ).run(
      'openclaw.update.docker_required',
      auth.user.username,
      JSON.stringify({ command: DOCKER_UPDATE_COMMAND }),
    )
  } catch {
    // Non-critical.
  }

  return NextResponse.json(
    {
      error: 'OpenClaw is Docker-managed in Opzava.',
      detail: `Local OpenClaw updates are disabled. Update the sidecar image with: ${DOCKER_UPDATE_COMMAND}`,
      updateCommand: DOCKER_UPDATE_COMMAND,
      updateMode: 'docker',
    },
    { status: 400 },
  )
}
