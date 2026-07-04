import http from "node:http";

import { createBrokerInternalHttpServer } from "../internal/http-server.js";
import { GatewayConnectionManager } from "../routing/connection-manager.js";
import { StaticGatewayRoutingTable } from "../routing/routes.js";
import type { BrokerLogger } from "../acl/openclaw/logger.js";
import type { GatewayBrokerRuntimeConfig } from "./env.js";

export interface GatewayBrokerRuntime {
  readonly server: http.Server;
  readonly manager: GatewayConnectionManager;
}

export function createGatewayBrokerRuntime(
  config: GatewayBrokerRuntimeConfig,
  logger?: BrokerLogger,
): GatewayBrokerRuntime {
  const manager = new GatewayConnectionManager({
    routingTable: new StaticGatewayRoutingTable([
      {
        routeId: config.routeId,
        tenantId: config.tenantId,
        url: config.gatewayUrl,
        authMode: "paired-device",
        pairedDeviceToken: config.pairedDeviceToken,
        deviceKeypair: config.deviceKeypair,
        clientVersion: config.clientVersion,
      },
    ]),
    ...(logger === undefined ? {} : { logger }),
  });

  return {
    manager,
    server: createBrokerInternalHttpServer({
      gatewayPort: manager,
      internalToken: config.internalToken,
    }),
  };
}

export async function closeGatewayBrokerRuntime(runtime: GatewayBrokerRuntime): Promise<void> {
  runtime.manager.disconnectAll();

  if (!runtime.server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    runtime.server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
