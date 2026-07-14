import type {
  ErrorCapturePort,
  OpenClawGatewayPort,
  OpenClawGatewayRouteId,
  OpenClawStreamEvent,
  StartAssistantStreamInput,
} from "@opzava/ports";
import type {
  AssistantTurn,
  RuntimeControlCrmToolExecution,
  RuntimeControlCrmToolName,
  RuntimeControlTaskToolExecution,
  ToolExecutionContext,
} from "@opzava/runtime-control";
import {
  appendAssistantDelta,
  appendUserTurn,
  executeRuntimeControlCrmTool,
  executeRuntimeControlTaskTool,
  failAssistantTurn,
  finalizeAssistantTurn,
  runtimeControlCrmToolNames,
  startAssistantTurn,
  toolExecutionContextFromSessionPrincipal,
} from "@opzava/runtime-control";
import { makeOrgId, makeTenantId, makeUserId, makeWorkspaceId } from "@opzava/shared-kernel";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { askAdminAssistantKey, askAdminRouteId } from "@/lib/ask-admin-history";
import type { AskAdminClientStreamEvent } from "@/lib/ask-admin-stream";
import { readBrokerInternalEnv } from "@/lib/broker-internal-env";
import { defaultErrorCapturePort } from "@/lib/error-capture";
import { createBrokerOpenClawGatewayPort } from "@/lib/openclaw-gateway-broker";
import { getAppSessionContext, type AppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  conversationId: z.string().trim().min(1).max(180),
  prompt: z.string().trim().min(1).max(4000),
  idempotencyKey: z.string().trim().min(1).max(120),
});

interface RuntimeControlServices {
  readonly appendUserTurn: typeof appendUserTurn;
  readonly startAssistantTurn: typeof startAssistantTurn;
  readonly appendAssistantDelta: typeof appendAssistantDelta;
  readonly finalizeAssistantTurn: typeof finalizeAssistantTurn;
  readonly failAssistantTurn: typeof failAssistantTurn;
  readonly executeRuntimeControlCrmTool: typeof executeRuntimeControlCrmTool;
  readonly executeRuntimeControlTaskTool: typeof executeRuntimeControlTaskTool;
  readonly toolExecutionContextFromSessionPrincipal: typeof toolExecutionContextFromSessionPrincipal;
}

type AskAdminToolExecution = RuntimeControlCrmToolExecution | RuntimeControlTaskToolExecution;

export interface AskAdminTurnPostDependencies {
  readonly getSessionContext: (headers: Headers) => Promise<AppSessionContext | null>;
  readonly createGatewayPort: (context: AppSessionContext) => OpenClawGatewayPort;
  readonly runtime: RuntimeControlServices;
  readonly errorCapture: ErrorCapturePort;
  readonly revalidateTasks: () => void;
}

const runtimeControlServices: RuntimeControlServices = {
  appendUserTurn,
  startAssistantTurn,
  appendAssistantDelta,
  finalizeAssistantTurn,
  failAssistantTurn,
  executeRuntimeControlCrmTool,
  executeRuntimeControlTaskTool,
  toolExecutionContextFromSessionPrincipal,
};

function defaultDependencies(): AskAdminTurnPostDependencies {
  return {
    getSessionContext: getAppSessionContext,
    createGatewayPort: (context) => {
      const brokerEnv = readBrokerInternalEnv();

      return createBrokerOpenClawGatewayPort({
        baseUrl: brokerEnv.BROKER_INTERNAL_URL,
        internalToken: brokerEnv.BROKER_INTERNAL_TOKEN,
        principalSessionId: context.sessionId,
      });
    },
    runtime: runtimeControlServices,
    errorCapture: defaultErrorCapturePort,
    revalidateTasks: () => revalidatePath("/tasks"),
  };
}

function actorFromContext(context: AppSessionContext) {
  return {
    userId: context.user.id,
    roleKeys: context.roleKeys,
  };
}

function assistantText(content: Readonly<Record<string, unknown>>): string {
  const text = content["text"];
  return typeof text === "string" ? text : "";
}

function errorCode(error: unknown, depth = 0): string | undefined {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return undefined;
  }

  const code = (error as { readonly code?: unknown }).code;
  return typeof code === "string"
    ? code
    : errorCode((error as { readonly cause?: unknown }).cause, depth + 1);
}

function errorStatus(error: unknown, depth = 0): number | undefined {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return undefined;
  }

  const status = (error as { readonly status?: unknown }).status;
  return typeof status === "number"
    ? status
    : errorStatus((error as { readonly cause?: unknown }).cause, depth + 1);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Ask Admin Opzava request failed.";
}

function failureState(
  code: string | undefined,
  status: number | undefined,
): "gateway_unavailable" | "policy_denied" | "duplicate_send" | "failed" {
  if (code === "runtimeControl.idempotencyConflict" || code === "gatewayBroker.sessionBusy") {
    return "duplicate_send";
  }

  if (
    status === 403 ||
    code === "runtimeControl.forbidden" ||
    code === "projectManagement.forbidden" ||
    code === "gatewayBroker.authModeForbidden" ||
    code === "gatewayBroker.authScopeMismatch" ||
    code === "gatewayBroker.scopeMismatch" ||
    code === "gatewayBroker.tenantMismatch" ||
    code === "gatewayBroker.toolInventoryMismatch" ||
    code === "webGateway.internalUnauthorized"
  ) {
    return "policy_denied";
  }

  if (
    code === "gatewayBroker.gatewayUnavailable" ||
    code === "gatewayBroker.circuitOpen" ||
    code === "gatewayBroker.connectionClosed" ||
    code === "webGateway.gatewayUnavailable" ||
    code === "webGateway.emptyStream" ||
    code === "webGateway.streamInterrupted"
  ) {
    return "gateway_unavailable";
  }

  return "failed";
}

function failureEvent(
  error: unknown,
  turnId?: string,
): Extract<AskAdminClientStreamEvent, { readonly type: "failed" }> {
  const code = errorCode(error) ?? "askAdmin.failed";
  return {
    type: "failed",
    ...(turnId === undefined ? {} : { turnId }),
    code,
    message: errorMessage(error),
    state: failureState(code, errorStatus(error)),
  };
}

function failureSeverity(
  state: Extract<AskAdminClientStreamEvent, { readonly type: "failed" }>["state"],
): "warning" | "error" {
  return state === "failed" ? "error" : "warning";
}

async function captureAskAdminFailure(
  deps: AskAdminTurnPostDependencies,
  context: AppSessionContext,
  failure: Extract<AskAdminClientStreamEvent, { readonly type: "failed" }>,
  cause?: unknown,
): Promise<void> {
  try {
    await deps.errorCapture.capture({
      source: "apps/web",
      operation: "tasks.ask_admin.turn",
      severity: failureSeverity(failure.state),
      code: failure.code,
      message: failure.message,
      tenantId: makeTenantId(context.orgId),
      orgId: makeOrgId(context.orgId),
      workspaceId: makeWorkspaceId(context.workspaceId),
      userId: makeUserId(context.user.id),
      details: {
        state: failure.state,
        ...(failure.turnId === undefined ? {} : { turnId: failure.turnId }),
      },
      ...(failure.turnId === undefined ? {} : { correlationId: failure.turnId }),
      ...(cause === undefined ? {} : { cause }),
    });
  } catch {
    // Error capture is an observability hook; it must not affect the user stream.
  }
}

async function writeFailureEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  deps: AskAdminTurnPostDependencies,
  context: AppSessionContext,
  failure: Extract<AskAdminClientStreamEvent, { readonly type: "failed" }>,
  cause?: unknown,
): Promise<void> {
  await captureAskAdminFailure(deps, context, failure, cause);
  writeEvent(controller, failure);
}

function encodeSse(event: AskAdminClientStreamEvent): Uint8Array {
  return new TextEncoder().encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

function writeEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: AskAdminClientStreamEvent,
): void {
  controller.enqueue(encodeSse(event));
}

async function safeFailAssistantTurn(
  runtime: RuntimeControlServices,
  context: AppSessionContext,
  turnId: string,
  failure: Extract<AskAdminClientStreamEvent, { readonly type: "failed" }>,
): Promise<void> {
  await runtime.failAssistantTurn({
    orgId: context.orgId,
    workspaceId: context.workspaceId,
    actor: actorFromContext(context),
    turnId,
    errorCode: failure.code,
    errorMessage: failure.message,
  });
}

function streamInput(
  conversationId: string,
  turnId: string,
  prompt: string,
  idempotencyKey: string,
): Omit<StartAssistantStreamInput, "routeId" | "actingPrincipal"> {
  return {
    assistantKey: askAdminAssistantKey,
    conversationId,
    turnId,
    prompt,
    idempotencyKey,
  };
}

function actingPrincipal(context: AppSessionContext): StartAssistantStreamInput["actingPrincipal"] {
  return {
    tenantId: context.orgId as StartAssistantStreamInput["actingPrincipal"]["tenantId"],
    orgId: context.orgId as StartAssistantStreamInput["actingPrincipal"]["orgId"],
    workspaceId: context.workspaceId as StartAssistantStreamInput["actingPrincipal"]["workspaceId"],
    userId: context.user.id as StartAssistantStreamInput["actingPrincipal"]["userId"],
    roleKeys: context.roleKeys,
  };
}

function completedEventFromTurn(
  turn: AssistantTurn,
): Extract<AskAdminClientStreamEvent, { readonly type: "assistant.final" }> {
  return {
    type: "assistant.final",
    turnId: turn.id,
    text: assistantText(turn.content),
    state: "completed",
  };
}

function isCrmToolName(toolName: string): toolName is RuntimeControlCrmToolName {
  return runtimeControlCrmToolNames.includes(toolName as RuntimeControlCrmToolName);
}

function toolFailureFromError(
  error: unknown,
  event: Extract<OpenClawStreamEvent, { readonly type: "tool.call" }>,
): Extract<AskAdminClientStreamEvent, { readonly type: "tool.failed" }> {
  return {
    type: "tool.failed",
    turnId: event.turnId,
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    code: errorCode(error) ?? "runtimeControl.toolExecutionFailed",
    message: errorMessage(error),
    state: "tool_running",
  };
}

function toolSucceededEvent(
  execution: Extract<AskAdminToolExecution, { readonly status: "succeeded" }>,
  event: Extract<OpenClawStreamEvent, { readonly type: "tool.call" }>,
): Extract<AskAdminClientStreamEvent, { readonly type: "tool.succeeded" }> {
  return {
    type: "tool.succeeded",
    turnId: event.turnId,
    toolCallId: execution.toolCallId,
    toolName: execution.toolName,
    output: execution.output as Readonly<Record<string, unknown>>,
    state: "tool_running",
  };
}

function toolFailedEvent(
  execution: Extract<AskAdminToolExecution, { readonly status: "failed" }>,
  event: Extract<OpenClawStreamEvent, { readonly type: "tool.call" }>,
): Extract<AskAdminClientStreamEvent, { readonly type: "tool.failed" }> {
  return {
    type: "tool.failed",
    turnId: event.turnId,
    toolCallId: execution.toolCallId,
    toolName: execution.toolName,
    code: execution.code,
    message: execution.message,
    state: "tool_running",
  };
}

async function handleGatewayEvent(
  event: OpenClawStreamEvent,
  controller: ReadableStreamDefaultController<Uint8Array>,
  context: AppSessionContext,
  toolContext: ToolExecutionContext,
  deps: AskAdminTurnPostDependencies,
): Promise<boolean> {
  const { runtime } = deps;

  if (event.type === "queued") {
    return false;
  }

  if (event.type === "delta") {
    const updated = await runtime.appendAssistantDelta({
      orgId: context.orgId,
      workspaceId: context.workspaceId,
      actor: actorFromContext(context),
      turnId: event.turnId,
      deltaText: event.deltaText,
    });
    if (!updated.ok) {
      const failure = failureEvent(updated.error, event.turnId);
      await safeFailAssistantTurn(runtime, context, event.turnId, failure);
      await writeFailureEvent(controller, deps, context, failure, updated.error);
      return true;
    }

    writeEvent(controller, {
      type: "delta",
      turnId: event.turnId,
      deltaText: event.deltaText,
      text: assistantText(updated.value.content),
      state: "working",
    });
    return false;
  }

  if (event.type === "tool.started") {
    writeEvent(controller, {
      type: "tool.started",
      turnId: event.turnId,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      state: "tool_running",
    });
    return false;
  }

  if (event.type === "tool.call") {
    writeEvent(controller, {
      type: "tool.started",
      turnId: event.turnId,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      state: "tool_running",
    });

    const execution = isCrmToolName(event.toolName)
      ? await runtime.executeRuntimeControlCrmTool({
          context: toolContext,
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          args: event.args,
        })
      : await runtime.executeRuntimeControlTaskTool({
          context: toolContext,
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          args: event.args,
        });

    if (!execution.ok) {
      writeEvent(controller, toolFailureFromError(execution.error, event));
      return false;
    }

    if (execution.value.status === "failed") {
      writeEvent(controller, toolFailedEvent(execution.value, event));
      return false;
    }

    writeEvent(controller, toolSucceededEvent(execution.value, event));
    deps.revalidateTasks();
    return false;
  }

  if (event.type === "tool.completed") {
    writeEvent(controller, {
      type: "tool.succeeded",
      turnId: event.turnId,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      output: event.output,
      state: "tool_running",
    });
    deps.revalidateTasks();
    return false;
  }

  if (event.type === "approval.requested") {
    return false;
  }

  if (event.type === "failed") {
    const failure: Extract<AskAdminClientStreamEvent, { readonly type: "failed" }> = {
      type: "failed",
      turnId: event.turnId,
      code: event.code,
      message: event.message,
      state: failureState(event.code, undefined),
    };
    await safeFailAssistantTurn(runtime, context, event.turnId, failure);
    await writeFailureEvent(controller, deps, context, failure);
    return true;
  }

  writeEvent(controller, {
    type: "finalizing",
    turnId: event.turnId,
    text: assistantText(event.content),
    state: "finalizing",
  });

  const finalized = await runtime.finalizeAssistantTurn({
    orgId: context.orgId,
    workspaceId: context.workspaceId,
    actor: actorFromContext(context),
    turnId: event.turnId,
    content: event.content,
    ...(event.sessionRef === undefined ? {} : { openclawSessionRef: event.sessionRef.value }),
    ...(event.runRef === undefined ? {} : { openclawRunRef: event.runRef.value }),
  });

  if (!finalized.ok) {
    await writeFailureEvent(
      controller,
      deps,
      context,
      failureEvent(finalized.error, event.turnId),
      finalized.error,
    );
    return true;
  }

  writeEvent(controller, completedEventFromTurn(finalized.value));
  deps.revalidateTasks();
  return true;
}

async function runAssistantStream(
  controller: ReadableStreamDefaultController<Uint8Array>,
  deps: AskAdminTurnPostDependencies,
  context: AppSessionContext,
  input: z.infer<typeof requestSchema>,
): Promise<void> {
  const actor = actorFromContext(context);
  const userTurn = await deps.runtime.appendUserTurn({
    orgId: context.orgId,
    workspaceId: context.workspaceId,
    actor,
    conversationId: input.conversationId,
    idempotencyKey: `user:${input.idempotencyKey}`,
    content: { text: input.prompt },
  });
  if (!userTurn.ok) {
    await writeFailureEvent(
      controller,
      deps,
      context,
      failureEvent(userTurn.error),
      userTurn.error,
    );
    return;
  }
  const userTurnValue = userTurn.value;

  const assistantTurn = await deps.runtime.startAssistantTurn({
    orgId: context.orgId,
    workspaceId: context.workspaceId,
    actor,
    conversationId: input.conversationId,
    idempotencyKey: `assistant:${input.idempotencyKey}`,
    assistantKey: askAdminAssistantKey,
    content: { text: "" },
  });
  if (!assistantTurn.ok) {
    await writeFailureEvent(
      controller,
      deps,
      context,
      failureEvent(assistantTurn.error),
      assistantTurn.error,
    );
    return;
  }
  const assistantTurnValue = assistantTurn.value;

  if (assistantTurnValue.status === "final") {
    writeEvent(controller, completedEventFromTurn(assistantTurnValue));
    return;
  }

  if (assistantTurnValue.status === "failed") {
    await writeFailureEvent(controller, deps, context, {
      type: "failed",
      turnId: assistantTurnValue.id,
      code: "runtimeControl.assistantTurnFailed",
      message: "Assistant turn already failed.",
      state: "failed",
    });
    return;
  }

  const toolContext = deps.runtime.toolExecutionContextFromSessionPrincipal({
    principal: {
      orgId: context.orgId,
      workspaceId: context.workspaceId,
      actor,
      sessionId: context.sessionId,
    },
    conversationId: input.conversationId,
    assistantTurnId: assistantTurnValue.id,
    commandIdempotencyKey: input.idempotencyKey,
  });
  if (!toolContext.ok) {
    const failure = failureEvent(toolContext.error, assistantTurnValue.id);
    await safeFailAssistantTurn(deps.runtime, context, assistantTurnValue.id, failure);
    await writeFailureEvent(controller, deps, context, failure, toolContext.error);
    return;
  }

  writeEvent(controller, {
    type: "queued",
    turnId: assistantTurnValue.id,
    userTurnId: userTurnValue.id,
    state: "queued",
  });

  const gatewayPort = deps.createGatewayPort(context);
  const gateway = await gatewayPort.forPrincipal({
    routeId: askAdminRouteId as OpenClawGatewayRouteId,
    actingPrincipal: actingPrincipal(context),
  });
  if (!gateway.ok) {
    const failure = failureEvent(gateway.error, assistantTurnValue.id);
    await safeFailAssistantTurn(deps.runtime, context, assistantTurnValue.id, failure);
    await writeFailureEvent(controller, deps, context, failure, gateway.error);
    return;
  }

  const receipt = await gateway.value.startAssistantStream(
    streamInput(
      input.conversationId,
      assistantTurnValue.id,
      input.prompt,
      `assistant:${input.idempotencyKey}`,
    ),
  );

  if (!receipt.ok) {
    const failure = failureEvent(receipt.error, assistantTurnValue.id);
    await safeFailAssistantTurn(deps.runtime, context, assistantTurnValue.id, failure);
    await writeFailureEvent(controller, deps, context, failure, receipt.error);
    return;
  }

  let sawTerminal = false;
  for await (const event of receipt.value.events) {
    sawTerminal = await handleGatewayEvent(event, controller, context, toolContext.value, deps);
    if (sawTerminal) {
      return;
    }
  }

  if (!sawTerminal) {
    const failure: Extract<AskAdminClientStreamEvent, { readonly type: "failed" }> = {
      type: "failed",
      turnId: assistantTurnValue.id,
      code: "gatewayBroker.connectionClosed",
      message: "Gateway stream ended before a final assistant message.",
      state: "gateway_unavailable",
    };
    await safeFailAssistantTurn(deps.runtime, context, assistantTurnValue.id, failure);
    await writeFailureEvent(controller, deps, context, failure);
  }
}

export function createAskAdminTurnPostHandler(
  dependencyOverrides: Partial<AskAdminTurnPostDependencies> = {},
) {
  return async function POST(request: Request): Promise<Response> {
    const deps = { ...defaultDependencies(), ...dependencyOverrides };
    const context = await deps.getSessionContext(new Headers(request.headers));

    if (context === null) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          await runAssistantStream(controller, deps, context, parsed.data);
        } catch (error) {
          await writeFailureEvent(controller, deps, context, failureEvent(error), error);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "cache-control": "no-store, no-transform",
        "content-type": "text/event-stream; charset=utf-8",
        "x-accel-buffering": "no",
      },
    });
  };
}

export const POST = createAskAdminTurnPostHandler();
