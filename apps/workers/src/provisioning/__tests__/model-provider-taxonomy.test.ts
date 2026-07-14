import { classifyModelProvider } from "@opzava/ports";
import { describe, expect, it } from "vitest";

describe("model provider taxonomy", () => {
  it("folds the Moonshot auth alias under the canonical provider", () => {
    expect(classifyModelProvider("moonshot-ai")).toMatchObject({
      category: "llm",
      parentId: "moonshot",
      runtimeLabel: null,
    });
  });

  it("preserves OpenAI as a canonical provider while folding its Codex runtime", () => {
    expect(classifyModelProvider("openai").parentId).toBeNull();
    expect(classifyModelProvider("codex").parentId).toBe("openai");
  });
});
