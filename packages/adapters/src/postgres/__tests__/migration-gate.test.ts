import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import {
  MigrationGateError,
  forbidUnsafeMigrationCommand,
  verifyMigrationManifest,
} from "../migration-gate.js";

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function createMigrationsDir(name: string): Promise<string> {
  const dir = path.join(tmpdir(), `opzava-migration-gate-${process.pid}-${name}-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function writeManifest(
  migrationsDir: string,
  migrations: ReadonlyArray<{ readonly path: string; readonly content: string }>,
): Promise<void> {
  await writeFile(
    path.join(migrationsDir, "manifest.json"),
    JSON.stringify({
      version: 1,
      migrations: migrations.map((migration) => ({
        path: migration.path,
        sha256: sha256(migration.content),
      })),
    }),
  );
}

describe("forbidUnsafeMigrationCommand", () => {
  it("allows argv the gate does not scope to (only push and --force are forbidden)", () => {
    expect(() => forbidUnsafeMigrationCommand(["generate"])).not.toThrow();
    expect(() => forbidUnsafeMigrationCommand(["migrate"])).not.toThrow();
    expect(() => forbidUnsafeMigrationCommand(["check", "--config", "drizzle.config.ts"])).not.toThrow();
    // The gate targets drizzle-kit invocations. Argv like drop/truncate are not
    // drizzle-kit commands, so they are intentionally allowed here, not pushed through this guard.
    expect(() => forbidUnsafeMigrationCommand(["drop"])).not.toThrow();
    expect(() => forbidUnsafeMigrationCommand(["truncate"])).not.toThrow();
  });

  it.each([
    [["push"]],
    [["push:pg"]],
    [["migrate", "--force"]],
    [["--force-reset"]],
  ])("rejects unsafe migration command args %j", (args) => {
    expect(() => forbidUnsafeMigrationCommand(args)).toThrow(MigrationGateError);
    expect(() => forbidUnsafeMigrationCommand(args)).toThrow("Unsafe migration command is forbidden.");
  });
});

describe("verifyMigrationManifest", () => {
  it("returns a valid manifest when SQL files match their recorded hashes", async () => {
    const migrationsDir = await createMigrationsDir("valid");
    const migration = {
      path: "0001_create_accounts.sql",
      content: "create table accounts (id uuid primary key);\n",
    };
    await writeFile(path.join(migrationsDir, migration.path), migration.content);
    await writeManifest(migrationsDir, [migration]);

    await expect(verifyMigrationManifest({ migrationsDir })).resolves.toEqual({
      version: 1,
      migrations: [{ path: migration.path, sha256: sha256(migration.content) }],
    });
  });

  it("catches hash drift", async () => {
    const migrationsDir = await createMigrationsDir("drift");
    const migration = {
      path: "0001_create_accounts.sql",
      content: "create table accounts (id uuid primary key);\n",
    };
    await writeFile(path.join(migrationsDir, migration.path), "drop table accounts;\n");
    await writeManifest(migrationsDir, [migration]);

    await expect(verifyMigrationManifest({ migrationsDir })).rejects.toThrow(
      "Migration hash drift detected.",
    );
  });

  it("catches missing manifest entries for SQL files", async () => {
    const migrationsDir = await createMigrationsDir("missing-entry");
    const migration = {
      path: "0001_create_accounts.sql",
      content: "create table accounts (id uuid primary key);\n",
    };
    await writeFile(path.join(migrationsDir, migration.path), migration.content);
    await writeFile(path.join(migrationsDir, "0002_create_workspaces.sql"), "create table workspaces (id uuid);\n");
    await writeManifest(migrationsDir, [migration]);

    await expect(verifyMigrationManifest({ migrationsDir })).rejects.toThrow(
      "Migration manifest does not match migration directory.",
    );
  });

  it("rejects gated manifest commands through unsafe migration paths", async () => {
    const migrationsDir = await createMigrationsDir("unsafe-path");
    await writeFile(
      path.join(migrationsDir, "manifest.json"),
      JSON.stringify({
        version: 1,
        migrations: [{ path: "../drop.sql", sha256: sha256("drop table accounts;\n") }],
      }),
    );

    await expect(verifyMigrationManifest({ migrationsDir })).rejects.toThrow(
      "Migration manifest contains an unsafe path.",
    );
  });
});
