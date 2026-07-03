import { mapDatabaseError, sql, withTenant, type TenantTransaction } from "@opzava/adapters";
import type {
  AuthorizationPort,
  AuthorizationSubject,
  IssueTrackerIssue,
  IssueTrackerPort,
} from "@opzava/ports";
import {
  DomainError,
  err,
  makeOrgId,
  makeTenantId,
  makeUserId,
  makeWorkspaceId,
  ok,
  type Result,
} from "@opzava/shared-kernel";

import { defaultTaskAuthorizationPort } from "./authorization.js";
import type { TaskApplicationContext, TaskDto } from "./tasks.js";

export type IssueProjectionState = "open" | "closed";
export type IssueTriageFilter =
  "all" | "needs-triage" | "ready-for-agent" | "ready-for-human" | "in-progress" | "closed";

export interface IssueProjectionDto {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly repository: string;
  readonly number: number;
  readonly title: string;
  readonly state: IssueProjectionState;
  readonly labels: readonly string[];
  readonly assignee: string | null;
  readonly updatedAt: string;
  readonly syncedAt: string;
  readonly url: string;
  readonly linkedTaskId: string | null;
  readonly linkedTaskStatus: string | null;
}

export interface IssueCloseOutboxDto {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly taskId: string;
  readonly repository: string;
  readonly issueNumber: number;
  readonly issueUrl: string;
  readonly dedupeKey: string;
  readonly state: "pending" | "processing" | "closed" | "failed";
  readonly closeReason: "completed" | "not_planned";
  readonly attempts: number;
  readonly nextAttemptAt: string;
  readonly lastError: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly closedAt: string | null;
}

export interface ListIssueProjectionsInput extends TaskApplicationContext {
  readonly repository: string;
  readonly filter?: IssueTriageFilter;
}

export interface SyncIssueProjectionInput extends TaskApplicationContext {
  readonly repository: string;
}

export interface CreateTrackedIssueInput extends TaskApplicationContext {
  readonly repository: string;
  readonly title: string;
  readonly body?: string;
  readonly labels?: readonly string[];
}

export interface EnqueueIssueCloseInput extends TaskApplicationContext {
  readonly task: TaskDto;
}

export interface ProcessIssueCloseOutboxInput extends TaskApplicationContext {
  readonly repository: string;
  readonly limit?: number;
}

export interface IssueApplicationDependencies {
  readonly authorizationPort?: AuthorizationPort;
  readonly issueTrackerPort?: IssueTrackerPort;
  readonly now?: () => Date;
}

type QueryRow = Record<string, unknown>;

function issueError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause }),
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
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  throw issueError("projectManagement.invalidIssueRecord", "Issue record timestamp is invalid.");
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function stateValue(value: unknown): IssueProjectionState {
  return value === "closed" ? "closed" : "open";
}

function rowToIssueProjection(row: QueryRow): IssueProjectionDto {
  return {
    id: String(row["id"]),
    organizationId: String(row["organization_id"]),
    workspaceId: String(row["workspace_id"]),
    repository: String(row["repository"]),
    number: Number(row["number"]),
    title: String(row["title"]),
    state: stateValue(row["state"]),
    labels: stringArray(row["labels"]),
    assignee: stringOrNull(row["assignee"]),
    updatedAt: parseDate(row["updated_at"]),
    syncedAt: parseDate(row["synced_at"]),
    url: String(row["url"]),
    linkedTaskId: stringOrNull(row["linked_task_id"]),
    linkedTaskStatus: stringOrNull(row["linked_task_status"]),
  };
}

function rowToIssueCloseOutbox(row: QueryRow): IssueCloseOutboxDto {
  const state =
    row["state"] === "processing" || row["state"] === "closed" || row["state"] === "failed"
      ? row["state"]
      : "pending";
  const closeReason = row["close_reason"] === "not_planned" ? "not_planned" : "completed";

  return {
    id: String(row["id"]),
    organizationId: String(row["organization_id"]),
    workspaceId: String(row["workspace_id"]),
    taskId: String(row["task_id"]),
    repository: String(row["repository"]),
    issueNumber: Number(row["issue_number"]),
    issueUrl: String(row["issue_url"]),
    dedupeKey: String(row["dedupe_key"]),
    state,
    closeReason,
    attempts: Number(row["attempts"]),
    nextAttemptAt: parseDate(row["next_attempt_at"]),
    lastError: stringOrNull(row["last_error"]),
    createdAt: parseDate(row["created_at"]),
    updatedAt: parseDate(row["updated_at"]),
    closedAt:
      row["closed_at"] === null || row["closed_at"] === undefined
        ? null
        : parseDate(row["closed_at"]),
  };
}

function assertKnownContext(input: TaskApplicationContext): Result<void> {
  try {
    makeTenantId(input.orgId);
    makeOrgId(input.orgId);
    makeWorkspaceId(input.workspaceId);
    makeUserId(input.actor.userId);
    return ok(undefined);
  } catch (error) {
    return err(
      issueError(
        "projectManagement.invalidIssueContext",
        "Issue context contains an invalid organization, workspace, or actor id.",
        error,
      ),
    );
  }
}

function authorizationSubject(input: TaskApplicationContext): AuthorizationSubject {
  return {
    userId: makeUserId(input.actor.userId),
    tenantId: makeTenantId(input.orgId),
    orgId: makeOrgId(input.orgId),
    workspaceIds: [makeWorkspaceId(input.workspaceId)],
    roleKeys: input.actor.roleKeys,
  };
}

async function authorizeIssue(
  input: TaskApplicationContext,
  action: "read" | "create" | "update" | "delete",
  authorizationPort: AuthorizationPort,
): Promise<Result<void>> {
  const decision = await authorizationPort.can(authorizationSubject(input), action, {
    type: "task",
    tenantId: makeTenantId(input.orgId),
    orgId: makeOrgId(input.orgId),
    workspaceId: makeWorkspaceId(input.workspaceId),
  });

  if (!decision.ok) {
    return err(decision.error);
  }

  if (!decision.value.allowed) {
    return err(issueError("projectManagement.forbidden", "You are not allowed to manage issues."));
  }

  return ok(undefined);
}

function normalizeRepository(repository: string): Result<string> {
  const normalized = repository.trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(normalized)) {
    return err(
      issueError(
        "projectManagement.invalidIssueRepository",
        "Issue repository must be in owner/name form.",
      ),
    );
  }

  return ok(normalized);
}

function normalizeTitle(title: string): Result<string> {
  const normalized = title.trim().replace(/\s+/g, " ");
  if (normalized.length === 0 || normalized.length > 256) {
    return err(
      issueError("projectManagement.invalidIssueTitle", "Issue title must be 1-256 characters."),
    );
  }

  return ok(normalized);
}

export function issueRefFromTask(task: TaskDto): {
  readonly repository: string;
  readonly number: number;
  readonly url: string;
} | null {
  const value = task.provenanceExternalRef;
  if (value === null || value.trim() === "") {
    return null;
  }

  const shortRef = /^github:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#([1-9]\d*)$/i.exec(value.trim());
  if (shortRef !== null) {
    const repository = shortRef[1];
    const number = shortRef[2];
    if (repository === undefined || number === undefined) {
      return null;
    }

    return {
      repository,
      number: Number(number),
      url: `https://github.com/${repository}/issues/${number}`,
    };
  }

  const urlRef =
    /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/issues\/([1-9]\d*)$/i.exec(
      value.trim(),
    );
  if (urlRef !== null) {
    const repository = urlRef[1];
    const number = urlRef[2];
    if (repository === undefined || number === undefined) {
      return null;
    }

    return {
      repository,
      number: Number(number),
      url: value.trim(),
    };
  }

  return null;
}

export function issueFilterFromLabels(
  issue: Pick<IssueProjectionDto, "labels" | "state">,
): Exclude<IssueTriageFilter, "all"> {
  const labels = new Set(issue.labels.map((label) => label.toLowerCase()));
  if (issue.state === "closed") {
    return "closed";
  }

  if (labels.has("ready-for-agent")) {
    return "ready-for-agent";
  }

  if (labels.has("ready-for-human")) {
    return "ready-for-human";
  }

  if (labels.has("in-progress") || labels.has("in progress")) {
    return "in-progress";
  }

  return "needs-triage";
}

function issueMatchesFilter(issue: IssueProjectionDto, filter: IssueTriageFilter): boolean {
  return filter === "all" ? true : issueFilterFromLabels(issue) === filter;
}

function trackerRequired(dependencies: IssueApplicationDependencies): Result<IssueTrackerPort> {
  return dependencies.issueTrackerPort === undefined
    ? err(
        issueError(
          "projectManagement.issueTrackerMissing",
          "Issue tracker adapter is required for this operation.",
        ),
      )
    : ok(dependencies.issueTrackerPort);
}

async function upsertIssueProjection(
  tx: TenantTransaction,
  input: TaskApplicationContext,
  issue: IssueTrackerIssue,
  syncedAt: Date,
): Promise<IssueProjectionDto> {
  const result = await tx.execute(sql`
    insert into public.issue_projection (
      organization_id,
      workspace_id,
      repository,
      number,
      title,
      state,
      labels,
      assignee,
      updated_at,
      synced_at,
      url
    )
    values (
      ${input.orgId},
      ${input.workspaceId},
      ${issue.ref.repository},
      ${issue.ref.number},
      ${issue.title},
      ${issue.state},
      ${sql.param(issue.labels)}::text[],
      ${issue.assignee},
      ${issue.updatedAt},
      ${syncedAt.toISOString()},
      ${issue.ref.url}
    )
    on conflict (workspace_id, repository, number)
    do update set
      title = excluded.title,
      state = excluded.state,
      labels = excluded.labels,
      assignee = excluded.assignee,
      updated_at = excluded.updated_at,
      synced_at = excluded.synced_at,
      url = excluded.url
    returning
      id,
      organization_id,
      workspace_id,
      repository,
      number,
      title,
      state,
      labels,
      assignee,
      updated_at,
      synced_at,
      url,
      null::text as linked_task_id,
      null::text as linked_task_status
  `);

  const row = rowsFromExecuteResult(result)[0];
  if (row === undefined) {
    throw issueError("projectManagement.issueProjectionFailed", "Issue projection was not saved.");
  }

  return rowToIssueProjection(row);
}

export async function listIssueProjections(
  input: ListIssueProjectionsInput,
  dependencies: IssueApplicationDependencies = {},
): Promise<Result<readonly IssueProjectionDto[]>> {
  const known = assertKnownContext(input);
  if (!known.ok) {
    return err(known.error);
  }

  const repository = normalizeRepository(input.repository);
  if (!repository.ok) {
    return err(repository.error);
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeIssue(input, "read", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const result = await tx.execute(sql`
        select
          i.id,
          i.organization_id,
          i.workspace_id,
          i.repository,
          i.number,
          i.title,
          i.state,
          i.labels,
          i.assignee,
          i.updated_at,
          i.synced_at,
          i.url,
          t.id::text as linked_task_id,
          t.status::text as linked_task_status
        from public.issue_projection i
        left join public.tasks t
          on t.organization_id = i.organization_id
         and t.workspace_id = i.workspace_id
         and t.provenance_external_ref in (
           'github:' || i.repository || '#' || i.number::text,
           i.url
         )
        where i.workspace_id = ${input.workspaceId}
          and i.repository = ${repository.value}
        order by i.updated_at desc, i.number desc
      `);

      const issues = rowsFromExecuteResult(result).map(rowToIssueProjection);
      return ok(issues.filter((issue) => issueMatchesFilter(issue, input.filter ?? "all")));
    });
  } catch (error) {
    return err(
      issueError(
        "projectManagement.issueProjectionListFailed",
        "Issue projection could not be loaded.",
        mapDatabaseError(error),
      ),
    );
  }
}

export async function syncIssueProjection(
  input: SyncIssueProjectionInput,
  dependencies: IssueApplicationDependencies = {},
): Promise<Result<readonly IssueProjectionDto[]>> {
  const known = assertKnownContext(input);
  if (!known.ok) {
    return err(known.error);
  }

  const repository = normalizeRepository(input.repository);
  if (!repository.ok) {
    return err(repository.error);
  }

  const tracker = trackerRequired(dependencies);
  if (!tracker.ok) {
    return err(tracker.error);
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeIssue(input, "update", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  const listed = await tracker.value.listIssues({ repository: repository.value, state: "all" });
  if (!listed.ok) {
    return err(listed.error);
  }

  try {
    const syncedAt = dependencies.now?.() ?? new Date();
    return await withTenant(input.orgId, async (tx) => {
      const saved: IssueProjectionDto[] = [];
      for (const issue of listed.value) {
        saved.push(await upsertIssueProjection(tx, input, issue, syncedAt));
      }

      return ok(saved);
    });
  } catch (error) {
    return err(
      issueError(
        "projectManagement.issueProjectionSyncFailed",
        "Issue projection could not be synchronized.",
        mapDatabaseError(error),
      ),
    );
  }
}

export async function createTrackedIssue(
  input: CreateTrackedIssueInput,
  dependencies: IssueApplicationDependencies = {},
): Promise<Result<IssueProjectionDto>> {
  const known = assertKnownContext(input);
  if (!known.ok) {
    return err(known.error);
  }

  const repository = normalizeRepository(input.repository);
  if (!repository.ok) {
    return err(repository.error);
  }

  const title = normalizeTitle(input.title);
  if (!title.ok) {
    return err(title.error);
  }

  const tracker = trackerRequired(dependencies);
  if (!tracker.ok) {
    return err(tracker.error);
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeIssue(input, "create", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  const created = await tracker.value.createIssue({
    repository: repository.value,
    title: title.value,
    ...(input.body === undefined ? {} : { body: input.body }),
    ...(input.labels === undefined ? {} : { labels: input.labels }),
  });
  if (!created.ok) {
    return err(created.error);
  }

  try {
    const syncedAt = dependencies.now?.() ?? new Date();
    return await withTenant(input.orgId, async (tx) =>
      ok(await upsertIssueProjection(tx, input, created.value, syncedAt)),
    );
  } catch (error) {
    return err(
      issueError(
        "projectManagement.issueCreateProjectionFailed",
        "Created issue could not be projected.",
        mapDatabaseError(error),
      ),
    );
  }
}

export async function enqueueIssueCloseForTask(
  input: EnqueueIssueCloseInput,
  dependencies: IssueApplicationDependencies = {},
): Promise<Result<IssueCloseOutboxDto | null>> {
  const issueRef = issueRefFromTask(input.task);
  if (issueRef === null) {
    return ok(null);
  }

  const repository = normalizeRepository(issueRef.repository);
  if (!repository.ok) {
    return err(repository.error);
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeIssue(input, "update", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  const dedupeKey = `${input.orgId}:${input.workspaceId}:${input.task.id}:${repository.value}#${issueRef.number}:close`;

  try {
    return await withTenant(input.orgId, async (tx) => {
      const result = await tx.execute(sql`
        insert into public.issue_close_outbox (
          organization_id,
          workspace_id,
          task_id,
          repository,
          issue_number,
          issue_url,
          dedupe_key,
          state,
          close_reason
        )
        values (
          ${input.orgId},
          ${input.workspaceId},
          ${input.task.id},
          ${repository.value},
          ${issueRef.number},
          ${issueRef.url},
          ${dedupeKey},
          'pending',
          'completed'
        )
        on conflict (dedupe_key)
        do update set updated_at = now()
        returning
          id,
          organization_id,
          workspace_id,
          task_id,
          repository,
          issue_number,
          issue_url,
          dedupe_key,
          state,
          close_reason,
          attempts,
          next_attempt_at,
          last_error,
          created_at,
          updated_at,
          closed_at
      `);

      const row = rowsFromExecuteResult(result)[0];
      return row === undefined ? ok(null) : ok(rowToIssueCloseOutbox(row));
    });
  } catch (error) {
    return err(
      issueError(
        "projectManagement.issueCloseEnqueueFailed",
        "Issue close outbox entry could not be recorded.",
        mapDatabaseError(error),
      ),
    );
  }
}

export async function processIssueCloseOutbox(
  input: ProcessIssueCloseOutboxInput,
  dependencies: IssueApplicationDependencies = {},
): Promise<Result<readonly IssueCloseOutboxDto[]>> {
  const known = assertKnownContext(input);
  if (!known.ok) {
    return err(known.error);
  }

  const repository = normalizeRepository(input.repository);
  if (!repository.ok) {
    return err(repository.error);
  }

  const tracker = trackerRequired(dependencies);
  if (!tracker.ok) {
    return err(tracker.error);
  }

  const authorizationPort = dependencies.authorizationPort ?? defaultTaskAuthorizationPort;
  const authorized = await authorizeIssue(input, "update", authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  const limit = input.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return err(issueError("projectManagement.invalidOutboxLimit", "Outbox limit must be 1-50."));
  }

  try {
    const claimed = await withTenant(input.orgId, async (tx) => {
      const result = await tx.execute(sql`
        update public.issue_close_outbox o
        set state = 'processing', updated_at = now()
        where o.id in (
          select id
          from public.issue_close_outbox
          where workspace_id = ${input.workspaceId}
            and repository = ${repository.value}
            and state in ('pending', 'failed')
            and next_attempt_at <= now()
          order by next_attempt_at asc, created_at asc
          limit ${limit}
        )
        returning
          id,
          organization_id,
          workspace_id,
          task_id,
          repository,
          issue_number,
          issue_url,
          dedupe_key,
          state,
          close_reason,
          attempts,
          next_attempt_at,
          last_error,
          created_at,
          updated_at,
          closed_at
      `);

      return rowsFromExecuteResult(result).map(rowToIssueCloseOutbox);
    });

    const processed: IssueCloseOutboxDto[] = [];
    for (const entry of claimed) {
      const closed = await tracker.value.closeIssue({
        ref: {
          provider: "github",
          repository: entry.repository,
          number: entry.issueNumber,
          url: entry.issueUrl,
        },
        reason: entry.closeReason,
      });
      const closeState = closed.ok ? "closed" : "failed";
      const nextAttemptAt = closed.ok
        ? sql`now()`
        : sql`now() + interval '5 minutes' * greatest(attempts + 1, 1)`;
      const lastError = closed.ok ? null : closed.error.message;
      const closedAt = closed.ok ? sql`now()` : sql`closed_at`;

      const saved = await withTenant(input.orgId, async (tx) => {
        const result = await tx.execute(sql`
          update public.issue_close_outbox
          set
            state = ${closeState},
            attempts = attempts + 1,
            next_attempt_at = ${nextAttemptAt},
            last_error = ${lastError},
            updated_at = now(),
            closed_at = ${closedAt}
          where id = ${entry.id}
            and workspace_id = ${input.workspaceId}
          returning
            id,
            organization_id,
            workspace_id,
            task_id,
            repository,
            issue_number,
            issue_url,
            dedupe_key,
            state,
            close_reason,
            attempts,
            next_attempt_at,
            last_error,
            created_at,
            updated_at,
            closed_at
        `);
        const row = rowsFromExecuteResult(result)[0];
        return row === undefined ? null : rowToIssueCloseOutbox(row);
      });

      if (saved !== null) {
        processed.push(saved);
      }
    }

    return ok(processed);
  } catch (error) {
    return err(
      issueError(
        "projectManagement.issueCloseProcessFailed",
        "Issue close outbox could not be processed.",
        mapDatabaseError(error),
      ),
    );
  }
}
