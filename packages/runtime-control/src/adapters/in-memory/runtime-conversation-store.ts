import { randomUUID } from "node:crypto";

import {
  DomainError,
  TenantAccessDeniedError,
  err,
  ok,
  type Result
} from "@opzava/shared-kernel";

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
} from "../../ports/runtime-conversation-store.js";

function failure(code: string, message: string): DomainError {
  return new DomainError({ code, message });
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function sameJson(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function inScope(record: { organizationId: string; workspaceId: string }, scope: WorkspaceScope): boolean {
  return record.organizationId === scope.organizationId && record.workspaceId === scope.workspaceId;
}

function assertScopedWrite(scope: WorkspaceScope, input: { organizationId: string; workspaceId: string }): Result<void> {
  return inScope(input, scope) ? ok(undefined) : err(new TenantAccessDeniedError());
}

export class InMemoryRuntimeConversationStore implements RuntimeConversationStore {
  private readonly conversations = new Map<string, RuntimeConversation>();
  private readonly turns = new Map<string, RuntimeTurn>();
  private readonly outcomes = new Map<string, RuntimeToolOutcome>();
  private sequence = 0;

  private now(): Date {
    this.sequence += 1;
    return new Date(this.sequence);
  }

  private targeted<T extends { organizationId: string; workspaceId: string }>(
    records: Map<string, T>, id: string, scope: WorkspaceScope
  ): Result<T | null> {
    const record = records.get(id);
    if (record === undefined) return ok(null);
    return inScope(record, scope) ? ok(record) : err(new TenantAccessDeniedError());
  }

  public async createConversation(scope: WorkspaceScope, input: CreateRuntimeConversation): Promise<Result<RuntimeConversation>> {
    const scoped = assertScopedWrite(scope, input);
    if (!scoped.ok) return scoped;
    const now = this.now();
    const conversation: RuntimeConversation = {
      id: randomUUID(), organizationId: scope.organizationId, workspaceId: scope.workspaceId,
      surface: input.surface, assistantKey: input.assistantKey, status: "open",
      createdByUserId: input.createdByUserId, createdAt: now, updatedAt: now
    };
    this.conversations.set(conversation.id, conversation);
    return ok(conversation);
  }

  public async findOpenConversation(scope: WorkspaceScope, input: FindOpenRuntimeConversation): Promise<Result<RuntimeConversation | null>> {
    const matches = [...this.conversations.values()].filter((record) => inScope(record, scope) && record.status === "open" && record.surface === input.surface && record.assistantKey === input.assistantKey && record.createdByUserId === input.createdByUserId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    return ok(matches[0] ?? null);
  }

  public async listTurns(scope: WorkspaceScope, conversationId: string): Promise<Result<readonly RuntimeTurn[]>> {
    const conversation = this.targeted(this.conversations, conversationId, scope);
    if (!conversation.ok) return conversation;
    if (conversation.value === null) return ok([]);
    return ok([...this.turns.values()].filter((turn) => inScope(turn, scope) && turn.conversationId === conversationId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)));
  }

  private conversationForWrite(scope: WorkspaceScope, conversationId: string): Result<RuntimeConversation> {
    const found = this.targeted(this.conversations, conversationId, scope);
    if (!found.ok) return found;
    return found.value === null ? err(failure("runtimeControl.conversationNotFound", "Assistant conversation was not found.")) : ok(found.value);
  }

  public async appendUserTurn(scope: WorkspaceScope, input: AppendRuntimeUserTurn): Promise<Result<RuntimeTurnInsert>> {
    const scoped = assertScopedWrite(scope, input);
    if (!scoped.ok) return scoped;
    const conversation = this.conversationForWrite(scope, input.conversationId);
    if (!conversation.ok) return conversation;
    const existing = [...this.turns.values()].find((turn) => turn.organizationId === scope.organizationId && turn.conversationId === input.conversationId && turn.idempotencyKey === input.idempotencyKey);
    if (existing !== undefined) {
      return existing.role === "user" && existing.actorUserId === input.actorUserId && sameJson(existing.content, input.content)
        ? ok({ kind: "replayed", turn: existing })
        : err(failure("runtimeControl.idempotencyConflict", "Idempotency key was reused with a different assistant turn payload."));
    }
    const now = this.now();
    const turn: RuntimeTurn = { id: randomUUID(), conversationId: input.conversationId, organizationId: scope.organizationId, workspaceId: scope.workspaceId, role: "user", status: "final", actorUserId: input.actorUserId, assistantKey: null, content: input.content, idempotencyKey: input.idempotencyKey, openclawSessionRef: null, openclawRunRef: null, createdAt: now, updatedAt: now, finalizedAt: now };
    this.turns.set(turn.id, turn);
    return ok({ kind: "inserted", turn });
  }

  public async queueAssistantTurn(scope: WorkspaceScope, input: QueueRuntimeAssistantTurn): Promise<Result<RuntimeTurnInsert>> {
    const scoped = assertScopedWrite(scope, input);
    if (!scoped.ok) return scoped;
    const conversation = this.conversationForWrite(scope, input.conversationId);
    if (!conversation.ok) return conversation;
    const content = input.content ?? {};
    const existing = [...this.turns.values()].find((turn) => turn.organizationId === scope.organizationId && turn.conversationId === input.conversationId && turn.idempotencyKey === input.idempotencyKey);
    if (existing !== undefined) {
      return existing.role === "assistant" && existing.assistantKey === input.assistantKey && sameJson(existing.content, content)
        ? ok({ kind: "replayed", turn: existing })
        : err(failure("runtimeControl.idempotencyConflict", "Idempotency key was reused with a different assistant turn payload."));
    }
    const now = this.now();
    const turn: RuntimeTurn = { id: randomUUID(), conversationId: input.conversationId, organizationId: scope.organizationId, workspaceId: scope.workspaceId, role: "assistant", status: "queued", actorUserId: null, assistantKey: input.assistantKey, content, idempotencyKey: input.idempotencyKey, openclawSessionRef: input.openclawSessionRef ?? null, openclawRunRef: input.openclawRunRef ?? null, createdAt: now, updatedAt: now, finalizedAt: null };
    this.turns.set(turn.id, turn);
    return ok({ kind: "inserted", turn });
  }

  private turnForTransition(scope: WorkspaceScope, turnId: string): Result<RuntimeTurn | null> {
    return this.targeted(this.turns, turnId, scope);
  }

  public async appendAssistantDelta(scope: WorkspaceScope, input: AppendRuntimeAssistantDelta): Promise<Result<RuntimeTurnTransition>> {
    const found = this.turnForTransition(scope, input.turnId);
    if (!found.ok) return found;
    if (found.value === null) return ok({ kind: "not-found" });
    const current = found.value;
    if (current.role !== "assistant" || (current.status !== "queued" && current.status !== "streaming")) return ok({ kind: "invalid-state", turn: current });
    const text = typeof current.content["text"] === "string" ? current.content["text"] : "";
    const deltas = Array.isArray(current.content["deltas"]) ? current.content["deltas"].map(String) : [];
    const turn: RuntimeTurn = { ...current, status: "streaming", content: { ...current.content, text: `${text}${input.deltaText}`, deltas: [...deltas, input.deltaText] }, updatedAt: this.now() };
    this.turns.set(turn.id, turn);
    return ok({ kind: "updated", turn });
  }

  public async finalizeAssistantTurn(scope: WorkspaceScope, input: FinalizeRuntimeAssistantTurn): Promise<Result<RuntimeTurnTransition>> {
    const found = this.turnForTransition(scope, input.turnId);
    if (!found.ok) return found;
    if (found.value === null) return ok({ kind: "not-found" });
    const current = found.value;
    if (current.role === "assistant" && current.status === "final") return ok({ kind: "already-final", turn: current });
    if (current.role !== "assistant" || (current.status !== "queued" && current.status !== "streaming")) return ok({ kind: "invalid-state", turn: current });
    const now = this.now();
    const turn: RuntimeTurn = { ...current, status: "final", content: input.content, openclawSessionRef: input.openclawSessionRef ?? null, openclawRunRef: input.openclawRunRef ?? null, finalizedAt: now, updatedAt: now };
    this.turns.set(turn.id, turn);
    return ok({ kind: "updated", turn });
  }

  public async failAssistantTurn(scope: WorkspaceScope, input: FailRuntimeAssistantTurn): Promise<Result<RuntimeTurnTransition>> {
    const found = this.turnForTransition(scope, input.turnId);
    if (!found.ok) return found;
    if (found.value === null) return ok({ kind: "not-found" });
    const current = found.value;
    if (current.role === "assistant" && current.status === "failed") return ok({ kind: "already-final", turn: current });
    if (current.role !== "assistant" || !["queued", "streaming", "finalizing"].includes(current.status)) return ok({ kind: "invalid-state", turn: current });
    const now = this.now();
    const turn: RuntimeTurn = { ...current, status: "failed", content: { error: { code: input.errorCode, message: input.errorMessage } }, finalizedAt: now, updatedAt: now };
    this.turns.set(turn.id, turn);
    return ok({ kind: "updated", turn });
  }

  public async startToolOutcome(scope: WorkspaceScope, input: StartRuntimeToolOutcome): Promise<Result<RuntimeToolOutcomeInsert>> {
    const scoped = assertScopedWrite(scope, input);
    if (!scoped.ok) return scoped;
    const turn = this.targeted(this.turns, input.turnId, scope);
    if (!turn.ok) return turn;
    if (turn.value === null) return err(failure("runtimeControl.turnNotFound", "Assistant turn was not found."));
    if (turn.value.role !== "assistant") return err(failure("runtimeControl.invalidToolOutcomeTurn", "Tool outcome receipts must bind to an assistant turn."));
    const existing = [...this.outcomes.values()].find((outcome) => outcome.turnId === input.turnId && outcome.toolCallId === input.toolCallId);
    if (existing !== undefined) {
      return existing.toolName === input.toolName && existing.idempotencyKey === input.idempotencyKey && sameJson(existing.requestSummary, input.requestSummary) && (input.targetRef === undefined || input.targetRef === existing.targetRef)
        ? ok({ kind: "replayed", outcome: existing })
        : err(failure("runtimeControl.toolOutcomeConflict", "Tool call id was reused with a different payload."));
    }
    const now = this.now();
    const outcome: RuntimeToolOutcome = { id: randomUUID(), organizationId: scope.organizationId, workspaceId: scope.workspaceId, turnId: input.turnId, toolName: input.toolName, toolCallId: input.toolCallId, idempotencyKey: input.idempotencyKey, status: "started", requestSummary: input.requestSummary, resultSummary: {}, targetRef: input.targetRef ?? null, createdAt: now, updatedAt: now, completedAt: null };
    this.outcomes.set(outcome.id, outcome);
    return ok({ kind: "inserted", outcome });
  }

  public async finishToolOutcome(scope: WorkspaceScope, input: FinishRuntimeToolOutcome): Promise<Result<RuntimeToolOutcomeTransition>> {
    const existing = [...this.outcomes.values()].find((outcome) => outcome.turnId === input.turnId && outcome.toolCallId === input.toolCallId);
    if (existing === undefined) return ok({ kind: "not-found" });
    if (!inScope(existing, scope)) return err(new TenantAccessDeniedError());
    if (existing.toolName !== input.toolName || existing.idempotencyKey !== input.idempotencyKey || !sameJson(existing.requestSummary, input.requestSummary)) return err(failure("runtimeControl.toolOutcomeConflict", "Tool call id was reused with a different payload."));
    if (existing.status !== "started") return existing.status === input.status && sameJson(existing.resultSummary, input.resultSummary) ? ok({ kind: "already-final", outcome: existing }) : ok({ kind: "invalid-state", outcome: existing });
    const now = this.now();
    const outcome: RuntimeToolOutcome = { ...existing, status: input.status, resultSummary: input.resultSummary, targetRef: input.targetRef ?? existing.targetRef, completedAt: now, updatedAt: now };
    this.outcomes.set(outcome.id, outcome);
    return ok({ kind: "updated", outcome });
  }

  public async listTaskAssistantRuns(scope: WorkspaceScope, input: ListTaskAssistantRuns): Promise<Result<readonly RuntimeTaskAssistantRun[]>> {
    const turns = [...this.turns.values()].filter((turn) => inScope(turn, scope) && turn.role === "assistant").filter((turn) => JSON.stringify(turn.content).includes(input.taskId) || [...this.outcomes.values()].some((outcome) => inScope(outcome, scope) && outcome.turnId === turn.id && outcome.targetRef === input.taskId)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    return ok(turns.map((turn) => ({ turn, outcomes: [...this.outcomes.values()].filter((outcome) => inScope(outcome, scope) && outcome.turnId === turn.id).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)) })));
  }
}
