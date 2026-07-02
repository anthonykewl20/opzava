import { describe, expect, it } from "vitest";

import {
  applyAskAdminStreamEvent,
  askAdminStatusBadgeClassName,
  askAdminStatusLabel,
  emptyAskAdminDraft,
  interruptedAskAdminStreamEvent,
  isAskAdminTerminalStreamEvent,
} from "../lib/ask-admin-stream";

describe("Ask Admin Tasks panel stream state", () => {
  it("reports distinct terminal and sad-path status labels and badge classes", () => {
    expect(askAdminStatusLabel("gateway_unavailable")).toBe("Gateway unavailable");
    expect(askAdminStatusLabel("policy_denied")).toBe("Policy denied");
    expect(askAdminStatusLabel("duplicate_send")).toBe("Duplicate send");
    expect(askAdminStatusLabel("completed")).toBe("Completed");

    expect(askAdminStatusBadgeClassName("gateway_unavailable")).toBe("badge badge-warning");
    expect(askAdminStatusBadgeClassName("policy_denied")).toBe("badge badge-danger");
    expect(askAdminStatusBadgeClassName("duplicate_send")).toBe("badge badge-warning");
    expect(askAdminStatusBadgeClassName("completed")).toBe("badge badge-success");
  });

  it("keeps duplicate assistant finalization as a no-op in the visible draft", () => {
    const queued = applyAskAdminStreamEvent(emptyAskAdminDraft(), {
      type: "queued",
      turnId: "assistant-turn-1",
      userTurnId: "user-turn-1",
      state: "queued",
    });
    const finalized = applyAskAdminStreamEvent(queued, {
      type: "assistant.final",
      turnId: "assistant-turn-1",
      text: "Created the task.",
      state: "completed",
    });
    const duplicateFinalized = applyAskAdminStreamEvent(finalized, {
      type: "assistant.final",
      turnId: "assistant-turn-1",
      text: "Conflicting second final text.",
      state: "completed",
    });

    expect(duplicateFinalized).toEqual(finalized);
    expect(duplicateFinalized.text).toBe("Created the task.");
  });

  it("maps an interrupted non-terminal stream to gateway unavailable", () => {
    const queued = applyAskAdminStreamEvent(emptyAskAdminDraft(), {
      type: "queued",
      turnId: "assistant-turn-1",
      userTurnId: "user-turn-1",
      state: "queued",
    });
    const interrupted = interruptedAskAdminStreamEvent(queued);

    if (interrupted === null) {
      throw new Error("expected interrupted stream event");
    }

    expect(interrupted).toEqual({
      type: "failed",
      turnId: "assistant-turn-1",
      code: "webGateway.streamInterrupted",
      message: "Ask Admin Opzava stream ended before a final response.",
      state: "gateway_unavailable",
    });
    expect(isAskAdminTerminalStreamEvent(interrupted)).toBe(true);
    expect(applyAskAdminStreamEvent(queued, interrupted).status).toBe("gateway_unavailable");
  });
});
