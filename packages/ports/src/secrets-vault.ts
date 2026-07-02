import type { TenantId } from "@opzava/shared-kernel";
import type { Result } from "@opzava/shared-kernel";

export type SecretRefId = string & { readonly __secretRefId: "SecretRefId" };

export interface SecretReference {
  readonly id: SecretRefId;
  readonly tenantId: TenantId;
  readonly purpose: "database" | "auth" | "openclaw" | "provider" | "tls" | "docker";
  readonly label: string;
  readonly version?: string;
}

export interface GetSecretRefInput {
  readonly tenantId: TenantId;
  readonly purpose: SecretReference["purpose"];
  readonly label: string;
}

export interface ResolveSecretInput {
  readonly ref: SecretReference;
  readonly requestedBy: string;
  readonly reason: string;
}

export interface ResolvedSecret {
  readonly ref: SecretReference;
  readonly fingerprint: string;
  readonly resolvedAt: Date;
  readonly expiresAt?: Date;
}

export interface SecretsVaultPort {
  getRef(input: GetSecretRefInput): Promise<Result<SecretReference | null>>;
  resolve(input: ResolveSecretInput): Promise<Result<ResolvedSecret>>;
}
