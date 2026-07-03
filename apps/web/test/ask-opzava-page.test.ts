import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  askOpzavaPromptActions,
  askOpzavaShellSummary,
  askOpzavaStatusView,
  visibleAskOpzavaTurns,
} from "../lib/ask-opzava-page-state";
import type { AskAdminTurnView } from "../lib/ask-admin-history";

function turn(overrides: Partial<AskAdminTurnView> = {}): AskAdminTurnView {
  return {
    id: "turn-1",
    role: "user",
    status: "final",
    text: "Hello",
    errorCode: null,
    errorMessage: null,
    createdAt: "2026-07-03T00:00:00.000Z",
    finalizedAt: "2026-07-03T00:00:00.000Z",
    ...overrides,
  };
}

async function readRepoFile(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Ask Opzava page state", () => {
  it("keeps prompt chips live by pairing each visible label with a concrete prompt", () => {
    expect(askOpzavaPromptActions.length).toBeGreaterThan(0);

    for (const action of askOpzavaPromptActions) {
      expect(action.label.trim()).not.toBe("");
      expect(action.prompt.trim()).not.toBe("");
      expect(action.description.trim()).not.toBe("");
    }
  });

  it("filters system turns while preserving user, assistant, and tool history", () => {
    expect(
      visibleAskOpzavaTurns([
        turn({ id: "system", role: "system", text: "hidden" }),
        turn({ id: "user", role: "user", text: "shown" }),
        turn({ id: "assistant", role: "assistant", text: "shown" }),
        turn({ id: "tool", role: "tool", text: "shown" }),
      ]).map((current) => current.id),
    ).toEqual(["user", "assistant", "tool"]);
  });

  it("reports deterministic status text for the page shell", () => {
    expect(askOpzavaStatusView("working")).toMatchObject({
      label: "Working",
      isBusy: true,
    });
    expect(askOpzavaStatusView("gateway_unavailable")).toMatchObject({
      label: "Gateway unavailable",
      isBusy: false,
    });
    expect(
      askOpzavaShellSummary({
        turnCount: 0,
        workspaceName: "Customer Support",
        status: "idle",
      }),
    ).toBe("Customer Support workspace assistant is ready; no conversation yet.");
  });

  it("wires /ask-opzava as a page route and active sidebar item", async () => {
    const page = await readRepoFile("app/(app)/ask-opzava/page.tsx");
    const nav = await readRepoFile("components/shell/admin-nav.tsx");

    expect(page).toContain("AskOpzavaChat");
    expect(page).toContain("getOrCreateAskAdminHistory");
    expect(nav).toContain('href="/ask-opzava"');
    expect(nav).toContain('pathname.startsWith("/ask-opzava")');
  });

  it("keeps the Tasks page free of the interim Ask Admin panel", async () => {
    const tasksPage = await readRepoFile("app/(app)/tasks/page.tsx");
    const tasksBoard = await readRepoFile("components/tasks/tasks-board.tsx");

    expect(tasksPage).not.toContain("getOrCreateAskAdminHistory");
    expect(tasksPage).not.toContain("askAdmin");
    expect(tasksBoard).not.toContain("AskAdminPanel");
    expect(tasksBoard).not.toContain("askAdmin");
  });
});
