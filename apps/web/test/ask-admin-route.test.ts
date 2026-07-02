import type {
  OpenClawGatewayHealthSnapshot,
  OpenClawGatewayPort,
  OpenClawRunRef,
  OpenClawSessionRef,
  OpenClawStreamEvent,
  OpenClawToolCallId,
  StartAssistantStreamInput,
  StartAssistantStreamReceipt,
  ToolInventorySnapshot
} from "@opzava/ports";
import type { AssistantTurn } from "@opzava/runtime-control";
import { toolExecutionContextFromSessionPrincipal } from "@opzava/runtime-control";
import {
  DomainError,
  makeOrgId,
  makeOpaqueExternalRef,
  makeWorkspaceId,
  ok,
  type Result
} from "@opzava/shared-kernel";
import { describe, expect, it } from "vitest";

import { createAskAdminTurnPostHandler } from "../app/api/tasks/ask-admin/turn/route";
import { parseAskAdminSseBuffer } from "../lib/ask-admin-stream";
import type { AppSessionContext } from "../lib/session";

const context: AppSessionContext = {
  sessionId: "session-1",
  user: {
    id: "user-1",
    email: "admin@example.com",
    name: "Admin User"
  },
  orgId: "org-1",
  organizationName: "Opzava",
  organizationLifecycleState: "active",
  workspaceId: "workspace-1",
  workspaceName: "Admin",
  roleKeys: ["admin"]
};

function assistantTurn(overrides: Partial<AssistantTurn> = {}): AssistantTurn {
  return {
    id: "assistant-turn-1",
    conversationId: "conversation-1",
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
    ...overrides
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
      finalizedAt: new Date("2026-07-02T00:00:00.000Z")
    })
  };
}

async function* streamEvents(
  events: readonly OpenClawStreamEvent[]
): AsyncIterable<OpenClawStreamEvent> {
  for (const event of events) {
    yield event;
  }
}

function sessionRef(value = "conversation-1"): OpenClawSessionRef {
  return makeOpaqueExternalRef({
    system: "openclaw",
    kind: "session",
    value
  }) as OpenClawSessionRef;
}

function gatewayPort(
  events: readonly OpenClawStreamEvent[],
  capture?: (input: StartAssistantStreamInput) => void
): OpenClawGatewayPort {
  return {
    async startAssistantStream(
      input: StartAssistantStreamInput
    ): Promise<Result<StartAssistantStreamReceipt>> {
      capture?.(input);
      return ok({
        sessionRef: sessionRef(),
        events: streamEvents(events)
      });
    },
    async getEffectiveTools(): Promise<Result<ToolInventorySnapshot>> {
      throw new Error("not used");
    },
    async getHealth(): Promise<Result<OpenClawGatewayHealthSnapshot>> {
      throw new Error("not used");
    }
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
                value: "run-1"
              }) as OpenClawRunRef
            }
          ],
          (input) => {
            capturedInput = input;
          }
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
              finalizedAt: new Date("2026-07-02T00:00:01.000Z")
            })
          );
        },
        failAssistantTurn: async () => ok(assistantTurn({ status: "failed" })),
        executeRuntimeControlTaskTool: async () => {
          throw new Error("not used");
        },
        toolExecutionContextFromSessionPrincipal
      },
      revalidateTasks: () => {
        revalidateCalls += 1;
      }
    });

    const response = await handler(
      new Request("http://web.test/api/tasks/ask-admin/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: "conversation-1",
          prompt: "Create a task",
          idempotencyKey: "idempotency-1"
        })
      })
    );
    const events = await readEvents(response);

    expect(response.status).toBe(200);
    expect(events.map((event) => event.type)).toEqual([
      "queued",
      "delta",
      "finalizing",
      "assistant.final"
    ]);
    expect(events.at(-1)).toMatchObject({
      type: "assistant.final",
      text: "Created the task.",
      state: "completed"
    });
    expect(capturedInput).toMatchObject({
      conversationId: "conversation-1",
      turnId: "assistant-turn-1",
      actingPrincipal: {
        tenantId: "org-1",
        orgId: "org-1",
        workspaceId: "workspace-1",
        userId: "user-1"
      }
    });
    expect(finalizeCalls).toBe(1);
    expect(revalidateCalls).toBe(1);
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
            message: "Idempotency key was reused with a different payload."
          })
        }),
        startAssistantTurn: async () => ok(assistantTurn()),
        appendAssistantDelta: async () => ok(assistantTurn()),
        finalizeAssistantTurn: async () => ok(assistantTurn({ status: "final" })),
        failAssistantTurn: async () => ok(assistantTurn({ status: "failed" })),
        executeRuntimeControlTaskTool: async () => {
          throw new Error("not used");
        },
        toolExecutionContextFromSessionPrincipal
      },
      revalidateTasks: () => undefined
    });

    const response = await handler(
      new Request("http://web.test/api/tasks/ask-admin/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: "conversation-1",
          prompt: "Create a different task",
          idempotencyKey: "idempotency-1"
        })
      })
    );

    await expect(readEvents(response)).resolves.toEqual([
      {
        type: "failed",
        code: "runtimeControl.idempotencyConflict",
        message: "Idempotency key was reused with a different payload.",
        state: "duplicate_send"
      }
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
            args: { title: "Scripted fake-lane task" }
          },
          {
            type: "final",
            turnId: "assistant-turn-1",
            content: { text: "Created Scripted fake-lane task." },
            sessionRef: sessionRef()
          }
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
              finalizedAt: new Date("2026-07-02T00:00:01.000Z")
            })
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
                title: "Scripted fake-lane task",
                description: "",
                status: "todo",
                priority: "normal",
                assigneeUserId: null,
                assigneeName: null,
                labels: [],
                position: 1,
                createdAt: "2026-07-02T00:00:00.000Z",
                updatedAt: "2026-07-02T00:00:00.000Z"
              }
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
              completedAt: new Date("2026-07-02T00:00:00.000Z")
            }
          }),
        toolExecutionContextFromSessionPrincipal
      },
      revalidateTasks: () => {
        revalidateCalls += 1;
      }
    });

    const response = await handler(
      new Request("http://web.test/api/tasks/ask-admin/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: "conversation-1",
          prompt: "Add a task called Scripted fake-lane task",
          idempotencyKey: "idempotency-1"
        })
      })
    );

    const events = await readEvents(response);

    expect(events.map((event) => event.type)).toEqual([
      "queued",
      "tool.started",
      "tool.succeeded",
      "finalizing",
      "assistant.final"
    ]);
    expect(events[2]).toMatchObject({
      type: "tool.succeeded",
      output: {
        kind: "tasks.create",
        task: {
          id: "task-created-1",
          title: "Scripted fake-lane task"
        }
      }
    });
    expect(revalidateCalls).toBe(2);
  });
});
