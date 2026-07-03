import {
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
  makeTenantId,
  makeUserId,
  makeWorkspaceId,
  ok,
  type Result
} from "@opzava/shared-kernel";

import { defaultRuntimeControlAuthorizationPort } from "./authorization.js";
import {
  canAppendAssistantDelta,
  normalizeRuntimeKey,
  parseAssistantConversationStatus,
  parseAssistantToolOutcomeStatus,
  parseAssistantTurnRole,
  parseAssistantTurnStatus,
  type AssistantConversation,
  type AssistantToolOutcome,
  type AssistantTurn
} from "../domain/assistant.js";

export interface RuntimeControlActor {
  readonly userId: string;
  readonly roleKeys: readonly string[];
}

export interface RuntimeControlApplicationContext {
  readonly orgId: string;
  readonly workspaceId: string;
  readonly actor: RuntimeControlActor;
}

export interface SessionDerivedPrincipal extends RuntimeControlApplicationContext {
  readonly sessionId: string;
}

const toolExecutionContextBrand: unique symbol = Symbol("ToolExecutionContext");

export interface ToolExecutionContext extends RuntimeControlApplicationContext {
  readonly [toolExecutionContextBrand]: true;
  readonly sessionId: string;
  readonly conversationId: string;
  readonly assistantTurnId: string;
  readonly commandIdempotencyKey: string;
}

export interface ToolExecutionContextInput {
  readonly principal: SessionDerivedPrincipal;
  readonly conversationId: string;
  readonly assistantTurnId: string;
  readonly commandIdempotencyKey: string;
}

export interface RuntimeControlDependencies {
  readonly authorizationPort?: AuthorizationPort;
}

export interface StartedToolOutcomeReceipt {
  readonly outcome: AssistantToolOutcome;
  readonly inserted: boolean;
}

export interface CreateConversationInput extends RuntimeControlApplicationContext {
  readonly surface: string;
  readonly assistantKey: string;
}

export interface AppendUserTurnInput extends RuntimeControlApplicationContext {
  readonly conversationId: string;
  readonly idempotencyKey: string;
  readonly content: Readonly<Record<string, unknown>>;
}

export interface StartAssistantTurnInput extends RuntimeControlApplicationContext {
  readonly conversationId: string;
  readonly idempotencyKey: string;
  readonly assistantKey: string;
  readonly content?: Readonly<Record<string, unknown>>;
  readonly openclawSessionRef?: string | null;
  readonly openclawRunRef?: string | null;
}

export interface AppendAssistantDeltaInput extends RuntimeControlApplicationContext {
  readonly turnId: string;
  readonly deltaText: string;
}

export interface FinalizeAssistantTurnInput extends RuntimeControlApplicationContext {
  readonly turnId: string;
  readonly content: Readonly<Record<string, unknown>>;
  readonly openclawSessionRef?: string | null;
  readonly openclawRunRef?: string | null;
}

export interface FailAssistantTurnInput extends RuntimeControlApplicationContext {
  readonly turnId: string;
  readonly errorCode: string;
  readonly errorMessage: string;
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

type QueryRow = Record<string, unknown>;

function runtimeError(code: string, message: string, cause?: unknown): DomainError {
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

function parseDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  throw runtimeError(
    "runtimeControl.invalidTimestamp",
    "Runtime-Control record contains an invalid timestamp."
  );
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function jsonRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Readonly<Record<string, unknown>>;
  }

  return {};
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function sameJson(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function rowToConversation(row: QueryRow): AssistantConversation {
  const status = parseAssistantConversationStatus(row["status"]);
  if (!status.ok) {
    throw status.error;
  }

  return {
    id: String(row["id"]),
    organizationId: makeOrgId(String(row["organization_id"])),
    workspaceId: makeWorkspaceId(String(row["workspace_id"])),
    surface: String(row["surface"]),
    assistantKey: String(row["assistant_key"]),
    status: status.value,
    createdByUserId: makeUserId(String(row["created_by_user_id"])),
    createdAt: parseDate(row["created_at"]),
    updatedAt: parseDate(row["updated_at"])
  };
}

function rowToTurn(row: QueryRow): AssistantTurn {
  const role = parseAssistantTurnRole(row["role"]);
  const status = parseAssistantTurnStatus(row["status"]);

  if (!role.ok) {
    throw role.error;
  }

  if (!status.ok) {
    throw status.error;
  }

  return {
    id: String(row["id"]),
    conversationId: String(row["conversation_id"]),
    organizationId: makeOrgId(String(row["organization_id"])),
    workspaceId: makeWorkspaceId(String(row["workspace_id"])),
    role: role.value,
    status: status.value,
    actorUserId:
      row["actor_user_id"] === null || row["actor_user_id"] === undefined
        ? null
        : makeUserId(String(row["actor_user_id"])),
    assistantKey: stringOrNull(row["assistant_key"]),
    content: jsonRecord(row["content"]),
    idempotencyKey: String(row["idempotency_key"]),
    openclawSessionRef: stringOrNull(row["openclaw_session_ref"]),
    openclawRunRef: stringOrNull(row["openclaw_run_ref"]),
    createdAt: parseDate(row["created_at"]),
    updatedAt: parseDate(row["updated_at"]),
    finalizedAt:
      row["finalized_at"] === null || row["finalized_at"] === undefined
        ? null
        : parseDate(row["finalized_at"])
  };
}

function rowToToolOutcome(row: QueryRow): AssistantToolOutcome {
  const status = parseAssistantToolOutcomeStatus(row["status"]);
  if (!status.ok) {
    throw status.error;
  }

  return {
    id: String(row["id"]),
    organizationId: makeOrgId(String(row["organization_id"])),
    workspaceId: makeWorkspaceId(String(row["workspace_id"])),
    turnId: String(row["turn_id"]),
    toolName: String(row["tool_name"]),
    toolCallId: String(row["tool_call_id"]),
    idempotencyKey: String(row["idempotency_key"]),
    status: status.value,
    requestSummary: jsonRecord(row["request_summary"]),
    resultSummary: jsonRecord(row["result_summary"]),
    targetRef: stringOrNull(row["target_ref"]),
    createdAt: parseDate(row["created_at"]),
    updatedAt: parseDate(row["updated_at"]),
    completedAt:
      row["completed_at"] === null || row["completed_at"] === undefined
        ? null
        : parseDate(row["completed_at"])
  };
}

const conversationSelect = sql`
  id,
  organization_id,
  workspace_id,
  surface,
  assistant_key,
  status,
  created_by_user_id,
  created_at,
  updated_at
`;

const turnSelect = sql`
  id,
  conversation_id,
  organization_id,
  workspace_id,
  role,
  status,
  actor_user_id,
  assistant_key,
  content,
  idempotency_key,
  openclaw_session_ref,
  openclaw_run_ref,
  created_at,
  updated_at,
  finalized_at
`;

const toolOutcomeSelect = sql`
  id,
  organization_id,
  workspace_id,
  turn_id,
  tool_name,
  tool_call_id,
  idempotency_key,
  status,
  request_summary,
  result_summary,
  target_ref,
  created_at,
  updated_at,
  completed_at
`;

function assertKnownContext(input: RuntimeControlApplicationContext): Result<void> {
  try {
    makeTenantId(input.orgId);
    makeOrgId(input.orgId);
    makeWorkspaceId(input.workspaceId);
    makeUserId(input.actor.userId);
    return ok(undefined);
  } catch (error) {
    return err(
      runtimeError(
        "runtimeControl.invalidContext",
        "Runtime-Control context contains an invalid organization, workspace, or actor id.",
        error
      )
    );
  }
}

function authorizationSubject(input: RuntimeControlApplicationContext): AuthorizationSubject {
  return {
    userId: makeUserId(input.actor.userId),
    tenantId: makeTenantId(input.orgId),
    orgId: makeOrgId(input.orgId),
    workspaceIds: [makeWorkspaceId(input.workspaceId)],
    roleKeys: input.actor.roleKeys
  };
}

async function authorizeRuntimeControl(
  input: RuntimeControlApplicationContext,
  action: "read" | "create" | "update" | "execute",
  authorizationPort: AuthorizationPort
): Promise<Result<void>> {
  const decisionResult = await authorizationPort.can(authorizationSubject(input), action, {
    type: "agent",
    tenantId: makeTenantId(input.orgId),
    orgId: makeOrgId(input.orgId),
    workspaceId: makeWorkspaceId(input.workspaceId)
  });

  if (!decisionResult.ok) {
    return err(decisionResult.error);
  }

  if (!decisionResult.value.allowed) {
    return err(
      runtimeError(
        "runtimeControl.forbidden",
        "You are not allowed to use Runtime-Control."
      )
    );
  }

  return ok(undefined);
}

function validateCommonInput(
  input: RuntimeControlApplicationContext,
  dependencies: RuntimeControlDependencies,
  action: "read" | "create" | "update" | "execute"
): Promise<Result<void>> {
  const knownContext = assertKnownContext(input);
  if (!knownContext.ok) {
    return Promise.resolve(err(knownContext.error));
  }

  return authorizeRuntimeControl(
    input,
    action,
    dependencies.authorizationPort ?? defaultRuntimeControlAuthorizationPort
  );
}

function contentWithDelta(
  content: Readonly<Record<string, unknown>>,
  deltaText: string
): Readonly<Record<string, unknown>> {
  const existingText = typeof content["text"] === "string" ? content["text"] : "";
  const deltas = Array.isArray(content["deltas"]) ? content["deltas"].map(String) : [];

  return {
    ...content,
    text: `${existingText}${deltaText}`,
    deltas: [...deltas, deltaText]
  };
}

async function loadConversationInScope(
  tx: TenantTransaction,
  input: RuntimeControlApplicationContext & { readonly conversationId: string }
): Promise<Result<AssistantConversation>> {
  const result = await tx.execute(sql`
    select ${conversationSelect}
    from public.assistant_conversations
    where id = ${input.conversationId}
      and organization_id = ${input.orgId}
      and workspace_id = ${input.workspaceId}
    limit 1
  `);
  const row = rowsFromExecuteResult(result)[0];

  if (row === undefined) {
    return err(
      runtimeError(
        "runtimeControl.conversationNotFound",
        "Assistant conversation was not found."
      )
    );
  }

  return ok(rowToConversation(row));
}

async function selectTurnInScope(
  tx: TenantTransaction,
  input: RuntimeControlApplicationContext & { readonly turnId: string },
  lock = false
): Promise<Result<AssistantTurn>> {
  const result = await tx.execute(sql`
    select ${turnSelect}
    from public.assistant_turns
    where id = ${input.turnId}
      and organization_id = ${input.orgId}
      and workspace_id = ${input.workspaceId}
    ${lock ? sql`for update` : sql``}
  `);
  const row = rowsFromExecuteResult(result)[0];

  if (row === undefined) {
    return err(runtimeError("runtimeControl.turnNotFound", "Assistant turn was not found."));
  }

  return ok(rowToTurn(row));
}

function validateIdempotentTurnReplay(
  existing: AssistantTurn,
  expected: {
    readonly role: string;
    readonly actorUserId?: string | null;
    readonly assistantKey?: string | null;
    readonly content: Readonly<Record<string, unknown>>;
  }
): Result<AssistantTurn> {
  const actorMatches =
    expected.actorUserId === undefined || existing.actorUserId === expected.actorUserId;
  const assistantMatches =
    expected.assistantKey === undefined || existing.assistantKey === expected.assistantKey;

  if (
    existing.role !== expected.role ||
    !actorMatches ||
    !assistantMatches ||
    !sameJson(existing.content, expected.content)
  ) {
    return err(
      runtimeError(
        "runtimeControl.idempotencyConflict",
        "Idempotency key was reused with a different assistant turn payload."
      )
    );
  }

  return ok(existing);
}

function validateToolOutcomeReplay(
  existing: AssistantToolOutcome,
  expected: {
    readonly toolName: string;
    readonly idempotencyKey: string;
    readonly requestSummary: Readonly<Record<string, unknown>>;
    readonly targetRef?: string | null;
  }
): Result<AssistantToolOutcome> {
  if (
    existing.toolName !== expected.toolName ||
    existing.idempotencyKey !== expected.idempotencyKey ||
    (expected.targetRef !== undefined && expected.targetRef !== existing.targetRef) ||
    !sameJson(existing.requestSummary, expected.requestSummary)
  ) {
    return err(
      runtimeError(
        "runtimeControl.toolOutcomeConflict",
        "Tool call id was reused with a different payload."
      )
    );
  }

  return ok(existing);
}

export function toolExecutionContextFromSessionPrincipal(
  input: ToolExecutionContextInput
): Result<ToolExecutionContext> {
  const knownContext = assertKnownContext(input.principal);
  if (!knownContext.ok) {
    return err(knownContext.error);
  }

  const conversationId = normalizeRuntimeKey(input.conversationId, "conversationId");
  if (!conversationId.ok) {
    return err(conversationId.error);
  }

  const assistantTurnId = normalizeRuntimeKey(input.assistantTurnId, "assistantTurnId");
  if (!assistantTurnId.ok) {
    return err(assistantTurnId.error);
  }

  const idempotencyKey = normalizeRuntimeKey(
    input.commandIdempotencyKey,
    "commandIdempotencyKey"
  );
  if (!idempotencyKey.ok) {
    return err(idempotencyKey.error);
  }

  return ok({
    orgId: input.principal.orgId,
    workspaceId: input.principal.workspaceId,
    actor: input.principal.actor,
    sessionId: input.principal.sessionId,
    conversationId: conversationId.value,
    assistantTurnId: assistantTurnId.value,
    commandIdempotencyKey: idempotencyKey.value,
    [toolExecutionContextBrand]: true
  });
}

export async function createConversation(
  input: CreateConversationInput,
  dependencies: RuntimeControlDependencies = {}
): Promise<Result<AssistantConversation>> {
  const authorized = await validateCommonInput(input, dependencies, "create");
  if (!authorized.ok) {
    return err(authorized.error);
  }

  const surface = normalizeRuntimeKey(input.surface, "surface");
  const assistantKey = normalizeRuntimeKey(input.assistantKey, "assistantKey");
  if (!surface.ok) {
    return err(surface.error);
  }
  if (!assistantKey.ok) {
    return err(assistantKey.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const result = await tx.execute(sql`
        insert into public.assistant_conversations (
          organization_id,
          workspace_id,
          surface,
          assistant_key,
          status,
          created_by_user_id
        )
        values (
          ${input.orgId},
          ${input.workspaceId},
          ${surface.value},
          ${assistantKey.value},
          'open',
          ${input.actor.userId}
        )
        returning ${conversationSelect}
      `);
      const row = rowsFromExecuteResult(result)[0];

      if (row === undefined) {
        return err(
          runtimeError(
            "runtimeControl.conversationCreateFailed",
            "Assistant conversation could not be created."
          )
        );
      }

      return ok(rowToConversation(row));
    });
  } catch (error) {
    return err(
      runtimeError(
        "runtimeControl.conversationCreateFailed",
        "Assistant conversation could not be created.",
        mapDatabaseError(error)
      )
    );
  }
}

export async function appendUserTurn(
  input: AppendUserTurnInput,
  dependencies: RuntimeControlDependencies = {}
): Promise<Result<AssistantTurn>> {
  const authorized = await validateCommonInput(input, dependencies, "create");
  if (!authorized.ok) {
    return err(authorized.error);
  }

  const idempotencyKey = normalizeRuntimeKey(input.idempotencyKey, "idempotencyKey");
  if (!idempotencyKey.ok) {
    return err(idempotencyKey.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const conversation = await loadConversationInScope(tx, input);
      if (!conversation.ok) {
        return err(conversation.error);
      }

      const inserted = await tx.execute(sql`
        insert into public.assistant_turns (
          conversation_id,
          organization_id,
          workspace_id,
          role,
          status,
          actor_user_id,
          content,
          idempotency_key,
          finalized_at
        )
        values (
          ${input.conversationId},
          ${input.orgId},
          ${input.workspaceId},
          'user',
          'final',
          ${input.actor.userId},
          ${JSON.stringify(input.content)}::jsonb,
          ${idempotencyKey.value},
          now()
        )
        on conflict (organization_id, conversation_id, idempotency_key) do nothing
        returning ${turnSelect}
      `);
      const insertedRow = rowsFromExecuteResult(inserted)[0];

      if (insertedRow !== undefined) {
        return ok(rowToTurn(insertedRow));
      }

      const existing = await tx.execute(sql`
        select ${turnSelect}
        from public.assistant_turns
        where organization_id = ${input.orgId}
          and conversation_id = ${input.conversationId}
          and idempotency_key = ${idempotencyKey.value}
        limit 1
      `);
      const existingRow = rowsFromExecuteResult(existing)[0];
      if (existingRow === undefined) {
        return err(
          runtimeError("runtimeControl.turnNotFound", "Assistant turn was not found.")
        );
      }

      return validateIdempotentTurnReplay(rowToTurn(existingRow), {
        role: "user",
        actorUserId: input.actor.userId,
        content: input.content
      });
    });
  } catch (error) {
    return err(
      runtimeError(
        "runtimeControl.userTurnAppendFailed",
        "User turn could not be appended.",
        mapDatabaseError(error)
      )
    );
  }
}

export async function startAssistantTurn(
  input: StartAssistantTurnInput,
  dependencies: RuntimeControlDependencies = {}
): Promise<Result<AssistantTurn>> {
  const authorized = await validateCommonInput(input, dependencies, "execute");
  if (!authorized.ok) {
    return err(authorized.error);
  }

  const idempotencyKey = normalizeRuntimeKey(input.idempotencyKey, "idempotencyKey");
  const assistantKey = normalizeRuntimeKey(input.assistantKey, "assistantKey");
  if (!idempotencyKey.ok) {
    return err(idempotencyKey.error);
  }
  if (!assistantKey.ok) {
    return err(assistantKey.error);
  }

  const content = input.content ?? {};

  try {
    return await withTenant(input.orgId, async (tx) => {
      const conversation = await loadConversationInScope(tx, input);
      if (!conversation.ok) {
        return err(conversation.error);
      }

      const inserted = await tx.execute(sql`
        insert into public.assistant_turns (
          conversation_id,
          organization_id,
          workspace_id,
          role,
          status,
          assistant_key,
          content,
          idempotency_key,
          openclaw_session_ref,
          openclaw_run_ref
        )
        values (
          ${input.conversationId},
          ${input.orgId},
          ${input.workspaceId},
          'assistant',
          'queued',
          ${assistantKey.value},
          ${JSON.stringify(content)}::jsonb,
          ${idempotencyKey.value},
          ${input.openclawSessionRef ?? null},
          ${input.openclawRunRef ?? null}
        )
        on conflict (organization_id, conversation_id, idempotency_key) do nothing
        returning ${turnSelect}
      `);
      const insertedRow = rowsFromExecuteResult(inserted)[0];

      if (insertedRow !== undefined) {
        return ok(rowToTurn(insertedRow));
      }

      const existing = await tx.execute(sql`
        select ${turnSelect}
        from public.assistant_turns
        where organization_id = ${input.orgId}
          and conversation_id = ${input.conversationId}
          and idempotency_key = ${idempotencyKey.value}
        limit 1
      `);
      const existingRow = rowsFromExecuteResult(existing)[0];
      if (existingRow === undefined) {
        return err(
          runtimeError("runtimeControl.turnNotFound", "Assistant turn was not found.")
        );
      }

      return validateIdempotentTurnReplay(rowToTurn(existingRow), {
        role: "assistant",
        assistantKey: assistantKey.value,
        content
      });
    });
  } catch (error) {
    return err(
      runtimeError(
        "runtimeControl.assistantTurnStartFailed",
        "Assistant turn could not be started.",
        mapDatabaseError(error)
      )
    );
  }
}

export async function appendAssistantDelta(
  input: AppendAssistantDeltaInput,
  dependencies: RuntimeControlDependencies = {}
): Promise<Result<AssistantTurn>> {
  const authorized = await validateCommonInput(input, dependencies, "update");
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const current = await selectTurnInScope(tx, input, true);
      if (!current.ok) {
        return err(current.error);
      }

      if (
        current.value.role !== "assistant" ||
        !canAppendAssistantDelta(current.value.status)
      ) {
        return err(
          runtimeError(
            "runtimeControl.invalidTurnTransition",
            "Assistant delta cannot be appended in the current turn state."
          )
        );
      }

      const content = contentWithDelta(current.value.content, input.deltaText);
      const updated = await tx.execute(sql`
        update public.assistant_turns
        set
          status = 'streaming',
          content = ${JSON.stringify(content)}::jsonb,
          updated_at = now()
        where id = ${input.turnId}
          and organization_id = ${input.orgId}
          and workspace_id = ${input.workspaceId}
          and role = 'assistant'
          and status in ('queued', 'streaming')
        returning ${turnSelect}
      `);
      const row = rowsFromExecuteResult(updated)[0];

      if (row === undefined) {
        return err(
          runtimeError(
            "runtimeControl.invalidTurnTransition",
            "Assistant delta could not be appended in the current turn state."
          )
        );
      }

      return ok(rowToTurn(row));
    });
  } catch (error) {
    return err(
      runtimeError(
        "runtimeControl.assistantDeltaAppendFailed",
        "Assistant delta could not be appended.",
        mapDatabaseError(error)
      )
    );
  }
}

export async function finalizeAssistantTurn(
  input: FinalizeAssistantTurnInput,
  dependencies: RuntimeControlDependencies = {}
): Promise<Result<AssistantTurn>> {
  const authorized = await validateCommonInput(input, dependencies, "update");
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const claimed = await tx.execute(sql`
        update public.assistant_turns
        set
          status = 'finalizing',
          updated_at = now()
        where id = ${input.turnId}
          and organization_id = ${input.orgId}
          and workspace_id = ${input.workspaceId}
          and role = 'assistant'
          and status in ('queued', 'streaming')
        returning ${turnSelect}
      `);
      const claimedRow = rowsFromExecuteResult(claimed)[0];

      if (claimedRow === undefined) {
        const existing = await selectTurnInScope(tx, input);
        if (!existing.ok) {
          return err(existing.error);
        }

        if (existing.value.role === "assistant" && existing.value.status === "final") {
          return ok(existing.value);
        }

        return err(
          runtimeError(
            "runtimeControl.invalidTurnTransition",
            "Assistant turn cannot be finalized in the current state."
          )
        );
      }

      const finalized = await tx.execute(sql`
        update public.assistant_turns
        set
          status = 'final',
          content = ${JSON.stringify(input.content)}::jsonb,
          openclaw_session_ref = ${input.openclawSessionRef ?? null},
          openclaw_run_ref = ${input.openclawRunRef ?? null},
          finalized_at = now(),
          updated_at = now()
        where id = ${input.turnId}
          and organization_id = ${input.orgId}
          and workspace_id = ${input.workspaceId}
          and role = 'assistant'
          and status = 'finalizing'
        returning ${turnSelect}
      `);
      const finalizedRow = rowsFromExecuteResult(finalized)[0];

      if (finalizedRow === undefined) {
        return err(
          runtimeError(
            "runtimeControl.invalidTurnTransition",
            "Assistant turn finalization lost its single-writer claim."
          )
        );
      }

      return ok(rowToTurn(finalizedRow));
    });
  } catch (error) {
    return err(
      runtimeError(
        "runtimeControl.assistantTurnFinalizeFailed",
        "Assistant turn could not be finalized.",
        mapDatabaseError(error)
      )
    );
  }
}

export async function failAssistantTurn(
  input: FailAssistantTurnInput,
  dependencies: RuntimeControlDependencies = {}
): Promise<Result<AssistantTurn>> {
  const authorized = await validateCommonInput(input, dependencies, "update");
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const failedContent = {
        error: {
          code: input.errorCode,
          message: input.errorMessage
        }
      };
      const updated = await tx.execute(sql`
        update public.assistant_turns
        set
          status = 'failed',
          content = ${JSON.stringify(failedContent)}::jsonb,
          finalized_at = now(),
          updated_at = now()
        where id = ${input.turnId}
          and organization_id = ${input.orgId}
          and workspace_id = ${input.workspaceId}
          and role = 'assistant'
          and status in ('queued', 'streaming', 'finalizing')
        returning ${turnSelect}
      `);
      const row = rowsFromExecuteResult(updated)[0];

      if (row !== undefined) {
        return ok(rowToTurn(row));
      }

      const existing = await selectTurnInScope(tx, input);
      if (!existing.ok) {
        return err(existing.error);
      }

      if (existing.value.role === "assistant" && existing.value.status === "failed") {
        return ok(existing.value);
      }

      return err(
        runtimeError(
          "runtimeControl.invalidTurnTransition",
          "Assistant turn cannot be failed in the current state."
        )
      );
    });
  } catch (error) {
    return err(
      runtimeError(
        "runtimeControl.assistantTurnFailFailed",
        "Assistant turn could not be marked failed.",
        mapDatabaseError(error)
      )
    );
  }
}

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
