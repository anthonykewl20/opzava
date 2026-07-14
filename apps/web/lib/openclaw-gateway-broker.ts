import type {
  OpenClawGatewayHealthSnapshot,
  OpenClawGatewayPort,
  OpenClawGatewayRouteId,
  OpenClawRunRef,
  OpenClawSessionRef,
  OpenClawStreamEvent,
  OpenClawToolCallId,
  StartAssistantStreamInput,
  StartAssistantStreamReceipt,
  ToolInventorySnapshot,
} from "@opzava/ports";
import { DomainError, err, makeOpaqueExternalRef, ok, type Result } from "@opzava/shared-kernel";

interface BrokerGatewayConfig {
  readonly baseUrl: string;
  readonly internalToken: string;
  readonly principalSessionId: string;
  readonly fetchImpl?: typeof fetch;
}

type BrokerInternalStreamEvent =
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
      readonly toolCallId: string;
      readonly toolName: string;
    }
  | {
      readonly type: "tool.call";
      readonly turnId: string;
      readonly toolCallId: string;
      readonly toolName: string;
      readonly args: Readonly<Record<string, unknown>>;
    }
  | {
      readonly type: "tool.succeeded";
      readonly turnId: string;
      readonly toolCallId: string;
      readonly toolName: string;
      readonly output: Readonly<Record<string, unknown>>;
    }
  | {
      readonly type: "tool.failed";
      readonly turnId: string;
      readonly toolCallId: string;
      readonly toolName: string;
      readonly code: string;
      readonly message: string;
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

function parseEventBlock(block: string): BrokerInternalStreamEvent | null {
  const dataLine = block
    .split("\n")
    .map((line) => line.trimEnd())
    .find((line) => line.startsWith("data: "));
  if (dataLine === undefined) {
    return null;
  }

  try {
    return JSON.parse(dataLine.slice("data: ".length)) as BrokerInternalStreamEvent;
  } catch {
    return null;
  }
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

function toPortEvent(event: BrokerInternalStreamEvent): OpenClawStreamEvent {
  if (event.type === "tool.succeeded") {
    return {
      type: "tool.completed",
      turnId: event.turnId,
      toolCallId: event.toolCallId as OpenClawToolCallId,
      toolName: event.toolName,
      output: event.output,
    };
  }

  if (event.type === "assistant.final") {
    return {
      type: "final",
      turnId: event.turnId,
      content: event.content,
      ...(event.sessionRef === undefined ? {} : { sessionRef: event.sessionRef }),
      ...(event.runRef === undefined ? {} : { runRef: event.runRef }),
    };
  }

  if (event.type === "tool.failed") {
    return {
      type: "failed",
      turnId: event.turnId,
      code: event.code,
      message: event.message,
    };
  }

  if (event.type === "failed") {
    return {
      type: "failed",
      turnId: event.turnId ?? "unknown",
      code: event.code,
      message: event.message,
    };
  }

  if (event.type === "tool.call") {
    return {
      type: "tool.call",
      turnId: event.turnId,
      toolCallId: event.toolCallId as OpenClawToolCallId,
      toolName: event.toolName,
      args: event.args,
    };
  }

  return event.type === "tool.started"
    ? {
        type: "tool.started",
        turnId: event.turnId,
        toolCallId: event.toolCallId as OpenClawToolCallId,
        toolName: event.toolName,
      }
    : event;
}

async function* brokerEventStream(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<OpenClawStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }

    buffer += decoder.decode(chunk.value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const event = parseEventBlock(block);
      if (event !== null) {
        yield toPortEvent(event);
      }
    }
  }

  buffer += decoder.decode();
  if (buffer.trim() !== "") {
    const event = parseEventBlock(buffer);
    if (event !== null) {
      yield toPortEvent(event);
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
                  sessionId: config.principalSessionId,
                  tenantId: binding.actingPrincipal.tenantId,
                  orgId: binding.actingPrincipal.orgId,
                  workspaceId: binding.actingPrincipal.workspaceId,
                  userId: binding.actingPrincipal.userId,
                  roleKeys: binding.actingPrincipal.roleKeys,
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
