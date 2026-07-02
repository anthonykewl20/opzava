const forbiddenSqlStates = new Set(["42501", "23503"]);
const conflictSqlStates = new Set(["23502", "23505", "23514", "23P01"]);

export class ForbiddenError extends Error {
  public readonly status = 403;
  // Typed as string (not the inferred literal) so subclasses can override it.
  public readonly code: string = "postgres.forbidden";

  public constructor() {
    super("Forbidden");
    this.name = "ForbiddenError";
  }
}

export class TenantContextMissingError extends ForbiddenError {
  public override readonly code = "postgres.tenantContextMissing";

  public constructor() {
    super();
    this.name = "TenantContextMissingError";
  }
}

export class ConflictError extends Error {
  public readonly status = 409;
  public readonly code = "postgres.conflict";

  public constructor() {
    super("Conflict");
    this.name = "ConflictError";
  }
}

export class DatabaseOperationError extends Error {
  public readonly status = 500;
  public readonly code = "postgres.databaseOperationFailed";

  public constructor() {
    super("Database operation failed");
    this.name = "DatabaseOperationError";
  }
}

export type PublicDatabaseError =
  | ForbiddenError
  | TenantContextMissingError
  | ConflictError
  | DatabaseOperationError;

const sqlStatePattern = /^[0-9A-Z]{5}$/;

// Drizzle wraps the underlying driver error, so the Postgres SQLSTATE may live on
// the thrown error itself or anywhere on its `.cause` chain. Walk a bounded depth
// to find the first SQLSTATE-shaped code.
function findSqlState(error: unknown, depth = 0): string | undefined {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return undefined;
  }

  const code = (error as { readonly code?: unknown }).code;
  if (typeof code === "string" && sqlStatePattern.test(code)) {
    return code;
  }

  return findSqlState((error as { readonly cause?: unknown }).cause, depth + 1);
}

export function isPublicDatabaseError(error: unknown): error is PublicDatabaseError {
  return (
    error instanceof ForbiddenError ||
    error instanceof TenantContextMissingError ||
    error instanceof ConflictError ||
    error instanceof DatabaseOperationError
  );
}

export function mapDatabaseError(error: unknown): Error {
  if (isPublicDatabaseError(error)) {
    return error;
  }

  const sqlState = findSqlState(error);
  if (sqlState === undefined) {
    return error instanceof Error ? error : new DatabaseOperationError();
  }

  if (forbiddenSqlStates.has(sqlState)) {
    return new ForbiddenError();
  }

  if (conflictSqlStates.has(sqlState) || sqlState.startsWith("23")) {
    return new ConflictError();
  }

  return new DatabaseOperationError();
}
