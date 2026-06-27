import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { config } from '@/lib/config'

interface DiscoveredGateway {
  user: string
  port: number
  active: boolean
  description: string
}

/**
 * GET /api/gateways/discover
 * Reports the configured Docker OpenClaw sidecar.
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const enabled = /^(1|true|yes|on)$/i.test(String(process.env.OPENCLAW_ENABLED || '').trim())
  if (!enabled) {
    return NextResponse.json({ gateways: [], mode: 'docker-sidecar', disabled: true })
  }

  let active = false
  try {
    const res = await fetch(`http://${config.gatewayHost}:${config.gatewayPort}/health`, {
      signal: AbortSignal.timeout(3000),
    })
    active = res.ok
  } catch {
    active = false
  }

  const discovered: DiscoveredGateway[] = [{
    user: 'mc-openclaw-gateway',
    port: config.gatewayPort,
    active,
    description: `OpenClaw Docker sidecar at ${config.gatewayHost}:${config.gatewayPort}`,
  }]

  return NextResponse.json({ gateways: discovered, mode: 'docker-sidecar' })
}
