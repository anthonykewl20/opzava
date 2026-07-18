import type {
  CardDetailDto,
  TaskCommentDto,
  TaskDto,
  TaskStepDto,
} from "@opzava/project-management";
import { DomainError, err, ok } from "@opzava/shared-kernel";
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
  assistantPrechecksFromRuns,
  evidenceCountLabel,
  evidenceProvenanceLabel,
  evidenceSizeLabel,
  qualityReviewProjection,
  validateEvidenceUploadSize,
} from "../lib/task-card-evidence-quality";
import {
  addEvidenceLinkForCard,
  addQualityCheckForCard,
  approveQualityReviewForCard,
  loadTaskCardPageData,
  markTaskCommentsReadForCard,
  markTaskDoneForCard,
  postTaskCommentForCard,
  prepareEvidenceUploadForCard,
  toggleTaskStepForCard,
  toggleQualityCheckForCard,
  updateTaskCardDetails,
  type TaskCardActionDependencies,
  type TaskCardLoadDependencies,
} from "../lib/task-card-detail";
import {
  applyStepToggle,
  dueDateLabel,
  formatCardId,
  parseCardNumberRouteSegment,
  stepProgress,
  taskCardTabDomId,
  taskCardTabs,
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
    evidence: [],
    qualityReview: null,
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
    issueDoneConfirmNonce: async () => ok("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    markTaskDone: async () => ok(task({ status: "done", position: 8 })),
    toggleStep: async () => ok(step({ done: true })),
    updateTask: async () => ok(task()),
    addTaskEvidenceFile: async (input) =>
      ok({
        id: "66666666-6666-4666-8666-666666666666",
        taskId: input.taskId,
        organizationId: input.orgId,
        workspaceId: input.workspaceId,
        kind: "file",
        objectRef: input.objectRef,
        url: null,
        filename: input.filename,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        provenance: input.provenance ?? "Attached from upload",
        createdByUserId: input.actor.userId,
        createdAt: "2026-07-03T00:00:00.000Z",
      }),
    addTaskEvidenceLink: async (input) =>
      ok({
        id: "77777777-7777-4777-8777-777777777777",
        taskId: input.taskId,
        organizationId: input.orgId,
        workspaceId: input.workspaceId,
        kind: "link",
        objectRef: null,
        url: input.url,
        filename: input.title ?? input.url,
        contentType: null,
        sizeBytes: null,
        provenance: input.provenance ?? "Attached from link",
        createdByUserId: input.actor.userId,
        createdAt: "2026-07-03T00:00:00.000Z",
      }),
    ensureTaskQualityReview: async (input) =>
      ok({
        id: "88888888-8888-4888-8888-888888888888",
        taskId: input.taskId,
        organizationId: input.orgId,
        workspaceId: input.workspaceId,
        status: "open",
        approvedByUserId: null,
        approvedAt: null,
        createdAt: "2026-07-03T00:00:00.000Z",
        updatedAt: "2026-07-03T00:00:00.000Z",
        checks: [],
        reviewers: [],
      }),
    addQualityCheck: async (input) =>
      ok({
        id: "88888888-8888-4888-8888-888888888888",
        taskId: input.taskId,
        organizationId: input.orgId,
        workspaceId: input.workspaceId,
        status: "open",
        approvedByUserId: null,
        approvedAt: null,
        createdAt: "2026-07-03T00:00:00.000Z",
        updatedAt: "2026-07-03T00:00:00.000Z",
        checks: [
          {
            id: "99999999-9999-4999-8999-999999999999",
            reviewId: "88888888-8888-4888-8888-888888888888",
            taskId: input.taskId,
            organizationId: input.orgId,
            workspaceId: input.workspaceId,
            label: input.label,
            kind: input.kind ?? "human",
            state: input.state ?? "pending",
            actor: input.actorLabel ?? input.actor.userId,
            createdAt: "2026-07-03T00:00:00.000Z",
            updatedAt: "2026-07-03T00:00:00.000Z",
          },
        ],
        reviewers: [],
      }),
    toggleQualityCheck: async (input) =>
      ok({
        id: "88888888-8888-4888-8888-888888888888",
        taskId: input.taskId,
        organizationId: input.orgId,
        workspaceId: input.workspaceId,
        status: input.state === "fail" ? "changes_requested" : "open",
        approvedByUserId: null,
        approvedAt: null,
        createdAt: "2026-07-03T00:00:00.000Z",
        updatedAt: "2026-07-03T00:00:00.000Z",
        checks: [],
        reviewers: [],
      }),
    approveQualityReview: async (input) =>
      ok({
        id: "88888888-8888-4888-8888-888888888888",
        taskId: input.taskId,
        organizationId: input.orgId,
        workspaceId: input.workspaceId,
        status: "approved",
        approvedByUserId: input.actor.userId,
        approvedAt: "2026-07-03T00:00:00.000Z",
        createdAt: "2026-07-03T00:00:00.000Z",
        updatedAt: "2026-07-03T00:00:00.000Z",
        checks: [],
        reviewers: [],
      }),
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

  it("maps task card tabs to the mockup tab and panel ids", () => {
    expect(taskCardTabs.map((tab) => [tab.label, `tab-${taskCardTabDomId(tab.id)}`])).toEqual([
      ["Overview", "tab-overview"],
      ["AI Run", "tab-airun"],
      ["Evidence & Files", "tab-evidence"],
      ["Quality Review", "tab-quality"],
    ]);
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

  it("maps evidence and quality review states without JSX", () => {
    expect(validateEvidenceUploadSize(26 * 1024 * 1024)).toMatchObject({
      ok: false,
      message: "File is too large. Uploads are capped at 25 MB.",
    });
    expect(evidenceProvenanceLabel({ source: "assistant" })).toBe("Drafted by Ask Admin Opzava");
    expect(evidenceSizeLabel(1536)).toBe("1.5 KB");
    expect(evidenceCountLabel([])).toBe("0 items");

    const review = qualityReviewProjection({
      id: "review-1",
      taskId: "task-1",
      organizationId: "org-1",
      workspaceId: "workspace-1",
      status: "changes_requested",
      approvedByUserId: null,
      approvedAt: null,
      createdAt: "2026-07-03T00:00:00.000Z",
      updatedAt: "2026-07-03T00:00:00.000Z",
      checks: [
        {
          id: "check-1",
          reviewId: "review-1",
          taskId: "task-1",
          organizationId: "org-1",
          workspaceId: "workspace-1",
          label: "Verify evidence",
          kind: "human",
          state: "fail",
          actor: "Admin",
          createdAt: "2026-07-03T00:00:00.000Z",
          updatedAt: "2026-07-03T00:00:00.000Z",
        },
      ],
      reviewers: [],
    });
    expect(review).toMatchObject({
      remainingCount: 1,
      hasChangesRequested: true,
      canApprove: false,
    });
  });

  it("projects assistant pre-checks from completed tool receipts", () => {
    const projected = assistantPrechecksFromRuns([
      {
        turnId: "turn-1",
        status: "final",
        text: "",
        createdAt: "2026-07-03T00:00:00.000Z",
        updatedAt: "2026-07-03T00:00:00.000Z",
        finalizedAt: "2026-07-03T00:00:00.000Z",
        outcomes: [
          {
            id: "outcome-1",
            toolName: "opzava_tasks_update",
            toolCallId: "tool-1",
            status: "succeeded",
            requestSummary: {},
            resultSummary: {},
            targetRef: "task-1",
            createdAt: "2026-07-03T00:00:00.000Z",
            updatedAt: "2026-07-03T00:00:00.000Z",
            completedAt: "2026-07-03T00:00:00.000Z",
          },
        ],
      },
    ]);

    expect(projected).toEqual([
      {
        id: "turn-1:outcome-1",
        label: "Assistant completed opzava_tasks_update",
        state: "pass",
        actor: "Ask Admin Opzava",
      },
    ]);
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
    let capturedInput: Parameters<TaskCardActionDependencies["markTaskDone"]>[0] | null = null;
    let issuedForTaskId: string | null = null;
    const result = await markTaskDoneForCard(
      { taskId: "11111111-1111-4111-8111-111111111111" },
      actionDependencies({
        issueDoneConfirmNonce: async (_context, taskId) => {
          issuedForTaskId = taskId;
          return ok("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
        },
        markTaskDone: async (input) => {
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
    expect(issuedForTaskId).toBe("11111111-1111-4111-8111-111111111111");
    expect(capturedInput).toMatchObject({
      position: 8,
      humanCommand: {
        confirmedByUserId: "user-1",
        confirmSource: "admin-web",
        confirmNonce: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    });
    expect(result.value.linkedIssueCloseIntent).toEqual({
      kind: "deferred_to_slice_2_5e",
      taskId: "11111111-1111-4111-8111-111111111111",
      cardNumber: 1042,
      targetRef: "github:opzava/opzava#42",
      outbox: null,
    });
  });

  it("fails the card Done command when no valid confirmation can be issued", async () => {
    let markTaskDoneCalled = false;
    const result = await markTaskDoneForCard(
      { taskId: "11111111-1111-4111-8111-111111111111" },
      actionDependencies({
        issueDoneConfirmNonce: async () =>
          err(
            new DomainError({
              code: "projectManagement.taskDoneRequiresHumanAttestation",
              message: "Marking a task Done requires the confirmed human Done action.",
            }),
          ),
        markTaskDone: async () => {
          markTaskDoneCalled = true;
          return ok(task({ status: "done" }));
        },
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "projectManagement.taskDoneRequiresHumanAttestation" },
    });
    expect(markTaskDoneCalled).toBe(false);
  });

  it("preserves the current assignee when editing card details", async () => {
    let capturedInput: Parameters<TaskCardActionDependencies["updateTask"]>[0] | null = null;
    const result = await updateTaskCardDetails(
      {
        taskId: "11111111-1111-4111-8111-111111111111",
        title: "Edited title",
        description: "Edited description",
        priority: "high",
        labels: "edited",
      },
      actionDependencies({
        getCardDetail: async () =>
          ok(cardDetail({ task: task({ assigneeUserId: "assignee-1", assigneeName: "Ada" }) })),
        updateTask: async (input) => {
          capturedInput = input;
          return ok(task({ assigneeUserId: input.assigneeUserId ?? null }));
        },
      }),
    );

    expect(result.ok).toBe(true);
    expect(capturedInput).toMatchObject({
      assigneeUserId: "assignee-1",
      title: "Edited title",
      description: "Edited description",
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

  it("prepares a capped evidence upload through the object store and records a file row", async () => {
    const result = await prepareEvidenceUploadForCard(
      {
        taskId: "11111111-1111-4111-8111-111111111111",
        filename: "trace.txt",
        contentType: "text/plain",
        sizeBytes: 12,
      },
      actionDependencies({
        objectStorePort: {
          putObject: async () => ok({ ref: { bucket: "tasks", key: "x" }, etag: "etag" }),
          getObject: async () =>
            ok({
              ref: { bucket: "tasks", key: "x" },
              body: (async function* body() {
                yield new Uint8Array();
              })(),
              contentType: "text/plain",
              sizeBytes: 0,
              etag: "etag",
            }),
          presignPutObject: async (input) =>
            ok({
              ref: { bucket: "tasks", key: input.key },
              method: "PUT",
              url: "https://object-store.test/upload",
              headers: { "content-type": input.contentType },
              expiresAt: "2026-07-03T00:10:00.000Z",
            }),
          presignGetObject: async () =>
            ok({
              ref: { bucket: "tasks", key: "x" },
              method: "GET",
              url: "https://object-store.test/download",
              headers: {},
              expiresAt: "2026-07-03T00:10:00.000Z",
            }),
          deleteObject: async () => ok(undefined),
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    expect(result.value.evidence.filename).toBe("trace.txt");
    expect(result.value.upload.method).toBe("PUT");
  });

  it("adds evidence links and mutates quality review through server-action seams", async () => {
    const link = await addEvidenceLinkForCard(
      {
        taskId: "11111111-1111-4111-8111-111111111111",
        url: "https://example.test/evidence",
        title: "Support transcript",
      },
      actionDependencies(),
    );
    expect(link).toMatchObject({ ok: true, value: { kind: "link" } });

    const quality = await addQualityCheckForCard(
      { taskId: "11111111-1111-4111-8111-111111111111", label: "Verify evidence" },
      actionDependencies(),
    );
    expect(quality).toMatchObject({ ok: true, value: { checks: [{ label: "Verify evidence" }] } });

    const toggled = await toggleQualityCheckForCard(
      {
        taskId: "11111111-1111-4111-8111-111111111111",
        checkId: "99999999-9999-4999-8999-999999999999",
        state: "fail",
      },
      actionDependencies(),
    );
    expect(toggled).toMatchObject({ ok: true, value: { status: "changes_requested" } });

    const approved = await approveQualityReviewForCard(
      { taskId: "11111111-1111-4111-8111-111111111111" },
      actionDependencies(),
    );
    expect(approved).toMatchObject({ ok: true, value: { status: "approved" } });
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
