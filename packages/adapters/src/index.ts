export { createPostgresDatabase, createPostgresPool, db, pool } from "./postgres/client.js";
export {
  assertCurrentUser,
  withAuthenticatedIdentity,
  type AuthenticatedIdentity,
  type AuthenticatedIdentityInput,
  type IdentityTransaction
} from "./postgres/identity-context.js";
export {
  assertCurrentTenant,
  assertRuntimeDatabaseRole,
  assertValidTenantUuid,
  withTenant,
  type TenantQueryable,
  type TenantTransaction
} from "./postgres/tenant-context.js";
export {
  ConflictError,
  DatabaseOperationError,
  ForbiddenError,
  RuntimeDatabaseRoleError,
  TenantContextMissingError,
  isPublicDatabaseError,
  mapDatabaseError
} from "./postgres/errors.js";

// Re-export the Drizzle `sql` tag so the BFF/server layer can build parameterized
// read queries against the adapters `db` without taking a direct drizzle-orm
// dependency (keeps the ADR-001 boundary: apps depend on @opzava/adapters).
export { sql } from "drizzle-orm";
