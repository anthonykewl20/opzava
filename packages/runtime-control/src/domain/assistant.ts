import type { OrgId, UserId, WorkspaceId } from "@opzava/shared-kernel";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

export const assistantConversationStatuses = ["open", "archived"] as const;
export type AssistantConversationStatus = (typeof assistantConversationStatuses)[number];

export const assistantTurnRoles = ["user", "assistant", "tool", "system"] as const;
export type AssistantTurnRole = (typeof assistantTurnRoles)[number];

export const assistantTurnStatuses = [
  "queued",
  "streaming",
  "finalizing",
  "final",
  "failed"
] as const;
export type AssistantTurnStatus = (typeof assistantTurnStatuses)[number];

export const assistantToolOutcomeStatuses = ["started", "succeeded", "failed"] as const;
export type AssistantToolOutcomeStatus = (typeof assistantToolOutcomeStatuses)[number];

export interface AssistantConversation {
  readonly id: string;
  readonly organizationId: OrgId;
  readonly workspaceId: WorkspaceId;
  readonly surface: string;
  readonly assistantKey: string;
  readonly status: AssistantConversationStatus;
  readonly createdByUserId: UserId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AssistantTurn {
  readonly id: string;
  readonly conversationId: string;
  readonly organizationId: OrgId;
  readonly workspaceId: WorkspaceId;
  readonly role: AssistantTurnRole;
  readonly status: AssistantTurnStatus;
  readonly actorUserId: UserId | null;
  readonly assistantKey: string | null;
  readonly content: Readonly<Record<string, unknown>>;
  readonly idempotencyKey: string;
  readonly openclawSessionRef: string | null;
  readonly openclawRunRef: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly finalizedAt: Date | null;
}

export interface AssistantToolOutcome {
  readonly id: string;
  readonly organizationId: OrgId;
  readonly workspaceId: WorkspaceId;
  readonly turnId: string;
  readonly toolName: string;
  readonly toolCallId: string;
  readonly idempotencyKey: string;
  readonly status: AssistantToolOutcomeStatus;
  readonly requestSummary: Readonly<Record<string, unknown>>;
  readonly resultSummary: Readonly<Record<string, unknown>>;
  readonly targetRef: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
}

const conversationStatusSet = new Set<string>(assistantConversationStatuses);
const turnRoleSet = new Set<string>(assistantTurnRoles);
const turnStatusSet = new Set<string>(assistantTurnStatuses);
const outcomeStatusSet = new Set<string>(assistantToolOutcomeStatuses);

function runtimeValidationError(code: string, message: string): DomainError {
  return new DomainError({ code, message });
}

function parseEnum<T extends string>(
  value: unknown,
  values: Set<string>,
  code: string,
  message: string
): Result<T> {
  if (typeof value === "string" && values.has(value)) {
    return ok(value as T);
  }

  return err(runtimeValidationError(code, message));
}

export function parseAssistantConversationStatus(
  value: unknown
): Result<AssistantConversationStatus> {
  return parseEnum<AssistantConversationStatus>(
    value,
    conversationStatusSet,
    "runtimeControl.invalidConversationStatus",
    "Assistant conversation status is invalid."
  );
}

export function parseAssistantTurnRole(value: unknown): Result<AssistantTurnRole> {
  return parseEnum<AssistantTurnRole>(
    value,
    turnRoleSet,
    "runtimeControl.invalidTurnRole",
    "Assistant turn role is invalid."
  );
}

export function parseAssistantTurnStatus(value: unknown): Result<AssistantTurnStatus> {
  return parseEnum<AssistantTurnStatus>(
    value,
    turnStatusSet,
    "runtimeControl.invalidTurnStatus",
    "Assistant turn status is invalid."
  );
}

export function parseAssistantToolOutcomeStatus(
  value: unknown
): Result<AssistantToolOutcomeStatus> {
  return parseEnum<AssistantToolOutcomeStatus>(
    value,
    outcomeStatusSet,
    "runtimeControl.invalidToolOutcomeStatus",
    "Assistant tool outcome status is invalid."
  );
}

export function normalizeRuntimeKey(value: string, field: string): Result<string> {
  const normalized = value.trim();

  if (normalized.length === 0) {
    return err(
      runtimeValidationError(
        "runtimeControl.emptyRuntimeKey",
        `${field} must be a non-empty string.`
      )
    );
  }

  if (normalized.length > 180) {
    return err(
      runtimeValidationError(
        "runtimeControl.runtimeKeyTooLong",
        `${field} must be 180 characters or fewer.`
      )
    );
  }

  return ok(normalized);
}

export function canAppendAssistantDelta(status: AssistantTurnStatus): boolean {
  return status === "queued" || status === "streaming";
}

export function canFinalizeAssistantTurn(status: AssistantTurnStatus): boolean {
  return status === "queued" || status === "streaming";
}

export function isTerminalAssistantTurnStatus(status: AssistantTurnStatus): boolean {
  return status === "final" || status === "failed";
}
