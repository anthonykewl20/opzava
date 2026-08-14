import { describe, expect, it } from "vitest";
import { changeRiskPolicyHash, evaluateChangeRisk } from "../domain/change-risk-policy.js";

describe("change-risk policy v1", () => {
  it("is deterministic and has a stable SHA-256 policy hash", () => {
    const input = { type: "feature" as const, workAreas: ["frontend", "security"] as const, hasActiveDependencies: false };
    expect(evaluateChangeRisk(input)).toEqual(evaluateChangeRisk({ ...input, workAreas: ["security", "frontend"] }));
    expect(changeRiskPolicyHash).toBe("71baa1a625f65fe197917d117b8572bbb54ba96e0b28ac47c15d9ec9e66a8ac4");
  });
  it.each([
    [{ type: "feature" as const, workAreas: ["documentation"] as const, hasActiveDependencies: false }, "low"],
    [{ type: "bug" as const, workAreas: ["frontend"] as const, hasActiveDependencies: false }, "medium"],
    [{ type: "feature" as const, workAreas: ["security"] as const, hasActiveDependencies: false }, "medium"],
    [{ type: "feature" as const, workAreas: ["security", "data_database"] as const, hasActiveDependencies: false }, "high"],
    [{ type: "bug" as const, workAreas: ["security"] as const, hasActiveDependencies: false }, "high"],
    [{ type: "feature" as const, workAreas: ["documentation"] as const, hasActiveDependencies: true }, "medium"],
    [{ type: "bug" as const, workAreas: ["security"] as const, hasActiveDependencies: true }, "critical"],
  ] as const)("evaluates %# to %s", (inputs, minimumChangeRisk) => {
    expect(evaluateChangeRisk(inputs).minimumChangeRisk).toBe(minimumChangeRisk);
  });
});
