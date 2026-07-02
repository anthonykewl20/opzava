import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import { readRuntimeDatabaseUrl } from "./env.js";

const { Pool } = pg;

type PgPool = InstanceType<typeof Pool>;

export function createPostgresPool(connectionString = readRuntimeDatabaseUrl()): PgPool {
  return new Pool({
    connectionString,
    application_name: "opzava-app"
  });
}

export function createPostgresDatabase(client: PgPool) {
  // PgBouncer transaction pooling is part of the tenant-isolation contract:
  // runtime code must use unnamed text/parameterized queries only. When the
  // PgBouncer service is added, keep server_reset_query=DISCARD ALL and
  // max_prepared_statements=0. Do not pass a node-postgres query `name`, and do
  // not use Drizzle .prepare() APIs on this path.
  return drizzle({ client });
}

type PostgresDatabase = ReturnType<typeof createPostgresDatabase>;

// Lazy singletons: importing this module must have NO side effects (no env read,
// no pool creation). The pool/db are constructed on first property access, so
// build tooling (e.g. `next build` collecting route data) can import the auth
// stack without DATABASE_URL set. The real connection happens at runtime on first
// use, when DATABASE_URL is present.
let poolSingleton: PgPool | undefined;
let dbSingleton: PostgresDatabase | undefined;

function resolvePool(): PgPool {
  poolSingleton ??= createPostgresPool();
  return poolSingleton;
}

function resolveDb(): PostgresDatabase {
  dbSingleton ??= createPostgresDatabase(resolvePool());
  return dbSingleton;
}

function lazyProxy<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get(_target, property): unknown {
      const instance = resolve();
      const value: unknown = Reflect.get(instance, property, instance);
      return typeof value === "function"
        ? (value as (...args: readonly unknown[]) => unknown).bind(instance)
        : value;
    }
  });
}

export const pool: PgPool = lazyProxy(resolvePool);
export const db: PostgresDatabase = lazyProxy(resolveDb);
