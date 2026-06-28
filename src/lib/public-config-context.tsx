'use client'

import { createContext, useContext, useMemo } from 'react'
import type { PublicGatewayConfig } from '@/lib/gateway-config'
import { DEFAULT_GATEWAY_CLIENT_ID, DEFAULT_GATEWAY_PORT } from '@/lib/gateway-config'

const DEFAULT_PUBLIC_GATEWAY_CONFIG: PublicGatewayConfig = {
  wsUrl: '',
  host: '',
  port: DEFAULT_GATEWAY_PORT,
  protocol: 'ws',
  optional: false,
  clientId: DEFAULT_GATEWAY_CLIENT_ID,
  explicitUrl: '',
  diagnostic: {
    code: 'gateway_host_unset',
    level: 'error',
    message:
      'Gateway host is not configured. Set PUBLIC_GATEWAY_HOST to a browser-reachable OpenClaw gateway host, or set GATEWAY_OPTIONAL=true for standalone mode.',
  },
}

const PublicGatewayConfigContext = createContext<PublicGatewayConfig>(DEFAULT_PUBLIC_GATEWAY_CONFIG)

export function PublicGatewayConfigClientProvider({
  gatewayConfig,
  children,
}: {
  gatewayConfig: PublicGatewayConfig
  children: React.ReactNode
}) {
  const value = useMemo(() => gatewayConfig, [gatewayConfig])
  return (
    <PublicGatewayConfigContext.Provider value={value}>
      {children}
    </PublicGatewayConfigContext.Provider>
  )
}

export function useGatewayConfig(): PublicGatewayConfig {
  return useContext(PublicGatewayConfigContext)
}
