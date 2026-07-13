import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const postgresMock = vi.hoisted(() => ({
  poolConstructors: 0,
  drizzleCalls: 0,
}));

vi.mock("pg", () => ({
  default: {
    Pool: class Pool {
      public readonly query = vi.fn();
      public readonly connectionString: string | undefined;

      public constructor(options: { readonly connectionString?: string }) {
        postgresMock.poolConstructors += 1;
        this.connectionString = options.connectionString;
      }
    },
  },
}));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: () => {
    postgresMock.drizzleCalls += 1;
    return { execute: vi.fn() };
  },
}));

describe("postgres client lazy import", () => {
  const originalDatabaseUrl = process.env["DATABASE_URL"];

  beforeEach(() => {
    vi.resetModules();
    postgresMock.poolConstructors = 0;
    postgresMock.drizzleCalls = 0;
    delete process.env["DATABASE_URL"];
  });

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env["DATABASE_URL"];
    } else {
      process.env["DATABASE_URL"] = originalDatabaseUrl;
    }
  });

  it("imports with DATABASE_URL unset without creating a pool or database", async () => {
    const client = await import("../client.js");

    expect(client.pool).toBeDefined();
    expect(client.db).toBeDefined();
    expect(postgresMock.poolConstructors).toBe(0);
    expect(postgresMock.drizzleCalls).toBe(0);
  });

  it("creates the pool only when a pool property is first accessed", async () => {
    process.env["DATABASE_URL"] = "postgres://user:pass@localhost:5432/opzava";

    const client = await import("../client.js");
    expect(postgresMock.poolConstructors).toBe(0);

    expect(client.pool.query).toBeTypeOf("function");
    expect(postgresMock.poolConstructors).toBe(1);
    expect(postgresMock.drizzleCalls).toBe(0);
    expect(client.pool.query).toBeTypeOf("function");
    expect(postgresMock.poolConstructors).toBe(1);
  });

  it("creates the database only when a db property is first accessed", async () => {
    process.env["DATABASE_URL"] = "postgres://user:pass@localhost:5432/opzava";

    const client = await import("../client.js");
    expect(postgresMock.poolConstructors).toBe(0);
    expect(postgresMock.drizzleCalls).toBe(0);

    expect(client.db.execute).toBeTypeOf("function");
    expect(postgresMock.poolConstructors).toBe(1);
    expect(postgresMock.drizzleCalls).toBe(1);
    expect(client.db.execute).toBeTypeOf("function");
    expect(postgresMock.poolConstructors).toBe(1);
    expect(postgresMock.drizzleCalls).toBe(1);
  });
});
