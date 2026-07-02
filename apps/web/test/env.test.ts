import { describe, expect, it } from "vitest";

import { readBrokerInternalEnv } from "../lib/broker-internal-env";
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

  it("parses broker internal settings lazily for runtime request handling", () => {
    const brokerEnv = readBrokerInternalEnv({
      NODE_ENV: "development",
      BROKER_INTERNAL_URL: "http://gateway-broker.opzava.localhost:19088",
      BROKER_INTERNAL_TOKEN: "local-test-broker-internal-token-32"
    });

    expect(brokerEnv.BROKER_INTERNAL_URL).toBe(
      "http://gateway-broker.opzava.localhost:19088"
    );
    expect(brokerEnv.BROKER_INTERNAL_TOKEN).toBe("local-test-broker-internal-token-32");
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

    expect(() =>
      readBrokerInternalEnv({
        NODE_ENV: "development",
        BROKER_INTERNAL_URL: "not-a-url",
        BROKER_INTERNAL_TOKEN: "local-test-broker-internal-token-32"
      })
    ).toThrow(/BROKER_INTERNAL_URL/);

    expect(() =>
      readBrokerInternalEnv({
        NODE_ENV: "development",
        BROKER_INTERNAL_URL: "http://gateway-broker.opzava.localhost:19088",
        BROKER_INTERNAL_TOKEN: "short"
      })
    ).toThrow(/BROKER_INTERNAL_TOKEN/);
  });
});
