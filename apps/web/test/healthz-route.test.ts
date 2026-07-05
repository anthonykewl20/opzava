import { describe, expect, it } from "vitest";

import { GET } from "../app/healthz/route";

describe("web health endpoint", () => {
  it("returns a no-store process health response", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});
