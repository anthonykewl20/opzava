import type {
  ErrorCapturePort,
  OpenClawGatewayPort,
  OpenClawRunRef,
  OpenClawSessionRef,
  OpenClawStreamEvent,
  OpenClawToolCallId,
  StartAssistantStreamInput,
  StartAssistantStreamReceipt,
} from "@opzava/ports";
import type { AssistantTurn } from "@opzava/runtime-control";
import { toolExecutionContextFromSessionPrincipal } from "@opzava/runtime-control";
import {
  DomainError,
  makeOrgId,
  makeOpaqueExternalRef,
  makeWorkspaceId,
  ok,
  type Result,
} from "@opzava/shared-kernel";
import { describe, expect, it } from "vitest";

import {
  createAskAdminTurnPostHandler,
  type AskAdminTurnPostDependencies,
} from "../app/api/tasks/ask-admin/turn/route";
import { parseAskAdminSseBuffer } from "../lib/ask-admin-stream";
import type { AppSessionContext } from "../lib/session";

const context: AppSessionContext = {
  sessionId: "session-1",
  user: {
    id: "user-1",
    email: "admin@example.com",
    name: "Admin User",
  },
  orgId: "org-1",
  organizationName: "Opzava",
  organizationLifecycleState: "active",
  workspaceId: "workspace-1",
  workspaceName: "Admin",
  roleKeys: ["admin"],
};

const conversationId = "11111111-1111-4111-8111-111111111111";

function assistantTurn(overrides: Partial<AssistantTurn> = {}): AssistantTurn {
  return {
    id: "assistant-turn-1",
    conversationId,
    organizationId: "org-1" as AssistantTurn["organizationId"],
    workspaceId: "workspace-1" as AssistantTurn["workspaceId"],
    role: "assistant",
    status: "queued",
    actorUserId: null,
    assistantKey: "ask-admin-opzava",
    content: { text: "" },
    idempotencyKey: "assistant:idempotency-1",
    openclawSessionRef: null,
    openclawRunRef: null,
    createdAt: new Date("2026-07-02T00:00:00.000Z"),
    updatedAt: new Date("2026-07-02T00:00:00.000Z"),
    finalizedAt: null,
    ...overrides,
  };
}

function userTurn(): AssistantTurn {
  return {
    ...assistantTurn({
      id: "user-turn-1",
      role: "user",
      status: "final",
      actorUserId: "user-1" as AssistantTurn["actorUserId"],
      assistantKey: null,
      content: { text: "Create a task" },
      idempotencyKey: "user:idempotency-1",
      finalizedAt: new Date("2026-07-02T00:00:00.000Z"),
    }),
  };
}

async function* streamEvents(
  events: readonly OpenClawStreamEvent[],
): AsyncIterable<OpenClawStreamEvent> {
  for (const event of events) {
    yield event;
  }
}

function sessionRef(value = "conversation-1"): OpenClawSessionRef {
  return makeOpaqueExternalRef({
    system: "openclaw",
    kind: "session",
    value,
  }) as OpenClawSessionRef;
}

function gatewayPort(
  events: readonly OpenClawStreamEvent[],
  capture?: (input: StartAssistantStreamInput) => void,
): OpenClawGatewayPort {
  return {
    async forPrincipal(binding) {
      return ok({
        async startAssistantStream(
          input: Omit<StartAssistantStreamInput, "routeId" | "actingPrincipal">,
        ): Promise<Result<StartAssistantStreamReceipt>> {
          capture?.({ ...input, ...binding });
          return ok({
            sessionRef: sessionRef(),
            events: streamEvents(events),
          });
        },
        async getEffectiveTools() {
          throw new Error("not used");
        },
        async auditActivityList() {
          throw new Error("not used");
        },
      });
    },
    async getHealthForOps() {
      throw new Error("not used");
    },
  };
}

function failingGatewayPort(error: DomainError): OpenClawGatewayPort {
  return {
    async forPrincipal() {
      return { ok: false, error };
    },
    async getHealthForOps() {
      throw new Error("not used");
    },
  };
}

function successfulRuntime(
  overrides: Partial<AskAdminTurnPostDependencies["runtime"]> = {},
): AskAdminTurnPostDependencies["runtime"] {
  return {
    appendUserTurn: async () => ok(userTurn()),
    startAssistantTurn: async () => ok(assistantTurn()),
    appendAssistantDelta: async () => ok(assistantTurn()),
    finalizeAssistantTurn: async () => ok(assistantTurn({ status: "final" })),
    failAssistantTurn: async () => ok(assistantTurn({ status: "failed" })),
    executeRuntimeControlTaskTool: async () => {
      throw new Error("not used");
    },
    toolExecutionContextFromSessionPrincipal,
    ...overrides,
  };
}

function capturedErrors(): {
  readonly captures: readonly Parameters<ErrorCapturePort["capture"]>[0][];
  readonly port: ErrorCapturePort;
} {
  const captures: Parameters<ErrorCapturePort["capture"]>[0][] = [];

  return {
    captures,
    port: {
      async capture(input) {
        captures.push(input);
        return ok(undefined);
      },
      async appendAudit() {
        return ok({ eventId: "test" });
      },
    },
  };
}

async function readEvents(response: Response) {
  const text = await response.text();
  return parseAskAdminSseBuffer(text).events;
}

describe("[fake-gateway] Ask Admin Tasks turn route", () => {
  it("streams queued, delta, finalizing, and one finalized assistant message", async () => {
    let capturedInput: StartAssistantStreamInput | null = null;
    let finalizeCalls = 0;
    let revalidateCalls = 0;
    const handler = createAskAdminTurnPostHandler({
      getSessionContext: async () => context,
      createGatewayPort: () =>
        gatewayPort(
          [
            { type: "delta", turnId: "assistant-turn-1", deltaText: "Created " },
            {
              type: "final",
              turnId: "assistant-turn-1",
              content: { text: "Created the task." },
              sessionRef: sessionRef(),
              runRef: makeOpaqueExternalRef({
                system: "openclaw",
                kind: "run",
                value: "run-1",
              }) as OpenClawRunRef,
            },
          ],
          (input) => {
            capturedInput = input;
          },
        ),
      runtime: {
        appendUserTurn: async () => ok(userTurn()),
        startAssistantTurn: async () => ok(assistantTurn()),
        appendAssistantDelta: async () =>
          ok(assistantTurn({ status: "streaming", content: { text: "Created " } })),
        finalizeAssistantTurn: async () => {
          finalizeCalls += 1;
          return ok(
            assistantTurn({
              status: "final",
              content: { text: "Created the task." },
              finalizedAt: new Date("2026-07-02T00:00:01.000Z"),
            }),
          );
        },
        failAssistantTurn: async () => ok(assistantTurn({ status: "failed" })),
        executeRuntimeControlTaskTool: async () => {
          throw new Error("not used");
        },
        toolExecutionContextFromSessionPrincipal,
      },
      revalidateTasks: () => {
        revalidateCalls += 1;
      },
    });

    const response = await handler(
      new Request("http://web.test/api/tasks/ask-admin/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId,
          prompt: "Create a task",
          idempotencyKey: "idempotency-1",
        }),
      }),
    );
    const events = await readEvents(response);

    expect(response.status).toBe(200);
    expect(events.map((event) => event.type)).toEqual([
      "queued",
      "delta",
      "finalizing",
      "assistant.final",
    ]);
    expect(events.at(-1)).toMatchObject({
      type: "assistant.final",
      text: "Created the task.",
      state: "completed",
    });
    expect(capturedInput).toMatchObject({
      conversationId,
      turnId: "assistant-turn-1",
      actingPrincipal: {
        tenantId: "org-1",
      },
    });
    expect(finalizeCalls).toBe(1);
    expect(revalidateCalls).toBe(1);
  });

  it("rejects non-UUID conversationId with invalid_request", async () => {
    const handler = createAskAdminTurnPostHandler({
      getSessionContext: async () => context,
      createGatewayPort: () => gatewayPort([]),
      runtime: successfulRuntime(),
      revalidateTasks: () => undefined,
    });

    const response = await handler(
      new Request("http://web.test/api/tasks/ask-admin/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: "conversation-1",
          prompt: "Create a task",
          idempotencyKey: "idempotency-1",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_request" });
  });

  it("maps idempotency collisions to a duplicate send stream state", async () => {
    const handler = createAskAdminTurnPostHandler({
      getSessionContext: async () => context,
      createGatewayPort: () => gatewayPort([]),
      runtime: {
        appendUserTurn: async () => ({
          ok: false,
          error: new DomainError({
            code: "runtimeControl.idempotencyConflict",
            message: "Idempotency key was reused with a different payload.",
          }),
        }),
        startAssistantTurn: async () => ok(assistantTurn()),
        appendAssistantDelta: async () => ok(assistantTurn()),
        finalizeAssistantTurn: async () => ok(assistantTurn({ status: "final" })),
        failAssistantTurn: async () => ok(assistantTurn({ status: "failed" })),
        executeRuntimeControlTaskTool: async () => {
          throw new Error("not used");
        },
        toolExecutionContextFromSessionPrincipal,
      },
      revalidateTasks: () => undefined,
    });

    const response = await handler(
      new Request("http://web.test/api/tasks/ask-admin/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId,
          prompt: "Create a different task",
          idempotencyKey: "idempotency-1",
        }),
      }),
    );

    await expect(readEvents(response)).resolves.toEqual([
      {
        type: "failed",
        code: "runtimeControl.idempotencyConflict",
        message: "Idempotency key was reused with a different payload.",
        state: "duplicate_send",
      },
    ]);
  });

  it("executes scripted task tool-call intents and streams the write-through DTO", async () => {
    let revalidateCalls = 0;
    const handler = createAskAdminTurnPostHandler({
      getSessionContext: async () => context,
      createGatewayPort: () =>
        gatewayPort([
          {
            type: "tool.call",
            turnId: "assistant-turn-1",
            toolCallId: "tool-call-create-task" as OpenClawToolCallId,
            toolName: "opzava_tasks_create",
            args: { title: "Scripted fake-lane task" },
          },
          {
            type: "final",
            turnId: "assistant-turn-1",
            content: { text: "Created Scripted fake-lane task." },
            sessionRef: sessionRef(),
          },
        ]),
      runtime: {
        appendUserTurn: async () => ok(userTurn()),
        startAssistantTurn: async () => ok(assistantTurn()),
        appendAssistantDelta: async () => ok(assistantTurn()),
        finalizeAssistantTurn: async () =>
          ok(
            assistantTurn({
              status: "final",
              content: { text: "Created Scripted fake-lane task." },
              finalizedAt: new Date("2026-07-02T00:00:01.000Z"),
            }),
          ),
        failAssistantTurn: async () => ok(assistantTurn({ status: "failed" })),
        executeRuntimeControlTaskTool: async () =>
          ok({
            status: "succeeded",
            toolName: "opzava_tasks_create",
            toolCallId: "tool-call-create-task",
            output: {
              kind: "tasks.create",
              task: {
                id: "task-created-1",
                organizationId: "org-1",
                workspaceId: "workspace-1",
                cardNumber: 1,
                title: "Scripted fake-lane task",
                description: "",
                status: "todo",
                priority: "normal",
                assigneeUserId: null,
                assigneeName: null,
                labels: [],
                position: 1,
                dueAt: null,
                provenanceSource: "ask-admin",
                provenanceExternalRef: null,
                createdAt: "2026-07-02T00:00:00.000Z",
                updatedAt: "2026-07-02T00:00:00.000Z",
              },
            },
            outcome: {
              id: "outcome-1",
              organizationId: makeOrgId("org-1"),
              workspaceId: makeWorkspaceId("workspace-1"),
              turnId: "assistant-turn-1",
              toolName: "opzava_tasks_create",
              toolCallId: "tool-call-create-task",
              idempotencyKey: "idempotency-1",
              status: "succeeded",
              requestSummary: { title: "Scripted fake-lane task" },
              resultSummary: {},
              targetRef: "task-created-1",
              createdAt: new Date("2026-07-02T00:00:00.000Z"),
              updatedAt: new Date("2026-07-02T00:00:00.000Z"),
              completedAt: new Date("2026-07-02T00:00:00.000Z"),
            },
          }),
        toolExecutionContextFromSessionPrincipal,
      },
      revalidateTasks: () => {
        revalidateCalls += 1;
      },
    });

    const response = await handler(
      new Request("http://web.test/api/tasks/ask-admin/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId,
          prompt: "Add a task called Scripted fake-lane task",
          idempotencyKey: "idempotency-1",
        }),
      }),
    );

    const events = await readEvents(response);

    expect(events.map((event) => event.type)).toEqual([
      "queued",
      "tool.started",
      "tool.succeeded",
      "finalizing",
      "assistant.final",
    ]);
    expect(events[2]).toMatchObject({
      type: "tool.succeeded",
      output: {
        kind: "tasks.create",
        task: {
          id: "task-created-1",
          title: "Scripted fake-lane task",
        },
      },
    });
    expect(revalidateCalls).toBe(2);
  });

  it("maps gateway-down failures to a deterministic visible state", async () => {
    const captured = capturedErrors();
    const handler = createAskAdminTurnPostHandler({
      getSessionContext: async () => context,
      createGatewayPort: () =>
        failingGatewayPort(
          new DomainError({
            code: "gatewayBroker.gatewayUnavailable",
            message: "OpenClaw Gateway is unavailable.",
          }),
        ),
      runtime: successfulRuntime(),
      errorCapture: captured.port,
      revalidateTasks: () => undefined,
    });

    const response = await handler(
      new Request("http://web.test/api/tasks/ask-admin/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId,
          prompt: "Create a task",
          idempotencyKey: "idempotency-1",
        }),
      }),
    );
    const events = await readEvents(response);

    expect(events.map((event) => event.type)).toEqual(["queued", "failed"]);
    expect(events.at(-1)).toMatchObject({
      type: "failed",
      code: "gatewayBroker.gatewayUnavailable",
      state: "gateway_unavailable",
    });
    expect(captured.captures).toHaveLength(1);
    expect(captured.captures[0]).toMatchObject({
      operation: "tasks.ask_admin.turn",
      code: "gatewayBroker.gatewayUnavailable",
      details: { state: "gateway_unavailable", turnId: "assistant-turn-1" },
    });
  });

  it("does not stream when the principal cannot obtain the tenant route handle", async () => {
    const captured = capturedErrors();
    const handler = createAskAdminTurnPostHandler({
      getSessionContext: async () => context,
      createGatewayPort: () =>
        failingGatewayPort(
          new DomainError({
            code: "gatewayBroker.tenantMismatch",
            message: "Gateway route tenant does not match the asserted principal.",
          }),
        ),
      runtime: successfulRuntime(),
      errorCapture: captured.port,
      revalidateTasks: () => undefined,
    });

    const response = await handler(
      new Request("http://web.test/api/tasks/ask-admin/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId,
          prompt: "Create a task",
          idempotencyKey: "idempotency-1",
        }),
      }),
    );
    const events = await readEvents(response);

    expect(events.map((event) => event.type)).toEqual(["queued", "failed"]);
    expect(events.at(-1)).toMatchObject({
      type: "failed",
      code: "gatewayBroker.tenantMismatch",
      state: "policy_denied",
    });
    expect(captured.captures[0]).toMatchObject({
      code: "gatewayBroker.tenantMismatch",
      details: { state: "policy_denied", turnId: "assistant-turn-1" },
    });
  });

  it("maps interrupted streams to gateway unavailable", async () => {
    const captured = capturedErrors();
    const handler = createAskAdminTurnPostHandler({
      getSessionContext: async () => context,
      createGatewayPort: () => gatewayPort([]),
      runtime: successfulRuntime(),
      errorCapture: captured.port,
      revalidateTasks: () => undefined,
    });

    const response = await handler(
      new Request("http://web.test/api/tasks/ask-admin/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId,
          prompt: "Create a task",
          idempotencyKey: "idempotency-1",
        }),
      }),
    );
    const events = await readEvents(response);

    expect(events.map((event) => event.type)).toEqual(["queued", "failed"]);
    expect(events.at(-1)).toMatchObject({
      type: "failed",
      code: "gatewayBroker.connectionClosed",
      state: "gateway_unavailable",
      message: "Gateway stream ended before a final assistant message.",
    });
    expect(captured.captures[0]).toMatchObject({
      code: "gatewayBroker.connectionClosed",
      details: { state: "gateway_unavailable", turnId: "assistant-turn-1" },
    });
  });

  it("maps policy denials to a deterministic visible state", async () => {
    const captured = capturedErrors();
    const handler = createAskAdminTurnPostHandler({
      getSessionContext: async () => context,
      createGatewayPort: () =>
        failingGatewayPort(
          new DomainError({
            code: "gatewayBroker.scopeMismatch",
            message: "OpenClaw Gateway returned disallowed scopes.",
          }),
        ),
      runtime: successfulRuntime(),
      errorCapture: captured.port,
      revalidateTasks: () => undefined,
    });

    const response = await handler(
      new Request("http://web.test/api/tasks/ask-admin/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId,
          prompt: "Create a task",
          idempotencyKey: "idempotency-1",
        }),
      }),
    );
    const events = await readEvents(response);

    expect(events.at(-1)).toMatchObject({
      type: "failed",
      code: "gatewayBroker.scopeMismatch",
      state: "policy_denied",
    });
    expect(captured.captures[0]).toMatchObject({
      code: "gatewayBroker.scopeMismatch",
      details: { state: "policy_denied", turnId: "assistant-turn-1" },
    });
  });

  it("surfaces the broker-sanitized failure message and records full detail server-side (#252)", async () => {
    const captured = capturedErrors();
    // This is the broker-sanitized payload for the live leak #1 — the raw JSON
    // blob was lifted to its inner semantic message at the ACL, so the BFF only
    // ever sees this clean, actionable text.
    const brokerSanitizedMessage =
      "The 'gpt-5.6-sol' model requires a newer version of Codex to use this model.";
    const handler = createAskAdminTurnPostHandler({
      getSessionContext: async () => context,
      createGatewayPort: () =>
        gatewayPort([
          {
            type: "failed",
            turnId: "assistant-turn-1",
            code: "openclaw.streamFailed",
            message: brokerSanitizedMessage,
          },
        ]),
      runtime: successfulRuntime(),
      errorCapture: captured.port,
      revalidateTasks: () => undefined,
    });

    const response = await handler(
      new Request("http://web.test/api/tasks/ask-admin/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId,
          prompt: "Create a task",
          idempotencyKey: "idempotency-1",
        }),
      }),
    );
    const events = await readEvents(response);

    // Semantic text surfaces; state is unchanged (this code is not transient).
    expect(events.at(-1)).toMatchObject({
      type: "failed",
      code: "openclaw.streamFailed",
      state: "failed",
      message: brokerSanitizedMessage,
    });
    // ErrorCapturePort records the full untruncated detail + the broker event
    // as the cause — sanitization is for the browser payload only.
    expect(captured.captures).toHaveLength(1);
    expect(captured.captures[0]).toMatchObject({
      code: "openclaw.streamFailed",
      message: brokerSanitizedMessage,
      details: { state: "failed", turnId: "assistant-turn-1" },
    });
    expect(captured.captures[0]?.cause).toMatchObject({
      type: "failed",
      code: "openclaw.streamFailed",
      message: brokerSanitizedMessage,
    });
  });

  it("substitutes the Opzava fallback when the broker collapses a failure to an empty message (#252)", async () => {
    const handler = createAskAdminTurnPostHandler({
      getSessionContext: async () => context,
      createGatewayPort: () =>
        gatewayPort([
          {
            type: "failed",
            turnId: "assistant-turn-1",
            code: "gatewayBroker.connectionClosed",
            message: "",
          },
        ]),
      runtime: successfulRuntime(),
      revalidateTasks: () => undefined,
    });

    const response = await handler(
      new Request("http://web.test/api/tasks/ask-admin/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId,
          prompt: "Create a task",
          idempotencyKey: "idempotency-1",
        }),
      }),
    );
    const events = await readEvents(response);

    expect(events.at(-1)).toMatchObject({
      type: "failed",
      code: "gatewayBroker.connectionClosed",
      state: "gateway_unavailable",
      message: "The assistant gateway is temporarily unavailable.",
    });
  });

  it("does not raw-passthrough a thrown non-DomainError to the browser (#252 catch-all)", async () => {
    const captured = capturedErrors();
    const leakyThrow = new Error(
      "unexpected status 401, url: https://api.openai.com/v1/responses, cf-ray: a1b22d857c3484a5",
    );
    const handler = createAskAdminTurnPostHandler({
      getSessionContext: async () => context,
      createGatewayPort: () => gatewayPort([]),
      runtime: {
        ...successfulRuntime(),
        appendUserTurn: async () => {
          throw leakyThrow;
        },
      },
      errorCapture: captured.port,
      revalidateTasks: () => undefined,
    });

    const response = await handler(
      new Request("http://web.test/api/tasks/ask-admin/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId,
          prompt: "Create a task",
          idempotencyKey: "idempotency-1",
        }),
      }),
    );
    const events = await readEvents(response);
    const failure = events.at(-1);

    expect(failure).toMatchObject({ type: "failed", state: "failed" });
    const message = (failure as { readonly message: string }).message;
    // A plain (non-DomainError) throw never surfaces its raw text; the Opzava
    // fallback is used instead, so no topology/vendor detail leaks.
    expect(message).toBe("Ask Admin Opzava could not complete the request.");
    expect(message).not.toContain("https://");
    expect(message).not.toContain("api.openai.com");
    expect(message).not.toContain("cf-ray");
    // Full detail is preserved server-side via the cause.
    expect(captured.captures[0]?.cause).toBe(leakyThrow);
  });

  it("surfaces a controlled tool-execution failure without raw-passthrough (#252 tool path)", async () => {
    const handler = createAskAdminTurnPostHandler({
      getSessionContext: async () => context,
      createGatewayPort: () =>
        gatewayPort([
          {
            type: "tool.call",
            turnId: "assistant-turn-1",
            toolCallId: "tool-call-create-task" as OpenClawToolCallId,
            toolName: "opzava_tasks_create",
            args: { title: "t" },
          },
          {
            type: "final",
            turnId: "assistant-turn-1",
            content: { text: "done" },
            sessionRef: sessionRef(),
          },
        ]),
      runtime: {
        ...successfulRuntime(),
        executeRuntimeControlTaskTool: async () =>
          ({
            ok: false,
            error: new DomainError({
              code: "runtimeControl.toolExecutionFailed",
              message: "The tasks tool is not permitted in this workspace.",
            }),
          }) as never,
      },
      revalidateTasks: () => undefined,
    });

    const response = await handler(
      new Request("http://web.test/api/tasks/ask-admin/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId,
          prompt: "Create a task",
          idempotencyKey: "idempotency-1",
        }),
      }),
    );
    const events = await readEvents(response);
    const toolFailed = events.find((event) => event.type === "tool.failed");

    expect(toolFailed).toMatchObject({
      type: "tool.failed",
      toolName: "opzava_tasks_create",
      state: "tool_running",
    });
    expect((toolFailed as { readonly message: string }).message).toBe(
      "The tasks tool is not permitted in this workspace.",
    );
  });
});
