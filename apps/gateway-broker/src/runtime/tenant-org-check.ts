import { createPostgresDatabase, createPostgresPool, sql } from "@opzava/adapters";
import { DomainError, err, ok, type Result, type TenantId } from "@opzava/shared-kernel";

/**
 * Boot-time guard for #199: a stale `OPENCLAW_GATEWAY_TENANT_ID` (env) vs the
 * seeded Opzava org used to surface only at runtime as an opaque
 * `gatewayBroker.tenantMismatch` deny (#188 cross-check, which must stay intact).
 * Resolving the configured tenant against the seeded org at boot turns that into a
 * loud, actionable startup failure instead of "boots fine, denies every request."
 *
 * The seeded org is read from the `first_owner_setup` singleton — it carries the
 * canonical org id, is granted `select` to `opzava_app`, and has NO row-level
 * security, so the broker's app-role connection can read it without a user context.
 * It never needs to (and cannot, under RLS) read the `organizations` table directly.
 */
export interface TenantOrgLookup {
  resolveSeededOrgId(): Promise<string | undefined>;
}

export interface TenantOrgVerification {
  readonly configuredTenantId: TenantId;
  readonly seededOrgId: string;
}

function tenantOrgError(
  code:
    | "gatewayBroker.tenantOrgUnresolved"
    | "gatewayBroker.tenantOrgMismatch"
    | "gatewayBroker.tenantOrgLookupFailed",
  message: string,
  details?: Readonly<Record<string, unknown>>,
  cause?: unknown,
): DomainError {
  return new DomainError({
    code,
    message,
    ...(details === undefined ? {} : { details }),
    ...(cause === undefined ? {} : { cause }),
  });
}

function sameOrgId(configuredTenantId: TenantId, seededOrgId: string): boolean {
  return configuredTenantId.toLowerCase() === seededOrgId.toLowerCase();
}

/**
 * Verifies the configured gateway tenant resolves to the seeded Opzava org.
 * Returns `ok` only when the configured tenant id equals the seeded org id; every
 * other case fails closed with both ids preserved in `error.details` (server-side
 * diagnosis only — this error is thrown before the broker listens and is never
 * surfaced to the browser).
 */
export async function verifyGatewayBrokerTenantOrg(
  configuredTenantId: TenantId,
  lookup: TenantOrgLookup,
): Promise<Result<TenantOrgVerification>> {
  let seededOrgId: string | undefined;
  try {
    seededOrgId = await lookup.resolveSeededOrgId();
  } catch (error) {
    return err(
      tenantOrgError(
        "gatewayBroker.tenantOrgLookupFailed",
        "Could not read the seeded Opzava organization during gateway-broker boot.",
        { configuredTenantId },
        error,
      ),
    );
  }

  if (seededOrgId === undefined) {
    return err(
      tenantOrgError(
        "gatewayBroker.tenantOrgUnresolved",
        "OPENCLAW_GATEWAY_TENANT_ID does not resolve to a seeded Opzava organization. " +
          "No organization was found in first_owner_setup; complete first-owner setup " +
          "and restart the gateway-broker.",
        { configuredTenantId },
      ),
    );
  }

  if (!sameOrgId(configuredTenantId, seededOrgId)) {
    // Both ids stay in broker-side detail only; the browser never sees them.
    return err(
      tenantOrgError(
        "gatewayBroker.tenantOrgMismatch",
        `OPENCLAW_GATEWAY_TENANT_ID does not match the seeded Opzava organization ` +
          `(env/seed drift). Set OPENCLAW_GATEWAY_TENANT_ID=${seededOrgId} and restart.`,
        { configuredTenantId, seededOrgId },
      ),
    );
  }

  return ok({ configuredTenantId, seededOrgId });
}

function rowsFromExecuteResult(result: unknown): ReadonlyArray<Record<string, unknown>> {
  if (Array.isArray(result)) {
    return result as ReadonlyArray<Record<string, unknown>>;
  }

  if (typeof result !== "object" || result === null || !("rows" in result)) {
    return [];
  }

  const rows = (result as { readonly rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as ReadonlyArray<Record<string, unknown>>) : [];
}

/**
 * Reads the seeded org id from `first_owner_setup` over a short-lived app-role
 * pool that is closed in `finally`, so the broker holds no persistent database
 * connection outside this one-shot boot check.
 */
export async function readSeededOrgIdFromPostgres(
  databaseUrl: string,
): Promise<string | undefined> {
  const pool = createPostgresPool(databaseUrl);
  try {
    const database = createPostgresDatabase(pool);
    const result = await database.execute(
      sql`select organization_id from public.first_owner_setup limit 1`,
    );
    const row = rowsFromExecuteResult(result)[0];
    const organizationId = row?.["organization_id"];
    return typeof organizationId === "string" && organizationId.trim() !== ""
      ? organizationId
      : undefined;
  } finally {
    await pool.end();
  }
}

export function createPostgresTenantOrgLookup(databaseUrl: string): TenantOrgLookup {
  return {
    resolveSeededOrgId: () => readSeededOrgIdFromPostgres(databaseUrl),
  };
}
