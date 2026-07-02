import { describe, expect, it } from "vitest";

import {
  canAppendAssistantDelta,
  canFinalizeAssistantTurn,
  isTerminalAssistantTurnStatus,
  parseAssistantTurnStatus
} from "./assistant.js";

describe("assistant turn state machine", () => {
  it("allows deltas and finalization only before terminal states", () => {
    expect(canAppendAssistantDelta("queued")).toBe(true);
    expect(canAppendAssistantDelta("streaming")).toBe(true);
    expect(canAppendAssistantDelta("finalizing")).toBe(false);
    expect(canAppendAssistantDelta("final")).toBe(false);
    expect(canAppendAssistantDelta("failed")).toBe(false);

    expect(canFinalizeAssistantTurn("queued")).toBe(true);
    expect(canFinalizeAssistantTurn("streaming")).toBe(true);
    expect(canFinalizeAssistantTurn("finalizing")).toBe(false);
    expect(canFinalizeAssistantTurn("final")).toBe(false);
    expect(canFinalizeAssistantTurn("failed")).toBe(false);

    expect(isTerminalAssistantTurnStatus("final")).toBe(true);
    expect(isTerminalAssistantTurnStatus("failed")).toBe(true);
    expect(isTerminalAssistantTurnStatus("streaming")).toBe(false);
  });

  it("rejects unknown turn states", () => {
    expect(parseAssistantTurnStatus("waiting")).toMatchObject({
      ok: false,
      error: { code: "runtimeControl.invalidTurnStatus" }
    });
  });
});
