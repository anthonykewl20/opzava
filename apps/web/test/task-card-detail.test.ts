import type {
  CardDetailDto,
  TaskCommentDto,
  TaskDto,
  TaskStepDto,
} from "@opzava/project-management";
import { DomainError, ok } from "@opzava/shared-kernel";
import { describe, expect, it } from "vitest";

import { createTaskCardActivityGetHandler } from "../app/api/tasks/[cardId]/activity/route";
import { projectTaskCardAiRun, type TaskCardAssistantRunView } from "../lib/task-card-ai-run";
import {
  applyTaskCardActivityEvent,
  assistantActivityState,
  parseTaskCardActivitySseBuffer,
  type TaskCardActivityEvent,
} from "../lib/task-card-activity";
import { commentReadState } from "../lib/task-card-comments";
import {
  loadTaskCardPageData,
  markTaskCommentsReadForCard,
  markTaskDoneForCard,
  postTaskCommentForCard,
  toggleTaskStepForCard,
  type TaskCardActionDependencies,
  type TaskCardLoadDependencies,
} from "../lib/task-card-detail";
import {
  applyStepToggle,
  dueDateLabel,
  formatCardId,
  parseCardNumberRouteSegment,
  stepProgress,
  watcherOverflow,
} from "../lib/task-card-format";
import {
  evaluateAssistantMentionGuard,
  stableMentionMessageHash,
  type MentionTarget,
} from "../lib/task-card-mentions";
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
  workspaceName: "Customer Support",
  roleKeys: ["admin"],
};

function task(overrides: Partial<TaskDto> = {}): TaskDto {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organizationId: "org-1",
    workspaceId: "workspace-1",
    cardNumber: 1042,
    title: "Login keeps failing",
    description: "2FA error",
    status: "in_progress",
    priority: "normal",
    assigneeUserId: "user-1",
    assigneeName: "Admin User",
    labels: ["customer-facing"],
    position: 2,
    dueAt: "2026-07-10T00:00:00.000Z",
    provenanceSource: "customer email",
    provenanceExternalRef: null,
    createdAt: "2026-07-02T00:00:00.000Z",
    updatedAt: "2026-07-03T00:00:00.000Z",
    ...overrides,
  };
}

function step(overrides: Partial<TaskStepDto> = {}): TaskStepDto {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    taskId: "11111111-1111-4111-8111-111111111111",
    organizationId: "org-1",
    workspaceId: "workspace-1",
    text: "Reproduce the issue",
    assigneeUserId: "user-1",
    done: false,
    position: 1,
    createdAt: "2026-07-02T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
    ...overrides,
  };
}

function comment(overrides: Partial<TaskCommentDto> = {}): TaskCommentDto {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    taskId: "11111111-1111-4111-8111-111111111111",
    organizationId: "org-1",
    workspaceId: "workspace-1",
    authorKind: "human",
    authorUserId: "user-1",
    assistantKey: null,
    body: "Please ask @ask-admin-opzava to check this.",
    readByUserIds: [],
    createdAt: "2026-07-03T00:00:00.000Z",
    ...overrides,
  };
}

function cardDetail(overrides: Partial<CardDetailDto> = {}): CardDetailDto {
  return {
    task: task(),
    steps: [step()],
    comments: [],
    watchers: [],
    ...overrides,
  };
}

function loadDependencies(
  overrides: Partial<TaskCardLoadDependencies> = {},
): TaskCardLoadDependencies {
  return {
    getSessionContext: async () => context,
    listTasks: async () => ok([task()]),
    getCardDetail: async () => ok(cardDetail()),
    listTaskCardAssistantRuns: async () => [],
    ...overrides,
  };
}

function actionDependencies(
  overrides: Partial<TaskCardActionDependencies> = {},
): TaskCardActionDependencies {
  return {
    addComment: async () => ok(comment()),
    getSessionContext: async () => context,
    getCardDetail: async () => ok(cardDetail()),
    getOrCreateAskAdminHistory: async () =>
      ok({
        conversationId: "conversation-1",
        turns: [],
      }),
    enqueueIssueCloseForTask: async () => ok(null),
    listTasks: async () =>
      ok([
        task({ id: "11111111-1111-4111-8111-111111111111", status: "in_progress", position: 2 }),
        task({ id: "33333333-3333-4333-8333-333333333333", status: "done", position: 7 }),
      ]),
    markCommentsRead: async () => ok([comment({ readByUserIds: ["user-1"] })]),
    moveTask: async () => ok(task({ status: "done", position: 8 })),
    toggleStep: async () => ok(step({ done: true })),
    updateTask: async () => ok(task()),
    ...overrides,
  };
}

describe("Task card pure state", () => {
  it("formats workspace card ids and parses route segments", () => {
    expect(formatCardId("Customer Support", 1042)).toEqual({
      prefix: "CS",
      cardId: "CS-1042",
      routeSegment: "1042",
    });
    expect(parseCardNumberRouteSegment("1042")).toBe(1042);
    expect(parseCardNumberRouteSegment("CS-1042")).toBe(1042);
    expect(parseCardNumberRouteSegment("CS-nope")).toBeNull();
  });

  it("counts and optimistically toggles checklist steps", () => {
    const first = step({ id: "22222222-2222-4222-8222-222222222222", done: true });
    const second = step({ id: "33333333-3333-4333-8333-333333333333", done: false });
    const toggled = applyStepToggle([first, second], second.id, true);

    expect(stepProgress(toggled)).toEqual({
      done: 2,
      total: 2,
      label: "2 of 2 done",
    });
    expect(toggled[1]?.done).toBe(true);
  });

  it("renders due dates and watcher overflow without fake rows", () => {
    expect(dueDateLabel("2026-07-10T00:00:00.000Z", new Date("2026-07-06T12:00:00.000Z"))).toBe(
      "Due Friday",
    );
    expect(dueDateLabel(null)).toBe("No due date");

    const overflow = watcherOverflow([
      {
        taskId: "task-1",
        organizationId: "org-1",
        workspaceId: "workspace-1",
        userId: "a",
        name: "Amy",
        createdAt: "2026-07-02T00:00:00.000Z",
      },
      {
        taskId: "task-1",
        organizationId: "org-1",
        workspaceId: "workspace-1",
        userId: "b",
        name: "Ben",
        createdAt: "2026-07-02T00:00:00.000Z",
      },
      {
        taskId: "task-1",
        organizationId: "org-1",
        workspaceId: "workspace-1",
        userId: "c",
        name: "Cam",
        createdAt: "2026-07-02T00:00:00.000Z",
      },
      {
        taskId: "task-1",
        organizationId: "org-1",
        workspaceId: "workspace-1",
        userId: "d",
        name: "Dee",
        createdAt: "2026-07-02T00:00:00.000Z",
      },
    ]);

    expect(overflow.visible.map((watcher) => watcher.userId)).toEqual(["a", "b", "c"]);
    expect(overflow.overflowCount).toBe(1);
    expect(overflow.label).toBe("Watchers: Amy, Ben, Cam, Dee");
  });

  it("maps comment read markers and bounded assistant mentions", () => {
    expect(
      commentReadState(comment({ readByUserIds: ["user-2"] }), {
        currentUserId: "user-1",
        userNamesById: { "user-2": "Maria" },
      }),
    ).toEqual({
      readers: [{ userId: "user-2", name: "Maria" }],
      label: "Read by Maria",
      unread: false,
    });
    expect(
      commentReadState(comment(), {
        currentUserId: "user-1",
        userNamesById: {},
      }).label,
    ).toBe("Sent · not read yet");

    const targets: readonly MentionTarget[] = [
      { key: "maria", label: "Maria", kind: "human", userId: "user-2" },
      {
        key: "ask-admin-opzava",
        label: "Ask Admin Opzava",
        kind: "assistant",
        assistantKey: "ask-admin-opzava",
      },
    ];
    const dispatch = evaluateAssistantMentionGuard({
      body: "Please check this @ask-admin-opzava",
      cardTaskId: "task-1",
      authorKind: "human",
      targets,
      chainDepth: 0,
      previousAssistantMentionCount: 0,
      previousDispatches: [],
    });

    expect(dispatch.action).toBe("dispatch");
    if (dispatch.action !== "dispatch") {
      throw new Error("expected dispatch");
    }

    expect(
      evaluateAssistantMentionGuard({
        body: "Loop @ask-admin-opzava",
        cardTaskId: "task-1",
        authorKind: "assistant",
        authorAssistantKey: "ask-admin-opzava",
        targets,
        chainDepth: 0,
        previousAssistantMentionCount: 0,
        previousDispatches: [],
      }),
    ).toMatchObject({ action: "blocked", code: "assistant_self_mention" });
    expect(
      evaluateAssistantMentionGuard({
        body: "Depth @ask-admin-opzava",
        cardTaskId: "task-1",
        authorKind: "human",
        targets,
        chainDepth: 1,
        previousAssistantMentionCount: 0,
        previousDispatches: [],
      }),
    ).toMatchObject({ action: "blocked", code: "mention_depth_exceeded" });
    expect(
      evaluateAssistantMentionGuard({
        body: "Again @ask-admin-opzava",
        cardTaskId: "task-1",
        authorKind: "human",
        targets,
        chainDepth: 0,
        previousAssistantMentionCount: 0,
        previousDispatches: [
          {
            messageHash: stableMentionMessageHash({
              cardTaskId: "task-1",
              body: "Again @ask-admin-opzava",
            }),
          },
        ],
      }),
    ).toMatchObject({ action: "blocked", code: "mention_duplicate" });
  });

  it("projects AI run steps and applies activity SSE events", () => {
    const runs: readonly TaskCardAssistantRunView[] = [
      {
        turnId: "turn-1",
        status: "streaming",
        text: "Working",
        createdAt: "2026-07-03T00:00:00.000Z",
        updatedAt: "2026-07-03T00:00:05.000Z",
        finalizedAt: null,
        outcomes: [
          {
            id: "outcome-1",
            toolName: "opzava_tasks_update",
            toolCallId: "tool-1",
            status: "started",
            requestSummary: {},
            resultSummary: {},
            targetRef: "11111111-1111-4111-8111-111111111111",
            createdAt: "2026-07-03T00:00:06.000Z",
            updatedAt: "2026-07-03T00:00:06.000Z",
            completedAt: null,
          },
        ],
      },
    ];

    expect(assistantActivityState(runs)).toBe("assistant_working");
    expect(projectTaskCardAiRun(runs, new Date("2026-07-03T00:01:05.000Z"))).toMatchObject({
      live: true,
      elapsedLabel: "1m 05s",
    });

    const state = applyTaskCardActivityEvent(
      {
        comments: [],
        steps: [step({ done: false })],
        assistantState: "idle",
        runs: [],
      },
      { type: "step-toggled", step: step({ done: true }) },
    );
    expect(state.steps[0]?.done).toBe(true);
  });
});

describe("Task card load and actions", () => {
  it("loads a card detail by card number inside the session workspace", async () => {
    const result = await loadTaskCardPageData({ cardId: "CS-1042" }, loadDependencies());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    expect(result.value.card.task.cardNumber).toBe(1042);
    expect(result.value.context.workspaceId).toBe("workspace-1");
    expect(result.value.assistantRuns).toEqual([]);
  });

  it("returns not found when the card number is absent from the session workspace", async () => {
    const result = await loadTaskCardPageData(
      { cardId: "CS-1042" },
      loadDependencies({
        listTasks: async () => ok([task({ cardNumber: 99 })]),
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected not found");
    }
    expect(result.error.code).toBe("web.taskCardNotFound");
  });

  it("toggles a step under the session principal", async () => {
    let capturedInput: Parameters<TaskCardActionDependencies["toggleStep"]>[0] | null = null;
    const result = await toggleTaskStepForCard(
      {
        taskId: "11111111-1111-4111-8111-111111111111",
        stepId: "22222222-2222-4222-8222-222222222222",
        done: true,
      },
      actionDependencies({
        toggleStep: async (input) => {
          capturedInput = input;
          return ok(step({ done: input.done }));
        },
      }),
    );

    expect(result.ok).toBe(true);
    expect(capturedInput).toMatchObject({
      orgId: "org-1",
      workspaceId: "workspace-1",
      actor: { userId: "user-1", roleKeys: ["admin"] },
      done: true,
    });
  });

  it("marks a card done at the next done position and records linked-issue close intent", async () => {
    let capturedInput: Parameters<TaskCardActionDependencies["moveTask"]>[0] | null = null;
    const result = await markTaskDoneForCard(
      { taskId: "11111111-1111-4111-8111-111111111111" },
      actionDependencies({
        moveTask: async (input) => {
          capturedInput = input;
          return ok(
            task({
              status: "done",
              position: input.position,
              provenanceExternalRef: "github:opzava/opzava#42",
            }),
          );
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    expect(capturedInput).toMatchObject({
      status: "done",
      position: 8,
    });
    expect(result.value.linkedIssueCloseIntent).toEqual({
      kind: "deferred_to_slice_2_5e",
      taskId: "11111111-1111-4111-8111-111111111111",
      cardNumber: 1042,
      targetRef: "github:opzava/opzava#42",
      outbox: null,
    });
  });

  it("propagates service authorization failures", async () => {
    const result = await toggleTaskStepForCard(
      {
        taskId: "11111111-1111-4111-8111-111111111111",
        stepId: "22222222-2222-4222-8222-222222222222",
        done: true,
      },
      actionDependencies({
        toggleStep: async () => ({
          ok: false,
          error: new DomainError({
            code: "projectManagement.forbidden",
            message: "You are not allowed to manage tasks.",
          }),
        }),
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected forbidden");
    }
    expect(result.error.code).toBe("projectManagement.forbidden");
  });

  it("posts a comment and returns an assistant dispatch when Ask Admin is mentioned", async () => {
    let capturedCommentInput: Parameters<TaskCardActionDependencies["addComment"]>[0] | null = null;
    const result = await postTaskCommentForCard(
      {
        taskId: "11111111-1111-4111-8111-111111111111",
        body: "Can @ask-admin-opzava summarize the next step?",
      },
      actionDependencies({
        getCardDetail: async () => ok(cardDetail({ comments: [] })),
        addComment: async (input) => {
          capturedCommentInput = input;
          return ok(comment({ body: input.body }));
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    expect(capturedCommentInput).toMatchObject({
      orgId: "org-1",
      workspaceId: "workspace-1",
      actor: { userId: "user-1", roleKeys: ["admin"] },
      authorKind: "human",
    });
    expect(result.value.assistantDispatch).toMatchObject({
      conversationId: "conversation-1",
      idempotencyKey: expect.stringContaining("card-11111111-1111-4111-8111-111111111111-"),
    });
  });

  it("marks visible comments read under the session principal", async () => {
    let capturedInput: Parameters<TaskCardActionDependencies["markCommentsRead"]>[0] | null = null;
    const result = await markTaskCommentsReadForCard(
      {
        taskId: "11111111-1111-4111-8111-111111111111",
        commentIds: ["44444444-4444-4444-8444-444444444444"],
      },
      actionDependencies({
        markCommentsRead: async (input) => {
          capturedInput = input;
          return ok([comment({ readByUserIds: [input.actor.userId] })]);
        },
      }),
    );

    expect(result.ok).toBe(true);
    expect(capturedInput).toMatchObject({
      orgId: "org-1",
      workspaceId: "workspace-1",
      actor: { userId: "user-1", roleKeys: ["admin"] },
      commentIds: ["44444444-4444-4444-8444-444444444444"],
    });
  });

  it("streams card activity SSE event shapes", async () => {
    async function* events(): AsyncIterable<TaskCardActivityEvent> {
      yield {
        type: "comment-added",
        comment: comment({ id: "55555555-5555-4555-8555-555555555555" }),
      };
      yield { type: "step-toggled", step: step({ done: true }) };
      yield { type: "assistant-state", state: "assistant_replying", runs: [] };
    }

    const handler = createTaskCardActivityGetHandler({
      getSessionContext: async () => context,
      createActivityEventStream: () => events(),
    });
    const response = await handler(new Request("http://web.test/api/tasks/1042/activity"), {
      params: Promise.resolve({ cardId: "1042" }),
    });
    const parsed = parseTaskCardActivitySseBuffer(await response.text());

    expect(response.status).toBe(200);
    expect(parsed.events.map((event) => event.type)).toEqual([
      "comment-added",
      "step-toggled",
      "assistant-state",
    ]);
  });
});
