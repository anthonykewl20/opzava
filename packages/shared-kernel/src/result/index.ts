export type ErrorCode = `${string}.${string}` | string;

export interface DomainErrorOptions {
  readonly code: ErrorCode;
  readonly message: string;
  readonly cause?: unknown;
  readonly details?: Readonly<Record<string, unknown>>;
}

export class DomainError extends Error {
  public readonly code: ErrorCode;
  public readonly details: Readonly<Record<string, unknown>> | undefined;

  public constructor(options: DomainErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "DomainError";
    this.code = options.code;
    this.details = options.details;
  }
}

/** A tenant-scoped operation was denied at the persistence boundary. */
export class TenantAccessDeniedError extends DomainError {
  public readonly status = 403;

  public constructor(cause?: unknown) {
    super({
      code: "tenant.accessDenied",
      message: "Tenant access denied.",
      ...(cause === undefined ? {} : { cause })
    });
    this.name = "TenantAccessDeniedError";
  }
}

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E extends DomainError = DomainError> {
  readonly ok: false;
  readonly error: E;
}

export type Result<T, E extends DomainError = DomainError> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E extends DomainError>(error: E): Err<E> {
  return { ok: false, error };
}
