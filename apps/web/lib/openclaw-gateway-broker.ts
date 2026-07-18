import type {
  OpenClawGatewayHealthSnapshot,
  OpenClawGatewayPort,
  OpenClawGatewayRouteId,
  OpenClawSessionRef,
  OpenClawStreamEvent,
  StartAssistantStreamInput,
  StartAssistantStreamReceipt,
  ToolInventorySnapshot,
} from "@opzava/ports";
import { DomainError, err, makeOpaqueExternalRef, ok, type Result } from "@opzava/shared-kernel";

import { readSseFrames } from "./sse";

interface BrokerGatewayConfig {
  readonly baseUrl: string;
  readonly internalToken: string;
  readonly fetchImpl?: typeof fetch;
}

const OPENCLAW_STREAM_EVENT_TYPES = new Set<string>([
  "queued",
  "delta",
  "tool.started",
  "tool.call",
  "tool.completed",
  "approval.requested",
  "final",
  "failed",
]);

function parseOpenClawStreamEvent(data: string): OpenClawStreamEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const type = (parsed as { readonly type?: unknown }).type;
  if (typeof type !== "string" || !OPENCLAW_STREAM_EVENT_TYPES.has(type)) {
    return null;
  }

  return parsed as OpenClawStreamEvent;
}

function gatewayError(
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
  cause?: unknown,
): DomainError {
  return new DomainError({
    code,
    message,
    ...(details === undefined ? {} : { details }),
    ...(cause === undefined ? {} : { cause }),
  });
}

function streamEndpoint(baseUrl: string): string {
  return new URL("/internal/assistant/stream", baseUrl).toString();
}

function healthEndpoint(baseUrl: string, routeId: OpenClawGatewayRouteId): string {
  const url = new URL("/internal/gateway/health", baseUrl);
  url.searchParams.set("routeId", routeId);
  return url.toString();
}

function sessionRef(value: string): OpenClawSessionRef {
  return makeOpaqueExternalRef({
    system: "openclaw",
    kind: "session",
    value,
  }) as OpenClawSessionRef;
}

function parseHealthSnapshot(payload: unknown): OpenClawGatewayHealthSnapshot | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Readonly<Record<string, unknown>>;
  const routeId = record["routeId"];
  const reachable = record["reachable"];
  const circuitOpen = record["circuitOpen"];
  const checkedAt = record["checkedAt"];
  const degradedReason = record["degradedReason"];

  if (
    typeof routeId !== "string" ||
    typeof reachable !== "boolean" ||
    typeof circuitOpen !== "boolean" ||
    (typeof checkedAt !== "string" && !(checkedAt instanceof Date))
  ) {
    return null;
  }

  const checkedAtDate = checkedAt instanceof Date ? checkedAt : new Date(checkedAt);
  if (Number.isNaN(checkedAtDate.getTime())) {
    return null;
  }

  return {
    routeId: routeId as OpenClawGatewayRouteId,
    reachable,
    circuitOpen,
    checkedAt: checkedAtDate,
    ...(typeof degradedReason === "string" ? { degradedReason } : {}),
  };
}

async function* brokerEventStream(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<OpenClawStreamEvent> {
  // The broker's internal stream endpoint emits the OpenClawStreamEvent
  // vocabulary verbatim, so this yields each frame straight back into the port
  // type — no rename-and-unrename `toPortEvent` (#165).
  for await (const frame of readSseFrames(body)) {
    const event = parseOpenClawStreamEvent(frame.data);
    if (event !== null) {
      yield event;
    }
  }
}

export function createBrokerOpenClawGatewayPort(config: BrokerGatewayConfig): OpenClawGatewayPort {
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    async forPrincipal(binding) {
      return ok({
        async startAssistantStream(
          input: Omit<StartAssistantStreamInput, "routeId" | "actingPrincipal">,
        ): Promise<Result<StartAssistantStreamReceipt>> {
          let response: Response;
          try {
            response = await fetchImpl(streamEndpoint(config.baseUrl), {
              method: "POST",
              headers: {
                accept: "text/event-stream",
                authorization: `Bearer ${config.internalToken}`,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                routeId: binding.routeId,
                assistantKey: input.assistantKey,
                conversationId: input.conversationId,
                turnId: input.turnId,
                prompt: input.prompt,
                idempotencyKey: input.idempotencyKey,
                principal: {
                  tenantId: binding.actingPrincipal.tenantId,
                },
                ...(input.sessionRef === undefined ? {} : { sessionRef: input.sessionRef }),
              }),
            });
          } catch (error) {
            return err(
              gatewayError(
                "webGateway.gatewayUnavailable",
                "Gateway broker internal stream endpoint is unreachable.",
                undefined,
                error,
              ),
            );
          }

          if (!response.ok) {
            return err(
              gatewayError(
                response.status === 401
                  ? "webGateway.internalUnauthorized"
                  : "webGateway.requestFailed",
                "Gateway broker internal stream request failed.",
                { status: response.status },
              ),
            );
          }

          if (response.body === null) {
            return err(
              gatewayError(
                "webGateway.emptyStream",
                "Gateway broker returned an empty stream response.",
              ),
            );
          }

          return ok({
            sessionRef: input.sessionRef ?? sessionRef(input.conversationId),
            events: brokerEventStream(response.body),
          });
        },

        async getEffectiveTools(): Promise<Result<ToolInventorySnapshot>> {
          return err(
            gatewayError(
              "webGateway.unsupported",
              "The web Gateway adapter only supports assistant streaming.",
            ),
          );
        },
      });
    },

    async getHealthForOps(
      routeId: OpenClawGatewayRouteId,
    ): Promise<Result<OpenClawGatewayHealthSnapshot>> {
      let response: Response;
      try {
        response = await fetchImpl(healthEndpoint(config.baseUrl, routeId), {
          method: "GET",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${config.internalToken}`,
          },
        });
      } catch (error) {
        return err(
          gatewayError(
            "webGateway.gatewayUnavailable",
            "Gateway broker internal health endpoint is unreachable.",
            undefined,
            error,
          ),
        );
      }

      if (!response.ok) {
        return err(
          gatewayError(
            response.status === 401
              ? "webGateway.internalUnauthorized"
              : "webGateway.requestFailed",
            "Gateway broker internal health request failed.",
            { status: response.status },
          ),
        );
      }

      const snapshot = parseHealthSnapshot(await response.json());
      if (snapshot === null) {
        return err(
          gatewayError(
            "webGateway.invalidHealth",
            "Gateway broker returned an invalid health response.",
          ),
        );
      }

      return ok(snapshot);
    },
  };
}
