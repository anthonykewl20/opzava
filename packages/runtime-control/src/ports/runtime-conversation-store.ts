import type { OrgId, Result, UserId, WorkspaceId } from "@opzava/shared-kernel";

import type {
  AssistantConversation,
  AssistantToolOutcome,
  AssistantTurn
} from "../domain/assistant.js";

export interface WorkspaceScope {
  readonly organizationId: OrgId;
  readonly workspaceId: WorkspaceId;
}

interface ScopedWrite {
  readonly organizationId: OrgId;
  readonly workspaceId: WorkspaceId;
}

export interface CreateRuntimeConversation extends ScopedWrite {
  readonly surface: string;
  readonly assistantKey: string;
  readonly createdByUserId: UserId;
}

export interface FindOpenRuntimeConversation {
  readonly surface: string;
  readonly assistantKey: string;
  readonly createdByUserId: UserId;
}

export interface AppendRuntimeUserTurn extends ScopedWrite {
  readonly conversationId: string;
  readonly actorUserId: UserId;
  readonly idempotencyKey: string;
  readonly content: Readonly<Record<string, unknown>>;
}

export interface QueueRuntimeAssistantTurn extends ScopedWrite {
  readonly conversationId: string;
  readonly idempotencyKey: string;
  readonly assistantKey: string;
  readonly content?: Readonly<Record<string, unknown>>;
  readonly openclawSessionRef?: string | null;
  readonly openclawRunRef?: string | null;
}

export interface AppendRuntimeAssistantDelta {
  readonly turnId: string;
  readonly deltaText: string;
}

export interface FinalizeRuntimeAssistantTurn {
  readonly turnId: string;
  readonly content: Readonly<Record<string, unknown>>;
  readonly openclawSessionRef?: string | null;
  readonly openclawRunRef?: string | null;
}

export interface FailRuntimeAssistantTurn {
  readonly turnId: string;
  readonly errorCode: string;
  readonly errorMessage: string;
}

export interface StartRuntimeToolOutcome extends ScopedWrite {
  readonly turnId: string;
  readonly toolName: string;
  readonly toolCallId: string;
  readonly idempotencyKey: string;
  readonly requestSummary: Readonly<Record<string, unknown>>;
  readonly targetRef?: string | null;
}

export interface FinishRuntimeToolOutcome {
  readonly turnId: string;
  readonly toolName: string;
  readonly toolCallId: string;
  readonly idempotencyKey: string;
  readonly status: "succeeded" | "failed";
  readonly requestSummary: Readonly<Record<string, unknown>>;
  readonly resultSummary: Readonly<Record<string, unknown>>;
  readonly targetRef?: string | null;
}

export interface ListTaskAssistantRuns {
  readonly taskId: string;
}

export type RuntimeConversation = AssistantConversation;
export type RuntimeTurn = AssistantTurn;
export type RuntimeToolOutcome = AssistantToolOutcome;

export type RuntimeTurnInsert =
  | { readonly kind: "inserted"; readonly turn: RuntimeTurn }
  | { readonly kind: "replayed"; readonly turn: RuntimeTurn };

export type RuntimeTurnTransition =
  | { readonly kind: "updated"; readonly turn: RuntimeTurn }
  | { readonly kind: "already-final"; readonly turn: RuntimeTurn }
  | { readonly kind: "not-found" }
  | { readonly kind: "invalid-state"; readonly turn: RuntimeTurn };

export type RuntimeToolOutcomeInsert =
  | { readonly kind: "inserted"; readonly outcome: RuntimeToolOutcome }
  | { readonly kind: "replayed"; readonly outcome: RuntimeToolOutcome };

export type RuntimeToolOutcomeTransition =
  | { readonly kind: "updated"; readonly outcome: RuntimeToolOutcome }
  | { readonly kind: "already-final"; readonly outcome: RuntimeToolOutcome }
  | { readonly kind: "not-found" }
  | { readonly kind: "invalid-state"; readonly outcome: RuntimeToolOutcome };

export interface RuntimeTaskAssistantRun {
  readonly turn: RuntimeTurn;
  readonly outcomes: readonly RuntimeToolOutcome[];
}

export interface RuntimeConversationStore {
  createConversation(scope: WorkspaceScope, input: CreateRuntimeConversation): Promise<Result<RuntimeConversation>>;
  findOpenConversation(scope: WorkspaceScope, input: FindOpenRuntimeConversation): Promise<Result<RuntimeConversation | null>>;
  listTurns(scope: WorkspaceScope, conversationId: string): Promise<Result<readonly RuntimeTurn[]>>;
  appendUserTurn(scope: WorkspaceScope, input: AppendRuntimeUserTurn): Promise<Result<RuntimeTurnInsert>>;
  queueAssistantTurn(scope: WorkspaceScope, input: QueueRuntimeAssistantTurn): Promise<Result<RuntimeTurnInsert>>;
  appendAssistantDelta(scope: WorkspaceScope, input: AppendRuntimeAssistantDelta): Promise<Result<RuntimeTurnTransition>>;
  finalizeAssistantTurn(scope: WorkspaceScope, input: FinalizeRuntimeAssistantTurn): Promise<Result<RuntimeTurnTransition>>;
  failAssistantTurn(scope: WorkspaceScope, input: FailRuntimeAssistantTurn): Promise<Result<RuntimeTurnTransition>>;
  startToolOutcome(scope: WorkspaceScope, input: StartRuntimeToolOutcome): Promise<Result<RuntimeToolOutcomeInsert>>;
  finishToolOutcome(scope: WorkspaceScope, input: FinishRuntimeToolOutcome): Promise<Result<RuntimeToolOutcomeTransition>>;
  listTaskAssistantRuns(scope: WorkspaceScope, input: ListTaskAssistantRuns): Promise<Result<readonly RuntimeTaskAssistantRun[]>>;
}
