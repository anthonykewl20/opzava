import "dotenv/config";

import path from "node:path";
import { pathToFileURL } from "node:url";

import { expectedLocalFileSecretReference, LocalFileSecretsVault } from "@opzava/adapters";
import type { SecretReference } from "@opzava/ports";
import { DomainError, type Result } from "@opzava/shared-kernel";

import {
  ASK_ADMIN_AGENT_VERSION,
  ASK_ADMIN_DEVICE_TOKEN_LABEL,
  ASK_ADMIN_HOT_PATH_OPERATOR_SCOPES,
  ASK_ADMIN_PLATFORM_TENANT_ID,
  prepareAskAdminProvisioning,
  type AskAdminProvisioningReceipt,
} from "./ask-admin-agent.js";

export interface BootstrapPlatformGatewayLogger {
  log(message: string): void;
}

export interface BootstrapPlatformGatewayOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly logger?: BootstrapPlatformGatewayLogger | null;
}

export interface BootstrapPlatformGatewayReceipt {
  readonly gatewayUrl: string;
  readonly deviceTokenStored: boolean;
  readonly provisioningReceipt: AskAdminProvisioningReceipt;
  readonly manualSteps: readonly string[];
}

function domainError(code: string, message: string): DomainError {
  return new DomainError({
    code,
    message,
  });
}

function optionalEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  return value === undefined || value.trim() === "" ? undefined : value.trim();
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = optionalEnv(env, name);
  if (value === undefined) {
    throw domainError("workers.openclawBootstrap.missingEnv", `${name} is required.`);
  }

  return value;
}

function gatewayUrl(env: NodeJS.ProcessEnv): string {
  const value = requireEnv(env, "OPENCLAW_GATEWAY_URL");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw domainError(
      "workers.openclawBootstrap.invalidGatewayUrl",
      "OPENCLAW_GATEWAY_URL must be a valid ws:// or wss:// Gateway WebSocket URL.",
    );
  }

  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    throw domainError(
      "workers.openclawBootstrap.invalidGatewayUrl",
      "OPENCLAW_GATEWAY_URL must be a ws:// or wss:// Gateway WebSocket URL.",
    );
  }

  return parsed.toString();
}

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}

function manualPairingSteps(url: string): readonly string[] {
  const scopes = ASK_ADMIN_HOT_PATH_OPERATOR_SCOPES.map((scope) => `--scope ${scope}`).join(" ");

  return [
    "The vendored OpenClaw docs document operator-device approval through the CLI; this bootstrap stops before any interactive approval or token echo boundary.",
    `Preview pending device requests: openclaw devices approve --latest --url ${url} --token "$OPENCLAW_GATEWAY_TOKEN"`,
    `Approve the exact verified request: openclaw devices approve <requestId> --url ${url} --token "$OPENCLAW_GATEWAY_TOKEN"`,
    `List paired devices: openclaw devices list --json --url ${url} --token "$OPENCLAW_GATEWAY_TOKEN"`,
    `If the CLI returns an operator device token for the approved device, rerun this command with OPENCLAW_OPERATOR_DEVICE_TOKEN set; the token will be stored in the dev vault and never printed.`,
    `Approved hot-path scopes must be exactly: ${ASK_ADMIN_HOT_PATH_OPERATOR_SCOPES.join(", ")}.`,
    `For already paired self-token rotation only, use: openclaw devices rotate --device <deviceId> --role operator ${scopes} --json --url ${url} --token "$OPENCLAW_OPERATOR_DEVICE_TOKEN"`,
  ];
}

async function storeProvidedDeviceToken(
  env: NodeJS.ProcessEnv,
): Promise<{ readonly stored: boolean; readonly ref: SecretReference }> {
  const expectedRef = expectedLocalFileSecretReference({
    tenantId: ASK_ADMIN_PLATFORM_TENANT_ID,
    purpose: "openclaw",
    label: ASK_ADMIN_DEVICE_TOKEN_LABEL,
    version: ASK_ADMIN_AGENT_VERSION,
  });
  const token = optionalEnv(env, "OPENCLAW_OPERATOR_DEVICE_TOKEN");

  if (token === undefined) {
    return { stored: false, ref: expectedRef };
  }

  const vaultFile = requireEnv(env, "OPENCLAW_DEV_SECRETS_FILE");
  const vault = new LocalFileSecretsVault({ filePath: vaultFile });
  const stored = unwrap(
    await vault.putSecret({
      tenantId: ASK_ADMIN_PLATFORM_TENANT_ID,
      purpose: "openclaw",
      label: ASK_ADMIN_DEVICE_TOKEN_LABEL,
      value: token,
      version: ASK_ADMIN_AGENT_VERSION,
    }),
  );

  return { stored: true, ref: stored };
}

export async function bootstrapPlatformGateway(
  options: BootstrapPlatformGatewayOptions = {},
): Promise<BootstrapPlatformGatewayReceipt> {
  const env = options.env ?? process.env;
  const logger = options.logger === undefined ? console : options.logger;
  const url = gatewayUrl(env);
  const deviceToken = await storeProvidedDeviceToken(env);
  const provisioning = prepareAskAdminProvisioning({
    deviceTokenRef: deviceToken.ref,
  });
  const receipt: BootstrapPlatformGatewayReceipt = {
    gatewayUrl: url,
    deviceTokenStored: deviceToken.stored,
    provisioningReceipt: provisioning.receipt,
    manualSteps: manualPairingSteps(url),
  };

  logger?.log(JSON.stringify(receipt, null, 2));
  return receipt;
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntrypoint) {
  void bootstrapPlatformGateway().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "OpenClaw platform Gateway bootstrap failed.";
    console.error(message);
    process.exitCode = 1;
  });
}
