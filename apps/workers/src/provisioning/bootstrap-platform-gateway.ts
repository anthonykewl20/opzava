import "dotenv/config";

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { expectedLocalFileSecretReference, LocalFileSecretsVault } from "@opzava/adapters";
import {
  Ed25519DeviceKeypair,
  OPENCLAW_EXTERNAL_OPERATOR_CLIENT_ID,
  OPENCLAW_EXTERNAL_OPERATOR_CLIENT_MODE,
  OPENCLAW_PROTOCOL_VERSION,
  deriveDeviceIdFromPublicKey,
  deriveOpenClawDeviceIdentity as deriveSharedOpenClawDeviceIdentity,
  hasExactScopeProfile,
  isConnectChallenge,
  isHelloOkEnvelope,
  isRecord,
  parseOpenClawFrame,
  serializeOpenClawFrame,
  type DeviceKeypair,
  type DeviceSignatureInput,
  type OpenClawDeviceIdentity,
  type OpenClawFrame,
  type OpenClawResponseFrame,
} from "@opzava/openclaw-wire";
import type { SecretReference, SecretsVaultPort } from "@opzava/ports";
import { DomainError, type Result } from "@opzava/shared-kernel";

import {
  ASK_ADMIN_AGENT_VERSION,
  ASK_ADMIN_DEVICE_TOKEN_LABEL,
  ASK_ADMIN_HOT_PATH_OPERATOR_SCOPES,
  ASK_ADMIN_PLATFORM_TENANT_ID,
  ASK_ADMIN_WORKER_ADMIN_DEVICE_TOKEN_LABEL,
  ASK_ADMIN_WORKER_ADMIN_OPERATOR_SCOPES,
  prepareAskAdminProvisioning,
  type AskAdminProvisioningReceipt,
} from "./ask-admin-agent.js";

export interface BootstrapPlatformGatewayLogger {
  log(message: string): void;
}

export interface BootstrapPlatformGatewayOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly logger?: BootstrapPlatformGatewayLogger | null;
  readonly deviceKeypair?: BootstrapDeviceKeypair;
  readonly workerAdminDeviceKeypair?: BootstrapDeviceKeypair;
  readonly socketFactory?: BootstrapWebSocketFactory;
  readonly now?: () => number;
}

export interface BootstrapPlatformGatewayReceipt {
  readonly gatewayUrl: string;
  readonly deviceTokenStored: boolean;
  readonly workerAdminDeviceTokenStored: boolean;
  readonly pairing: BootstrapOpenClawHandshakeResult;
  readonly workerAdminPairing: BootstrapOpenClawHandshakeResult;
  readonly phases: readonly BootstrapOpenClawHandshakeResult[];
  readonly workerAdminPhases: readonly BootstrapOpenClawHandshakeResult[];
  readonly provisioningReceipt: AskAdminProvisioningReceipt;
  readonly manualSteps: readonly string[];
}

export type BootstrapDeviceSignatureInput = DeviceSignatureInput;
export type BootstrapDeviceKeypair = DeviceKeypair;
export type { OpenClawDeviceIdentity };

export interface BootstrapWebSocket {
  send(data: string): void;
  close(): void;
  onMessage(listener: (data: string) => void): void;
  onClose(listener: () => void): void;
  onError(listener: (error: unknown) => void): void;
}

export type BootstrapWebSocketFactory = (url: string) => BootstrapWebSocket;

export type BootstrapOpenClawHandshakeResult =
  | {
      readonly status: "pending_approval";
      readonly requestId?: string;
      readonly approvalCommand: string;
      readonly failureCode?: string;
      readonly recommendedNextStep?: string;
    }
  | {
      readonly status: "validated";
      readonly negotiatedProtocol: number;
      readonly scopes: readonly string[];
      readonly serverVersion: string;
      readonly connectionId: string;
      readonly issuedDeviceToken?: boolean;
      readonly issuedAtMs?: number;
    };

interface BootstrapAuthCredential {
  readonly field: "token" | "deviceToken" | "bootstrapToken";
  readonly value: string;
}

interface BootstrapOpenClawDialResult {
  readonly handshake: BootstrapOpenClawHandshakeResult;
  readonly issuedDeviceToken?: string;
}

interface BootstrapDeviceProfile {
  readonly name: string;
  readonly tokenLabel: string;
  readonly tokenEnvName: string;
  readonly requestedScopes: readonly string[];
  readonly allowedGrantedScopes: readonly string[];
  readonly connectId: string;
  readonly userAgent: string;
}

const openClawClientId = OPENCLAW_EXTERNAL_OPERATOR_CLIENT_ID;
const openClawClientMode = OPENCLAW_EXTERNAL_OPERATOR_CLIENT_MODE;
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const brokerHotPathProfile: BootstrapDeviceProfile = {
  name: "broker hot-path",
  tokenLabel: ASK_ADMIN_DEVICE_TOKEN_LABEL,
  tokenEnvName: "OPENCLAW_OPERATOR_DEVICE_TOKEN",
  requestedScopes: ASK_ADMIN_HOT_PATH_OPERATOR_SCOPES,
  allowedGrantedScopes: [...ASK_ADMIN_HOT_PATH_OPERATOR_SCOPES, "operator.read"],
  connectId: "connect:ask-admin-opzava-bootstrap:broker",
  userAgent: `opzava-gateway-broker/${ASK_ADMIN_AGENT_VERSION}`,
};
const workerAdminProfile: BootstrapDeviceProfile = {
  name: "worker admin",
  tokenLabel: ASK_ADMIN_WORKER_ADMIN_DEVICE_TOKEN_LABEL,
  tokenEnvName: "WORKER_OPENCLAW_OPERATOR_DEVICE_TOKEN",
  requestedScopes: ASK_ADMIN_WORKER_ADMIN_OPERATOR_SCOPES,
  // The Gateway materializes operator.write alongside operator.admin (as it
  // materializes operator.read alongside operator.write for the hot path).
  allowedGrantedScopes: [...ASK_ADMIN_WORKER_ADMIN_OPERATOR_SCOPES, "operator.write"],
  connectId: "connect:ask-admin-opzava-bootstrap:worker-admin",
  userAgent: `opzava-connections-provisioning/${ASK_ADMIN_AGENT_VERSION}`,
};

function domainError(code: string, message: string): DomainError {
  return new DomainError({
    code,
    message,
  });
}

function resolveDevSecretsFilePath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(workspaceRoot, filePath);
}

function bootstrapError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

function hasExactExpectedScopes(
  profile: BootstrapDeviceProfile,
  scopes: readonly string[],
): boolean {
  return hasExactScopeProfile(
    { required: profile.requestedScopes, allowed: profile.allowedGrantedScopes },
    scopes,
  );
}

export function deriveOpenClawDeviceIdentity(privateKeyPem: string): OpenClawDeviceIdentity {
  try {
    return deriveSharedOpenClawDeviceIdentity(privateKeyPem);
  } catch (error) {
    throw new DomainError({
      code: "workers.openclawBootstrap.invalidDeviceKey",
      message: "OpenClaw device private key must be an Ed25519 PKCS8 PEM key.",
      cause: error,
    });
  }
}

function envName(prefix: string | undefined, name: string): string {
  return prefix === undefined ? name : `${prefix}_${name}`;
}

function readPrivateKeyPem(env: NodeJS.ProcessEnv, prefix?: string): string {
  const base64Name = envName(prefix, "OPENCLAW_DEVICE_PRIVATE_KEY_PEM_BASE64");
  const base64Value = optionalEnv(env, base64Name);
  if (base64Value !== undefined) {
    return Buffer.from(base64Value, "base64").toString("utf8");
  }

  const pemName = envName(prefix, "OPENCLAW_DEVICE_PRIVATE_KEY_PEM");
  const pemValue = optionalEnv(env, pemName);
  if (pemValue !== undefined) {
    return pemValue.replaceAll("\\n", "\n");
  }

  throw domainError(
    "workers.openclawBootstrap.missingEnv",
    `${base64Name} or ${pemName} is required.`,
  );
}

function readDeviceKeypair(env: NodeJS.ProcessEnv, prefix?: string): BootstrapDeviceKeypair {
  const privateKeyPem = readPrivateKeyPem(env, prefix);
  const derived = deriveOpenClawDeviceIdentity(privateKeyPem);
  const deviceIdName = envName(prefix, "OPENCLAW_DEVICE_ID");
  const publicKeyName = envName(prefix, "OPENCLAW_DEVICE_PUBLIC_KEY");
  const explicitDeviceId = optionalEnv(env, deviceIdName);
  const explicitPublicKey = optionalEnv(env, publicKeyName);

  if (explicitDeviceId !== undefined && explicitDeviceId !== derived.deviceId) {
    throw domainError(
      "workers.openclawBootstrap.deviceIdentityMismatch",
      `${deviceIdName} does not match the Ed25519 private key.`,
    );
  }

  if (explicitPublicKey !== undefined) {
    const explicitDeviceIdFromPublicKey = deriveDeviceIdFromPublicKey(explicitPublicKey);
    if (explicitDeviceIdFromPublicKey !== derived.deviceId) {
      throw domainError(
        "workers.openclawBootstrap.deviceIdentityMismatch",
        `${publicKeyName} does not match the Ed25519 private key.`,
      );
    }
  }

  return new Ed25519DeviceKeypair({
    deviceId: derived.deviceId,
    publicKey: derived.publicKeyBase64Url,
    privateKeyPem,
  });
}

function defaultSocketFactory(url: string): BootstrapWebSocket {
  const WebSocketCtor = (
    globalThis as unknown as {
      readonly WebSocket?: new (url: string) => {
        send(data: string): void;
        close(): void;
        addEventListener(
          type: string,
          listener: (event: { readonly data?: unknown }) => void,
        ): void;
      };
    }
  ).WebSocket;

  if (WebSocketCtor === undefined) {
    throw bootstrapError(
      "workers.openclawBootstrap.websocketUnavailable",
      "Global WebSocket is unavailable in this Node runtime.",
    );
  }

  const socket = new WebSocketCtor(url);
  return {
    send(data) {
      socket.send(data);
    },
    close() {
      socket.close();
    },
    onMessage(listener) {
      socket.addEventListener("message", (event) => listener(String(event.data ?? "")));
    },
    onClose(listener) {
      socket.addEventListener("close", listener);
    },
    onError(listener) {
      socket.addEventListener("error", listener);
    },
  };
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

function approvalCommand(url: string, requestId?: string): string {
  return `openclaw devices approve ${requestId ?? "<requestId>"} --url ${url} --token "$OPENCLAW_GATEWAY_TOKEN"`;
}

function manualPairingSteps(
  url: string,
  profile: BootstrapDeviceProfile,
  pairing: BootstrapOpenClawHandshakeResult,
): readonly string[] {
  const scopes = profile.requestedScopes.map((scope) => `--scope ${scope}`).join(" ");

  if (pairing.status === "validated") {
    return [
      `Paired ${profile.name} operator device token validated with protocol ${pairing.negotiatedProtocol}.`,
      `Validated scopes: ${pairing.scopes.join(", ")}.`,
      `Future self-token rotation only: openclaw devices rotate --device <deviceId> --role operator ${scopes} --json --url ${url} --token "$OPENCLAW_OPERATOR_DEVICE_TOKEN"`,
    ];
  }

  return [
    `The bootstrap connected with the ${profile.name} device identity and no paired operator token so the Gateway can record a pending pairing request.`,
    `Approve the exact verified request: ${pairing.approvalCommand}`,
    `Preview pending device requests: openclaw devices approve --latest --url ${url} --token "$OPENCLAW_GATEWAY_TOKEN"`,
    `List paired devices: openclaw devices list --json --url ${url} --token "$OPENCLAW_GATEWAY_TOKEN"`,
    `If the CLI returns an operator device token for the approved device, rerun this command with ${profile.tokenEnvName} set; the token will be stored in the dev vault and never printed.`,
    `Approved ${profile.name} scopes must be exactly: ${profile.requestedScopes.join(", ")}.`,
    `For already paired self-token rotation only: openclaw devices rotate --device <deviceId> --role operator ${scopes} --json --url ${url} --token "$OPENCLAW_OPERATOR_DEVICE_TOKEN"`,
  ];
}

function errorDetails(frame: OpenClawResponseFrame): Record<string, unknown> {
  return isRecord(frame.error?.details) ? frame.error.details : {};
}

function stringDetail(
  details: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = details[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }

  return undefined;
}

function pendingPairingResult(
  url: string,
  frame?: OpenClawResponseFrame,
): BootstrapOpenClawHandshakeResult {
  const details = frame === undefined ? {} : errorDetails(frame);
  const requestId = stringDetail(details, [
    "requestId",
    "pairingRequestId",
    "devicePairingRequestId",
    "pendingRequestId",
  ]);
  const recommendedNextStep = stringDetail(details, ["recommendedNextStep"]);

  return {
    status: "pending_approval",
    ...(requestId === undefined ? {} : { requestId }),
    approvalCommand: approvalCommand(url, requestId),
    ...(typeof frame?.error?.code === "string" ? { failureCode: frame.error.code } : {}),
    ...(recommendedNextStep === undefined ? {} : { recommendedNextStep }),
  };
}

function buildConnectFrame(input: {
  readonly profile: BootstrapDeviceProfile;
  readonly keypair: BootstrapDeviceKeypair;
  readonly nonce: string;
  readonly credential?: BootstrapAuthCredential;
  readonly now: () => number;
}): Promise<OpenClawFrame> {
  const signedAt = input.now();
  const token = input.credential?.value ?? "";
  const auth =
    input.credential === undefined
      ? {}
      : {
          [input.credential.field]: input.credential.value,
        };

  return input.keypair
    .sign({
      clientId: openClawClientId,
      clientMode: openClawClientMode,
      clientVersion: ASK_ADMIN_AGENT_VERSION,
      platform: "node",
      deviceFamily: "server",
      deviceId: input.keypair.deviceId,
      publicKey: input.keypair.publicKey,
      role: "operator",
      scopes: input.profile.requestedScopes,
      token,
      nonce: input.nonce,
      signedAt,
    })
    .then((signature) => ({
      type: "req",
      id: input.profile.connectId,
      method: "connect",
      params: {
        minProtocol: OPENCLAW_PROTOCOL_VERSION,
        maxProtocol: OPENCLAW_PROTOCOL_VERSION,
        client: {
          id: openClawClientId,
          version: ASK_ADMIN_AGENT_VERSION,
          platform: "node",
          mode: openClawClientMode,
        },
        role: "operator",
        scopes: input.profile.requestedScopes,
        caps: [],
        commands: [],
        permissions: {},
        // Paired device tokens are presented as auth.deviceToken; auth.token is
        // compared against the shared gateway token by the live Gateway.
        auth,
        locale: "en-US",
        userAgent: input.profile.userAgent,
        device: {
          id: input.keypair.deviceId,
          publicKey: input.keypair.publicKey,
          signature,
          signedAt,
          nonce: input.nonce,
        },
      },
    }));
}

function validatedHandshakeResult(
  payload: unknown,
  options: {
    readonly profile: BootstrapDeviceProfile;
    readonly requireExpectedScopes: boolean;
    readonly requireIssuedDeviceToken?: boolean;
  },
): Result<BootstrapOpenClawDialResult> {
  if (!isHelloOkEnvelope(payload)) {
    return {
      ok: false,
      error: bootstrapError(
        "workers.openclawBootstrap.invalidHello",
        "OpenClaw Gateway returned an invalid hello-ok payload.",
      ),
    };
  }

  const protocol = payload["protocol"];
  const auth = payload["auth"];
  const server = payload["server"];
  const scopes =
    isRecord(auth) && Array.isArray(auth["scopes"])
      ? auth["scopes"].filter((scope): scope is string => typeof scope === "string")
      : [];
  const serverVersion = isRecord(server) ? server["version"] : undefined;
  const connectionId = isRecord(server) ? server["connId"] : undefined;
  const issuedDeviceToken =
    isRecord(auth) && typeof auth["deviceToken"] === "string" && auth["deviceToken"].trim() !== ""
      ? auth["deviceToken"]
      : undefined;
  const issuedAtMs =
    isRecord(auth) && typeof auth["issuedAtMs"] === "number" ? auth["issuedAtMs"] : undefined;
  if (
    typeof protocol !== "number" ||
    protocol !== OPENCLAW_PROTOCOL_VERSION ||
    !isRecord(auth) ||
    auth["role"] !== "operator" ||
    (options.requireExpectedScopes && !hasExactExpectedScopes(options.profile, scopes)) ||
    !isRecord(server) ||
    typeof serverVersion !== "string" ||
    typeof connectionId !== "string"
  ) {
    return {
      ok: false,
      error: bootstrapError(
        "workers.openclawBootstrap.scopeMismatch",
        "OpenClaw Gateway hello-ok did not prove the required protocol, role, and scope contract.",
      ),
    };
  }

  if (options.requireIssuedDeviceToken === true && issuedDeviceToken === undefined) {
    return {
      ok: false,
      error: bootstrapError(
        "workers.openclawBootstrap.missingIssuedDeviceToken",
        "OpenClaw Gateway did not issue a paired device token after gateway-token auth.",
      ),
    };
  }

  return {
    ok: true,
    value: {
      handshake: {
        status: "validated",
        negotiatedProtocol: protocol,
        scopes,
        serverVersion,
        connectionId,
        ...(issuedDeviceToken === undefined ? {} : { issuedDeviceToken: true }),
        ...(issuedAtMs === undefined ? {} : { issuedAtMs }),
      },
      ...(issuedDeviceToken === undefined ? {} : { issuedDeviceToken }),
    },
  };
}

async function dialOpenClawGateway(input: {
  readonly profile: BootstrapDeviceProfile;
  readonly url: string;
  readonly keypair: BootstrapDeviceKeypair;
  readonly credential?: BootstrapAuthCredential;
  readonly requireExpectedScopes: boolean;
  readonly requireIssuedDeviceToken?: boolean;
  readonly allowPairingRequired: boolean;
  readonly socketFactory: BootstrapWebSocketFactory;
  readonly now: () => number;
  readonly timeoutMs?: number;
}): Promise<Result<BootstrapOpenClawDialResult>> {
  return await new Promise<Result<BootstrapOpenClawDialResult>>((resolve) => {
    let socket: BootstrapWebSocket;
    try {
      socket = input.socketFactory(input.url);
    } catch (error) {
      resolve({
        ok: false,
        error: bootstrapError(
          "workers.openclawBootstrap.gatewayUnavailable",
          "OpenClaw Gateway WebSocket could not be opened.",
          error,
        ),
      });
      return;
    }

    let settled = false;
    let connectSent = false;

    const settle = (result: Result<BootstrapOpenClawDialResult>) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      socket.close();
      resolve(result);
    };

    const timeout = setTimeout(() => {
      settle({
        ok: false,
        error: bootstrapError(
          "workers.openclawBootstrap.timeout",
          "OpenClaw Gateway did not complete the bootstrap handshake in time.",
        ),
      });
    }, input.timeoutMs ?? 15_000);

    socket.onMessage((raw) => {
      const frame = parseOpenClawFrame(raw);
      if (frame === null) {
        settle({
          ok: false,
          error: bootstrapError("workers.openclawBootstrap.invalidFrame", "Invalid Gateway frame."),
        });
        return;
      }

      if (frame.type === "event" && frame.event === "connect.challenge") {
        if (!isConnectChallenge(frame, { requireTimestamp: false })) {
          settle({
            ok: false,
            error: bootstrapError(
              "workers.openclawBootstrap.invalidChallenge",
              "OpenClaw Gateway returned an invalid connect.challenge payload.",
            ),
          });
          return;
        }

        void buildConnectFrame({
          profile: input.profile,
          keypair: input.keypair,
          nonce: frame.payload.nonce,
          ...(input.credential === undefined ? {} : { credential: input.credential }),
          now: input.now,
        })
          .then((connectFrame) => {
            connectSent = true;
            socket.send(serializeOpenClawFrame(connectFrame));
          })
          .catch((error: unknown) => {
            settle({
              ok: false,
              error: bootstrapError(
                "workers.openclawBootstrap.deviceSignatureFailed",
                "OpenClaw bootstrap device keypair failed to sign the challenge.",
                error,
              ),
            });
          });
        return;
      }

      if (frame.type !== "res" || frame.id !== input.profile.connectId) {
        settle({
          ok: false,
          error: bootstrapError(
            "workers.openclawBootstrap.unexpectedFrame",
            "OpenClaw Gateway returned an unexpected bootstrap frame.",
          ),
        });
        return;
      }

      if (frame.ok === true) {
        settle(
          validatedHandshakeResult(frame.payload, {
            profile: input.profile,
            requireExpectedScopes: input.requireExpectedScopes,
            ...(input.requireIssuedDeviceToken === undefined
              ? {}
              : { requireIssuedDeviceToken: input.requireIssuedDeviceToken }),
          }),
        );
        return;
      }

      if (input.allowPairingRequired && frame.error?.code === "PAIRING_REQUIRED") {
        settle({ ok: true, value: { handshake: pendingPairingResult(input.url, frame) } });
        return;
      }

      settle({
        ok: false,
        error: bootstrapError(
          "workers.openclawBootstrap.connectRejected",
          frame.error?.message ?? "OpenClaw Gateway rejected bootstrap connect.",
        ),
      });
    });

    socket.onClose(() => {
      if (!settled && input.allowPairingRequired && connectSent) {
        settle({ ok: true, value: { handshake: pendingPairingResult(input.url) } });
        return;
      }

      settle({
        ok: false,
        error: bootstrapError(
          "workers.openclawBootstrap.connectionClosed",
          "OpenClaw Gateway closed the bootstrap connection.",
        ),
      });
    });

    socket.onError((error) => {
      settle({
        ok: false,
        error: bootstrapError(
          "workers.openclawBootstrap.gatewayUnavailable",
          "OpenClaw Gateway WebSocket failed.",
          error,
        ),
      });
    });
  });
}

async function storeProvidedDeviceToken(input: {
  readonly env: NodeJS.ProcessEnv;
  readonly profile: BootstrapDeviceProfile;
  readonly token?: string;
}): Promise<{ readonly stored: boolean; readonly ref: SecretReference }> {
  const expectedRef = expectedLocalFileSecretReference({
    tenantId: ASK_ADMIN_PLATFORM_TENANT_ID,
    purpose: "openclaw",
    label: input.profile.tokenLabel,
    version: ASK_ADMIN_AGENT_VERSION,
  });

  if (input.token === undefined) {
    return { stored: false, ref: expectedRef };
  }

  const vaultFile = resolveDevSecretsFilePath(requireEnv(input.env, "OPENCLAW_DEV_SECRETS_FILE"));
  const vault: SecretsVaultPort = new LocalFileSecretsVault({ filePath: vaultFile });
  const stored = unwrap(
    await vault.putSecret({
      tenantId: ASK_ADMIN_PLATFORM_TENANT_ID,
      purpose: "openclaw",
      label: input.profile.tokenLabel,
      value: input.token,
      version: ASK_ADMIN_AGENT_VERSION,
    }),
  );

  return { stored: true, ref: stored };
}

async function readStoredDeviceToken(input: {
  readonly env: NodeJS.ProcessEnv;
  readonly profile: BootstrapDeviceProfile;
}): Promise<string | undefined> {
  const vaultFileFromEnv = optionalEnv(input.env, "OPENCLAW_DEV_SECRETS_FILE");
  const vaultFile =
    vaultFileFromEnv === undefined ? undefined : resolveDevSecretsFilePath(vaultFileFromEnv);
  if (vaultFile === undefined) {
    return undefined;
  }

  const ref = expectedLocalFileSecretReference({
    tenantId: ASK_ADMIN_PLATFORM_TENANT_ID,
    purpose: "openclaw",
    label: input.profile.tokenLabel,
    version: ASK_ADMIN_AGENT_VERSION,
  });
  const vault: SecretsVaultPort = new LocalFileSecretsVault({ filePath: vaultFile });
  const token = await vault.resolveSecretValue({
    ref,
    requestedBy: "platform-gateway-bootstrap",
    reason: `${input.profile.name}-operator-device-token`,
  });

  return token.ok ? token.value : undefined;
}

async function provisionOperatorDevice(input: {
  readonly env: NodeJS.ProcessEnv;
  readonly profile: BootstrapDeviceProfile;
  readonly url: string;
  readonly keypair: BootstrapDeviceKeypair;
  readonly gatewayToken?: string;
  readonly socketFactory: BootstrapWebSocketFactory;
  readonly now: () => number;
}): Promise<{
  readonly pairing: BootstrapOpenClawHandshakeResult;
  readonly phases: readonly BootstrapOpenClawHandshakeResult[];
  readonly tokenStorage: { readonly stored: boolean; readonly ref: SecretReference };
}> {
  const tokenFromEnv = optionalEnv(input.env, input.profile.tokenEnvName);
  const providedDeviceToken =
    tokenFromEnv ?? (await readStoredDeviceToken({ env: input.env, profile: input.profile }));
  let pairing: BootstrapOpenClawHandshakeResult;
  let phases: BootstrapOpenClawHandshakeResult[];
  let tokenToStore: string | undefined;
  let deviceTokenStorage: { readonly stored: boolean; readonly ref: SecretReference } | undefined;

  if (providedDeviceToken !== undefined) {
    const validation = unwrap(
      await dialOpenClawGateway({
        profile: input.profile,
        url: input.url,
        keypair: input.keypair,
        credential: { field: "deviceToken", value: providedDeviceToken },
        requireExpectedScopes: true,
        allowPairingRequired: false,
        socketFactory: input.socketFactory,
        now: input.now,
      }),
    );
    pairing = validation.handshake;
    phases = [validation.handshake];
    if (tokenFromEnv !== undefined) {
      tokenToStore = providedDeviceToken;
    }
  } else if (input.gatewayToken !== undefined) {
    const issuance = unwrap(
      await dialOpenClawGateway({
        profile: input.profile,
        url: input.url,
        keypair: input.keypair,
        credential: { field: "token", value: input.gatewayToken },
        requireExpectedScopes: false,
        requireIssuedDeviceToken: true,
        allowPairingRequired: true,
        socketFactory: input.socketFactory,
        now: input.now,
      }),
    );

    if (issuance.handshake.status === "pending_approval") {
      pairing = issuance.handshake;
      phases = [issuance.handshake];
    } else {
      const issuedDeviceToken = issuance.issuedDeviceToken;
      if (issuedDeviceToken === undefined) {
        throw bootstrapError(
          "workers.openclawBootstrap.missingIssuedDeviceToken",
          "OpenClaw Gateway did not issue a paired device token after gateway-token auth.",
        );
      }

      tokenToStore = issuedDeviceToken;
      deviceTokenStorage = await storeProvidedDeviceToken({
        env: input.env,
        profile: input.profile,
        token: issuedDeviceToken,
      });
      const validation = unwrap(
        await dialOpenClawGateway({
          profile: input.profile,
          url: input.url,
          keypair: input.keypair,
          credential: { field: "deviceToken", value: issuedDeviceToken },
          requireExpectedScopes: true,
          allowPairingRequired: false,
          socketFactory: input.socketFactory,
          now: input.now,
        }),
      );
      pairing = validation.handshake;
      phases = [issuance.handshake, validation.handshake];
    }
  } else {
    const pending = unwrap(
      await dialOpenClawGateway({
        profile: input.profile,
        url: input.url,
        keypair: input.keypair,
        requireExpectedScopes: false,
        allowPairingRequired: true,
        socketFactory: input.socketFactory,
        now: input.now,
      }),
    );
    pairing = pending.handshake;
    phases = [pending.handshake];
  }

  const tokenStorage =
    deviceTokenStorage ??
    (await storeProvidedDeviceToken({
      env: input.env,
      profile: input.profile,
      ...(tokenToStore === undefined ? {} : { token: tokenToStore }),
    }));

  return { pairing, phases, tokenStorage };
}

export async function bootstrapPlatformGateway(
  options: BootstrapPlatformGatewayOptions = {},
): Promise<BootstrapPlatformGatewayReceipt> {
  const env = options.env ?? process.env;
  const logger = options.logger === undefined ? console : options.logger;
  const url = gatewayUrl(env);
  const gatewayToken = optionalEnv(env, "OPENCLAW_GATEWAY_TOKEN");
  const keypair = options.deviceKeypair ?? readDeviceKeypair(env);
  const workerAdminKeypair = options.workerAdminDeviceKeypair ?? readDeviceKeypair(env, "WORKER");
  const socketFactory = options.socketFactory ?? defaultSocketFactory;
  const now = options.now ?? Date.now;

  const brokerDevice = await provisionOperatorDevice({
    env,
    profile: brokerHotPathProfile,
    url,
    keypair,
    ...(gatewayToken === undefined ? {} : { gatewayToken }),
    socketFactory,
    now,
  });
  const workerAdminDevice = await provisionOperatorDevice({
    env,
    profile: workerAdminProfile,
    url,
    keypair: workerAdminKeypair,
    ...(gatewayToken === undefined ? {} : { gatewayToken }),
    socketFactory,
    now,
  });
  const provisioning = prepareAskAdminProvisioning({
    deviceTokenRef: brokerDevice.tokenStorage.ref,
    workerAdminDeviceTokenRef: workerAdminDevice.tokenStorage.ref,
  });
  const receipt: BootstrapPlatformGatewayReceipt = {
    gatewayUrl: url,
    deviceTokenStored: brokerDevice.tokenStorage.stored,
    workerAdminDeviceTokenStored: workerAdminDevice.tokenStorage.stored,
    pairing: brokerDevice.pairing,
    workerAdminPairing: workerAdminDevice.pairing,
    phases: brokerDevice.phases,
    workerAdminPhases: workerAdminDevice.phases,
    provisioningReceipt: provisioning.receipt,
    manualSteps: [
      ...manualPairingSteps(url, brokerHotPathProfile, brokerDevice.pairing),
      ...manualPairingSteps(url, workerAdminProfile, workerAdminDevice.pairing),
    ],
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
