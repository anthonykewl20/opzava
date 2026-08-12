"use server";

import {
  createTask,
  markTaskDone,
  moveTask,
  taskPriorities,
  taskStatuses,
  updateTask,
  type TaskPriority,
  type TaskStatus,
} from "@opzava/project-management";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { formFailureState, formValidationState, type FormActionState } from "@/lib/action-state";
import { forbiddenFromError, requireContext } from "@/lib/authed-action";
import type { AppSessionContext } from "@/lib/session";
import { attestHumanCommand, issueDoneConfirmNonce } from "@/lib/task-attestation";

const taskStatusesExcludingDone = taskStatuses.filter((status) => status !== "done");
const taskWriteStatusSchema = z
  .enum(taskStatusesExcludingDone)
  .transform((status): TaskStatus => status);
const taskPrioritySchema = z.enum(taskPriorities);

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().max(4000).optional(),
  status: taskWriteStatusSchema.default("todo"),
  priority: taskPrioritySchema.default("normal"),
  assignee: z.string().optional(),
  labels: z.string().optional(),
  idempotencyKey: z.string().trim().min(1).max(160),
});

const updateTaskSchema = z.object({
  taskId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(180),
  description: z.string().max(4000).optional(),
  priority: taskPrioritySchema,
  assignee: z.string().optional(),
  labels: z.string().optional(),
});

const moveTaskSchema = z.object({
  taskId: z.string().trim().min(1),
  status: taskWriteStatusSchema,
  position: z.coerce.number().int().min(0),
});

function stringFromForm(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function labelsFromForm(value: string | undefined): readonly string[] {
  if (value === undefined) {
    return [];
  }

  return value.split(",");
}

function assigneeFromForm(value: string | undefined, context: AppSessionContext): string | null {
  return value === "me" ? context.user.id : null;
}

function actorFromContext(context: AppSessionContext) {
  return {
    userId: context.user.id,
    roleKeys: context.roleKeys,
  };
}

function redirectAfterMutation(): never {
  revalidatePath("/tasks");
  redirect("/tasks");
}

function taskActionErrorState(error: unknown, fallback: string): FormActionState {
  forbiddenFromError(error);

  return formFailureState(error instanceof Error ? error.message : fallback);
}

export async function createTaskAction(
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requireContext();
  const parsed = createTaskSchema.safeParse({
    title: stringFromForm(formData, "title"),
    description: stringFromForm(formData, "description"),
    status: stringFromForm(formData, "status"),
    priority: stringFromForm(formData, "priority"),
    assignee: stringFromForm(formData, "assignee"),
    labels: stringFromForm(formData, "labels"),
    idempotencyKey: stringFromForm(formData, "idempotencyKey"),
  });

  if (!parsed.success) {
    return formValidationState(parsed.error.issues);
  }

  const result = await createTask({
    orgId: context.orgId,
    workspaceId: context.workspaceId,
    actor: actorFromContext(context),
    title: parsed.data.title,
    description: parsed.data.description ?? "",
    status: parsed.data.status as TaskStatus,
    priority: parsed.data.priority as TaskPriority,
    assigneeUserId: assigneeFromForm(parsed.data.assignee, context),
    labels: labelsFromForm(parsed.data.labels),
    idempotencyKey: parsed.data.idempotencyKey,
  });

  if (!result.ok) {
    return taskActionErrorState(result.error, "Task could not be created.");
  }

  redirectAfterMutation();
}

export async function updateTaskAction(
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requireContext();
  const parsed = updateTaskSchema.safeParse({
    taskId: stringFromForm(formData, "taskId"),
    title: stringFromForm(formData, "title"),
    description: stringFromForm(formData, "description"),
    priority: stringFromForm(formData, "priority"),
    assignee: stringFromForm(formData, "assignee"),
    labels: stringFromForm(formData, "labels"),
  });

  if (!parsed.success) {
    return formValidationState(parsed.error.issues);
  }

  const result = await updateTask({
    orgId: context.orgId,
    workspaceId: context.workspaceId,
    actor: actorFromContext(context),
    taskId: parsed.data.taskId,
    title: parsed.data.title,
    description: parsed.data.description ?? "",
    priority: parsed.data.priority as TaskPriority,
    assigneeUserId: assigneeFromForm(parsed.data.assignee, context),
    labels: labelsFromForm(parsed.data.labels),
  });

  if (!result.ok) {
    return taskActionErrorState(result.error, "Task could not be updated.");
  }

  redirectAfterMutation();
}

export async function moveTaskAction(
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requireContext();
  const parsed = moveTaskSchema.safeParse({
    taskId: stringFromForm(formData, "taskId"),
    status: stringFromForm(formData, "status"),
    position: stringFromForm(formData, "position"),
  });

  if (!parsed.success) {
    return formValidationState(parsed.error.issues);
  }

  const appContext = {
    orgId: context.orgId,
    workspaceId: context.workspaceId,
    actor: actorFromContext(context),
  };
  if (parsed.data.status === "done") {
    const nonce = await issueDoneConfirmNonce(context, parsed.data.taskId);
    if (!nonce.ok) {
      return taskActionErrorState(nonce.error, "Done confirmation could not be issued.");
    }

    const result = await markTaskDone({
      ...appContext,
      taskId: parsed.data.taskId,
      position: parsed.data.position,
      humanCommand: attestHumanCommand(context, nonce.value),
    });
    if (!result.ok) {
      return taskActionErrorState(result.error, "Task could not be marked Done.");
    }

    redirectAfterMutation();
  }

  const result = await moveTask({
    ...appContext,
    taskId: parsed.data.taskId,
    status: parsed.data.status as TaskStatus,
    position: parsed.data.position,
  });

  if (!result.ok) {
    return taskActionErrorState(result.error, "Task could not be moved.");
  }

  redirectAfterMutation();
}
