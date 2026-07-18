import { createHash, timingSafeEqual } from "node:crypto";
import http, { type IncomingMessage, type ServerResponse } from "node:http";

import type {
  OpenClawGatewayPort,
  OpenClawGatewayRouteId,
  OpenClawSessionRef,
  OpenClawStreamEvent,
  StartAssistantStreamInput,
} from "@opzava/ports";
import type { TenantId } from "@opzava/shared-kernel";

import { sanitizeFailure } from "../acl/openclaw/errors.js";

interface AssertedPrincipalBlock {
  /**
   * The only principal field crossing the web→broker boundary. It is checked
   * against this broker's pinned tenant at route acquisition (connection-manager)
   * and again at the broker-internal boundary (operator-client); a caller whose
   * tenant does not match is rejected. No user/org/workspace/role identity is
   * accepted here: the BFF owns the verified session and all user-level
   * attribution. Correlate on the Opzava-generated `turnId`, never on a
   * caller-supplied identifier.
   */
  readonly tenantId: TenantId;
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
 * Reads the single principal field the broker accepts: `tenantId`. It is asserted
 * by a holder of the trusted internal token and is not proof of authority on its
 * own — the broker verifies it by requiring it to equal this instance's pinned
 * tenant (see the tenant checks in connection-manager and operator-client). Any
 * other keys in the body (e.g. from an older web build) are ignored, so they can
 * neither be consumed nor forwarded.
 */
function parseAssertedPrincipal(value: unknown): AssertedPrincipalBlock | null {
  if (!isRecord(value)) {
    return null;
  }

  const tenantId = stringValue(value["tenantId"]);

  if (tenantId === null) {
    return null;
  }

  return {
    tenantId: tenantId as TenantId,
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

function failedStreamEvent(turnId: string, error: unknown): OpenClawStreamEvent {
  // #252: every failure crossing the broker→BFF boundary is shaped through the
  // ACL sanitizer so the SSE `failed` event never carries raw upstream text.
  const failure = sanitizeFailure(error, "gatewayBroker.requestFailed", "Gateway broker request failed.");
  return {
    type: "failed",
    turnId,
    code: failure.code,
    message: failure.sanitizedMessage,
  };
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function writeSse(response: ServerResponse, event: OpenClawStreamEvent): void {
  response.write(`event: ${event.type}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

function sanitizedError(error: unknown): { readonly code: string; readonly message: string } {
  const failure = sanitizeFailure(error, "gatewayBroker.requestFailed", "Gateway broker request failed.");
  return { code: failure.code, message: failure.sanitizedMessage };
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

  // The internal token authenticates its holder, not the body. The only
  // principal field accepted is `tenantId`; binding it to the route rejects a
  // misroute to a foreign tenant (defence in depth — #199 caught a real one).
  // It is not impersonation defence: a holder of the internal token can act for
  // the tenant this broker fronts, and that is the accepted, inherent trust in
  // the BFF — nothing here defends against it. ADR-018 Option 3 (per-tenant
  // scoped tokens, deferred to the ADR-002 provisioning path) only limits the
  // fleet-wide blast radius of a *stolen* token; it does not change this trust.
  response.writeHead(200, {
    "cache-control": "no-store, no-transform",
    connection: "keep-alive",
    "content-type": "text/event-stream; charset=utf-8",
    "x-accel-buffering": "no",
  });

  // The SSE body speaks the canonical OpenClawStreamEvent vocabulary directly —
  // the BFF parses it back into the same type. The previous `normalizeEvent`
  // renamed `final`/`tool.completed` to `assistant.final`/`tool.succeeded` only
  // for the BFF's `toPortEvent` to rename them straight back, a closed
  // four-hop loop with no effect but three extra names to keep in sync (#165).
  // `approval.requested` is still dropped here: the admin chat does not surface
  // approvals over this stream, and the route handler ignores it anyway.
  try {
    const route = await options.gatewayPort.forPrincipal({
      routeId: parsed.routeId,
      actingPrincipal: toActingPrincipal(parsed),
    });
    if (!route.ok) {
      writeSse(response, failedStreamEvent(parsed.turnId, route.error));
      return;
    }

    const receipt = await route.value.startAssistantStream(toGatewayInput(parsed));
    if (!receipt.ok) {
      writeSse(response, failedStreamEvent(parsed.turnId, receipt.error));
      return;
    }

    for await (const event of receipt.value.events) {
      if (event.type === "approval.requested") {
        continue;
      }
      writeSse(response, event);
    }
  } catch (error) {
    writeSse(response, failedStreamEvent(parsed.turnId, error));
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

      // handleAssistantStream owns its own try/catch, so reaching here with
      // headers already sent is purely defensive. End the body; the client's
      // drain synthesizes the interrupt failure for the truncated stream.
      response.end();
    });
  });
}
