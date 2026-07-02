import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import type WebSocket from "ws";

import {
  EXPECTED_OPERATOR_SCOPES,
  OPENCLAW_PROTOCOL_VERSION,
  hasExactExpectedScopes,
  isRecord,
  parseOpenClawFrame,
  serializeOpenClawFrame,
  type OpenClawConnectParams,
  type OpenClawErrorPayload,
  type OpenClawRequestFrame,
  type OpenClawResponseFrame,
} from "./protocol.js";
import {
  OPENCLAW_EXTERNAL_OPERATOR_CLIENT_ID,
  OPENCLAW_EXTERNAL_OPERATOR_CLIENT_MODE,
  deriveDeviceIdFromPublicKey,
  type DeviceKeypair,
  type DeviceSignatureInput,
} from "./signing.js";

export type FakeGatewayMode =
  | "normal"
  | "auth-scope-mismatch"
  | "chat-aborted"
  | "chat-error"
  | "duplicate-response"
  | "mid-stream-close"
  | "protocol-mismatch"
  | "session-pruned-always-before-send"
  | "session-pruned-once-before-send"
  | "scripted-task-tool-call"
  | "scope-inflated"
  | "startup-sidecars-once"
  | "unknown-event-family";

export interface FakeGatewayOptions {
  readonly deviceKeypair: DeviceKeypair;
  readonly pairedDeviceToken: string;
  readonly sharedGatewayToken?: string;
  readonly mode?: FakeGatewayMode;
}

export interface FakeGatewaySessionRecord {
  readonly sessionKey: string;
  readonly runId: string;
  readonly idempotencyKey: string;
}

export class FakeOpenClawGateway {
  private readonly server = new WebSocketServer({
    port: 0,
    host: "127.0.0.1",
    perMessageDeflate: false,
  });
  private readonly deviceKeypair: DeviceKeypair;
  private readonly pairedDeviceToken: string;
  private readonly sharedGatewayToken: string;
  private readonly mode: FakeGatewayMode;
  private readonly createdSessionKeys = new Set<string>();
  private readonly prunedSessionKeys = new Set<string>();
  private readonly sessionsByIdempotencyKey = new Map<string, FakeGatewaySessionRecord>();
  private readonly issuedDeviceTokens = new Set<string>();
  public readonly ready: Promise<void>;
  private startupUnavailableSent = false;
  private connectionCountValue = 0;
  private sessionCreateCountValue = 0;
  private sessionRequestCountValue = 0;
  private issuedDeviceTokenSequence = 0;
  private lastSessionSendParamsValue: Record<string, unknown> | undefined;

  public constructor(options: FakeGatewayOptions) {
    this.deviceKeypair = options.deviceKeypair;
    this.pairedDeviceToken = options.pairedDeviceToken;
    this.sharedGatewayToken = options.sharedGatewayToken ?? "shared-gateway-token";
    this.mode = options.mode ?? "normal";
    this.ready = new Promise((resolve) => {
      if (this.server.address() !== null) {
        resolve();
        return;
      }

      this.server.on("listening", () => resolve());
    });
    this.server.on("connection", (socket) => {
      this.connectionCountValue += 1;
      this.handleConnection(socket);
    });
  }

  public get url(): string {
    const address = this.server.address();
    if (typeof address === "string" || address === null) {
      throw new Error("Fake Gateway expected TCP server address.");
    }

    return `ws://127.0.0.1:${address.port}`;
  }

  public get connectionCount(): number {
    return this.connectionCountValue;
  }

  public get sessionRequestCount(): number {
    return this.sessionRequestCountValue;
  }

  public get sessionCreateCount(): number {
    return this.sessionCreateCountValue;
  }

  public get lastSessionSendParams(): Readonly<Record<string, unknown>> | undefined {
    return this.lastSessionSendParamsValue;
  }

  public async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error !== undefined) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private handleConnection(socket: WebSocket): void {
    const nonce = randomUUID();
    const challengeTs = Date.now();
    socket.send(
      serializeOpenClawFrame({
        type: "event",
        event: "connect.challenge",
        payload: { nonce, ts: challengeTs },
      }),
    );

    socket.on("message", (data) => {
      const frame = parseOpenClawFrame(data.toString());
      if (frame === null || frame.type !== "req") {
        socket.close();
        return;
      }

      void this.handleRequest(socket, frame, nonce, challengeTs);
    });
  }

  private async handleRequest(
    socket: WebSocket,
    frame: OpenClawRequestFrame,
    nonce: string,
    challengeTs: number,
  ): Promise<void> {
    if (frame.method === "connect") {
      await this.handleConnect(socket, frame, nonce, challengeTs);
      return;
    }

    if (frame.method === "sessions.send") {
      this.handleSessionSend(socket, frame);
      return;
    }

    if (frame.method === "sessions.create") {
      this.handleSessionCreate(socket, frame);
      return;
    }

    if (frame.method === "sessions.messages.subscribe") {
      this.handleSessionMessagesSubscribe(socket, frame);
      return;
    }

    if (frame.method === "tools.effective") {
      const shapeError = this.validateExactParams(frame.params, ["sessionKey", "agentId"]);
      if (shapeError !== null || this.stringParam(frame.params, "sessionKey") === null) {
        this.badRequest(socket, frame.id, shapeError ?? "sessionKey is required");
        return;
      }

      this.sendResponse(socket, {
        type: "res",
        id: frame.id,
        ok: true,
        payload: {
          tools: [
            { name: "opzava_tasks_list", source: "core" },
            { name: "opzava_tasks_create", source: "core" },
            { name: "opzava_tasks_update", source: "core" },
          ],
        },
      });
      return;
    }

    this.sendResponse(socket, {
      type: "res",
      id: frame.id,
      ok: false,
      error: { code: "NOT_FOUND", message: "unknown method" },
    });
  }

  private async handleConnect(
    socket: WebSocket,
    frame: OpenClawRequestFrame,
    nonce: string,
    challengeTs: number,
  ): Promise<void> {
    if (this.mode === "startup-sidecars-once" && !this.startupUnavailableSent) {
      this.startupUnavailableSent = true;
      this.sendResponse(socket, {
        type: "res",
        id: frame.id,
        ok: false,
        error: {
          code: "UNAVAILABLE",
          message: "startup sidecars not ready",
          details: { reason: "startup-sidecars", retryAfterMs: 1 },
        },
      });
      socket.close();
      return;
    }

    const params = this.connectParams(frame.params);
    if (params === null) {
      this.authScopeMismatch(socket, frame.id, "invalid connect params");
      return;
    }

    const clientId = params.client.id as string;
    const clientMode = params.client.mode as string;
    if (
      clientId !== OPENCLAW_EXTERNAL_OPERATOR_CLIENT_ID ||
      clientMode !== OPENCLAW_EXTERNAL_OPERATOR_CLIENT_MODE
    ) {
      this.sendResponse(socket, {
        type: "res",
        id: frame.id,
        ok: false,
        error: {
          code: "BAD_REQUEST",
          message: "client presentation failed enum validation",
          details: {
            reason: "invalid-client-presentation",
            clientId,
            clientMode,
          },
        },
      });
      return;
    }

    if (
      this.mode === "protocol-mismatch" ||
      params.minProtocol > OPENCLAW_PROTOCOL_VERSION ||
      params.maxProtocol < OPENCLAW_PROTOCOL_VERSION
    ) {
      this.sendResponse(socket, {
        type: "res",
        id: frame.id,
        ok: false,
        error: {
          code: "PROTOCOL_MISMATCH",
          message: "protocol range unsupported",
          details: { minProtocol: params.minProtocol, maxProtocol: params.maxProtocol },
        },
      });
      return;
    }

    if (this.mode === "auth-scope-mismatch") {
      this.authScopeMismatch(socket, frame.id, "forced scope mismatch");
      return;
    }

    const auth = this.resolveAuth(params);
    if (!auth.ok) {
      this.sendResponse(socket, {
        type: "res",
        id: frame.id,
        ok: false,
        error: auth.error,
      });
      return;
    }

    const signatureValid = await this.verifySignature(params, nonce, challengeTs, auth.token);
    if (!signatureValid || !hasExactExpectedScopes(params.scopes)) {
      this.authScopeMismatch(socket, frame.id, "signature or scopes invalid");
      return;
    }

    const issuedDeviceToken =
      auth.kind === "gateway-token" ? this.issueDeviceToken(params.device.id) : undefined;

    this.sendResponse(socket, {
      type: "res",
      id: frame.id,
      ok: true,
      payload: {
        type: "hello-ok",
        protocol: OPENCLAW_PROTOCOL_VERSION,
        server: { version: "fake-gateway", connId: randomUUID() },
        features: {
          methods: [
            "sessions.create",
            "sessions.send",
            "sessions.messages.subscribe",
            "tools.effective",
          ],
          events: ["chat", "session.message", "exec.approval.requested"],
        },
        snapshot: {},
        auth: {
          role: "operator",
          // The real Gateway materializes operator.read ("write implies read").
          scopes:
            this.mode === "scope-inflated"
              ? [...EXPECTED_OPERATOR_SCOPES, "operator.admin"]
              : [...EXPECTED_OPERATOR_SCOPES, "operator.read"],
          ...(issuedDeviceToken === undefined
            ? {}
            : { deviceToken: issuedDeviceToken, issuedAtMs: Date.now() }),
        },
        policy: {
          maxPayload: 262144,
          maxBufferedBytes: 524288,
          tickIntervalMs: 15000,
        },
      },
    });
  }

  private handleSessionSend(socket: WebSocket, frame: OpenClawRequestFrame): void {
    this.sessionRequestCountValue += 1;
    this.lastSessionSendParamsValue = { ...frame.params };

    const shapeError = this.validateExactParams(frame.params, [
      "key",
      "agentId",
      "message",
      "thinking",
      "attachments",
      "timeoutMs",
      "idempotencyKey",
    ]);
    if (shapeError !== null) {
      this.badRequest(socket, frame.id, shapeError);
      return;
    }

    const sessionKey = this.stringParam(frame.params, "key");
    if (sessionKey === null) {
      this.badRequest(socket, frame.id, "key is required");
      return;
    }

    if (typeof frame.params["message"] !== "string") {
      this.badRequest(socket, frame.id, "message must be string");
      return;
    }

    if (this.shouldPruneBeforeSend(sessionKey) || !this.createdSessionKeys.has(sessionKey)) {
      this.sessionNotFound(socket, frame.id, sessionKey);
      return;
    }

    const idempotencyKey = this.stringParam(frame.params, "idempotencyKey");
    if (idempotencyKey === null) {
      this.sendResponse(socket, {
        type: "res",
        id: frame.id,
        ok: false,
        error: { code: "BAD_REQUEST", message: "idempotency key required" },
      });
      return;
    }

    const existing = this.sessionsByIdempotencyKey.get(idempotencyKey);
    const record =
      existing ??
      ({
        sessionKey,
        idempotencyKey,
        runId: `run:${idempotencyKey}`,
      } satisfies FakeGatewaySessionRecord);
    this.sessionsByIdempotencyKey.set(idempotencyKey, record);

    const response: OpenClawResponseFrame = {
      type: "res",
      id: frame.id,
      ok: true,
      payload: { key: record.sessionKey, runId: record.runId },
    };
    this.sendResponse(socket, response);

    if (this.mode === "duplicate-response") {
      this.sendResponse(socket, response);
      return;
    }

    if (this.mode === "unknown-event-family") {
      socket.send(
        serializeOpenClawFrame({
          type: "event",
          event: "runtime.secret",
          payload: { redacted: false },
        }),
      );
      // Live gateways interleave benign unknown families with the run stream;
      // the client must ignore them and still finish the run.
      this.emitStream(socket, record);
      return;
    }

    this.emitStream(socket, record);
  }

  private handleSessionCreate(socket: WebSocket, frame: OpenClawRequestFrame): void {
    this.sessionCreateCountValue += 1;

    const shapeError = this.validateExactParams(frame.params, [
      "key",
      "agentId",
      "label",
      "model",
      "parentSessionKey",
      "emitCommandHooks",
      "task",
      "message",
    ]);
    if (shapeError !== null) {
      this.badRequest(socket, frame.id, shapeError);
      return;
    }

    const sessionKey = this.stringParam(frame.params, "key") ?? `session:${randomUUID()}`;
    const alreadyExisted = this.createdSessionKeys.has(sessionKey);
    this.createdSessionKeys.add(sessionKey);

    this.sendResponse(socket, {
      type: "res",
      id: frame.id,
      ok: true,
      payload: {
        key: sessionKey,
        alreadyExisted,
      },
    });
  }

  private handleSessionMessagesSubscribe(socket: WebSocket, frame: OpenClawRequestFrame): void {
    const shapeError = this.validateExactParams(frame.params, ["key", "agentId"]);
    if (shapeError !== null || this.stringParam(frame.params, "key") === null) {
      this.badRequest(socket, frame.id, shapeError ?? "key is required");
      return;
    }

    this.sendResponse(socket, {
      type: "res",
      id: frame.id,
      ok: true,
      payload: { subscribed: true },
    });
  }

  private emitStream(socket: WebSocket, record: FakeGatewaySessionRecord): void {
    socket.send(
      serializeOpenClawFrame({
        type: "event",
        event: "chat",
        payload: {
          runId: record.runId,
          sessionKey: record.sessionKey,
          agentId: "ask-admin-opzava",
          seq: 0,
          state: "delta",
          deltaText: "Created ",
        },
      }),
    );

    if (this.mode === "mid-stream-close") {
      socket.close();
      return;
    }

    if (this.mode === "chat-aborted") {
      socket.send(
        serializeOpenClawFrame({
          type: "event",
          event: "chat",
          payload: {
            runId: record.runId,
            sessionKey: record.sessionKey,
            agentId: "ask-admin-opzava",
            seq: 1,
            state: "aborted",
            message: "OpenClaw run was aborted.",
          },
        }),
      );
      return;
    }

    if (this.mode === "chat-error") {
      socket.send(
        serializeOpenClawFrame({
          type: "event",
          event: "chat",
          payload: {
            runId: record.runId,
            sessionKey: record.sessionKey,
            agentId: "ask-admin-opzava",
            seq: 1,
            state: "error",
            errorKind: "rate_limit",
            errorMessage: "Provider rate limit.",
          },
        }),
      );
      return;
    }

    if (this.mode === "scripted-task-tool-call") {
      socket.send(
        serializeOpenClawFrame({
          type: "event",
          event: "session.message",
          payload: {
            sessionKey: record.sessionKey,
            runId: record.runId,
            toolCall: {
              id: "tool-call-create-task",
              name: "opzava_tasks_create",
              args: {
                title: "Scripted fake-lane task",
                description: "Created through Ask Admin Opzava.",
                priority: "normal",
                status: "todo",
                labels: ["ask-admin"],
              },
            },
          },
        }),
      );
    }

    socket.send(
      serializeOpenClawFrame({
        type: "event",
        event: "chat",
        payload: {
          runId: record.runId,
          sessionKey: record.sessionKey,
          agentId: "ask-admin-opzava",
          seq: 2,
          state: "delta",
          deltaText: "the task.",
        },
      }),
    );
    // Mirror the live Gateway: the terminal event REUSES the last delta's seq
    // (observed live: delta seq 16 then final seq 16).
    socket.send(
      serializeOpenClawFrame({
        type: "event",
        event: "chat",
        payload: {
          runId: record.runId,
          sessionKey: record.sessionKey,
          agentId: "ask-admin-opzava",
          seq: 2,
          state: "final",
          message: "Created the task.",
        },
      }),
    );
  }

  private async verifySignature(
    params: OpenClawConnectParams,
    nonce: string,
    challengeTs: number,
    token: string,
  ): Promise<boolean> {
    let derivedDeviceId: string;
    try {
      derivedDeviceId = deriveDeviceIdFromPublicKey(params.device.publicKey);
    } catch {
      return false;
    }

    if (
      params.device.nonce !== nonce ||
      params.device.id !== this.deviceKeypair.deviceId ||
      params.device.id !== derivedDeviceId ||
      Math.abs(params.device.signedAt - challengeTs) > 5 * 60_000
    ) {
      return false;
    }

    const signatureInput: DeviceSignatureInput = {
      clientId: params.client.id,
      clientMode: params.client.mode,
      clientVersion: params.client.version,
      platform: params.client.platform,
      deviceFamily: "server",
      deviceId: params.device.id,
      publicKey: params.device.publicKey,
      role: params.role,
      scopes: EXPECTED_OPERATOR_SCOPES,
      token,
      nonce,
      signedAt: params.device.signedAt,
    };
    const expected = await this.deviceKeypair.sign(signatureInput);
    return params.device.signature === expected;
  }

  private resolveAuth(params: OpenClawConnectParams):
    | { readonly ok: true; readonly kind: "device-token" | "gateway-token"; readonly token: string }
    | { readonly ok: false; readonly error: OpenClawErrorPayload } {
    const gatewayToken = params.auth.token;
    const deviceToken = params.auth.deviceToken;
    const bootstrapToken = params.auth.bootstrapToken;

    if (gatewayToken !== undefined) {
      if (gatewayToken !== this.sharedGatewayToken) {
        return {
          ok: false,
          error: {
            code: "AUTH_TOKEN_MISMATCH",
            message: "gateway token mismatch",
            details: { reason: "gateway-token-mismatch" },
          },
        };
      }

      return { ok: true, kind: "gateway-token", token: gatewayToken };
    }

    if (deviceToken !== undefined) {
      if (deviceToken !== this.pairedDeviceToken && !this.issuedDeviceTokens.has(deviceToken)) {
        return {
          ok: false,
          error: {
            code: "AUTH_DEVICE_TOKEN_MISMATCH",
            message: "device token mismatch (rotate/reissue)",
            details: { reason: "device-token-mismatch" },
          },
        };
      }

      return { ok: true, kind: "device-token", token: deviceToken };
    }

    if (bootstrapToken !== undefined) {
      return {
        ok: false,
        error: {
          code: "AUTH_TOKEN_MISMATCH",
          message: "gateway token mismatch",
          details: { reason: "bootstrap-token-unsupported" },
        },
      };
    }

    return {
      ok: false,
      error: {
        code: "PAIRING_REQUIRED",
        message: "approval required",
        details: { requestId: `fake-pairing-${params.device.id}`, recommendedNextStep: "approve" },
      },
    };
  }

  private issueDeviceToken(deviceId: string): string {
    this.issuedDeviceTokenSequence += 1;
    const token = `issued-device-token-${deviceId}-${this.issuedDeviceTokenSequence}`;
    this.issuedDeviceTokens.add(token);
    return token;
  }

  private authScopeMismatch(socket: WebSocket, id: string, message: string): void {
    this.sendResponse(socket, {
      type: "res",
      id,
      ok: false,
      error: {
        code: "AUTH_SCOPE_MISMATCH",
        message,
        details: { recommendedNextStep: "re_pair", reason: "scope-mismatch" },
      },
    });
  }

  private connectParams(params: Record<string, unknown>): OpenClawConnectParams | null {
    if (
      params["role"] !== "operator" ||
      !Array.isArray(params["scopes"]) ||
      !isRecord(params["client"]) ||
      !isRecord(params["auth"]) ||
      !isRecord(params["device"]) ||
      typeof params["minProtocol"] !== "number" ||
      typeof params["maxProtocol"] !== "number"
    ) {
      return null;
    }

    return params as unknown as OpenClawConnectParams;
  }

  private stringParam(params: Record<string, unknown>, key: string): string | null {
    const value = params[key];
    return typeof value === "string" && value.trim() !== "" ? value : null;
  }

  private validateExactParams(
    params: Record<string, unknown>,
    allowedKeys: readonly string[],
  ): string | null {
    const allowed = new Set(allowedKeys);
    const unexpected = Object.keys(params).find((key) => !allowed.has(key));
    return unexpected === undefined ? null : `unexpected property "${unexpected}"`;
  }

  private shouldPruneBeforeSend(sessionKey: string): boolean {
    if (this.mode === "session-pruned-always-before-send") {
      this.createdSessionKeys.delete(sessionKey);
      return true;
    }

    if (
      this.mode === "session-pruned-once-before-send" &&
      !this.prunedSessionKeys.has(sessionKey)
    ) {
      this.prunedSessionKeys.add(sessionKey);
      this.createdSessionKeys.delete(sessionKey);
      return true;
    }

    return false;
  }

  private sessionNotFound(socket: WebSocket, id: string, sessionKey: string): void {
    this.sendResponse(socket, {
      type: "res",
      id,
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: `session not found: ${sessionKey}`,
      },
    });
  }

  private badRequest(socket: WebSocket, id: string, message: string): void {
    this.sendResponse(socket, {
      type: "res",
      id,
      ok: false,
      error: { code: "BAD_REQUEST", message },
    });
  }

  private sendResponse(socket: WebSocket, frame: OpenClawResponseFrame): void {
    socket.send(serializeOpenClawFrame(frame));
  }
}
