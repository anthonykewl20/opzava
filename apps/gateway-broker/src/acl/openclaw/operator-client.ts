import type {
  ExpectedToolInventory,
  OpenClawGatewayHealthSnapshot,
  OpenClawGatewayRouteId,
  OpenClawRunRef,
  OpenClawSessionRef,
  OpenClawStreamEvent,
  OpenClawToolCallId,
  StartAssistantStreamInput,
  StartAssistantStreamReceipt,
  ToolInventorySnapshot,
} from "@opzava/ports";
import {
  err,
  makeOpaqueExternalRef,
  ok,
  type DomainError,
  type Result,
} from "@opzava/shared-kernel";
import WebSocket from "ws";

import { AsyncQueue } from "../../rpc/async-queue.js";
import type { GatewayRouteConfig } from "../../routing/routes.js";
import { gatewayBrokerError, sanitizeGatewayError } from "./errors.js";
import type { BrokerLogger } from "./logger.js";
import { silentBrokerLogger } from "./logger.js";
import {
  EXPECTED_OPERATOR_SCOPES,
  MAX_OPENCLAW_PROTOCOL_VERSION,
  MIN_OPENCLAW_PROTOCOL_VERSION,
  eventFamily,
  hasExactExpectedScopes,
  isAllowedEventFamily,
  isConnectChallenge,
  isHelloOkPayload,
  isRecord,
  parseOpenClawFrame,
  serializeOpenClawFrame,
  type ChatEventPayload,
  type HelloOkPayload,
  type OpenClawConnectParams,
  type OpenClawErrorPayload,
  type OpenClawEventFrame,
  type OpenClawFrame,
  type OpenClawRequestFrame,
  type OpenClawResponseFrame,
  type SessionMessageEventPayload,
  type ToolsEffectivePayload,
} from "./protocol.js";
import {
  OPENCLAW_EXTERNAL_OPERATOR_CLIENT_ID,
  OPENCLAW_EXTERNAL_OPERATOR_CLIENT_MODE,
  type DeviceSignatureInput,
} from "./signing.js";

type WebSocketFactory = (url: string) => WebSocket;

interface PendingRequest {
  readonly id: string;
  readonly method: string;
  readonly resolve: (payload: unknown) => void;
  readonly reject: (error: DomainError) => void;
  readonly timeout: NodeJS.Timeout;
}

interface ActiveStream {
  readonly sessionKey: string;
  readonly turnId: string;
  readonly queue: AsyncQueue<OpenClawStreamEvent>;
  readonly seenChatSeqs: Set<number>;
  text: string;
  runId?: string;
}

export interface OpenClawOperatorClientOptions {
  readonly route: GatewayRouteConfig;
  readonly requestTimeoutMs?: number;
  readonly challengeTimeoutMs?: number;
  readonly connectBudgetMs?: number;
  readonly socketFactory?: WebSocketFactory;
  readonly logger?: BrokerLogger;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

interface HelloPolicy {
  readonly maxPayload: number;
  readonly maxBufferedBytes: number;
  readonly tickIntervalMs: number;
}

const defaultPolicy: HelloPolicy = {
  maxPayload: 25 * 1024 * 1024,
  maxBufferedBytes: 50 * 1024 * 1024,
  tickIntervalMs: 30_000,
};

const defaultSocketFactory: WebSocketFactory = (url) =>
  new WebSocket(url, { perMessageDeflate: false, maxPayload: 64 * 1024 });

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorFromGatewayPayload(error: OpenClawErrorPayload | undefined): DomainError {
  const sanitized = sanitizeGatewayError(error);
  const gatewayCode = sanitized["code"];
  const reason = sanitized["reason"];

  if (gatewayCode === "AUTH_SCOPE_MISMATCH") {
    return gatewayBrokerError(
      "gatewayBroker.authScopeMismatch",
      "OpenClaw paired-device token scopes do not match the broker contract.",
      sanitized,
    );
  }

  if (gatewayCode === "PROTOCOL_MISMATCH") {
    return gatewayBrokerError(
      "gatewayBroker.protocolMismatch",
      "OpenClaw Gateway rejected the broker protocol range.",
      sanitized,
    );
  }

  if (gatewayCode === "UNAVAILABLE" && reason === "startup-sidecars") {
    return gatewayBrokerError(
      "gatewayBroker.gatewayUnavailable",
      "OpenClaw Gateway startup sidecars are not ready.",
      sanitized,
    );
  }

  return gatewayBrokerError(
    "gatewayBroker.requestFailed",
    "OpenClaw Gateway request failed.",
    sanitized,
  );
}

function retryAfterMs(error: OpenClawErrorPayload | undefined): number | null {
  const details = isRecord(error?.details) ? error.details : {};
  if (
    error?.code === "UNAVAILABLE" &&
    details["reason"] === "startup-sidecars" &&
    typeof details["retryAfterMs"] === "number" &&
    Number.isFinite(details["retryAfterMs"])
  ) {
    return Math.max(0, Math.floor(details["retryAfterMs"]));
  }

  return null;
}

function externalSessionRef(value: string): OpenClawSessionRef {
  return makeOpaqueExternalRef({
    system: "openclaw",
    kind: "session",
    value,
  }) as OpenClawSessionRef;
}

function externalRunRef(value: string): OpenClawRunRef {
  return makeOpaqueExternalRef({
    system: "openclaw",
    kind: "run",
    value,
  }) as OpenClawRunRef;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function recordValue(value: unknown): Readonly<Record<string, unknown>> | null {
  return isRecord(value) ? value : null;
}

function textFromMessage(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (!isRecord(value)) {
    return null;
  }

  return (
    stringValue(value["text"]) ?? stringValue(value["content"]) ?? stringValue(value["message"])
  );
}

function sanitizedStreamCode(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }

  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return sanitized === "" ? fallback : sanitized;
}

function textFromGatewayError(error: DomainError): string {
  const message = typeof error.details?.["message"] === "string" ? error.details["message"] : "";
  const code = typeof error.details?.["code"] === "string" ? error.details["code"] : "";
  const reason = typeof error.details?.["reason"] === "string" ? error.details["reason"] : "";
  return `${error.message} ${code} ${reason} ${message}`.toLowerCase();
}

function isAlreadyExistsError(error: DomainError): boolean {
  const text = textFromGatewayError(error);
  return (
    text.includes("already exists") ||
    text.includes("already-exists") ||
    text.includes("already_exists")
  );
}

function isSessionNotFoundError(error: DomainError): boolean {
  return textFromGatewayError(error).includes("session not found");
}

export class OpenClawOperatorClient {
  private readonly route: GatewayRouteConfig;
  private readonly requestTimeoutMs: number;
  private readonly challengeTimeoutMs: number;
  private readonly connectBudgetMs: number;
  private readonly socketFactory: WebSocketFactory;
  private readonly logger: BrokerLogger;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly respondedIds = new Set<string>();
  private readonly activeStreams = new Map<string, ActiveStream>();
  private readonly createdSessionKeys = new Set<string>();
  private requestSequence = 0;
  private socket: WebSocket | undefined;
  private policy: HelloPolicy = defaultPolicy;
  private connected = false;
  private circuitOpenReason: string | undefined;

  public constructor(options: OpenClawOperatorClientOptions) {
    this.route = options.route;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.challengeTimeoutMs = options.challengeTimeoutMs ?? 15_000;
    this.connectBudgetMs = options.connectBudgetMs ?? 10_000;
    this.socketFactory = options.socketFactory ?? defaultSocketFactory;
    this.logger = options.logger ?? silentBrokerLogger;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
  }

  public get routeId(): OpenClawGatewayRouteId {
    return this.route.routeId;
  }

  public disconnect(): void {
    this.connected = false;
    this.createdSessionKeys.clear();
    this.rejectPending(
      gatewayBrokerError("gatewayBroker.connectionClosed", "OpenClaw connection closed."),
    );
    this.failActiveStreams("gatewayBroker.connectionClosed", "OpenClaw connection closed.");
    this.socket?.close();
    this.socket = undefined;
  }

  public health(): OpenClawGatewayHealthSnapshot {
    return {
      routeId: this.route.routeId,
      reachable: this.connected,
      circuitOpen: this.circuitOpenReason !== undefined,
      checkedAt: new Date(),
      ...(this.circuitOpenReason === undefined ? {} : { degradedReason: this.circuitOpenReason }),
    };
  }

  public async ensureConnected(): Promise<Result<void>> {
    if (this.route.authMode !== "paired-device") {
      return err(
        gatewayBrokerError(
          "gatewayBroker.authModeForbidden",
          "Gateway broker hot path requires paired-device auth.",
        ),
      );
    }

    if (this.connected) {
      return ok(undefined);
    }

    const startedAt = this.now();
    let lastError: DomainError | undefined;

    while (this.now() - startedAt <= this.connectBudgetMs) {
      const attempt = await this.connectOnce();
      if (attempt.ok) {
        this.circuitOpenReason = undefined;
        return ok(undefined);
      }

      lastError = attempt.error;
      const retryAfter = attempt.error.details?.["retryAfterMs"];
      const retryable = attempt.error.code === "gatewayBroker.gatewayUnavailable";
      if (!retryable || typeof retryAfter !== "number") {
        this.circuitOpenReason = attempt.error.code;
        return attempt;
      }

      if (this.now() - startedAt + retryAfter > this.connectBudgetMs) {
        this.circuitOpenReason = attempt.error.code;
        return attempt;
      }

      await this.sleep(retryAfter);
    }

    return err(
      lastError ??
        gatewayBrokerError(
          "gatewayBroker.gatewayUnavailable",
          "OpenClaw Gateway did not become available inside the connection budget.",
        ),
    );
  }

  public async startAssistantStream(
    input: StartAssistantStreamInput,
  ): Promise<Result<StartAssistantStreamReceipt>> {
    if (input.actingPrincipal.tenantId !== this.route.tenantId) {
      return err(
        gatewayBrokerError(
          "gatewayBroker.tenantMismatch",
          "Gateway route tenant does not match the authenticated principal.",
        ),
      );
    }

    const connected = await this.ensureConnected();
    if (!connected.ok) {
      return err(connected.error);
    }

    // The live Gateway canonicalizes session keys to `agent:<agentId>:<name>` and
    // publishes chat events under the CANONICAL key; derive it ourselves so
    // create/send/subscribe and event correlation all agree.
    const rawSessionKey = input.sessionRef?.value ?? input.conversationId;
    const sessionKey = rawSessionKey.startsWith("agent:")
      ? rawSessionKey
      : `agent:${input.assistantKey}:${rawSessionKey}`;
    const stream: ActiveStream = {
      sessionKey,
      turnId: input.turnId,
      queue: new AsyncQueue<OpenClawStreamEvent>(),
      seenChatSeqs: new Set<number>(),
      text: "",
    };
    this.activeStreams.set(sessionKey, stream);
    stream.queue.push({ type: "queued", turnId: input.turnId });

    const created = await this.ensureSessionCreated(sessionKey, input.assistantKey);
    if (!created.ok) {
      this.activeStreams.delete(sessionKey);
      stream.queue.close();
      return err(created.error);
    }

    let response = await this.sendSessionMessage(input, sessionKey);
    if (!response.ok && isSessionNotFoundError(response.error)) {
      this.createdSessionKeys.delete(sessionKey);
      const recreated = await this.ensureSessionCreated(sessionKey, input.assistantKey, {
        force: true,
      });
      if (recreated.ok) {
        response = await this.sendSessionMessage(input, sessionKey);
      } else {
        response = err(recreated.error);
      }
    }

    if (!response.ok) {
      this.activeStreams.delete(sessionKey);
      stream.queue.close();
      return err(response.error);
    }

    const payload = isRecord(response.value) ? response.value : {};
    const responseSessionKey =
      stringValue(payload["key"]) ?? stringValue(payload["sessionKey"]) ?? sessionKey;
    const runId = stringValue(payload["runId"]) ?? `run:${input.idempotencyKey}`;
    stream.runId = runId;

    if (responseSessionKey !== sessionKey) {
      this.activeStreams.delete(sessionKey);
      this.activeStreams.set(responseSessionKey, stream);
    }

    void this.request(
      "sessions.messages.subscribe",
      { key: responseSessionKey, agentId: input.assistantKey },
      { sideEffect: false },
    ).then((subscribed) => {
      if (!subscribed.ok) {
        this.logger.warn(
          {
            routeId: this.route.routeId,
            code: subscribed.error.code,
          },
          "OpenClaw session message subscribe failed; continuing on sender chat stream.",
        );
      }
    });

    return ok({
      sessionRef: externalSessionRef(responseSessionKey),
      runRef: externalRunRef(runId),
      events: stream.queue,
    });
  }

  public async getEffectiveTools(
    input: ExpectedToolInventory,
  ): Promise<Result<ToolInventorySnapshot>> {
    const connected = await this.ensureConnected();
    if (!connected.ok) {
      return err(connected.error);
    }

    // Live sessions.create rejects idempotencyKey; duplicate-key failures are normalized below.
    const response = await this.request(
      "tools.effective",
      { sessionKey: input.sessionRef.value },
      { sideEffect: false },
    );
    if (!response.ok) {
      return err(response.error);
    }

    const payload = isRecord(response.value) ? (response.value as ToolsEffectivePayload) : {};
    const tools = payload.tools ?? payload.entries ?? [];
    const toolNames = tools.flatMap((tool) =>
      typeof tool.name === "string" && tool.name.trim() !== "" ? [tool.name] : [],
    );
    const expected = new Set(input.toolNames);
    const actual = new Set(toolNames);
    const unknownToolNames = toolNames.filter((toolName) => !expected.has(toolName));
    const missingToolNames = input.toolNames.filter((toolName) => !actual.has(toolName));

    if (unknownToolNames.length > 0 || missingToolNames.length > 0) {
      this.logger.warn(
        {
          routeId: this.route.routeId,
          unknownToolNames,
          missingToolNames,
        },
        "OpenClaw effective tool inventory failed closed.",
      );
      return err(
        gatewayBrokerError(
          "gatewayBroker.toolInventoryMismatch",
          "OpenClaw effective tool inventory does not match the broker policy.",
          { unknownToolNames, missingToolNames },
        ),
      );
    }

    return ok({
      sessionRef: input.sessionRef,
      toolNames,
      checkedAt: new Date(),
    });
  }

  private async ensureSessionCreated(
    sessionKey: string,
    agentId: string,
    options: { readonly force?: boolean } = {},
  ): Promise<Result<void>> {
    if (options.force !== true && this.createdSessionKeys.has(sessionKey)) {
      return ok(undefined);
    }

    const response = await this.request(
      "sessions.create",
      { key: sessionKey, agentId },
      { sideEffect: false },
    );
    if (!response.ok) {
      if (isAlreadyExistsError(response.error)) {
        this.createdSessionKeys.add(sessionKey);
        return ok(undefined);
      }

      return err(response.error);
    }

    if (isRecord(response.value) && response.value["ok"] === false) {
      const message =
        stringValue(response.value["message"]) ??
        stringValue(response.value["error"]) ??
        "OpenClaw Gateway rejected session creation.";
      const code = stringValue(response.value["code"]) ?? "gatewayBroker.requestFailed";
      const createError = gatewayBrokerError("gatewayBroker.requestFailed", message, {
        code,
        message,
      });
      if (isAlreadyExistsError(createError)) {
        this.createdSessionKeys.add(sessionKey);
        return ok(undefined);
      }

      return err(createError);
    }

    this.createdSessionKeys.add(sessionKey);
    return ok(undefined);
  }

  private async sendSessionMessage(
    input: StartAssistantStreamInput,
    sessionKey: string,
  ): Promise<Result<unknown>> {
    return await this.request(
      "sessions.send",
      {
        key: sessionKey,
        agentId: input.assistantKey,
        message: input.prompt,
      },
      { sideEffect: true, idempotencyKey: input.idempotencyKey },
    );
  }

  private async connectOnce(): Promise<Result<void>> {
    return await new Promise<Result<void>>((resolve) => {
      const socket = this.socketFactory(this.route.url);
      let settled = false;
      let handshakeComplete = false;

      const settle = (result: Result<void>) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(challengeTimeout);
        if (!result.ok) {
          socket.close();
        }
        resolve(result);
      };

      const challengeTimeout = setTimeout(() => {
        settle(
          err(
            gatewayBrokerError(
              "gatewayBroker.connectChallengeTimeout",
              "OpenClaw Gateway did not send connect.challenge in time.",
            ),
          ),
        );
      }, this.challengeTimeoutMs);

      socket.on("message", (data) => {
        const frame = parseOpenClawFrame(data.toString());
        if (frame === null) {
          settle(err(gatewayBrokerError("gatewayBroker.invalidFrame", "Invalid Gateway frame.")));
          return;
        }

        if (handshakeComplete) {
          this.handleFrame(frame);
          return;
        }

        void this.handleHandshakeFrame(socket, frame, (result) => {
          if (!result.ok) {
            settle(result);
            return;
          }

          handshakeComplete = true;
          this.socket = socket;
          this.connected = true;
          settle(ok(undefined));
        });
      });

      socket.on("close", () => {
        if (!handshakeComplete) {
          settle(
            err(
              gatewayBrokerError(
                "gatewayBroker.connectionClosed",
                "OpenClaw connection closed during handshake.",
              ),
            ),
          );
          return;
        }

        this.handleSocketClosed();
      });

      socket.on("error", (error) => {
        settle(
          err(
            gatewayBrokerError(
              "gatewayBroker.gatewayUnavailable",
              "OpenClaw Gateway socket failed.",
              {},
              error,
            ),
          ),
        );
      });
    });
  }

  private async handleHandshakeFrame(
    socket: WebSocket,
    frame: OpenClawFrame,
    complete: (result: Result<void>) => void,
  ): Promise<void> {
    if (isConnectChallenge(frame)) {
      const connectFrame = await this.buildConnectFrame(frame.payload.nonce);
      if (!connectFrame.ok) {
        complete(err(connectFrame.error));
        return;
      }

      socket.send(serializeOpenClawFrame(connectFrame.value));
      return;
    }

    if (frame.type !== "res" || !frame.id.startsWith("connect:")) {
      complete(
        err(gatewayBrokerError("gatewayBroker.invalidFrame", "Unexpected handshake frame.")),
      );
      return;
    }

    if (!frame.ok) {
      const retryMs = retryAfterMs(frame.error);
      const error = errorFromGatewayPayload(frame.error);
      complete(
        retryMs === null
          ? err(error)
          : err(
              gatewayBrokerError(
                "gatewayBroker.gatewayUnavailable",
                "OpenClaw Gateway startup sidecars are not ready.",
                { ...sanitizeGatewayError(frame.error), retryAfterMs: retryMs },
              ),
            ),
      );
      return;
    }

    if (!isHelloOkPayload(frame.payload)) {
      complete(err(gatewayBrokerError("gatewayBroker.invalidFrame", "Invalid hello-ok payload.")));
      return;
    }

    complete(this.acceptHelloOk(frame.payload));
  }

  private acceptHelloOk(payload: HelloOkPayload): Result<void> {
    if (
      payload.protocol < MIN_OPENCLAW_PROTOCOL_VERSION ||
      payload.protocol > MAX_OPENCLAW_PROTOCOL_VERSION
    ) {
      return err(
        gatewayBrokerError(
          "gatewayBroker.protocolMismatch",
          "OpenClaw Gateway negotiated an unsupported protocol.",
        ),
      );
    }

    if (payload.auth.role !== "operator" || !hasExactExpectedScopes(payload.auth.scopes)) {
      return err(
        gatewayBrokerError(
          "gatewayBroker.scopeMismatch",
          "OpenClaw Gateway returned scopes outside the broker hot-path contract.",
          { scopes: [...payload.auth.scopes].sort() },
        ),
      );
    }

    this.policy = {
      maxPayload: payload.policy.maxPayload,
      maxBufferedBytes: payload.policy.maxBufferedBytes,
      tickIntervalMs: payload.policy.tickIntervalMs,
    };
    return ok(undefined);
  }

  private async buildConnectFrame(nonce: string): Promise<Result<OpenClawRequestFrame>> {
    const signedAt = this.now();
    const clientVersion = this.route.clientVersion ?? "0.0.0";
    const signatureInput: DeviceSignatureInput = {
      clientId: OPENCLAW_EXTERNAL_OPERATOR_CLIENT_ID,
      clientMode: OPENCLAW_EXTERNAL_OPERATOR_CLIENT_MODE,
      clientVersion,
      platform: "node",
      deviceFamily: "server",
      deviceId: this.route.deviceKeypair.deviceId,
      publicKey: this.route.deviceKeypair.publicKey,
      role: "operator",
      scopes: EXPECTED_OPERATOR_SCOPES,
      token: this.route.pairedDeviceToken,
      nonce,
      signedAt,
    };

    let signature: string;
    try {
      signature = await this.route.deviceKeypair.sign(signatureInput);
    } catch (error) {
      return err(
        gatewayBrokerError(
          "gatewayBroker.deviceSignatureFailed",
          "Broker device keypair failed to sign the OpenClaw challenge.",
          {},
          error,
        ),
      );
    }

    const params: OpenClawConnectParams = {
      minProtocol: MIN_OPENCLAW_PROTOCOL_VERSION,
      maxProtocol: MAX_OPENCLAW_PROTOCOL_VERSION,
      // The real Gateway enum-validates client.id/mode ("cli" is the documented
      // external operator presentation); our identity is the signed device.
      client: {
        id: OPENCLAW_EXTERNAL_OPERATOR_CLIENT_ID,
        version: clientVersion,
        platform: "node",
        mode: OPENCLAW_EXTERNAL_OPERATOR_CLIENT_MODE,
      },
      role: "operator",
      scopes: EXPECTED_OPERATOR_SCOPES,
      caps: [],
      commands: [],
      permissions: {},
      // Paired device tokens ride in auth.deviceToken; auth.token is reserved
      // for the shared gateway token, which the hot path must never hold.
      auth: { deviceToken: this.route.pairedDeviceToken },
      locale: "en-US",
      userAgent: `opzava-gateway-broker/${clientVersion}`,
      device: {
        id: this.route.deviceKeypair.deviceId,
        publicKey: this.route.deviceKeypair.publicKey,
        signature,
        signedAt,
        nonce,
      },
    };

    return ok({
      type: "req",
      id: `connect:${String(this.route.routeId)}`,
      method: "connect",
      params: params as unknown as Record<string, unknown>,
    });
  }

  private async request(
    method: string,
    params: Record<string, unknown>,
    options: { readonly sideEffect: boolean; readonly idempotencyKey?: string },
  ): Promise<Result<unknown>> {
    if (options.sideEffect && stringValue(options.idempotencyKey) === null) {
      return err(
        gatewayBrokerError(
          "gatewayBroker.missingIdempotencyKey",
          "Side-effecting Gateway methods require an idempotency key.",
        ),
      );
    }

    if (!this.connected || this.socket === undefined) {
      return err(
        gatewayBrokerError("gatewayBroker.connectionClosed", "OpenClaw connection is not open."),
      );
    }

    const requestParams = {
      ...params,
      ...(options.sideEffect ? { idempotencyKey: options.idempotencyKey } : {}),
    };
    const id = `${method}:${this.requestSequence}`;
    this.requestSequence += 1;
    const frame: OpenClawRequestFrame = {
      type: "req",
      id,
      method,
      params: requestParams,
    };
    const serialized = serializeOpenClawFrame(frame);
    if (serialized.length > this.policy.maxPayload) {
      return err(gatewayBrokerError("gatewayBroker.invalidFrame", "Gateway request is too large."));
    }

    return await new Promise<Result<unknown>>((resolve) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        resolve(
          err(gatewayBrokerError("gatewayBroker.requestTimeout", "Gateway request timed out.")),
        );
      }, this.requestTimeoutMs);

      this.pending.set(id, {
        id,
        method,
        timeout,
        resolve: (payload) => resolve(ok(payload)),
        reject: (error) => resolve(err(error)),
      });

      this.socket?.send(serialized, (error) => {
        // ws invokes the callback with null on success (Node stream convention).
        if (error !== undefined && error !== null) {
          this.pending.delete(id);
          clearTimeout(timeout);
          resolve(
            err(
              gatewayBrokerError(
                "gatewayBroker.connectionClosed",
                "Gateway request could not be sent.",
                {},
                error,
              ),
            ),
          );
        }
      });
    });
  }

  private handleFrame(frame: OpenClawFrame): void {
    if (frame.type === "res") {
      this.handleResponse(frame);
      return;
    }

    if (frame.type === "event") {
      this.handleEvent(frame);
    }
  }

  private handleResponse(frame: OpenClawResponseFrame): void {
    if (this.respondedIds.has(frame.id)) {
      this.failConnection(
        gatewayBrokerError("gatewayBroker.duplicateResponse", "Gateway sent a duplicate response."),
      );
      return;
    }

    const pending = this.pending.get(frame.id);
    if (pending === undefined) {
      this.failConnection(
        gatewayBrokerError("gatewayBroker.unknownResponse", "Gateway sent an unknown response id."),
      );
      return;
    }

    this.pending.delete(frame.id);
    this.respondedIds.add(frame.id);
    clearTimeout(pending.timeout);

    if (frame.ok) {
      pending.resolve(frame.payload);
      return;
    }

    pending.reject(errorFromGatewayPayload(frame.error));
  }

  private handleEvent(frame: OpenClawEventFrame): void {
    if (!isAllowedEventFamily(frame.event)) {
      // Fail closed = never project an unrecognized payload; the connection and
      // active streams stay healthy (the live gateway emits benign operational
      // families we do not consume). Only protocol-integrity violations kill
      // the connection.
      this.logger.warn(
        { routeId: this.route.routeId, event: frame.event, family: eventFamily(frame.event) },
        "OpenClaw event family ignored (fail-closed, not projected).",
      );
      return;
    }

    if (frame.event === "chat" || frame.event === "session.message") {
      this.handleStreamEvent(frame.payload);
      return;
    }

    if (frame.event === "exec.approval.requested") {
      this.handleApprovalEvent(frame.payload);
    }
  }

  private handleStreamEvent(payload: unknown): void {
    const record = isRecord(payload)
      ? (payload as SessionMessageEventPayload & ChatEventPayload)
      : {};
    const sessionKey = stringValue(record.sessionKey);
    if (sessionKey === null) {
      return;
    }

    const stream = this.activeStreams.get(sessionKey);
    if (stream === undefined) {
      return;
    }

    const runId = stringValue(record.runId);
    if (runId !== null) {
      if (stream.runId !== undefined && runId !== stream.runId) {
        return;
      }
      stream.runId = runId;
    }

    if (typeof record.state === "string") {
      // The live Gateway reuses the last delta's seq on the terminal event
      // (observed: delta seq 16 then final seq 16), so seq-dedup applies to
      // deltas only; terminal states always pass (finalization upstream is
      // idempotent).
      if (record.state === "delta" && typeof record.seq === "number") {
        if (stream.seenChatSeqs.has(record.seq)) {
          return;
        }
        stream.seenChatSeqs.add(record.seq);
      }
      this.handleChatStreamState(stream, sessionKey, record);
      return;
    }

    if (record.error !== undefined) {
      stream.queue.push({
        type: "failed",
        turnId: stream.turnId,
        code: record.error.code ?? "openclaw.streamFailed",
        message: record.error.message ?? "OpenClaw stream failed.",
      });
      stream.queue.close();
      this.activeStreams.delete(sessionKey);
      return;
    }

    if (typeof record.deltaText === "string" && record.deltaText !== "") {
      stream.text =
        record.replace === true ? record.deltaText : `${stream.text}${record.deltaText}`;
      stream.queue.push({
        type: "delta",
        turnId: stream.turnId,
        deltaText: record.deltaText,
      });
    }

    const toolCall = recordValue(record.toolCall);
    if (toolCall !== null) {
      const toolCallId = stringValue(toolCall["id"]);
      const toolName = stringValue(toolCall["name"]);
      const args = recordValue(toolCall["args"]) ?? {};
      if (toolCallId !== null && toolName !== null) {
        stream.queue.push({
          type: "tool.call",
          turnId: stream.turnId,
          toolCallId: toolCallId as OpenClawToolCallId,
          toolName,
          args,
        });
      }
    }

    if (record.done === true) {
      stream.queue.push({
        type: "final",
        turnId: stream.turnId,
        content: { text: textFromMessage(record.message) ?? stream.text },
        sessionRef: externalSessionRef(sessionKey),
        ...(stream.runId === undefined ? {} : { runRef: externalRunRef(stream.runId) }),
      });
      stream.queue.close();
      this.activeStreams.delete(sessionKey);
    }
  }

  private handleChatStreamState(
    stream: ActiveStream,
    sessionKey: string,
    record: ChatEventPayload,
  ): void {
    if (record.state === "delta") {
      if (typeof record.deltaText === "string" && record.deltaText !== "") {
        stream.text =
          record.replace === true ? record.deltaText : `${stream.text}${record.deltaText}`;
        stream.queue.push({
          type: "delta",
          turnId: stream.turnId,
          deltaText: record.deltaText,
        });
      }
      return;
    }

    if (record.state === "final") {
      stream.queue.push({
        type: "final",
        turnId: stream.turnId,
        content: { text: textFromMessage(record.message) ?? stream.text },
        sessionRef: externalSessionRef(sessionKey),
        ...(stream.runId === undefined ? {} : { runRef: externalRunRef(stream.runId) }),
      });
      stream.queue.close();
      this.activeStreams.delete(sessionKey);
      return;
    }

    if (record.state === "aborted") {
      stream.queue.push({
        type: "failed",
        turnId: stream.turnId,
        code: "aborted",
        message: textFromMessage(record.message) ?? "OpenClaw stream aborted.",
      });
      stream.queue.close();
      this.activeStreams.delete(sessionKey);
      return;
    }

    if (record.state === "error") {
      stream.queue.push({
        type: "failed",
        turnId: stream.turnId,
        code: sanitizedStreamCode(record.errorKind ?? record.errorMessage, "openclaw_stream_error"),
        message:
          stringValue(record.errorMessage) ??
          textFromMessage(record.message) ??
          "OpenClaw stream failed.",
      });
      stream.queue.close();
      this.activeStreams.delete(sessionKey);
      return;
    }

    stream.queue.push({
      type: "failed",
      turnId: stream.turnId,
      code: "openclaw_unknown_chat_state",
      message: "OpenClaw emitted an unknown chat stream state.",
    });
    stream.queue.close();
    this.activeStreams.delete(sessionKey);
  }

  private handleApprovalEvent(payload: unknown): void {
    if (!isRecord(payload)) {
      return;
    }

    const sessionKey = stringValue(payload["sessionKey"]);
    const approvalRef = stringValue(payload["approvalRef"]);
    if (sessionKey === null || approvalRef === null) {
      return;
    }

    const stream = this.activeStreams.get(sessionKey);
    if (stream === undefined) {
      return;
    }

    stream.queue.push({
      type: "approval.requested",
      turnId: stream.turnId,
      approvalRef: makeOpaqueExternalRef({
        system: "openclaw",
        kind: "approval",
        value: approvalRef,
      }),
      summary: stringValue(payload["summary"]) ?? "OpenClaw requested approval.",
    });
  }

  private handleSocketClosed(): void {
    this.connected = false;
    this.socket = undefined;
    this.createdSessionKeys.clear();
    this.rejectPending(
      gatewayBrokerError("gatewayBroker.connectionClosed", "OpenClaw connection closed."),
    );
    this.failActiveStreams("gatewayBroker.connectionClosed", "OpenClaw connection closed.");
  }

  private failConnection(error: DomainError): void {
    this.logger.error(
      { routeId: this.route.routeId, code: error.code },
      "OpenClaw connection failed closed.",
    );
    this.rejectPending(error);
    this.failActiveStreams(error.code, error.message);
    this.connected = false;
    this.createdSessionKeys.clear();
    this.socket?.close();
    this.socket = undefined;
  }

  private rejectPending(error: DomainError): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private failActiveStreams(code: string, message: string): void {
    for (const stream of this.activeStreams.values()) {
      stream.queue.push({
        type: "failed",
        turnId: stream.turnId,
        code,
        message,
      });
      stream.queue.close();
    }
    this.activeStreams.clear();
  }
}
