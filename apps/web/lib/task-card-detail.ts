import type {
  CardDetailDto,
  EnqueueIssueCloseInput,
  IssueCloseOutboxDto,
  TaskCommentDto,
  TaskDto,
  TaskPriority,
  TaskStepDto,
} from "@opzava/project-management";
import {
  addComment,
  enqueueIssueCloseForTask,
  getCardDetail,
  issueRefFromTask,
  listTasks,
  markCommentsRead,
  moveTask,
  taskPriorities,
  toggleStep,
  updateTask,
} from "@opzava/project-management";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import {
  askAdminAssistantKey,
  getOrCreateAskAdminHistory,
  type AskAdminConversationHistory,
} from "@/lib/ask-admin-history";
import { listTaskCardAssistantRuns, type TaskCardAssistantRunView } from "@/lib/task-card-ai-run";
import { parseCardNumberRouteSegment } from "@/lib/task-card-format";
import {
  evaluateAssistantMentionGuard,
  parseMentions,
  stableMentionMessageHash,
  targetMentionKey,
  type MentionTarget,
} from "@/lib/task-card-mentions";
import type { AppSessionContext } from "@/lib/session";

export interface TaskCardPageData {
  readonly context: AppSessionContext;
  readonly card: CardDetailDto;
  readonly assistantRuns: readonly TaskCardAssistantRunView[];
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
      readonly outbox: IssueCloseOutboxDto | null;
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

export interface PostTaskCommentCommand {
  readonly taskId: string;
  readonly body: string;
  readonly mentionChainDepth?: number;
}

export interface MarkTaskCommentsReadCommand {
  readonly taskId: string;
  readonly commentIds?: readonly string[];
}

export interface AssistantMentionDispatch {
  readonly conversationId: string;
  readonly prompt: string;
  readonly idempotencyKey: string;
  readonly messageHash: string;
}

export interface PostTaskCommentResult {
  readonly comment: TaskCommentDto;
  readonly assistantDispatch: AssistantMentionDispatch | null;
}

export interface TaskCardLoadDependencies {
  readonly getSessionContext: () => Promise<AppSessionContext | null>;
  readonly listTasks: typeof listTasks;
  readonly getCardDetail: typeof getCardDetail;
  readonly listTaskCardAssistantRuns: typeof listTaskCardAssistantRuns;
}

export interface TaskCardActionDependencies {
  readonly getSessionContext: () => Promise<AppSessionContext | null>;
  readonly addComment: typeof addComment;
  readonly getCardDetail: typeof getCardDetail;
  readonly getOrCreateAskAdminHistory: typeof getOrCreateAskAdminHistory;
  readonly listTasks: typeof listTasks;
  readonly markCommentsRead: typeof markCommentsRead;
  readonly moveTask: typeof moveTask;
  readonly toggleStep: typeof toggleStep;
  readonly updateTask: typeof updateTask;
  readonly enqueueIssueCloseForTask?: typeof enqueueIssueCloseForTask;
  readonly revalidateTaskPaths?: (task: { readonly cardNumber?: number }) => void;
}

export const defaultTaskCardLoadDependencies: Omit<TaskCardLoadDependencies, "getSessionContext"> =
  {
    listTasks,
    getCardDetail,
    listTaskCardAssistantRuns,
  };

export const defaultTaskCardActionDependencies: Omit<
  TaskCardActionDependencies,
  "getSessionContext"
> = {
  addComment,
  getCardDetail,
  getOrCreateAskAdminHistory,
  listTasks,
  markCommentsRead,
  moveTask,
  toggleStep,
  updateTask,
  enqueueIssueCloseForTask,
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

function commentBody(input: PostTaskCommentCommand): Result<string> {
  const body = input.body.trim();
  if (body.length === 0 || body.length > 4000) {
    return err(
      webTaskCardError("web.taskCardInvalidComment", "Comment body must be 1-4000 characters."),
    );
  }

  return ok(body);
}

function mentionTargetsForCard(
  context: AppSessionContext,
  card: CardDetailDto,
): readonly MentionTarget[] {
  const humanTargets = new Map<string, MentionTarget>();
  humanTargets.set(context.user.id, {
    key: targetMentionKey({ key: context.user.id, label: context.user.name }),
    label: context.user.name,
    kind: "human",
    userId: context.user.id,
  });

  for (const watcher of card.watchers) {
    const label = watcher.name ?? watcher.userId;
    humanTargets.set(watcher.userId, {
      key: targetMentionKey({ key: watcher.userId, label }),
      label,
      kind: "human",
      userId: watcher.userId,
    });
  }

  return [
    ...humanTargets.values(),
    {
      key: "ask-admin-opzava",
      label: "Ask Admin Opzava",
      kind: "assistant",
      assistantKey: askAdminAssistantKey,
    },
  ];
}

function assistantMentionDispatchPrompt(input: {
  readonly card: CardDetailDto;
  readonly cardNumber: number;
  readonly body: string;
}): string {
  return [
    `Task card ${input.cardNumber} (${input.card.task.id}) was mentioned from its comment thread.`,
    `Title: ${input.card.task.title}`,
    `Current status: ${input.card.task.status}`,
    `Comment: ${input.body}`,
    "Reply on the card and use Opzava task tools only when a task change is required.",
  ].join("\n");
}

function previousAssistantMentionRecords(card: CardDetailDto): {
  readonly count: number;
  readonly hashes: readonly { readonly messageHash: string }[];
} {
  const targets = mentionTargetsForCard(
    {
      sessionId: "",
      user: { id: "", email: "", name: "" },
      orgId: card.task.organizationId,
      organizationName: "",
      organizationLifecycleState: "",
      workspaceId: card.task.workspaceId,
      workspaceName: "",
      roleKeys: [],
    },
    card,
  );
  const assistantMentionComments = card.comments.filter((comment) =>
    parseMentions(comment.body, targets).some((mention) => mention.kind === "assistant"),
  );

  return {
    count: assistantMentionComments.length,
    hashes: assistantMentionComments.map((comment) => ({
      messageHash: stableMentionMessageHash({
        cardTaskId: card.task.id,
        body: comment.body,
      }),
    })),
  };
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

  const assistantRuns = await dependencies.listTaskCardAssistantRuns(context.value, task.id);

  return ok({
    context: context.value,
    card: card.value,
    assistantRuns,
  });
}

export async function markLinkedIssueForClose(
  task: TaskDto,
  context: AppSessionContext,
  dependencies: Pick<TaskCardActionDependencies, "enqueueIssueCloseForTask">,
): Promise<LinkedIssueCloseIntent> {
  const targetRef = task.provenanceExternalRef;
  const issueRef = issueRefFromTask(task);

  if (targetRef === null || issueRef === null) {
    return {
      kind: "no_linked_issue",
      taskId: task.id,
      cardNumber: task.cardNumber,
    };
  }

  const enqueue = dependencies.enqueueIssueCloseForTask ?? enqueueIssueCloseForTask;
  const queued = await enqueue({
    orgId: context.orgId,
    workspaceId: context.workspaceId,
    actor: actorFromSessionContext(context),
    task,
  } satisfies EnqueueIssueCloseInput);

  return {
    kind: "deferred_to_slice_2_5e",
    taskId: task.id,
    cardNumber: task.cardNumber,
    targetRef,
    outbox: queued.ok ? queued.value : null,
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
    linkedIssueCloseIntent: await markLinkedIssueForClose(result.value, context.value, dependencies),
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

export async function postTaskCommentForCard(
  input: PostTaskCommentCommand,
  dependencies: TaskCardActionDependencies,
): Promise<Result<PostTaskCommentResult>> {
  const context = await requireContext(dependencies);
  if (!context.ok) {
    return err(context.error);
  }

  const body = commentBody(input);
  if (!body.ok) {
    return err(body.error);
  }

  const actor = actorFromSessionContext(context.value);
  const card = await dependencies.getCardDetail({
    orgId: context.value.orgId,
    workspaceId: context.value.workspaceId,
    actor,
    taskId: input.taskId,
  });
  if (!card.ok) {
    return err(card.error);
  }

  const previousMentions = previousAssistantMentionRecords(card.value);
  const mentionGuard = evaluateAssistantMentionGuard({
    body: body.value,
    cardTaskId: card.value.task.id,
    authorKind: "human",
    targets: mentionTargetsForCard(context.value, card.value),
    chainDepth: input.mentionChainDepth ?? 0,
    previousAssistantMentionCount: previousMentions.count,
    previousDispatches: previousMentions.hashes,
  });
  if (mentionGuard.action === "blocked") {
    return err(webTaskCardError(`web.${mentionGuard.code}`, mentionGuard.message));
  }

  const added = await dependencies.addComment({
    orgId: context.value.orgId,
    workspaceId: context.value.workspaceId,
    actor,
    taskId: input.taskId,
    authorKind: "human",
    body: body.value,
  });
  if (!added.ok) {
    return err(added.error);
  }

  let assistantDispatch: AssistantMentionDispatch | null = null;
  if (mentionGuard.action === "dispatch") {
    const history: Result<AskAdminConversationHistory> =
      await dependencies.getOrCreateAskAdminHistory(context.value);
    if (!history.ok) {
      return err(history.error);
    }

    assistantDispatch = {
      conversationId: history.value.conversationId,
      prompt: assistantMentionDispatchPrompt({
        card: card.value,
        cardNumber: card.value.task.cardNumber,
        body: body.value,
      }),
      idempotencyKey: `card-${card.value.task.id}-${mentionGuard.messageHash}`,
      messageHash: mentionGuard.messageHash,
    };
  }

  dependencies.revalidateTaskPaths?.({ cardNumber: card.value.task.cardNumber });
  return ok({
    comment: added.value,
    assistantDispatch,
  });
}

export async function markTaskCommentsReadForCard(
  input: MarkTaskCommentsReadCommand,
  dependencies: TaskCardActionDependencies,
): Promise<Result<readonly TaskCommentDto[]>> {
  const context = await requireContext(dependencies);
  if (!context.ok) {
    return err(context.error);
  }

  const result = await dependencies.markCommentsRead({
    orgId: context.value.orgId,
    workspaceId: context.value.workspaceId,
    actor: actorFromSessionContext(context.value),
    taskId: input.taskId,
    ...(input.commentIds === undefined ? {} : { commentIds: input.commentIds }),
  });
  if (!result.ok) {
    return err(result.error);
  }

  dependencies.revalidateTaskPaths?.({});
  return result;
}
