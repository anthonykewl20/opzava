import {
  mapDatabaseError,
  sql,
  withTenant,
  type TenantTransaction
} from "@opzava/adapters";
import { err, ok, type Result } from "@opzava/shared-kernel";

import {
  rowToToolOutcome,
  rowsFromExecuteResult,
  runtimeError,
  sameJson,
  selectTurnInScope,
  toolOutcomeSelect,
  validateCommonInput,
  validateToolOutcomeReplay,
  type RuntimeControlApplicationContext,
  type RuntimeControlDependencies
} from "./assistant-conversation-lifecycle.js";
import { normalizeRuntimeKey, type AssistantToolOutcome } from "../domain/assistant.js";


export interface StartedToolOutcomeReceipt {
  readonly outcome: AssistantToolOutcome;
  readonly inserted: boolean;
}

export type RecordToolOutcomeInput =
  | (RuntimeControlApplicationContext & {
      readonly turnId: string;
      readonly toolName: string;
      readonly toolCallId: string;
      readonly idempotencyKey: string;
      readonly status: "started";
      readonly requestSummary: Readonly<Record<string, unknown>>;
      readonly targetRef?: string | null;
    })
  | (RuntimeControlApplicationContext & {
      readonly turnId: string;
      readonly toolName: string;
      readonly toolCallId: string;
      readonly idempotencyKey: string;
      readonly status: "succeeded" | "failed";
      readonly requestSummary: Readonly<Record<string, unknown>>;
      readonly resultSummary: Readonly<Record<string, unknown>>;
      readonly targetRef?: string | null;
    });

async function insertStartedToolOutcome(
  tx: TenantTransaction,
  input: Extract<RecordToolOutcomeInput, { readonly status: "started" }>
): Promise<Result<StartedToolOutcomeReceipt>> {
  const turn = await selectTurnInScope(tx, input);
  if (!turn.ok) {
    return err(turn.error);
  }

  if (turn.value.role !== "assistant") {
    return err(
      runtimeError(
        "runtimeControl.invalidToolOutcomeTurn",
        "Tool outcome receipts must bind to an assistant turn."
      )
    );
  }

  const inserted = await tx.execute(sql`
    insert into public.assistant_tool_outcomes (
      organization_id,
      workspace_id,
      turn_id,
      tool_name,
      tool_call_id,
      idempotency_key,
      status,
      request_summary,
      target_ref
    )
    values (
      ${input.orgId},
      ${input.workspaceId},
      ${input.turnId},
      ${input.toolName},
      ${input.toolCallId},
      ${input.idempotencyKey},
      'started',
      ${JSON.stringify(input.requestSummary)}::jsonb,
      ${input.targetRef ?? null}
    )
    on conflict (turn_id, tool_call_id) do nothing
    returning ${toolOutcomeSelect}
  `);
  const insertedRow = rowsFromExecuteResult(inserted)[0];

  if (insertedRow !== undefined) {
    return ok({ outcome: rowToToolOutcome(insertedRow), inserted: true });
  }

  const existing = await tx.execute(sql`
    select ${toolOutcomeSelect}
    from public.assistant_tool_outcomes
    where turn_id = ${input.turnId}
      and tool_call_id = ${input.toolCallId}
    limit 1
  `);
  const existingRow = rowsFromExecuteResult(existing)[0];
  if (existingRow === undefined) {
    return err(
      runtimeError("runtimeControl.toolOutcomeNotFound", "Tool outcome was not found.")
    );
  }

  const replay = validateToolOutcomeReplay(rowToToolOutcome(existingRow), input);
  if (!replay.ok) {
    return err(replay.error);
  }

  return ok({ outcome: replay.value, inserted: false });
}

async function finishToolOutcome(
  tx: TenantTransaction,
  input: Extract<RecordToolOutcomeInput, { readonly status: "succeeded" | "failed" }>
): Promise<Result<AssistantToolOutcome>> {
  const existing = await tx.execute(sql`
    select ${toolOutcomeSelect}
    from public.assistant_tool_outcomes
    where turn_id = ${input.turnId}
      and tool_call_id = ${input.toolCallId}
      and organization_id = ${input.orgId}
      and workspace_id = ${input.workspaceId}
    for update
  `);
  const row = rowsFromExecuteResult(existing)[0];

  if (row === undefined) {
    return err(
      runtimeError(
        "runtimeControl.toolOutcomeReceiptMissing",
        "Tool outcome receipt must be recorded before a tool mutation."
      )
    );
  }

  const current = rowToToolOutcome(row);
  const replayTargetRef = current.status === "started" ? current.targetRef : input.targetRef;
  const replay = validateToolOutcomeReplay(current, {
    ...input,
    ...(replayTargetRef === undefined ? {} : { targetRef: replayTargetRef })
  });
  if (!replay.ok) {
    return err(replay.error);
  }

  if (current.status !== "started") {
    if (
      current.status === input.status &&
      sameJson(current.resultSummary, input.resultSummary)
    ) {
      return ok(current);
    }

    return err(
      runtimeError(
        "runtimeControl.toolOutcomeConflict",
        "Tool outcome was already completed with a different result."
      )
    );
  }

  const updated = await tx.execute(sql`
    update public.assistant_tool_outcomes
    set
      status = ${input.status}::public.assistant_tool_outcome_status,
      result_summary = ${JSON.stringify(input.resultSummary)}::jsonb,
      target_ref = ${input.targetRef ?? current.targetRef},
      completed_at = now(),
      updated_at = now()
    where id = ${current.id}
      and status = 'started'
    returning ${toolOutcomeSelect}
  `);
  const updatedRow = rowsFromExecuteResult(updated)[0];

  if (updatedRow === undefined) {
    return err(
      runtimeError(
        "runtimeControl.toolOutcomeConflict",
        "Tool outcome completion lost its single-writer claim."
      )
    );
  }

  return ok(rowToToolOutcome(updatedRow));
}

export async function recordToolOutcome(
  input: RecordToolOutcomeInput,
  dependencies: RuntimeControlDependencies = {}
): Promise<Result<AssistantToolOutcome>> {
  const authorized = await validateCommonInput(input, dependencies, "execute");
  if (!authorized.ok) {
    return err(authorized.error);
  }

  const toolName = normalizeRuntimeKey(input.toolName, "toolName");
  const toolCallId = normalizeRuntimeKey(input.toolCallId, "toolCallId");
  const idempotencyKey = normalizeRuntimeKey(input.idempotencyKey, "idempotencyKey");
  if (!toolName.ok) {
    return err(toolName.error);
  }
  if (!toolCallId.ok) {
    return err(toolCallId.error);
  }
  if (!idempotencyKey.ok) {
    return err(idempotencyKey.error);
  }

  try {
    if (input.status === "started") {
      const normalizedInput: Extract<
        RecordToolOutcomeInput,
        { readonly status: "started" }
      > = {
        ...input,
        toolName: toolName.value,
        toolCallId: toolCallId.value,
        idempotencyKey: idempotencyKey.value
      };

      const receipt = await withTenant(input.orgId, async (tx) =>
        insertStartedToolOutcome(tx, normalizedInput)
      );
      return receipt.ok ? ok(receipt.value.outcome) : err(receipt.error);
    }

    const normalizedInput: Extract<
      RecordToolOutcomeInput,
      { readonly status: "succeeded" | "failed" }
    > = {
      ...input,
      toolName: toolName.value,
      toolCallId: toolCallId.value,
      idempotencyKey: idempotencyKey.value
    };

    return await withTenant(input.orgId, async (tx) =>
      finishToolOutcome(tx, normalizedInput)
    );
  } catch (error) {
    return err(
      runtimeError(
        "runtimeControl.toolOutcomeRecordFailed",
        "Tool outcome could not be recorded.",
        mapDatabaseError(error)
      )
    );
  }
}

export async function recordStartedToolOutcome(
  input: Extract<RecordToolOutcomeInput, { readonly status: "started" }>,
  dependencies: RuntimeControlDependencies = {}
): Promise<Result<StartedToolOutcomeReceipt>> {
  const authorized = await validateCommonInput(input, dependencies, "execute");
  if (!authorized.ok) {
    return err(authorized.error);
  }

  const toolName = normalizeRuntimeKey(input.toolName, "toolName");
  const toolCallId = normalizeRuntimeKey(input.toolCallId, "toolCallId");
  const idempotencyKey = normalizeRuntimeKey(input.idempotencyKey, "idempotencyKey");
  if (!toolName.ok) {
    return err(toolName.error);
  }
  if (!toolCallId.ok) {
    return err(toolCallId.error);
  }
  if (!idempotencyKey.ok) {
    return err(idempotencyKey.error);
  }

  const normalizedInput: Extract<RecordToolOutcomeInput, { readonly status: "started" }> = {
    ...input,
    toolName: toolName.value,
    toolCallId: toolCallId.value,
    idempotencyKey: idempotencyKey.value
  };

  try {
    return await withTenant(input.orgId, async (tx) =>
      insertStartedToolOutcome(tx, normalizedInput)
    );
  } catch (error) {
    return err(
      runtimeError(
        "runtimeControl.toolOutcomeRecordFailed",
        "Tool outcome could not be recorded.",
        mapDatabaseError(error)
      )
    );
  }
}