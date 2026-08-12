import { expect, it } from "vitest";

import { makeOrgId, makeUserId, makeWorkspaceId } from "@opzava/shared-kernel";

import type { RuntimeConversationStore, WorkspaceScope } from "../../ports/runtime-conversation-store.js";

export interface RuntimeConversationStoreContractOptions {
  readonly createStore: () => RuntimeConversationStore;
  readonly scopeA?: WorkspaceScope;
  readonly scopeB?: WorkspaceScope;
}

const defaultScopeA: WorkspaceScope = {
  organizationId: makeOrgId("00000000-0000-4000-8000-000000000001"),
  workspaceId: makeWorkspaceId("00000000-0000-4000-8000-000000000011")
};
const defaultScopeB: WorkspaceScope = {
  organizationId: makeOrgId("00000000-0000-4000-8000-000000000002"),
  workspaceId: makeWorkspaceId("00000000-0000-4000-8000-000000000022")
};
const userId = makeUserId("contract-user");

export function runtimeConversationStoreContract(options: RuntimeConversationStoreContractOptions): void {
  const scopeA = options.scopeA ?? defaultScopeA;
  const scopeB = options.scopeB ?? defaultScopeB;

  async function conversation(store: RuntimeConversationStore, scope = scopeA) {
    const result = await store.createConversation(scope, {
      ...scope, surface: "contract", assistantKey: "assistant", createdByUserId: userId
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    return result.value;
  }

  it("round-trips conversations and deterministically ordered turns", async () => {
    const store = options.createStore();
    const created = await conversation(store);
    await store.appendUserTurn(scopeA, { ...scopeA, conversationId: created.id, actorUserId: userId, idempotencyKey: "one", content: { text: "one" } });
    await store.appendUserTurn(scopeA, { ...scopeA, conversationId: created.id, actorUserId: userId, idempotencyKey: "two", content: { text: "two" } });
    const listed = await store.listTurns(scopeA, created.id);
    expect(listed.ok && listed.value.map((turn) => turn.content["text"])).toEqual(["one", "two"]);
  });

  it("distinguishes idempotent replay and rejects conflicting replay", async () => {
    const store = options.createStore();
    const created = await conversation(store);
    const command = { ...scopeA, conversationId: created.id, actorUserId: userId, idempotencyKey: "same", content: { text: "same" } };
    expect(await store.appendUserTurn(scopeA, command)).toMatchObject({ ok: true, value: { kind: "inserted" } });
    expect(await store.appendUserTurn(scopeA, command)).toMatchObject({ ok: true, value: { kind: "replayed" } });
    expect(await store.appendUserTurn(scopeA, { ...command, content: { text: "different" } })).toMatchObject({ ok: false, error: { code: "runtimeControl.idempotencyConflict" } });
    const afterConflict = await store.listTurns(scopeA, created.id);
    expect(afterConflict.ok && afterConflict.value.map((turn) => turn.content)).toEqual([{ text: "same" }]);
  });

  it("returns explicit transition outcomes", async () => {
    const store = options.createStore();
    const created = await conversation(store);
    const queued = await store.queueAssistantTurn(scopeA, { ...scopeA, conversationId: created.id, idempotencyKey: "assistant", assistantKey: "assistant" });
    if (!queued.ok) throw queued.error;
    const turnId = queued.value.turn.id;
    expect(await store.finalizeAssistantTurn(scopeA, { turnId, content: { text: "done" } })).toMatchObject({ ok: true, value: { kind: "updated" } });
    expect(await store.finalizeAssistantTurn(scopeA, { turnId, content: { text: "done" } })).toMatchObject({ ok: true, value: { kind: "already-final" } });
    expect(await store.appendAssistantDelta(scopeA, { turnId, deltaText: "late" })).toMatchObject({ ok: true, value: { kind: "invalid-state" } });
    expect(await store.failAssistantTurn(scopeA, { turnId: "00000000-0000-4000-8000-000000000099", errorCode: "x", errorMessage: "x" })).toMatchObject({ ok: true, value: { kind: "not-found" } });
  });

  it("isolates same-tenant workspaces and rejects cross-tenant scoped writes and targeted access", async () => {
    const store = options.createStore();
    const created = await conversation(store);
    const otherWorkspace = { ...scopeA, workspaceId: makeWorkspaceId("00000000-0000-4000-8000-000000000012") };
    expect(await store.listTurns(otherWorkspace, created.id)).toMatchObject({ ok: false, error: { status: 403 } });
    expect(await store.createConversation(scopeA, { ...scopeB, surface: "x", assistantKey: "x", createdByUserId: userId })).toMatchObject({ ok: false, error: { status: 403 } });
    expect(await store.listTurns(scopeB, created.id)).toMatchObject({ ok: false, error: { status: 403 } });
  });

  it("does not expose raw query or transaction capabilities", () => {
    const store = options.createStore() as unknown as Record<string, unknown>;
    expect(store["query"]).toBeUndefined();
    expect(store["execute"]).toBeUndefined();
    expect(store["transaction"]).toBeUndefined();
  });
}
