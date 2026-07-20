import { describe, expect, it } from "vitest";

import { normalizeThemePreference, resolveThemePreference } from "../components/shell/theme-toggle";

describe("Admin shell appearance preference", () => {
  it("supports light, dark, and system without treating legacy theme values as system", () => {
    expect(resolveThemePreference("light", true, "calm")).toBe("calm");
    expect(resolveThemePreference("dark", false, "calm")).toBe("dark");
    expect(resolveThemePreference("system", true, "calm")).toBe("dark");
    expect(resolveThemePreference("system", false, "calm")).toBe("calm");
    expect(normalizeThemePreference("hc")).toBe("dark");
    expect(normalizeThemePreference("calm")).toBe("light");
    expect(normalizeThemePreference("unexpected")).toBe("system");
  });
});
