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
  assertValidTenantUuid,
  withTenant,
  type TenantQueryable,
  type TenantTransaction
} from "./postgres/tenant-context.js";
export {
  ConflictError,
  DatabaseOperationError,
  ForbiddenError,
  TenantContextMissingError,
  isPublicDatabaseError,
  mapDatabaseError
} from "./postgres/errors.js";
