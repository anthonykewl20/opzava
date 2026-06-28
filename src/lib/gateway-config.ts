import { buildGatewayWebSocketUrl } from '@/lib/gateway-url'

export type GatewayProtocol = 'ws' | 'wss'

export interface GatewayConfigInput {
  host?: string | null
  port?: string | number | null
  browserProtocol?: string | null
  explicitUrl?: string | null
  optional?: string | boolean | null
  clientId?: string | null
}

export interface GatewayConfigDiagnostic {
  code: 'gateway_host_unset'
  level: 'error'
  message: string
}

export interface GatewayConfig {
  wsUrl: string
  host: string
  port: number
  protocol: GatewayProtocol
  optional: boolean
  clientId: string
  diagnostic?: GatewayConfigDiagnostic
}

export interface PublicGatewayConfig extends GatewayConfig {
  explicitUrl: string
}

export const DEFAULT_GATEWAY_PORT = 18789
export const DEFAULT_GATEWAY_CLIENT_ID = 'openclaw-control-ui'

function clean(value: unknown): string {
  return String(value ?? '').trim()
}

function isTruthy(value: string | boolean | null | undefined): boolean {
  if (typeof value === 'boolean') return value
  return /^(1|true|yes|on)$/i.test(clean(value))
}

function normalizePort(value: GatewayConfigInput['port']): number {
  const numeric = Number(value ?? DEFAULT_GATEWAY_PORT)
  if (!Number.isFinite(numeric)) return DEFAULT_GATEWAY_PORT
  const port = Math.floor(numeric)
  if (port < 1 || port > 65535) return DEFAULT_GATEWAY_PORT
  return port
}

function deriveProtocol(browserProtocol: string | null | undefined): GatewayProtocol {
  const normalized = clean(browserProtocol).toLowerCase().replace(/:$/, '')
  return normalized === 'https' || normalized === 'wss' ? 'wss' : 'ws'
}

function protocolToBrowserProtocol(protocol: GatewayProtocol): 'http:' | 'https:' {
  return protocol === 'wss' ? 'https:' : 'http:'
}

function hostFromResolvedUrl(wsUrl: string): string {
  try {
    return new URL(wsUrl).hostname
  } catch {
    return wsUrl
  }
}

function envValue(...keys: string[]): string {
  for (const key of keys) {
    const value = clean(process.env[key])
    if (value) return value
  }
  return ''
}

export function resolveGatewayConfig(input: GatewayConfigInput): GatewayConfig {
  const port = normalizePort(input.port)
  const protocol = deriveProtocol(input.browserProtocol)
  const optional = isTruthy(input.optional)
  const clientId = clean(input.clientId) || DEFAULT_GATEWAY_CLIENT_ID
  const explicitUrl = clean(input.explicitUrl)
  const configuredHost = clean(input.host)

  if (explicitUrl) {
    const wsUrl = buildGatewayWebSocketUrl({
      host: explicitUrl,
      port,
      browserProtocol: protocolToBrowserProtocol(protocol),
    })
    return {
      wsUrl,
      host: hostFromResolvedUrl(wsUrl),
      port,
      protocol,
      optional,
      clientId,
    }
  }

  if (!configuredHost) {
    return {
      wsUrl: '',
      host: '',
      port,
      protocol,
      optional,
      clientId,
      diagnostic: optional
        ? undefined
        : {
            code: 'gateway_host_unset',
            level: 'error',
            message:
              'Gateway host is not configured. Set PUBLIC_GATEWAY_HOST to a browser-reachable OpenClaw gateway host, or set GATEWAY_OPTIONAL=true for standalone mode.',
          },
    }
  }

  return {
    wsUrl: buildGatewayWebSocketUrl({
      host: configuredHost,
      port,
      browserProtocol: protocolToBrowserProtocol(protocol),
    }),
    host: configuredHost,
    port,
    protocol,
    optional,
    clientId,
  }
}

export function getPublicGatewayConfig(input: { browserProtocol?: string | null } = {}): PublicGatewayConfig {
  const explicitUrl = envValue('PUBLIC_GATEWAY_URL', 'NEXT_PUBLIC_GATEWAY_URL')
  const resolved = resolveGatewayConfig({
    host: envValue('PUBLIC_GATEWAY_HOST', 'NEXT_PUBLIC_GATEWAY_HOST'),
    port: envValue('PUBLIC_GATEWAY_PORT', 'NEXT_PUBLIC_GATEWAY_PORT'),
    browserProtocol: input.browserProtocol,
    explicitUrl,
    optional: envValue('GATEWAY_OPTIONAL', 'PUBLIC_GATEWAY_OPTIONAL', 'NEXT_PUBLIC_GATEWAY_OPTIONAL'),
    clientId: envValue('PUBLIC_GATEWAY_CLIENT_ID', 'NEXT_PUBLIC_GATEWAY_CLIENT_ID'),
  })

  return {
    ...resolved,
    explicitUrl,
  }
}
