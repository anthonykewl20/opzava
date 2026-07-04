import { type Server } from "node:http";
import { pathToFileURL } from "node:url";

import { createConnectionsInternalHttpServer } from "./provisioning/connections-http-server.js";

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
): Server {
  const server = createConnectionsInternalHttpServer({
    internalToken: config.internalToken,
  });

  server.listen(config.port, "0.0.0.0", () => {
    console.log(`provisioning-worker listening on ${config.port}`);
  });

  return server;
}

function runningAsEntrypoint(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href;
}

if (runningAsEntrypoint()) {
  let server: Server;
  try {
    server = startProvisioningWorker();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    throw error;
  }

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
}
