import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomUUID,
  sign as signData,
} from "node:crypto";

import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";
import type {
  OpenClawAdminConnectionMetadata,
  OpenClawAdminRpcPort,
  OpenClawOperatorScope,
} from "@opzava/ports";

import { ASK_ADMIN_AGENT_VERSION } from "./ask-admin-agent.js";

const openClawClientId = "cli";
const openClawClientMode = "cli";
const openClawProtocolVersion = 4;
const ed25519SpkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
const defaultOperatorScopes = ["operator.read"] as const;

export interface OpenClawAdminWebSocket {
  send(data: string): void;
  close(): void;
  onMessage(listener: (data: string) => void): void;
  onClose(listener: (event?: OpenClawAdminCloseEvent) => void): void;
  onError(listener: (error: unknown) => void): void;
}

export type OpenClawAdminWebSocketFactory = (url: string) => OpenClawAdminWebSocket;

type OpenClawAdminTimer = ReturnType<typeof setTimeout>;

export interface OpenClawAdminClock {
  now(): number;
  setTimeout(callback: () => void, ms: number): OpenClawAdminTimer;
  clearTimeout(timer: OpenClawAdminTimer): void;
}

export interface OpenClawAdminCloseEvent {
  readonly code?: number;
  readonly reason?: string;
}

export interface OpenClawAdminLogger {
  error(message: string, details: Record<string, unknown>): void;
}

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
  readonly requestedScopes?: readonly OpenClawOperatorScope[];
  readonly keypair: OpenClawAdminDeviceKeypair;
  readonly socketFactory?: OpenClawAdminWebSocketFactory;
  readonly requestTimeoutMs?: number;
  readonly connectTimeoutMs?: number;
  readonly now?: () => number;
  readonly clock?: OpenClawAdminClock;
  readonly random?: () => number;
  readonly reconnectInitialBackoffMs?: number;
  readonly reconnectMaxBackoffMs?: number;
  readonly reconnectMaxAttempts?: number;
  readonly reconnectJitterRatio?: number;
  readonly circuitBreakerFailureThreshold?: number;
  readonly circuitBreakerCooldownMs?: number;
  readonly idleTimeoutMs?: number;
  readonly logger?: OpenClawAdminLogger | null;
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
  readonly timeout: OpenClawAdminTimer;
}

interface OpenClawAdminHello {
  readonly protocol: number;
  readonly scopes: readonly OpenClawOperatorScope[];
  readonly metadata: OpenClawAdminConnectionMetadata;
}

interface OpenClawAdminAuthCredential {
  readonly token: string;
  readonly auth: { readonly token: string } | { readonly deviceToken: string };
}

interface OpenClawAdminFailureDetails {
  readonly cause:
    | "missing_token"
    | "pairing_not_approved"
    | "scope_rejected"
    | "auth_rejected"
    | "close_before_connect";
  readonly gatewayCode?: string;
  readonly closeCode?: number;
  readonly closeReason?: string;
  readonly requestedScopes?: readonly OpenClawOperatorScope[];
  readonly grantedScopes?: readonly OpenClawOperatorScope[];
}

type CircuitBreakerState = "closed" | "open" | "half_open";

const defaultClock: OpenClawAdminClock = {
  now: Date.now,
  setTimeout(callback, ms) {
    return setTimeout(callback, ms);
  },
  clearTimeout(timer) {
    clearTimeout(timer);
  },
};

const retryableReadMethods = new Set([
  "config.get",
  "health",
  "last-heartbeat",
  "models.authStatus",
  "models.list",
  "status",
  "update.status",
]);

function adminError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

function scopeError(
  requiredScope: OpenClawOperatorScope,
  grantedScopes: readonly string[],
): DomainError {
  if (requiredScope === "operator.admin") {
    return new DomainError({
      code: "provisioning.openclawAdmin.operatorAdminRequired",
      message: "operator.admin scope required — pair/upgrade an admin device.",
      details: {
        requiredScope,
        grantedScopes,
      },
    });
  }

  return new DomainError({
    code: "provisioning.openclawAdmin.scopeRequired",
    message: `${requiredScope} scope required.`,
    details: {
      requiredScope,
      grantedScopes,
    },
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

function operatorScopes(value: unknown): readonly OpenClawOperatorScope[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (scope): scope is OpenClawOperatorScope =>
      typeof scope === "string" && scope.startsWith("operator."),
  );
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function helloConnectionMetadata(value: Record<string, unknown>): OpenClawAdminConnectionMetadata {
  const server = isRecord(value["server"]) ? value["server"] : null;
  const snapshot = isRecord(value["snapshot"]) ? value["snapshot"] : null;
  const update =
    snapshot !== null && isRecord(snapshot["updateAvailable"]) ? snapshot["updateAvailable"] : null;
  const currentVersion = update === null ? null : nonEmptyString(update["currentVersion"]);
  const latestVersion = update === null ? null : nonEmptyString(update["latestVersion"]);
  const channel = update === null ? null : nonEmptyString(update["channel"]);
  const uptimeMs = snapshot?.["uptimeMs"];

  return {
    serverVersion: server === null ? null : nonEmptyString(server["version"]),
    uptimeMs:
      typeof uptimeMs === "number" && Number.isSafeInteger(uptimeMs) && uptimeMs >= 0
        ? uptimeMs
        : null,
    updateAvailable:
      currentVersion !== null && latestVersion !== null && channel !== null
        ? { currentVersion, latestVersion, channel }
        : null,
  };
}

export function openClawOperatorScopeGranted(
  grantedScopes: readonly string[],
  requiredScope: OpenClawOperatorScope,
): boolean {
  if (grantedScopes.includes("operator.admin")) {
    return true;
  }

  if (requiredScope === "operator.read" && grantedScopes.includes("operator.write")) {
    return true;
  }

  return grantedScopes.includes(requiredScope);
}

function normalizeRequestedScopes(
  scopes: readonly OpenClawOperatorScope[] | undefined,
): readonly OpenClawOperatorScope[] {
  const requested = scopes ?? defaultOperatorScopes;
  const unique = [...new Set(requested.map((scope) => scope.trim()).filter(Boolean))].filter(
    (scope): scope is OpenClawOperatorScope => scope.startsWith("operator."),
  );

  return unique.length === 0 ? defaultOperatorScopes : unique;
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
          listener: (event: {
            readonly data?: unknown;
            readonly code?: unknown;
            readonly reason?: unknown;
          }) => void,
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
      socket.addEventListener("close", (event) =>
        listener({
          ...(typeof event.code === "number" ? { code: event.code } : {}),
          ...(typeof event.reason === "string" ? { reason: event.reason } : {}),
        }),
      );
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
  const scopes = isRecord(auth) ? operatorScopes(auth["scopes"]) : [];
  if (
    value["protocol"] !== openClawProtocolVersion ||
    !openClawOperatorScopeGranted(scopes, "operator.read")
  ) {
    return err(
      adminError(
        "provisioning.openclawAdmin.readScopeMissing",
        "Opzava Gateway did not grant the provisioning read RPC scope.",
      ),
    );
  }

  return ok({
    protocol: openClawProtocolVersion,
    scopes,
    metadata: helloConnectionMetadata(value),
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

function connectFailureDetails(frame: OpenClawAdminFrame): OpenClawAdminFailureDetails {
  const gatewayCode = frame.error?.code;
  const rawDetails = isRecord(frame.error?.details) ? frame.error.details : {};
  const rejectedScope =
    typeof rawDetails["requiredScope"] === "string" ? rawDetails["requiredScope"] : undefined;
  if (gatewayCode === "PAIRING_REQUIRED") {
    return { cause: "pairing_not_approved", ...(gatewayCode === undefined ? {} : { gatewayCode }) };
  }

  if (
    gatewayCode === "SCOPE_REQUIRED" ||
    gatewayCode === "INSUFFICIENT_SCOPE" ||
    rejectedScope?.startsWith("operator.") === true
  ) {
    return { cause: "scope_rejected", ...(gatewayCode === undefined ? {} : { gatewayCode }) };
  }

  return { cause: "auth_rejected", ...(gatewayCode === undefined ? {} : { gatewayCode }) };
}

function sanitizeCloseReason(value: string): string {
  return value
    .replace(
      /\b(token|key|secret|signature|authorization|bearer)\b\s*[:=]\s*\S+/gi,
      "$1=[redacted]",
    )
    .replace(/\bsk-[a-z0-9_-]{8,}\b/gi, "[redacted]")
    .replace(/\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g, "[redacted]")
    .slice(0, 240);
}

export class OpenClawAdminRpcClient implements OpenClawAdminRpcPort {
  private readonly authCredential: OpenClawAdminAuthCredential;
  private readonly requestedScopes: readonly OpenClawOperatorScope[];
  private readonly socketFactory: OpenClawAdminWebSocketFactory;
  private readonly requestTimeoutMs: number;
  private readonly connectTimeoutMs: number;
  private readonly clock: OpenClawAdminClock;
  private readonly random: () => number;
  private readonly reconnectInitialBackoffMs: number;
  private readonly reconnectMaxBackoffMs: number;
  private readonly reconnectMaxAttempts: number;
  private readonly reconnectJitterRatio: number;
  private readonly circuitBreakerFailureThreshold: number;
  private readonly circuitBreakerCooldownMs: number;
  private readonly idleTimeoutMs: number;
  private readonly logger: OpenClawAdminLogger | null;
  private socket: OpenClawAdminWebSocket | null = null;
  private connectPromise: Promise<Result<OpenClawAdminHello>> | null = null;
  private connectedScopes: readonly OpenClawOperatorScope[] | null = null;
  private connectedMetadata: OpenClawAdminConnectionMetadata | null = null;
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private consecutiveConnectFailures = 0;
  private circuitBreakerState: CircuitBreakerState = "closed";
  private circuitBreakerOpenedAt: number | null = null;
  private idleTimer: OpenClawAdminTimer | null = null;
  private lastSocketActivityAt: number | null = null;

  public constructor(private readonly options: OpenClawAdminRpcClientOptions) {
    this.authCredential = authCredentialFromOptions(options);
    this.requestedScopes = normalizeRequestedScopes(options.requestedScopes);
    this.socketFactory = options.socketFactory ?? defaultSocketFactory;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 15_000;
    this.clock =
      options.clock ??
      (options.now === undefined ? defaultClock : { ...defaultClock, now: options.now });
    this.random = options.random ?? Math.random;
    this.reconnectInitialBackoffMs = Math.max(0, options.reconnectInitialBackoffMs ?? 100);
    this.reconnectMaxBackoffMs = Math.max(0, options.reconnectMaxBackoffMs ?? 2_000);
    this.reconnectMaxAttempts = Math.max(1, options.reconnectMaxAttempts ?? 4);
    this.reconnectJitterRatio = Math.max(0, options.reconnectJitterRatio ?? 0.2);
    this.circuitBreakerFailureThreshold = Math.max(1, options.circuitBreakerFailureThreshold ?? 4);
    this.circuitBreakerCooldownMs = Math.max(0, options.circuitBreakerCooldownMs ?? 5_000);
    this.idleTimeoutMs = Math.max(0, options.idleTimeoutMs ?? 30_000);
    this.logger = options.logger ?? null;
  }

  public async request(
    method: string,
    params: Record<string, unknown>,
    options: {
      readonly idempotencyKey?: string;
      readonly requiredScope?: OpenClawOperatorScope;
    } = {},
  ): Promise<Result<unknown>> {
    const firstAttempt = await this.sendOnce(method, params, options);
    if (firstAttempt.ok || !this.shouldRetryRequest(method, firstAttempt.error)) {
      return firstAttempt;
    }

    const reconnected = await this.connect();
    if (!reconnected.ok) {
      return err(reconnected.error);
    }

    return await this.sendOnce(method, params, options);
  }

  private async sendOnce(
    method: string,
    params: Record<string, unknown>,
    options: {
      readonly idempotencyKey?: string;
      readonly requiredScope?: OpenClawOperatorScope;
    },
  ): Promise<Result<unknown>> {
    const connected = await this.connect();
    if (!connected.ok) {
      return err(connected.error);
    }

    if (
      options.requiredScope !== undefined &&
      !openClawOperatorScopeGranted(connected.value.scopes, options.requiredScope)
    ) {
      this.logConnectFailure({
        cause: "scope_rejected",
        requestedScopes: this.requestedScopes,
        grantedScopes: connected.value.scopes,
      });
      return err(scopeError(options.requiredScope, connected.value.scopes));
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
      const timeout = this.clock.setTimeout(() => {
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
      try {
        socket.send(
          serializeFrame({
            type: "req",
            id,
            method,
            params: requestParams,
          }),
        );
        this.touchSocketActivity(socket);
      } catch (error) {
        this.pendingRequests.delete(id);
        this.clock.clearTimeout(timeout);
        this.handleSocketClosed(socket);
        socket.close();
        resolve(
          err(
            adminError(
              "provisioning.openclawAdmin.connectionClosed",
              `OpenClaw admin RPC ${method} could not be sent because the socket is closed.`,
              error,
            ),
          ),
        );
      }
    });
  }

  public close(): void {
    const socket = this.socket;
    this.handleSocketClosed(socket);
    socket?.close();
  }

  public grantedScopes(): readonly OpenClawOperatorScope[] | null {
    return this.connectedScopes;
  }

  public connectionMetadata(): OpenClawAdminConnectionMetadata | null {
    return this.connectedMetadata;
  }

  private shouldRetryRequest(method: string, error: DomainError): boolean {
    return (
      retryableReadMethods.has(method) &&
      (error.code === "provisioning.openclawAdmin.connectionClosed" ||
        error.code === "provisioning.openclawAdmin.notConnected")
    );
  }

  private logConnectFailure(details: OpenClawAdminFailureDetails): void {
    this.logger?.error("provisioning.openclawAdmin.operatorWsHandshakeFailed", {
      code: "provisioning.openclawAdmin.operatorWsHandshakeFailed",
      ...details,
      requestedScopes: details.requestedScopes ?? this.requestedScopes,
    });
  }

  private connect(): Promise<Result<OpenClawAdminHello>> {
    if (this.socket !== null && this.connectedScopes !== null) {
      return Promise.resolve(
        ok({
          protocol: openClawProtocolVersion,
          scopes: this.connectedScopes,
          metadata: this.connectedMetadata ?? {
            serverVersion: null,
            uptimeMs: null,
            updateAvailable: null,
          },
        }),
      );
    }

    this.connectPromise ??= this.connectWithPolicy().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  private async connectWithPolicy(): Promise<Result<OpenClawAdminHello>> {
    for (let attempt = 1; attempt <= this.reconnectMaxAttempts; attempt += 1) {
      const breaker = this.prepareCircuitBreakerAttempt();
      if (!breaker.ok) {
        return err(breaker.error);
      }

      const connected = await this.openConnection();
      if (connected.ok) {
        this.recordConnectSuccess();
        return connected;
      }

      this.recordConnectFailure();
      if (this.circuitBreakerState === "open") {
        return err(this.circuitBreakerOpenError());
      }

      if (attempt === this.reconnectMaxAttempts) {
        return err(connected.error);
      }

      await this.sleep(this.nextBackoffDelayMs());
    }

    return err(
      adminError(
        "provisioning.openclawAdmin.gatewayUnavailable",
        "Opzava Gateway admin WebSocket could not be reached.",
      ),
    );
  }

  private prepareCircuitBreakerAttempt(): Result<void> {
    if (this.circuitBreakerState !== "open" || this.circuitBreakerOpenedAt === null) {
      return ok(undefined);
    }

    const elapsedMs = this.clock.now() - this.circuitBreakerOpenedAt;
    if (elapsedMs < this.circuitBreakerCooldownMs) {
      return err(this.circuitBreakerOpenError());
    }

    this.circuitBreakerState = "half_open";
    return ok(undefined);
  }

  private recordConnectSuccess(): void {
    this.consecutiveConnectFailures = 0;
    this.circuitBreakerState = "closed";
    this.circuitBreakerOpenedAt = null;
  }

  private recordConnectFailure(): void {
    this.consecutiveConnectFailures += 1;
    if (this.consecutiveConnectFailures >= this.circuitBreakerFailureThreshold) {
      this.circuitBreakerState = "open";
      this.circuitBreakerOpenedAt = this.clock.now();
    }
  }

  private circuitBreakerOpenError(): DomainError {
    const openedAt = this.circuitBreakerOpenedAt ?? this.clock.now();
    return new DomainError({
      code: "provisioning.openclawAdmin.gatewayCircuitOpen",
      message: "OpenClaw gateway unreachable; retrying after circuit-breaker cooldown.",
      details: {
        reason: "gateway_unreachable_retrying",
        breakerState: "open",
        consecutiveFailures: this.consecutiveConnectFailures,
        retryAfterMs: Math.max(0, openedAt + this.circuitBreakerCooldownMs - this.clock.now()),
      },
    });
  }

  private nextBackoffDelayMs(): number {
    const exponential = this.reconnectInitialBackoffMs * 2 ** (this.consecutiveConnectFailures - 1);
    const capped = Math.min(this.reconnectMaxBackoffMs, exponential);
    const jitterRatio = Math.max(0, this.reconnectJitterRatio);
    const jitterMultiplier = 1 + (this.random() * 2 - 1) * jitterRatio;
    return Math.min(this.reconnectMaxBackoffMs, Math.max(0, Math.round(capped * jitterMultiplier)));
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.clock.setTimeout(() => resolve(), ms);
    });
  }

  private handleSocketClosed(socket: OpenClawAdminWebSocket | null): void {
    if (socket !== null && this.socket !== socket) {
      return;
    }

    this.socket = null;
    this.connectPromise = null;
    this.connectedScopes = null;
    this.connectedMetadata = null;
    this.lastSocketActivityAt = null;
    this.clearIdleTimer();
    for (const [id, pending] of this.pendingRequests) {
      this.clock.clearTimeout(pending.timeout);
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
  }

  private touchSocketActivity(socket: OpenClawAdminWebSocket): void {
    if (this.socket !== socket) {
      return;
    }

    this.lastSocketActivityAt = this.clock.now();
    this.scheduleIdleTimer(socket);
  }

  private scheduleIdleTimer(socket: OpenClawAdminWebSocket): void {
    this.clearIdleTimer();
    if (this.idleTimeoutMs <= 0) {
      return;
    }

    this.idleTimer = this.clock.setTimeout(() => {
      if (this.socket !== socket || this.lastSocketActivityAt === null) {
        return;
      }

      if (this.clock.now() - this.lastSocketActivityAt < this.idleTimeoutMs) {
        this.scheduleIdleTimer(socket);
        return;
      }

      if (this.pendingRequests.size > 0) {
        this.scheduleIdleTimer(socket);
        return;
      }

      this.handleSocketClosed(socket);
      socket.close();
    }, this.idleTimeoutMs);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer === null) {
      return;
    }

    this.clock.clearTimeout(this.idleTimer);
    this.idleTimer = null;
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
        this.clock.clearTimeout(timeout);
        if (!result.ok) {
          this.handleSocketClosed(socket);
          socket.close();
        } else {
          this.touchSocketActivity(socket);
        }
        resolve(result);
      };
      const timeout = this.clock.setTimeout(() => {
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
        this.touchSocketActivity(socket);
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
            this.logConnectFailure(connectFailureDetails(frame));
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

          const hello = helloPayload(frame.payload);
          if (hello.ok) {
            this.connectedScopes = hello.value.scopes;
            this.connectedMetadata = hello.value.metadata;
          } else if (hello.error.code === "provisioning.openclawAdmin.readScopeMissing") {
            this.logConnectFailure({
              cause: "scope_rejected",
              grantedScopes: isRecord(frame.payload)
                ? operatorScopes(
                    isRecord(frame.payload["auth"]) ? frame.payload["auth"]["scopes"] : [],
                  )
                : [],
            });
          }
          settle(hello);
          return;
        }

        if (settled && frame.type === "res" && frame.id !== undefined) {
          const pending = this.pendingRequests.get(frame.id);
          if (pending === undefined) {
            return;
          }

          this.pendingRequests.delete(frame.id);
          this.clock.clearTimeout(pending.timeout);
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

      socket.onClose((event) => {
        if (!settled) {
          this.logConnectFailure({
            cause: "close_before_connect",
            ...(event?.code === undefined ? {} : { closeCode: event.code }),
            ...(event?.reason === undefined || event.reason === ""
              ? {}
              : { closeReason: sanitizeCloseReason(event.reason) }),
          });
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

        this.handleSocketClosed(socket);
        socket.close();
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
          return;
        }

        this.handleSocketClosed(socket);
        socket.close();
      });
    });
  }

  private async buildConnectFrame(id: string, nonce: string): Promise<OpenClawAdminFrame> {
    const signedAt = this.clock.now();
    const signature = await this.options.keypair.sign({
      clientId: openClawClientId,
      clientMode: openClawClientMode,
      deviceId: this.options.keypair.deviceId,
      role: "operator",
      scopes: this.requestedScopes,
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
        scopes: this.requestedScopes,
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
