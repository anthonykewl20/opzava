const postgresProtocols = new Set(["postgres:", "postgresql:"]);

function readRequiredPostgresUrl(name: string, source: NodeJS.ProcessEnv): string {
  const value = source[name];

  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required.`);
  }

  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid Postgres connection URL.`);
  }

  if (!postgresProtocols.has(parsed.protocol)) {
    throw new Error(`${name} must use the postgres:// or postgresql:// protocol.`);
  }

  return value;
}

export function readRuntimeDatabaseUrl(source: NodeJS.ProcessEnv = process.env): string {
  return readRequiredPostgresUrl("DATABASE_URL", source);
}

export function readMigrationDatabaseUrl(source: NodeJS.ProcessEnv = process.env): string {
  return readRequiredPostgresUrl("DATABASE_MIGRATION_URL", source);
}
