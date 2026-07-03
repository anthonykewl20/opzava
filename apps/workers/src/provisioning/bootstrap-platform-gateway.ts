import "dotenv/config";

import { createHash, createPrivateKey, createPublicKey, sign as signData } from "node:crypto";
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
  readonly deviceKeypair?: BootstrapDeviceKeypair;
  readonly socketFactory?: BootstrapWebSocketFactory;
  readonly now?: () => number;
}

export interface BootstrapPlatformGatewayReceipt {
  readonly gatewayUrl: string;
  readonly deviceTokenStored: boolean;
  readonly pairing: BootstrapOpenClawHandshakeResult;
  readonly phases: readonly BootstrapOpenClawHandshakeResult[];
  readonly provisioningReceipt: AskAdminProvisioningReceipt;
  readonly manualSteps: readonly string[];
}

export interface BootstrapDeviceSignatureInput {
  readonly clientId: string;
  readonly clientMode: string;
  readonly clientVersion: string;
  readonly platform: string;
  readonly deviceFamily?: string;
  readonly deviceId: string;
  readonly publicKey: string;
  readonly role: "operator";
  readonly scopes: readonly string[];
  readonly token: string;
  readonly nonce: string;
  readonly signedAt: number;
}

export interface BootstrapDeviceKeypair {
  readonly deviceId: string;
  readonly publicKey: string;
  sign(input: BootstrapDeviceSignatureInput): Promise<string>;
}

export interface OpenClawDeviceIdentity {
  readonly deviceId: string;
  readonly publicKeyBase64Url: string;
}

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

interface OpenClawFrame {
  readonly type: string;
  readonly event?: string;
  readonly id?: string;
  readonly ok?: boolean;
  readonly method?: string;
  readonly params?: Record<string, unknown>;
  readonly payload?: unknown;
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly details?: Record<string, unknown>;
  };
}

const openClawClientId = "cli";
const openClawClientMode = "cli";
const ed25519SpkiPrefix = Buffer.from("302a300506032b6570032100", "hex");

function domainError(code: string, message: string): DomainError {
  return new DomainError({
    code,
    message,
  });
}

function bootstrapError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOpenClawFrame(raw: string): OpenClawFrame | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  return isRecord(parsed) && typeof parsed["type"] === "string"
    ? (parsed as unknown as OpenClawFrame)
    : null;
}

function serializeOpenClawFrame(frame: OpenClawFrame): string {
  return JSON.stringify(frame);
}

const IMPLIED_OPERATOR_SCOPES = ["operator.read"] as const;

function hasExactExpectedScopes(scopes: readonly string[]): boolean {
  // The live Gateway materializes operator.read alongside operator.write
  // ("write implies read"); tolerate only that addition, fail-closed otherwise.
  const allowed = new Set<string>([
    ...ASK_ADMIN_HOT_PATH_OPERATOR_SCOPES,
    ...IMPLIED_OPERATOR_SCOPES,
  ]);
  const unique = new Set(scopes);
  return (
    unique.size === scopes.length &&
    ASK_ADMIN_HOT_PATH_OPERATOR_SCOPES.every((scope) => scopes.includes(scope)) &&
    scopes.every((scope) => allowed.has(scope))
  );
}

function rawOpenClawPublicKey(publicKey: string): Buffer {
  const normalized = publicKey.trim();
  if (normalized.startsWith("-----BEGIN PUBLIC KEY-----")) {
    const spki = Buffer.from(createPublicKey(normalized).export({ type: "spki", format: "der" }));
    const raw = spki.subarray(ed25519SpkiPrefix.length);
    if (
      spki.length !== ed25519SpkiPrefix.length + 32 ||
      !spki.subarray(0, ed25519SpkiPrefix.length).equals(ed25519SpkiPrefix)
    ) {
      throw domainError(
        "workers.openclawBootstrap.invalidDeviceKey",
        "OpenClaw device public key must be an Ed25519 SPKI PEM key.",
      );
    }

    return raw;
  }

  const raw = Buffer.from(normalized, "base64url");
  if (raw.length !== 32) {
    throw domainError(
      "workers.openclawBootstrap.invalidDeviceKey",
      "OpenClaw device public key must be raw 32-byte Ed25519 base64url.",
    );
  }

  return raw;
}

function deviceIdFromRawPublicKey(rawPublicKey: Buffer): string {
  return createHash("sha256").update(rawPublicKey).digest("hex");
}

export function deriveOpenClawDeviceIdentity(privateKeyPem: string): OpenClawDeviceIdentity {
  const spki = Buffer.from(
    createPublicKey(createPrivateKey(privateKeyPem)).export({ type: "spki", format: "der" }),
  );
  const raw = spki.subarray(ed25519SpkiPrefix.length);
  if (
    spki.length !== ed25519SpkiPrefix.length + 32 ||
    !spki.subarray(0, ed25519SpkiPrefix.length).equals(ed25519SpkiPrefix)
  ) {
    throw domainError(
      "workers.openclawBootstrap.invalidDeviceKey",
      "OpenClaw device private key must be an Ed25519 PKCS8 PEM key.",
    );
  }

  return {
    deviceId: deviceIdFromRawPublicKey(raw),
    publicKeyBase64Url: raw.toString("base64url"),
  };
}

function deviceSignaturePayload(input: BootstrapDeviceSignatureInput): string {
  return [
    "v2",
    input.deviceId,
    input.clientId,
    input.clientMode,
    input.role,
    input.scopes.join(","),
    String(input.signedAt),
    input.token,
    input.nonce,
  ].join("|");
}

class Ed25519DeviceKeypair implements BootstrapDeviceKeypair {
  public readonly deviceId: string;
  public readonly publicKey: string;
  private readonly privateKeyPem: string;

  public constructor(input: {
    readonly deviceId: string;
    readonly publicKey: string;
    readonly privateKeyPem: string;
  }) {
    this.deviceId = input.deviceId;
    this.publicKey = input.publicKey;
    this.privateKeyPem = input.privateKeyPem;
  }

  public async sign(input: BootstrapDeviceSignatureInput): Promise<string> {
    return signData(
      null,
      Buffer.from(deviceSignaturePayload(input), "utf8"),
      createPrivateKey(this.privateKeyPem),
    ).toString("base64url");
  }
}

function readPrivateKeyPem(env: NodeJS.ProcessEnv): string {
  const base64Value = optionalEnv(env, "OPENCLAW_DEVICE_PRIVATE_KEY_PEM_BASE64");
  if (base64Value !== undefined) {
    return Buffer.from(base64Value, "base64").toString("utf8");
  }

  const pemValue = optionalEnv(env, "OPENCLAW_DEVICE_PRIVATE_KEY_PEM");
  if (pemValue !== undefined) {
    return pemValue.replaceAll("\\n", "\n");
  }

  throw domainError(
    "workers.openclawBootstrap.missingEnv",
    "OPENCLAW_DEVICE_PRIVATE_KEY_PEM_BASE64 or OPENCLAW_DEVICE_PRIVATE_KEY_PEM is required.",
  );
}

function readDeviceKeypair(env: NodeJS.ProcessEnv): BootstrapDeviceKeypair {
  const privateKeyPem = readPrivateKeyPem(env);
  const derived = deriveOpenClawDeviceIdentity(privateKeyPem);
  const explicitDeviceId = optionalEnv(env, "OPENCLAW_DEVICE_ID");
  const explicitPublicKey = optionalEnv(env, "OPENCLAW_DEVICE_PUBLIC_KEY");

  if (explicitDeviceId !== undefined && explicitDeviceId !== derived.deviceId) {
    throw domainError(
      "workers.openclawBootstrap.deviceIdentityMismatch",
      "OPENCLAW_DEVICE_ID does not match the Ed25519 private key.",
    );
  }

  if (explicitPublicKey !== undefined) {
    const explicitDeviceIdFromPublicKey = deviceIdFromRawPublicKey(
      rawOpenClawPublicKey(explicitPublicKey),
    );
    if (explicitDeviceIdFromPublicKey !== derived.deviceId) {
      throw domainError(
        "workers.openclawBootstrap.deviceIdentityMismatch",
        "OPENCLAW_DEVICE_PUBLIC_KEY does not match the Ed25519 private key.",
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
  pairing: BootstrapOpenClawHandshakeResult,
): readonly string[] {
  const scopes = ASK_ADMIN_HOT_PATH_OPERATOR_SCOPES.map((scope) => `--scope ${scope}`).join(" ");

  if (pairing.status === "validated") {
    return [
      `Paired operator device token validated with protocol ${pairing.negotiatedProtocol}.`,
      `Validated scopes: ${pairing.scopes.join(", ")}.`,
      `Future self-token rotation only: openclaw devices rotate --device <deviceId> --role operator ${scopes} --json --url ${url} --token "$OPENCLAW_OPERATOR_DEVICE_TOKEN"`,
    ];
  }

  return [
    "The bootstrap connected with the broker device identity and no paired operator token so the Gateway can record a pending pairing request.",
    `Approve the exact verified request: ${pairing.approvalCommand}`,
    `Preview pending device requests: openclaw devices approve --latest --url ${url} --token "$OPENCLAW_GATEWAY_TOKEN"`,
    `List paired devices: openclaw devices list --json --url ${url} --token "$OPENCLAW_GATEWAY_TOKEN"`,
    `If the CLI returns an operator device token for the approved device, rerun this command with OPENCLAW_OPERATOR_DEVICE_TOKEN set; the token will be stored in the dev vault and never printed.`,
    `Approved hot-path scopes must be exactly: ${ASK_ADMIN_HOT_PATH_OPERATOR_SCOPES.join(", ")}.`,
    `For already paired self-token rotation only: openclaw devices rotate --device <deviceId> --role operator ${scopes} --json --url ${url} --token "$OPENCLAW_OPERATOR_DEVICE_TOKEN"`,
  ];
}

function errorDetails(frame: OpenClawFrame): Record<string, unknown> {
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
  frame?: OpenClawFrame,
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
      scopes: ASK_ADMIN_HOT_PATH_OPERATOR_SCOPES,
      token,
      nonce: input.nonce,
      signedAt,
    })
    .then((signature) => ({
      type: "req",
      id: "connect:ask-admin-opzava-bootstrap",
      method: "connect",
      params: {
        minProtocol: 4,
        maxProtocol: 4,
        client: {
          id: openClawClientId,
          version: ASK_ADMIN_AGENT_VERSION,
          platform: "node",
          mode: openClawClientMode,
        },
        role: "operator",
        scopes: ASK_ADMIN_HOT_PATH_OPERATOR_SCOPES,
        caps: [],
        commands: [],
        permissions: {},
        // Paired device tokens are presented as auth.deviceToken; auth.token is
        // compared against the shared gateway token by the live Gateway.
        auth,
        locale: "en-US",
        userAgent: `opzava-gateway-broker/${ASK_ADMIN_AGENT_VERSION}`,
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
    readonly requireNarrowScopes: boolean;
    readonly requireIssuedDeviceToken?: boolean;
  },
): Result<BootstrapOpenClawDialResult> {
  if (!isRecord(payload) || payload["type"] !== "hello-ok") {
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
    protocol !== 4 ||
    !isRecord(auth) ||
    auth["role"] !== "operator" ||
    (options.requireNarrowScopes && !hasExactExpectedScopes(scopes)) ||
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
  readonly url: string;
  readonly keypair: BootstrapDeviceKeypair;
  readonly credential?: BootstrapAuthCredential;
  readonly requireNarrowScopes: boolean;
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
        const payload = isRecord(frame.payload) ? frame.payload : {};
        const nonce = payload["nonce"];
        if (typeof nonce !== "string" || nonce.trim() === "") {
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
          keypair: input.keypair,
          nonce,
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

      if (frame.type !== "res" || frame.id !== "connect:ask-admin-opzava-bootstrap") {
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
            requireNarrowScopes: input.requireNarrowScopes,
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
  readonly token?: string;
}): Promise<{ readonly stored: boolean; readonly ref: SecretReference }> {
  const expectedRef = expectedLocalFileSecretReference({
    tenantId: ASK_ADMIN_PLATFORM_TENANT_ID,
    purpose: "openclaw",
    label: ASK_ADMIN_DEVICE_TOKEN_LABEL,
    version: ASK_ADMIN_AGENT_VERSION,
  });

  if (input.token === undefined) {
    return { stored: false, ref: expectedRef };
  }

  const vaultFile = requireEnv(input.env, "OPENCLAW_DEV_SECRETS_FILE");
  const vault = new LocalFileSecretsVault({ filePath: vaultFile });
  const stored = unwrap(
    await vault.putSecret({
      tenantId: ASK_ADMIN_PLATFORM_TENANT_ID,
      purpose: "openclaw",
      label: ASK_ADMIN_DEVICE_TOKEN_LABEL,
      value: input.token,
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
  const providedDeviceToken = optionalEnv(env, "OPENCLAW_OPERATOR_DEVICE_TOKEN");
  const gatewayToken = optionalEnv(env, "OPENCLAW_GATEWAY_TOKEN");
  const keypair = options.deviceKeypair ?? readDeviceKeypair(env);
  const socketFactory = options.socketFactory ?? defaultSocketFactory;
  const now = options.now ?? Date.now;

  let pairing: BootstrapOpenClawHandshakeResult;
  let phases: BootstrapOpenClawHandshakeResult[];
  let tokenToStore: string | undefined;
  let deviceTokenStorage:
    | { readonly stored: boolean; readonly ref: SecretReference }
    | undefined;

  if (providedDeviceToken !== undefined) {
    const validation = unwrap(
      await dialOpenClawGateway({
        url,
        keypair,
        credential: { field: "deviceToken", value: providedDeviceToken },
        requireNarrowScopes: true,
        allowPairingRequired: false,
        socketFactory,
        now,
      }),
    );
    pairing = validation.handshake;
    phases = [validation.handshake];
    tokenToStore = providedDeviceToken;
  } else if (gatewayToken !== undefined) {
    const issuance = unwrap(
      await dialOpenClawGateway({
        url,
        keypair,
        credential: { field: "token", value: gatewayToken },
        requireNarrowScopes: false,
        requireIssuedDeviceToken: true,
        allowPairingRequired: true,
        socketFactory,
        now,
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
        env,
        token: issuedDeviceToken,
      });
      const validation = unwrap(
        await dialOpenClawGateway({
          url,
          keypair,
          credential: { field: "deviceToken", value: issuedDeviceToken },
          requireNarrowScopes: true,
          allowPairingRequired: false,
          socketFactory,
          now,
        }),
      );
      pairing = validation.handshake;
      phases = [issuance.handshake, validation.handshake];
    }
  } else {
    const pending = unwrap(
      await dialOpenClawGateway({
        url,
        keypair,
        requireNarrowScopes: false,
        allowPairingRequired: true,
        socketFactory,
        now,
      }),
    );
    pairing = pending.handshake;
    phases = [pending.handshake];
  }

  const deviceToken =
    deviceTokenStorage ??
    (await storeProvidedDeviceToken({
      env,
      ...(tokenToStore === undefined ? {} : { token: tokenToStore }),
    }));
  const provisioning = prepareAskAdminProvisioning({
    deviceTokenRef: deviceToken.ref,
  });
  const receipt: BootstrapPlatformGatewayReceipt = {
    gatewayUrl: url,
    deviceTokenStored: deviceToken.stored,
    pairing,
    phases,
    provisioningReceipt: provisioning.receipt,
    manualSteps: manualPairingSteps(url, pairing),
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
