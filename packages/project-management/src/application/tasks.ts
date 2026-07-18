import { mapDatabaseError, sql, withTenant, type TenantTransaction } from "@opzava/adapters";
import type { AuthorizationPort, AuthorizationSubject } from "@opzava/ports";
import {
  DomainError,
  err,
  makeOrgId,
  makeTaskId,
  makeTenantId,
  makeUserId,
  makeWorkspaceId,
  ok,
  type Result,
} from "@opzava/shared-kernel";

import { defaultTaskAuthorizationPort } from "./authorization.js";
import {
  isTerminalTaskStatus,
  normalizeTaskDescription,
  normalizeTaskLabels,
  normalizeTaskTitle,
  parseTaskPriority,
  parseTaskStatus,
  type TaskPriority,
  type TaskStatus,
} from "../domain/task.js";

export interface TaskActor {
  readonly userId: string;
  readonly roleKeys: readonly string[];
}

export interface TaskApplicationContext {
  readonly orgId: string;
  readonly workspaceId: string;
  readonly actor: TaskActor;
}

export interface TaskDto {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly cardNumber: number;
  readonly title: string;
  readonly description: string;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly assigneeUserId: string | null;
  readonly assigneeName: string | null;
  readonly labels: readonly string[];
  readonly position: number;
  readonly dueAt: string | null;
  readonly provenanceSource: string;
  readonly provenanceExternalRef: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateTaskInput extends TaskApplicationContext {
  readonly title: string;
  readonly description?: string;
  readonly status?: TaskStatus;
  readonly priority?: TaskPriority;
  readonly assigneeUserId?: string | null;
  readonly labels?: readonly string[];
  readonly dueAt?: string | Date | null;
  readonly provenanceSource?: string;
  readonly provenanceExternalRef?: string | null;
  readonly idempotencyKey?: string;
}

export interface UpdateTaskInput extends TaskApplicationContext {
  readonly taskId: string;
  readonly title: string;
  readonly description?: string;
  readonly priority: TaskPriority;
  readonly assigneeUserId?: string | null;
  readonly labels?: readonly string[];
}

export interface MoveTaskInput extends TaskApplicationContext {
  readonly taskId: string;
  readonly status: TaskStatus;
  readonly position: number;
}

export interface HumanCommandAttestation {
  readonly confirmedByUserId: string;
  readonly confirmSource: "admin-web";
  readonly confirmNonce: string;
}

export interface IssueDoneConfirmationInput extends TaskApplicationContext {
  readonly taskId: string;
}

export interface MarkTaskDoneInput extends TaskApplicationContext {
  readonly taskId: string;
  readonly position: number;
  readonly humanCommand: HumanCommandAttestation;
}

export interface GetTaskInput extends TaskApplicationContext {
  readonly taskId: string;
}

export type ListTasksInput = TaskApplicationContext;

export interface TaskStepDto {
  readonly id: string;
  readonly taskId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly text: string;
  readonly assigneeUserId: string | null;
  readonly done: boolean;
  readonly position: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type TaskCommentAuthorKind = "human" | "assistant";

export interface TaskCommentDto {
  readonly id: string;
  readonly taskId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly authorKind: TaskCommentAuthorKind;
  readonly authorUserId: string | null;
  readonly assistantKey: string | null;
  readonly body: string;
  readonly readByUserIds: readonly string[];
  readonly createdAt: string;
}

export interface TaskWatcherDto {
  readonly taskId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly name: string | null;
  readonly createdAt: string;
}

export type TaskEvidenceKind = "file" | "link";

export interface TaskEvidenceDto {
  readonly id: string;
  readonly taskId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly kind: TaskEvidenceKind;
  readonly objectRef: string | null;
  readonly url: string | null;
  readonly filename: string;
  readonly contentType: string | null;
  readonly sizeBytes: number | null;
  readonly provenance: string;
  readonly createdByUserId: string | null;
  readonly createdAt: string;
}

export type TaskQualityReviewStatus = "open" | "approved" | "changes_requested";
export type TaskQualityCheckKind = "ai_precheck" | "human";
export type TaskQualityCheckState = "pass" | "fail" | "pending";
export type TaskQualityReviewerState = "pending" | "approved" | "changes_requested";

export interface TaskQualityCheckDto {
  readonly id: string;
  readonly reviewId: string;
  readonly taskId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly label: string;
  readonly kind: TaskQualityCheckKind;
  readonly state: TaskQualityCheckState;
  readonly actor: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TaskQualityReviewerDto {
  readonly id: string;
  readonly reviewId: string;
  readonly taskId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly reviewerUserId: string;
  readonly reviewerName: string | null;
  readonly state: TaskQualityReviewerState;
  readonly updatedAt: string;
}

export interface TaskQualityReviewDto {
  readonly id: string;
  readonly taskId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly status: TaskQualityReviewStatus;
  readonly approvedByUserId: string | null;
  readonly approvedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly checks: readonly TaskQualityCheckDto[];
  readonly reviewers: readonly TaskQualityReviewerDto[];
}

export interface CardDetailDto {
  readonly task: TaskDto;
  readonly steps: readonly TaskStepDto[];
  readonly comments: readonly TaskCommentDto[];
  readonly watchers: readonly TaskWatcherDto[];
  readonly evidence: readonly TaskEvidenceDto[];
  readonly qualityReview: TaskQualityReviewDto | null;
}

export interface CreateStepInput extends TaskApplicationContext {
  readonly taskId: string;
  readonly text: string;
  readonly assigneeUserId?: string | null;
  readonly idempotencyKey?: string;
}

export interface ToggleStepInput extends TaskApplicationContext {
  readonly taskId: string;
  readonly stepId: string;
  readonly done: boolean;
}

export interface ReorderStepsInput extends TaskApplicationContext {
  readonly taskId: string;
  readonly stepIds: readonly string[];
}

export interface AddCommentInput extends TaskApplicationContext {
  readonly taskId: string;
  readonly authorKind?: TaskCommentAuthorKind;
  readonly assistantKey?: string | null;
  readonly body: string;
  readonly idempotencyKey?: string;
}

export interface SetDueInput extends TaskApplicationContext {
  readonly taskId: string;
  readonly dueAt: string | Date | null;
}

export interface SetWatchersInput extends TaskApplicationContext {
  readonly taskId: string;
  readonly userIds: readonly string[];
}

export interface MarkCommentsReadInput extends TaskApplicationContext {
  readonly taskId: string;
  readonly commentIds?: readonly string[];
}

export interface GetCardDetailInput extends TaskApplicationContext {
  readonly taskId: string;
}

export interface AddTaskEvidenceFileInput extends TaskApplicationContext {
  readonly taskId: string;
  readonly objectRef: string;
  readonly filename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly provenance?: string;
}

export interface AddTaskEvidenceLinkInput extends TaskApplicationContext {
  readonly taskId: string;
  readonly url: string;
  readonly title?: string;
  readonly provenance?: string;
}

export interface ListTaskEvidenceInput extends TaskApplicationContext {
  readonly taskId: string;
}

export interface EnsureTaskQualityReviewInput extends TaskApplicationContext {
  readonly taskId: string;
}

export interface AddQualityCheckInput extends TaskApplicationContext {
  readonly taskId: string;
  readonly label: string;
  readonly kind?: TaskQualityCheckKind;
  readonly state?: TaskQualityCheckState;
  readonly actorLabel?: string;
  readonly idempotencyKey?: string;
}

export interface ToggleQualityCheckInput extends TaskApplicationContext {
  readonly taskId: string;
  readonly checkId: string;
  readonly state: TaskQualityCheckState;
}

export interface ApproveQualityReviewInput extends TaskApplicationContext {
  readonly taskId: string;
  readonly expectedReviewId?: string;
}

export interface TaskApplicationDependencies {
  readonly authorizationPort?: AuthorizationPort;
}

interface PreparedTaskFields {
  readonly title: string;
  readonly description: string;
  readonly priority: TaskPriority;
  readonly assigneeUserId: string | null;
  readonly labels: readonly string[];
  readonly dueAt: string | null;
  readonly provenanceSource: string;
  readonly provenanceExternalRef: string | null;
}

type QueryRow = Record<string, unknown>;

class TaskDatabaseAttemptError extends Error {
  public readonly rawError: unknown;

  public constructor(rawError: unknown) {
    super("Task database operation failed.");
    this.name = "TaskDatabaseAttemptError";
    this.rawError = rawError;
  }
}

class TaskCommandRollbackError extends Error {
  public readonly domainError: DomainError;

  public constructor(domainError: DomainError) {
    super(domainError.message);
    this.name = "TaskCommandRollbackError";
    this.domainError = domainError;
  }
}

function taskError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

function taskDoneRequiresHumanAttestation(): DomainError {
  return taskError(
    "projectManagement.taskDoneRequiresHumanAttestation",
    "Marking a task Done requires the confirmed human Done action.",
  );
}

function taskDoneRequiresApprovedReview(): DomainError {
  return taskError(
    "projectManagement.taskDoneRequiresApprovedReview",
    "A task can only be marked Done after its quality review is approved.",
  );
}

function databaseError(error: unknown): DomainError {
  return taskError(
    "projectManagement.databaseError",
    "Database operation failed.",
    mapDatabaseError(error),
  );
}

function unwrapTaskDatabaseAttemptError(error: unknown): unknown {
  return error instanceof TaskDatabaseAttemptError ? error.rawError : error;
}

function errorStringField(error: unknown, field: string, depth = 0): string | null {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return null;
  }

  const value = (error as Record<string, unknown>)[field];
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }

  return errorStringField((error as { readonly cause?: unknown }).cause, field, depth + 1);
}

function errorMessageIncludes(error: unknown, needle: string, depth = 0): boolean {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return false;
  }

  if (error instanceof Error && error.message.includes(needle)) {
    return true;
  }

  return errorMessageIncludes((error as { readonly cause?: unknown }).cause, needle, depth + 1);
}

function isWorkspaceCardNumberUniqueViolation(error: unknown): boolean {
  if (errorStringField(error, "code") !== "23505") {
    return false;
  }

  const constraint =
    errorStringField(error, "constraint") ?? errorStringField(error, "constraint_name");
  return (
    constraint === "tasks_workspace_card_number_unique" ||
    (constraint === null && errorMessageIncludes(error, "tasks_workspace_card_number_unique"))
  );
}

function rowsFromExecuteResult(result: unknown): readonly QueryRow[] {
  if (Array.isArray(result)) {
    return result as readonly QueryRow[];
  }

  if (typeof result !== "object" || result === null || !("rows" in result)) {
    return [];
  }

  const rows = (result as { readonly rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as readonly QueryRow[]) : [];
}

function parseDate(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return new Date(value).toISOString();
  }

  throw taskError(
    "projectManagement.invalidTaskRecord",
    "Task record contains an invalid timestamp.",
  );
}

function parseNullableDate(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return parseDate(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function rowToTaskDto(row: QueryRow): TaskDto {
  const status = parseTaskStatus(row["status"]);
  const priority = parseTaskPriority(row["priority"]);

  if (!status.ok) {
    throw status.error;
  }

  if (!priority.ok) {
    throw priority.error;
  }

  const labels = row["labels"];

  return {
    id: String(row["id"]),
    organizationId: String(row["organization_id"]),
    workspaceId: String(row["workspace_id"]),
    cardNumber: Number(row["card_number"]),
    title: String(row["title"]),
    description: String(row["description"] ?? ""),
    status: status.value,
    priority: priority.value,
    assigneeUserId: stringOrNull(row["assignee_user_id"]),
    assigneeName: stringOrNull(row["assignee_name"]),
    labels: stringArray(labels),
    position: Number(row["position"]),
    dueAt: parseNullableDate(row["due_at"]),
    provenanceSource: String(row["provenance_source"] ?? "manual"),
    provenanceExternalRef: stringOrNull(row["provenance_external_ref"]),
    createdAt: parseDate(row["created_at"]),
    updatedAt: parseDate(row["updated_at"]),
  };
}

function rowToStepDto(row: QueryRow): TaskStepDto {
  return {
    id: String(row["id"]),
    taskId: String(row["task_id"]),
    organizationId: String(row["organization_id"]),
    workspaceId: String(row["workspace_id"]),
    text: String(row["text"]),
    assigneeUserId: stringOrNull(row["assignee_user_id"]),
    done: row["done"] === true,
    position: Number(row["position"]),
    createdAt: parseDate(row["created_at"]),
    updatedAt: parseDate(row["updated_at"]),
  };
}

function rowToCommentDto(row: QueryRow): TaskCommentDto {
  const authorKind = row["author_kind"] === "assistant" ? "assistant" : "human";

  return {
    id: String(row["id"]),
    taskId: String(row["task_id"]),
    organizationId: String(row["organization_id"]),
    workspaceId: String(row["workspace_id"]),
    authorKind,
    authorUserId: stringOrNull(row["author_user_id"]),
    assistantKey: stringOrNull(row["assistant_key"]),
    body: String(row["body"]),
    readByUserIds: stringArray(row["read_by_user_ids"]),
    createdAt: parseDate(row["created_at"]),
  };
}

function rowToWatcherDto(row: QueryRow): TaskWatcherDto {
  return {
    taskId: String(row["task_id"]),
    organizationId: String(row["organization_id"]),
    workspaceId: String(row["workspace_id"]),
    userId: String(row["user_id"]),
    name: stringOrNull(row["name"]),
    createdAt: parseDate(row["created_at"]),
  };
}

function evidenceKind(value: unknown): TaskEvidenceKind {
  return value === "link" ? "link" : "file";
}

function rowToEvidenceDto(row: QueryRow): TaskEvidenceDto {
  return {
    id: String(row["id"]),
    taskId: String(row["task_id"]),
    organizationId: String(row["organization_id"]),
    workspaceId: String(row["workspace_id"]),
    kind: evidenceKind(row["kind"]),
    objectRef: stringOrNull(row["object_ref"]),
    url: stringOrNull(row["url"]),
    filename: String(row["filename"]),
    contentType: stringOrNull(row["content_type"]),
    sizeBytes: row["size"] === null || row["size"] === undefined ? null : Number(row["size"]),
    provenance: String(row["provenance"]),
    createdByUserId: stringOrNull(row["created_by_user_id"]),
    createdAt: parseDate(row["created_at"]),
  };
}

function qualityReviewStatus(value: unknown): TaskQualityReviewStatus {
  if (value === "approved" || value === "changes_requested") {
    return value;
  }

  return "open";
}

function qualityCheckKind(value: unknown): TaskQualityCheckKind {
  return value === "ai_precheck" ? "ai_precheck" : "human";
}

function qualityCheckState(value: unknown): TaskQualityCheckState {
  if (value === "pass" || value === "fail") {
    return value;
  }

  return "pending";
}

function qualityReviewerState(value: unknown): TaskQualityReviewerState {
  if (value === "approved" || value === "changes_requested") {
    return value;
  }

  return "pending";
}

function rowToQualityReviewBase(row: QueryRow): Omit<TaskQualityReviewDto, "checks" | "reviewers"> {
  return {
    id: String(row["id"]),
    taskId: String(row["task_id"]),
    organizationId: String(row["organization_id"]),
    workspaceId: String(row["workspace_id"]),
    status: qualityReviewStatus(row["status"]),
    approvedByUserId: stringOrNull(row["approved_by_user_id"]),
    approvedAt: parseNullableDate(row["approved_at"]),
    createdAt: parseDate(row["created_at"]),
    updatedAt: parseDate(row["updated_at"]),
  };
}

function rowToQualityCheckDto(row: QueryRow): TaskQualityCheckDto {
  return {
    id: String(row["id"]),
    reviewId: String(row["review_id"]),
    taskId: String(row["task_id"]),
    organizationId: String(row["organization_id"]),
    workspaceId: String(row["workspace_id"]),
    label: String(row["label"]),
    kind: qualityCheckKind(row["kind"]),
    state: qualityCheckState(row["state"]),
    actor: String(row["actor"]),
    createdAt: parseDate(row["created_at"]),
    updatedAt: parseDate(row["updated_at"]),
  };
}

function rowToQualityReviewerDto(row: QueryRow): TaskQualityReviewerDto {
  return {
    id: String(row["id"]),
    reviewId: String(row["review_id"]),
    taskId: String(row["task_id"]),
    organizationId: String(row["organization_id"]),
    workspaceId: String(row["workspace_id"]),
    reviewerUserId: String(row["reviewer_user_id"]),
    reviewerName: stringOrNull(row["reviewer_name"]),
    state: qualityReviewerState(row["state"]),
    updatedAt: parseDate(row["updated_at"]),
  };
}

function assertKnownIds(input: TaskApplicationContext): Result<void> {
  try {
    makeTenantId(input.orgId);
    makeOrgId(input.orgId);
    makeWorkspaceId(input.workspaceId);
    makeUserId(input.actor.userId);
    return ok(undefined);
  } catch (error) {
    return err(
      taskError(
        "projectManagement.invalidTaskContext",
        "Task context contains an invalid organization, workspace, or actor id.",
        error,
      ),
    );
  }
}

function assertKnownTaskId(taskId: string): Result<void> {
  try {
    makeTaskId(taskId);
    return ok(undefined);
  } catch (error) {
    return err(taskError("projectManagement.invalidTaskId", "Task id is invalid.", error));
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hasValidHumanCommandAttestation(input: MarkTaskDoneInput): boolean {
  const humanCommand: unknown = input.humanCommand;
  if (typeof humanCommand !== "object" || humanCommand === null) {
    return false;
  }

  const fields = humanCommand as Record<string, unknown>;
  return (
    fields["confirmedByUserId"] === input.actor.userId &&
    fields["confirmSource"] === "admin-web" &&
    typeof fields["confirmNonce"] === "string" &&
    uuidPattern.test(fields["confirmNonce"])
  );
}

function assertKnownUuid(value: string, field: string): Result<void> {
  if (uuidPattern.test(value)) {
    return ok(undefined);
  }

  return err(taskError("projectManagement.invalidTaskCardId", `${field} must be a valid id.`));
}

// SECURITY CONTRACT: orgId/workspaceId/actor.roleKeys are IDENTITY dimensions and
// MUST be supplied from a verified session/principal (apps/web sources them from
// getAppSessionContext, never from client form input). RLS (withTenant ->
// app.current_org) is the DB backstop for cross-tenant isolation regardless; this
// authorization is the intra-tenant role gate. Any future non-web caller must
// ground these values in an authenticated principal before calling task services.
function authorizationSubject(input: TaskApplicationContext): AuthorizationSubject {
  return {
    userId: makeUserId(input.actor.userId),
    tenantId: makeTenantId(input.orgId),
    orgId: makeOrgId(input.orgId),
    workspaceIds: [makeWorkspaceId(input.workspaceId)],
    roleKeys: input.actor.roleKeys,
  };
}

async function authorizeTask(
  input: TaskApplicationContext,
  action: "read" | "create" | "update" | "delete",
  authorizationPort: AuthorizationPort,
): Promise<Result<void>> {
  const decisionResult = await authorizationPort.can(authorizationSubject(input), action, {
    type: "task",
    tenantId: makeTenantId(input.orgId),
    orgId: makeOrgId(input.orgId),
    workspaceId: makeWorkspaceId(input.workspaceId),
  });

  if (!decisionResult.ok) {
    return err(decisionResult.error);
  }

  if (!decisionResult.value.allowed) {
    return err(taskError("projectManagement.forbidden", "You are not allowed to manage tasks."));
  }

  return ok(undefined);
}

function normalizeAssignee(
  assigneeUserId: string | null | undefined,
  actorUserId: string,
): Result<string | null> {
  if (assigneeUserId === undefined || assigneeUserId === null || assigneeUserId.trim() === "") {
    return ok(null);
  }

  const normalized = assigneeUserId.trim();
  if (normalized !== actorUserId) {
    return err(
      taskError(
        "projectManagement.unsupportedTaskAssignee",
        "This slice can assign tasks only to the current user or leave them unassigned.",
      ),
    );
  }

  return ok(normalized);
}

function normalizeOptionalUserId(
  value: string | null | undefined,
  field: string,
): Result<string | null> {
  if (value === undefined || value === null || value.trim() === "") {
    return ok(null);
  }

  const normalized = value.trim();
  try {
    makeUserId(normalized);
    return ok(normalized);
  } catch (error) {
    return err(
      taskError("projectManagement.invalidUserId", `${field} must be a valid user id.`, error),
    );
  }
}

function normalizeUserIds(values: readonly string[]): Result<readonly string[]> {
  const normalized = values.map((value) => value.trim()).filter((value) => value !== "");
  const unique = [...new Set(normalized)];

  for (const value of unique) {
    try {
      makeUserId(value);
    } catch (error) {
      return err(
        taskError("projectManagement.invalidUserId", "Watcher user ids must be valid.", error),
      );
    }
  }

  if (unique.length > 32) {
    return err(
      taskError("projectManagement.tooManyWatchers", "A task can have at most 32 watchers."),
    );
  }

  return ok(unique);
}

function normalizeDueAt(value: string | Date | null | undefined): Result<string | null> {
  if (value === null || value === undefined) {
    return ok(null);
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return err(taskError("projectManagement.invalidDueAt", "Task due date must be a valid date."));
  }

  return ok(date.toISOString());
}

function normalizeProvenanceSource(value: string | undefined): Result<string> {
  const source = (value ?? "manual").trim().replace(/\s+/g, " ");

  if (source.length === 0 || source.length > 240) {
    return err(
      taskError(
        "projectManagement.invalidTaskProvenance",
        "Task provenance source must be 1-240 characters.",
      ),
    );
  }

  return ok(source);
}

function normalizeExternalRef(value: string | null | undefined): Result<string | null> {
  if (value === null || value === undefined || value.trim() === "") {
    return ok(null);
  }

  const normalized = value.trim();
  if (normalized.length > 500) {
    return err(
      taskError(
        "projectManagement.invalidTaskProvenance",
        "Task provenance external ref must be 500 characters or fewer.",
      ),
    );
  }

  return ok(normalized);
}

function normalizeIdempotencyKey(value: string | undefined): Result<string | null> {
  if (value === undefined || value.trim() === "") {
    return ok(null);
  }

  const normalized = value.trim();
  if (normalized.length > 160) {
    return err(
      taskError(
        "projectManagement.invalidIdempotencyKey",
        "Idempotency key must be 160 characters or fewer.",
      ),
    );
  }

  return ok(normalized);
}

function normalizeStepText(value: string): Result<string> {
  const text = value.trim().replace(/\s+/g, " ");

  if (text.length === 0 || text.length > 500) {
    return err(
      taskError("projectManagement.invalidTaskStep", "Task step text must be 1-500 characters."),
    );
  }

  return ok(text);
}

function normalizeCommentBody(value: string): Result<string> {
  const body = value.trim();

  if (body.length === 0 || body.length > 4000) {
    return err(
      taskError(
        "projectManagement.invalidTaskComment",
        "Task comment body must be 1-4000 characters.",
      ),
    );
  }

  return ok(body);
}

function normalizeAssistantKey(value: string | null | undefined): Result<string | null> {
  if (value === null || value === undefined || value.trim() === "") {
    return ok(null);
  }

  const normalized = value.trim();
  if (!/^[a-z0-9][a-z0-9._-]{1,178}[a-z0-9]$/i.test(normalized)) {
    return err(
      taskError(
        "projectManagement.invalidAssistantKey",
        "Assistant key must be 3-180 safe characters.",
      ),
    );
  }

  return ok(normalized);
}

function normalizeEvidenceFilename(value: string): Result<string> {
  const filename = value.trim().replace(/[\\/]+/g, "-");

  if (filename.length === 0 || filename.length > 500) {
    return err(
      taskError(
        "projectManagement.invalidEvidenceFilename",
        "Evidence filename must be 1-500 characters.",
      ),
    );
  }

  return ok(filename);
}

function normalizeEvidenceContentType(value: string): Result<string> {
  const contentType = value.trim().toLowerCase();
  if (
    contentType.length === 0 ||
    contentType.length > 200 ||
    !/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i.test(contentType)
  ) {
    return err(
      taskError(
        "projectManagement.invalidEvidenceContentType",
        "Evidence content type must be a valid MIME type.",
      ),
    );
  }

  return ok(contentType);
}

function normalizeEvidenceSize(value: number): Result<number> {
  if (!Number.isSafeInteger(value) || value < 0) {
    return err(
      taskError("projectManagement.invalidEvidenceSize", "Evidence size must be non-negative."),
    );
  }

  return ok(value);
}

function normalizeEvidenceProvenance(value: string | undefined, fallback: string): Result<string> {
  const provenance = (value ?? fallback).trim().replace(/\s+/g, " ");
  if (provenance.length === 0 || provenance.length > 500) {
    return err(
      taskError(
        "projectManagement.invalidEvidenceProvenance",
        "Evidence provenance must be 1-500 characters.",
      ),
    );
  }

  return ok(provenance);
}

function normalizeObjectRef(value: string): Result<string> {
  const ref = value.trim();
  if (ref.length === 0 || ref.length > 1000 || ref.includes("..")) {
    return err(
      taskError("projectManagement.invalidEvidenceObjectRef", "Evidence object ref is invalid."),
    );
  }

  return ok(ref);
}

function normalizeEvidenceUrl(value: string): Result<string> {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }

    return ok(url.toString());
  } catch (error) {
    return err(
      taskError(
        "projectManagement.invalidEvidenceUrl",
        "Evidence link must be an HTTP URL.",
        error,
      ),
    );
  }
}

function normalizeQualityLabel(value: string): Result<string> {
  const label = value.trim().replace(/\s+/g, " ");
  if (label.length === 0 || label.length > 240) {
    return err(
      taskError(
        "projectManagement.invalidQualityCheck",
        "Quality check label must be 1-240 characters.",
      ),
    );
  }

  return ok(label);
}

function normalizeQualityCheckKind(
  value: TaskQualityCheckKind | undefined,
): Result<TaskQualityCheckKind> {
  if (value === undefined || value === "human" || value === "ai_precheck") {
    return ok(value ?? "human");
  }

  return err(taskError("projectManagement.invalidQualityCheck", "Quality check kind is invalid."));
}

function normalizeQualityCheckState(value: TaskQualityCheckState): Result<TaskQualityCheckState> {
  if (value === "pass" || value === "fail" || value === "pending") {
    return ok(value);
  }

  return err(taskError("projectManagement.invalidQualityCheck", "Quality check state is invalid."));
}

function actorLabel(input: TaskApplicationContext, explicit: string | undefined): Result<string> {
  const label = (explicit ?? input.actor.userId).trim().replace(/\s+/g, " ");
  if (label.length === 0 || label.length > 240) {
    return err(
      taskError("projectManagement.invalidQualityCheck", "Quality check actor is invalid."),
    );
  }

  return ok(label);
}

function prepareTaskFields(input: {
  readonly title: string;
  readonly description: string | undefined;
  readonly priority: TaskPriority;
  readonly assigneeUserId: string | null | undefined;
  readonly labels: readonly string[] | undefined;
  readonly actorUserId: string;
  readonly dueAt: string | Date | null | undefined;
  readonly provenanceSource: string | undefined;
  readonly provenanceExternalRef: string | null | undefined;
}): Result<PreparedTaskFields> {
  const title = normalizeTaskTitle(input.title);
  if (!title.ok) {
    return err(title.error);
  }

  const description = normalizeTaskDescription(input.description ?? "");
  if (!description.ok) {
    return err(description.error);
  }

  const priority = parseTaskPriority(input.priority);
  if (!priority.ok) {
    return err(priority.error);
  }

  const assigneeUserId = normalizeAssignee(input.assigneeUserId, input.actorUserId);
  if (!assigneeUserId.ok) {
    return err(assigneeUserId.error);
  }

  const labels = normalizeTaskLabels(input.labels ?? []);
  if (!labels.ok) {
    return err(labels.error);
  }

  const dueAt = normalizeDueAt(input.dueAt);
  if (!dueAt.ok) {
    return err(dueAt.error);
  }

  const provenanceSource = normalizeProvenanceSource(input.provenanceSource);
  if (!provenanceSource.ok) {
    return err(provenanceSource.error);
  }

  const provenanceExternalRef = normalizeExternalRef(input.provenanceExternalRef);
  if (!provenanceExternalRef.ok) {
    return err(provenanceExternalRef.error);
  }

  return ok({
    title: title.value,
    description: description.value,
    priority: priority.value,
    assigneeUserId: assigneeUserId.value,
    labels: labels.value,
    dueAt: dueAt.value,
    provenanceSource: provenanceSource.value,
    provenanceExternalRef: provenanceExternalRef.value,
  });
}

async function selectTaskRows(
  tx: TenantTransaction,
  workspaceId: string,
): Promise<readonly TaskDto[]> {
  const result = await tx.execute(sql`
    select
      t.id,
      t.organization_id,
      t.workspace_id,
      t.title,
      t.description,
      t.status,
      t.priority,
      t.assignee_user_id,
      u.name as assignee_name,
      t.labels,
      t.position,
      t.card_number,
      t.due_at,
      t.provenance_source,
      t.provenance_external_ref,
      t.created_at,
      t.updated_at
    from public.tasks t
    left join public.auth_users u on u.id = t.assignee_user_id
    where t.workspace_id = ${workspaceId}
    order by
      case t.status
        when 'todo' then 1
        when 'in_progress' then 2
        when 'blocked' then 3
        when 'done' then 4
        else 5
      end,
      t.position asc,
      t.created_at asc
  `);

  return rowsFromExecuteResult(result).map(rowToTaskDto);
}

async function selectTaskById(
  tx: TenantTransaction,
  taskId: string,
  workspaceId: string,
): Promise<TaskDto | null> {
  const result = await tx.execute(sql`
    select
      t.id,
      t.organization_id,
      t.workspace_id,
      t.title,
      t.description,
      t.status,
      t.priority,
      t.assignee_user_id,
      u.name as assignee_name,
      t.labels,
      t.position,
      t.card_number,
      t.due_at,
      t.provenance_source,
      t.provenance_external_ref,
      t.created_at,
      t.updated_at
    from public.tasks t
    left join public.auth_users u on u.id = t.assignee_user_id
    where t.id = ${taskId}
      and t.workspace_id = ${workspaceId}
    limit 1
  `);

  const row = rowsFromExecuteResult(result)[0];
  return row === undefined ? null : rowToTaskDto(row);
}

async function selectTaskByIdempotencyKey(
  tx: TenantTransaction,
  orgId: string,
  idempotencyKey: string,
): Promise<TaskDto | null> {
  const result = await tx.execute(sql`
    select
      t.id,
      t.organization_id,
      t.workspace_id,
      t.title,
      t.description,
      t.status,
      t.priority,
      t.assignee_user_id,
      u.name as assignee_name,
      t.labels,
      t.position,
      t.card_number,
      t.due_at,
      t.provenance_source,
      t.provenance_external_ref,
      t.created_at,
      t.updated_at
    from public.tasks t
    left join public.auth_users u on u.id = t.assignee_user_id
    where t.organization_id = ${orgId}
      and t.idempotency_key = ${idempotencyKey}
    limit 1
  `);

  const row = rowsFromExecuteResult(result)[0];
  return row === undefined ? null : rowToTaskDto(row);
}

async function ensureTaskExists(
  tx: TenantTransaction,
  taskId: string,
  workspaceId: string,
): Promise<Result<void>> {
  const task = await selectTaskById(tx, taskId, workspaceId);
  return task === null
    ? err(taskError("projectManagement.taskNotFound", "Task was not found."))
    : ok(undefined);
}

async function selectSteps(tx: TenantTransaction, taskId: string): Promise<readonly TaskStepDto[]> {
  const result = await tx.execute(sql`
    select
      id,
      task_id,
      organization_id,
      workspace_id,
      text,
      assignee_user_id,
      done,
      position,
      created_at,
      updated_at
    from public.task_steps
    where task_id = ${taskId}
    order by position asc, created_at asc, id asc
  `);

  return rowsFromExecuteResult(result).map(rowToStepDto);
}

async function selectComments(
  tx: TenantTransaction,
  taskId: string,
): Promise<readonly TaskCommentDto[]> {
  const result = await tx.execute(sql`
    select
      c.id,
      c.task_id,
      c.organization_id,
      c.workspace_id,
      c.author_kind,
      c.author_user_id,
      c.assistant_key,
      c.body,
      c.created_at,
      coalesce(
        array_agg(r.user_id order by r.read_at asc) filter (where r.user_id is not null),
        '{}'::text[]
      ) as read_by_user_ids
    from public.task_comments c
    left join public.task_comment_read_markers r on r.comment_id = c.id
    where c.task_id = ${taskId}
    group by c.id
    order by c.created_at asc, c.id asc
  `);

  return rowsFromExecuteResult(result).map(rowToCommentDto);
}

async function selectWatchers(
  tx: TenantTransaction,
  taskId: string,
): Promise<readonly TaskWatcherDto[]> {
  const result = await tx.execute(sql`
    select
      w.task_id,
      w.organization_id,
      w.workspace_id,
      w.user_id,
      u.name,
      w.created_at
    from public.task_watchers w
    left join public.auth_users u on u.id = w.user_id
    where w.task_id = ${taskId}
    order by w.created_at asc, w.user_id asc
  `);

  return rowsFromExecuteResult(result).map(rowToWatcherDto);
}

async function selectEvidence(
  tx: TenantTransaction,
  taskId: string,
): Promise<readonly TaskEvidenceDto[]> {
  const result = await tx.execute(sql`
    select
      id,
      task_id,
      organization_id,
      workspace_id,
      kind,
      object_ref,
      url,
      filename,
      content_type,
      size,
      provenance,
      created_by_user_id,
      created_at
    from public.task_evidence
    where task_id = ${taskId}
    order by created_at desc, id desc
  `);

  return rowsFromExecuteResult(result).map(rowToEvidenceDto);
}

async function ensureQualityReview(
  tx: TenantTransaction,
  input: TaskApplicationContext & { readonly taskId: string },
): Promise<Result<Omit<TaskQualityReviewDto, "checks" | "reviewers">>> {
  const existingResult = await tx.execute(sql`
    select
      id,
      task_id,
      organization_id,
      workspace_id,
      status,
      approved_by_user_id,
      approved_at,
      created_at,
      updated_at
    from public.task_quality_review
    where task_id = ${input.taskId}
      and workspace_id = ${input.workspaceId}
    limit 1
  `);
  const existing = rowsFromExecuteResult(existingResult)[0];
  if (existing !== undefined) {
    return ok(rowToQualityReviewBase(existing));
  }

  const createdResult = await tx.execute(sql`
    insert into public.task_quality_review (
      task_id,
      organization_id,
      workspace_id,
      status
    )
    values (
      ${input.taskId},
      ${input.orgId},
      ${input.workspaceId},
      'open'::public.task_quality_review_status
    )
    on conflict (task_id) do update
      set updated_at = public.task_quality_review.updated_at
    returning
      id,
      task_id,
      organization_id,
      workspace_id,
      status,
      approved_by_user_id,
      approved_at,
      created_at,
      updated_at
  `);
  const created = rowsFromExecuteResult(createdResult)[0];

  return created === undefined
    ? err(
        taskError(
          "projectManagement.qualityReviewCreateFailed",
          "Quality review could not be created.",
        ),
      )
    : ok(rowToQualityReviewBase(created));
}

async function selectQualityReview(
  tx: TenantTransaction,
  taskId: string,
): Promise<TaskQualityReviewDto | null> {
  const reviewResult = await tx.execute(sql`
    select
      id,
      task_id,
      organization_id,
      workspace_id,
      status,
      approved_by_user_id,
      approved_at,
      created_at,
      updated_at
    from public.task_quality_review
    where task_id = ${taskId}
    limit 1
  `);
  const reviewRow = rowsFromExecuteResult(reviewResult)[0];
  if (reviewRow === undefined) {
    return null;
  }

  const review = rowToQualityReviewBase(reviewRow);
  const checksResult = await tx.execute(sql`
    select
      id,
      review_id,
      task_id,
      organization_id,
      workspace_id,
      label,
      kind,
      state,
      actor,
      created_at,
      updated_at
    from public.task_quality_check
    where review_id = ${review.id}
    order by created_at asc, id asc
  `);
  const reviewersResult = await tx.execute(sql`
    select
      r.id,
      r.review_id,
      r.task_id,
      r.organization_id,
      r.workspace_id,
      r.reviewer_user_id,
      u.name as reviewer_name,
      r.state,
      r.updated_at
    from public.task_quality_reviewer r
    left join public.auth_users u on u.id = r.reviewer_user_id
    where r.review_id = ${review.id}
    order by r.updated_at asc, r.reviewer_user_id asc
  `);

  return {
    ...review,
    checks: rowsFromExecuteResult(checksResult).map(rowToQualityCheckDto),
    reviewers: rowsFromExecuteResult(reviewersResult).map(rowToQualityReviewerDto),
  };
}

export async function createTask(
  input: CreateTaskInput,
  dependencies: TaskApplicationDependencies = {},
): Promise<Result<TaskDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const status = parseTaskStatus(input.status ?? "todo");
  if (!status.ok) {
    return err(status.error);
  }
  if (isTerminalTaskStatus(status.value)) {
    return err(taskDoneRequiresHumanAttestation());
  }

  const fields = prepareTaskFields({
    title: input.title,
    description: input.description,
    priority: input.priority ?? "normal",
    assigneeUserId: input.assigneeUserId,
    labels: input.labels,
    actorUserId: input.actor.userId,
    dueAt: input.dueAt,
    provenanceSource: input.provenanceSource,
    provenanceExternalRef: input.provenanceExternalRef,
  });
  if (!fields.ok) {
    return err(fields.error);
  }

  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  if (!idempotencyKey.ok) {
    return err(idempotencyKey.error);
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeTask(input, "create", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await createTaskOnce(input, status.value, fields.value, idempotencyKey.value);

    if (result.ok) {
      return result;
    }

    if (isWorkspaceCardNumberUniqueViolation(result.error.cause)) {
      if (attempt === 0) {
        continue;
      }

      return err(databaseError(result.error.cause));
    }

    if (
      result.error.code === "projectManagement.databaseError" &&
      result.error.cause !== undefined
    ) {
      return err(databaseError(result.error.cause));
    }

    return result;
  }

  return err(taskError("projectManagement.taskCreateFailed", "Task could not be created."));
}

async function createTaskOnce(
  input: CreateTaskInput,
  status: TaskStatus,
  fields: PreparedTaskFields,
  idempotencyKey: string | null,
): Promise<Result<TaskDto>> {
  try {
    return await withTenant(input.orgId, async (tx) => {
      if (idempotencyKey !== null) {
        const replay = await selectTaskByIdempotencyKey(tx, input.orgId, idempotencyKey);
        if (replay !== null) {
          return ok(replay);
        }
      }

      await tx.execute(sql`
        select pg_advisory_xact_lock(hashtext('task_card:' || ${input.workspaceId}))
      `);

      let result: unknown;
      try {
        result = await tx.execute(sql`
        with next_card_number as (
          select coalesce(max(card_number), 0) + 1 as value
          from public.tasks
          where workspace_id = ${input.workspaceId}
        ),
        next_position as (
          select coalesce(max(position), 0) + 1 as value
          from public.tasks
          where workspace_id = ${input.workspaceId}
            and status = ${status}::public.task_status
        )
        insert into public.tasks (
          organization_id,
          workspace_id,
          card_number,
          title,
          description,
          status,
          priority,
          assignee_user_id,
          labels,
          position,
          due_at,
          provenance_source,
          provenance_external_ref,
          idempotency_key
        )
        select
          ${input.orgId},
          ${input.workspaceId},
          next_card_number.value,
          ${fields.title},
          ${fields.description},
          ${status}::public.task_status,
          ${fields.priority}::public.task_priority,
          ${fields.assigneeUserId},
          ${sql.param(fields.labels)}::text[],
          next_position.value,
          ${fields.dueAt},
          ${fields.provenanceSource},
          ${fields.provenanceExternalRef},
          ${idempotencyKey}
        from next_card_number
        cross join next_position
        on conflict (organization_id, idempotency_key)
        do update set idempotency_key = excluded.idempotency_key
        returning
          id,
          organization_id,
          workspace_id,
          card_number,
          title,
          description,
          status,
          priority,
          assignee_user_id,
          null::text as assignee_name,
          labels,
          position,
          due_at,
          provenance_source,
          provenance_external_ref,
          created_at,
          updated_at
      `);
      } catch (error) {
        throw new TaskDatabaseAttemptError(error);
      }

      const row = rowsFromExecuteResult(result)[0];
      if (row === undefined) {
        return err(taskError("projectManagement.taskCreateFailed", "Task could not be created."));
      }

      return ok(rowToTaskDto(row));
    });
  } catch (error) {
    return err(
      taskError(
        "projectManagement.databaseError",
        "Database operation failed.",
        unwrapTaskDatabaseAttemptError(error),
      ),
    );
  }
}

export async function listTasks(
  input: ListTasksInput,
  dependencies: TaskApplicationDependencies = {},
): Promise<Result<readonly TaskDto[]>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeTask(input, "read", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) =>
      ok(await selectTaskRows(tx, input.workspaceId)),
    );
  } catch (error) {
    return err(
      taskError(
        "projectManagement.taskListFailed",
        "Tasks could not be loaded.",
        mapDatabaseError(error),
      ),
    );
  }
}

export async function getTask(
  input: GetTaskInput,
  dependencies: TaskApplicationDependencies = {},
): Promise<Result<TaskDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownTaskId = assertKnownTaskId(input.taskId);
  if (!knownTaskId.ok) {
    return err(knownTaskId.error);
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeTask(input, "read", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const result = await tx.execute(sql`
        select
          t.id,
          t.organization_id,
          t.workspace_id,
          t.title,
          t.description,
          t.status,
          t.priority,
          t.assignee_user_id,
          u.name as assignee_name,
          t.labels,
          t.position,
          t.card_number,
          t.due_at,
          t.provenance_source,
          t.provenance_external_ref,
          t.created_at,
          t.updated_at
        from public.tasks t
        left join public.auth_users u on u.id = t.assignee_user_id
        where t.id = ${input.taskId}
          and t.workspace_id = ${input.workspaceId}
        limit 1
      `);
      const row = rowsFromExecuteResult(result)[0];

      if (row === undefined) {
        return err(taskError("projectManagement.taskNotFound", "Task was not found."));
      }

      return ok(rowToTaskDto(row));
    });
  } catch (error) {
    return err(
      taskError(
        "projectManagement.taskLoadFailed",
        "Task could not be loaded.",
        mapDatabaseError(error),
      ),
    );
  }
}

export async function updateTask(
  input: UpdateTaskInput,
  dependencies: TaskApplicationDependencies = {},
): Promise<Result<TaskDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownTaskId = assertKnownTaskId(input.taskId);
  if (!knownTaskId.ok) {
    return err(knownTaskId.error);
  }

  const fields = prepareTaskFields({
    title: input.title,
    description: input.description,
    priority: input.priority,
    assigneeUserId: input.assigneeUserId,
    labels: input.labels,
    actorUserId: input.actor.userId,
    dueAt: undefined,
    provenanceSource: undefined,
    provenanceExternalRef: undefined,
  });
  if (!fields.ok) {
    return err(fields.error);
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeTask(input, "update", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const result = await tx.execute(sql`
        update public.tasks
        set
          title = ${fields.value.title},
          description = ${fields.value.description},
          priority = ${fields.value.priority}::public.task_priority,
          assignee_user_id = ${fields.value.assigneeUserId},
          labels = ${sql.param(fields.value.labels)}::text[],
          updated_at = now()
        where id = ${input.taskId}
          and workspace_id = ${input.workspaceId}
        returning
          id,
          organization_id,
          workspace_id,
          title,
          description,
          status,
          priority,
          assignee_user_id,
          null::text as assignee_name,
          labels,
          position,
          card_number,
          due_at,
          provenance_source,
          provenance_external_ref,
          created_at,
          updated_at
      `);
      const row = rowsFromExecuteResult(result)[0];

      if (row === undefined) {
        return err(taskError("projectManagement.taskNotFound", "Task was not found."));
      }

      return ok(rowToTaskDto(row));
    });
  } catch (error) {
    return err(
      taskError(
        "projectManagement.taskUpdateFailed",
        "Task could not be updated.",
        mapDatabaseError(error),
      ),
    );
  }
}

export async function moveTask(
  input: MoveTaskInput,
  dependencies: TaskApplicationDependencies = {},
): Promise<Result<TaskDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownTaskId = assertKnownTaskId(input.taskId);
  if (!knownTaskId.ok) {
    return err(knownTaskId.error);
  }

  const status = parseTaskStatus(input.status);
  if (!status.ok) {
    return err(status.error);
  }
  if (isTerminalTaskStatus(status.value)) {
    return err(taskDoneRequiresHumanAttestation());
  }

  if (!Number.isInteger(input.position) || input.position < 0) {
    return err(
      taskError(
        "projectManagement.invalidTaskPosition",
        "Task position must be a non-negative integer.",
      ),
    );
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeTask(input, "update", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const result = await tx.execute(sql`
        update public.tasks
        set
          status = ${status.value}::public.task_status,
          position = ${input.position},
          updated_at = now()
        where id = ${input.taskId}
          and workspace_id = ${input.workspaceId}
        returning
          id,
          organization_id,
          workspace_id,
          title,
          description,
          status,
          priority,
          assignee_user_id,
          null::text as assignee_name,
          labels,
          position,
          card_number,
          due_at,
          provenance_source,
          provenance_external_ref,
          created_at,
          updated_at
      `);
      const row = rowsFromExecuteResult(result)[0];

      if (row === undefined) {
        return err(taskError("projectManagement.taskNotFound", "Task was not found."));
      }

      return ok(rowToTaskDto(row));
    });
  } catch (error) {
    return err(
      taskError(
        "projectManagement.taskMoveFailed",
        "Task could not be moved.",
        mapDatabaseError(error),
      ),
    );
  }
}

export async function createStep(
  input: CreateStepInput,
  dependencies: TaskApplicationDependencies = {},
): Promise<Result<TaskStepDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownTaskId = assertKnownTaskId(input.taskId);
  if (!knownTaskId.ok) {
    return err(knownTaskId.error);
  }

  const text = normalizeStepText(input.text);
  if (!text.ok) {
    return err(text.error);
  }

  const assigneeUserId = normalizeOptionalUserId(input.assigneeUserId, "Step assignee");
  if (!assigneeUserId.ok) {
    return err(assigneeUserId.error);
  }

  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  if (!idempotencyKey.ok) {
    return err(idempotencyKey.error);
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeTask(input, "update", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const existing = await ensureTaskExists(tx, input.taskId, input.workspaceId);
      if (!existing.ok) {
        return err(existing.error);
      }

      const result = await tx.execute(sql`
        with next_position as (
          select coalesce(max(position), 0) + 1 as value
          from public.task_steps
          where task_id = ${input.taskId}
        )
        insert into public.task_steps (
          task_id,
          organization_id,
          workspace_id,
          text,
          assignee_user_id,
          position,
          idempotency_key
        )
        select
          ${input.taskId},
          ${input.orgId},
          ${input.workspaceId},
          ${text.value},
          ${assigneeUserId.value},
          next_position.value,
          ${idempotencyKey.value}
        from next_position
        on conflict (organization_id, idempotency_key)
        do update set idempotency_key = excluded.idempotency_key
        returning
          id,
          task_id,
          organization_id,
          workspace_id,
          text,
          assignee_user_id,
          done,
          position,
          created_at,
          updated_at
      `);

      const row = rowsFromExecuteResult(result)[0];
      return row === undefined
        ? err(taskError("projectManagement.stepCreateFailed", "Task step could not be created."))
        : ok(rowToStepDto(row));
    });
  } catch (error) {
    return err(
      taskError(
        "projectManagement.stepCreateFailed",
        "Task step could not be created.",
        mapDatabaseError(error),
      ),
    );
  }
}

export async function toggleStep(
  input: ToggleStepInput,
  dependencies: TaskApplicationDependencies = {},
): Promise<Result<TaskStepDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownTaskId = assertKnownTaskId(input.taskId);
  if (!knownTaskId.ok) {
    return err(knownTaskId.error);
  }

  const knownStepId = assertKnownUuid(input.stepId, "Step id");
  if (!knownStepId.ok) {
    return err(knownStepId.error);
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeTask(input, "update", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const result = await tx.execute(sql`
        update public.task_steps
        set done = ${input.done}, updated_at = now()
        where id = ${input.stepId}
          and task_id = ${input.taskId}
          and workspace_id = ${input.workspaceId}
        returning
          id,
          task_id,
          organization_id,
          workspace_id,
          text,
          assignee_user_id,
          done,
          position,
          created_at,
          updated_at
      `);

      const row = rowsFromExecuteResult(result)[0];
      return row === undefined
        ? err(taskError("projectManagement.stepNotFound", "Task step was not found."))
        : ok(rowToStepDto(row));
    });
  } catch (error) {
    return err(
      taskError(
        "projectManagement.stepUpdateFailed",
        "Task step could not be updated.",
        mapDatabaseError(error),
      ),
    );
  }
}

export async function reorderSteps(
  input: ReorderStepsInput,
  dependencies: TaskApplicationDependencies = {},
): Promise<Result<readonly TaskStepDto[]>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownTaskId = assertKnownTaskId(input.taskId);
  if (!knownTaskId.ok) {
    return err(knownTaskId.error);
  }

  if (input.stepIds.length === 0 || new Set(input.stepIds).size !== input.stepIds.length) {
    return err(
      taskError(
        "projectManagement.invalidStepOrder",
        "Step order must include each step id exactly once.",
      ),
    );
  }

  for (const stepId of input.stepIds) {
    const knownStepId = assertKnownUuid(stepId, "Step id");
    if (!knownStepId.ok) {
      return err(knownStepId.error);
    }
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeTask(input, "update", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const existing = await selectSteps(tx, input.taskId);
      const existingIds = existing.map((step) => step.id).sort();
      const requestedIds = [...input.stepIds].sort();
      if (
        existingIds.length !== requestedIds.length ||
        existingIds.some((stepId, index) => stepId !== requestedIds[index])
      ) {
        return err(
          taskError(
            "projectManagement.invalidStepOrder",
            "Step order must include every current step exactly once.",
          ),
        );
      }

      const positions = input.stepIds.map((_, index) => index + 1);
      await tx.execute(sql`
        with ordered_steps as (
          select *
          from unnest(${sql.param(input.stepIds)}::uuid[], ${sql.param(positions)}::integer[])
            as ordered(id, position)
        )
        update public.task_steps s
        set position = ordered_steps.position, updated_at = now()
        from ordered_steps
        where s.id = ordered_steps.id
          and s.task_id = ${input.taskId}
          and s.workspace_id = ${input.workspaceId}
      `);

      return ok(await selectSteps(tx, input.taskId));
    });
  } catch (error) {
    return err(
      taskError(
        "projectManagement.stepReorderFailed",
        "Task steps could not be reordered.",
        mapDatabaseError(error),
      ),
    );
  }
}

export async function addComment(
  input: AddCommentInput,
  dependencies: TaskApplicationDependencies = {},
): Promise<Result<TaskCommentDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownTaskId = assertKnownTaskId(input.taskId);
  if (!knownTaskId.ok) {
    return err(knownTaskId.error);
  }

  const body = normalizeCommentBody(input.body);
  if (!body.ok) {
    return err(body.error);
  }

  const authorKind = input.authorKind ?? "human";
  if (authorKind !== "human" && authorKind !== "assistant") {
    return err(
      taskError("projectManagement.invalidCommentAuthor", "Comment author kind is invalid."),
    );
  }

  const assistantKey = normalizeAssistantKey(input.assistantKey);
  if (!assistantKey.ok) {
    return err(assistantKey.error);
  }

  if (authorKind === "assistant" && assistantKey.value === null) {
    return err(
      taskError(
        "projectManagement.invalidCommentAuthor",
        "Assistant comments require an assistant key.",
      ),
    );
  }

  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  if (!idempotencyKey.ok) {
    return err(idempotencyKey.error);
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeTask(input, "update", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const existing = await ensureTaskExists(tx, input.taskId, input.workspaceId);
      if (!existing.ok) {
        return err(existing.error);
      }

      const result = await tx.execute(sql`
        insert into public.task_comments (
          task_id,
          organization_id,
          workspace_id,
          author_kind,
          author_user_id,
          assistant_key,
          body,
          idempotency_key
        )
        values (
          ${input.taskId},
          ${input.orgId},
          ${input.workspaceId},
          ${authorKind}::public.task_comment_author_kind,
          ${authorKind === "human" ? input.actor.userId : null},
          ${authorKind === "assistant" ? assistantKey.value : null},
          ${body.value},
          ${idempotencyKey.value}
        )
        on conflict (organization_id, idempotency_key)
        do update set idempotency_key = excluded.idempotency_key
        returning
          id,
          task_id,
          organization_id,
          workspace_id,
          author_kind,
          author_user_id,
          assistant_key,
          body,
          created_at,
          '{}'::text[] as read_by_user_ids
      `);

      const row = rowsFromExecuteResult(result)[0];
      return row === undefined
        ? err(
            taskError("projectManagement.commentCreateFailed", "Task comment could not be added."),
          )
        : ok(rowToCommentDto(row));
    });
  } catch (error) {
    return err(
      taskError(
        "projectManagement.commentCreateFailed",
        "Task comment could not be added.",
        mapDatabaseError(error),
      ),
    );
  }
}

export async function setDue(
  input: SetDueInput,
  dependencies: TaskApplicationDependencies = {},
): Promise<Result<TaskDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownTaskId = assertKnownTaskId(input.taskId);
  if (!knownTaskId.ok) {
    return err(knownTaskId.error);
  }

  const dueAt = normalizeDueAt(input.dueAt);
  if (!dueAt.ok) {
    return err(dueAt.error);
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeTask(input, "update", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const result = await tx.execute(sql`
        update public.tasks
        set due_at = ${dueAt.value}, updated_at = now()
        where id = ${input.taskId}
          and workspace_id = ${input.workspaceId}
        returning
          id,
          organization_id,
          workspace_id,
          card_number,
          title,
          description,
          status,
          priority,
          assignee_user_id,
          null::text as assignee_name,
          labels,
          position,
          due_at,
          provenance_source,
          provenance_external_ref,
          created_at,
          updated_at
      `);
      const row = rowsFromExecuteResult(result)[0];

      return row === undefined
        ? err(taskError("projectManagement.taskNotFound", "Task was not found."))
        : ok(rowToTaskDto(row));
    });
  } catch (error) {
    return err(
      taskError(
        "projectManagement.taskDueUpdateFailed",
        "Task due date could not be updated.",
        mapDatabaseError(error),
      ),
    );
  }
}

export async function setWatchers(
  input: SetWatchersInput,
  dependencies: TaskApplicationDependencies = {},
): Promise<Result<readonly TaskWatcherDto[]>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownTaskId = assertKnownTaskId(input.taskId);
  if (!knownTaskId.ok) {
    return err(knownTaskId.error);
  }

  const userIds = normalizeUserIds(input.userIds);
  if (!userIds.ok) {
    return err(userIds.error);
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeTask(input, "update", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const existing = await ensureTaskExists(tx, input.taskId, input.workspaceId);
      if (!existing.ok) {
        return err(existing.error);
      }

      await tx.execute(sql`
        delete from public.task_watchers
        where task_id = ${input.taskId}
          and workspace_id = ${input.workspaceId}
      `);

      if (userIds.value.length > 0) {
        await tx.execute(sql`
          insert into public.task_watchers (
            task_id,
            organization_id,
            workspace_id,
            user_id
          )
          select
            ${input.taskId},
            ${input.orgId},
            ${input.workspaceId},
            user_id
          from unnest(${sql.param(userIds.value)}::text[]) as incoming(user_id)
          on conflict (task_id, user_id) do nothing
        `);
      }

      return ok(await selectWatchers(tx, input.taskId));
    });
  } catch (error) {
    return err(
      taskError(
        "projectManagement.watchersUpdateFailed",
        "Task watchers could not be updated.",
        mapDatabaseError(error),
      ),
    );
  }
}

export async function markCommentsRead(
  input: MarkCommentsReadInput,
  dependencies: TaskApplicationDependencies = {},
): Promise<Result<readonly TaskCommentDto[]>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownTaskId = assertKnownTaskId(input.taskId);
  if (!knownTaskId.ok) {
    return err(knownTaskId.error);
  }

  if (input.commentIds !== undefined) {
    for (const commentId of input.commentIds) {
      const knownCommentId = assertKnownUuid(commentId, "Comment id");
      if (!knownCommentId.ok) {
        return err(knownCommentId.error);
      }
    }
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeTask(input, "update", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const existing = await ensureTaskExists(tx, input.taskId, input.workspaceId);
      if (!existing.ok) {
        return err(existing.error);
      }

      await tx.execute(sql`
        insert into public.task_comment_read_markers (
          task_id,
          comment_id,
          organization_id,
          workspace_id,
          user_id,
          read_at
        )
        select
          c.task_id,
          c.id,
          c.organization_id,
          c.workspace_id,
          ${input.actor.userId},
          now()
        from public.task_comments c
        where c.task_id = ${input.taskId}
          and c.workspace_id = ${input.workspaceId}
          ${
            input.commentIds === undefined
              ? sql``
              : sql`and c.id = any(${sql.param(input.commentIds)}::uuid[])`
          }
        on conflict (comment_id, user_id)
        do update set read_at = excluded.read_at
      `);

      return ok(await selectComments(tx, input.taskId));
    });
  } catch (error) {
    return err(
      taskError(
        "projectManagement.commentReadFailed",
        "Task comments could not be marked read.",
        mapDatabaseError(error),
      ),
    );
  }
}

export async function addTaskEvidenceFile(
  input: AddTaskEvidenceFileInput,
  dependencies: TaskApplicationDependencies = {},
): Promise<Result<TaskEvidenceDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownTaskId = assertKnownTaskId(input.taskId);
  if (!knownTaskId.ok) {
    return err(knownTaskId.error);
  }

  const objectRef = normalizeObjectRef(input.objectRef);
  const filename = normalizeEvidenceFilename(input.filename);
  const contentType = normalizeEvidenceContentType(input.contentType);
  const sizeBytes = normalizeEvidenceSize(input.sizeBytes);
  const provenance = normalizeEvidenceProvenance(input.provenance, "Attached from upload");
  if (!objectRef.ok) {
    return err(objectRef.error);
  }
  if (!filename.ok) {
    return err(filename.error);
  }
  if (!contentType.ok) {
    return err(contentType.error);
  }
  if (!sizeBytes.ok) {
    return err(sizeBytes.error);
  }
  if (!provenance.ok) {
    return err(provenance.error);
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeTask(input, "update", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const existing = await ensureTaskExists(tx, input.taskId, input.workspaceId);
      if (!existing.ok) {
        return err(existing.error);
      }

      const result = await tx.execute(sql`
        insert into public.task_evidence (
          task_id,
          organization_id,
          workspace_id,
          kind,
          object_ref,
          filename,
          content_type,
          size,
          provenance,
          created_by_user_id
        )
        values (
          ${input.taskId},
          ${input.orgId},
          ${input.workspaceId},
          'file'::public.task_evidence_kind,
          ${objectRef.value},
          ${filename.value},
          ${contentType.value},
          ${sizeBytes.value},
          ${provenance.value},
          ${input.actor.userId}
        )
        returning
          id,
          task_id,
          organization_id,
          workspace_id,
          kind,
          object_ref,
          url,
          filename,
          content_type,
          size,
          provenance,
          created_by_user_id,
          created_at
      `);

      const row = rowsFromExecuteResult(result)[0];
      return row === undefined
        ? err(taskError("projectManagement.evidenceCreateFailed", "Evidence could not be added."))
        : ok(rowToEvidenceDto(row));
    });
  } catch (error) {
    return err(
      taskError(
        "projectManagement.databaseError",
        "Database operation failed.",
        mapDatabaseError(error),
      ),
    );
  }
}

export async function addTaskEvidenceLink(
  input: AddTaskEvidenceLinkInput,
  dependencies: TaskApplicationDependencies = {},
): Promise<Result<TaskEvidenceDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownTaskId = assertKnownTaskId(input.taskId);
  if (!knownTaskId.ok) {
    return err(knownTaskId.error);
  }

  const url = normalizeEvidenceUrl(input.url);
  const filename = normalizeEvidenceFilename(input.title ?? input.url);
  const provenance = normalizeEvidenceProvenance(input.provenance, "Attached from link");
  if (!url.ok) {
    return err(url.error);
  }
  if (!filename.ok) {
    return err(filename.error);
  }
  if (!provenance.ok) {
    return err(provenance.error);
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeTask(input, "update", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const existing = await ensureTaskExists(tx, input.taskId, input.workspaceId);
      if (!existing.ok) {
        return err(existing.error);
      }

      const result = await tx.execute(sql`
        insert into public.task_evidence (
          task_id,
          organization_id,
          workspace_id,
          kind,
          url,
          filename,
          provenance,
          created_by_user_id
        )
        values (
          ${input.taskId},
          ${input.orgId},
          ${input.workspaceId},
          'link'::public.task_evidence_kind,
          ${url.value},
          ${filename.value},
          ${provenance.value},
          ${input.actor.userId}
        )
        returning
          id,
          task_id,
          organization_id,
          workspace_id,
          kind,
          object_ref,
          url,
          filename,
          content_type,
          size,
          provenance,
          created_by_user_id,
          created_at
      `);

      const row = rowsFromExecuteResult(result)[0];
      return row === undefined
        ? err(
            taskError(
              "projectManagement.evidenceCreateFailed",
              "Evidence link could not be added.",
            ),
          )
        : ok(rowToEvidenceDto(row));
    });
  } catch (error) {
    return err(
      taskError(
        "projectManagement.databaseError",
        "Database operation failed.",
        mapDatabaseError(error),
      ),
    );
  }
}

export async function listTaskEvidence(
  input: ListTaskEvidenceInput,
  dependencies: TaskApplicationDependencies = {},
): Promise<Result<readonly TaskEvidenceDto[]>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownTaskId = assertKnownTaskId(input.taskId);
  if (!knownTaskId.ok) {
    return err(knownTaskId.error);
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeTask(input, "read", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const existing = await ensureTaskExists(tx, input.taskId, input.workspaceId);
      if (!existing.ok) {
        return err(existing.error);
      }

      return ok(await selectEvidence(tx, input.taskId));
    });
  } catch (error) {
    return err(
      taskError(
        "projectManagement.databaseError",
        "Database operation failed.",
        mapDatabaseError(error),
      ),
    );
  }
}

export async function ensureTaskQualityReview(
  input: EnsureTaskQualityReviewInput,
  dependencies: TaskApplicationDependencies = {},
): Promise<Result<TaskQualityReviewDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownTaskId = assertKnownTaskId(input.taskId);
  if (!knownTaskId.ok) {
    return err(knownTaskId.error);
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeTask(input, "read", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const existingTask = await ensureTaskExists(tx, input.taskId, input.workspaceId);
      if (!existingTask.ok) {
        return err(existingTask.error);
      }

      const ensured = await ensureQualityReview(tx, input);
      if (!ensured.ok) {
        return err(ensured.error);
      }

      const review = await selectQualityReview(tx, input.taskId);
      return review === null
        ? err(
            taskError(
              "projectManagement.qualityReviewCreateFailed",
              "Quality review could not be created.",
            ),
          )
        : ok(review);
    });
  } catch (error) {
    return err(
      taskError(
        "projectManagement.databaseError",
        "Database operation failed.",
        mapDatabaseError(error),
      ),
    );
  }
}

export async function addQualityCheck(
  input: AddQualityCheckInput,
  dependencies: TaskApplicationDependencies = {},
): Promise<Result<TaskQualityReviewDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownTaskId = assertKnownTaskId(input.taskId);
  if (!knownTaskId.ok) {
    return err(knownTaskId.error);
  }

  const label = normalizeQualityLabel(input.label);
  const kind = normalizeQualityCheckKind(input.kind);
  const state = normalizeQualityCheckState(input.state ?? "pending");
  const actor = actorLabel(input, input.actorLabel);
  if (!label.ok) {
    return err(label.error);
  }
  if (!kind.ok) {
    return err(kind.error);
  }
  if (!state.ok) {
    return err(state.error);
  }
  if (!actor.ok) {
    return err(actor.error);
  }

  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  if (!idempotencyKey.ok) {
    return err(idempotencyKey.error);
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeTask(input, "update", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const existingTask = await ensureTaskExists(tx, input.taskId, input.workspaceId);
      if (!existingTask.ok) {
        return err(existingTask.error);
      }

      const review = await ensureQualityReview(tx, input);
      if (!review.ok) {
        return err(review.error);
      }

      // Idempotent replay: if this key already recorded a check, return the
      // existing review UNCONDITIONALLY — a retry (at-least-once) must not fail
      // just because the review was approved after the original check landed.
      // The approved-is-terminal gate below applies only to genuinely new checks.
      if (idempotencyKey.value !== null) {
        const replay = await tx.execute(sql`
          select 1
          from public.task_quality_check
          where organization_id = ${input.orgId}
            and idempotency_key = ${idempotencyKey.value}
          limit 1
        `);
        if (rowsFromExecuteResult(replay)[0] !== undefined) {
          const loaded = await selectQualityReview(tx, input.taskId);
          return loaded === null
            ? err(
                taskError(
                  "projectManagement.qualityReviewLoadFailed",
                  "Quality review could not be loaded.",
                ),
              )
            : ok(loaded);
        }
      }

      if (review.value.status === "approved") {
        return err(
          taskError(
            "projectManagement.qualityReviewConflict",
            "Approved quality reviews cannot be changed.",
          ),
        );
      }

      const inserted = await tx.execute(sql`
        insert into public.task_quality_check (
          review_id,
          organization_id,
          workspace_id,
          task_id,
          label,
          kind,
          state,
          actor,
          idempotency_key
        )
        values (
          ${review.value.id},
          ${input.orgId},
          ${input.workspaceId},
          ${input.taskId},
          ${label.value},
          ${kind.value}::public.task_quality_check_kind,
          ${state.value}::public.task_quality_check_state,
          ${actor.value},
          ${idempotencyKey.value}
        )
        on conflict (organization_id, idempotency_key)
        do update set idempotency_key = excluded.idempotency_key
        returning task_id
      `);

      const insertedRow = rowsFromExecuteResult(inserted)[0];
      const reviewTaskId =
        insertedRow === undefined ? input.taskId : String(insertedRow["task_id"]);
      const loaded = await selectQualityReview(tx, reviewTaskId);
      return loaded === null
        ? err(
            taskError(
              "projectManagement.qualityReviewLoadFailed",
              "Quality review could not be loaded.",
            ),
          )
        : ok(loaded);
    });
  } catch (error) {
    return err(
      taskError(
        "projectManagement.databaseError",
        "Database operation failed.",
        mapDatabaseError(error),
      ),
    );
  }
}

export async function toggleQualityCheck(
  input: ToggleQualityCheckInput,
  dependencies: TaskApplicationDependencies = {},
): Promise<Result<TaskQualityReviewDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownTaskId = assertKnownTaskId(input.taskId);
  if (!knownTaskId.ok) {
    return err(knownTaskId.error);
  }

  const knownCheckId = assertKnownUuid(input.checkId, "Quality check id");
  if (!knownCheckId.ok) {
    return err(knownCheckId.error);
  }

  const state = normalizeQualityCheckState(input.state);
  if (!state.ok) {
    return err(state.error);
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeTask(input, "update", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const currentCheckResult = await tx.execute(sql`
        select
          c.review_id,
          r.status
        from public.task_quality_check c
        join public.task_quality_review r
          on r.id = c.review_id
          and r.organization_id = c.organization_id
        where c.id = ${input.checkId}
          and c.task_id = ${input.taskId}
          and c.workspace_id = ${input.workspaceId}
        limit 1
      `);
      const currentCheck = rowsFromExecuteResult(currentCheckResult)[0];
      if (currentCheck === undefined) {
        return err(
          taskError("projectManagement.qualityCheckNotFound", "Quality check was not found."),
        );
      }
      if (currentCheck["status"] === "approved") {
        return err(
          taskError(
            "projectManagement.qualityReviewConflict",
            "Approved quality reviews cannot be changed.",
          ),
        );
      }

      const result = await tx.execute(sql`
        update public.task_quality_check
        set state = ${state.value}::public.task_quality_check_state,
            updated_at = now()
        where id = ${input.checkId}
          and task_id = ${input.taskId}
          and workspace_id = ${input.workspaceId}
        returning review_id
      `);
      if (rowsFromExecuteResult(result)[0] === undefined) {
        return err(
          taskError("projectManagement.qualityCheckNotFound", "Quality check was not found."),
        );
      }

      await tx.execute(sql`
        update public.task_quality_review
        set status = case
            when exists (
              select 1
              from public.task_quality_check c
              where c.task_id = ${input.taskId}
                and c.state = 'fail'::public.task_quality_check_state
            ) then 'changes_requested'::public.task_quality_review_status
            else 'open'::public.task_quality_review_status
          end,
          approved_by_user_id = null,
          approved_at = null,
          updated_at = now()
        where task_id = ${input.taskId}
          and status <> 'approved'::public.task_quality_review_status
      `);

      const loaded = await selectQualityReview(tx, input.taskId);
      return loaded === null
        ? err(
            taskError(
              "projectManagement.qualityReviewLoadFailed",
              "Quality review could not be loaded.",
            ),
          )
        : ok(loaded);
    });
  } catch (error) {
    return err(
      taskError(
        "projectManagement.databaseError",
        "Database operation failed.",
        mapDatabaseError(error),
      ),
    );
  }
}

export async function issueDoneConfirmation(
  input: IssueDoneConfirmationInput,
  dependencies: TaskApplicationDependencies = {},
): Promise<Result<string>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownTaskId = assertKnownTaskId(input.taskId);
  if (!knownTaskId.ok) {
    return err(knownTaskId.error);
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeTask(input, "update", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const result = await tx.execute(sql`
        insert into public.task_done_confirmation (
          task_id,
          organization_id,
          workspace_id,
          issued_for_user_id,
          expires_at
        )
        select
          t.id,
          t.organization_id,
          t.workspace_id,
          ${input.actor.userId},
          now() + interval '5 minutes'
        from public.tasks t
        where t.id = ${input.taskId}
          and t.workspace_id = ${input.workspaceId}
        returning id
      `);
      const nonce = rowsFromExecuteResult(result)[0]?.["id"];
      return typeof nonce === "string"
        ? ok(nonce)
        : err(taskError("projectManagement.taskNotFound", "Task was not found."));
    });
  } catch (error) {
    return err(databaseError(error));
  }
}

export async function markTaskDone(
  input: MarkTaskDoneInput,
  dependencies: TaskApplicationDependencies = {},
): Promise<Result<TaskDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownTaskId = assertKnownTaskId(input.taskId);
  if (!knownTaskId.ok) {
    return err(knownTaskId.error);
  }

  if (!Number.isInteger(input.position) || input.position < 0) {
    return err(
      taskError(
        "projectManagement.invalidTaskPosition",
        "Task position must be a non-negative integer.",
      ),
    );
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeTask(input, "update", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  if (!hasValidHumanCommandAttestation(input)) {
    return err(taskDoneRequiresHumanAttestation());
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const review = await selectQualityReview(tx, input.taskId);
      if (
        review === null ||
        review.workspaceId !== input.workspaceId ||
        review.status !== "approved"
      ) {
        return err(taskDoneRequiresApprovedReview());
      }

      const consumed = await tx.execute(sql`
        update public.task_done_confirmation
        set
          consumed_at = now(),
          consumed_by_user_id = ${input.actor.userId},
          quality_review_id = ${review.id}
        where id = ${input.humanCommand.confirmNonce}
          and task_id = ${input.taskId}
          and organization_id = ${input.orgId}
          and workspace_id = ${input.workspaceId}
          and issued_for_user_id = ${input.actor.userId}
          and consumed_at is null
          and expires_at > now()
        returning id
      `);
      if (rowsFromExecuteResult(consumed)[0] === undefined) {
        return err(taskDoneRequiresHumanAttestation());
      }

      const result = await tx.execute(sql`
        update public.tasks
        set
          status = 'done'::public.task_status,
          position = ${input.position},
          updated_at = now()
        where id = ${input.taskId}
          and workspace_id = ${input.workspaceId}
        returning
          id,
          organization_id,
          workspace_id,
          title,
          description,
          status,
          priority,
          assignee_user_id,
          null::text as assignee_name,
          labels,
          position,
          card_number,
          due_at,
          provenance_source,
          provenance_external_ref,
          created_at,
          updated_at
      `);
      const row = rowsFromExecuteResult(result)[0];
      if (row === undefined) {
        throw new TaskCommandRollbackError(
          taskError("projectManagement.taskNotFound", "Task was not found."),
        );
      }

      return ok(rowToTaskDto(row));
    });
  } catch (error) {
    if (error instanceof TaskCommandRollbackError) {
      return err(error.domainError);
    }

    return err(
      taskError(
        "projectManagement.taskDoneFailed",
        "Task could not be marked Done.",
        mapDatabaseError(error),
      ),
    );
  }
}

export async function approveQualityReview(
  input: ApproveQualityReviewInput,
  dependencies: TaskApplicationDependencies = {},
): Promise<Result<TaskQualityReviewDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownTaskId = assertKnownTaskId(input.taskId);
  if (!knownTaskId.ok) {
    return err(knownTaskId.error);
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeTask(input, "update", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const existingTask = await ensureTaskExists(tx, input.taskId, input.workspaceId);
      if (!existingTask.ok) {
        return err(existingTask.error);
      }

      const review = await ensureQualityReview(tx, input);
      if (!review.ok) {
        return err(review.error);
      }

      if (input.expectedReviewId !== undefined && input.expectedReviewId !== review.value.id) {
        return err(
          taskError(
            "projectManagement.qualityReviewConflict",
            "Quality review changed before approval.",
          ),
        );
      }

      const loadedBefore = await selectQualityReview(tx, input.taskId);
      if (loadedBefore === null) {
        return err(
          taskError(
            "projectManagement.qualityReviewLoadFailed",
            "Quality review could not be loaded.",
          ),
        );
      }

      const remaining = loadedBefore.checks.filter((check) => check.state !== "pass");
      if (remaining.length > 0) {
        return err(
          taskError(
            "projectManagement.qualityReviewIncomplete",
            "All quality checks must pass before approval.",
          ),
        );
      }

      if (loadedBefore.status !== "approved") {
        const approved = await tx.execute(sql`
          update public.task_quality_review
          set status = 'approved'::public.task_quality_review_status,
              approved_by_user_id = ${input.actor.userId},
              approved_at = now(),
              updated_at = now()
          where id = ${review.value.id}
            and task_id = ${input.taskId}
            and workspace_id = ${input.workspaceId}
            and status <> 'approved'::public.task_quality_review_status
          returning id
        `);
        if (rowsFromExecuteResult(approved)[0] === undefined) {
          const current = await selectQualityReview(tx, input.taskId);
          return current === null
            ? err(
                taskError(
                  "projectManagement.qualityReviewLoadFailed",
                  "Quality review could not be loaded.",
                ),
              )
            : ok(current);
        }
      }

      await tx.execute(sql`
        insert into public.task_quality_reviewer (
          review_id,
          organization_id,
          workspace_id,
          task_id,
          reviewer_user_id,
          state,
          updated_at
        )
        values (
          ${review.value.id},
          ${input.orgId},
          ${input.workspaceId},
          ${input.taskId},
          ${input.actor.userId},
          'approved'::public.task_quality_reviewer_state,
          now()
        )
        on conflict (review_id, reviewer_user_id)
        do update set state = excluded.state, updated_at = excluded.updated_at
      `);

      const loaded = await selectQualityReview(tx, input.taskId);
      return loaded === null
        ? err(
            taskError(
              "projectManagement.qualityReviewLoadFailed",
              "Quality review could not be loaded.",
            ),
          )
        : ok(loaded);
    });
  } catch (error) {
    return err(
      taskError(
        "projectManagement.databaseError",
        "Database operation failed.",
        mapDatabaseError(error),
      ),
    );
  }
}

export async function getCardDetail(
  input: GetCardDetailInput,
  dependencies: TaskApplicationDependencies = {},
): Promise<Result<CardDetailDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownTaskId = assertKnownTaskId(input.taskId);
  if (!knownTaskId.ok) {
    return err(knownTaskId.error);
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeTask(input, "read", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const task = await selectTaskById(tx, input.taskId, input.workspaceId);
      if (task === null) {
        return err(taskError("projectManagement.taskNotFound", "Task was not found."));
      }

      const steps = await selectSteps(tx, input.taskId);
      const comments = await selectComments(tx, input.taskId);
      const watchers = await selectWatchers(tx, input.taskId);
      const evidence = await selectEvidence(tx, input.taskId);
      const qualityReview = await selectQualityReview(tx, input.taskId);

      return ok({ task, steps, comments, watchers, evidence, qualityReview });
    });
  } catch (error) {
    return err(
      taskError(
        "projectManagement.cardDetailLoadFailed",
        "Task card detail could not be loaded.",
        mapDatabaseError(error),
      ),
    );
  }
}
