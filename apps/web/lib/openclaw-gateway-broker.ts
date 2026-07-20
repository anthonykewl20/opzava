import type {
  OpenClawAuditActivityFilters,
  OpenClawAuditActivityPage,
  OpenClawAuditEvent,
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

function auditEndpoint(baseUrl: string): string {
  return new URL("/internal/audit/activity", baseUrl).toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key));
}

function safeString(value: unknown, max = 2048): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

const AUDIT_STATUSES = [
  "started",
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
  "blocked",
  "unknown",
] as const;
const INBOUND_REASON_CODES = {
  completed: new Set([
    "fast_abort",
    "plugin_bound_handled",
    "plugin_bound_unavailable",
    "plugin_bound_declined",
    "before_dispatch_handled",
    "acp_dispatch_completed",
    "acp_dispatch_empty",
  ]),
  skipped: new Set([
    "duplicate",
    "reply_operation_active",
    "reply_operation_aborted",
    "acp_dispatch_aborted",
  ]),
  failed: new Set(["acp_dispatch_failed", "plugin_bound_error"]),
};
const OUTBOUND_SUPPRESSED_REASONS = new Set([
  "cancelled_by_message_sending_hook",
  "cancelled_by_reply_payload_sending_hook",
  "empty_after_message_sending_hook",
  "empty_after_reply_payload_sending_hook",
  "no_visible_payload",
]);
const COMMON_AUDIT_KEYS = [
  "eventType",
  "eventId",
  "sequence",
  "sourceSequence",
  "occurredAt",
  "action",
  "status",
];

function parseAuditEvent(value: unknown): OpenClawAuditEvent | null {
  if (
    !isRecord(value) ||
    !safeString(value["eventId"]) ||
    !Number.isSafeInteger(value["sequence"]) ||
    (value["sequence"] as number) < 1 ||
    !Number.isSafeInteger(value["sourceSequence"]) ||
    (value["sourceSequence"] as number) < 1 ||
    !Number.isSafeInteger(value["occurredAt"]) ||
    (value["occurredAt"] as number) < 0 ||
    !safeString(value["action"]) ||
    !AUDIT_STATUSES.includes(value["status"] as (typeof AUDIT_STATUSES)[number])
  )
    return null;
  const eventType = value["eventType"];
  const common = {
    eventId: value["eventId"],
    sequence: value["sequence"] as number,
    sourceSequence: value["sourceSequence"] as number,
    occurredAt: value["occurredAt"] as number,
    action: value["action"],
    status: value["status"] as OpenClawAuditEvent["status"],
  };
  if (eventType === "agent_run") {
    if (
      !exactKeys(value, [...COMMON_AUDIT_KEYS, "agentId", "runId", "errorCode"]) ||
      !safeString(value["agentId"]) ||
      !safeString(value["runId"]) ||
      (value["errorCode"] !== undefined && !safeString(value["errorCode"]))
    )
      return null;
    const errors: Record<string, string | undefined> = {
      succeeded: undefined,
      failed: "run_failed",
      cancelled: "run_cancelled",
      timed_out: "run_timed_out",
      blocked: "run_blocked",
    };
    if (!(
      (value["action"] === "agent.run.started" &&
        value["status"] === "started" &&
        value["errorCode"] === undefined) ||
      (value["action"] === "agent.run.finished" &&
        typeof value["status"] === "string" &&
        value["status"] in errors &&
        value["errorCode"] === errors[value["status"]])
    ))
      return null;
    return {
      ...common,
      eventType,
      agentId: value["agentId"],
      runId: value["runId"],
      ...(value["errorCode"] === undefined ? {} : { errorCode: value["errorCode"] }),
    };
  }
  if (eventType === "tool_action") {
    if (
      !exactKeys(value, [...COMMON_AUDIT_KEYS, "agentId", "runId", "toolName", "errorCode"]) ||
      !safeString(value["agentId"]) ||
      !safeString(value["runId"]) ||
      (value["toolName"] !== undefined && !safeString(value["toolName"])) ||
      (value["errorCode"] !== undefined && !safeString(value["errorCode"]))
    )
      return null;
    const errors: Record<string, string | undefined> = {
      succeeded: undefined,
      failed: "tool_failed",
      cancelled: "tool_cancelled",
      timed_out: "tool_timed_out",
      blocked: "tool_blocked",
      unknown: "tool_outcome_unknown",
    };
    if (!(
      (value["action"] === "tool.action.started" &&
        value["status"] === "started" &&
        value["errorCode"] === undefined) ||
      (value["action"] === "tool.action.finished" &&
        typeof value["status"] === "string" &&
        value["status"] in errors &&
        value["errorCode"] === errors[value["status"]])
    ))
      return null;
    return {
      ...common,
      eventType,
      agentId: value["agentId"],
      runId: value["runId"],
      ...(value["toolName"] === undefined ? {} : { toolName: value["toolName"] }),
      ...(value["errorCode"] === undefined ? {} : { errorCode: value["errorCode"] }),
    };
  }
  if (eventType !== "inbound_message" && eventType !== "outbound_message") return null;
  const optionalKeys = ["agentId", "runId", "durationMs", "resultCount", "reasonCode", "errorCode"];
  const variantKeys =
    eventType === "outbound_message"
      ? [...optionalKeys, "deliveryKind", "failureStage"]
      : optionalKeys;
  if (
    !exactKeys(value, [
      ...COMMON_AUDIT_KEYS,
      "channel",
      "conversationKind",
      "outcome",
      ...variantKeys,
    ]) ||
    !safeString(value["channel"], 128) ||
    !["direct", "group", "channel", "unknown"].includes(value["conversationKind"] as string) ||
    !safeString(value["outcome"]) ||
    ["agentId", "runId", "reasonCode", "errorCode"].some(
      (key) => value[key] !== undefined && !safeString(value[key]),
    ) ||
    ["durationMs", "resultCount"].some(
      (key) =>
        value[key] !== undefined &&
        (!Number.isSafeInteger(value[key]) || (value[key] as number) < 0),
    )
  )
    return null;
  const optional = {
    ...(value["agentId"] === undefined ? {} : { agentId: value["agentId"] as string }),
    ...(value["runId"] === undefined ? {} : { runId: value["runId"] as string }),
    ...(value["durationMs"] === undefined ? {} : { durationMs: value["durationMs"] as number }),
    ...(value["resultCount"] === undefined ? {} : { resultCount: value["resultCount"] as number }),
    ...(value["reasonCode"] === undefined ? {} : { reasonCode: value["reasonCode"] as string }),
    ...(value["errorCode"] === undefined ? {} : { errorCode: value["errorCode"] as string }),
  };
  if (eventType === "inbound_message") {
    if (!["completed", "skipped", "failed"].includes(value["outcome"] as string)) return null;
    const reason = value["reasonCode"];
    if (
      value["action"] !== "message.inbound.processed" ||
      !(
        (value["status"] === "succeeded" &&
          value["outcome"] === "completed" &&
          value["errorCode"] === undefined &&
          (reason === undefined || INBOUND_REASON_CODES.completed.has(reason as string))) ||
        (value["status"] === "blocked" &&
          value["outcome"] === "skipped" &&
          value["errorCode"] === undefined &&
          (reason === undefined || INBOUND_REASON_CODES.skipped.has(reason as string))) ||
        (value["status"] === "failed" &&
          value["outcome"] === "failed" &&
          value["errorCode"] === "message_processing_failed" &&
          (reason === undefined || INBOUND_REASON_CODES.failed.has(reason as string)))
      )
    )
      return null;
    return {
      ...common,
      eventType,
      channel: value["channel"],
      conversationKind: value["conversationKind"] as "direct" | "group" | "channel" | "unknown",
      outcome: value["outcome"] as "completed" | "skipped" | "failed",
      ...optional,
    };
  }
  if (
    !["sent", "suppressed", "failed", "unknown"].includes(value["outcome"] as string) ||
    (value["deliveryKind"] !== undefined &&
      !["text", "media", "other"].includes(value["deliveryKind"] as string)) ||
    (value["failureStage"] !== undefined &&
      !["platform_send", "queue", "unknown"].includes(value["failureStage"] as string))
  )
    return null;
  if (
    value["action"] !== "message.outbound.finished" ||
    !(
      (value["status"] === "succeeded" &&
        value["outcome"] === "sent" &&
        value["errorCode"] === undefined &&
        value["reasonCode"] === undefined &&
        value["failureStage"] === undefined) ||
      (value["status"] === "blocked" &&
        value["outcome"] === "suppressed" &&
        typeof value["reasonCode"] === "string" &&
        OUTBOUND_SUPPRESSED_REASONS.has(value["reasonCode"]) &&
        value["errorCode"] === undefined &&
        value["failureStage"] === undefined &&
        value["deliveryKind"] === undefined) ||
      (value["status"] === "failed" &&
        value["outcome"] === "failed" &&
        ["message_delivery_failed", "message_delivery_partial_failure"].includes(
          value["errorCode"] as string,
        ) &&
        value["failureStage"] !== undefined &&
        value["reasonCode"] === undefined) ||
      (value["status"] === "unknown" &&
        value["outcome"] === "unknown" &&
        value["failureStage"] !== undefined &&
        value["errorCode"] === undefined &&
        value["reasonCode"] === undefined &&
        value["deliveryKind"] === undefined)
    )
  )
    return null;
  return {
    ...common,
    eventType,
    channel: value["channel"],
    conversationKind: value["conversationKind"] as "direct" | "group" | "channel" | "unknown",
    outcome: value["outcome"] as "sent" | "suppressed" | "failed" | "unknown",
    ...optional,
    ...(value["deliveryKind"] === undefined
      ? {}
      : { deliveryKind: value["deliveryKind"] as "text" | "media" | "other" }),
    ...(value["failureStage"] === undefined
      ? {}
      : { failureStage: value["failureStage"] as "platform_send" | "queue" | "unknown" }),
  };
}

export function parseAuditActivityPage(
  payload: unknown,
  limit: number,
): OpenClawAuditActivityPage | null {
  if (
    !isRecord(payload) ||
    !exactKeys(payload, ["events", "nextCursor"]) ||
    !Array.isArray(payload["events"]) ||
    payload["events"].length > limit ||
    payload["events"].length > 500 ||
    (payload["nextCursor"] !== undefined && !safeString(payload["nextCursor"], 512))
  )
    return null;
  const events = payload["events"].map(parseAuditEvent);
  if (events.some((event) => event === null)) return null;
  return {
    events: events as OpenClawAuditEvent[],
    ...(payload["nextCursor"] === undefined ? {} : { nextCursor: payload["nextCursor"] as string }),
  };
}

async function readBoundedJson(response: Response, maxBytes = 64 * 1024): Promise<unknown> {
  if (response.body === null) throw new Error("empty-response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error("response-body-too-large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
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

        async auditActivityList(
          filters: OpenClawAuditActivityFilters,
        ): Promise<Result<OpenClawAuditActivityPage>> {
          let response: Response;
          try {
            response = await fetchImpl(auditEndpoint(config.baseUrl), {
              method: "POST",
              headers: {
                accept: "application/json",
                authorization: `Bearer ${config.internalToken}`,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                routeId: binding.routeId,
                principal: { tenantId: binding.actingPrincipal.tenantId },
                filters,
              }),
              cache: "no-store",
            });
          } catch (error) {
            return err(
              gatewayError(
                "webGateway.gatewayUnavailable",
                "Gateway broker audit endpoint is unreachable.",
                undefined,
                error,
              ),
            );
          }
          if (!response.ok) {
            const code =
              response.status === 501
                ? "webGateway.auditUnsupported"
                : response.status === 503
                  ? "webGateway.gatewayUnavailable"
                  : response.status === 401
                    ? "webGateway.internalUnauthorized"
                    : response.status === 403
                      ? "webGateway.tenantMismatch"
                      : "webGateway.requestFailed";
            return err(
              gatewayError(code, "Gateway broker audit request failed.", {
                status: response.status,
              }),
            );
          }
          let payload: unknown;
          try {
            payload = await readBoundedJson(response);
          } catch (error) {
            return err(
              gatewayError(
                "webGateway.invalidAuditPayload",
                "Gateway broker returned an invalid audit response.",
                undefined,
                error,
              ),
            );
          }
          const page = parseAuditActivityPage(payload, filters.limit ?? 100);
          return page === null
            ? err(
                gatewayError(
                  "webGateway.invalidAuditPayload",
                  "Gateway broker returned an invalid audit response.",
                ),
              )
            : ok(page);
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
