import { describe, expect, it } from "vitest";

import nextConfig from "../next.config";

describe("Next redirects", () => {
  it("permanently redirects the removed Gateway detail route to Connections Overview", async () => {
    expect(nextConfig.redirects).toBeTypeOf("function");
    const redirects = await nextConfig.redirects!();

    expect(redirects).toContainEqual({
      source: "/connections/gateway",
      destination: "/connections",
      permanent: true,
    });
  });
});
