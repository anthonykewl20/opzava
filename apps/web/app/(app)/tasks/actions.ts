"use server";

import {
  createTask,
  moveTask,
  taskPriorities,
  taskStatuses,
  updateTask,
  type TaskPriority,
  type TaskStatus,
} from "@opzava/project-management";
import { revalidatePath } from "next/cache";
import { forbidden, redirect } from "next/navigation";
import { z } from "zod";

import { formFailureState, formValidationState, type FormActionState } from "@/lib/action-state";
import { getAppSessionContext, type AppSessionContext } from "@/lib/session";

const taskStatusSchema = z.enum(taskStatuses);
const taskPrioritySchema = z.enum(taskPriorities);

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().max(4000).optional(),
  status: taskStatusSchema.default("todo"),
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
  status: taskStatusSchema,
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

async function requireTaskContext(): Promise<AppSessionContext> {
  const context = await getAppSessionContext();

  if (context === null) {
    redirect("/login");
  }

  return context;
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

function errorStatus(error: unknown, depth = 0): number | undefined {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return undefined;
  }

  const status = (error as { readonly status?: unknown }).status;
  return typeof status === "number"
    ? status
    : errorStatus((error as { readonly cause?: unknown }).cause, depth + 1);
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

function taskActionErrorState(error: unknown, fallback: string): FormActionState {
  if (errorCode(error) === "projectManagement.forbidden" || errorStatus(error) === 403) {
    forbidden();
  }

  return formFailureState(error instanceof Error ? error.message : fallback);
}

export async function createTaskAction(
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requireTaskContext();
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
  const context = await requireTaskContext();
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
  const context = await requireTaskContext();
  const parsed = moveTaskSchema.safeParse({
    taskId: stringFromForm(formData, "taskId"),
    status: stringFromForm(formData, "status"),
    position: stringFromForm(formData, "position"),
  });

  if (!parsed.success) {
    return formValidationState(parsed.error.issues);
  }

  const result = await moveTask({
    orgId: context.orgId,
    workspaceId: context.workspaceId,
    actor: actorFromContext(context),
    taskId: parsed.data.taskId,
    status: parsed.data.status as TaskStatus,
    position: parsed.data.position,
  });

  if (!result.ok) {
    return taskActionErrorState(result.error, "Task could not be moved.");
  }

  redirectAfterMutation();
}
