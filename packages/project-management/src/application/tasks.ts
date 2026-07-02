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
  readonly title: string;
  readonly description: string;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly assigneeUserId: string | null;
  readonly assigneeName: string | null;
  readonly labels: readonly string[];
  readonly position: number;
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

export interface TaskApplicationDependencies {
  readonly authorizationPort?: AuthorizationPort;
}

interface PreparedTaskFields {
  readonly title: string;
  readonly description: string;
  readonly priority: TaskPriority;
  readonly assigneeUserId: string | null;
  readonly labels: readonly string[];
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

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
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
    title: String(row["title"]),
    description: String(row["description"] ?? ""),
    status: status.value,
    priority: priority.value,
    assigneeUserId: stringOrNull(row["assignee_user_id"]),
    assigneeName: stringOrNull(row["assignee_name"]),
    labels: Array.isArray(labels) ? labels.map(String) : [],
    position: Number(row["position"]),
    createdAt: parseDate(row["created_at"]),
    updatedAt: parseDate(row["updated_at"])
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

function prepareTaskFields(input: {
  readonly title: string;
  readonly description: string | undefined;
  readonly priority: TaskPriority;
  readonly assigneeUserId: string | null | undefined;
  readonly labels: readonly string[] | undefined;
  readonly actorUserId: string;
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

  return ok({
    title: title.value,
    description: description.value,
    priority: priority.value,
    assigneeUserId: assigneeUserId.value,
    labels: labels.value
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
    actorUserId: input.actor.userId
  });
  if (!fields.ok) {
    return err(fields.error);
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeTask(input, "create", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const result = await tx.execute(sql`
        with next_position as (
          select coalesce(max(position), 0) + 1 as value
          from public.tasks
          where workspace_id = ${input.workspaceId}
            and status = ${status.value}::public.task_status
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
          position
        )
        select
          ${input.orgId},
          ${input.workspaceId},
          ${fields.value.title},
          ${fields.value.description},
          ${status.value}::public.task_status,
          ${fields.value.priority}::public.task_priority,
          ${fields.value.assigneeUserId},
          ${sql.param(fields.value.labels)}::text[],
          next_position.value
        from next_position
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
    actorUserId: input.actor.userId
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
