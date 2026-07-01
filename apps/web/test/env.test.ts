import { describe, expect, it } from "vitest";

import { parseAppEnv } from "../lib/env";

describe("web env schema", () => {
  it("parses required boot environment and leaves future runtime secrets optional", () => {
    const env = parseAppEnv({
      APP_URL: "http://web.opzava.localhost:18088",
      DATABASE_URL: "",
      DATABASE_MIGRATION_URL: "",
      NODE_ENV: "development",
      BETTER_AUTH_SECRET: ""
    });

    expect(env.APP_URL).toBe("http://web.opzava.localhost:18088");
    expect(env.NODE_ENV).toBe("development");
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.DATABASE_MIGRATION_URL).toBeUndefined();
    expect(env.BETTER_AUTH_SECRET).toBeUndefined();
  });

  it("fails fast on invalid URLs and short future auth secrets", () => {
    expect(() =>
      parseAppEnv({
        APP_URL: "not-a-url",
        NODE_ENV: "production"
      })
    ).toThrow(/APP_URL/);

    expect(() =>
      parseAppEnv({
        APP_URL: "http://web.opzava.localhost:18088",
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "short"
      })
    ).toThrow(/BETTER_AUTH_SECRET/);
  });
});
