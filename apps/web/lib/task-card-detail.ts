import type {
  AddQualityCheckInput,
  AddTaskEvidenceFileInput,
  AddTaskEvidenceLinkInput,
  ApproveQualityReviewInput,
  CardDetailDto,
  EnqueueIssueCloseInput,
  EnsureTaskQualityReviewInput,
  IssueCloseOutboxDto,
  TaskEvidenceDto,
  TaskQualityReviewDto,
  TaskCommentDto,
  TaskDto,
  TaskPriority,
  TaskStepDto,
  ToggleQualityCheckInput,
} from "@opzava/project-management";
import {
  addComment,
  addQualityCheck,
  addTaskEvidenceFile,
  addTaskEvidenceLink,
  approveQualityReview,
  ensureTaskQualityReview,
  enqueueIssueCloseForTask,
  getCardDetail,
  issueRefFromTask,
  listTasks,
  markCommentsRead,
  moveTask,
  taskPriorities,
  toggleQualityCheck,
  toggleStep,
  updateTask,
} from "@opzava/project-management";
import type { ErrorCapturePort, ObjectStorePort, ObjectStorePresignedRequest } from "@opzava/ports";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";
import { randomUUID } from "node:crypto";

import {
  askAdminAssistantKey,
  getOrCreateAskAdminHistory,
  type AskAdminConversationHistory,
} from "@/lib/ask-admin-history";
import { listTaskCardAssistantRuns, type TaskCardAssistantRunView } from "@/lib/task-card-ai-run";
import { parseCardNumberRouteSegment } from "@/lib/task-card-format";
import {
  evidenceProvenanceLabel,
  validateEvidenceUploadSize,
} from "@/lib/task-card-evidence-quality";
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

export interface PrepareEvidenceUploadCommand {
  readonly taskId: string;
  readonly filename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

export interface PrepareEvidenceUploadResult {
  readonly evidence: TaskEvidenceDto;
  readonly upload: ObjectStorePresignedRequest;
}

export interface AddEvidenceLinkCommand {
  readonly taskId: string;
  readonly url: string;
  readonly title?: string;
}

export interface PresignEvidenceDownloadCommand {
  readonly taskId: string;
  readonly evidenceId: string;
}

export interface AddQualityCheckCommand {
  readonly taskId: string;
  readonly label: string;
}

export interface ToggleQualityCheckCommand {
  readonly taskId: string;
  readonly checkId: string;
  readonly state: "pass" | "fail" | "pending";
}

export interface ApproveQualityReviewCommand {
  readonly taskId: string;
  readonly expectedReviewId?: string;
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
  readonly addTaskEvidenceFile: typeof addTaskEvidenceFile;
  readonly addTaskEvidenceLink: typeof addTaskEvidenceLink;
  readonly ensureTaskQualityReview: typeof ensureTaskQualityReview;
  readonly addQualityCheck: typeof addQualityCheck;
  readonly toggleQualityCheck: typeof toggleQualityCheck;
  readonly approveQualityReview: typeof approveQualityReview;
  readonly objectStorePort?: ObjectStorePort;
  readonly errorCapture?: ErrorCapturePort;
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
  addTaskEvidenceFile,
  addTaskEvidenceLink,
  ensureTaskQualityReview,
  addQualityCheck,
  toggleQualityCheck,
  approveQualityReview,
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

function requireObjectStore(
  dependencies: Pick<TaskCardActionDependencies, "objectStorePort">,
): Result<ObjectStorePort> {
  return dependencies.objectStorePort === undefined
    ? err(webTaskCardError("web.objectStoreUnavailable", "Evidence storage is not configured."))
    : ok(dependencies.objectStorePort);
}

function captureCardError(
  dependencies: Pick<TaskCardActionDependencies, "errorCapture">,
  input: {
    readonly context: AppSessionContext;
    readonly operation: string;
    readonly message: string;
    readonly code?: string;
    readonly cause?: unknown;
  },
): void {
  void dependencies.errorCapture?.capture({
    source: "apps/web",
    operation: input.operation,
    severity: "error",
    message: input.message,
    ...(input.code === undefined ? {} : { code: input.code }),
    details: {
      orgId: input.context.orgId,
      workspaceId: input.context.workspaceId,
      userId: input.context.user.id,
    },
    ...(input.cause === undefined ? {} : { cause: input.cause }),
  });
}

function safeObjectFilename(value: string): string {
  return (
    value
      .trim()
      .replace(/[^\w.=-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "upload"
  );
}

function objectKey(input: {
  readonly context: AppSessionContext;
  readonly taskId: string;
  readonly filename: string;
}): string {
  return [
    input.context.orgId,
    input.context.workspaceId,
    "tasks",
    input.taskId,
    `${randomUUID()}-${safeObjectFilename(input.filename)}`,
  ].join("/");
}

function parseStoredObjectRef(
  value: string,
): Result<{ readonly bucket: string; readonly key: string }> {
  const [bucket, ...keyParts] = value.split("/");
  const key = keyParts.join("/");
  if (bucket === undefined || bucket.trim() === "" || key.trim() === "") {
    return err(
      webTaskCardError("web.invalidEvidenceObjectRef", "Evidence object reference is invalid."),
    );
  }

  return ok({ bucket, key });
}

function actorContext(context: AppSessionContext, taskId: string) {
  return {
    orgId: context.orgId,
    workspaceId: context.workspaceId,
    actor: actorFromSessionContext(context),
    taskId,
  };
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
    linkedIssueCloseIntent: await markLinkedIssueForClose(
      result.value,
      context.value,
      dependencies,
    ),
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

export async function prepareEvidenceUploadForCard(
  input: PrepareEvidenceUploadCommand,
  dependencies: TaskCardActionDependencies,
): Promise<Result<PrepareEvidenceUploadResult>> {
  const context = await requireContext(dependencies);
  if (!context.ok) {
    return err(context.error);
  }

  const size = validateEvidenceUploadSize(input.sizeBytes);
  if (!size.ok) {
    return err(
      webTaskCardError("web.evidenceUploadTooLarge", size.message ?? "File is too large."),
    );
  }

  const store = requireObjectStore(dependencies);
  if (!store.ok) {
    captureCardError(dependencies, {
      context: context.value,
      operation: "task-card.evidence.presign",
      message: store.error.message,
      code: store.error.code,
    });
    return err(store.error);
  }

  const key = objectKey({
    context: context.value,
    taskId: input.taskId,
    filename: input.filename,
  });
  const upload = await store.value.presignPutObject({
    key,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    expiresInSeconds: 10 * 60,
  });
  if (!upload.ok) {
    captureCardError(dependencies, {
      context: context.value,
      operation: "task-card.evidence.presign",
      message: "Evidence upload URL could not be prepared.",
      code: upload.error.code,
      cause: upload.error,
    });
    return err(upload.error);
  }

  const evidence = await dependencies.addTaskEvidenceFile({
    ...actorContext(context.value, input.taskId),
    objectRef: `${upload.value.ref.bucket}/${upload.value.ref.key}`,
    filename: input.filename,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    provenance: evidenceProvenanceLabel({ source: "upload" }),
  } satisfies AddTaskEvidenceFileInput);
  if (!evidence.ok) {
    return err(evidence.error);
  }

  dependencies.revalidateTaskPaths?.({});
  return ok({
    evidence: evidence.value,
    upload: upload.value,
  });
}

export async function addEvidenceLinkForCard(
  input: AddEvidenceLinkCommand,
  dependencies: TaskCardActionDependencies,
): Promise<Result<TaskEvidenceDto>> {
  const context = await requireContext(dependencies);
  if (!context.ok) {
    return err(context.error);
  }

  const result = await dependencies.addTaskEvidenceLink({
    ...actorContext(context.value, input.taskId),
    url: input.url,
    ...(input.title === undefined ? {} : { title: input.title }),
    provenance: evidenceProvenanceLabel({ source: "link" }),
  } satisfies AddTaskEvidenceLinkInput);
  if (!result.ok) {
    return err(result.error);
  }

  dependencies.revalidateTaskPaths?.({});
  return result;
}

export async function presignEvidenceDownloadForCard(
  input: PresignEvidenceDownloadCommand,
  dependencies: TaskCardActionDependencies,
): Promise<Result<ObjectStorePresignedRequest>> {
  const context = await requireContext(dependencies);
  if (!context.ok) {
    return err(context.error);
  }

  const card = await dependencies.getCardDetail({
    ...actorContext(context.value, input.taskId),
  });
  if (!card.ok) {
    return err(card.error);
  }

  const evidence = card.value.evidence.find((item) => item.id === input.evidenceId);
  if (evidence === undefined || evidence.kind !== "file" || evidence.objectRef === null) {
    return err(webTaskCardError("web.evidenceNotFound", "Evidence file was not found."));
  }

  const ref = parseStoredObjectRef(evidence.objectRef);
  if (!ref.ok) {
    return err(ref.error);
  }

  const store = requireObjectStore(dependencies);
  if (!store.ok) {
    captureCardError(dependencies, {
      context: context.value,
      operation: "task-card.evidence.download",
      message: store.error.message,
      code: store.error.code,
    });
    return err(store.error);
  }

  const signed = await store.value.presignGetObject({
    ref: ref.value,
    expiresInSeconds: 5 * 60,
    filename: evidence.filename,
  });
  if (!signed.ok) {
    captureCardError(dependencies, {
      context: context.value,
      operation: "task-card.evidence.download",
      message: "Evidence download URL could not be prepared.",
      code: signed.error.code,
      cause: signed.error,
    });
    return err(signed.error);
  }

  return signed;
}

export async function addQualityCheckForCard(
  input: AddQualityCheckCommand,
  dependencies: TaskCardActionDependencies,
): Promise<Result<TaskQualityReviewDto>> {
  const context = await requireContext(dependencies);
  if (!context.ok) {
    return err(context.error);
  }

  const result = await dependencies.addQualityCheck({
    ...actorContext(context.value, input.taskId),
    label: input.label,
    kind: "human",
    state: "pending",
    actorLabel: context.value.user.name,
  } satisfies AddQualityCheckInput);
  if (!result.ok) {
    return err(result.error);
  }

  dependencies.revalidateTaskPaths?.({});
  return result;
}

export async function toggleQualityCheckForCard(
  input: ToggleQualityCheckCommand,
  dependencies: TaskCardActionDependencies,
): Promise<Result<TaskQualityReviewDto>> {
  const context = await requireContext(dependencies);
  if (!context.ok) {
    return err(context.error);
  }

  const result = await dependencies.toggleQualityCheck({
    ...actorContext(context.value, input.taskId),
    checkId: input.checkId,
    state: input.state,
  } satisfies ToggleQualityCheckInput);
  if (!result.ok) {
    return err(result.error);
  }

  dependencies.revalidateTaskPaths?.({});
  return result;
}

export async function approveQualityReviewForCard(
  input: ApproveQualityReviewCommand,
  dependencies: TaskCardActionDependencies,
): Promise<Result<TaskQualityReviewDto>> {
  const context = await requireContext(dependencies);
  if (!context.ok) {
    return err(context.error);
  }

  const ensured = await dependencies.ensureTaskQualityReview({
    ...actorContext(context.value, input.taskId),
  } satisfies EnsureTaskQualityReviewInput);
  if (!ensured.ok) {
    return err(ensured.error);
  }

  const result = await dependencies.approveQualityReview({
    ...actorContext(context.value, input.taskId),
    expectedReviewId: input.expectedReviewId ?? ensured.value.id,
  } satisfies ApproveQualityReviewInput);
  if (!result.ok) {
    captureCardError(dependencies, {
      context: context.value,
      operation: "task-card.quality.approve",
      message: result.error.message,
      code: result.error.code,
      cause: result.error,
    });
    return err(result.error);
  }

  dependencies.revalidateTaskPaths?.({});
  return result;
}
