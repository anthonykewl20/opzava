import {
  addComment,
  addQualityCheck,
  createStep,
  createTask,
  getCardDetail,
  getTask,
  listTasks,
  markCommentsRead,
  moveTask,
  reorderSteps,
  setDue,
  setWatchers,
  taskPriorities,
  taskStatuses,
  toggleStep,
  updateTask,
  type CardDetailDto,
  type TaskDto,
  type TaskStatus,
} from "@opzava/project-management";
import type { DomainError, Result } from "@opzava/shared-kernel";
import { z } from "zod";

import type { LinkTokenPrincipal } from "@opzava/identity-access";

export const readToolNames = ["opzava_tasks_list", "opzava_tasks_get"] as const;
export const writeToolNames = [
  "opzava_tasks_create",
  "opzava_tasks_update",
  "opzava_tasks_steps_create",
  "opzava_tasks_steps_toggle",
  "opzava_tasks_steps_reorder",
  "opzava_tasks_comments_add",
  "opzava_tasks_comments_mark_read",
  "opzava_tasks_quality_checks_add",
  "opzava_tasks_due_set",
  "opzava_tasks_watchers_set",
] as const;

export type OpzavaMcpToolName = (typeof readToolNames)[number] | (typeof writeToolNames)[number];

export interface OpzavaMcpTaskServices {
  readonly addComment: typeof addComment;
  readonly addQualityCheck: typeof addQualityCheck;
  readonly createStep: typeof createStep;
  readonly createTask: typeof createTask;
  readonly getCardDetail: typeof getCardDetail;
  readonly getTask: typeof getTask;
  readonly listTasks: typeof listTasks;
  readonly markCommentsRead: typeof markCommentsRead;
  readonly moveTask: typeof moveTask;
  readonly reorderSteps: typeof reorderSteps;
  readonly setDue: typeof setDue;
  readonly setWatchers: typeof setWatchers;
  readonly toggleStep: typeof toggleStep;
  readonly updateTask: typeof updateTask;
}

export interface ToolResultPayload<T> {
  readonly ok: true;
  readonly viaClient: "claude-code";
  readonly result: T;
}

export interface ToolErrorPayload {
  readonly ok: false;
  readonly code: "forbidden" | "not_found" | "invalid_args" | "failed";
  readonly message: string;
}

export const defaultTaskServices: OpzavaMcpTaskServices = {
  addComment,
  addQualityCheck,
  createStep,
  createTask,
  getCardDetail,
  getTask,
  listTasks,
  markCommentsRead,
  moveTask,
  reorderSteps,
  setDue,
  setWatchers,
  toggleStep,
  updateTask,
};

const skillGuidance =
  "Follow the opzava-task-authoring skill: write human-readable task cards, use imperative or symptom-first titles under 72 characters, keep descriptions concise with context/impact/evidence, make steps verifiable, never invent assignees/watchers/due dates/evidence, and never treat tenant/user/workspace ids from tool arguments as authority.";

const createIdempotencyGuidance =
  " For at-least-once safety, pass a stable idempotencyKey for each logical create and reuse it on retries.";

const optionalAuthorityFields = {
  tenantId: z.string().optional(),
  organizationId: z.string().optional(),
  orgId: z.string().optional(),
  workspaceId: z.string().optional(),
  userId: z.string().optional(),
};

const statusSchema = z.enum(taskStatuses);
const writableStatusSchema = z.enum(["todo", "in_progress", "blocked"]);
const prioritySchema = z.enum(taskPriorities);
const labelsSchema = z.array(z.string()).max(8).optional();
const uuidSchema = z.uuid();

export const listTasksSchema = z
  .object({
    status: statusSchema.optional(),
    limit: z.number().int().min(1).max(50).optional(),
    ...optionalAuthorityFields,
  })
  .strict();

export const getTaskSchema = z
  .object({
    taskId: uuidSchema,
    ...optionalAuthorityFields,
  })
  .strict();

export const createTaskSchema = z
  .object({
    title: z.string().min(1).max(180),
    description: z.string().max(4000).optional(),
    status: writableStatusSchema.optional(),
    priority: prioritySchema.optional(),
    labels: labelsSchema,
    dueAt: z.string().datetime().nullable().optional(),
    provenanceSource: z.string().min(1).max(240).optional(),
    provenanceExternalRef: z.string().max(500).nullable().optional(),
    idempotencyKey: z.string().min(1).max(160).optional(),
    ...optionalAuthorityFields,
  })
  .strict();

export const updateTaskSchema = z
  .object({
    taskId: uuidSchema,
    title: z.string().min(1).max(180).optional(),
    description: z.string().max(4000).optional(),
    status: writableStatusSchema.optional(),
    priority: prioritySchema.optional(),
    labels: labelsSchema,
    ...optionalAuthorityFields,
  })
  .strict();

export const createStepSchema = z
  .object({
    taskId: uuidSchema,
    text: z.string().min(1).max(500),
    assigneeUserId: z.string().nullable().optional(),
    idempotencyKey: z.string().min(1).max(160).optional(),
    ...optionalAuthorityFields,
  })
  .strict();

export const toggleStepSchema = z
  .object({
    taskId: uuidSchema,
    stepId: uuidSchema,
    done: z.boolean(),
    ...optionalAuthorityFields,
  })
  .strict();

export const reorderStepsSchema = z
  .object({
    taskId: uuidSchema,
    stepIds: z.array(uuidSchema).min(1),
    ...optionalAuthorityFields,
  })
  .strict();

export const addCommentSchema = z
  .object({
    taskId: uuidSchema,
    body: z.string().min(1).max(4000),
    idempotencyKey: z.string().min(1).max(160).optional(),
    ...optionalAuthorityFields,
  })
  .strict();

export const addQualityCheckSchema = z
  .object({
    taskId: uuidSchema,
    label: z.string().min(1).max(240),
    kind: z.enum(["human", "ai_precheck"]).optional(),
    state: z.enum(["pass", "fail", "pending"]).optional(),
    actorLabel: z.string().min(1).max(240).optional(),
    idempotencyKey: z.string().min(1).max(160).optional(),
    ...optionalAuthorityFields,
  })
  .strict();

export const markCommentsReadSchema = z
  .object({
    taskId: uuidSchema,
    commentIds: z.array(uuidSchema).optional(),
    ...optionalAuthorityFields,
  })
  .strict();

export const setDueSchema = z
  .object({
    taskId: uuidSchema,
    dueAt: z.string().datetime().nullable(),
    ...optionalAuthorityFields,
  })
  .strict();

export const setWatchersSchema = z
  .object({
    taskId: uuidSchema,
    userIds: z.array(z.string()).max(32),
    ...optionalAuthorityFields,
  })
  .strict();

type ToolResponse =
  | {
      readonly content: { readonly type: "text"; readonly text: string }[];
      readonly structuredContent: Record<string, unknown>;
    }
  | {
      readonly isError: true;
      readonly content: { readonly type: "text"; readonly text: string }[];
      readonly structuredContent: Record<string, unknown>;
    };

function taskContext(principal: LinkTokenPrincipal) {
  return {
    orgId: principal.orgId,
    workspaceId: principal.workspaceId,
    actor: principal.actor,
  };
}

function okResponse<T>(result: T): ToolResponse {
  const payload: ToolResultPayload<T> = {
    ok: true,
    viaClient: "claude-code",
    result,
  };
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload as unknown as Record<string, unknown>,
  };
}

function publicCode(error: DomainError): ToolErrorPayload["code"] {
  if (
    error.code.includes("forbidden") ||
    error.code === "projectManagement.taskDoneRequiresHumanAttestation" ||
    error.code === "projectManagement.taskDoneRequiresApprovedReview"
  ) {
    return "forbidden";
  }

  if (error.code.includes("NotFound") || error.code.includes("notFound")) {
    return "not_found";
  }

  if (error.code.includes("invalid") || error.code.includes("Malformed")) {
    return "invalid_args";
  }

  return "failed";
}

function errorResponse(error: DomainError): ToolResponse {
  const payload: ToolErrorPayload = {
    ok: false,
    code: publicCode(error),
    message: error.message,
  };
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload as unknown as Record<string, unknown>,
  };
}

function resultResponse<T>(
  result: Result<T>,
  mapValue: (value: T) => Record<string, unknown>,
): ToolResponse {
  return result.ok ? okResponse(mapValue(result.value)) : errorResponse(result.error);
}

function taskDtoResult(task: TaskDto): Record<string, unknown> {
  return { task };
}

function cardDetailResult(card: CardDetailDto): Record<string, unknown> {
  return { card };
}

function tasksResult(tasks: readonly TaskDto[]): Record<string, unknown> {
  return { tasks };
}

function stepResult(step: unknown): Record<string, unknown> {
  return { step };
}

function stepsResult(steps: unknown): Record<string, unknown> {
  return { steps };
}

function commentResult(comment: unknown): Record<string, unknown> {
  return { comment };
}

function commentsResult(comments: unknown): Record<string, unknown> {
  return { comments };
}

function watchersResult(watchers: unknown): Record<string, unknown> {
  return { watchers };
}

function qualityReviewResult(review: unknown): Record<string, unknown> {
  return { qualityReview: review };
}

export function descriptionForTool(name: OpzavaMcpToolName): string {
  const descriptions: Record<OpzavaMcpToolName, string> = {
    opzava_tasks_list:
      "List Opzava tasks in the linked workspace. Optional status/limit filters are data filters only; tenant, workspace, and user authority comes from the link token. ",
    opzava_tasks_get:
      "Load one Opzava live card with task, steps, comments, and watchers. Authority comes from the link token. ",
    opzava_tasks_create:
      `Create an Opzava task card in the linked workspace. Authority comes from the link token.${createIdempotencyGuidance} `,
    opzava_tasks_update:
      "Update task title, description, priority, labels, or status in the linked workspace. Authority comes from the link token. ",
    opzava_tasks_steps_create:
      `Create one verifiable step on a task card in the linked workspace. Authority comes from the link token.${createIdempotencyGuidance} `,
    opzava_tasks_steps_toggle:
      "Set one task step done/not-done in the linked workspace. Authority comes from the link token. ",
    opzava_tasks_steps_reorder:
      "Reorder every current step on a task card in the linked workspace. Authority comes from the link token. ",
    opzava_tasks_comments_add:
      `Add a human-attributed task comment on behalf of the linked user. Authority comes from the link token.${createIdempotencyGuidance} `,
    opzava_tasks_comments_mark_read:
      "Mark task comments read on behalf of the linked user. Authority comes from the link token. ",
    opzava_tasks_quality_checks_add:
      `Add a human quality check to a task card in the linked workspace. Authority comes from the link token.${createIdempotencyGuidance} `,
    opzava_tasks_due_set:
      "Set or clear a task due date in the linked workspace. Authority comes from the link token. ",
    opzava_tasks_watchers_set:
      "Replace the task watcher set in the linked workspace. Authority comes from the link token. ",
  };

  return `${descriptions[name]}${skillGuidance}`;
}

export function listToolHandler(
  principal: LinkTokenPrincipal,
  services: OpzavaMcpTaskServices = defaultTaskServices,
) {
  return async (args: z.infer<typeof listTasksSchema>): Promise<ToolResponse> => {
    const listed = await services.listTasks(taskContext(principal));
    if (!listed.ok) {
      return errorResponse(listed.error);
    }

    const filtered =
      args.status === undefined
        ? listed.value
        : listed.value.filter((task) => task.status === args.status);
    return okResponse(tasksResult(filtered.slice(0, args.limit ?? 20)));
  };
}

export function getToolHandler(
  principal: LinkTokenPrincipal,
  services: OpzavaMcpTaskServices = defaultTaskServices,
) {
  return async (args: z.infer<typeof getTaskSchema>): Promise<ToolResponse> => {
    const result = await services.getCardDetail({
      ...taskContext(principal),
      taskId: args.taskId,
    });
    return result.ok ? okResponse(cardDetailResult(result.value)) : errorResponse(result.error);
  };
}

export function createToolHandler(
  principal: LinkTokenPrincipal,
  services: OpzavaMcpTaskServices = defaultTaskServices,
) {
  return async (args: z.infer<typeof createTaskSchema>): Promise<ToolResponse> => {
    const result = await services.createTask({
      ...taskContext(principal),
      title: args.title,
      ...(args.description === undefined ? {} : { description: args.description }),
      ...(args.status === undefined ? {} : { status: args.status }),
      ...(args.priority === undefined ? {} : { priority: args.priority }),
      ...(args.labels === undefined ? {} : { labels: args.labels }),
      ...(args.dueAt === undefined ? {} : { dueAt: args.dueAt }),
      provenanceSource: args.provenanceSource ?? "claude-code",
      ...(args.provenanceExternalRef === undefined
        ? {}
        : { provenanceExternalRef: args.provenanceExternalRef }),
      ...(args.idempotencyKey === undefined ? {} : { idempotencyKey: args.idempotencyKey }),
    });

    return resultResponse(result, taskDtoResult);
  };
}

export function updateToolHandler(
  principal: LinkTokenPrincipal,
  services: OpzavaMcpTaskServices = defaultTaskServices,
) {
  return async (args: z.infer<typeof updateTaskSchema>): Promise<ToolResponse> => {
    const existing = await services.getTask({
      ...taskContext(principal),
      taskId: args.taskId,
    });
    if (!existing.ok) {
      return errorResponse(existing.error);
    }

    const updated = await services.updateTask({
      ...taskContext(principal),
      taskId: args.taskId,
      title: args.title ?? existing.value.title,
      description: args.description ?? existing.value.description,
      priority: args.priority ?? existing.value.priority,
      assigneeUserId: existing.value.assigneeUserId,
      labels: args.labels ?? existing.value.labels,
    });
    if (!updated.ok) {
      return errorResponse(updated.error);
    }

    if (args.status === undefined || args.status === updated.value.status) {
      return okResponse(taskDtoResult(updated.value));
    }

    const moved = await services.moveTask({
      ...taskContext(principal),
      taskId: args.taskId,
      status: args.status as TaskStatus,
      position: updated.value.position,
    });
    return resultResponse(moved, taskDtoResult);
  };
}

export function createStepToolHandler(
  principal: LinkTokenPrincipal,
  services: OpzavaMcpTaskServices = defaultTaskServices,
) {
  return async (args: z.infer<typeof createStepSchema>): Promise<ToolResponse> =>
    resultResponse(
      await services.createStep({
        ...taskContext(principal),
        taskId: args.taskId,
        text: args.text,
        ...(args.assigneeUserId === undefined ? {} : { assigneeUserId: args.assigneeUserId }),
        ...(args.idempotencyKey === undefined ? {} : { idempotencyKey: args.idempotencyKey }),
      }),
      stepResult,
    );
}

export function toggleStepToolHandler(
  principal: LinkTokenPrincipal,
  services: OpzavaMcpTaskServices = defaultTaskServices,
) {
  return async (args: z.infer<typeof toggleStepSchema>): Promise<ToolResponse> =>
    resultResponse(
      await services.toggleStep({
        ...taskContext(principal),
        taskId: args.taskId,
        stepId: args.stepId,
        done: args.done,
      }),
      stepResult,
    );
}

export function reorderStepsToolHandler(
  principal: LinkTokenPrincipal,
  services: OpzavaMcpTaskServices = defaultTaskServices,
) {
  return async (args: z.infer<typeof reorderStepsSchema>): Promise<ToolResponse> =>
    resultResponse(
      await services.reorderSteps({
        ...taskContext(principal),
        taskId: args.taskId,
        stepIds: args.stepIds,
      }),
      stepsResult,
    );
}

export function addCommentToolHandler(
  principal: LinkTokenPrincipal,
  services: OpzavaMcpTaskServices = defaultTaskServices,
) {
  return async (args: z.infer<typeof addCommentSchema>): Promise<ToolResponse> =>
    resultResponse(
      await services.addComment({
        ...taskContext(principal),
        taskId: args.taskId,
        body: args.body,
        ...(args.idempotencyKey === undefined ? {} : { idempotencyKey: args.idempotencyKey }),
      }),
      commentResult,
    );
}

export function addQualityCheckToolHandler(
  principal: LinkTokenPrincipal,
  services: OpzavaMcpTaskServices = defaultTaskServices,
) {
  return async (args: z.infer<typeof addQualityCheckSchema>): Promise<ToolResponse> =>
    resultResponse(
      await services.addQualityCheck({
        ...taskContext(principal),
        taskId: args.taskId,
        label: args.label,
        ...(args.kind === undefined ? {} : { kind: args.kind }),
        ...(args.state === undefined ? {} : { state: args.state }),
        ...(args.actorLabel === undefined ? {} : { actorLabel: args.actorLabel }),
        ...(args.idempotencyKey === undefined ? {} : { idempotencyKey: args.idempotencyKey }),
      }),
      qualityReviewResult,
    );
}

export function markCommentsReadToolHandler(
  principal: LinkTokenPrincipal,
  services: OpzavaMcpTaskServices = defaultTaskServices,
) {
  return async (args: z.infer<typeof markCommentsReadSchema>): Promise<ToolResponse> => {
    const result = await services.markCommentsRead({
      ...taskContext(principal),
      taskId: args.taskId,
      ...(args.commentIds === undefined ? {} : { commentIds: args.commentIds }),
    });

    return resultResponse(result, commentsResult);
  };
}

export function setDueToolHandler(
  principal: LinkTokenPrincipal,
  services: OpzavaMcpTaskServices = defaultTaskServices,
) {
  return async (args: z.infer<typeof setDueSchema>): Promise<ToolResponse> =>
    resultResponse(
      await services.setDue({
        ...taskContext(principal),
        taskId: args.taskId,
        dueAt: args.dueAt,
      }),
      taskDtoResult,
    );
}

export function setWatchersToolHandler(
  principal: LinkTokenPrincipal,
  services: OpzavaMcpTaskServices = defaultTaskServices,
) {
  return async (args: z.infer<typeof setWatchersSchema>): Promise<ToolResponse> =>
    resultResponse(
      await services.setWatchers({
        ...taskContext(principal),
        taskId: args.taskId,
        userIds: args.userIds,
      }),
      watchersResult,
    );
}
