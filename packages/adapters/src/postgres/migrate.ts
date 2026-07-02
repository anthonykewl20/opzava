import "dotenv/config";

// CI/deploy entrypoint only. Runtime apps must not import this file.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

import { readMigrationDatabaseUrl } from "./env.js";
import { forbidUnsafeMigrationCommand, verifyMigrationManifest } from "./migration-gate.js";

const { Pool } = pg;

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(sourceDir, "../..");
const migrationsDir = path.resolve(packageRoot, "../identity-access/drizzle");

export async function runPostgresMigrations(): Promise<void> {
  forbidUnsafeMigrationCommand(process.argv.slice(2));
  await verifyMigrationManifest({ migrationsDir });

  const ownerPool = new Pool({
    connectionString: readMigrationDatabaseUrl(),
    application_name: "opzava-migrate"
  });

  try {
    const ownerDb = drizzle({ client: ownerPool });
    await migrate(ownerDb, { migrationsFolder: migrationsDir });
  } finally {
    await ownerPool.end();
  }
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntrypoint) {
  runPostgresMigrations().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Postgres migration failed.";
    console.error(message);
    process.exitCode = 1;
  });
}
