import { getPublicGatewayConfig } from '@/lib/gateway-config'
import { PublicGatewayConfigClientProvider } from '@/lib/public-config-context'

export function PublicConfigProvider({
  browserProtocol,
  children,
}: {
  browserProtocol?: string | null
  children: React.ReactNode
}) {
  const gatewayConfig = getPublicGatewayConfig({ browserProtocol })

  return (
    <PublicGatewayConfigClientProvider gatewayConfig={gatewayConfig}>
      {children}
    </PublicGatewayConfigClientProvider>
  )
}
