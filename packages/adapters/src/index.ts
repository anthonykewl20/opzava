export { createPostgresDatabase, createPostgresPool, db, pool } from "./postgres/client.js";
export {
  GitHubIssueTrackerAdapter,
  type GitHubIssueTrackerAdapterOptions,
} from "./github/issues.js";
export {
  InMemoryObjectStore,
  type InMemoryObjectStoreOptions,
} from "./object-store/in-memory-object-store.js";
export {
  S3ObjectStoreAdapter,
  type S3ObjectStoreAdapterOptions,
} from "./object-store/s3-object-store.js";
export {
  assertCurrentUser,
  withAuthenticatedIdentity,
  type AuthenticatedIdentity,
  type AuthenticatedIdentityInput,
  type IdentityTransaction,
} from "./postgres/identity-context.js";
export {
  assertCurrentTenant,
  assertRuntimeDatabaseRole,
  assertValidTenantUuid,
  withTenant,
  type TenantQueryable,
  type TenantTransaction,
} from "./postgres/tenant-context.js";
export {
  ConflictError,
  DatabaseOperationError,
  ForbiddenError,
  RuntimeDatabaseRoleError,
  TenantContextMissingError,
  isPublicDatabaseError,
  mapDatabaseError,
} from "./postgres/errors.js";

// Re-export the Drizzle `sql` tag so the BFF/server layer can build parameterized
// read queries against the adapters `db` without taking a direct drizzle-orm
// dependency (keeps the ADR-001 boundary: apps depend on @opzava/adapters).
export { sql } from "drizzle-orm";

export {
  expectedLocalFileSecretReference,
  LocalFileSecretsVault,
  type DeleteLocalFileSecretInput,
  type LocalFileSecretsVaultOptions,
  type PutLocalFileSecretInput,
} from "./secrets/local-file-secrets-vault.js";
