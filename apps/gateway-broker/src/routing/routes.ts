import type { OpenClawGatewayRouteId } from "@opzava/ports";
import type { TenantId } from "@opzava/shared-kernel";

import type { DeviceKeypair } from "../acl/openclaw/signing.js";

export type GatewayAuthMode = "paired-device" | "shared-secret";

export interface GatewayRouteConfig {
  readonly routeId: OpenClawGatewayRouteId;
  readonly tenantId: TenantId;
  readonly url: string;
  readonly authMode: GatewayAuthMode;
  readonly pairedDeviceToken: string;
  readonly deviceKeypair: DeviceKeypair;
  readonly clientVersion?: string;
}

export interface GatewayRoutingTable {
  getRoute(routeId: OpenClawGatewayRouteId): GatewayRouteConfig | undefined;
}

export class StaticGatewayRoutingTable implements GatewayRoutingTable {
  private readonly routes = new Map<OpenClawGatewayRouteId, GatewayRouteConfig>();

  public constructor(routes: readonly GatewayRouteConfig[]) {
    for (const route of routes) {
      this.routes.set(route.routeId, route);
    }
  }

  public getRoute(routeId: OpenClawGatewayRouteId): GatewayRouteConfig | undefined {
    return this.routes.get(routeId);
  }
}
