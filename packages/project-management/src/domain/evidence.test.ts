import { describe, expect, it } from "vitest";

import { parseTaskEvidenceType } from "./evidence.js";

describe("evidence domain parsers", () => {
  it("accepts valid evidence types and rejects invalid values", () => {
    expect(parseTaskEvidenceType("screenshot")).toMatchObject({
      ok: true,
      value: "screenshot",
    });
    expect(parseTaskEvidenceType("pr")).toMatchObject({ ok: true, value: "pr" });

    expect(parseTaskEvidenceType("file")).toMatchObject({
      ok: false,
      error: { code: "projectManagement.invalidTaskEvidenceType" },
    });
  });
});
