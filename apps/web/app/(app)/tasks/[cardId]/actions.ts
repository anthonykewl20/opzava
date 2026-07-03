"use server";

import type { TaskDto, TaskStepDto } from "@opzava/project-management";
import { revalidatePath } from "next/cache";

import {
  defaultTaskCardActionDependencies,
  errorCode,
  markTaskDoneForCard,
  toggleTaskStepForCard,
  updateTaskCardDetails,
  type LinkedIssueCloseIntent,
} from "@/lib/task-card-detail";
import { getAppSessionContext } from "@/lib/session";

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
