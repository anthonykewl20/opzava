import { sql, withTenant } from "@opzava/adapters";
import type { AppSessionContext } from "@/lib/session";

export type TaskCardAssistantTurnStatus =
  "queued" | "streaming" | "finalizing" | "final" | "failed";

export type TaskCardToolOutcomeStatus = "started" | "succeeded" | "failed";

export interface TaskCardToolOutcomeView {
  readonly id: string;
  readonly toolName: string;
  readonly toolCallId: string;
  readonly status: TaskCardToolOutcomeStatus;
  readonly requestSummary: Readonly<Record<string, unknown>>;
  readonly resultSummary: Readonly<Record<string, unknown>>;
  readonly targetRef: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
}

export interface TaskCardAssistantRunView {
  readonly turnId: string;
  readonly status: TaskCardAssistantTurnStatus;
  readonly text: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly finalizedAt: string | null;
  readonly outcomes: readonly TaskCardToolOutcomeView[];
}

export interface TaskCardAiRunStep {
  readonly id: string;
  readonly state: "queued" | "working" | "succeeded" | "failed";
  readonly text: string;
  readonly timestamp: string;
}

export interface TaskCardAiRunProjection {
  readonly steps: readonly TaskCardAiRunStep[];
  readonly live: boolean;
  readonly elapsedLabel: string | null;
}

type QueryRow = Record<string, unknown>;

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

function jsonRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function dateIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date(0).toISOString();
}

function nullableDateIso(value: unknown): string | null {
  return value === null || value === undefined ? null : dateIso(value);
}

function statusValue(value: unknown): TaskCardAssistantTurnStatus {
  if (
    value === "queued" ||
    value === "streaming" ||
    value === "finalizing" ||
    value === "final" ||
    value === "failed"
  ) {
    return value;
  }

  return "failed";
}

function outcomeStatusValue(value: unknown): TaskCardToolOutcomeStatus {
  if (value === "started" || value === "succeeded" || value === "failed") {
    return value;
  }

  return "failed";
}

function contentText(value: unknown): string {
  const content = jsonRecord(value);
  const text = content["text"];
  return typeof text === "string" ? text : "";
}

function rowToOutcome(row: QueryRow): TaskCardToolOutcomeView | null {
  if (row["outcome_id"] === null || row["outcome_id"] === undefined) {
    return null;
  }

  return {
    id: String(row["outcome_id"]),
    toolName: String(row["tool_name"] ?? ""),
    toolCallId: String(row["tool_call_id"] ?? ""),
    status: outcomeStatusValue(row["outcome_status"]),
    requestSummary: jsonRecord(row["request_summary"]),
    resultSummary: jsonRecord(row["result_summary"]),
    targetRef:
      typeof row["target_ref"] === "string" && row["target_ref"].trim() !== ""
        ? row["target_ref"]
        : null,
    createdAt: dateIso(row["outcome_created_at"]),
    updatedAt: dateIso(row["outcome_updated_at"]),
    completedAt: nullableDateIso(row["completed_at"]),
  };
}

export async function listTaskCardAssistantRuns(
  context: AppSessionContext,
  taskId: string,
): Promise<readonly TaskCardAssistantRunView[]> {
  const result = await withTenant(context.orgId, async (tx) =>
    tx.execute(sql`
      select
        t.id as turn_id,
        t.status as turn_status,
        t.content,
        t.created_at as turn_created_at,
        t.updated_at as turn_updated_at,
        t.finalized_at,
        o.id as outcome_id,
        o.tool_name,
        o.tool_call_id,
        o.status as outcome_status,
        o.request_summary,
        o.result_summary,
        o.target_ref,
        o.created_at as outcome_created_at,
        o.updated_at as outcome_updated_at,
        o.completed_at
      from public.assistant_turns t
      left join public.assistant_tool_outcomes o
        on o.turn_id = t.id
       and o.organization_id = t.organization_id
       and o.workspace_id = t.workspace_id
      where t.organization_id = ${context.orgId}
        and t.workspace_id = ${context.workspaceId}
        and t.role = 'assistant'
        and (
          t.content::text like ${`%${taskId}%`}
          or exists (
            select 1
            from public.assistant_tool_outcomes linked
            where linked.turn_id = t.id
              and linked.organization_id = t.organization_id
              and linked.workspace_id = t.workspace_id
              and linked.target_ref = ${taskId}
          )
        )
      order by t.created_at asc, t.id asc, o.created_at asc, o.id asc
    `),
  );

  const runs = new Map<string, TaskCardAssistantRunView>();
  for (const row of rowsFromExecuteResult(result)) {
    const turnId = String(row["turn_id"]);
    const existing = runs.get(turnId);
    const outcome = rowToOutcome(row);
    const base =
      existing ??
      ({
        turnId,
        status: statusValue(row["turn_status"]),
        text: contentText(row["content"]),
        createdAt: dateIso(row["turn_created_at"]),
        updatedAt: dateIso(row["turn_updated_at"]),
        finalizedAt: nullableDateIso(row["finalized_at"]),
        outcomes: [],
      } satisfies TaskCardAssistantRunView);

    runs.set(turnId, {
      ...base,
      outcomes: outcome === null ? base.outcomes : [...base.outcomes, outcome],
    });
  }

  return [...runs.values()];
}

function elapsedLabel(startedAt: string, now: Date): string {
  const started = new Date(startedAt);
  if (Number.isNaN(started.getTime())) {
    return "live";
  }

  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - started.getTime()) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function outcomeText(outcome: TaskCardToolOutcomeView): string {
  if (outcome.status === "started") {
    return `Started ${outcome.toolName}.`;
  }

  if (outcome.status === "failed") {
    const message = outcome.resultSummary["message"];
    return `Tool ${outcome.toolName} failed${typeof message === "string" ? `: ${message}` : "."}`;
  }

  const kind = outcome.resultSummary["kind"];
  if (kind === "tasks.create") {
    return "Created a task card.";
  }

  if (kind === "tasks.update") {
    return "Updated this task card.";
  }

  if (kind === "tasks.list") {
    return "Listed the workspace tasks.";
  }

  return `Completed ${outcome.toolName}.`;
}

export function projectTaskCardAiRun(
  runs: readonly TaskCardAssistantRunView[],
  now: Date = new Date(),
): TaskCardAiRunProjection {
  const steps: TaskCardAiRunStep[] = [];
  let liveStartedAt: string | null = null;

  for (const run of runs) {
    const live =
      run.status === "queued" || run.status === "streaming" || run.status === "finalizing";
    if (live && liveStartedAt === null) {
      liveStartedAt = run.createdAt;
    }

    steps.push({
      id: `${run.turnId}:turn`,
      state: run.status === "failed" ? "failed" : live ? "working" : "succeeded",
      text:
        run.status === "queued"
          ? "Assistant queued a reply for this card."
          : run.status === "streaming"
            ? "Assistant is replying on this card."
            : run.status === "finalizing"
              ? "Assistant is finalizing the reply."
              : run.status === "failed"
                ? "Assistant run failed."
                : "Assistant finished the reply.",
      timestamp: run.updatedAt,
    });

    for (const outcome of run.outcomes) {
      steps.push({
        id: `${run.turnId}:${outcome.id}`,
        state:
          outcome.status === "started"
            ? "working"
            : outcome.status === "failed"
              ? "failed"
              : "succeeded",
        text: outcomeText(outcome),
        timestamp: outcome.completedAt ?? outcome.updatedAt,
      });
    }

    if (run.text.trim() !== "" && run.status === "final") {
      steps.push({
        id: `${run.turnId}:message`,
        state: "succeeded",
        text: "Saved the assistant reply for this card.",
        timestamp: run.finalizedAt ?? run.updatedAt,
      });
    }
  }

  return {
    steps,
    live: liveStartedAt !== null,
    elapsedLabel: liveStartedAt === null ? null : elapsedLabel(liveStartedAt, now),
  };
}
