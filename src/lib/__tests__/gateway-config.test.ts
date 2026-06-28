import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getPublicGatewayConfig, resolveGatewayConfig } from '@/lib/gateway-config'

const ENV_KEYS = [
  'PUBLIC_GATEWAY_URL',
  'PUBLIC_GATEWAY_HOST',
  'PUBLIC_GATEWAY_PORT',
  'PUBLIC_GATEWAY_CLIENT_ID',
  'PUBLIC_GATEWAY_OPTIONAL',
  'GATEWAY_OPTIONAL',
  'NEXT_PUBLIC_GATEWAY_URL',
  'NEXT_PUBLIC_GATEWAY_HOST',
  'NEXT_PUBLIC_GATEWAY_PORT',
  'NEXT_PUBLIC_GATEWAY_CLIENT_ID',
  'NEXT_PUBLIC_GATEWAY_OPTIONAL',
]

function clearGatewayEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key]
  }
}

describe('resolveGatewayConfig', () => {
  beforeEach(clearGatewayEnv)
  afterEach(clearGatewayEnv)

  it('uses explicit websocket URLs before configured hosts', () => {
    const result = resolveGatewayConfig({
      explicitUrl: 'https://gateway.example.com/gw?token=abc123',
      host: 'ignored.example.com',
      port: 18789,
      browserProtocol: 'https:',
      clientId: 'ui-client',
    })

    expect(result.wsUrl).toBe('wss://gateway.example.com/gw?token=abc123')
    expect(result.host).toBe('gateway.example.com')
    expect(result.clientId).toBe('ui-client')
    expect(result.diagnostic).toBeUndefined()
  })

  it('derives ws from http browser contexts', () => {
    const result = resolveGatewayConfig({
      host: 'gateway.example.com',
      port: 9090,
      browserProtocol: 'http:',
    })

    expect(result.protocol).toBe('ws')
    expect(result.wsUrl).toBe('ws://gateway.example.com:9090')
  })

  it('derives wss from https browser contexts', () => {
    const result = resolveGatewayConfig({
      host: 'gateway.example.com',
      port: 18789,
      browserProtocol: 'https:',
    })

    expect(result.protocol).toBe('wss')
    expect(result.wsUrl).toBe('wss://gateway.example.com')
  })

  it('keeps optional mode quiet when no host is configured', () => {
    const result = resolveGatewayConfig({
      optional: true,
      browserProtocol: 'https:',
    })

    expect(result.optional).toBe(true)
    expect(result.wsUrl).toBe('')
    expect(result.diagnostic).toBeUndefined()
  })

  it('returns a diagnostic sentinel when host is unset and gateway is required', () => {
    const result = resolveGatewayConfig({
      optional: false,
      browserProtocol: 'http:',
    })

    expect(result.wsUrl).toBe('')
    expect(result.diagnostic).toMatchObject({
      code: 'gateway_host_unset',
      level: 'error',
    })
    expect(result.diagnostic?.message).toContain('PUBLIC_GATEWAY_HOST')
  })
})

describe('getPublicGatewayConfig', () => {
  beforeEach(clearGatewayEnv)
  afterEach(clearGatewayEnv)

  it('prefers canonical runtime public gateway env over legacy NEXT_PUBLIC values', () => {
    process.env.PUBLIC_GATEWAY_HOST = 'runtime-gateway.example.com'
    process.env.PUBLIC_GATEWAY_PORT = '9443'
    process.env.PUBLIC_GATEWAY_CLIENT_ID = 'runtime-client'
    process.env.GATEWAY_OPTIONAL = 'false'
    process.env.NEXT_PUBLIC_GATEWAY_HOST = 'legacy-gateway.example.com'
    process.env.NEXT_PUBLIC_GATEWAY_PORT = '18888'
    process.env.NEXT_PUBLIC_GATEWAY_CLIENT_ID = 'legacy-client'
    process.env.NEXT_PUBLIC_GATEWAY_OPTIONAL = 'true'

    const result = getPublicGatewayConfig()

    expect(result.host).toBe('runtime-gateway.example.com')
    expect(result.port).toBe(9443)
    expect(result.clientId).toBe('runtime-client')
    expect(result.optional).toBe(false)
  })

  it('falls back to legacy NEXT_PUBLIC gateway env during migration', () => {
    process.env.NEXT_PUBLIC_GATEWAY_HOST = 'legacy-gateway.example.com'
    process.env.NEXT_PUBLIC_GATEWAY_PORT = '18888'
    process.env.NEXT_PUBLIC_GATEWAY_CLIENT_ID = 'legacy-client'
    process.env.NEXT_PUBLIC_GATEWAY_OPTIONAL = 'true'

    const result = getPublicGatewayConfig()

    expect(result.host).toBe('legacy-gateway.example.com')
    expect(result.port).toBe(18888)
    expect(result.clientId).toBe('legacy-client')
    expect(result.optional).toBe(true)
    expect(result.diagnostic).toBeUndefined()
  })
})
