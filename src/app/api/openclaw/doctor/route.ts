import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { config } from '@/lib/config'
import { getPublicGatewayConfig, type PublicGatewayConfig } from '@/lib/gateway-config'

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

function diagnosticStatus(gatewayConfig: PublicGatewayConfig) {
  const message = gatewayConfig.diagnostic?.message || 'Gateway host is not configured.'
  return {
    level: 'warning',
    category: 'config',
    healthy: false,
    summary: 'Gateway browser configuration is incomplete.',
    issues: [
      message,
      'Set PUBLIC_GATEWAY_HOST to the browser-reachable gateway hostname, or set GATEWAY_OPTIONAL=true for standalone mode.',
    ],
    canFix: false,
    raw: message,
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
      'Start the sidecar with OPENCLAW_ENABLED=1 make up openclaw, or run Opzava with GATEWAY_OPTIONAL=true.',
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

  const gatewayConfig = getPublicGatewayConfig()
  if (gatewayConfig.optional) {
    return NextResponse.json(disabledStatus(), { headers: { 'Cache-Control': 'no-store' } })
  }
  if (gatewayConfig.diagnostic) {
    return NextResponse.json(diagnosticStatus(gatewayConfig), { headers: { 'Cache-Control': 'no-store' } })
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
      status: (() => {
        const gatewayConfig = getPublicGatewayConfig()
        if (gatewayConfig.optional) return disabledStatus()
        if (gatewayConfig.diagnostic) return diagnosticStatus(gatewayConfig)
        return unreachableStatus('Docker sidecar fix must be run through Docker Compose.')
      })(),
    },
    { status: 400, headers: { 'Cache-Control': 'no-store' } },
  )
}
