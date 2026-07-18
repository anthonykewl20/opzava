import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  askOpzavaPromptActions,
  askOpzavaShellSummary,
  askOpzavaStatusView,
  formatAskOpzavaTurnTime,
  hydrationSafeAskOpzavaTimeZone,
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

  it("keeps chat timestamp text hydration-safe before switching to browser-local time", async () => {
    expect(hydrationSafeAskOpzavaTimeZone).toBe("UTC");
    expect(formatAskOpzavaTurnTime("2026-07-04T08:16:00.000Z")).toBe("8:16 AM");
    expect(formatAskOpzavaTurnTime("2026-07-04T08:16:00.000Z", "Asia/Manila")).toBe("4:16 PM");

    const component = await readRepoFile("components/ask-opzava/ask-opzava-chat.tsx");
    expect(component).toContain("useState(hydrationSafeAskOpzavaTimeZone)");
    expect(component).toContain("resolvedOptions().timeZone");
    expect(component).toContain("formatAskOpzavaTurnTime(turn.createdAt, timeZone)");
  });

  it("wires /ask-opzava as a page route and active sidebar item", async () => {
    const page = await readRepoFile("app/(app)/ask-opzava/page.tsx");
    const layout = await readRepoFile("app/(app)/layout.tsx");
    const topbar = await readRepoFile("components/shell/command-palette.tsx");
    const nav = await readRepoFile("components/shell/admin-nav.tsx");

    expect(page).toContain("AskOpzavaChat");
    expect(page).toContain("getOrCreateAskAdminHistory");
    expect(layout).toContain("TopbarRouteSearchOrBreadcrumb");
    expect(layout).toContain("AskOpzavaAgentStatus");
    expect(topbar).toContain("usePathname");
    expect(topbar).toContain('pathname.startsWith("/ask-opzava")');
    expect(topbar).toContain("gatewayReachable === true");
    expect(topbar).toContain("Ask Admin Opzava");
    expect(nav).toContain('href: "/ask-opzava"');
    expect(nav).toContain("pathname.startsWith(href)");
  });

  it("keeps the Ask Opzava chat on the shadcn transcript contract and live SSE loop", async () => {
    const component = await readRepoFile("components/ask-opzava/ask-opzava-chat.tsx");

    expect(component).toContain("MessageScrollerProvider autoScroll");
    expect(component).toContain('defaultScrollPosition="last-anchor"');
    expect(component).toContain("<MessageScrollerContent");
    expect(component).toContain("aria-busy={status.isBusy}");
    expect(component).toContain('scrollAnchor={turn.role === "user"}');
    expect(component).toContain("messageId={`ask-opzava-turn-${turn.id}`}");
    expect(component).toContain('messageId="ask-opzava-active-response"');
    expect(component).toContain("<Bubble");
    expect(component).toContain("<Message");
    expect(component).toContain("<Textarea");
    expect(component).toContain("<Accordion");
    expect(component).not.toContain("logRef");
    expect(component).not.toContain('role="log"');
    expect(component).toContain('id="composerForm"');
    expect(component).toContain('id="msgInput"');
    expect(component).toContain("event.nativeEvent.isComposing");
    expect(component).toContain('fetch("/api/tasks/ask-admin/turn"');
    expect(component).toContain("drainAskAdminStream");
    expect(component).toContain("upsertToolReceipt");
    expect(component).toContain("router.refresh()");
    expect(component).toContain("setDraft(emptyAskAdminDraft())");
    expect(component).toContain("No reply — the turn did not complete.");
    expect(component).toContain("text-muted-foreground");
    expect(component).not.toContain("Conversation states and recovery paths");
    expect(component).not.toContain('className="ops-state-panel"');
    expect(component).toContain("DESCOPE(proactive-digest)");
    expect(component).toContain("DESCOPE(inline-approval-action)");
    expect(component).toContain("DESCOPE(conversation-state-annotation)");
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
