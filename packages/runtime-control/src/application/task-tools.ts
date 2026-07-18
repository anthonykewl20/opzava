import type { AuthorizationPort } from "@opzava/ports";
import {
  createTask,
  getTask,
  listTasks,
  moveTask,
  taskPriorities,
  taskStatuses,
  updateTask,
  type TaskDto,
  type TaskPriority,
  type TaskStatus
} from "@opzava/project-management";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import {
  type RuntimeControlDependencies,
  type StartedToolOutcomeReceipt,
  type ToolExecutionContext
} from "./assistant-conversations.js";
import {
  errorStatus,
  failureFromMalformedArgs,
  malformedRequestSummary,
  runToolExecution,
  type ToolFailure
} from "./tool-execution-harness.js";
import type { AssistantToolOutcome } from "../domain/assistant.js";

export const runtimeControlTaskToolNames = [
  "opzava_tasks_list",
  "opzava_tasks_create",
  "opzava_tasks_update"
] as const;

export type RuntimeControlTaskToolName = (typeof runtimeControlTaskToolNames)[number];

export interface RuntimeControlTaskToolDefinition {
  readonly name: RuntimeControlTaskToolName;
  readonly inputShape: string;
}

export const runtimeControlTaskToolRegistry: readonly RuntimeControlTaskToolDefinition[] = [
  {
    name: "opzava_tasks_list",
    inputShape: "{ status?: todo|in_progress|blocked|done, limit?: 1..50 }"
  },
  {
    name: "opzava_tasks_create",
    inputShape:
      "{ title, description?, status?: todo|in_progress|blocked, priority?: low|normal|high|urgent, labels?: string[] }"
  },
  {
    name: "opzava_tasks_update",
    inputShape:
      "{ taskId, title?, description?, status?: todo|in_progress|blocked, priority?: low|normal|high|urgent, labels?: string[] }"
  }
];

export type RuntimeControlTaskToolOutput =
  | {
      readonly kind: "tasks.list";
      readonly tasks: readonly TaskDto[];
    }
  | {
      readonly kind: "tasks.create";
      readonly task: TaskDto;
    }
  | {
      readonly kind: "tasks.update";
      readonly task: TaskDto;
    };

export type RuntimeControlTaskToolExecution =
  | {
      readonly status: "succeeded";
      readonly toolName: RuntimeControlTaskToolName;
      readonly toolCallId: string;
      readonly output: RuntimeControlTaskToolOutput;
      readonly outcome: AssistantToolOutcome;
    }
  | {
      readonly status: "failed";
      readonly toolName: RuntimeControlTaskToolName;
      readonly toolCallId: string;
      readonly code: string;
      readonly message: string;
      readonly outcome: AssistantToolOutcome;
    };

export interface ExecuteRuntimeControlTaskToolInput {
  readonly context: ToolExecutionContext;
  readonly toolName: string;
  readonly toolCallId: string;
  readonly args: unknown;
}

export interface RuntimeControlTaskServices {
  readonly createTask: typeof createTask;
  readonly getTask: typeof getTask;
  readonly listTasks: typeof listTasks;
  readonly moveTask: typeof moveTask;
  readonly updateTask: typeof updateTask;
}

export interface RuntimeControlTaskToolDependencies extends RuntimeControlDependencies {
  readonly taskAuthorizationPort?: AuthorizationPort;
  readonly taskServices?: RuntimeControlTaskServices;
}

type ParsedToolArgs =
  | {
      readonly toolName: "opzava_tasks_list";
      readonly args: {
        readonly status?: TaskStatus;
        readonly limit: number;
      };
      readonly requestSummary: Readonly<Record<string, unknown>>;
    }
  | {
      readonly toolName: "opzava_tasks_create";
      readonly args: {
        readonly title: string;
        readonly description?: string;
        readonly status?: TaskStatus;
        readonly priority?: TaskPriority;
        readonly labels?: readonly string[];
      };
      readonly requestSummary: Readonly<Record<string, unknown>>;
    }
  | {
      readonly toolName: "opzava_tasks_update";
      readonly args: {
        readonly taskId: string;
        readonly title?: string;
        readonly description?: string;
        readonly status?: TaskStatus;
        readonly priority?: TaskPriority;
        readonly labels?: readonly string[];
      };
      readonly requestSummary: Readonly<Record<string, unknown>>;
    };

const taskStatusSet = new Set<string>(taskStatuses);
const writableTaskStatusSet = new Set<string>(["todo", "in_progress", "blocked"]);
const taskPrioritySet = new Set<string>(taskPriorities);
const taskServices: RuntimeControlTaskServices = {
  createTask,
  getTask,
  listTasks,
  moveTask,
  updateTask
};

function toolError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause })
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[]
): Result<void> {
  const allowed = new Set(allowedKeys);
  const unknownKey = Object.keys(value).find((key) => !allowed.has(key));
  return unknownKey === undefined
    ? ok(undefined)
    : err(
        toolError(
          "runtimeControl.toolMalformedArgs",
          `Tool argument "${unknownKey}" is not allowed.`
        )
      );
}

function requiredString(
  value: unknown,
  field: string,
  maxLength: number
): Result<string> {
  if (typeof value !== "string") {
    return err(
      toolError("runtimeControl.toolMalformedArgs", `Tool argument "${field}" must be a string.`)
    );
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length === 0 || normalized.length > maxLength) {
    return err(
      toolError(
        "runtimeControl.toolMalformedArgs",
        `Tool argument "${field}" must be 1-${maxLength} characters.`
      )
    );
  }

  return ok(normalized);
}

function optionalString(
  value: unknown,
  field: string,
  maxLength: number
): Result<string | undefined> {
  if (value === undefined) {
    return ok(undefined);
  }

  if (typeof value !== "string") {
    return err(
      toolError("runtimeControl.toolMalformedArgs", `Tool argument "${field}" must be a string.`)
    );
  }

  const normalized = value.trim();
  if (normalized.length > maxLength) {
    return err(
      toolError(
        "runtimeControl.toolMalformedArgs",
        `Tool argument "${field}" must be ${maxLength} characters or fewer.`
      )
    );
  }

  return ok(normalized);
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requiredTaskId(value: unknown): Result<string> {
  const parsed = requiredString(value, "taskId", 180);
  if (!parsed.ok) {
    return parsed;
  }

  // A model-supplied id that is not a UUID is a malformed argument, not a
  // database probe; only well-formed ids may reach SQL and map to not_found.
  if (!uuidPattern.test(parsed.value)) {
    return err(
      toolError("runtimeControl.toolMalformedArgs", 'Tool argument "taskId" must be a task id.')
    );
  }

  return parsed;
}

function optionalTitle(value: unknown): Result<string | undefined> {
  if (value === undefined) {
    return ok(undefined);
  }

  return requiredString(value, "title", 180);
}

function optionalStatus(value: unknown): Result<TaskStatus | undefined> {
  if (value === undefined) {
    return ok(undefined);
  }

  if (typeof value === "string" && taskStatusSet.has(value)) {
    return ok(value as TaskStatus);
  }

  return err(
    toolError(
      "runtimeControl.toolMalformedArgs",
      "Tool argument \"status\" must be todo, in_progress, blocked, or done."
    )
  );
}

function optionalWritableStatus(value: unknown): Result<TaskStatus | undefined> {
  if (value === undefined) {
    return ok(undefined);
  }

  if (value === "done") {
    return err(
      toolError(
        "projectManagement.taskDoneRequiresHumanAttestation",
        "Marking a task Done requires the confirmed human Done action."
      )
    );
  }

  if (typeof value === "string" && writableTaskStatusSet.has(value)) {
    return ok(value as TaskStatus);
  }

  return err(
    toolError(
      "runtimeControl.toolMalformedArgs",
      'Tool argument "status" must be todo, in_progress, or blocked.'
    )
  );
}

function optionalPriority(value: unknown): Result<TaskPriority | undefined> {
  if (value === undefined) {
    return ok(undefined);
  }

  if (typeof value === "string" && taskPrioritySet.has(value)) {
    return ok(value as TaskPriority);
  }

  return err(
    toolError(
      "runtimeControl.toolMalformedArgs",
      "Tool argument \"priority\" must be low, normal, high, or urgent."
    )
  );
}

function optionalLabels(value: unknown): Result<readonly string[] | undefined> {
  if (value === undefined) {
    return ok(undefined);
  }

  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    return err(
      toolError(
        "runtimeControl.toolMalformedArgs",
        "Tool argument \"labels\" must be an array of strings."
      )
    );
  }

  return ok(value);
}

function optionalLimit(value: unknown): Result<number> {
  if (value === undefined) {
    return ok(20);
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 50) {
    return err(
      toolError(
        "runtimeControl.toolMalformedArgs",
        "Tool argument \"limit\" must be an integer from 1 to 50."
      )
    );
  }

  return ok(value);
}

function parseToolName(value: string): Result<RuntimeControlTaskToolName> {
  return runtimeControlTaskToolNames.includes(value as RuntimeControlTaskToolName)
    ? ok(value as RuntimeControlTaskToolName)
    : err(toolError("runtimeControl.unknownTool", "Requested task tool is not registered."));
}

function parseListArgs(value: unknown): Result<ParsedToolArgs> {
  if (!isRecord(value)) {
    return err(
      toolError("runtimeControl.toolMalformedArgs", "Task list tool arguments must be an object.")
    );
  }

  const unknownKeys = rejectUnknownKeys(value, ["status", "limit"]);
  if (!unknownKeys.ok) {
    return err(unknownKeys.error);
  }

  const status = optionalStatus(value["status"]);
  if (!status.ok) {
    return err(status.error);
  }

  const limit = optionalLimit(value["limit"]);
  if (!limit.ok) {
    return err(limit.error);
  }

  const args =
    status.value === undefined
      ? { limit: limit.value }
      : { status: status.value, limit: limit.value };

  return ok({
    toolName: "opzava_tasks_list",
    args,
    requestSummary: { toolName: "opzava_tasks_list", args }
  });
}

function parseCreateArgs(value: unknown): Result<ParsedToolArgs> {
  if (!isRecord(value)) {
    return err(
      toolError("runtimeControl.toolMalformedArgs", "Task create tool arguments must be an object.")
    );
  }

  const unknownKeys = rejectUnknownKeys(value, [
    "title",
    "description",
    "status",
    "priority",
    "labels"
  ]);
  if (!unknownKeys.ok) {
    return err(unknownKeys.error);
  }

  const title = requiredString(value["title"], "title", 180);
  const description = optionalString(value["description"], "description", 4000);
  const status = optionalWritableStatus(value["status"]);
  const priority = optionalPriority(value["priority"]);
  const labels = optionalLabels(value["labels"]);
  if (!title.ok) {
    return err(title.error);
  }
  if (!description.ok) {
    return err(description.error);
  }
  if (!status.ok) {
    return err(status.error);
  }
  if (!priority.ok) {
    return err(priority.error);
  }
  if (!labels.ok) {
    return err(labels.error);
  }

  const args = {
    title: title.value,
    ...(description.value === undefined ? {} : { description: description.value }),
    ...(status.value === undefined ? {} : { status: status.value }),
    ...(priority.value === undefined ? {} : { priority: priority.value }),
    ...(labels.value === undefined ? {} : { labels: labels.value })
  };

  return ok({
    toolName: "opzava_tasks_create",
    args,
    requestSummary: { toolName: "opzava_tasks_create", args }
  });
}

function parseUpdateArgs(value: unknown): Result<ParsedToolArgs> {
  if (!isRecord(value)) {
    return err(
      toolError("runtimeControl.toolMalformedArgs", "Task update tool arguments must be an object.")
    );
  }

  const unknownKeys = rejectUnknownKeys(value, [
    "taskId",
    "title",
    "description",
    "status",
    "priority",
    "labels"
  ]);
  if (!unknownKeys.ok) {
    return err(unknownKeys.error);
  }

  const taskId = requiredTaskId(value["taskId"]);
  const title = optionalTitle(value["title"]);
  const description = optionalString(value["description"], "description", 4000);
  const status = optionalWritableStatus(value["status"]);
  const priority = optionalPriority(value["priority"]);
  const labels = optionalLabels(value["labels"]);
  if (!taskId.ok) {
    return err(taskId.error);
  }
  if (!title.ok) {
    return err(title.error);
  }
  if (!description.ok) {
    return err(description.error);
  }
  if (!status.ok) {
    return err(status.error);
  }
  if (!priority.ok) {
    return err(priority.error);
  }
  if (!labels.ok) {
    return err(labels.error);
  }

  const hasMutation =
    title.value !== undefined ||
    description.value !== undefined ||
    status.value !== undefined ||
    priority.value !== undefined ||
    labels.value !== undefined;
  if (!hasMutation) {
    return err(
      toolError(
        "runtimeControl.toolMalformedArgs",
        "Task update tool requires at least one field to change."
      )
    );
  }

  const args = {
    taskId: taskId.value,
    ...(title.value === undefined ? {} : { title: title.value }),
    ...(description.value === undefined ? {} : { description: description.value }),
    ...(status.value === undefined ? {} : { status: status.value }),
    ...(priority.value === undefined ? {} : { priority: priority.value }),
    ...(labels.value === undefined ? {} : { labels: labels.value })
  };

  return ok({
    toolName: "opzava_tasks_update",
    args,
    requestSummary: { toolName: "opzava_tasks_update", args }
  });
}

function parseArgs(
  toolName: RuntimeControlTaskToolName,
  value: unknown
): Result<ParsedToolArgs> {
  if (toolName === "opzava_tasks_list") {
    return parseListArgs(value);
  }

  if (toolName === "opzava_tasks_create") {
    return parseCreateArgs(value);
  }

  return parseUpdateArgs(value);
}

function failureFromError(error: DomainError): ToolFailure {
  if (error.code === "projectManagement.taskNotFound") {
    return {
      code: "not_found",
      message: "Task was not found."
    };
  }

  if (
    error.code === "projectManagement.forbidden" ||
    error.code === "projectManagement.taskDoneRequiresHumanAttestation" ||
    error.code === "projectManagement.taskDoneRequiresApprovedReview" ||
    errorStatus(error) === 403
  ) {
    return {
      code: "forbidden",
      message: "Task tool execution is not allowed."
    };
  }

  if (error.code.startsWith("projectManagement.invalid")) {
    return {
      code: "malformed_args",
      message: error.message
    };
  }

  return {
    code: "failed",
    message: error.message
  };
}

function failureFromTaskMalformedArgs(error: DomainError): ToolFailure {
  return error.code === "projectManagement.taskDoneRequiresHumanAttestation"
    ? { code: "forbidden", message: error.message }
    : failureFromMalformedArgs(error);
}

function taskContext(context: ToolExecutionContext) {
  return {
    orgId: context.orgId,
    workspaceId: context.workspaceId,
    actor: context.actor
  };
}

function taskDependencies(dependencies: RuntimeControlTaskToolDependencies) {
  const authorizationPort = dependencies.taskAuthorizationPort ?? dependencies.authorizationPort;
  return authorizationPort === undefined ? {} : { authorizationPort };
}

function resultSummary(output: RuntimeControlTaskToolOutput): Readonly<Record<string, unknown>> {
  return { ok: true, ...output };
}

function targetRef(output: RuntimeControlTaskToolOutput): string | null {
  return output.kind === "tasks.list" ? null : output.task.id;
}

function outputFromOutcome(
  outcome: AssistantToolOutcome
): RuntimeControlTaskToolOutput | null {
  const kind = outcome.resultSummary["kind"];
  if (kind === "tasks.list" && Array.isArray(outcome.resultSummary["tasks"])) {
    return {
      kind,
      tasks: outcome.resultSummary["tasks"] as readonly TaskDto[]
    };
  }

  if (
    (kind === "tasks.create" || kind === "tasks.update") &&
    isRecord(outcome.resultSummary["task"])
  ) {
    return {
      kind,
      task: outcome.resultSummary["task"] as unknown as TaskDto
    };
  }

  return null;
}

function failureFromOutcome(outcome: AssistantToolOutcome): ToolFailure {
  const code = outcome.resultSummary["code"];
  const message = outcome.resultSummary["message"];
  return {
    code: typeof code === "string" ? code : "failed",
    message: typeof message === "string" ? message : "Task tool execution failed."
  };
}

function completedExecutionFromOutcome(
  toolName: RuntimeControlTaskToolName,
  toolCallId: string,
  receipt: StartedToolOutcomeReceipt
): Result<RuntimeControlTaskToolExecution> {
  if (receipt.outcome.status === "started") {
    return err(
      toolError(
        "runtimeControl.toolOutcomeInProgress",
        "Tool call is already in progress for this assistant turn."
      )
    );
  }

  if (receipt.outcome.status === "failed") {
    const failure = failureFromOutcome(receipt.outcome);
    return ok({
      status: "failed",
      toolName,
      toolCallId,
      code: failure.code,
      message: failure.message,
      outcome: receipt.outcome
    });
  }

  const output = outputFromOutcome(receipt.outcome);
  if (output === null) {
    return err(
      toolError(
        "runtimeControl.toolOutcomeInvalidReplay",
        "Recorded task tool outcome cannot be replayed."
      )
    );
  }

  return ok({
    status: "succeeded",
    toolName,
    toolCallId,
    output,
    outcome: receipt.outcome
  });
}

async function performTool(
  parsed: ParsedToolArgs,
  context: ToolExecutionContext,
  dependencies: RuntimeControlTaskToolDependencies
): Promise<Result<RuntimeControlTaskToolOutput>> {
  const services = dependencies.taskServices ?? taskServices;
  const appContext = taskContext(context);
  const deps = taskDependencies(dependencies);

  if (parsed.toolName === "opzava_tasks_list") {
    const result = await services.listTasks(appContext, deps);
    if (!result.ok) {
      return err(result.error);
    }

    const filtered =
      parsed.args.status === undefined
        ? result.value
        : result.value.filter((task) => task.status === parsed.args.status);
    return ok({
      kind: "tasks.list",
      tasks: filtered.slice(0, parsed.args.limit)
    });
  }

  if (parsed.toolName === "opzava_tasks_create") {
    const result = await services.createTask(
      {
        ...appContext,
        ...parsed.args
      },
      deps
    );
    if (!result.ok) {
      return err(result.error);
    }

    return ok({
      kind: "tasks.create",
      task: result.value
    });
  }

  const current = await services.getTask(
    {
      ...appContext,
      taskId: parsed.args.taskId
    },
    deps
  );
  if (!current.ok) {
    return err(current.error);
  }

  const shouldUpdateFields =
    parsed.args.title !== undefined ||
    parsed.args.description !== undefined ||
    parsed.args.priority !== undefined ||
    parsed.args.labels !== undefined;
  const fieldUpdate = shouldUpdateFields
    ? await services.updateTask(
        {
          ...appContext,
          taskId: parsed.args.taskId,
          title: parsed.args.title ?? current.value.title,
          description: parsed.args.description ?? current.value.description,
          priority: parsed.args.priority ?? current.value.priority,
          assigneeUserId: current.value.assigneeUserId,
          labels: parsed.args.labels ?? current.value.labels
        },
        deps
      )
    : ok(current.value);
  if (!fieldUpdate.ok) {
    return err(fieldUpdate.error);
  }

  const statusUpdate =
    parsed.args.status === undefined || parsed.args.status === fieldUpdate.value.status
      ? ok(fieldUpdate.value)
      : await services.moveTask(
          {
            ...appContext,
            taskId: parsed.args.taskId,
            status: parsed.args.status,
            position: fieldUpdate.value.position
          },
          deps
        );
  if (!statusUpdate.ok) {
    return err(statusUpdate.error);
  }

  return ok({
    kind: "tasks.update",
    task: statusUpdate.value
  });
}

export async function executeRuntimeControlTaskTool(
  input: ExecuteRuntimeControlTaskToolInput,
  dependencies: RuntimeControlTaskToolDependencies = {}
): Promise<Result<RuntimeControlTaskToolExecution>> {
  return runToolExecution({
    input,
    dependencies,
    parseToolName,
    parseArgs,
    malformedRequestSummary,
    contextForOutcome: taskContext,
    completedExecutionFromOutcome,
    performTool,
    failureFromMalformedArgs: failureFromTaskMalformedArgs,
    failureFromError,
    resultSummary,
    targetRef
  });
}
