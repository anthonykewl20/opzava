import { sql, withTenant } from "@opzava/adapters";
import { createConversation } from "@opzava/runtime-control";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import type { AppSessionContext } from "@/lib/session";

export const askAdminSurface = "tasks.ask_admin";
export const askAdminAssistantKey = "ask-admin-opzava";
export const askAdminRouteId = "platform-openclaw";

export interface AskAdminTurnView {
  readonly id: string;
  readonly role: "user" | "assistant" | "tool" | "system";
  readonly status: "queued" | "streaming" | "finalizing" | "final" | "failed";
  readonly text: string;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly createdAt: string;
  readonly finalizedAt: string | null;
}

export interface AskAdminConversationHistory {
  readonly conversationId: string;
  readonly turns: readonly AskAdminTurnView[];
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

function runtimeError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause })
  });
}

function actorFromContext(context: AppSessionContext) {
  return {
    userId: context.user.id,
    roleKeys: context.roleKeys
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
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

function contentRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function contentText(content: Readonly<Record<string, unknown>>): string {
  const text = content["text"];
  return typeof text === "string" ? text : "";
}

function errorField(
  content: Readonly<Record<string, unknown>>,
  field: "code" | "message"
): string | null {
  const error = content["error"];
  if (typeof error !== "object" || error === null || Array.isArray(error)) {
    return null;
  }

  const value = (error as Readonly<Record<string, unknown>>)[field];
  return typeof value === "string" ? value : null;
}

function roleValue(value: unknown): AskAdminTurnView["role"] {
  return value === "assistant" || value === "tool" || value === "system" ? value : "user";
}

function statusValue(value: unknown): AskAdminTurnView["status"] {
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

function rowToTurnView(row: QueryRow): AskAdminTurnView {
  const content = contentRecord(row["content"]);

  return {
    id: String(row["id"]),
    role: roleValue(row["role"]),
    status: statusValue(row["status"]),
    text: contentText(content),
    errorCode: errorField(content, "code"),
    errorMessage: errorField(content, "message"),
    createdAt: dateIso(row["created_at"]),
    finalizedAt:
      row["finalized_at"] === null || row["finalized_at"] === undefined
        ? null
        : dateIso(row["finalized_at"])
  };
}

async function findOpenConversationId(context: AppSessionContext): Promise<string | null> {
  const result = await withTenant(context.orgId, async (tx) =>
    tx.execute(sql`
      select id
      from public.assistant_conversations
      where organization_id = ${context.orgId}
        and workspace_id = ${context.workspaceId}
        and surface = ${askAdminSurface}
        and assistant_key = ${askAdminAssistantKey}
        and created_by_user_id = ${context.user.id}
        and status = 'open'
      order by created_at asc
      limit 1
    `)
  );

  const row = rowsFromExecuteResult(result)[0];
  return row === undefined ? null : stringValue(row["id"]);
}

async function createOpenConversation(context: AppSessionContext): Promise<Result<string>> {
  const result = await createConversation({
    orgId: context.orgId,
    workspaceId: context.workspaceId,
    actor: actorFromContext(context),
    surface: askAdminSurface,
    assistantKey: askAdminAssistantKey
  });

  return result.ok ? ok(result.value.id) : err(result.error);
}

async function listConversationTurns(
  context: AppSessionContext,
  conversationId: string
): Promise<readonly AskAdminTurnView[]> {
  const result = await withTenant(context.orgId, async (tx) =>
    tx.execute(sql`
      select
        id,
        role,
        status,
        content,
        created_at,
        finalized_at
      from public.assistant_turns
      where organization_id = ${context.orgId}
        and workspace_id = ${context.workspaceId}
        and conversation_id = ${conversationId}
      order by created_at asc, id asc
    `)
  );

  return rowsFromExecuteResult(result).map(rowToTurnView);
}

export async function getOrCreateAskAdminHistory(
  context: AppSessionContext
): Promise<Result<AskAdminConversationHistory>> {
  try {
    const existingId = await findOpenConversationId(context);
    const conversationIdResult =
      existingId === null ? await createOpenConversation(context) : ok(existingId);

    if (!conversationIdResult.ok) {
      return err(conversationIdResult.error);
    }

    return ok({
      conversationId: conversationIdResult.value,
      turns: await listConversationTurns(context, conversationIdResult.value)
    });
  } catch (error) {
    return err(
      runtimeError(
        "runtimeControl.historyLoadFailed",
        "Ask Admin Opzava conversation history could not be loaded.",
        error
      )
    );
  }
}
