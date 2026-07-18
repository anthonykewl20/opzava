import path from "node:path";
import { pathToFileURL } from "node:url";

import { readRuntimeDatabaseUrl } from "@opzava/adapters";
import { DomainError } from "@opzava/shared-kernel";

import type { BrokerLogger } from "./acl/openclaw/logger.js";
import { loadGatewayBrokerRuntimeConfig } from "./runtime/env.js";
import { closeGatewayBrokerRuntime, createGatewayBrokerRuntime } from "./runtime/server.js";
import {
  createPostgresTenantOrgLookup,
  verifyGatewayBrokerTenantOrg,
} from "./runtime/tenant-org-check.js";

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

  // #199: fail loud at boot when OPENCLAW_GATEWAY_TENANT_ID has drifted from the
  // seeded Opzava org, instead of booting fine and denying every request at the
  // #188 runtime cross-check. Both ids stay in broker-side detail (never browser).
  const databaseUrl = readRuntimeDatabaseUrl();
  const tenantOrg = await verifyGatewayBrokerTenantOrg(
    config.tenantId,
    createPostgresTenantOrgLookup(databaseUrl),
  );
  if (!tenantOrg.ok) {
    throw tenantOrg.error;
  }

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
    const payload: Record<string, unknown> = {
      level: "error",
      message: error instanceof Error ? error.message : "Gateway broker failed to start.",
    };
    // DomainError carries diagnosable detail (e.g. both mismatched tenant ids for
    // the #199 boot check); log it server-side so the failure is one-step readable.
    if (error instanceof DomainError) {
      payload["code"] = error.code;
      if (error.details !== undefined) {
        payload["details"] = error.details;
      }
    }
    console.error(JSON.stringify(payload));
    process.exitCode = 1;
  });
}
