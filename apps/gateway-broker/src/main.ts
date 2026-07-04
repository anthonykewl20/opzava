import path from "node:path";
import { pathToFileURL } from "node:url";

import type { BrokerLogger } from "./acl/openclaw/logger.js";
import { loadGatewayBrokerRuntimeConfig } from "./runtime/env.js";
import { closeGatewayBrokerRuntime, createGatewayBrokerRuntime } from "./runtime/server.js";

const consoleBrokerLogger: BrokerLogger = {
  warn(metadata, message) {
    console.warn(JSON.stringify({ level: "warn", message, ...metadata }));
  },
  error(metadata, message) {
    console.error(JSON.stringify({ level: "error", message, ...metadata }));
  },
};

export async function startGatewayBroker(): Promise<void> {
  const config = await loadGatewayBrokerRuntimeConfig();
  const runtime = createGatewayBrokerRuntime(config, consoleBrokerLogger);

  await new Promise<void>((resolve) => {
    runtime.server.listen(config.port, "0.0.0.0", resolve);
  });

  console.log(
    JSON.stringify({
      level: "info",
      message: "Gateway broker listening.",
      port: config.port,
      routeId: config.routeId,
      tenantId: config.tenantId,
    }),
  );

  let stopping = false;
  const stop = (signal: NodeJS.Signals) => {
    if (stopping) {
      return;
    }

    stopping = true;
    void closeGatewayBrokerRuntime(runtime)
      .then(() => {
        console.log(JSON.stringify({ level: "info", message: "Gateway broker stopped.", signal }));
      })
      .catch((error: unknown) => {
        console.error(
          JSON.stringify({
            level: "error",
            message: error instanceof Error ? error.message : "Gateway broker stop failed.",
            signal,
          }),
        );
        process.exitCode = 1;
      });
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntrypoint) {
  void startGatewayBroker().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        level: "error",
        message: error instanceof Error ? error.message : "Gateway broker failed to start.",
      }),
    );
    process.exitCode = 1;
  });
}
