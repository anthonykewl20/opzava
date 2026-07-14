import { type Server } from "node:http";
import { pathToFileURL } from "node:url";

import { createConnectionsInternalHttpServer } from "./provisioning/connections-http-server.js";
import {
  createDefaultConnectionsProvisioningPort,
  type ConnectionsProvisioningRuntimePort,
} from "./provisioning/gateway-admin-connections.js";

export interface ProvisioningWorkerRuntimeConfig {
  readonly port: number;
  readonly internalToken: string;
}

function nonEmptyEnv(source: NodeJS.ProcessEnv, primary: string, fallback?: string): string | null {
  const primaryValue = source[primary]?.trim();
  if (primaryValue !== undefined && primaryValue !== "") {
    return primaryValue;
  }

  const fallbackValue = fallback === undefined ? undefined : source[fallback]?.trim();
  return fallbackValue === undefined || fallbackValue === "" ? null : fallbackValue;
}

export function resolveProvisioningWorkerRuntimeConfig(
  source: NodeJS.ProcessEnv = process.env,
): ProvisioningWorkerRuntimeConfig {
  const internalToken = nonEmptyEnv(
    source,
    "PROVISIONING_WORKER_TOKEN",
    "PROVISIONING_INTERNAL_TOKEN",
  );
  if (internalToken === null) {
    throw new Error("PROVISIONING_WORKER_TOKEN is required.");
  }

  const rawPort = source["PROVISIONING_WORKER_PORT"]?.trim() ?? source["PORT"]?.trim() ?? "19188";
  const port = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PROVISIONING_WORKER_PORT/PORT must be a TCP port number.");
  }

  return { port, internalToken };
}

export function startProvisioningWorker(
  config: ProvisioningWorkerRuntimeConfig = resolveProvisioningWorkerRuntimeConfig(),
  dependencies: {
    readonly provisioningPort?: ConnectionsProvisioningRuntimePort;
    readonly createServer?: typeof createConnectionsInternalHttpServer;
  } = {},
): Promise<Server> {
  const provisioningPort =
    dependencies.provisioningPort ?? createDefaultConnectionsProvisioningPort();

  return (async () => {
    try {
      const reconciled = await provisioningPort.reconcileStartup();
      if (!reconciled.ok) {
        throw reconciled.error;
      }

      const server = (dependencies.createServer ?? createConnectionsInternalHttpServer)({
        internalToken: config.internalToken,
        provisioningPort,
      });
      server.once("close", () => provisioningPort.close());
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.port, "0.0.0.0", () => {
          server.off("error", reject);
          console.log(`provisioning-worker listening on ${config.port}`);
          resolve();
        });
      });
      return server;
    } catch (error) {
      provisioningPort.close();
      throw error;
    }
  })();
}

function runningAsEntrypoint(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href;
}

if (runningAsEntrypoint()) {
  void startProvisioningWorker()
    .then((server) => {
      const shutdown = (signal: NodeJS.Signals) => {
        server.close((error) => {
          if (error !== undefined) {
            console.error(error);
            process.exit(1);
          }

          process.exit(signal === "SIGTERM" || signal === "SIGINT" ? 0 : 1);
        });
      };

      process.once("SIGTERM", shutdown);
      process.once("SIGINT", shutdown);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
