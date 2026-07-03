import {
  ConflictError,
  mapDatabaseError,
  sql,
  withTenant,
  type TenantTransaction
} from "@opzava/adapters";
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
  type Result
} from "@opzava/shared-kernel";

import { defaultTaskAuthorizationPort } from "./authorization.js";
import {
  normalizeTaskDescription,
  normalizeTaskLabels,
  normalizeTaskTitle,
  parseTaskPriority,
  parseTaskStatus,
  type TaskPriority,
  type TaskStatus
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

export interface CardDetailDto {
  readonly task: TaskDto;
  readonly steps: readonly TaskStepDto[];
  readonly comments: readonly TaskCommentDto[];
  readonly watchers: readonly TaskWatcherDto[];
}

export interface CreateStepInput extends TaskApplicationContext {
  readonly taskId: string;
  readonly text: string;
  readonly assigneeUserId?: string | null;
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

function taskError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause })
  });
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
    "Task record contains an invalid timestamp."
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
    updatedAt: parseDate(row["updated_at"])
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
    updatedAt: parseDate(row["updated_at"])
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
    createdAt: parseDate(row["created_at"])
  };
}

function rowToWatcherDto(row: QueryRow): TaskWatcherDto {
  return {
    taskId: String(row["task_id"]),
    organizationId: String(row["organization_id"]),
    workspaceId: String(row["workspace_id"]),
    userId: String(row["user_id"]),
    name: stringOrNull(row["name"]),
    createdAt: parseDate(row["created_at"])
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
        error
      )
    );
  }
}

function assertKnownTaskId(taskId: string): Result<void> {
  try {
    makeTaskId(taskId);
    return ok(undefined);
  } catch (error) {
    return err(
      taskError("projectManagement.invalidTaskId", "Task id is invalid.", error)
    );
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertKnownUuid(value: string, field: string): Result<void> {
  if (uuidPattern.test(value)) {
    return ok(undefined);
  }

  return err(
    taskError("projectManagement.invalidTaskCardId", `${field} must be a valid id.`)
  );
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
    roleKeys: input.actor.roleKeys
  };
}

async function authorizeTask(
  input: TaskApplicationContext,
  action: "read" | "create" | "update" | "delete",
  authorizationPort: AuthorizationPort
): Promise<Result<void>> {
  const decisionResult = await authorizationPort.can(authorizationSubject(input), action, {
    type: "task",
    tenantId: makeTenantId(input.orgId),
    orgId: makeOrgId(input.orgId),
    workspaceId: makeWorkspaceId(input.workspaceId)
  });

  if (!decisionResult.ok) {
    return err(decisionResult.error);
  }

  if (!decisionResult.value.allowed) {
    return err(
      taskError("projectManagement.forbidden", "You are not allowed to manage tasks.")
    );
  }

  return ok(undefined);
}

function normalizeAssignee(
  assigneeUserId: string | null | undefined,
  actorUserId: string
): Result<string | null> {
  if (assigneeUserId === undefined || assigneeUserId === null || assigneeUserId.trim() === "") {
    return ok(null);
  }

  const normalized = assigneeUserId.trim();
  if (normalized !== actorUserId) {
    return err(
      taskError(
        "projectManagement.unsupportedTaskAssignee",
        "This slice can assign tasks only to the current user or leave them unassigned."
      )
    );
  }

  return ok(normalized);
}

function normalizeOptionalUserId(value: string | null | undefined, field: string): Result<string | null> {
  if (value === undefined || value === null || value.trim() === "") {
    return ok(null);
  }

  const normalized = value.trim();
  try {
    makeUserId(normalized);
    return ok(normalized);
  } catch (error) {
    return err(
      taskError(
        "projectManagement.invalidUserId",
        `${field} must be a valid user id.`,
        error
      )
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
        taskError("projectManagement.invalidUserId", "Watcher user ids must be valid.", error)
      );
    }
  }

  if (unique.length > 32) {
    return err(
      taskError("projectManagement.tooManyWatchers", "A task can have at most 32 watchers.")
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
    return err(
      taskError("projectManagement.invalidDueAt", "Task due date must be a valid date.")
    );
  }

  return ok(date.toISOString());
}

function normalizeProvenanceSource(value: string | undefined): Result<string> {
  const source = (value ?? "manual").trim().replace(/\s+/g, " ");

  if (source.length === 0 || source.length > 240) {
    return err(
      taskError(
        "projectManagement.invalidTaskProvenance",
        "Task provenance source must be 1-240 characters."
      )
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
        "Task provenance external ref must be 500 characters or fewer."
      )
    );
  }

  return ok(normalized);
}

function normalizeStepText(value: string): Result<string> {
  const text = value.trim().replace(/\s+/g, " ");

  if (text.length === 0 || text.length > 500) {
    return err(
      taskError("projectManagement.invalidTaskStep", "Task step text must be 1-500 characters.")
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
        "Task comment body must be 1-4000 characters."
      )
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
        "Assistant key must be 3-180 safe characters."
      )
    );
  }

  return ok(normalized);
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
    provenanceExternalRef: provenanceExternalRef.value
  });
}

async function selectTaskRows(tx: TenantTransaction, workspaceId: string): Promise<readonly TaskDto[]> {
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
  workspaceId: string
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

async function ensureTaskExists(
  tx: TenantTransaction,
  taskId: string,
  workspaceId: string
): Promise<Result<void>> {
  const task = await selectTaskById(tx, taskId, workspaceId);
  return task === null
    ? err(taskError("projectManagement.taskNotFound", "Task was not found."))
    : ok(undefined);
}

async function selectSteps(
  tx: TenantTransaction,
  taskId: string
): Promise<readonly TaskStepDto[]> {
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
  taskId: string
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
  taskId: string
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

export async function createTask(
  input: CreateTaskInput,
  dependencies: TaskApplicationDependencies = {}
): Promise<Result<TaskDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const status = parseTaskStatus(input.status ?? "todo");
  if (!status.ok) {
    return err(status.error);
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
    provenanceExternalRef: input.provenanceExternalRef
  });
  if (!fields.ok) {
    return err(fields.error);
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeTask(input, "create", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await createTaskOnce(input, status.value, fields.value);
    if (result.ok || !(result.error.cause instanceof ConflictError)) {
      return result;
    }
  }

  return err(
    taskError(
      "projectManagement.taskCreateFailed",
      "Task could not be created after retrying card number allocation."
    )
  );
}

async function createTaskOnce(
  input: CreateTaskInput,
  status: TaskStatus,
  fields: PreparedTaskFields
): Promise<Result<TaskDto>> {
  try {
    return await withTenant(input.orgId, async (tx) => {
      const result = await tx.execute(sql`
        with next_position as (
          select coalesce(max(position), 0) + 1 as value
          from public.tasks
          where workspace_id = ${input.workspaceId}
            and status = ${status}::public.task_status
        )
        insert into public.tasks (
          organization_id,
          workspace_id,
          title,
          description,
          status,
          priority,
          assignee_user_id,
          labels,
          position,
          due_at,
          provenance_source,
          provenance_external_ref
        )
        select
          ${input.orgId},
          ${input.workspaceId},
          ${fields.title},
          ${fields.description},
          ${status}::public.task_status,
          ${fields.priority}::public.task_priority,
          ${fields.assigneeUserId},
          ${sql.param(fields.labels)}::text[],
          next_position.value,
          ${fields.dueAt},
          ${fields.provenanceSource},
          ${fields.provenanceExternalRef}
        from next_position
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
      if (row === undefined) {
        return err(
          taskError("projectManagement.taskCreateFailed", "Task could not be created.")
        );
      }

      return ok(rowToTaskDto(row));
    });
  } catch (error) {
    return err(
      taskError(
        "projectManagement.taskCreateFailed",
        "Task could not be created.",
        mapDatabaseError(error)
      )
    );
  }
}

export async function listTasks(
  input: ListTasksInput,
  dependencies: TaskApplicationDependencies = {}
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
    return await withTenant(input.orgId, async (tx) => ok(await selectTaskRows(tx, input.workspaceId)));
  } catch (error) {
    return err(
      taskError(
        "projectManagement.taskListFailed",
        "Tasks could not be loaded.",
        mapDatabaseError(error)
      )
    );
  }
}

export async function getTask(
  input: GetTaskInput,
  dependencies: TaskApplicationDependencies = {}
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
        mapDatabaseError(error)
      )
    );
  }
}

export async function updateTask(
  input: UpdateTaskInput,
  dependencies: TaskApplicationDependencies = {}
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
    provenanceExternalRef: undefined
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
        mapDatabaseError(error)
      )
    );
  }
}

export async function moveTask(
  input: MoveTaskInput,
  dependencies: TaskApplicationDependencies = {}
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

  if (!Number.isInteger(input.position) || input.position < 0) {
    return err(
      taskError(
        "projectManagement.invalidTaskPosition",
        "Task position must be a non-negative integer."
      )
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
        mapDatabaseError(error)
      )
    );
  }
}

export async function createStep(
  input: CreateStepInput,
  dependencies: TaskApplicationDependencies = {}
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
          position
        )
        select
          ${input.taskId},
          ${input.orgId},
          ${input.workspaceId},
          ${text.value},
          ${assigneeUserId.value},
          next_position.value
        from next_position
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
        mapDatabaseError(error)
      )
    );
  }
}

export async function toggleStep(
  input: ToggleStepInput,
  dependencies: TaskApplicationDependencies = {}
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
        mapDatabaseError(error)
      )
    );
  }
}

export async function reorderSteps(
  input: ReorderStepsInput,
  dependencies: TaskApplicationDependencies = {}
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
        "Step order must include each step id exactly once."
      )
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
            "Step order must include every current step exactly once."
          )
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
        mapDatabaseError(error)
      )
    );
  }
}

export async function addComment(
  input: AddCommentInput,
  dependencies: TaskApplicationDependencies = {}
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
      taskError("projectManagement.invalidCommentAuthor", "Comment author kind is invalid.")
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
        "Assistant comments require an assistant key."
      )
    );
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
          body
        )
        values (
          ${input.taskId},
          ${input.orgId},
          ${input.workspaceId},
          ${authorKind}::public.task_comment_author_kind,
          ${authorKind === "human" ? input.actor.userId : null},
          ${authorKind === "assistant" ? assistantKey.value : null},
          ${body.value}
        )
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
            taskError("projectManagement.commentCreateFailed", "Task comment could not be added.")
          )
        : ok(rowToCommentDto(row));
    });
  } catch (error) {
    return err(
      taskError(
        "projectManagement.commentCreateFailed",
        "Task comment could not be added.",
        mapDatabaseError(error)
      )
    );
  }
}

export async function setDue(
  input: SetDueInput,
  dependencies: TaskApplicationDependencies = {}
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
        mapDatabaseError(error)
      )
    );
  }
}

export async function setWatchers(
  input: SetWatchersInput,
  dependencies: TaskApplicationDependencies = {}
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
        mapDatabaseError(error)
      )
    );
  }
}

export async function markCommentsRead(
  input: MarkCommentsReadInput,
  dependencies: TaskApplicationDependencies = {}
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
        mapDatabaseError(error)
      )
    );
  }
}

export async function getCardDetail(
  input: GetCardDetailInput,
  dependencies: TaskApplicationDependencies = {}
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

      return ok({ task, steps, comments, watchers });
    });
  } catch (error) {
    return err(
      taskError(
        "projectManagement.cardDetailLoadFailed",
        "Task card detail could not be loaded.",
        mapDatabaseError(error)
      )
    );
  }
}
