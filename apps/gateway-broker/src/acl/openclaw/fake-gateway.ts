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
  type OpenClawRequestFrame,
  type OpenClawResponseFrame
} from "./protocol.js";
import type { DeviceKeypair, DeviceSignatureInput } from "./signing.js";

export type FakeGatewayMode =
  | "normal"
  | "auth-scope-mismatch"
  | "duplicate-response"
  | "mid-stream-close"
  | "protocol-mismatch"
  | "scripted-task-tool-call"
  | "scope-inflated"
  | "startup-sidecars-once"
  | "unknown-event-family";

export interface FakeGatewayOptions {
  readonly deviceKeypair: DeviceKeypair;
  readonly pairedDeviceToken: string;
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
    perMessageDeflate: false
  });
  private readonly deviceKeypair: DeviceKeypair;
  private readonly pairedDeviceToken: string;
  private readonly mode: FakeGatewayMode;
  private readonly sessionsByIdempotencyKey = new Map<string, FakeGatewaySessionRecord>();
  public readonly ready: Promise<void>;
  private startupUnavailableSent = false;
  private connectionCountValue = 0;
  private sessionRequestCountValue = 0;

  public constructor(options: FakeGatewayOptions) {
    this.deviceKeypair = options.deviceKeypair;
    this.pairedDeviceToken = options.pairedDeviceToken;
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
        payload: { nonce, ts: challengeTs }
      })
    );

    socket.on("message", (data) => {
      const frame = parseOpenClawFrame(data.toString());
      if (frame === null || frame.type !== "req") {
        socket.close();
        return;
      }

      void this.handleRequest(socket, frame, nonce);
    });
  }

  private async handleRequest(
    socket: WebSocket,
    frame: OpenClawRequestFrame,
    nonce: string
  ): Promise<void> {
    if (frame.method === "connect") {
      await this.handleConnect(socket, frame, nonce);
      return;
    }

    if (frame.method === "sessions.send") {
      this.handleSessionSend(socket, frame);
      return;
    }

    if (frame.method === "tools.effective") {
      this.sendResponse(socket, {
        type: "res",
        id: frame.id,
        ok: true,
        payload: {
          tools: [
            { name: "opzava_tasks_list", source: "core" },
            { name: "opzava_tasks_create", source: "core" },
            { name: "opzava_tasks_update", source: "core" }
          ]
        }
      });
      return;
    }

    this.sendResponse(socket, {
      type: "res",
      id: frame.id,
      ok: false,
      error: { code: "NOT_FOUND", message: "unknown method" }
    });
  }

  private async handleConnect(
    socket: WebSocket,
    frame: OpenClawRequestFrame,
    nonce: string
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
          details: { reason: "startup-sidecars", retryAfterMs: 1 }
        }
      });
      socket.close();
      return;
    }

    const params = this.connectParams(frame.params);
    if (params === null) {
      this.authScopeMismatch(socket, frame.id, "invalid connect params");
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
          details: { minProtocol: params.minProtocol, maxProtocol: params.maxProtocol }
        }
      });
      return;
    }

    if (this.mode === "auth-scope-mismatch") {
      this.authScopeMismatch(socket, frame.id, "forced scope mismatch");
      return;
    }

    const signatureValid = await this.verifySignature(params, nonce);
    if (!signatureValid || !hasExactExpectedScopes(params.scopes)) {
      this.authScopeMismatch(socket, frame.id, "signature or scopes invalid");
      return;
    }

    this.sendResponse(socket, {
      type: "res",
      id: frame.id,
      ok: true,
      payload: {
        type: "hello-ok",
        protocol: OPENCLAW_PROTOCOL_VERSION,
        server: { version: "fake-gateway", connId: randomUUID() },
        features: {
          methods: ["sessions.send", "tools.effective"],
          events: ["chat", "session.message", "exec.approval.requested"]
        },
        snapshot: {},
        auth: {
          role: "operator",
          scopes:
            this.mode === "scope-inflated"
              ? [...EXPECTED_OPERATOR_SCOPES, "operator.admin"]
              : [...EXPECTED_OPERATOR_SCOPES]
        },
        policy: {
          maxPayload: 262144,
          maxBufferedBytes: 524288,
          tickIntervalMs: 15000
        }
      }
    });
  }

  private handleSessionSend(socket: WebSocket, frame: OpenClawRequestFrame): void {
    this.sessionRequestCountValue += 1;

    const idempotencyKey = this.stringParam(frame.params, "idempotencyKey");
    const sessionKey = this.stringParam(frame.params, "sessionKey") ?? "fake-session";
    if (idempotencyKey === null) {
      this.sendResponse(socket, {
        type: "res",
        id: frame.id,
        ok: false,
        error: { code: "BAD_REQUEST", message: "idempotency key required" }
      });
      return;
    }

    const existing = this.sessionsByIdempotencyKey.get(idempotencyKey);
    const record =
      existing ??
      ({
        sessionKey,
        idempotencyKey,
        runId: `run:${idempotencyKey}`
      } satisfies FakeGatewaySessionRecord);
    this.sessionsByIdempotencyKey.set(idempotencyKey, record);

    const response: OpenClawResponseFrame = {
      type: "res",
      id: frame.id,
      ok: true,
      payload: { sessionKey: record.sessionKey, runId: record.runId }
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
          payload: { redacted: false }
        })
      );
      return;
    }

    this.emitStream(socket, record);
  }

  private emitStream(socket: WebSocket, record: FakeGatewaySessionRecord): void {
    socket.send(
      serializeOpenClawFrame({
        type: "event",
        event: "chat",
        payload: {
          sessionKey: record.sessionKey,
          runId: record.runId,
          deltaText: "Created "
        }
      })
    );

    if (this.mode === "mid-stream-close") {
      socket.close();
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
                labels: ["ask-admin"]
              }
            }
          }
        })
      );
    }

    socket.send(
      serializeOpenClawFrame({
        type: "event",
        event: "session.message",
        payload: {
          sessionKey: record.sessionKey,
          runId: record.runId,
          deltaText: "the task."
        }
      })
    );
    socket.send(
      serializeOpenClawFrame({
        type: "event",
        event: "session.message",
        payload: {
          sessionKey: record.sessionKey,
          runId: record.runId,
          message: "Created the task.",
          done: true
        }
      })
    );
  }

  private async verifySignature(params: OpenClawConnectParams, nonce: string): Promise<boolean> {
    if (
      params.auth.token !== this.pairedDeviceToken ||
      params.device.nonce !== nonce ||
      params.device.id !== this.deviceKeypair.deviceId ||
      params.device.publicKey !== this.deviceKeypair.publicKey
    ) {
      return false;
    }

    const signatureInput: DeviceSignatureInput = {
      clientId: params.client.id,
      clientVersion: params.client.version,
      platform: params.client.platform,
      deviceFamily: "server",
      deviceId: params.device.id,
      publicKey: params.device.publicKey,
      role: params.role,
      scopes: EXPECTED_OPERATOR_SCOPES,
      token: params.auth.token,
      nonce,
      signedAt: params.device.signedAt
    };
    const expected = await this.deviceKeypair.sign(signatureInput);
    return params.device.signature === expected;
  }

  private authScopeMismatch(socket: WebSocket, id: string, message: string): void {
    this.sendResponse(socket, {
      type: "res",
      id,
      ok: false,
      error: {
        code: "AUTH_SCOPE_MISMATCH",
        message,
        details: { recommendedNextStep: "re_pair", reason: "scope-mismatch" }
      }
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

  private sendResponse(socket: WebSocket, frame: OpenClawResponseFrame): void {
    socket.send(serializeOpenClawFrame(frame));
  }
}
