import { describe, expect, it } from "vitest";
import { INTEGRATIONS, CATEGORIES, type IntegrationDef } from "./registry";

describe("INTEGRATIONS registry", () => {
  it("is non-empty and every entry is well-formed against a known category", () => {
    expect(INTEGRATIONS.length).toBeGreaterThan(0);
    for (const def of INTEGRATIONS) {
      expect(def.id.length).toBeGreaterThan(0);
      expect(def.envVars.length).toBeGreaterThan(0);
      expect(CATEGORIES).toHaveProperty(def.category);
    }
  });

  it("has stable, unique ids", () => {
    const ids = INTEGRATIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("contains known anchors", () => {
    const ids = INTEGRATIONS.map((d) => d.id);
    expect(ids).toContain("anthropic");
    expect(ids).toContain("github");
    expect(ids).toContain("onepassword");
    expect(ids).toContain("gateway");
  });
});

describe("CATEGORIES", () => {
  it("labels + orders the built-in categories", () => {
    expect(CATEGORIES.ai).toEqual({ label: "AI Providers", order: 0 });
    expect(CATEGORIES.security.label).toBe("Security");
  });
});

describe("IntegrationDef type", () => {
  it("accepts the minimal required shape (optional fields omitted)", () => {
    const def: IntegrationDef = {
      id: "x",
      name: "X",
      category: "ai",
      envVars: ["X_KEY"],
    };
    expect(def.id).toBe("x");
  });
});
