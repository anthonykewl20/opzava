import "dotenv/config";

import { defineConfig } from "drizzle-kit";

const migrationDatabaseUrl = process.env["DATABASE_MIGRATION_URL"];

if (migrationDatabaseUrl === undefined || migrationDatabaseUrl.trim() === "") {
  throw new Error("DATABASE_MIGRATION_URL is required for Drizzle migrations.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: [
    "../identity-access/src/adapters/postgres/schema/index.ts",
    "../project-management/src/adapters/postgres/schema/index.ts",
    "../dev-board/src/adapters/postgres/schema/index.ts"
  ],
  out: "../identity-access/drizzle",
  dbCredentials: {
    url: migrationDatabaseUrl
  },
  verbose: true,
  strict: true
});
