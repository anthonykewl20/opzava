import type { OrgId, TaskId, UserId, WorkspaceId } from "@opzava/shared-kernel";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

export const taskStatuses = ["todo", "in_progress", "blocked", "done"] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export const taskLanes = ["backlog", "todo", "in_progress", "review", "done"] as const;
export type TaskLane = (typeof taskLanes)[number];

export const taskPriorities = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof taskPriorities)[number];

export const taskChangeTypes = ["visual", "non_visual"] as const;
export type TaskChangeType = (typeof taskChangeTypes)[number];

export const taskReviewStates = [
  "not_requested",
  "requested",
  "verifying",
  "passed",
  "changes_requested"
] as const;
export type TaskReviewState = (typeof taskReviewStates)[number];

export const taskMergeStates = [
  "none",
  "pending_ci",
  "merging",
  "merged",
  "blocked_ci_red",
  "failed"
] as const;
export type TaskMergeState = (typeof taskMergeStates)[number];

export const taskCiStates = ["unknown", "pending", "green", "red"] as const;
export type TaskCiState = (typeof taskCiStates)[number];

export interface Task {
  readonly id: TaskId;
  readonly organizationId: OrgId;
  readonly workspaceId: WorkspaceId;
  readonly cardNumber: number;
  readonly title: string;
  readonly description: string;
  readonly lane: TaskLane;
  readonly blocked: boolean;
  readonly blockedReason: string | null;
  /** @deprecated Derived from lane and blocked for legacy consumers. */
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly assigneeUserId: UserId | null;
  readonly overview?: string | null;
  readonly assignedAgentIdentityId?: string | null;
  readonly primaryIssueRef?: string | null;
  readonly primaryPrRef?: string | null;
  readonly branchName?: string | null;
  readonly changeType?: TaskChangeType | null;
  readonly reviewState?: TaskReviewState | null;
  readonly reviewRequestedAt?: Date | null;
  readonly reviewRequestedByAgentIdentityId?: string | null;
  readonly reviewPassedAt?: Date | null;
  readonly reviewPassedByOrchestratorIdentityId?: string | null;
  readonly doneRequestedAt?: Date | null;
  readonly doneByUserId?: string | null;
  readonly mergeState?: TaskMergeState | null;
  readonly ciState?: TaskCiState | null;
  readonly labels: readonly string[];
  readonly position: number;
  readonly dueAt: Date | null;
  readonly provenanceSource: string;
  readonly provenanceExternalRef: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const taskStatusSet = new Set<string>(taskStatuses);
const taskLaneSet = new Set<string>(taskLanes);
const taskPrioritySet = new Set<string>(taskPriorities);

function taskValidationError(code: string, message: string): DomainError {
  return new DomainError({ code, message });
}

export function parseTaskStatus(value: unknown): Result<TaskStatus> {
  if (typeof value === "string" && taskStatusSet.has(value)) {
    return ok(value as TaskStatus);
  }

  return err(
    taskValidationError(
      "projectManagement.invalidTaskStatus",
      "Task status must be todo, in_progress, blocked, or done."
    )
  );
}

export function parseTaskLane(value: unknown): Result<TaskLane> {
  if (typeof value === "string" && taskLaneSet.has(value)) {
    return ok(value as TaskLane);
  }

  return err(
    taskValidationError(
      "projectManagement.invalidTaskLane",
      "Task lane must be backlog, todo, in_progress, review, or done."
    )
  );
}

export function legacyStatusFromLane(lane: TaskLane, blocked: boolean): TaskStatus {
  if (blocked && lane !== "done") {
    return "blocked";
  }

  switch (lane) {
    case "backlog":
    case "todo":
      return "todo";
    case "in_progress":
    case "review":
      return "in_progress";
    case "done":
      return "done";
  }
}

export function laneFromLegacyStatus(status: TaskStatus): { lane: TaskLane; blocked: boolean } {
  switch (status) {
    case "todo":
      return { lane: "todo", blocked: false };
    case "in_progress":
      return { lane: "in_progress", blocked: false };
    case "done":
      return { lane: "done", blocked: false };
    case "blocked":
      return { lane: "in_progress", blocked: true };
  }
}

export function parseTaskPriority(value: unknown): Result<TaskPriority> {
  if (typeof value === "string" && taskPrioritySet.has(value)) {
    return ok(value as TaskPriority);
  }

  return err(
    taskValidationError(
      "projectManagement.invalidTaskPriority",
      "Task priority must be low, normal, high, or urgent."
    )
  );
}

export function normalizeTaskTitle(value: string): Result<string> {
  const title = value.trim().replace(/\s+/g, " ");

  if (title.length === 0) {
    return err(taskValidationError("projectManagement.taskTitleRequired", "Task title is required."));
  }

  if (title.length > 180) {
    return err(
      taskValidationError(
        "projectManagement.taskTitleTooLong",
        "Task title must be 180 characters or fewer."
      )
    );
  }

  return ok(title);
}

export function normalizeTaskDescription(value: string): Result<string> {
  const description = value.trim();

  if (description.length > 4000) {
    return err(
      taskValidationError(
        "projectManagement.taskDescriptionTooLong",
        "Task description must be 4000 characters or fewer."
      )
    );
  }

  return ok(description);
}

export function normalizeTaskLabels(values: readonly string[]): Result<readonly string[]> {
  const labels = values
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
  const uniqueLabels = [...new Set(labels)];

  if (uniqueLabels.length > 8) {
    return err(
      taskValidationError(
        "projectManagement.tooManyTaskLabels",
        "A task can have at most 8 labels."
      )
    );
  }

  const invalidLabel = uniqueLabels.find((label) => label.length > 32);
  if (invalidLabel !== undefined) {
    return err(
      taskValidationError(
        "projectManagement.taskLabelTooLong",
        "Task labels must be 32 characters or fewer."
      )
    );
  }

  return ok(uniqueLabels);
}
