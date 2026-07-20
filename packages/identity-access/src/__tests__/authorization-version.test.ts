import { describe, expect, it } from "vitest";

import { authorizationVersionFrom } from "../application/authorization-version.js";

describe("authorizationVersionFrom", () => {
  it("returns the same opaque version for the same membership version", () => {
    expect(authorizationVersionFrom(7)).toBe("av:7");
    expect(authorizationVersionFrom(7)).toBe("av:7");
  });

  it("returns a different opaque version after the membership version changes", () => {
    expect(authorizationVersionFrom(7)).not.toBe(authorizationVersionFrom(8));
  });
});
