import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { makeTenantId } from "@opzava/shared-kernel";
import { afterEach, describe, expect, it } from "vitest";

import {
  expectedLocalFileSecretReference,
  LocalFileSecretsVault,
} from "../local-file-secrets-vault.js";

const tempDirectories: string[] = [];

async function makeVault(): Promise<{
  readonly filePath: string;
  readonly vault: LocalFileSecretsVault;
}> {
  const directory = await mkdtemp(join(tmpdir(), "opzava-local-vault-"));
  tempDirectories.push(directory);

  const filePath = join(directory, "secrets.json");
  return {
    filePath,
    vault: new LocalFileSecretsVault({
      filePath,
      now: () => new Date("2026-07-02T00:00:00.000Z"),
    }),
  };
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("LocalFileSecretsVault", () => {
  it("stores a dev secret behind a ref without resolving raw secret material", async () => {
    const { filePath, vault } = await makeVault();
    const tenantId = makeTenantId(`tenant-${randomUUID()}`);
    const secretValue = `test-only-${randomUUID()}`;

    const stored = await vault.putSecret({
      tenantId,
      purpose: "openclaw",
      label: "platform-operator-device-token",
      value: secretValue,
      version: "ask-admin-opzava@2026-07-02",
    });

    expect(stored.ok).toBe(true);
    if (!stored.ok) {
      return;
    }

    expect(JSON.stringify(stored.value)).not.toContain(secretValue);
    expect(stored.value).toEqual(
      expectedLocalFileSecretReference({
        tenantId,
        purpose: "openclaw",
        label: "platform-operator-device-token",
        version: "ask-admin-opzava@2026-07-02",
      }),
    );

    const resolved = await vault.resolve({
      ref: stored.value,
      requestedBy: "bootstrap-platform-gateway",
      reason: "verify stored local OpenClaw operator device token",
    });

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) {
      return;
    }

    expect(JSON.stringify(resolved.value)).not.toContain(secretValue);
    expect(resolved.value.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
  });
});
