import type { CardDetailDto, TaskDto, TaskPriority, TaskStepDto } from "@opzava/project-management";
import {
  getCardDetail,
  listTasks,
  moveTask,
  taskPriorities,
  toggleStep,
  updateTask,
} from "@opzava/project-management";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import { parseCardNumberRouteSegment } from "@/lib/task-card-format";
import type { AppSessionContext } from "@/lib/session";

export interface TaskCardPageData {
  readonly context: AppSessionContext;
  readonly card: CardDetailDto;
}

export type LinkedIssueCloseIntent =
  | {
      readonly kind: "no_linked_issue";
      readonly taskId: string;
      readonly cardNumber: number;
    }
  | {
      readonly kind: "deferred_to_slice_2_5e";
      readonly taskId: string;
      readonly cardNumber: number;
      readonly targetRef: string;
    };

export interface MarkDoneResult {
  readonly task: TaskDto;
  readonly linkedIssueCloseIntent: LinkedIssueCloseIntent;
}

export interface ToggleTaskStepCommand {
  readonly taskId: string;
  readonly stepId: string;
  readonly done: boolean;
}

export interface MarkTaskDoneCommand {
  readonly taskId: string;
}

export interface UpdateTaskCardCommand {
  readonly taskId: string;
  readonly title: string;
  readonly description: string;
  readonly priority: string;
  readonly labels: string;
}

export interface TaskCardLoadDependencies {
  readonly getSessionContext: () => Promise<AppSessionContext | null>;
  readonly listTasks: typeof listTasks;
  readonly getCardDetail: typeof getCardDetail;
}

export interface TaskCardActionDependencies {
  readonly getSessionContext: () => Promise<AppSessionContext | null>;
  readonly listTasks: typeof listTasks;
  readonly moveTask: typeof moveTask;
  readonly toggleStep: typeof toggleStep;
  readonly updateTask: typeof updateTask;
  readonly revalidateTaskPaths?: (task: { readonly cardNumber?: number }) => void;
}

export const defaultTaskCardLoadDependencies: Omit<TaskCardLoadDependencies, "getSessionContext"> =
  {
    listTasks,
    getCardDetail,
  };

export const defaultTaskCardActionDependencies: Omit<
  TaskCardActionDependencies,
  "getSessionContext"
> = {
  listTasks,
  moveTask,
  toggleStep,
  updateTask,
};

const taskPrioritySet = new Set<string>(taskPriorities);

function webTaskCardError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

export function actorFromSessionContext(context: AppSessionContext) {
  return {
    userId: context.user.id,
    roleKeys: context.roleKeys,
  };
}

export function isTaskCardNotFound(error: unknown): boolean {
  const code = errorCode(error);
  return code === "web.taskCardNotFound" || code === "projectManagement.taskNotFound";
}

export function isTaskCardForbidden(error: unknown): boolean {
  return errorCode(error) === "projectManagement.forbidden" || errorStatus(error) === 403;
}

export function errorStatus(error: unknown, depth = 0): number | undefined {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return undefined;
  }

  const status = (error as { readonly status?: unknown }).status;
  return typeof status === "number"
    ? status
    : errorStatus((error as { readonly cause?: unknown }).cause, depth + 1);
}

export function errorCode(error: unknown, depth = 0): string | undefined {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return undefined;
  }

  const code = (error as { readonly code?: unknown }).code;
  return typeof code === "string"
    ? code
    : errorCode((error as { readonly cause?: unknown }).cause, depth + 1);
}

function labelsFromString(value: string): readonly string[] {
  return value.split(",");
}

function normalizeUpdateCommand(input: UpdateTaskCardCommand): Result<{
  readonly priority: TaskPriority;
  readonly labels: readonly string[];
}> {
  if (!taskPrioritySet.has(input.priority)) {
    return err(
      webTaskCardError(
        "web.taskCardInvalidPriority",
        "Task priority must be low, normal, high, or urgent.",
      ),
    );
  }

  return ok({
    priority: input.priority as TaskPriority,
    labels: labelsFromString(input.labels),
  });
}

async function requireContext(
  dependencies: Pick<TaskCardLoadDependencies | TaskCardActionDependencies, "getSessionContext">,
): Promise<Result<AppSessionContext>> {
  const context = await dependencies.getSessionContext();
  return context === null
    ? err(webTaskCardError("web.taskCardUnauthenticated", "Sign in to view this task card."))
    : ok(context);
}

export async function loadTaskCardPageData(
  input: { readonly cardId: string },
  dependencies: TaskCardLoadDependencies,
): Promise<Result<TaskCardPageData>> {
  const cardNumber = parseCardNumberRouteSegment(input.cardId);
  if (cardNumber === null) {
    return err(webTaskCardError("web.taskCardNotFound", "Task card was not found."));
  }

  const context = await requireContext(dependencies);
  if (!context.ok) {
    return err(context.error);
  }

  const actor = actorFromSessionContext(context.value);
  const tasks = await dependencies.listTasks({
    orgId: context.value.orgId,
    workspaceId: context.value.workspaceId,
    actor,
  });
  if (!tasks.ok) {
    return err(tasks.error);
  }

  const task = tasks.value.find((candidate) => candidate.cardNumber === cardNumber);
  if (task === undefined) {
    return err(webTaskCardError("web.taskCardNotFound", "Task card was not found."));
  }

  const card = await dependencies.getCardDetail({
    orgId: context.value.orgId,
    workspaceId: context.value.workspaceId,
    actor,
    taskId: task.id,
  });
  if (!card.ok) {
    return err(card.error);
  }

  return ok({
    context: context.value,
    card: card.value,
  });
}

export function markLinkedIssueForClose(task: TaskDto): LinkedIssueCloseIntent {
  const targetRef = task.provenanceExternalRef;

  if (targetRef === null || !/^github:/i.test(targetRef)) {
    return {
      kind: "no_linked_issue",
      taskId: task.id,
      cardNumber: task.cardNumber,
    };
  }

  return {
    kind: "deferred_to_slice_2_5e",
    taskId: task.id,
    cardNumber: task.cardNumber,
    targetRef,
  };
}

export async function toggleTaskStepForCard(
  input: ToggleTaskStepCommand,
  dependencies: TaskCardActionDependencies,
): Promise<Result<TaskStepDto>> {
  const context = await requireContext(dependencies);
  if (!context.ok) {
    return err(context.error);
  }

  const result = await dependencies.toggleStep({
    orgId: context.value.orgId,
    workspaceId: context.value.workspaceId,
    actor: actorFromSessionContext(context.value),
    taskId: input.taskId,
    stepId: input.stepId,
    done: input.done,
  });

  if (!result.ok) {
    return err(result.error);
  }

  dependencies.revalidateTaskPaths?.({});
  return result;
}

export async function markTaskDoneForCard(
  input: MarkTaskDoneCommand,
  dependencies: TaskCardActionDependencies,
): Promise<Result<MarkDoneResult>> {
  const context = await requireContext(dependencies);
  if (!context.ok) {
    return err(context.error);
  }

  const actor = actorFromSessionContext(context.value);
  const tasks = await dependencies.listTasks({
    orgId: context.value.orgId,
    workspaceId: context.value.workspaceId,
    actor,
  });
  if (!tasks.ok) {
    return err(tasks.error);
  }

  const nextDonePosition =
    tasks.value
      .filter((task) => task.status === "done")
      .reduce((max, task) => Math.max(max, task.position), 0) + 1;

  const result = await dependencies.moveTask({
    orgId: context.value.orgId,
    workspaceId: context.value.workspaceId,
    actor,
    taskId: input.taskId,
    status: "done",
    position: nextDonePosition,
  });
  if (!result.ok) {
    return err(result.error);
  }

  dependencies.revalidateTaskPaths?.({ cardNumber: result.value.cardNumber });
  return ok({
    task: result.value,
    linkedIssueCloseIntent: markLinkedIssueForClose(result.value),
  });
}

export async function updateTaskCardDetails(
  input: UpdateTaskCardCommand,
  dependencies: TaskCardActionDependencies,
): Promise<Result<TaskDto>> {
  const context = await requireContext(dependencies);
  if (!context.ok) {
    return err(context.error);
  }

  const normalized = normalizeUpdateCommand(input);
  if (!normalized.ok) {
    return err(normalized.error);
  }

  const result = await dependencies.updateTask({
    orgId: context.value.orgId,
    workspaceId: context.value.workspaceId,
    actor: actorFromSessionContext(context.value),
    taskId: input.taskId,
    title: input.title,
    description: input.description,
    priority: normalized.value.priority,
    labels: normalized.value.labels,
  });
  if (!result.ok) {
    return err(result.error);
  }

  dependencies.revalidateTaskPaths?.({ cardNumber: result.value.cardNumber });
  return result;
}
