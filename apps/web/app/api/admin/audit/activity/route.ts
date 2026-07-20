import type {
  OpenClawAuditActivityFilters,
  OpenClawGatewayPort,
  OpenClawGatewayRouteId,
} from "@opzava/ports";
import { makeTenantId } from "@opzava/shared-kernel";

import { askAdminRouteId } from "@/lib/ask-admin-history";
import { readBrokerInternalEnv } from "@/lib/broker-internal-env";
import { createBrokerOpenClawGatewayPort } from "@/lib/openclaw-gateway-broker";
import { getAppSessionContext, type AppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export interface OpenClawAuditPostDependencies {
  readonly getSessionContext: (headers: Headers) => Promise<AppSessionContext | null>;
  readonly createGatewayPort: (context: AppSessionContext) => OpenClawGatewayPort;
}

function defaults(): OpenClawAuditPostDependencies {
  return {
    getSessionContext: getAppSessionContext,
    createGatewayPort: () => {
      const env = readBrokerInternalEnv();
      return createBrokerOpenClawGatewayPort({
        baseUrl: env.BROKER_INTERNAL_URL,
        internalToken: env.BROKER_INTERNAL_TOKEN,
      });
    },
  };
}

function response(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store, max-age=0" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, max: number): value is string | undefined {
  return (
    value === undefined || (typeof value === "string" && value.length > 0 && value.length <= max)
  );
}

function timestamp(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Date.parse(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseFilters(value: unknown): OpenClawAuditActivityFilters | null {
  if (!isRecord(value)) return null;
  const allowed = [
    "agent",
    "session",
    "run",
    "kind",
    "status",
    "direction",
    "channel",
    "after",
    "before",
    "limit",
    "cursor",
  ];
  if (Object.keys(value).some((key) => !allowed.includes(key))) return null;
  if (
    !boundedString(value["agent"], 2048) ||
    !boundedString(value["session"], 2048) ||
    !boundedString(value["run"], 2048) ||
    !boundedString(value["channel"], 128) ||
    !boundedString(value["cursor"], 512)
  )
    return null;
  if (
    value["kind"] !== undefined &&
    !["agent_run", "tool_action", "message"].includes(value["kind"] as string)
  )
    return null;
  if (
    value["status"] !== undefined &&
    !["started", "succeeded", "failed", "cancelled", "timed_out", "blocked", "unknown"].includes(
      value["status"] as string,
    )
  )
    return null;
  if (
    value["direction"] !== undefined &&
    value["direction"] !== "inbound" &&
    value["direction"] !== "outbound"
  )
    return null;
  const after = timestamp(value["after"]);
  const before = timestamp(value["before"]);
  if (
    after === null ||
    before === null ||
    (after !== undefined && before !== undefined && after > before)
  )
    return null;
  const limit = value["limit"] ?? 100;
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 500) return null;
  if (
    (value["direction"] !== undefined || value["channel"] !== undefined) &&
    value["kind"] !== undefined &&
    value["kind"] !== "message"
  )
    return null;
  if (value["session"] !== undefined && value["kind"] === "message") return null;
  return {
    ...(value as OpenClawAuditActivityFilters),
    ...(after === undefined ? {} : { after }),
    ...(before === undefined ? {} : { before }),
    limit: limit as number,
  };
}

async function readRequestJson(request: Request): Promise<unknown> {
  if (request.body === null) return {};
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 64 * 1024) {
      await reader.cancel();
      throw new Error("request-body-too-large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  return text === "" ? {} : JSON.parse(text);
}

function failureStatus(code: string): number {
  if (code === "webGateway.auditUnsupported" || code === "gatewayBroker.auditUnsupported")
    return 501;
  if (
    [
      "webGateway.gatewayUnavailable",
      "gatewayBroker.connectionClosed",
      "gatewayBroker.connectChallengeTimeout",
      "gatewayBroker.gatewayUnavailable",
      "gatewayBroker.circuitOpen",
      "gatewayBroker.requestTimeout",
    ].includes(code)
  )
    return 503;
  return 502;
}

export function createOpenClawAuditPostHandler(
  overrides: Partial<OpenClawAuditPostDependencies> = {},
) {
  return async function POST(request: Request): Promise<Response> {
    const deps = { ...defaults(), ...overrides };
    const context = await deps.getSessionContext(new Headers(request.headers));
    if (context === null) return response({ error: "unauthorized" }, 401);
    if (!context.roleKeys.some((role) => role === "owner" || role === "admin")) {
      return response({ error: "forbidden" }, 403);
    }
    let body: unknown;
    try {
      body = await readRequestJson(request);
    } catch {
      return response({ error: "invalid_request" }, 400);
    }
    const filters = parseFilters(body);
    if (filters === null) return response({ error: "invalid_request" }, 400);
    const gateway = deps.createGatewayPort(context);
    const route = await gateway.forPrincipal({
      routeId: askAdminRouteId as OpenClawGatewayRouteId,
      actingPrincipal: { tenantId: makeTenantId(context.orgId) },
    });
    if (!route.ok) return response({ error: "audit_unavailable" }, failureStatus(route.error.code));
    const page = await route.value.auditActivityList(filters);
    if (!page.ok) return response({ error: "audit_unavailable" }, failureStatus(page.error.code));
    return response(page.value);
  };
}

export const POST = createOpenClawAuditPostHandler();
