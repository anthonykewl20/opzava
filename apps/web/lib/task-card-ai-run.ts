import { sql, withTenant } from "@opzava/adapters";
import type { AppSessionContext } from "@/lib/session";
import type {
  TaskCardAssistantRunView,
  TaskCardAssistantTurnStatus,
  TaskCardToolOutcomeStatus,
  TaskCardToolOutcomeView,
} from "@/lib/task-card-ai-run-view";

export { projectTaskCardAiRun } from "@/lib/task-card-ai-run-view";
export type {
  TaskCardAiRunProjection,
  TaskCardAiRunStep,
  TaskCardAssistantRunView,
  TaskCardAssistantTurnStatus,
  TaskCardToolOutcomeStatus,
  TaskCardToolOutcomeView,
} from "@/lib/task-card-ai-run-view";

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
