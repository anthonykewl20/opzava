import { describe, expect, it } from "vitest";

import { sanitizeSetupTokenCode } from "../lib/setup-token-code";

describe("sanitizeSetupTokenCode", () => {
  it("strips control characters and trailing URLs while preserving code punctuation", () => {
    const raw =
      "NU3VdvjheLTvz9GOW1waSto441Ks7I0yQBziw4OMLxVK4vhe#jnchZ7ZI5d-EUcQ3j5LC_vzytI48EeIVPCp_6h43LuQ\u0007https://claude.com/cai/oauth/authorize?code=true";

    expect(sanitizeSetupTokenCode(raw)).toBe(
      "NU3VdvjheLTvz9GOW1waSto441Ks7I0yQBziw4OMLxVK4vhe#jnchZ7ZI5d-EUcQ3j5LC_vzytI48EeIVPCp_6h43LuQ",
    );
  });

  it("returns an empty string for a pasted URL without a code", () => {
    expect(sanitizeSetupTokenCode("https://claude.com/cai/oauth/authorize?code=true")).toBe("");
  });

  it("leaves a clean code unchanged", () => {
    expect(sanitizeSetupTokenCode("oauth-code#state_123")).toBe("oauth-code#state_123");
  });

  it("trims trailing whitespace and newlines", () => {
    expect(sanitizeSetupTokenCode("oauth-code-123 \n")).toBe("oauth-code-123");
  });
});
