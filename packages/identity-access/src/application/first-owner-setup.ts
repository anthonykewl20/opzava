import { assertCurrentTenant, db, mapDatabaseError } from "@opzava/adapters";
import type { AuthPort, AuthSession, MfaChallenge } from "@opzava/ports";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { authPort as defaultAuthPort } from "../adapters/better-auth/auth-port-adapter.js";
import { hashPassword } from "../adapters/better-auth/password-hasher.js";
import { credentialProviderId, normalizeEmail } from "../adapters/better-auth/session-principal.js";

type RootDatabase = typeof db;

export interface FirstOwnerSetupInput {
  readonly ownerName: string;
  readonly ownerEmail: string;
  readonly ownerPassword: string;
  readonly organizationName: string;
  readonly workspaceName: string;
  readonly timezone: string;
  readonly idempotencyKey?: string;
}

export type FirstOwnerSetupStatus =
  | "created"
  | "created-sign-in-required"
  | "already-set-up";

export interface FirstOwnerSetupResult {
  readonly status: FirstOwnerSetupStatus;
  readonly organizationId?: string;
  readonly workspaceId?: string;
  readonly ownerUserId?: string;
  readonly session?: AuthSession;
}

export type FirstOwnerSetupFaultPoint = "after-auth-user-insert";

export interface FirstOwnerSetupServiceOptions {
  readonly database?: RootDatabase;
  readonly authPort?: AuthPort;
  readonly fault?: (point: FirstOwnerSetupFaultPoint) => Promise<void> | void;
}

interface CreatedSetupRows {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly ownerUserId: string;
  readonly setupAttemptId: string;
}

function slugify(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug === "" ? fallback : slug;
}

function firstOwnerError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause })
  });
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

function validateInput(input: FirstOwnerSetupInput): Result<void> {
  if (input.ownerName.trim() === "") {
    return err(
      firstOwnerError("identityAccess.firstOwnerOwnerNameRequired", "Owner name is required.")
    );
  }

  if (normalizeEmail(input.ownerEmail) === "") {
    return err(firstOwnerError("identityAccess.firstOwnerEmailRequired", "Owner email is required."));
  }

  if (input.ownerPassword.length < 12) {
    return err(
      firstOwnerError(
        "identityAccess.firstOwnerPasswordTooShort",
        "Owner password must be at least 12 characters."
      )
    );
  }

  // Domain-level policy so a direct FirstOwnerSetupService caller cannot bypass
  // the stronger UI contract: require at least three character classes.
  const passwordClasses = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) =>
    pattern.test(input.ownerPassword)
  ).length;
  if (passwordClasses < 3) {
    return err(
      firstOwnerError(
        "identityAccess.firstOwnerPasswordTooWeak",
        "Owner password must include at least three of: lowercase, uppercase, number, symbol."
      )
    );
  }

  if (input.organizationName.trim() === "") {
    return err(
      firstOwnerError(
        "identityAccess.firstOwnerOrganizationRequired",
        "Organization name is required."
      )
    );
  }

  if (input.workspaceName.trim() === "") {
    return err(
      firstOwnerError("identityAccess.firstOwnerWorkspaceRequired", "Workspace name is required.")
    );
  }

  if (input.timezone.trim() === "") {
    return err(
      firstOwnerError("identityAccess.firstOwnerTimezoneRequired", "Workspace timezone is required.")
    );
  }

  return ok(undefined);
}

function isMfaChallenge(value: AuthSession | MfaChallenge): value is MfaChallenge {
  return "challengeId" in value;
}

export class FirstOwnerSetupService {
  private readonly database: RootDatabase;
  private readonly authPort: AuthPort;
  private readonly fault: ((point: FirstOwnerSetupFaultPoint) => Promise<void> | void) | undefined;

  public constructor(options: FirstOwnerSetupServiceOptions = {}) {
    this.database = options.database ?? db;
    this.authPort = options.authPort ?? defaultAuthPort;
    this.fault = options.fault;
  }

  public async setup(input: FirstOwnerSetupInput): Promise<Result<FirstOwnerSetupResult>> {
    const valid = validateInput(input);
    if (!valid.ok) {
      return valid;
    }

    const organizationId = randomUUID();
    const workspaceId = randomUUID();
    const ownerUserId = randomUUID();
    const setupAttemptId = input.idempotencyKey?.trim() || randomUUID();
    const organizationSlug = `${slugify(input.organizationName, "organization")}-${setupAttemptId.slice(
      0,
      8
    )}`;
    const workspaceSlug = slugify(input.workspaceName, "workspace");
    const email = normalizeEmail(input.ownerEmail);
    const passwordHash = await hashPassword(input.ownerPassword);

    const createdRows = await (async (): Promise<CreatedSetupRows | null | DomainError> => {
      try {
        const setupRows = await this.database.transaction(
          async (tx): Promise<CreatedSetupRows | null> => {
            await tx.execute(sql`select pg_advisory_xact_lock(hashtext('opzava:first-owner-setup'))`);

            const existing = await tx.execute(sql`
          select organization_id, owner_user_id
          from public.first_owner_setup
          limit 1
        `);

            if (rowsFromExecuteResult(existing).length > 0) {
              return null;
            }

            await tx.execute(sql`select set_config('app.current_org', ${organizationId}, true)`);
            await assertCurrentTenant(tx, organizationId);

            await tx.execute(sql`
          insert into public.auth_users (id, name, email, email_verified)
          values (${ownerUserId}, ${input.ownerName.trim()}, ${email}, false)
        `);

            if (this.fault !== undefined) {
              await this.fault("after-auth-user-insert");
            }

            await tx.execute(sql`
          insert into public.auth_accounts (
            id,
            user_id,
            account_id,
            provider_id,
            password
          )
          values (
            ${randomUUID()},
            ${ownerUserId},
            ${email},
            ${credentialProviderId},
            ${passwordHash}
          )
        `);

            await tx.execute(sql`
          insert into public.organizations (id, slug, name, lifecycle_state)
          values (${organizationId}, ${organizationSlug}, ${input.organizationName.trim()}, 'provisioning')
        `);

            await tx.execute(sql`
          insert into public.workspaces (id, organization_id, slug, name)
          values (${workspaceId}, ${organizationId}, ${workspaceSlug}, ${input.workspaceName.trim()})
        `);

            // Future member-invite and role-grant writers must gate writes through
            // AuthorizationPort. RLS gates the organization boundary, not who/which-role.
            await tx.execute(sql`
          insert into public.memberships (organization_id, user_id, status, membership_version)
          values (${organizationId}, ${ownerUserId}, 'active', 1)
        `);

            await tx.execute(sql`
          insert into public.role_grants (
            organization_id,
            subject_type,
            subject_id,
            role_key,
            scope_type,
            scope_id,
            granted_by_user_id
          )
          values (
            ${organizationId},
            'user',
            ${ownerUserId},
            'owner',
            'organization',
            ${organizationId},
            ${ownerUserId}
          )
        `);

            await tx.execute(sql`
          insert into public.first_owner_setup (
            singleton_id,
            setup_attempt_id,
            organization_id,
            owner_user_id
          )
          values (true, ${setupAttemptId}, ${organizationId}, ${ownerUserId})
        `);

            return { organizationId, workspaceId, ownerUserId, setupAttemptId };
          }
        );

        return setupRows;
      } catch (error) {
        return firstOwnerError(
          "identityAccess.firstOwnerSetupFailed",
          "First owner setup failed.",
          mapDatabaseError(error)
        );
      }
    })();

    if (createdRows instanceof DomainError) {
      return err(createdRows);
    }

    if (createdRows === null) {
      return ok({ status: "already-set-up" });
    }

    const signIn = await this.authPort.signIn({
      email,
      password: input.ownerPassword
    });

    if (!signIn.ok || isMfaChallenge(signIn.value)) {
      return ok({
        status: "created-sign-in-required",
        organizationId: createdRows.organizationId,
        workspaceId: createdRows.workspaceId,
        ownerUserId: createdRows.ownerUserId
      });
    }

    return ok({
      status: "created",
      organizationId: createdRows.organizationId,
      workspaceId: createdRows.workspaceId,
      ownerUserId: createdRows.ownerUserId,
      session: signIn.value
    });
  }
}

export const firstOwnerSetupService = new FirstOwnerSetupService();
