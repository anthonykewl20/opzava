import { describe, expect, it } from "vitest";

import {
  parseAgentDispatchChannel,
  parseAgentDispatchState,
  parseAgentIdentityKind,
  parseAgentIdentityStatus,
  parseTaskRunStepState,
} from "./ai-workforce.js";

describe("AI workforce domain parsers", () => {
  it("accepts valid AI workforce enum values and rejects invalid values", () => {
    expect(parseAgentIdentityKind("orchestrator")).toMatchObject({ ok: true });
    expect(parseAgentIdentityStatus("active")).toMatchObject({ ok: true });
    expect(parseAgentDispatchChannel("local_poll")).toMatchObject({ ok: true });
    expect(parseAgentDispatchState("acked")).toMatchObject({ ok: true });
    expect(parseTaskRunStepState("failed")).toMatchObject({ ok: true });

    expect(parseAgentIdentityKind("assistant")).toMatchObject({
      ok: false,
      error: { code: "projectManagement.invalidAgentIdentityKind" },
    });
  });
});
