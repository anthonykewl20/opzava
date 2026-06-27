import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { config } from '@/lib/config'

function isTruthy(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim())
}

function isGatewayOptional(): boolean {
  if (isTruthy(process.env.NEXT_PUBLIC_GATEWAY_OPTIONAL)) return true
  return !isTruthy(process.env.OPENCLAW_ENABLED)
}

function gatewayHealthUrl(): string {
  return `http://${config.gatewayHost}:${config.gatewayPort}/health`
}

function disabledStatus() {
  return {
    level: 'healthy',
    category: 'general',
    healthy: true,
    summary: 'OpenClaw Docker sidecar is disabled for this Opzava instance.',
    issues: [],
    canFix: false,
    raw: '',
  }
}

function unreachableStatus(detail: string) {
  return {
    level: 'warning',
    category: 'general',
    healthy: false,
    summary: `OpenClaw Docker sidecar is not reachable at ${config.gatewayHost}:${config.gatewayPort}.`,
    issues: [
      detail,
      'Start the sidecar with OPENCLAW_ENABLED=1 make up openclaw, or run Opzava with NEXT_PUBLIC_GATEWAY_OPTIONAL=true.',
    ],
    canFix: false,
    raw: detail,
  }
}

export function invalidateDoctorCache(): void {
  // Kept for existing imports/tests. The Docker-only health check is cheap and
  // does not cache subprocess output because it never starts a subprocess.
}

export async function GET(request: Request) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (isGatewayOptional()) {
    return NextResponse.json(disabledStatus(), { headers: { 'Cache-Control': 'no-store' } })
  }

  const url = gatewayHealthUrl()
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    const raw = await res.text().catch(() => '')

    if (!res.ok) {
      return NextResponse.json(unreachableStatus(`Gateway health returned HTTP ${res.status}.`), {
        headers: { 'Cache-Control': 'no-store' },
      })
    }

    return NextResponse.json({
      level: 'healthy',
      category: 'general',
      healthy: true,
      summary: 'OpenClaw Docker sidecar is healthy.',
      issues: [],
      canFix: false,
      raw,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const detail = error instanceof Error ? error.message : `Failed to reach ${url}`
    return NextResponse.json(unreachableStatus(detail), { headers: { 'Cache-Control': 'no-store' } })
  }
}

export async function POST(request: Request) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  return NextResponse.json(
    {
      error: 'OpenClaw is Docker-managed in Opzava.',
      detail: 'Local openclaw doctor --fix is disabled. Restart or update the mc-openclaw-gateway sidecar with OPENCLAW_ENABLED=1 make up openclaw.',
      status: isGatewayOptional() ? disabledStatus() : unreachableStatus('Docker sidecar fix must be run through Docker Compose.'),
    },
    { status: 400, headers: { 'Cache-Control': 'no-store' } },
  )
}
