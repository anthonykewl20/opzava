import { describe, expect, it } from "vitest";

import { parseAppEnv } from "../lib/env";

describe("web env schema", () => {
  it("parses required boot environment and Better Auth settings", () => {
    const env = parseAppEnv({
      APP_URL: "http://web.opzava.localhost:18088",
      BETTER_AUTH_URL: "http://web.opzava.localhost:18088",
      BETTER_AUTH_SECRET: "local-test-better-auth-secret-32-chars",
      DATABASE_URL: "",
      DATABASE_MIGRATION_URL: "",
      NODE_ENV: "development"
    });

    expect(env.APP_URL).toBe("http://web.opzava.localhost:18088");
    expect(env.BETTER_AUTH_URL).toBe("http://web.opzava.localhost:18088");
    expect(env.BETTER_AUTH_SECRET).toBe("local-test-better-auth-secret-32-chars");
    expect(env.NODE_ENV).toBe("development");
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.DATABASE_MIGRATION_URL).toBeUndefined();
  });

  it("fails fast on invalid URLs and short auth secrets", () => {
    expect(() =>
      parseAppEnv({
        APP_URL: "not-a-url",
        BETTER_AUTH_URL: "http://web.opzava.localhost:18088",
        BETTER_AUTH_SECRET: "local-test-better-auth-secret-32-chars",
        NODE_ENV: "production"
      })
    ).toThrow(/APP_URL/);

    expect(() =>
      parseAppEnv({
        APP_URL: "http://web.opzava.localhost:18088",
        BETTER_AUTH_URL: "http://web.opzava.localhost:18088",
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "short"
      })
    ).toThrow(/BETTER_AUTH_SECRET/);
  });
});
