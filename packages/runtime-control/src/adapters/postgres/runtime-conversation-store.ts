import { sql } from "drizzle-orm";

import type {
  AppendRuntimeAssistantDelta,
  AppendRuntimeUserTurn,
  CreateRuntimeConversation,
  FailRuntimeAssistantTurn,
  FinalizeRuntimeAssistantTurn,
  FindOpenRuntimeConversation,
  FinishRuntimeToolOutcome,
  ListTaskAssistantRuns,
  QueueRuntimeAssistantTurn,
  RuntimeConversation,
  RuntimeConversationStore,
  RuntimeTaskAssistantRun,
  RuntimeToolOutcome,
  RuntimeToolOutcomeInsert,
  RuntimeToolOutcomeTransition,
  RuntimeTurn,
  RuntimeTurnInsert,
  RuntimeTurnTransition,
  StartRuntimeToolOutcome,
  WorkspaceScope
} from "../../ports/index.js";
import {
  mapTenantStoreError,
  rowsFromExecuteResult,
  withTenant,
  type QueryRow,
  type TenantTransaction,
  type createPostgresDatabase
} from "@opzava/adapters";
import {
  DomainError,
  TenantAccessDeniedError,
  err,
  makeOrgId,
  makeUserId,
  makeWorkspaceId,
  ok,
  type Result
} from "@opzava/shared-kernel";

type PostgresDatabase = ReturnType<typeof createPostgresDatabase>;

function storeError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({ code, message, ...(cause === undefined ? {} : { cause }) });
}

function parseDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  throw storeError("runtimeControl.invalidTimestamp", "Runtime-Control record contains an invalid timestamp.");
}

function jsonRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function rowToConversation(row: QueryRow): RuntimeConversation {
  const status = row["status"];
  if (status !== "open" && status !== "archived") throw storeError("runtimeControl.invalidConversationStatus", "Assistant conversation status is invalid.");
  return { id: String(row["id"]), organizationId: makeOrgId(String(row["organization_id"])), workspaceId: makeWorkspaceId(String(row["workspace_id"])), surface: String(row["surface"]), assistantKey: String(row["assistant_key"]), status, createdByUserId: makeUserId(String(row["created_by_user_id"])), createdAt: parseDate(row["created_at"]), updatedAt: parseDate(row["updated_at"]) };
}

function rowToTurn(row: QueryRow): RuntimeTurn {
  const role = row["role"];
  const status = row["status"];
  if (role !== "user" && role !== "assistant" && role !== "tool" && role !== "system") throw storeError("runtimeControl.invalidTurnRole", "Assistant turn role is invalid.");
  if (status !== "queued" && status !== "streaming" && status !== "finalizing" && status !== "final" && status !== "failed") throw storeError("runtimeControl.invalidTurnStatus", "Assistant turn status is invalid.");
  return { id: String(row["id"]), conversationId: String(row["conversation_id"]), organizationId: makeOrgId(String(row["organization_id"])), workspaceId: makeWorkspaceId(String(row["workspace_id"])), role, status, actorUserId: row["actor_user_id"] == null ? null : makeUserId(String(row["actor_user_id"])), assistantKey: stringOrNull(row["assistant_key"]), content: jsonRecord(row["content"]), idempotencyKey: String(row["idempotency_key"]), openclawSessionRef: stringOrNull(row["openclaw_session_ref"]), openclawRunRef: stringOrNull(row["openclaw_run_ref"]), createdAt: parseDate(row["created_at"]), updatedAt: parseDate(row["updated_at"]), finalizedAt: row["finalized_at"] == null ? null : parseDate(row["finalized_at"]) };
}

function rowToOutcome(row: QueryRow): RuntimeToolOutcome {
  const status = row["status"];
  if (status !== "started" && status !== "succeeded" && status !== "failed") throw storeError("runtimeControl.invalidToolOutcomeStatus", "Assistant tool outcome status is invalid.");
  return { id: String(row["id"]), organizationId: makeOrgId(String(row["organization_id"])), workspaceId: makeWorkspaceId(String(row["workspace_id"])), turnId: String(row["turn_id"]), toolName: String(row["tool_name"]), toolCallId: String(row["tool_call_id"]), idempotencyKey: String(row["idempotency_key"]), status, requestSummary: jsonRecord(row["request_summary"]), resultSummary: jsonRecord(row["result_summary"]), targetRef: stringOrNull(row["target_ref"]), createdAt: parseDate(row["created_at"]), updatedAt: parseDate(row["updated_at"]), completedAt: row["completed_at"] == null ? null : parseDate(row["completed_at"]) };
}

const conversationSelect = sql`id, organization_id, workspace_id, surface, assistant_key, status, created_by_user_id, created_at, updated_at`;
const turnSelect = sql`id, conversation_id, organization_id, workspace_id, role, status, actor_user_id, assistant_key, content, idempotency_key, openclaw_session_ref, openclaw_run_ref, created_at, updated_at, finalized_at`;
const outcomeSelect = sql`id, organization_id, workspace_id, turn_id, tool_name, tool_call_id, idempotency_key, status, request_summary, result_summary, target_ref, created_at, updated_at, completed_at`;

export class PostgresRuntimeConversationStore implements RuntimeConversationStore {
  public constructor(private readonly database: PostgresDatabase) {}

  private async tenant<T>(scope: WorkspaceScope, operation: (tx: TenantTransaction) => Promise<Result<T>>): Promise<Result<T>> {
    try { return await withTenant(scope.organizationId, operation, this.database); }
    catch (error) {
      const mapped = mapTenantStoreError(error);
      return err(mapped instanceof DomainError ? mapped : storeError("runtimeControl.storeOperationFailed", "Runtime conversation store operation failed.", mapped));
    }
  }

  private async conversation(tx: TenantTransaction, scope: WorkspaceScope, id: string): Promise<RuntimeConversation | null> {
    const result = await tx.execute(sql`select ${conversationSelect} from public.assistant_conversations where id = ${id} and organization_id = ${scope.organizationId} and workspace_id = ${scope.workspaceId} limit 1`);
    const row = rowsFromExecuteResult(result)[0];
    return row === undefined ? null : rowToConversation(row);
  }

  private async turn(tx: TenantTransaction, scope: WorkspaceScope, id: string, lock = false): Promise<RuntimeTurn | null> {
    const result = await tx.execute(sql`select ${turnSelect} from public.assistant_turns where id = ${id} and organization_id = ${scope.organizationId} and workspace_id = ${scope.workspaceId} ${lock ? sql`for update` : sql``}`);
    const row = rowsFromExecuteResult(result)[0];
    return row === undefined ? null : rowToTurn(row);
  }

  private scopedWrite(scope: WorkspaceScope, input: { organizationId: string; workspaceId: string }): Result<void> {
    return input.organizationId === scope.organizationId && input.workspaceId === scope.workspaceId
      ? ok(undefined)
      : err(new TenantAccessDeniedError());
  }

  public createConversation(scope: WorkspaceScope, input: CreateRuntimeConversation): Promise<Result<RuntimeConversation>> {
    return this.tenant<RuntimeConversation>(scope, async (tx) => {
      const scoped = this.scopedWrite(scope, input);
      if (!scoped.ok) return scoped;
      const result = await tx.execute(sql`insert into public.assistant_conversations (organization_id, workspace_id, surface, assistant_key, status, created_by_user_id) values (${input.organizationId}, ${input.workspaceId}, ${input.surface}, ${input.assistantKey}, 'open', ${input.createdByUserId}) returning ${conversationSelect}`);
      const row = rowsFromExecuteResult(result)[0];
      return row === undefined ? err(storeError("runtimeControl.conversationCreateFailed", "Assistant conversation could not be created.")) : ok(rowToConversation(row));
    });
  }

  public findOpenConversation(scope: WorkspaceScope, input: FindOpenRuntimeConversation): Promise<Result<RuntimeConversation | null>> {
    return this.tenant<RuntimeConversation | null>(scope, async (tx) => {
      const result = await tx.execute(sql`select ${conversationSelect} from public.assistant_conversations where organization_id = ${scope.organizationId} and workspace_id = ${scope.workspaceId} and surface = ${input.surface} and assistant_key = ${input.assistantKey} and created_by_user_id = ${input.createdByUserId} and status = 'open' order by created_at asc, id asc limit 1`);
      const row = rowsFromExecuteResult(result)[0];
      return ok(row === undefined ? null : rowToConversation(row));
    });
  }

  public listTurns(scope: WorkspaceScope, conversationId: string): Promise<Result<readonly RuntimeTurn[]>> {
    return this.tenant<readonly RuntimeTurn[]>(scope, async (tx) => {
      const conversation = await this.conversation(tx, scope, conversationId);
      if (conversation === null) return err(new TenantAccessDeniedError());
      const result = await tx.execute(sql`select ${turnSelect} from public.assistant_turns where organization_id = ${scope.organizationId} and workspace_id = ${scope.workspaceId} and conversation_id = ${conversationId} order by created_at asc, id asc`);
      return ok(rowsFromExecuteResult(result).map(rowToTurn));
    });
  }

  public appendUserTurn(scope: WorkspaceScope, input: AppendRuntimeUserTurn): Promise<Result<RuntimeTurnInsert>> {
    return this.insertTurn(scope, input, "user");
  }

  public queueAssistantTurn(scope: WorkspaceScope, input: QueueRuntimeAssistantTurn): Promise<Result<RuntimeTurnInsert>> {
    return this.insertTurn(scope, input, "assistant");
  }

  private insertTurn(scope: WorkspaceScope, input: AppendRuntimeUserTurn | QueueRuntimeAssistantTurn, role: "user" | "assistant"): Promise<Result<RuntimeTurnInsert>> {
    return this.tenant<RuntimeTurnInsert>(scope, async (tx) => {
      const scoped = this.scopedWrite(scope, input);
      if (!scoped.ok) return scoped;
      if (await this.conversation(tx, scope, input.conversationId) === null) return err(storeError("runtimeControl.conversationNotFound", "Assistant conversation was not found."));
      const content = input.content ?? {};
      const actorUserId = role === "user" ? (input as AppendRuntimeUserTurn).actorUserId : null;
      const assistantKey = role === "assistant" ? (input as QueueRuntimeAssistantTurn).assistantKey : null;
      const status = role === "user" ? "final" : "queued";
      const inserted = await tx.execute(sql`insert into public.assistant_turns (conversation_id, organization_id, workspace_id, role, status, actor_user_id, assistant_key, content, idempotency_key, openclaw_session_ref, openclaw_run_ref, finalized_at) values (${input.conversationId}, ${input.organizationId}, ${input.workspaceId}, ${role}::public.assistant_turn_role, ${status}::public.assistant_turn_status, ${actorUserId}, ${assistantKey}, ${JSON.stringify(content)}::jsonb, ${input.idempotencyKey}, ${role === "assistant" ? (input as QueueRuntimeAssistantTurn).openclawSessionRef ?? null : null}, ${role === "assistant" ? (input as QueueRuntimeAssistantTurn).openclawRunRef ?? null : null}, ${role === "user" ? sql`now()` : sql`null`}) on conflict (organization_id, conversation_id, idempotency_key) do nothing returning ${turnSelect}`);
      const insertedRow = rowsFromExecuteResult(inserted)[0];
      if (insertedRow !== undefined) return ok({ kind: "inserted", turn: rowToTurn(insertedRow) });
      const replay = await tx.execute(sql`select ${turnSelect} from public.assistant_turns where organization_id = ${scope.organizationId} and workspace_id = ${scope.workspaceId} and conversation_id = ${input.conversationId} and idempotency_key = ${input.idempotencyKey} limit 1`);
      const replayRow = rowsFromExecuteResult(replay)[0];
      if (replayRow === undefined) return err(storeError("runtimeControl.turnNotFound", "Assistant turn was not found."));
      const turn = rowToTurn(replayRow);
      const matches = turn.role === role && turn.actorUserId === actorUserId && turn.assistantKey === assistantKey && stableJson(turn.content) === stableJson(content);
      return matches ? ok({ kind: "replayed", turn }) : err(storeError("runtimeControl.idempotencyConflict", "Idempotency key was reused with a different assistant turn payload."));
    });
  }

  public appendAssistantDelta(scope: WorkspaceScope, input: AppendRuntimeAssistantDelta): Promise<Result<RuntimeTurnTransition>> {
    return this.tenant<RuntimeTurnTransition>(scope, async (tx) => {
      const current = await this.turn(tx, scope, input.turnId, true);
      if (current === null) return ok({ kind: "not-found" });
      if (current.role !== "assistant" || (current.status !== "queued" && current.status !== "streaming")) return ok({ kind: "invalid-state", turn: current });
      const text = typeof current.content["text"] === "string" ? current.content["text"] : "";
      const deltas = Array.isArray(current.content["deltas"]) ? current.content["deltas"].map(String) : [];
      const content = { ...current.content, text: `${text}${input.deltaText}`, deltas: [...deltas, input.deltaText] };
      const result = await tx.execute(sql`update public.assistant_turns set status = 'streaming', content = ${JSON.stringify(content)}::jsonb, updated_at = now() where id = ${input.turnId} and organization_id = ${scope.organizationId} and workspace_id = ${scope.workspaceId} and role = 'assistant' and status in ('queued', 'streaming') returning ${turnSelect}`);
      const row = rowsFromExecuteResult(result)[0];
      return row === undefined ? ok({ kind: "invalid-state", turn: current }) : ok({ kind: "updated", turn: rowToTurn(row) });
    });
  }

  public finalizeAssistantTurn(scope: WorkspaceScope, input: FinalizeRuntimeAssistantTurn): Promise<Result<RuntimeTurnTransition>> {
    return this.tenant<RuntimeTurnTransition>(scope, async (tx) => {
      const claimed = await tx.execute(sql`update public.assistant_turns set status = 'finalizing', updated_at = now() where id = ${input.turnId} and organization_id = ${scope.organizationId} and workspace_id = ${scope.workspaceId} and role = 'assistant' and status in ('queued', 'streaming') returning ${turnSelect}`);
      if (rowsFromExecuteResult(claimed)[0] === undefined) {
        const current = await this.turn(tx, scope, input.turnId);
        if (current === null) return ok({ kind: "not-found" });
        return current.role === "assistant" && current.status === "final" ? ok({ kind: "already-final", turn: current }) : ok({ kind: "invalid-state", turn: current });
      }
      const result = await tx.execute(sql`update public.assistant_turns set status = 'final', content = ${JSON.stringify(input.content)}::jsonb, openclaw_session_ref = ${input.openclawSessionRef ?? null}, openclaw_run_ref = ${input.openclawRunRef ?? null}, finalized_at = now(), updated_at = now() where id = ${input.turnId} and organization_id = ${scope.organizationId} and workspace_id = ${scope.workspaceId} and role = 'assistant' and status = 'finalizing' returning ${turnSelect}`);
      const row = rowsFromExecuteResult(result)[0];
      if (row === undefined) throw storeError("runtimeControl.finalizationClaimLost", "Assistant turn finalization lost its single-writer claim.");
      return ok({ kind: "updated", turn: rowToTurn(row) });
    });
  }

  public failAssistantTurn(scope: WorkspaceScope, input: FailRuntimeAssistantTurn): Promise<Result<RuntimeTurnTransition>> {
    return this.tenant<RuntimeTurnTransition>(scope, async (tx) => {
      const content = { error: { code: input.errorCode, message: input.errorMessage } };
      const result = await tx.execute(sql`update public.assistant_turns set status = 'failed', content = ${JSON.stringify(content)}::jsonb, finalized_at = now(), updated_at = now() where id = ${input.turnId} and organization_id = ${scope.organizationId} and workspace_id = ${scope.workspaceId} and role = 'assistant' and status in ('queued', 'streaming', 'finalizing') returning ${turnSelect}`);
      const row = rowsFromExecuteResult(result)[0];
      if (row !== undefined) return ok({ kind: "updated", turn: rowToTurn(row) });
      const current = await this.turn(tx, scope, input.turnId);
      if (current === null) return ok({ kind: "not-found" });
      return current.role === "assistant" && current.status === "failed" ? ok({ kind: "already-final", turn: current }) : ok({ kind: "invalid-state", turn: current });
    });
  }

  public startToolOutcome(scope: WorkspaceScope, input: StartRuntimeToolOutcome): Promise<Result<RuntimeToolOutcomeInsert>> {
    return this.tenant<RuntimeToolOutcomeInsert>(scope, async (tx) => {
      const scoped = this.scopedWrite(scope, input);
      if (!scoped.ok) return scoped;
      const turn = await this.turn(tx, scope, input.turnId);
      if (turn === null) return err(storeError("runtimeControl.turnNotFound", "Assistant turn was not found."));
      if (turn.role !== "assistant") return err(storeError("runtimeControl.invalidToolOutcomeTurn", "Tool outcome receipts must bind to an assistant turn."));
      const inserted = await tx.execute(sql`insert into public.assistant_tool_outcomes (organization_id, workspace_id, turn_id, tool_name, tool_call_id, idempotency_key, status, request_summary, target_ref) values (${input.organizationId}, ${input.workspaceId}, ${input.turnId}, ${input.toolName}, ${input.toolCallId}, ${input.idempotencyKey}, 'started', ${JSON.stringify(input.requestSummary)}::jsonb, ${input.targetRef ?? null}) on conflict (turn_id, tool_call_id) do nothing returning ${outcomeSelect}`);
      const insertedRow = rowsFromExecuteResult(inserted)[0];
      if (insertedRow !== undefined) return ok({ kind: "inserted", outcome: rowToOutcome(insertedRow) });
      const existing = await tx.execute(sql`select ${outcomeSelect} from public.assistant_tool_outcomes where turn_id = ${input.turnId} and tool_call_id = ${input.toolCallId} and organization_id = ${scope.organizationId} and workspace_id = ${scope.workspaceId} limit 1`);
      const row = rowsFromExecuteResult(existing)[0];
      if (row === undefined) return err(storeError("runtimeControl.toolOutcomeNotFound", "Tool outcome was not found."));
      const outcome = rowToOutcome(row);
      const matches = outcome.toolName === input.toolName && outcome.idempotencyKey === input.idempotencyKey && stableJson(outcome.requestSummary) === stableJson(input.requestSummary) && (input.targetRef === undefined || input.targetRef === outcome.targetRef);
      return matches ? ok({ kind: "replayed", outcome }) : err(storeError("runtimeControl.toolOutcomeConflict", "Tool call id was reused with a different payload."));
    });
  }

  public finishToolOutcome(scope: WorkspaceScope, input: FinishRuntimeToolOutcome): Promise<Result<RuntimeToolOutcomeTransition>> {
    return this.tenant<RuntimeToolOutcomeTransition>(scope, async (tx) => {
      const result = await tx.execute(sql`select ${outcomeSelect} from public.assistant_tool_outcomes where turn_id = ${input.turnId} and tool_call_id = ${input.toolCallId} and organization_id = ${scope.organizationId} and workspace_id = ${scope.workspaceId} for update`);
      const row = rowsFromExecuteResult(result)[0];
      if (row === undefined) return ok({ kind: "not-found" });
      const current = rowToOutcome(row);
      const matches = current.toolName === input.toolName && current.idempotencyKey === input.idempotencyKey && stableJson(current.requestSummary) === stableJson(input.requestSummary);
      if (!matches) return err(storeError("runtimeControl.toolOutcomeConflict", "Tool call id was reused with a different payload."));
      if (current.status !== "started") return current.status === input.status && stableJson(current.resultSummary) === stableJson(input.resultSummary) ? ok({ kind: "already-final", outcome: current }) : ok({ kind: "invalid-state", outcome: current });
      const updated = await tx.execute(sql`update public.assistant_tool_outcomes set status = ${input.status}::public.assistant_tool_outcome_status, result_summary = ${JSON.stringify(input.resultSummary)}::jsonb, target_ref = ${input.targetRef ?? current.targetRef}, completed_at = now(), updated_at = now() where id = ${current.id} and organization_id = ${scope.organizationId} and workspace_id = ${scope.workspaceId} and status = 'started' returning ${outcomeSelect}`);
      const updatedRow = rowsFromExecuteResult(updated)[0];
      if (updatedRow === undefined) return ok({ kind: "invalid-state", outcome: current });
      return ok({ kind: "updated", outcome: rowToOutcome(updatedRow) });
    });
  }

  public listTaskAssistantRuns(scope: WorkspaceScope, input: ListTaskAssistantRuns): Promise<Result<readonly RuntimeTaskAssistantRun[]>> {
    return this.tenant(scope, async (tx) => {
      const result = await tx.execute(sql`select t.id as turn_id, t.conversation_id, t.organization_id, t.workspace_id, t.role, t.status, t.actor_user_id, t.assistant_key, t.content, t.idempotency_key, t.openclaw_session_ref, t.openclaw_run_ref, t.created_at, t.updated_at, t.finalized_at, o.id as outcome_id, o.turn_id as outcome_turn_id, o.organization_id as outcome_organization_id, o.workspace_id as outcome_workspace_id, o.tool_name, o.tool_call_id, o.idempotency_key as outcome_idempotency_key, o.status as outcome_status, o.request_summary, o.result_summary, o.target_ref, o.created_at as outcome_created_at, o.updated_at as outcome_updated_at, o.completed_at from public.assistant_turns t left join public.assistant_tool_outcomes o on o.turn_id = t.id and o.organization_id = t.organization_id and o.workspace_id = t.workspace_id where t.organization_id = ${scope.organizationId} and t.workspace_id = ${scope.workspaceId} and t.role = 'assistant' and (t.content::text like ${`%${input.taskId}%`} or exists (select 1 from public.assistant_tool_outcomes linked where linked.turn_id = t.id and linked.organization_id = t.organization_id and linked.workspace_id = t.workspace_id and linked.target_ref = ${input.taskId})) order by t.created_at asc, t.id asc, o.created_at asc, o.id asc`);
      const runs = new Map<string, { turn: RuntimeTurn; outcomes: RuntimeToolOutcome[] }>();
      for (const row of rowsFromExecuteResult(result)) {
        const turnRow = { ...row, id: row["turn_id"] };
        const turn = rowToTurn(turnRow);
        const run = runs.get(turn.id) ?? { turn, outcomes: [] };
        if (row["outcome_id"] != null) run.outcomes.push(rowToOutcome({ id: row["outcome_id"], turn_id: row["outcome_turn_id"], organization_id: row["outcome_organization_id"], workspace_id: row["outcome_workspace_id"], tool_name: row["tool_name"], tool_call_id: row["tool_call_id"], idempotency_key: row["outcome_idempotency_key"], status: row["outcome_status"], request_summary: row["request_summary"], result_summary: row["result_summary"], target_ref: row["target_ref"], created_at: row["outcome_created_at"], updated_at: row["outcome_updated_at"], completed_at: row["completed_at"] }));
        runs.set(turn.id, run);
      }
      return ok([...runs.values()]);
    });
  }
}
