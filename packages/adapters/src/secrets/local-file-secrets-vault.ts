import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile, chmod } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  GetSecretRefInput,
  ResolvedSecret,
  ResolveSecretInput,
  SecretRefId,
  SecretReference,
  SecretsVaultPort,
} from "@opzava/ports";
import { DomainError, err, ok, type Result, type TenantId } from "@opzava/shared-kernel";

interface StoredSecret {
  readonly id: string;
  readonly tenantId: string;
  readonly purpose: SecretReference["purpose"];
  readonly label: string;
  readonly version?: string;
  readonly value: string;
  readonly fingerprint: string;
  readonly updatedAt: string;
}

interface StoredVaultFile {
  readonly version: 1;
  readonly secrets: Record<string, StoredSecret>;
}

export interface PutLocalFileSecretInput {
  readonly tenantId: TenantId;
  readonly purpose: SecretReference["purpose"];
  readonly label: string;
  readonly value: string;
  readonly version?: string;
}

export interface LocalFileSecretsVaultOptions {
  readonly filePath: string;
  readonly now?: () => Date;
}

function vaultError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

function fingerprintSecret(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeLabel(label: string): string {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : "secret";
}

function secretId(input: GetSecretRefInput): SecretRefId {
  return `local-dev:${input.tenantId}:${input.purpose}:${normalizeLabel(input.label)}` as SecretRefId;
}

function toSecretReference(secret: StoredSecret): SecretReference {
  return {
    id: secret.id as SecretRefId,
    tenantId: secret.tenantId as TenantId,
    purpose: secret.purpose,
    label: secret.label,
    ...(secret.version === undefined ? {} : { version: secret.version }),
  };
}

function emptyVault(): StoredVaultFile {
  return {
    version: 1,
    secrets: {},
  };
}

function parseVault(raw: string): StoredVaultFile {
  const parsed = JSON.parse(raw) as Partial<StoredVaultFile>;
  if (parsed.version !== 1 || typeof parsed.secrets !== "object" || parsed.secrets === null) {
    throw vaultError(
      "adapters.localSecrets.invalidFile",
      "Local dev secrets vault file is invalid.",
    );
  }

  return {
    version: 1,
    secrets: parsed.secrets as Record<string, StoredSecret>,
  };
}

export function expectedLocalFileSecretReference(
  input: GetSecretRefInput & { readonly version?: string },
): SecretReference {
  return {
    id: secretId(input),
    tenantId: input.tenantId,
    purpose: input.purpose,
    label: input.label,
    ...(input.version === undefined ? {} : { version: input.version }),
  };
}

export class LocalFileSecretsVault implements SecretsVaultPort {
  private readonly now: () => Date;

  public constructor(private readonly options: LocalFileSecretsVaultOptions) {
    this.now = options.now ?? (() => new Date());
  }

  public async getRef(input: GetSecretRefInput): Promise<Result<SecretReference | null>> {
    const loaded = await this.readVault();
    if (!loaded.ok) {
      return loaded;
    }

    const secret = loaded.value.secrets[secretId(input)];
    return ok(secret === undefined ? null : toSecretReference(secret));
  }

  public async resolve(input: ResolveSecretInput): Promise<Result<ResolvedSecret>> {
    const loaded = await this.readVault();
    if (!loaded.ok) {
      return loaded;
    }

    const secret = loaded.value.secrets[input.ref.id];
    if (secret === undefined || secret.tenantId !== input.ref.tenantId) {
      return err(
        vaultError(
          "adapters.localSecrets.notFound",
          "Local dev secrets vault reference was not found.",
        ),
      );
    }

    return ok({
      ref: toSecretReference(secret),
      fingerprint: secret.fingerprint,
      resolvedAt: this.now(),
    });
  }

  public async putSecret(input: PutLocalFileSecretInput): Promise<Result<SecretReference>> {
    if (input.value.length === 0) {
      return err(
        vaultError(
          "adapters.localSecrets.emptySecret",
          "Local dev secret value must be non-empty.",
        ),
      );
    }

    const loaded = await this.readVault();
    if (!loaded.ok) {
      return loaded;
    }

    const ref = expectedLocalFileSecretReference(input);
    const nextVault: StoredVaultFile = {
      version: 1,
      secrets: {
        ...loaded.value.secrets,
        [ref.id]: {
          id: ref.id,
          tenantId: ref.tenantId,
          purpose: ref.purpose,
          label: ref.label,
          ...(input.version === undefined ? {} : { version: input.version }),
          value: input.value,
          fingerprint: fingerprintSecret(input.value),
          updatedAt: this.now().toISOString(),
        },
      },
    };

    const written = await this.writeVault(nextVault);
    if (!written.ok) {
      return written;
    }

    return ok(ref);
  }

  private async readVault(): Promise<Result<StoredVaultFile>> {
    try {
      await stat(this.options.filePath);
    } catch (error) {
      const code = (error as { readonly code?: unknown }).code;
      if (code === "ENOENT") {
        return ok(emptyVault());
      }

      return err(
        vaultError(
          "adapters.localSecrets.readFailed",
          "Failed to read local dev secrets vault.",
          error,
        ),
      );
    }

    try {
      return ok(parseVault(await readFile(this.options.filePath, "utf8")));
    } catch (error) {
      return err(
        vaultError(
          "adapters.localSecrets.readFailed",
          "Failed to read local dev secrets vault.",
          error,
        ),
      );
    }
  }

  private async writeVault(vault: StoredVaultFile): Promise<Result<void>> {
    const directory = dirname(this.options.filePath);
    const tempPath = `${this.options.filePath}.${process.pid}.tmp`;

    try {
      await mkdir(directory, { mode: 0o700, recursive: true });
      await writeFile(tempPath, `${JSON.stringify(vault, null, 2)}\n`, { mode: 0o600 });
      await chmod(tempPath, 0o600);
      await rename(tempPath, this.options.filePath);
      await chmod(this.options.filePath, 0o600);
      return ok(undefined);
    } catch (error) {
      return err(
        vaultError(
          "adapters.localSecrets.writeFailed",
          "Failed to write local dev secrets vault.",
          error,
        ),
      );
    }
  }
}
