import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import { readRuntimeDatabaseUrl } from "./env.js";

const { Pool } = pg;

export function createPostgresPool(connectionString = readRuntimeDatabaseUrl()) {
  return new Pool({
    connectionString,
    application_name: "opzava-app"
  });
}

export function createPostgresDatabase(client: InstanceType<typeof Pool>) {
  // PgBouncer transaction pooling is part of the tenant-isolation contract:
  // runtime code must use unnamed text/parameterized queries only. When the
  // PgBouncer service is added, keep server_reset_query=DISCARD ALL and
  // max_prepared_statements=0. Do not pass a node-postgres query `name`, and do
  // not use Drizzle .prepare() APIs on this path.
  return drizzle({ client });
}

export const pool = createPostgresPool();
export const db = createPostgresDatabase(pool);
