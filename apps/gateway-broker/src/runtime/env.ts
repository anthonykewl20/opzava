import { expectedLocalFileSecretReference, LocalFileSecretsVault } from "@opzava/adapters";
import type { OpenClawGatewayRouteId } from "@opzava/ports";
import { DomainError, makeTenantId, type TenantId } from "@opzava/shared-kernel";

import { Ed25519DeviceKeypair, type DeviceKeypair } from "../acl/openclaw/signing.js";

export interface GatewayBrokerRuntimeConfig {
  readonly port: number;
  readonly internalToken: string;
  readonly routeId: OpenClawGatewayRouteId;
  readonly tenantId: TenantId;
  readonly gatewayUrl: string;
  readonly pairedDeviceToken: string;
  readonly deviceKeypair: DeviceKeypair;
  readonly clientVersion: string;
}

const defaultRouteId = "platform-openclaw";
const defaultClientVersion = "0.0.0";
const defaultDeviceTokenVaultTenantId = "platform";
const defaultDeviceTokenVaultLabel = "platform-operator-device-token";

function runtimeEnvError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

function optionalEnv(source: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = source[name];
  return value === undefined || value.trim() === "" ? undefined : value.trim();
}

function requireEnv(source: NodeJS.ProcessEnv, name: string): string {
  const value = optionalEnv(source, name);
  if (value === undefined) {
    throw runtimeEnvError("gatewayBroker.missingEnv", `${name} is required.`);
  }

  return value;
}

function readPort(source: NodeJS.ProcessEnv): number {
  const raw = optionalEnv(source, "PORT") ?? optionalEnv(source, "GATEWAY_BROKER_PORT") ?? "19088";
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw runtimeEnvError(
      "gatewayBroker.invalidEnv",
      "PORT must be an integer between 0 and 65535.",
    );
  }

  return port;
}

function readInternalToken(source: NodeJS.ProcessEnv): string {
  const token = requireEnv(source, "BROKER_INTERNAL_TOKEN");
  if (token.length < 32) {
    throw runtimeEnvError(
      "gatewayBroker.invalidEnv",
      "BROKER_INTERNAL_TOKEN must be at least 32 characters.",
    );
  }

  return token;
}

function readGatewayUrl(source: NodeJS.ProcessEnv): string {
  const value = requireEnv(source, "OPENCLAW_GATEWAY_URL");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw runtimeEnvError(
      "gatewayBroker.invalidEnv",
      "OPENCLAW_GATEWAY_URL must be a valid ws:// or wss:// URL.",
      error,
    );
  }

  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    throw runtimeEnvError(
      "gatewayBroker.invalidEnv",
      "OPENCLAW_GATEWAY_URL must be a ws:// or wss:// URL.",
    );
  }

  return parsed.toString();
}

function readTenantId(source: NodeJS.ProcessEnv): TenantId {
  const value = requireEnv(source, "OPENCLAW_GATEWAY_TENANT_ID");
  try {
    return makeTenantId(value);
  } catch (error) {
    throw runtimeEnvError(
      "gatewayBroker.invalidEnv",
      "OPENCLAW_GATEWAY_TENANT_ID must be the authenticated Opzava tenant/org id.",
      error,
    );
  }
}

function readPrivateKeyPem(source: NodeJS.ProcessEnv): string {
  const base64Value = optionalEnv(source, "OPENCLAW_DEVICE_PRIVATE_KEY_PEM_BASE64");
  if (base64Value !== undefined) {
    return Buffer.from(base64Value, "base64").toString("utf8");
  }

  const pemValue = optionalEnv(source, "OPENCLAW_DEVICE_PRIVATE_KEY_PEM");
  if (pemValue !== undefined) {
    return pemValue.replaceAll("\\n", "\n");
  }

  throw runtimeEnvError(
    "gatewayBroker.missingEnv",
    "OPENCLAW_DEVICE_PRIVATE_KEY_PEM_BASE64 or OPENCLAW_DEVICE_PRIVATE_KEY_PEM is required.",
  );
}

function readDeviceKeypair(source: NodeJS.ProcessEnv): DeviceKeypair {
  const deviceId = optionalEnv(source, "OPENCLAW_DEVICE_ID");
  const publicKey = optionalEnv(source, "OPENCLAW_DEVICE_PUBLIC_KEY");

  try {
    return new Ed25519DeviceKeypair({
      privateKeyPem: readPrivateKeyPem(source),
      ...(deviceId === undefined ? {} : { deviceId }),
      ...(publicKey === undefined ? {} : { publicKey }),
    });
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }

    throw runtimeEnvError(
      "gatewayBroker.invalidEnv",
      "OpenClaw broker device keypair environment is invalid.",
      error,
    );
  }
}

async function readDeviceTokenFromVault(source: NodeJS.ProcessEnv): Promise<string> {
  const filePath = requireEnv(source, "OPENCLAW_DEV_SECRETS_FILE");
  const tenantId = makeTenantId(
    optionalEnv(source, "OPENCLAW_DEVICE_TOKEN_VAULT_TENANT_ID") ??
      defaultDeviceTokenVaultTenantId,
  );
  const label =
    optionalEnv(source, "OPENCLAW_DEVICE_TOKEN_VAULT_LABEL") ?? defaultDeviceTokenVaultLabel;
  const version = optionalEnv(source, "OPENCLAW_DEVICE_TOKEN_VAULT_VERSION");
  const ref = expectedLocalFileSecretReference({
    tenantId,
    purpose: "openclaw",
    label,
    ...(version === undefined ? {} : { version }),
  });

  const token = await new LocalFileSecretsVault({ filePath }).resolveSecretValue({
    ref,
    requestedBy: "gateway-broker",
    reason: "openclaw-hot-path-device-token",
  });
  if (!token.ok) {
    throw runtimeEnvError(
      "gatewayBroker.deviceTokenUnavailable",
      "OpenClaw paired operator device token was not found in the configured SecretsVault.",
      token.error,
    );
  }

  return token.value;
}

async function readPairedDeviceToken(source: NodeJS.ProcessEnv): Promise<string> {
  const directToken = optionalEnv(source, "OPENCLAW_OPERATOR_DEVICE_TOKEN");
  const token = directToken ?? (await readDeviceTokenFromVault(source));
  if (token.trim() === "") {
    throw runtimeEnvError(
      "gatewayBroker.deviceTokenUnavailable",
      "OpenClaw paired operator device token must be non-empty.",
    );
  }

  return token;
}

export async function loadGatewayBrokerRuntimeConfig(
  source: NodeJS.ProcessEnv = process.env,
): Promise<GatewayBrokerRuntimeConfig> {
  return {
    port: readPort(source),
    internalToken: readInternalToken(source),
    routeId: (optionalEnv(source, "OPENCLAW_GATEWAY_ROUTE_ID") ??
      defaultRouteId) as OpenClawGatewayRouteId,
    tenantId: readTenantId(source),
    gatewayUrl: readGatewayUrl(source),
    pairedDeviceToken: await readPairedDeviceToken(source),
    deviceKeypair: readDeviceKeypair(source),
    clientVersion: optionalEnv(source, "OPENCLAW_GATEWAY_CLIENT_VERSION") ?? defaultClientVersion,
  };
}
