import { generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LocalFileSecretsVault } from "@opzava/adapters";
import { makeTenantId } from "@opzava/shared-kernel";
import { afterEach, describe, expect, it } from "vitest";

import { loadGatewayBrokerRuntimeConfig } from "../runtime/env.js";
import { closeGatewayBrokerRuntime, createGatewayBrokerRuntime } from "../runtime/server.js";

const tempDirectories: string[] = [];
const internalToken = "local-test-broker-internal-token-32";
const tenantId = "93b43f1a-1d25-406d-b52c-8b4fd3cde01d";

function testEd25519PrivateKeyPem(): string {
  const { privateKey } = generateKeyPairSync("ed25519");

  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

async function tempVaultFile(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "opzava-gateway-broker-"));
  tempDirectories.push(directory);
  return join(directory, "openclaw-secrets.json");
}

function baseEnv(privateKeyPem = testEd25519PrivateKeyPem()): NodeJS.ProcessEnv {
  return {
    PORT: "0",
    BROKER_INTERNAL_TOKEN: internalToken,
    OPENCLAW_GATEWAY_URL: "ws://openclaw-platform-gateway:18789",
    OPENCLAW_GATEWAY_TENANT_ID: tenantId,
    OPENCLAW_DEVICE_PRIVATE_KEY_PEM: privateKeyPem,
  };
}

async function storeDeviceToken(filePath: string, token: string): Promise<void> {
  const stored = await new LocalFileSecretsVault({ filePath }).putSecret({
    tenantId: makeTenantId("platform"),
    purpose: "openclaw",
    label: "platform-operator-device-token",
    value: token,
  });

  if (!stored.ok) {
    throw stored.error;
  }
}

async function listen(runtime: ReturnType<typeof createGatewayBrokerRuntime>): Promise<string> {
  await new Promise<void>((resolve) => runtime.server.listen(0, "127.0.0.1", resolve));
  const address = runtime.server.address();
  if (typeof address === "string" || address === null) {
    throw new Error("Expected broker runtime to listen on TCP.");
  }

  return `http://127.0.0.1:${(address as AddressInfo).port}`;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("gateway-broker runtime environment", () => {
  it("loads the paired operator device token from the local SecretsVault", async () => {
    const vaultFile = await tempVaultFile();
    const deviceToken = `paired-device-token-${randomUUID()}`;
    await storeDeviceToken(vaultFile, deviceToken);

    const config = await loadGatewayBrokerRuntimeConfig({
      ...baseEnv(),
      OPENCLAW_DEV_SECRETS_FILE: vaultFile,
    });

    expect(config).toMatchObject({
      port: 0,
      internalToken,
      routeId: "platform-openclaw",
      tenantId,
      gatewayUrl: "ws://openclaw-platform-gateway:18789/",
      pairedDeviceToken: deviceToken,
      clientVersion: "0.0.0",
    });
    expect(config.deviceKeypair.deviceId).toMatch(/^[a-f0-9]{64}$/);
  });

  it("allows a managed OPENCLAW_OPERATOR_DEVICE_TOKEN override without a vault file", async () => {
    const deviceToken = `managed-device-token-${randomUUID()}`;
    const config = await loadGatewayBrokerRuntimeConfig({
      ...baseEnv(),
      OPENCLAW_OPERATOR_DEVICE_TOKEN: deviceToken,
    });

    expect(config.pairedDeviceToken).toBe(deviceToken);
  });

  it("fails closed when neither the vault nor a managed token contains the hot-path token", async () => {
    await expect(
      loadGatewayBrokerRuntimeConfig({
        ...baseEnv(),
        OPENCLAW_DEV_SECRETS_FILE: await tempVaultFile(),
      }),
    ).rejects.toMatchObject({
      code: "gatewayBroker.deviceTokenUnavailable",
    });
  });

  it("rejects device identity overrides that do not match the private key", async () => {
    await expect(
      loadGatewayBrokerRuntimeConfig({
        ...baseEnv(),
        OPENCLAW_OPERATOR_DEVICE_TOKEN: "paired-device-token",
        OPENCLAW_DEVICE_ID: "not-the-key-derived-device-id",
      }),
    ).rejects.toMatchObject({
      code: "gatewayBroker.invalidEnv",
    });
  });

  it("starts the authenticated internal HTTP server from runtime config", async () => {
    const config = await loadGatewayBrokerRuntimeConfig({
      ...baseEnv(),
      OPENCLAW_OPERATOR_DEVICE_TOKEN: "paired-device-token",
    });
    const runtime = createGatewayBrokerRuntime(config);
    const baseUrl = await listen(runtime);

    try {
      const response = await fetch(`${baseUrl}/internal/gateway/health?routeId=platform-openclaw`, {
        headers: {
          authorization: `Bearer ${internalToken}`,
        },
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        routeId: "platform-openclaw",
        reachable: false,
        circuitOpen: false,
      });
    } finally {
      await closeGatewayBrokerRuntime(runtime);
    }
  });
});
