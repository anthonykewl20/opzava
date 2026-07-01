import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export class MigrationGateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MigrationGateError";
  }
}

export interface MigrationManifestEntry {
  readonly path: string;
  readonly sha256: string;
}

export interface MigrationManifest {
  readonly version: 1;
  readonly migrations: ReadonlyArray<MigrationManifestEntry>;
}

export interface VerifyMigrationManifestOptions {
  readonly migrationsDir: string;
  readonly manifestPath?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseMigrationManifest(value: unknown): MigrationManifest {
  if (!isRecord(value) || value["version"] !== 1 || !Array.isArray(value["migrations"])) {
    throw new MigrationGateError("Migration manifest is invalid.");
  }

  const migrations = value["migrations"].map((entry) => {
    if (!isRecord(entry)) {
      throw new MigrationGateError("Migration manifest entry is invalid.");
    }

    const entryPath = entry["path"];
    const sha256 = entry["sha256"];

    if (typeof entryPath !== "string" || typeof sha256 !== "string") {
      throw new MigrationGateError("Migration manifest entry is invalid.");
    }

    if (
      path.isAbsolute(entryPath) ||
      path.normalize(entryPath) !== entryPath ||
      entryPath.includes("..") ||
      !entryPath.endsWith(".sql")
    ) {
      throw new MigrationGateError("Migration manifest contains an unsafe path.");
    }

    if (!/^[0-9a-f]{64}$/.test(sha256)) {
      throw new MigrationGateError("Migration manifest contains an invalid SHA-256 hash.");
    }

    return { path: entryPath, sha256 };
  });

  return { version: 1, migrations };
}

async function sha256File(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

async function listSqlFiles(migrationsDir: string): Promise<ReadonlyArray<string>> {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
}

export function forbidUnsafeMigrationCommand(args: ReadonlyArray<string>): void {
  if (args.some((arg) => arg === "push" || arg.startsWith("push:") || arg.startsWith("--force"))) {
    throw new MigrationGateError("Unsafe migration command is forbidden.");
  }
}

export async function verifyMigrationManifest(
  options: VerifyMigrationManifestOptions
): Promise<MigrationManifest> {
  const manifestPath = options.manifestPath ?? path.join(options.migrationsDir, "manifest.json");
  const manifest = parseMigrationManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  const sqlFiles = await listSqlFiles(options.migrationsDir);
  const manifestFiles = manifest.migrations.map((entry) => entry.path);

  if (sqlFiles.length !== manifestFiles.length) {
    throw new MigrationGateError("Migration manifest does not match migration directory.");
  }

  for (const sqlFile of sqlFiles) {
    if (!manifestFiles.includes(sqlFile)) {
      throw new MigrationGateError("Migration manifest is missing a migration file.");
    }
  }

  for (const entry of manifest.migrations) {
    const actualHash = await sha256File(path.join(options.migrationsDir, entry.path));

    if (actualHash !== entry.sha256) {
      throw new MigrationGateError("Migration hash drift detected.");
    }
  }

  return manifest;
}
