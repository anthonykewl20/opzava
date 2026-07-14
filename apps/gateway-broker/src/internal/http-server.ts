import { createHash, timingSafeEqual } from "node:crypto";
import http, { type IncomingMessage, type ServerResponse } from "node:http";

import type {
  OpenClawGatewayPort,
  OpenClawGatewayRouteId,
  OpenClawRunRef,
  OpenClawSessionRef,
  OpenClawStreamEvent,
  OpenClawToolCallId,
  StartAssistantStreamInput,
} from "@opzava/ports";
import type { OrgId, TenantId, UserId, WorkspaceId } from "@opzava/shared-kernel";

interface AssertedPrincipalBlock {
  /** Correlation only; the broker does not verify this value against a session. */
  readonly sessionId: string;
  readonly tenantId: TenantId;
  readonly orgId: OrgId;
  readonly workspaceId: WorkspaceId;
  readonly userId: UserId;
  readonly roleKeys: readonly string[];
}

interface InternalAssistantStreamRequest {
  readonly routeId: OpenClawGatewayRouteId;
  readonly assistantKey: string;
  readonly conversationId: string;
  readonly turnId: string;
  readonly prompt: string;
  readonly idempotencyKey: string;
  readonly principal: AssertedPrincipalBlock;
  readonly sessionRef?: OpenClawSessionRef;
}

type InternalAssistantStreamEvent =
  | {
      readonly type: "queued";
      readonly turnId: string;
    }
  | {
      readonly type: "delta";
      readonly turnId: string;
      readonly deltaText: string;
    }
  | {
      readonly type: "tool.started";
      readonly turnId: string;
      readonly toolCallId: OpenClawToolCallId;
      readonly toolName: string;
    }
  | {
      readonly type: "tool.call";
      readonly turnId: string;
      readonly toolCallId: OpenClawToolCallId;
      readonly toolName: string;
      readonly args: Readonly<Record<string, unknown>>;
    }
  | {
      readonly type: "tool.succeeded";
      readonly turnId: string;
      readonly toolCallId: OpenClawToolCallId;
      readonly toolName: string;
      readonly output: Readonly<Record<string, unknown>>;
    }
  | {
      readonly type: "assistant.final";
      readonly turnId: string;
      readonly content: Readonly<Record<string, unknown>>;
      readonly sessionRef?: OpenClawSessionRef;
      readonly runRef?: OpenClawRunRef;
    }
  | {
      readonly type: "failed";
      readonly turnId?: string;
      readonly code: string;
      readonly message: string;
    };

export interface BrokerInternalHttpServerOptions {
  readonly gatewayPort: OpenClawGatewayPort;
  readonly internalToken: string;
  readonly maxBodyBytes?: number;
}

const defaultMaxBodyBytes = 64 * 1024;

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArrayValue(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const values = value.filter((entry): entry is string => typeof entry === "string");
  return values.length === value.length ? values : null;
}

function sameToken(expected: string, candidate: string): boolean {
  const expectedHash = createHash("sha256").update(expected).digest();
  const candidateHash = createHash("sha256").update(candidate).digest();
  return timingSafeEqual(expectedHash, candidateHash);
}

function bearerToken(request: IncomingMessage): string | null {
  const header = request.headers.authorization;
  if (typeof header !== "string") {
    return null;
  }

  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || token === undefined || token.trim() === "") {
    return null;
  }

  return token;
}

function authenticated(request: IncomingMessage, internalToken: string): boolean {
  const token = bearerToken(request);
  return token !== null && sameToken(internalToken, token);
}

async function readJsonBody(request: IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    totalBytes += buffer.byteLength;
    if (totalBytes > maxBodyBytes) {
      throw new Error("request-body-too-large");
    }
    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/**
 * These claims are asserted by a holder of the trusted internal token. This
 * parser only checks their shape; it does not verify them against any session,
 * so that token holder can assert any tenant principal.
 */
function parseAssertedPrincipal(value: unknown): AssertedPrincipalBlock | null {
  if (!isRecord(value)) {
    return null;
  }

  const sessionId = stringValue(value["sessionId"]);
  const tenantId = stringValue(value["tenantId"]);
  const orgId = stringValue(value["orgId"]);
  const workspaceId = stringValue(value["workspaceId"]);
  const userId = stringValue(value["userId"]);
  const roleKeys = stringArrayValue(value["roleKeys"]);

  if (
    sessionId === null ||
    tenantId === null ||
    orgId === null ||
    workspaceId === null ||
    userId === null ||
    roleKeys === null
  ) {
    return null;
  }

  return {
    sessionId,
    tenantId: tenantId as TenantId,
    orgId: orgId as OrgId,
    workspaceId: workspaceId as WorkspaceId,
    userId: userId as UserId,
    roleKeys,
  };
}

function parseOpaqueRef(value: unknown): OpenClawSessionRef | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const system = stringValue(value["system"]);
  const kind = stringValue(value["kind"]);
  const refValue = stringValue(value["value"]);
  if (system === null || kind === null || refValue === null) {
    return undefined;
  }

  return { system, kind, value: refValue } as OpenClawSessionRef;
}

function parseInternalRequest(value: unknown): InternalAssistantStreamRequest | null {
  if (!isRecord(value)) {
    return null;
  }

  const routeId = stringValue(value["routeId"]);
  const assistantKey = stringValue(value["assistantKey"]);
  const conversationId = stringValue(value["conversationId"]);
  const turnId = stringValue(value["turnId"]);
  const prompt = stringValue(value["prompt"]);
  const idempotencyKey = stringValue(value["idempotencyKey"]);
  const principal = parseAssertedPrincipal(value["principal"]);

  if (
    routeId === null ||
    assistantKey === null ||
    conversationId === null ||
    turnId === null ||
    prompt === null ||
    idempotencyKey === null ||
    principal === null
  ) {
    return null;
  }

  const sessionRef = parseOpaqueRef(value["sessionRef"]);

  return {
    routeId: routeId as OpenClawGatewayRouteId,
    assistantKey,
    conversationId,
    turnId,
    prompt,
    idempotencyKey,
    principal,
    ...(sessionRef === undefined ? {} : { sessionRef }),
  };
}

function toActingPrincipal(
  input: InternalAssistantStreamRequest,
): StartAssistantStreamInput["actingPrincipal"] {
  return {
    tenantId: input.principal.tenantId,
    orgId: input.principal.orgId,
    workspaceId: input.principal.workspaceId,
    userId: input.principal.userId,
    roleKeys: input.principal.roleKeys,
  };
}

function toGatewayInput(
  input: InternalAssistantStreamRequest,
): Omit<StartAssistantStreamInput, "routeId" | "actingPrincipal"> {
  return {
    assistantKey: input.assistantKey,
    conversationId: input.conversationId,
    turnId: input.turnId,
    prompt: input.prompt,
    idempotencyKey: input.idempotencyKey,
    ...(input.sessionRef === undefined ? {} : { sessionRef: input.sessionRef }),
  };
}

function normalizeEvent(event: OpenClawStreamEvent): InternalAssistantStreamEvent | null {
  if (
    event.type === "queued" ||
    event.type === "delta" ||
    event.type === "tool.started" ||
    event.type === "tool.call"
  ) {
    return event;
  }

  if (event.type === "tool.completed") {
    return {
      type: "tool.succeeded",
      turnId: event.turnId,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      output: event.output,
    };
  }

  if (event.type === "final") {
    return {
      type: "assistant.final",
      turnId: event.turnId,
      content: event.content,
      ...(event.sessionRef === undefined ? {} : { sessionRef: event.sessionRef }),
      ...(event.runRef === undefined ? {} : { runRef: event.runRef }),
    };
  }

  if (event.type === "failed") {
    return {
      type: "failed",
      turnId: event.turnId,
      code: event.code,
      message: event.message,
    };
  }

  if (event.type === "approval.requested") {
    return null;
  }

  return null;
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function writeSse(response: ServerResponse, event: InternalAssistantStreamEvent): void {
  response.write(`event: ${event.type}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

function sanitizedError(error: unknown): { readonly code: string; readonly message: string } {
  if (typeof error === "object" && error !== null) {
    const code = (error as { readonly code?: unknown }).code;
    const message = (error as { readonly message?: unknown }).message;
    return {
      code: typeof code === "string" ? code : "gatewayBroker.requestFailed",
      message:
        typeof message === "string" && message.trim() !== ""
          ? message
          : "Gateway broker request failed.",
    };
  }

  return { code: "gatewayBroker.requestFailed", message: "Gateway broker request failed." };
}

async function handleAssistantStream(
  request: IncomingMessage,
  response: ServerResponse,
  options: BrokerInternalHttpServerOptions,
): Promise<void> {
  if (!authenticated(request, options.internalToken)) {
    writeJson(response, 401, { error: "unauthorized" });
    return;
  }

  let body: unknown;
  try {
    body = await readJsonBody(request, options.maxBodyBytes ?? defaultMaxBodyBytes);
  } catch {
    writeJson(response, 400, { error: "invalid_request" });
    return;
  }

  const parsed = parseInternalRequest(body);
  if (parsed === null) {
    writeJson(response, 400, { error: "invalid_request" });
    return;
  }

  // The internal token authenticates its holder, not the principal claims in
  // this body. The holder can assert any tenant; binding the asserted principal
  // to the route prevents accidental omission, not impersonation by that holder.
  response.writeHead(200, {
    "cache-control": "no-store, no-transform",
    connection: "keep-alive",
    "content-type": "text/event-stream; charset=utf-8",
    "x-accel-buffering": "no",
  });

  const route = await options.gatewayPort.forPrincipal({
    routeId: parsed.routeId,
    actingPrincipal: toActingPrincipal(parsed),
  });
  if (!route.ok) {
    writeSse(response, {
      type: "failed",
      turnId: parsed.turnId,
      ...sanitizedError(route.error),
    });
    response.end();
    return;
  }

  const receipt = await route.value.startAssistantStream(toGatewayInput(parsed));
  if (!receipt.ok) {
    writeSse(response, {
      type: "failed",
      turnId: parsed.turnId,
      ...sanitizedError(receipt.error),
    });
    response.end();
    return;
  }

  try {
    for await (const event of receipt.value.events) {
      const normalized = normalizeEvent(event);
      if (normalized !== null) {
        writeSse(response, normalized);
      }
    }
  } catch (error) {
    writeSse(response, {
      type: "failed",
      turnId: parsed.turnId,
      ...sanitizedError(error),
    });
  } finally {
    response.end();
  }
}

async function handleGatewayHealth(
  request: IncomingMessage,
  response: ServerResponse,
  options: BrokerInternalHttpServerOptions,
): Promise<void> {
  if (!authenticated(request, options.internalToken)) {
    writeJson(response, 401, { error: "unauthorized" });
    return;
  }

  let routeId: string | null = null;
  try {
    const url = new URL(request.url ?? "", "http://gateway-broker.internal");
    routeId = stringValue(url.searchParams.get("routeId"));
  } catch {
    routeId = null;
  }

  if (routeId === null) {
    writeJson(response, 400, { error: "invalid_request" });
    return;
  }

  const health = await options.gatewayPort.getHealthForOps(routeId as OpenClawGatewayRouteId);
  if (!health.ok) {
    writeJson(response, 503, sanitizedError(health.error));
    return;
  }

  writeJson(response, 200, health.value);
}

export function createBrokerInternalHttpServer(
  options: BrokerInternalHttpServerOptions,
): http.Server {
  return http.createServer((request, response) => {
    if (request.method === "GET" && request.url === "/healthz") {
      writeJson(response, 200, { status: "ok" });
      return;
    }

    if (request.method === "GET" && request.url?.startsWith("/internal/gateway/health")) {
      void handleGatewayHealth(request, response, options).catch((error) => {
        if (!response.headersSent) {
          writeJson(response, 500, sanitizedError(error));
          return;
        }

        response.end();
      });
      return;
    }

    if (request.method !== "POST" || request.url !== "/internal/assistant/stream") {
      writeJson(response, 404, { error: "not_found" });
      return;
    }

    void handleAssistantStream(request, response, options).catch((error) => {
      if (!response.headersSent) {
        writeJson(response, 500, sanitizedError(error));
        return;
      }

      writeSse(response, {
        type: "failed",
        ...sanitizedError(error),
      });
      response.end();
    });
  });
}
