import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomUUID,
  sign as signData,
} from "node:crypto";

import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import { ASK_ADMIN_AGENT_VERSION } from "./ask-admin-agent.js";

const openClawClientId = "cli";
const openClawClientMode = "cli";
const openClawProtocolVersion = 4;
const ed25519SpkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
const adminOperatorScopes = [
  "operator.read",
  "operator.write",
  "operator.approvals",
  "operator.admin",
] as const;

export interface OpenClawAdminRpcPort {
  request(
    method: string,
    params: Record<string, unknown>,
    options?: { readonly idempotencyKey?: string },
  ): Promise<Result<unknown>>;
  close(): void;
}

export interface OpenClawAdminWebSocket {
  send(data: string): void;
  close(): void;
  onMessage(listener: (data: string) => void): void;
  onClose(listener: () => void): void;
  onError(listener: (error: unknown) => void): void;
}

export type OpenClawAdminWebSocketFactory = (url: string) => OpenClawAdminWebSocket;

export interface OpenClawAdminDeviceSignatureInput {
  readonly clientId: string;
  readonly clientMode: string;
  readonly deviceId: string;
  readonly role: "operator";
  readonly scopes: readonly string[];
  readonly token: string;
  readonly nonce: string;
  readonly signedAt: number;
}

export interface OpenClawAdminDeviceKeypair {
  readonly deviceId: string;
  readonly publicKey: string;
  sign(input: OpenClawAdminDeviceSignatureInput): Promise<string>;
}

export interface OpenClawAdminRpcClientOptions {
  readonly url: string;
  readonly gatewayToken?: string;
  readonly operatorDeviceToken?: string;
  readonly keypair: OpenClawAdminDeviceKeypair;
  readonly socketFactory?: OpenClawAdminWebSocketFactory;
  readonly requestTimeoutMs?: number;
  readonly connectTimeoutMs?: number;
  readonly now?: () => number;
}

interface OpenClawAdminFrame {
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

interface PendingRequest {
  readonly method: string;
  readonly resolve: (result: Result<unknown>) => void;
  readonly timeout: NodeJS.Timeout;
}

interface OpenClawAdminHello {
  readonly protocol: number;
  readonly scopes: readonly string[];
}

interface OpenClawAdminAuthCredential {
  readonly token: string;
  readonly auth: { readonly token: string } | { readonly deviceToken: string };
}

function adminError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFrame(raw: string): OpenClawAdminFrame | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  return isRecord(parsed) && typeof parsed["type"] === "string"
    ? (parsed as unknown as OpenClawAdminFrame)
    : null;
}

function serializeFrame(frame: OpenClawAdminFrame): string {
  return JSON.stringify(frame);
}

function defaultSocketFactory(url: string): OpenClawAdminWebSocket {
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
    throw adminError(
      "provisioning.openclawAdmin.websocketUnavailable",
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

function rawOpenClawPublicKey(publicKey: string): Buffer {
  const normalized = publicKey.trim();
  if (normalized.startsWith("-----BEGIN PUBLIC KEY-----")) {
    const spki = Buffer.from(createPublicKey(normalized).export({ type: "spki", format: "der" }));
    if (
      spki.length !== ed25519SpkiPrefix.length + 32 ||
      !spki.subarray(0, ed25519SpkiPrefix.length).equals(ed25519SpkiPrefix)
    ) {
      throw adminError(
        "provisioning.openclawAdmin.invalidDeviceKey",
        "OpenClaw admin device public key must be an Ed25519 SPKI PEM key.",
      );
    }

    return spki.subarray(ed25519SpkiPrefix.length);
  }

  const raw = Buffer.from(normalized, "base64url");
  if (raw.length !== 32) {
    throw adminError(
      "provisioning.openclawAdmin.invalidDeviceKey",
      "OpenClaw admin device public key must be raw 32-byte Ed25519 base64url.",
    );
  }

  return raw;
}

function deviceIdFromRawPublicKey(rawPublicKey: Buffer): string {
  return createHash("sha256").update(rawPublicKey).digest("hex");
}

function deviceSignaturePayload(input: OpenClawAdminDeviceSignatureInput): string {
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

export function deriveOpenClawAdminDeviceIdentity(privateKeyPem: string): {
  readonly deviceId: string;
  readonly publicKeyBase64Url: string;
} {
  const spki = Buffer.from(
    createPublicKey(createPrivateKey(privateKeyPem)).export({ type: "spki", format: "der" }),
  );
  if (
    spki.length !== ed25519SpkiPrefix.length + 32 ||
    !spki.subarray(0, ed25519SpkiPrefix.length).equals(ed25519SpkiPrefix)
  ) {
    throw adminError(
      "provisioning.openclawAdmin.invalidDeviceKey",
      "OpenClaw admin device private key must be an Ed25519 PKCS8 PEM key.",
    );
  }

  const raw = spki.subarray(ed25519SpkiPrefix.length);
  return {
    deviceId: deviceIdFromRawPublicKey(raw),
    publicKeyBase64Url: raw.toString("base64url"),
  };
}

export class Ed25519OpenClawAdminDeviceKeypair implements OpenClawAdminDeviceKeypair {
  public readonly deviceId: string;
  public readonly publicKey: string;
  private readonly privateKeyPem: string;

  public constructor(input: {
    readonly privateKeyPem: string;
    readonly deviceId?: string;
    readonly publicKey?: string;
  }) {
    const derived = deriveOpenClawAdminDeviceIdentity(input.privateKeyPem);
    if (input.deviceId !== undefined && input.deviceId !== derived.deviceId) {
      throw adminError(
        "provisioning.openclawAdmin.deviceIdentityMismatch",
        "OPENCLAW_DEVICE_ID does not match the Ed25519 private key.",
      );
    }

    if (
      input.publicKey !== undefined &&
      deviceIdFromRawPublicKey(rawOpenClawPublicKey(input.publicKey)) !== derived.deviceId
    ) {
      throw adminError(
        "provisioning.openclawAdmin.deviceIdentityMismatch",
        "OPENCLAW_DEVICE_PUBLIC_KEY does not match the Ed25519 private key.",
      );
    }

    this.privateKeyPem = input.privateKeyPem;
    this.deviceId = derived.deviceId;
    this.publicKey = derived.publicKeyBase64Url;
  }

  public async sign(input: OpenClawAdminDeviceSignatureInput): Promise<string> {
    return signData(
      null,
      Buffer.from(deviceSignaturePayload(input), "utf8"),
      createPrivateKey(this.privateKeyPem),
    ).toString("base64url");
  }
}

function helloPayload(value: unknown): Result<OpenClawAdminHello> {
  if (!isRecord(value) || value["type"] !== "hello-ok") {
    return err(
      adminError(
        "provisioning.openclawAdmin.invalidHello",
        "Opzava Gateway returned an invalid hello-ok payload.",
      ),
    );
  }

  const auth = value["auth"];
  const scopes =
    isRecord(auth) && Array.isArray(auth["scopes"])
      ? auth["scopes"].filter((scope): scope is string => typeof scope === "string")
      : [];
  if (
    value["protocol"] !== openClawProtocolVersion ||
    !scopes.includes("operator.admin") ||
    !scopes.includes("operator.read")
  ) {
    return err(
      adminError(
        "provisioning.openclawAdmin.adminScopeMissing",
        "Opzava Gateway did not grant the provisioning admin RPC scopes.",
      ),
    );
  }

  return ok({
    protocol: openClawProtocolVersion,
    scopes,
  });
}

function authCredentialFromOptions(
  options: OpenClawAdminRpcClientOptions,
): OpenClawAdminAuthCredential {
  const operatorDeviceToken = options.operatorDeviceToken?.trim();
  if (operatorDeviceToken !== undefined && operatorDeviceToken !== "") {
    return {
      token: operatorDeviceToken,
      auth: { deviceToken: operatorDeviceToken },
    };
  }

  const gatewayToken = options.gatewayToken?.trim();
  if (gatewayToken !== undefined && gatewayToken !== "") {
    return {
      token: gatewayToken,
      auth: { token: gatewayToken },
    };
  }

  throw adminError(
    "provisioning.openclawAdmin.authNotConfigured",
    "OPENCLAW_OPERATOR_DEVICE_TOKEN or OPENCLAW_GATEWAY_TOKEN is required for provisioning admin RPC.",
  );
}

export class OpenClawAdminRpcClient implements OpenClawAdminRpcPort {
  private readonly authCredential: OpenClawAdminAuthCredential;
  private readonly socketFactory: OpenClawAdminWebSocketFactory;
  private readonly requestTimeoutMs: number;
  private readonly connectTimeoutMs: number;
  private readonly now: () => number;
  private socket: OpenClawAdminWebSocket | null = null;
  private connectPromise: Promise<Result<OpenClawAdminHello>> | null = null;
  private readonly pendingRequests = new Map<string, PendingRequest>();

  public constructor(private readonly options: OpenClawAdminRpcClientOptions) {
    this.authCredential = authCredentialFromOptions(options);
    this.socketFactory = options.socketFactory ?? defaultSocketFactory;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 15_000;
    this.now = options.now ?? Date.now;
  }

  public async request(
    method: string,
    params: Record<string, unknown>,
    options: { readonly idempotencyKey?: string } = {},
  ): Promise<Result<unknown>> {
    const connected = await this.connect();
    if (!connected.ok) {
      return err(connected.error);
    }

    const socket = this.socket;
    if (socket === null) {
      return err(
        adminError(
          "provisioning.openclawAdmin.notConnected",
          "OpenClaw admin client is not connected.",
        ),
      );
    }

    const id = `admin:${method}:${randomUUID()}`;
    const requestParams =
      options.idempotencyKey === undefined
        ? params
        : { ...params, idempotencyKey: options.idempotencyKey };

    return await new Promise<Result<unknown>>((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        resolve(
          err(
            adminError(
              "provisioning.openclawAdmin.requestTimeout",
              `OpenClaw admin RPC ${method} timed out.`,
            ),
          ),
        );
      }, this.requestTimeoutMs);

      this.pendingRequests.set(id, { method, resolve, timeout });
      socket.send(
        serializeFrame({
          type: "req",
          id,
          method,
          params: requestParams,
        }),
      );
    });
  }

  public close(): void {
    const socket = this.socket;
    this.socket = null;
    this.connectPromise = null;
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.resolve(
        err(
          adminError(
            "provisioning.openclawAdmin.connectionClosed",
            `OpenClaw admin RPC ${pending.method} closed before a response.`,
          ),
        ),
      );
      this.pendingRequests.delete(id);
    }
    socket?.close();
  }

  private connect(): Promise<Result<OpenClawAdminHello>> {
    this.connectPromise ??= this.openConnection();
    return this.connectPromise;
  }

  private async openConnection(): Promise<Result<OpenClawAdminHello>> {
    return await new Promise<Result<OpenClawAdminHello>>((resolve) => {
      let socket: OpenClawAdminWebSocket;
      try {
        socket = this.socketFactory(this.options.url);
      } catch (error) {
        resolve(
          err(
            adminError(
              "provisioning.openclawAdmin.gatewayUnavailable",
              "Opzava Gateway WebSocket could not be opened for provisioning.",
              error,
            ),
          ),
        );
        return;
      }

      this.socket = socket;
      const connectId = `connect:opzava-connections-admin:${randomUUID()}`;
      let settled = false;
      const settle = (result: Result<OpenClawAdminHello>) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        if (!result.ok) {
          this.close();
        }
        resolve(result);
      };
      const timeout = setTimeout(() => {
        settle(
          err(
            adminError(
              "provisioning.openclawAdmin.connectTimeout",
              "Opzava Gateway did not complete the admin handshake in time.",
            ),
          ),
        );
      }, this.connectTimeoutMs);

      socket.onMessage((raw) => {
        const frame = parseFrame(raw);
        if (frame === null) {
          settle(
            err(
              adminError(
                "provisioning.openclawAdmin.invalidFrame",
                "Opzava Gateway returned an invalid admin frame.",
              ),
            ),
          );
          return;
        }

        if (!settled && frame.type === "event" && frame.event === "connect.challenge") {
          const nonce =
            isRecord(frame.payload) && typeof frame.payload["nonce"] === "string"
              ? frame.payload["nonce"]
              : null;
          if (nonce === null || nonce.trim() === "") {
            settle(
              err(
                adminError(
                  "provisioning.openclawAdmin.invalidChallenge",
                  "Opzava Gateway returned an invalid admin challenge.",
                ),
              ),
            );
            return;
          }

          void this.buildConnectFrame(connectId, nonce)
            .then((connectFrame) => socket.send(serializeFrame(connectFrame)))
            .catch((error: unknown) => {
              settle(
                err(
                  adminError(
                    "provisioning.openclawAdmin.signatureFailed",
                    "OpenClaw admin device signing failed.",
                    error,
                  ),
                ),
              );
            });
          return;
        }

        if (!settled && frame.type === "res" && frame.id === connectId) {
          if (frame.ok !== true) {
            settle(
              err(
                adminError(
                  "provisioning.openclawAdmin.connectRejected",
                  frame.error?.message ?? "Opzava Gateway rejected the admin connection.",
                ),
              ),
            );
            return;
          }

          settle(helloPayload(frame.payload));
          return;
        }

        if (settled && frame.type === "res" && frame.id !== undefined) {
          const pending = this.pendingRequests.get(frame.id);
          if (pending === undefined) {
            return;
          }

          this.pendingRequests.delete(frame.id);
          clearTimeout(pending.timeout);
          pending.resolve(
            frame.ok === true
              ? ok(frame.payload)
              : err(
                  adminError(
                    "provisioning.openclawAdmin.requestRejected",
                    frame.error?.message ?? `OpenClaw admin RPC ${pending.method} failed.`,
                  ),
                ),
          );
        }
      });

      socket.onClose(() => {
        if (!settled) {
          settle(
            err(
              adminError(
                "provisioning.openclawAdmin.connectionClosed",
                "Opzava Gateway closed the admin connection during handshake.",
              ),
            ),
          );
          return;
        }

        this.close();
      });

      socket.onError((error) => {
        if (!settled) {
          settle(
            err(
              adminError(
                "provisioning.openclawAdmin.gatewayUnavailable",
                "Opzava Gateway admin WebSocket failed.",
                error,
              ),
            ),
          );
        }
      });
    });
  }

  private async buildConnectFrame(id: string, nonce: string): Promise<OpenClawAdminFrame> {
    const signedAt = this.now();
    const signature = await this.options.keypair.sign({
      clientId: openClawClientId,
      clientMode: openClawClientMode,
      deviceId: this.options.keypair.deviceId,
      role: "operator",
      scopes: adminOperatorScopes,
      token: this.authCredential.token,
      nonce,
      signedAt,
    });

    return {
      type: "req",
      id,
      method: "connect",
      params: {
        minProtocol: openClawProtocolVersion,
        maxProtocol: openClawProtocolVersion,
        client: {
          id: openClawClientId,
          version: ASK_ADMIN_AGENT_VERSION,
          platform: "node",
          mode: openClawClientMode,
        },
        role: "operator",
        scopes: adminOperatorScopes,
        caps: [],
        commands: [],
        permissions: {},
        auth: this.authCredential.auth,
        locale: "en-US",
        userAgent: `opzava-connections-provisioning/${ASK_ADMIN_AGENT_VERSION}`,
        device: {
          id: this.options.keypair.deviceId,
          publicKey: this.options.keypair.publicKey,
          signature,
          signedAt,
          nonce,
        },
      },
    };
  }
}
