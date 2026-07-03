"use server";

import type {
  TaskCommentDto,
  TaskDto,
  TaskEvidenceDto,
  TaskQualityReviewDto,
  TaskStepDto,
} from "@opzava/project-management";
import { ok } from "@opzava/shared-kernel";
import { revalidatePath } from "next/cache";

import {
  addEvidenceLinkForCard,
  addQualityCheckForCard,
  approveQualityReviewForCard,
  defaultTaskCardActionDependencies,
  errorCode,
  markTaskDoneForCard,
  markTaskCommentsReadForCard,
  postTaskCommentForCard,
  prepareEvidenceUploadForCard,
  presignEvidenceDownloadForCard,
  toggleTaskStepForCard,
  toggleQualityCheckForCard,
  updateTaskCardDetails,
  type AssistantMentionDispatch,
  type LinkedIssueCloseIntent,
  type PrepareEvidenceUploadResult,
} from "@/lib/task-card-detail";
import { getObjectStorePort } from "@/lib/object-store";
import { getAppSessionContext } from "@/lib/session";
import type { ErrorCapturePort, ObjectStorePresignedRequest } from "@opzava/ports";

export type TaskCardActionResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
      };
    };

export interface MarkDoneActionValue {
  readonly task: TaskDto;
  readonly linkedIssueCloseIntent: LinkedIssueCloseIntent;
}

export interface PostCommentActionValue {
  readonly comment: TaskCommentDto;
  readonly assistantDispatch: AssistantMentionDispatch | null;
}

function revalidateTaskPaths(input: { readonly cardNumber?: number }): void {
  revalidatePath("/tasks");

  if (input.cardNumber !== undefined) {
    revalidatePath(`/tasks/${input.cardNumber}`);
  }
}

function taskCardActionFailure(error: unknown): TaskCardActionResult<never> {
  return {
    ok: false,
    error: {
      code: errorCode(error) ?? "web.taskCardActionFailed",
      message: error instanceof Error ? error.message : "Task card action failed.",
    },
  };
}

function taskCardActionDependencies() {
  return {
    ...defaultTaskCardActionDependencies,
    getSessionContext: getAppSessionContext,
    revalidateTaskPaths,
  };
}

function taskCardStorageActionDependencies() {
  const errorCapture: ErrorCapturePort = {
    async capture() {
      return ok(undefined);
    },
  };
  let objectStorePort: ReturnType<typeof getObjectStorePort> | undefined;
  try {
    objectStorePort = getObjectStorePort();
  } catch {
    objectStorePort = undefined;
  }

  return {
    ...defaultTaskCardActionDependencies,
    getSessionContext: getAppSessionContext,
    ...(objectStorePort === undefined ? {} : { objectStorePort }),
    errorCapture,
    revalidateTaskPaths,
  };
}

export async function toggleTaskStepAction(input: {
  readonly taskId: string;
  readonly stepId: string;
  readonly done: boolean;
}): Promise<TaskCardActionResult<TaskStepDto>> {
  const result = await toggleTaskStepForCard(input, taskCardActionDependencies());
  return result.ok ? { ok: true, value: result.value } : taskCardActionFailure(result.error);
}

export async function markTaskDoneAction(input: {
  readonly taskId: string;
}): Promise<TaskCardActionResult<MarkDoneActionValue>> {
  const result = await markTaskDoneForCard(input, taskCardActionDependencies());
  return result.ok ? { ok: true, value: result.value } : taskCardActionFailure(result.error);
}

export async function updateTaskCardAction(input: {
  readonly taskId: string;
  readonly title: string;
  readonly description: string;
  readonly priority: string;
  readonly labels: string;
}): Promise<TaskCardActionResult<TaskDto>> {
  const result = await updateTaskCardDetails(input, taskCardActionDependencies());
  return result.ok ? { ok: true, value: result.value } : taskCardActionFailure(result.error);
}

export async function postTaskCommentAction(input: {
  readonly taskId: string;
  readonly body: string;
  readonly mentionChainDepth?: number;
}): Promise<TaskCardActionResult<PostCommentActionValue>> {
  const result = await postTaskCommentForCard(input, taskCardActionDependencies());
  return result.ok ? { ok: true, value: result.value } : taskCardActionFailure(result.error);
}

export async function markTaskCommentsReadAction(input: {
  readonly taskId: string;
  readonly commentIds?: readonly string[];
}): Promise<TaskCardActionResult<readonly TaskCommentDto[]>> {
  const result = await markTaskCommentsReadForCard(input, taskCardActionDependencies());
  return result.ok ? { ok: true, value: result.value } : taskCardActionFailure(result.error);
}

export async function prepareTaskEvidenceUploadAction(input: {
  readonly taskId: string;
  readonly filename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}): Promise<TaskCardActionResult<PrepareEvidenceUploadResult>> {
  const result = await prepareEvidenceUploadForCard(input, taskCardStorageActionDependencies());
  return result.ok ? { ok: true, value: result.value } : taskCardActionFailure(result.error);
}

export async function addTaskEvidenceLinkAction(input: {
  readonly taskId: string;
  readonly url: string;
  readonly title?: string;
}): Promise<TaskCardActionResult<TaskEvidenceDto>> {
  const result = await addEvidenceLinkForCard(input, taskCardActionDependencies());
  return result.ok ? { ok: true, value: result.value } : taskCardActionFailure(result.error);
}

export async function presignTaskEvidenceDownloadAction(input: {
  readonly taskId: string;
  readonly evidenceId: string;
}): Promise<TaskCardActionResult<ObjectStorePresignedRequest>> {
  const result = await presignEvidenceDownloadForCard(input, taskCardStorageActionDependencies());
  return result.ok ? { ok: true, value: result.value } : taskCardActionFailure(result.error);
}

export async function addTaskQualityCheckAction(input: {
  readonly taskId: string;
  readonly label: string;
}): Promise<TaskCardActionResult<TaskQualityReviewDto>> {
  const result = await addQualityCheckForCard(input, taskCardActionDependencies());
  return result.ok ? { ok: true, value: result.value } : taskCardActionFailure(result.error);
}

export async function toggleTaskQualityCheckAction(input: {
  readonly taskId: string;
  readonly checkId: string;
  readonly state: "pass" | "fail" | "pending";
}): Promise<TaskCardActionResult<TaskQualityReviewDto>> {
  const result = await toggleQualityCheckForCard(input, taskCardActionDependencies());
  return result.ok ? { ok: true, value: result.value } : taskCardActionFailure(result.error);
}

export async function approveTaskQualityReviewAction(input: {
  readonly taskId: string;
  readonly expectedReviewId?: string;
}): Promise<TaskCardActionResult<TaskQualityReviewDto>> {
  const result = await approveQualityReviewForCard(input, taskCardActionDependencies());
  return result.ok ? { ok: true, value: result.value } : taskCardActionFailure(result.error);
}
