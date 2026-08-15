import { db } from "@opzava/adapters";
import {
  DomainError,
  err,
  ok,
  type Result
} from "@opzava/shared-kernel";
import { sql } from "drizzle-orm";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import type {
  AuthPort,
  AuthSession,
  DisableMfaInput,
  EnabledMfa,
  ListSessionsInput,
  LogoutAllInput,
  MfaChallenge,
  MfaEnrollment,
  MfaStatus,
  MfaVerificationInput,
  MfaVerificationResult,
  RevokeSessionInput,
  SignInInput,
  StartMfaEnrollmentInput,
  EnableMfaInput
} from "@opzava/ports";

import { hashPassword, verifyPassword } from "./password-hasher.js";
import {
  credentialProviderId,
  listActiveMembershipsForUser,
  normalizeEmail,
  resolveSessionPrincipal,
  sessionTokenFromHeaders
} from "./session-principal.js";
import {
  consumeRecoveryCode,
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  identityLookupKey,
  generateTotpSecret,
  mfaEncryptionKey,
  totpUri,
  verifyTotp,
  type HashedRecoveryCode
} from "./mfa-crypto.js";

type RootDatabase = typeof db;

interface CredentialRow {
  readonly userId: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly twoFactorEnabled: boolean;
  readonly passwordLocked: boolean;
}

const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;
const resetHandleTtlMs = 10 * 60 * 1000;
const minimumPasswordLength = 12;
const passwordResetWindowMs = 60 * 60 * 1000;
const passwordResetLimit = 5;
const resetExchangeLimit = 10;
const maximumPublicRateLimitKeys = 10_000;
const passwordResetRequests = new Map<string, number[]>();
let lastPublicRateLimitPruneAt = 0;
const maximumInvitationTtlMs = 24 * 60 * 60 * 1000;
const guestSessionTtlMs = 8 * 60 * 60 * 1000;

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

function invalidCredentials(): DomainError {
  return new DomainError({
    code: "auth.invalidCredentials",
    message: "Invalid email or password."
  });
}

function sessionError(cause: unknown): DomainError {
  return new DomainError({
    code: "auth.sessionOperationFailed",
    message: "Auth session operation failed.",
    cause
  });
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

function saltedTokenDigest(salt: string, token: string): string {
  return createHmac("sha256", salt).update(token).digest("hex");
}

function sameDigest(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

function rightmostForwardedForHop(value: string | undefined): string {
  // Traefik appends the remote address to XFF. The leftmost hop is client
  // controlled and must not be trusted as a limiter identity.
  return value?.split(",").at(-1)?.trim() || "unknown";
}

/**
 * Deliberately process-local: local/single-VPS protection that prevents public
 * requests from locking arbitrary user rows. Traefik must append XFF (its
 * default); the rightmost proxy-appended hop is used. Multi-instance deployment
 * must replace this with a shared rate limiter before scaling the web tier.
 */
function prunePublicRateLimits(now: number, force = false): void {
  if (!force && now - lastPublicRateLimitPruneAt < 60_000) return;
  lastPublicRateLimitPruneAt = now;
  for (const [key, requests] of passwordResetRequests) {
    const current = requests.filter((requestedAt) => requestedAt > now - passwordResetWindowMs);
    if (current.length === 0) passwordResetRequests.delete(key);
    else passwordResetRequests.set(key, current);
  }
}

function consumePublicResetRequest(input: { readonly ipAddress?: string | undefined; readonly scope: string; readonly subject?: string | undefined; readonly limit: number }, now = Date.now()): boolean {
  prunePublicRateLimits(now);
  const key = `${rightmostForwardedForHop(input.ipAddress)}:${input.scope}${input.subject === undefined ? "" : `:${input.subject}`}`;
  const requests = passwordResetRequests.get(key) ?? [];
  const current = requests.filter((requestedAt) => requestedAt > now - passwordResetWindowMs);
  if (current.length >= input.limit) return false;
  if (!passwordResetRequests.has(key) && passwordResetRequests.size >= maximumPublicRateLimitKeys) {
    prunePublicRateLimits(now, true);
    if (passwordResetRequests.size >= maximumPublicRateLimitKeys) {
      const oldest = [...passwordResetRequests.entries()].reduce<string | null>((candidate, [candidateKey, candidateRequests]) =>
        candidate === null || (candidateRequests[0] ?? now) < (passwordResetRequests.get(candidate)?.[0] ?? now) ? candidateKey : candidate, null);
      if (oldest !== null) passwordResetRequests.delete(oldest);
    }
  }
  current.push(now);
  passwordResetRequests.set(key, current);
  return true;
}

function resetFailed(): DomainError {
  return new DomainError({ code: "auth.resetInvalid", message: "This password reset link is invalid or has expired." });
}

function resetLocked(): DomainError {
  return new DomainError({ code: "auth.resetUnavailable", message: "Password reset is temporarily unavailable. Try again in a few minutes." });
}

function passwordPolicyFailed(): DomainError {
  return new DomainError({ code: "auth.passwordPolicyInvalid", message: `Passwords must be at least ${minimumPasswordLength} characters.` });
}

function invitationFailed(): DomainError {
  return new DomainError({ code: "auth.invitationInvalid", message: "This invitation is invalid or no longer available." });
}

function invitationMembershipConflict(): DomainError {
  return new DomainError({ code: "auth.invitationMembershipConflict", message: "This invitation cannot change an inactive membership." });
}

function guestLinkFailed(): DomainError {
  return new DomainError({ code: "auth.guestLinkInvalid", message: "This guest link is invalid or no longer available." });
}

function forbiddenInvitationOperation(): DomainError {
  return new DomainError({ code: "auth.invitationForbidden", message: "You are not allowed to manage invitations for this organization." });
}

function normalizeBoundedExpiry(expiresAt: Date | undefined, now: Date, mode: "reject" | "clamp"): Date | null {
  const maximum = new Date(now.getTime() + maximumInvitationTtlMs);
  if (expiresAt === undefined) return maximum;
  if (expiresAt.getTime() <= now.getTime()) return null;
  if (expiresAt.getTime() <= maximum.getTime()) return expiresAt;
  return mode === "clamp" ? maximum : null;
}

function externalEmailDigest(email: string): string | null {
  const key = identityLookupKey();
  return key === null ? null : createHmac("sha256", key).update(email).digest("hex");
}

/**
 * An indexed deterministic HMAC is only a directory key. The randomly salted
 * HMAC persisted beside it remains the at-rest verifier and is timing-safely
 * checked after the O(1) lookup, so a database disclosure cannot validate a
 * presented credential from this digest alone.
 */
function tokenLookupDigest(token: string): string | null {
  const key = identityLookupKey();
  return key === null ? null : createHmac("sha256", key).update(token).digest("hex");
}

function rowToCredential(row: Record<string, unknown> | undefined): CredentialRow | null {
  if (row === undefined || typeof row["password"] !== "string") {
    return null;
  }

  return {
    userId: String(row["user_id"]),
    email: String(row["email"]),
    passwordHash: row["password"],
    twoFactorEnabled: row["two_factor_enabled"] === true,
    passwordLocked: row["password_locked"] === true
  };
}

async function selectCredentialForPasswordAttempt(
  input: { readonly email?: string; readonly userId?: string },
  database: ExecuteDatabase
): Promise<CredentialRow | null> {
  const predicate = input.userId === undefined
    ? sql`lower(u.email) = ${input.email}`
    : sql`u.id = ${input.userId}`;
  const result = await database.execute(sql`
        select u.id as user_id, u.email, u.two_factor_enabled,
               u.password_locked_until > now() as password_locked, a.password
    from public.auth_users u
    join public.auth_accounts a on a.user_id = u.id
    where ${predicate}
      and a.provider_id = ${credentialProviderId}
      ${input.email === undefined ? sql`` : sql`and a.account_id = ${input.email}`}
    limit 1
    for update of u
  `);

  return rowToCredential(rowsFromExecuteResult(result)[0]);
}

interface TwoFactorRow {
  readonly secret: string;
  readonly backupCodes: string;
  readonly verified: boolean;
  readonly locked: boolean;
  readonly enrollmentGeneration: string | null;
  readonly enrollmentSessionId: string | null;
}

type ExecuteDatabase = Pick<RootDatabase, "execute">;

export interface BetterAuthPortAdapterHooks {
  /** Test-only seam used to deterministically exercise authentication races. */
  readonly afterPasswordVerified?: () => Promise<void>;
  /** Test-only seam immediately before enablement acquires the user MFA lock. */
  readonly beforeEnableMfaLock?: () => Promise<void>;
  /** Test-only seam after verification has acquired the canonical user MFA lock. */
  readonly afterMfaUserLocked?: () => Promise<void>;
}

interface ChallengeRow {
  readonly userId: string;
  readonly activeOrganizationId: string;
  readonly membershipVersion: number;
  readonly expiresAt: Date;
  readonly userAgentHash: string | null;
  readonly ipAddressHash: string | null;
}

interface ResetTokenRow {
  readonly id: string;
  readonly userId: string;
  readonly salt: string;
  readonly handleHash: string;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly handleExpiresAt: Date;
  readonly handleUsedAt: Date | null;
}

function hashBinding(value: string | undefined): string | null {
  return value === undefined || value === "" ? null : createHash("sha256").update(value).digest("hex");
}

function mfaError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({ code, message, ...(cause === undefined ? {} : { cause }) });
}

function mfaChallengeUnavailable(): DomainError {
  return mfaError("auth.mfaChallengeUnavailable", "Two-factor authentication is temporarily unavailable.");
}

/**
 * Deliberately shared by malformed/expired challenges and incorrect codes.
 * The private cause preserves the reason for server-side error reporting without
 * providing a code-validity oracle to the browser.
 */
function mfaVerificationFailed(reason: string): DomainError {
  // Keep the internal reason in structured server logs while every caller gets
  // one generic error, so the verification endpoint is not a code-validity oracle.
  console[reason === "invalid-code" || reason === "disable code invalid" ? "info" : "warn"](JSON.stringify({
    level: reason === "invalid-code" || reason === "disable code invalid" ? "info" : "warn",
    source: "identity-access",
    operation: "mfa-verification",
    message: "MFA verification failed.",
    reason
  }));
  return mfaError(
    "auth.mfaVerificationFailed",
    "Two-factor verification could not be completed.",
    new Error(reason)
  );
}

function parseHashes(value: string): readonly HashedRecoveryCode[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "object" && item !== null && typeof item.salt === "string" && typeof item.hash === "string")) return null;
    return parsed as readonly HashedRecoveryCode[];
  } catch {
    return null;
  }
}

function rowToTwoFactor(row: Record<string, unknown> | undefined): TwoFactorRow | null {
  if (row === undefined || typeof row["secret"] !== "string" || typeof row["backup_codes"] !== "string") return null;
  return {
    secret: row["secret"],
    backupCodes: row["backup_codes"],
    verified: row["verified"] === true,
    locked: row["is_locked"] === true,
    enrollmentGeneration: typeof row["enrollment_generation"] === "string" ? row["enrollment_generation"] : null,
    enrollmentSessionId: typeof row["enrollment_session_id"] === "string" ? row["enrollment_session_id"] : null
  };
}

function dateFrom(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

interface InvitationRow {
  readonly id: string;
  readonly organizationId: string;
  readonly email: string;
  readonly role: "admin" | "member";
  readonly salt: string;
  readonly tokenHash: string;
  readonly invitedByUserId: string;
  readonly expiresAt: Date;
  readonly acceptedAt: Date | null;
  readonly revokedAt: Date | null;
}

function rowToInvitation(row: Record<string, unknown> | undefined): InvitationRow | null {
  if (row === undefined || typeof row["id"] !== "string" || typeof row["organization_id"] !== "string" ||
      typeof row["email"] !== "string" || (row["role"] !== "admin" && row["role"] !== "member") ||
      typeof row["salt"] !== "string" || typeof row["token_hash"] !== "string" || typeof row["invited_by_user_id"] !== "string") return null;
  const expiresAt = dateFrom(row["expires_at"]);
  if (expiresAt === null) return null;
  return {
    id: row["id"], organizationId: row["organization_id"], email: row["email"], role: row["role"],
    salt: row["salt"], tokenHash: row["token_hash"], invitedByUserId: row["invited_by_user_id"], expiresAt,
    acceptedAt: dateFrom(row["accepted_at"]), revokedAt: dateFrom(row["revoked_at"])
  };
}

function rowToInvitationDto(row: Record<string, unknown> | undefined): import("@opzava/ports").Invitation | null {
  if (row === undefined || typeof row["id"] !== "string" || typeof row["organization_id"] !== "string" ||
      typeof row["email"] !== "string" || (row["role"] !== "admin" && row["role"] !== "member")) return null;
  const expiresAt = dateFrom(row["expires_at"]);
  if (expiresAt === null) return null;
  return {
    id: row["id"], orgId: row["organization_id"] as import("@opzava/shared-kernel").OrgId,
    email: row["email"], role: row["role"], expiresAt,
    acceptedAt: dateFrom(row["accepted_at"]), revokedAt: dateFrom(row["revoked_at"])
  };
}

function invitationDto(row: InvitationRow): import("@opzava/ports").Invitation {
  return {
    id: row.id,
    orgId: row.organizationId as import("@opzava/shared-kernel").OrgId,
    email: row.email,
    role: row.role,
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt,
    revokedAt: row.revokedAt
  };
}

function rowToResetToken(row: Record<string, unknown> | undefined): ResetTokenRow | null {
  if (row === undefined || typeof row["id"] !== "string" || typeof row["user_id"] !== "string" ||
      typeof row["salt"] !== "string" || typeof row["handle_hash"] !== "string") return null;
  const expiresAt = dateFrom(row["expires_at"]);
  const handleExpiresAt = dateFrom(row["handle_expires_at"]);
  if (expiresAt === null || handleExpiresAt === null) return null;
  return {
    id: row["id"], userId: row["user_id"], salt: row["salt"], handleHash: row["handle_hash"], expiresAt,
    usedAt: dateFrom(row["used_at"]), handleExpiresAt, handleUsedAt: dateFrom(row["handle_used_at"])
  };
}

export class BetterAuthPortAdapter implements AuthPort {
  public constructor(
    private readonly database: RootDatabase = db,
    private readonly hooks: BetterAuthPortAdapterHooks = {}
  ) {}

  private async twoFactorForUser(userId: string): Promise<Pick<TwoFactorRow, "backupCodes" | "verified"> | null> {
    const result = await this.database.execute(sql`
      select backup_codes, verified
      from public.auth_two_factor
      where user_id = ${userId}
      limit 1
    `);
    const row = rowsFromExecuteResult(result)[0];
    return row === undefined || typeof row["backup_codes"] !== "string"
      ? null
      : { backupCodes: row["backup_codes"], verified: row["verified"] === true };
  }

  /**
   * Password failures are global to the account, not to a particular entry point.
   * Locking the user row makes the counter shared by sign-in and MFA re-auth.
   */
  private async verifyPasswordAttempt(input: {
    readonly email?: string;
    readonly userId?: string;
    readonly password: string;
  }): Promise<
    | { readonly kind: "authenticated"; readonly credential: CredentialRow }
    | { readonly kind: "invalid" | "locked" }
  > {
    return this.database.transaction(async (tx) => {
      const credential = await selectCredentialForPasswordAttempt(input, tx as unknown as ExecuteDatabase);
      if (credential === null) return { kind: "invalid" as const };
      if (credential.passwordLocked) return { kind: "locked" as const };

      const passwordMatches = await verifyPassword({ hash: credential.passwordHash, password: input.password });
      if (!passwordMatches) {
        const updated = await tx.execute(sql`
          update public.auth_users
          set password_failed_count = password_failed_count + 1,
              password_locked_until = case
                when password_failed_count + 1 >= 5 then now() + interval '5 minutes'
                else password_locked_until
              end
          where id = ${credential.userId}
          returning password_locked_until > now() as password_locked
        `);
        return rowsFromExecuteResult(updated)[0]?.["password_locked"] === true
          ? { kind: "locked" as const }
          : { kind: "invalid" as const };
      }

      await tx.execute(sql`
        update public.auth_users
        set password_failed_count = 0, password_locked_until = null
        where id = ${credential.userId}
      `);
      return { kind: "authenticated" as const, credential };
    });
  }

  private async insertSession(input: {
    readonly database: ExecuteDatabase;
    readonly userId: string;
    readonly activeOrganizationId: string;
    readonly membershipVersion: number;
    readonly userAgent?: string;
    readonly ipAddress?: string;
    readonly mfaSatisfiedAt?: Date;
  }): Promise<{ readonly token: string; readonly mfaSatisfiedAt?: Date }> {
    const id = randomUUID();
    const token = randomToken();
    await input.database.execute(sql`
      insert into public.auth_sessions (
        id, user_id, token, expires_at, ip_address, user_agent, active_organization_id, membership_version, mfa_satisfied_at
      ) values (
        ${id}, ${input.userId}, ${token}, ${new Date(Date.now() + sessionTtlMs)}, ${input.ipAddress ?? null},
        ${input.userAgent ?? null}, ${input.activeOrganizationId}, ${input.membershipVersion},
        ${input.mfaSatisfiedAt ?? null}
      )
    `);
    return input.mfaSatisfiedAt === undefined
      ? { token }
      : { token, mfaSatisfiedAt: input.mfaSatisfiedAt };
  }

  private async issueMfaChallenge(input: {
    readonly database: ExecuteDatabase;
    readonly userId: string;
    readonly activeOrganizationId: string;
    readonly tenantId: MfaChallenge["tenantId"];
    readonly membershipVersion: number;
    readonly userAgent?: string;
    readonly ipAddress?: string;
  }): Promise<MfaChallenge> {
    const factorResult = await input.database.execute(sql`
      select secret, backup_codes, verified, locked_until > now() as is_locked,
             enrollment_generation, enrollment_session_id
      from public.auth_two_factor
      where user_id = ${input.userId}
      limit 1
    `);
    const twoFactor = rowToTwoFactor(rowsFromExecuteResult(factorResult)[0]);
    if (twoFactor === null || !twoFactor.verified) {
      throw mfaError("auth.mfaConfigurationInvalid", "Two-factor authentication is unavailable.");
    }
    if (twoFactor.locked) throw mfaChallengeUnavailable();

    const challengeToken = randomToken();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 5 * 60 * 1000);
    await input.database.execute(sql`
      insert into public.auth_mfa_challenges (
        id, user_id, active_organization_id, membership_version, expires_at, user_agent_hash, ip_address_hash
      ) values (
        ${createHash("sha256").update(challengeToken).digest("hex")}, ${input.userId},
        ${input.activeOrganizationId}, ${input.membershipVersion}, ${expiresAt},
        ${hashBinding(input.userAgent)}, ${hashBinding(input.ipAddress)}
      )
    `);
    return {
      challengeId: challengeToken as MfaChallenge["challengeId"],
      userId: input.userId as MfaChallenge["userId"],
      tenantId: input.tenantId,
      method: "totp",
      issuedAt,
      expiresAt
    };
  }

  private async verifyLockedFactor(input: {
    readonly database: ExecuteDatabase;
    readonly userId: string;
    readonly code: string;
    readonly method: "totp" | "recovery-code";
  }): Promise<{ readonly kind: "verified" } | { readonly kind: "locked" | "invalid-code" | "invalid-factor" }> {
    // Every MFA mutation takes the user lock before the factor lock. Session
    // creation holds a key-share lock on auth_users through its FK; this order
    // prevents verification and disablement from forming a lock cycle.
    const userResult = await input.database.execute(sql`
      select id from public.auth_users where id = ${input.userId} for update
    `);
    if (rowsFromExecuteResult(userResult)[0] === undefined) return { kind: "invalid-factor" };
    await this.hooks.afterMfaUserLocked?.();
    const factorResult = await input.database.execute(sql`
      select secret, backup_codes, verified, locked_until > now() as is_locked,
             enrollment_generation, enrollment_session_id
      from public.auth_two_factor
      where user_id = ${input.userId}
      for update
    `);
    const twoFactor = rowToTwoFactor(rowsFromExecuteResult(factorResult)[0]);
    if (twoFactor === null || !twoFactor.verified) return { kind: "invalid-factor" };
    if (twoFactor.locked) return { kind: "locked" };

    const updatedCodes = input.method === "totp"
      ? null
      : (() => {
          const hashes = parseHashes(twoFactor.backupCodes);
          return hashes === null ? null : consumeRecoveryCode(hashes, input.code);
        })();
    const verified = input.method === "totp"
      ? verifyTotp(await decryptTotpSecret(twoFactor.secret), input.code)
      : updatedCodes !== null;
    if (!verified) {
      await input.database.execute(sql`
        update public.auth_two_factor
        set failed_verification_count = failed_verification_count + 1,
            locked_until = case
              when failed_verification_count + 1 >= 5 then now() + interval '5 minutes'
              else locked_until
            end
        where user_id = ${input.userId}
      `);
      return { kind: "invalid-code" };
    }

    await input.database.execute(sql`
      update public.auth_two_factor
      set failed_verification_count = 0,
          locked_until = null,
          backup_codes = ${updatedCodes === null ? twoFactor.backupCodes : JSON.stringify(updatedCodes)}
      where user_id = ${input.userId}
    `);
    return { kind: "verified" };
  }

  private async setTenantContext(database: ExecuteDatabase, orgId: string, userId?: string): Promise<void> {
    await database.execute(sql`select set_config('app.current_org', ${orgId}, true)`);
    await database.execute(sql`select set_config('app.current_user', ${userId ?? ""}, true)`);
  }

  private async assertOrganizationAdmin(database: ExecuteDatabase, orgId: string, actor: string): Promise<boolean> {
    return await this.organizationInvitationAuthority(database, orgId, actor) !== null;
  }

  /**
   * Locks the lifecycle and membership facts used by invitation and guest-link
   * writers. Roles alone are never authority: the actor must still be an active
   * member of an active organization in this same transaction.
   */
  private async organizationInvitationAuthority(
    database: ExecuteDatabase,
    orgId: string,
    actor: string
  ): Promise<"owner" | "admin" | null> {
    await this.setTenantContext(database, orgId, actor);
    const allowed = await database.execute(sql`
      select o.lifecycle_state = 'active' as organization_active,
             m.status = 'active' as membership_active,
             app.has_organization_role(${orgId}::uuid, ${actor}, 'owner') as owner,
             app.has_organization_role(${orgId}::uuid, ${actor}, 'admin') as admin
      from public.organizations o
      join public.memberships m
        on m.organization_id = o.id and m.user_id = ${actor}
      where o.id = ${orgId}::uuid
      for update of o, m
    `);
    const row = rowsFromExecuteResult(allowed)[0];
    if (row?.["organization_active"] !== true || row["membership_active"] !== true) return null;
    if (row["owner"] === true) return "owner";
    return row["admin"] === true ? "admin" : null;
  }

  private async organizationIsActive(database: ExecuteDatabase, orgId: string): Promise<boolean> {
    const result = await database.execute(sql`
      select app.is_active_organization(${orgId}::uuid) as active
    `);
    return rowsFromExecuteResult(result)[0]?.["active"] === true;
  }

  private canCreateInvitation(authority: "owner" | "admin", role: "admin" | "member"): boolean {
    // Owners may grant admin or member; admins may grant member only.
    return authority === "owner" || role === "member";
  }

  private auditInvitationAcceptance(input: {
    readonly invitationId: string;
    readonly organizationId: string;
    readonly userId: string;
    readonly invitedByUserId: string;
    readonly outcome: "accepted" | "authority-invalid" | "membership-conflict";
  }): void {
    console.info(JSON.stringify({ level: "info", source: "identity-access", operation: "invitation-accept", ...input }));
  }

  public async signIn(input: SignInInput): Promise<Result<AuthSession | MfaChallenge>> {
    try {
      const email = normalizeEmail(input.email);
      const passwordAttempt = await this.verifyPasswordAttempt({ email, password: input.password });
      if (passwordAttempt.kind === "locked") return err(mfaChallengeUnavailable());
      if (passwordAttempt.kind !== "authenticated") return err(invalidCredentials());
      const credential = passwordAttempt.credential;
      await this.hooks.afterPasswordVerified?.();

      const memberships = await listActiveMembershipsForUser(credential.userId, this.database);
      const activeMembership = memberships[0];

      if (activeMembership === undefined) {
        return err(
          new DomainError({
            code: "auth.noActiveMembership",
            message: "No active organization membership is available for this user."
          })
        );
      }

      if (credential.twoFactorEnabled) {
        return ok(await this.issueMfaChallenge({
          database: this.database,
          userId: credential.userId,
          activeOrganizationId: String(activeMembership.orgId),
          tenantId: activeMembership.tenantId,
          membershipVersion: activeMembership.membershipVersion,
          ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
          ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress })
        }));
      }

      // Lock the same user row held by MFA enablement. A password-only session
      // can only be inserted after this re-read proves MFA is still disabled.
      const issued = await this.database.transaction(async (tx) => {
        const currentUser = await tx.execute(sql`
          select two_factor_enabled, password_locked_until > now() as password_locked
          from public.auth_users
          where id = ${credential.userId}
          for update
        `);
        const currentUserRow = rowsFromExecuteResult(currentUser)[0];
        if (currentUserRow?.["password_locked"] === true) return { kind: "locked" as const };
        if (currentUserRow?.["two_factor_enabled"] === true) {
          return {
            kind: "challenge" as const,
            challenge: await this.issueMfaChallenge({
              database: tx as unknown as ExecuteDatabase,
              userId: credential.userId,
              activeOrganizationId: String(activeMembership.orgId),
              tenantId: activeMembership.tenantId,
              membershipVersion: activeMembership.membershipVersion,
              ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
              ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress })
            })
          };
        }
        return {
          kind: "session" as const,
          created: await this.insertSession({
            database: tx as unknown as ExecuteDatabase,
            userId: credential.userId,
            activeOrganizationId: String(activeMembership.orgId),
            membershipVersion: activeMembership.membershipVersion,
            ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
            ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress })
          })
        };
      });
      if (issued.kind === "locked") return err(mfaChallengeUnavailable());
      if (issued.kind === "challenge") return ok(issued.challenge);
      const resolved = await resolveSessionPrincipal(issued.created.token, this.database);
      return !resolved.ok || resolved.value === null
        ? err(resolved.ok ? sessionError("Created session could not be resolved.") : resolved.error)
        : ok(resolved.value);
    } catch (error) {
      return err(error instanceof DomainError ? error : sessionError(error));
    }
  }

  public async verifyMfaChallenge(input: MfaVerificationInput): Promise<Result<MfaVerificationResult>> {
    try {
      const challengeHash = createHash("sha256").update(input.challengeId).digest("hex");
      const selected = await this.database.execute(sql`
        select user_id, active_organization_id, membership_version, expires_at, user_agent_hash, ip_address_hash
        from public.auth_mfa_challenges
        where id = ${challengeHash} and used_at is null and expires_at > now()
        limit 1
      `);
      const raw = rowsFromExecuteResult(selected)[0];
      const expiresAt = raw === undefined ? null : dateFrom(raw["expires_at"]);
      const challenge: ChallengeRow | null = raw === undefined || expiresAt === null ? null : {
        userId: String(raw["user_id"]), activeOrganizationId: String(raw["active_organization_id"]),
        membershipVersion: Number(raw["membership_version"]), expiresAt,
        userAgentHash: typeof raw["user_agent_hash"] === "string" ? raw["user_agent_hash"] : null,
        ipAddressHash: typeof raw["ip_address_hash"] === "string" ? raw["ip_address_hash"] : null
      };
      // IP and UA hashes are retained for audit correlation only. The challenge is
      // bound to the authenticated user and membership version, is short-lived, and
      // is consumed once; network and browser identifiers are not stable authenticators.
      if (challenge === null) return err(mfaVerificationFailed("challenge missing, expired, or consumed"));

      const attempt = await this.database.transaction(async (tx) => {
        const factorAttempt = await this.verifyLockedFactor({
          database: tx as unknown as ExecuteDatabase,
          userId: challenge.userId,
          code: input.code,
          method: input.method
        });
        if (factorAttempt.kind !== "verified") return factorAttempt;

        // Recheck the membership in the same transaction that consumes the challenge.
        await tx.execute(sql`select set_config('app.current_user', ${challenge.userId}, true)`);
        const membershipResult = await tx.execute(sql`
          select 1
          from public.memberships m
          join public.organizations o on o.id = m.organization_id
          where m.user_id = ${challenge.userId}
            and m.organization_id = ${challenge.activeOrganizationId}::uuid
            and m.membership_version = ${challenge.membershipVersion}
            and m.status = 'active'
            and o.lifecycle_state in ('provisioning', 'active')
          limit 1
        `);
        if (rowsFromExecuteResult(membershipResult)[0] === undefined) return { kind: "invalid-membership" as const };

        const consumedChallenge = await tx.execute(sql`
          update public.auth_mfa_challenges set used_at = now()
          where id = ${challengeHash} and user_id = ${challenge.userId} and used_at is null and expires_at > now()
        `);
        if ((consumedChallenge as { readonly rowCount?: number }).rowCount !== 1) throw mfaVerificationFailed("replayed-challenge");
        const mfaSatisfiedAt = new Date();
        const session = await this.insertSession({
          database: tx as unknown as Pick<RootDatabase, "execute">,
          userId: challenge.userId,
          activeOrganizationId: challenge.activeOrganizationId,
          membershipVersion: challenge.membershipVersion,
          ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
          ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
          mfaSatisfiedAt
        });
        return { kind: "verified" as const, session };
      });
      if (attempt.kind === "locked") return err(mfaChallengeUnavailable());
      if (attempt.kind !== "verified") return err(mfaVerificationFailed(attempt.kind));
      const session = attempt.session;
      const resolved = await resolveSessionPrincipal(session.token, this.database);
      if (!resolved.ok || resolved.value === null) return err(resolved.ok ? sessionError("Created session could not be resolved.") : resolved.error);
      return ok({ session: resolved.value, verifiedAt: session.mfaSatisfiedAt as Date });
    } catch (error) {
      return err(error instanceof DomainError ? error : sessionError(error));
    }
  }

  public async startMfaEnrollment(input: StartMfaEnrollmentInput): Promise<Result<MfaEnrollment>> {
    try {
      if (mfaEncryptionKey() === null) return err(mfaError("auth.mfaUnavailable", "Two-factor authentication is unavailable."));
      const passwordAttempt = await this.verifyPasswordAttempt({ userId: String(input.userId), password: input.password });
      if (passwordAttempt.kind === "locked") return err(mfaChallengeUnavailable());
      if (passwordAttempt.kind !== "authenticated") {
        return err(mfaError("auth.mfaEnrollmentPasswordInvalid", "Your password could not be verified."));
      }
      const secret = generateTotpSecret();
      const encryptedSecret = await encryptTotpSecret(secret);
      const generation = randomUUID();
      const started = await this.database.transaction(async (tx) => {
        // This is the canonical per-user MFA lock. It also prevents an enrollment
        // restart from replacing a factor that was enabled while it was waiting.
        const user = await tx.execute(sql`
          select id from public.auth_users where id = ${input.userId} for update
        `);
        if (rowsFromExecuteResult(user)[0] === undefined) return false;
        // Canonical lock order is user -> session -> factor. Deleting a session
        // takes a factor-row lock through enrollment_session_id's SET NULL FK.
        const session = await tx.execute(sql`
          select id, user_id, expires_at > now() as is_current
          from public.auth_sessions
          where id = ${input.currentSessionId}
          for update
        `);
        const sessionRow = rowsFromExecuteResult(session)[0];
        if (
          sessionRow === undefined ||
          sessionRow["user_id"] !== String(input.userId) ||
          sessionRow["is_current"] !== true
        ) return "invalid-current-session" as const;
        const factor = await tx.execute(sql`
          select verified from public.auth_two_factor where user_id = ${input.userId} for update
        `);
        if (rowsFromExecuteResult(factor)[0]?.["verified"] === true) return false;
        await tx.execute(sql`
          insert into public.auth_two_factor (
            id, user_id, secret, backup_codes, verified, failed_verification_count, locked_until,
            enrollment_generation, enrollment_session_id
          ) values (
            ${randomUUID()}, ${input.userId}, ${encryptedSecret}, ${JSON.stringify([])}, false, 0, null,
            ${generation}, ${input.currentSessionId}
          )
          on conflict (user_id) do update
          set secret = excluded.secret,
              backup_codes = excluded.backup_codes,
              verified = false,
              failed_verification_count = 0,
              locked_until = null,
              enrollment_generation = excluded.enrollment_generation,
              enrollment_session_id = excluded.enrollment_session_id
          where public.auth_two_factor.verified = false
        `);
        return "started" as const;
      });
      if (started === "invalid-current-session") {
        return err(mfaError("auth.currentSessionInvalid", "The session used to start two-factor enrollment is no longer valid."));
      }
      if (!started) return err(mfaError("auth.mfaAlreadyEnabled", "Two-factor authentication is already enabled."));
      return ok({ generation, secret, otpauthUri: totpUri(secret, input.email) });
    } catch (error) { return err(sessionError(error)); }
  }

  public async enableMfa(input: EnableMfaInput): Promise<Result<EnabledMfa>> {
    try {
      const generated = generateRecoveryCodes();
      const changed = await this.database.transaction(async (tx) => {
        await this.hooks.beforeEnableMfaLock?.();
        // Serializes with password-only session issuance and enrollment replacement.
        const user = await tx.execute(sql`
          select id from public.auth_users where id = ${input.userId} for update
        `);
        if (rowsFromExecuteResult(user)[0] === undefined) return { kind: "invalid-enrollment" as const };
        // The current session must be fresh before inspecting the factor or
        // evaluating a code. Expired/revoked enrollment always restarts.
        const session = await tx.execute(sql`
          select id, user_id, expires_at > now() as is_current
          from public.auth_sessions
          where id = ${input.currentSessionId}
          for update
        `);
        const sessionRow = rowsFromExecuteResult(session)[0];
        if (
          sessionRow === undefined ||
          sessionRow["user_id"] !== String(input.userId) ||
          sessionRow["is_current"] !== true
        ) {
          return { kind: "invalid-current-session" as const };
        }
        const factorResult = await tx.execute(sql`
          select secret, backup_codes, verified, locked_until > now() as is_locked,
                 enrollment_generation, enrollment_session_id
          from public.auth_two_factor
          where user_id = ${input.userId}
          for update
        `);
        const factor = rowToTwoFactor(rowsFromExecuteResult(factorResult)[0]);
        if (factor === null || factor.verified || factor.locked) return { kind: "expired" as const };
        // The factor's secret and generation are read under the same lock. A
        // newer password-verified enrollment replaces both atomically, so an
        // older browser can never enable the replacement secret.
        if (factor.enrollmentGeneration !== input.generation) return { kind: "expired" as const };
        if (factor.enrollmentSessionId !== String(input.currentSessionId)) return { kind: "expired" as const };
        // Verify the secret read under this lock, never a pre-transaction snapshot.
        if (!verifyTotp(await decryptTotpSecret(factor.secret), input.code)) {
          return { kind: "invalid-code" as const };
        }
        const updated = await tx.execute(sql`
          update public.auth_two_factor set backup_codes = ${JSON.stringify(generated.hashes)}, verified = true
          where user_id = ${input.userId} and verified = false
        `);
        if ((updated as { readonly rowCount?: number }).rowCount !== 1) return { kind: "expired" as const };
        await tx.execute(sql`update public.auth_users set two_factor_enabled = true where id = ${input.userId}`);
        await tx.execute(sql`
          delete from public.auth_sessions
          where user_id = ${input.userId}
            and id <> ${input.currentSessionId}
        `);
        await tx.execute(sql`
          update public.auth_sessions
          set mfa_satisfied_at = now()
          where id = ${input.currentSessionId} and user_id = ${input.userId}
        `);
        return { kind: "enabled" as const };
      });
      if (changed.kind === "invalid-current-session") {
        return err(mfaError("auth.currentSessionInvalid", "The session used to enable two-factor authentication is no longer valid."));
      }
      if (changed.kind === "expired") return err(mfaError("auth.mfaEnrollmentExpired", "Two-factor enrollment is no longer available."));
      if (changed.kind === "invalid-code") return err(mfaError("auth.mfaEnrollmentVerificationFailed", "The authenticator code could not be verified."));
      if (changed.kind !== "enabled") return err(mfaError("auth.mfaEnrollmentExpired", "Two-factor enrollment is no longer available."));
      return ok({ recoveryCodes: generated.codes });
    } catch (error) { return err(sessionError(error)); }
  }

  public async disableMfa(input: DisableMfaInput): Promise<Result<void>> {
    try {
      const disabled = await this.database.transaction(async (tx) => {
        // Hold the canonical user lock before the factor lock, matching enable and
        // enrollment. Verification uses the challenge lockout state machine.
        const user = await tx.execute(sql`
          select id from public.auth_users where id = ${input.userId} for update
        `);
        if (rowsFromExecuteResult(user)[0] === undefined) return { kind: "not-enabled" as const };
        const attempt = await this.verifyLockedFactor({
          database: tx as unknown as ExecuteDatabase,
          userId: String(input.userId),
          code: input.code,
          method: input.method
        });
        if (attempt.kind !== "verified") return attempt;
        await tx.execute(sql`delete from public.auth_two_factor where user_id = ${input.userId}`);
        await tx.execute(sql`update public.auth_users set two_factor_enabled = false where id = ${input.userId}`);
        return { kind: "disabled" as const };
      });
      if (disabled.kind === "locked") return err(mfaChallengeUnavailable());
      if (disabled.kind === "not-enabled" || disabled.kind === "invalid-factor") {
        return err(mfaError("auth.mfaNotEnabled", "Two-factor authentication is not enabled."));
      }
      if (disabled.kind !== "disabled") return err(mfaVerificationFailed("disable code invalid"));
      return ok(undefined);
    } catch (error) { return err(sessionError(error)); }
  }

  public async getMfaStatus(input: { readonly userId: import("@opzava/shared-kernel").UserId }): Promise<Result<MfaStatus>> {
    try {
      const twoFactor = await this.twoFactorForUser(String(input.userId));
      const hashes = twoFactor === null ? [] : parseHashes(twoFactor.backupCodes) ?? [];
      return ok({ enabled: twoFactor?.verified === true, recoveryCodesRemaining: twoFactor?.verified ? hashes.length : 0 });
    } catch (error) { return err(sessionError(error)); }
  }

  public async requestPasswordReset(input: import("@opzava/ports").RequestPasswordResetInput): Promise<Result<import("@opzava/ports").PasswordResetRequestOutcome>> {
    try {
      const email = normalizeEmail(input.email);
      // Public requests never reach the locking lookup after their local quota is spent.
      if (input.authenticatedSelf === undefined && !consumePublicResetRequest({ ipAddress: input.ipAddress, scope: "forgot-password", subject: email, limit: passwordResetLimit })) {
        return ok({ status: "reset-token-issued" });
      }
      const result = await this.database.transaction(async (tx) => {
        const userResult = await tx.execute(sql`
          select id from public.auth_users where lower(email) = ${email} for update
        `);
        const userId = rowsFromExecuteResult(userResult)[0]?.["id"];
        if (typeof userId !== "string") return { status: "reset-token-issued" as const };

        // Public requests receive the same outcome but never issue a usable token.
        // v1 has no mail transport; only an active session for this exact account can
        // obtain a token from this server-side port for controlled out-of-band delivery.
        if (input.authenticatedSelf === undefined || input.authenticatedSelf.userId !== userId) {
          return { status: "reset-token-issued" as const };
        }
        const session = await tx.execute(sql`
          select id from public.auth_sessions
          where id = ${input.authenticatedSelf.sessionId} and user_id = ${userId}
            and expires_at > now() and created_at > now() - interval '15 minutes'
          for update
        `);
        if (rowsFromExecuteResult(session)[0] === undefined) return { status: "reset-token-issued" as const };

        const id = randomUUID();
        const handle = randomToken();
        const salt = randomBytes(16).toString("hex");
        const lookupDigest = tokenLookupDigest(handle);
        if (lookupDigest === null) return { status: "reset-token-issued" as const };
        // Canonical lock order is user -> session -> factor -> reset token. Existing
        // unused tokens are consumed before the replacement is inserted.
        await tx.execute(sql`update public.auth_password_reset_tokens set used_at = now(), handle_used_at = now() where user_id = ${userId} and used_at is null`);
        await tx.execute(sql`
          insert into public.auth_password_reset_tokens (
            id, user_id, salt, handle_hash, handle_lookup_digest, expires_at, handle_expires_at
          ) values (
            ${id}::uuid, ${userId}, ${salt}, ${saltedTokenDigest(salt, handle)}, ${lookupDigest},
            ${new Date(Date.now() + resetHandleTtlMs)}, ${new Date(Date.now() + resetHandleTtlMs)}
          )
        `);
        return { status: "reset-token-issued" as const, resetUrl: `/reset-password?h=${encodeURIComponent(handle)}` };
      });
      return ok(result);
    } catch (error) { return err(sessionError(error)); }
  }

  public async resetPassword(input: import("@opzava/ports").ResetPasswordInput): Promise<Result<void>> {
    try {
      const handle = String(input.handle);
      if (!/^[A-Za-z0-9_-]{43}$/.test(handle)) return err(resetFailed());
      if (!consumePublicResetRequest({ ipAddress: input.ipAddress, scope: "reset-exchange", limit: resetExchangeLimit })) return err(resetFailed());
      const lookupDigest = tokenLookupDigest(handle);
      if (lookupDigest === null) return err(resetFailed());
      const changed = await this.database.transaction(async (tx) => {
        // The SECURITY DEFINER directory function performs an indexed lookup on
        // deterministic HMAC. The salted HMAC below remains the actual verifier.
        const directory = await tx.execute(sql`select * from app.find_reset_handoff(${lookupDigest})`);
        const candidate = rowToResetToken(rowsFromExecuteResult(directory)[0]);
        if (candidate === null || !sameDigest(candidate.handleHash, saltedTokenDigest(candidate.salt, handle))) return "invalid" as const;
        const userId = candidate.userId;
        const user = await tx.execute(sql`
          select id, password_locked_until > now() as password_locked from public.auth_users where id = ${userId} for update
        `);
        const userRow = rowsFromExecuteResult(user)[0];
        if (userRow === undefined) return "invalid" as const;
        if (userRow["password_locked"] === true) return "locked" as const;
        const tokenResult = await tx.execute(sql`
          select id::text, user_id, salt, handle_hash, expires_at, used_at,
                  handle_expires_at, handle_used_at
          from public.auth_password_reset_tokens where id = ${candidate.id}::uuid
          for update
        `);
        const token = rowToResetToken(rowsFromExecuteResult(tokenResult)[0]);
        const active = token !== null && token.usedAt === null && token.handleUsedAt === null && token.handleExpiresAt.getTime() > Date.now();
        const matches = active && sameDigest(token.handleHash, saltedTokenDigest(token.salt, handle));
        // Handles are 256-bit random credentials. Forgery is bounded by that
        // entropy plus the public exchange limiter, not a per-token lockout.
        if (!matches) return "invalid" as const;
        // Deliberately validate policy only after the token is authenticated:
        // valid reset attempts share the account password throttle, while token
        // guesses above do not create an account-lock denial of service.
        if (input.newPassword.length < minimumPasswordLength) {
          await tx.execute(sql`
            update public.auth_users set password_failed_count = password_failed_count + 1,
              password_locked_until = case when password_failed_count + 1 >= 5 then now() + interval '5 minutes' else password_locked_until end
            where id = ${userId}
          `);
          return "password-policy" as const;
        }
        // Canonical account-security mutation ordering is user -> session ->
        // factor -> reset token. Locking the session before factor prevents the
        // factor's enrollment-session FK from creating a lock cycle on deletion.
        await tx.execute(sql`select id from public.auth_sessions where user_id = ${userId} for update`);
        await tx.execute(sql`select user_id from public.auth_two_factor where user_id = ${userId} for update`);
        const newHash = await hashPassword(input.newPassword);
        const passwordUpdated = await tx.execute(sql`
          update public.auth_accounts set password = ${newHash}
          where user_id = ${userId} and provider_id = ${credentialProviderId}
        `);
        // Do not consume a token or revoke sessions if this is an SSO-only or
        // otherwise credential-less account. MFA enrollment and recovery codes
        // intentionally remain intact across a password reset.
        if ((passwordUpdated as { readonly rowCount?: number }).rowCount !== 1) return "invalid" as const;
        await tx.execute(sql`delete from public.auth_sessions where user_id = ${userId}`);
        await tx.execute(sql`delete from public.auth_mfa_challenges where user_id = ${userId}`);
        const consumed = await tx.execute(sql`
          update public.auth_password_reset_tokens
          set used_at = now(), handle_used_at = now()
          where id = ${candidate.id}::uuid and used_at is null and handle_used_at is null and handle_expires_at > now()
        `);
        if ((consumed as { readonly rowCount?: number }).rowCount !== 1) return "invalid" as const;
        await tx.execute(sql`update public.auth_users set password_failed_count = 0, password_locked_until = null where id = ${userId}`);
        return "reset" as const;
      });
      switch (changed) {
        case "reset": return ok(undefined);
        case "locked": return err(resetLocked());
        case "password-policy": return err(passwordPolicyFailed());
        default: return err(resetFailed());
      }
    } catch (error) { return err(error instanceof DomainError ? error : sessionError(error)); }
  }

  public async changePassword(input: import("@opzava/ports").ChangePasswordInput): Promise<Result<void>> {
    try {
      if (input.newPassword.length < minimumPasswordLength) return err(passwordPolicyFailed());
      const firstAttempt = await this.verifyPasswordAttempt({ userId: String(input.userId), password: input.currentPassword });
      if (firstAttempt.kind === "locked") return err(mfaChallengeUnavailable());
      if (firstAttempt.kind !== "authenticated") return err(invalidCredentials());
      const changed = await this.database.transaction(async (tx) => {
        const user = await tx.execute(sql`select id from public.auth_users where id = ${input.userId} for update`);
        if (rowsFromExecuteResult(user)[0] === undefined) return false;
        const session = await tx.execute(sql`
          select id, user_id, expires_at > now() as active from public.auth_sessions where id = ${input.currentSessionId} for update
        `);
        const sessionRow = rowsFromExecuteResult(session)[0];
        if (sessionRow?.["user_id"] !== String(input.userId) || sessionRow?.["active"] !== true) return false;
        await tx.execute(sql`select user_id from public.auth_two_factor where user_id = ${input.userId} for update`);
        const account = await tx.execute(sql`
          select password from public.auth_accounts where user_id = ${input.userId} and provider_id = ${credentialProviderId} for update
        `);
        const password = rowsFromExecuteResult(account)[0]?.["password"];
        if (typeof password !== "string" || !await verifyPassword({ hash: password, password: input.currentPassword })) return false;
        const passwordUpdated = await tx.execute(sql`
          update public.auth_accounts set password = ${await hashPassword(input.newPassword)}
          where user_id = ${input.userId} and provider_id = ${credentialProviderId}
        `);
        if ((passwordUpdated as { readonly rowCount?: number }).rowCount !== 1) return false;
        await tx.execute(sql`delete from public.auth_sessions where user_id = ${input.userId} and id <> ${input.currentSessionId}`);
        await tx.execute(sql`update public.auth_password_reset_tokens set used_at = now(), handle_used_at = now() where user_id = ${input.userId} and used_at is null`);
        await tx.execute(sql`update public.auth_users set password_failed_count = 0, password_locked_until = null where id = ${input.userId}`);
        return true;
      });
      return changed ? ok(undefined) : err(new DomainError({ code: "auth.changePasswordFailed", message: "Your password could not be changed. Sign in again and try once more." }));
    } catch (error) { return err(error instanceof DomainError ? error : sessionError(error)); }
  }

  public async createInvitation(input: import("@opzava/ports").CreateInvitationInput): Promise<Result<{ readonly invitation: import("@opzava/ports").Invitation; readonly token: import("@opzava/ports").InvitationToken }>> {
    try {
      const now = new Date();
      const expiresAt = normalizeBoundedExpiry(input.expiresAt, now, "reject");
      if (expiresAt === null) return err(invitationFailed());
      const email = normalizeEmail(input.email);
      const created = await this.database.transaction(async (tx) => {
        const authority = await this.organizationInvitationAuthority(tx as unknown as ExecuteDatabase, String(input.orgId), String(input.actor));
        if (authority === null || !this.canCreateInvitation(authority, input.role)) return null;
        const token = randomToken();
        const salt = randomBytes(16).toString("hex");
        const lookupDigest = tokenLookupDigest(token);
        if (lookupDigest === null) throw invitationFailed();
        const id = randomUUID();
        await tx.execute(sql`
          insert into public.auth_invitations (id, organization_id, email, role, salt, token_hash, token_lookup_digest, invited_by_user_id, expires_at)
          values (${id}::uuid, ${input.orgId}::uuid, ${email}, ${input.role}, ${salt}, ${saltedTokenDigest(salt, token)}, ${lookupDigest}, ${input.actor}, ${expiresAt})
        `);
        return { token, row: { id, organizationId: String(input.orgId), email, role: input.role, salt, tokenHash: "", invitedByUserId: String(input.actor), expiresAt, acceptedAt: null, revokedAt: null } satisfies InvitationRow };
      });
      if (created === null) return err(forbiddenInvitationOperation());
      return ok({ invitation: invitationDto(created.row), token: created.token as import("@opzava/ports").InvitationToken });
    } catch (error) { return err(error instanceof DomainError ? error : sessionError(error)); }
  }

  public async listInvitations(input: { readonly orgId: import("@opzava/shared-kernel").OrgId; readonly actor: import("@opzava/shared-kernel").UserId }): Promise<Result<readonly import("@opzava/ports").Invitation[]>> {
    try {
      const invitations = await this.database.transaction(async (tx) => {
        if (!await this.assertOrganizationAdmin(tx as unknown as ExecuteDatabase, String(input.orgId), String(input.actor))) return null;
        const result = await tx.execute(sql`
          select id::text, organization_id::text, email, role, invited_by_user_id, expires_at, accepted_at, revoked_at
          from public.auth_invitations where organization_id = ${input.orgId}::uuid order by created_at desc
        `);
        return rowsFromExecuteResult(result).map(rowToInvitationDto).filter((row): row is import("@opzava/ports").Invitation => row !== null);
      });
      return invitations === null ? err(forbiddenInvitationOperation()) : ok(invitations);
    } catch (error) { return err(error instanceof DomainError ? error : sessionError(error)); }
  }

  public async revokeInvitation(input: { readonly id: string; readonly orgId: import("@opzava/shared-kernel").OrgId; readonly actor: import("@opzava/shared-kernel").UserId }): Promise<Result<void>> {
    try {
      const revoked = await this.database.transaction(async (tx) => {
        if (!await this.assertOrganizationAdmin(tx as unknown as ExecuteDatabase, String(input.orgId), String(input.actor))) return "forbidden" as const;
        const result = await tx.execute(sql`
          update public.auth_invitations set revoked_at = now()
          where id = ${input.id}::uuid and organization_id = ${input.orgId}::uuid and accepted_at is null and revoked_at is null
        `);
        return (result as { readonly rowCount?: number }).rowCount === 1 ? "revoked" as const : "invalid" as const;
      });
      return revoked === "revoked" ? ok(undefined) : err(revoked === "forbidden" ? forbiddenInvitationOperation() : invitationFailed());
    } catch (error) { return err(error instanceof DomainError ? error : sessionError(error)); }
  }

  public async acceptInvitation(input: import("@opzava/ports").AcceptInvitationInput): Promise<Result<void>> {
    try {
      const token = String(input.token);
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return err(invitationFailed());
      const lookupDigest = tokenLookupDigest(token);
      if (lookupDigest === null) return err(invitationFailed());
      const accepted = await this.database.transaction(async (tx) => {
        const directory = await tx.execute(sql`select * from app.find_pending_invitation(${lookupDigest})`);
        const candidate = rowToInvitation(rowsFromExecuteResult(directory)[0]);
        if (candidate === null || !sameDigest(candidate.tokenHash, saltedTokenDigest(candidate.salt, token))) return false;
        await this.setTenantContext(tx as unknown as ExecuteDatabase, candidate.organizationId, String(input.userId));
        // New invite rows lock last: user -> session -> factor -> invitation.
        const user = await tx.execute(sql`select id, lower(email) as email from public.auth_users where id = ${input.userId} for update`);
        const userRow = rowsFromExecuteResult(user)[0];
        if (userRow === undefined || userRow["email"] !== normalizeEmail(candidate.email)) return false;
        await tx.execute(sql`select id from public.auth_sessions where user_id = ${input.userId} for update`);
        await tx.execute(sql`select user_id from public.auth_two_factor where user_id = ${input.userId} for update`);
        const invitationResult = await tx.execute(sql`
          select id::text, organization_id::text, email, role, salt, token_hash, invited_by_user_id, expires_at, accepted_at, revoked_at
          from public.auth_invitations where id = ${candidate.id}::uuid for update
        `);
        const invitation = rowToInvitation(rowsFromExecuteResult(invitationResult)[0]);
        if (invitation === null || invitation.acceptedAt !== null || invitation.revokedAt !== null || invitation.expiresAt.getTime() <= Date.now() || !sameDigest(invitation.tokenHash, saltedTokenDigest(invitation.salt, token))) return "invalid" as const;
        // The invitation row is now locked. Revalidate the organization lifecycle,
        // inviter membership, and current role rather than trusting creation-time facts.
        const authority = await this.organizationInvitationAuthority(
          tx as unknown as ExecuteDatabase,
          invitation.organizationId,
          invitation.invitedByUserId
        );
        if (authority === null || !this.canCreateInvitation(authority, invitation.role)) {
          await tx.execute(sql`update public.auth_invitations set revoked_at = now() where id = ${invitation.id}::uuid and revoked_at is null`);
          this.auditInvitationAcceptance({ invitationId: invitation.id, organizationId: invitation.organizationId, userId: String(input.userId), invitedByUserId: invitation.invitedByUserId, outcome: "authority-invalid" });
          return "invalid" as const;
        }
        // Never reactivate a removed or suspended membership. This tenant-bound
        // SECURITY DEFINER function owns the RLS-hidden check-and-grant and
        // keeps it race-safe with a row lock for an existing membership.
        const membershipStateResult = await tx.execute(sql`
          select app.accept_invitation_membership(${invitation.organizationId}::uuid, ${input.userId}) as membership_state
        `);
        const membershipState = rowsFromExecuteResult(membershipStateResult)[0]?.["membership_state"];
        if (membershipState !== "created" && membershipState !== "active") {
          await tx.execute(sql`update public.auth_invitations set revoked_at = now() where id = ${invitation.id}::uuid and revoked_at is null`);
          this.auditInvitationAcceptance({ invitationId: invitation.id, organizationId: invitation.organizationId, userId: String(input.userId), invitedByUserId: invitation.invitedByUserId, outcome: "membership-conflict" });
          return "membership-conflict" as const;
        }
        await tx.execute(sql`
          insert into public.role_grants (organization_id, subject_type, subject_id, role_key, scope_type, scope_id, granted_by_user_id)
          values (${invitation.organizationId}::uuid, 'user', ${input.userId}, ${invitation.role}, 'organization', ${invitation.organizationId}::uuid, ${invitation.invitedByUserId})
          on conflict do nothing
        `);
        // Membership/role changes revoke active member sessions in this transaction.
        await tx.execute(sql`delete from public.auth_sessions where user_id = ${input.userId}`);
        const consumed = await tx.execute(sql`
          update public.auth_invitations set accepted_at = now()
          where id = ${invitation.id}::uuid and accepted_at is null and revoked_at is null and expires_at > now()
        `);
        const accepted = (consumed as { readonly rowCount?: number }).rowCount === 1;
        if (accepted) this.auditInvitationAcceptance({ invitationId: invitation.id, organizationId: invitation.organizationId, userId: String(input.userId), invitedByUserId: invitation.invitedByUserId, outcome: "accepted" });
        return accepted ? "accepted" as const : "invalid" as const;
      });
      switch (accepted) {
        case "accepted": return ok(undefined);
        case "membership-conflict": return err(invitationMembershipConflict());
        default: return err(invitationFailed());
      }
    } catch (error) { return err(error instanceof DomainError ? error : sessionError(error)); }
  }

  public async createGuestMagicLink(input: import("@opzava/ports").CreateGuestMagicLinkInput): Promise<Result<import("@opzava/ports").GuestMagicLink>> {
    try {
      const email = normalizeEmail(input.email);
      const expiresAt = normalizeBoundedExpiry(input.expiresAt, new Date(), "clamp");
      if (expiresAt === null || externalEmailDigest(email) === null) return err(guestLinkFailed());
      const link = await this.database.transaction(async (tx) => {
        const database = tx as unknown as ExecuteDatabase;
        if (!await this.assertOrganizationAdmin(database, String(input.orgId), String(input.actor))) return null;
        // `workspaces` is the current tenant-RLS project aggregate. This cheap
        // in-context read prevents cross-organization project identifiers.
        const project = await tx.execute(sql`
          select id from public.workspaces where id = ${input.projectId}::uuid and organization_id = ${input.orgId}::uuid
        `);
        if (rowsFromExecuteResult(project)[0] === undefined) return false;
        const token = randomToken();
        const salt = randomBytes(16).toString("hex");
        const lookupDigest = tokenLookupDigest(token);
        if (lookupDigest === null) throw guestLinkFailed();
        const id = randomUUID();
        await tx.execute(sql`
          insert into public.auth_guest_magic_links (id, organization_id, project_id, email, salt, token_hash, token_lookup_digest, created_by_user_id, expires_at)
          values (${id}::uuid, ${input.orgId}::uuid, ${input.projectId}::uuid, ${email}, ${salt}, ${saltedTokenDigest(salt, token)}, ${lookupDigest}, ${input.actor}, ${expiresAt})
        `);
        return { id, guestMagicLinkToken: token as import("@opzava/ports").GuestMagicLinkToken, expiresAt };
      });
      if (link === null) return err(forbiddenInvitationOperation());
      if (link === false) return err(guestLinkFailed());
      console.info(JSON.stringify({ level: "info", source: "identity-access", operation: "guest-magic-link-created", organizationId: String(input.orgId), projectId: input.projectId }));
      return ok(link);
    } catch (error) { return err(error instanceof DomainError ? error : sessionError(error)); }
  }

  public async consumeGuestMagicLink(input: { readonly token: import("@opzava/ports").GuestMagicLinkToken }): Promise<Result<import("@opzava/ports").GuestSession>> {
    try {
      const token = String(input.token);
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return err(guestLinkFailed());
      const lookupDigest = tokenLookupDigest(token);
      if (lookupDigest === null) return err(guestLinkFailed());
      const consumed = await this.database.transaction(async (tx) => {
        const directory = await tx.execute(sql`select * from app.find_guest_magic_link(${lookupDigest})`);
        const candidate = rowsFromExecuteResult(directory).find((row) =>
          typeof row["id"] === "string" && typeof row["organization_id"] === "string" && typeof row["project_id"] === "string" &&
          typeof row["email"] === "string" && typeof row["salt"] === "string" && typeof row["token_hash"] === "string" &&
          sameDigest(row["token_hash"], saltedTokenDigest(row["salt"], token))
        );
        if (candidate === undefined) return null;
        const orgId = String(candidate["organization_id"]);
        const projectId = String(candidate["project_id"]);
        const email = normalizeEmail(String(candidate["email"]));
        const emailHash = externalEmailDigest(email);
        if (emailHash === null) return null;
        await this.setTenantContext(tx as unknown as ExecuteDatabase, orgId);
        const locked = await tx.execute(sql`
          select id::text, salt, token_hash from public.auth_guest_magic_links
          where id = ${candidate["id"]}::uuid and used_at is null and expires_at > now() for update
        `);
        const lockedRow = rowsFromExecuteResult(locked)[0];
        if (lockedRow === undefined || typeof lockedRow["salt"] !== "string" || typeof lockedRow["token_hash"] !== "string" ||
            !sameDigest(lockedRow["token_hash"], saltedTokenDigest(lockedRow["salt"], token))) return null;
        if (!await this.organizationIsActive(tx as unknown as ExecuteDatabase, orgId)) return null;
        const identity = await tx.execute(sql`
          insert into public.auth_external_identities (id, organization_id, project_id, email, email_hash, first_seen_at, last_seen_at)
          values (${randomUUID()}::uuid, ${orgId}::uuid, ${projectId}::uuid, ${email}, ${emailHash}, now(), now())
          on conflict (organization_id, project_id, email_hash) do update set last_seen_at = now()
          returning id::text
        `);
        const identityId = rowsFromExecuteResult(identity)[0]?.["id"];
        if (typeof identityId !== "string") throw new Error("Guest identity upsert failed.");
        const guestSessionToken = randomToken();
        const salt = randomBytes(16).toString("hex");
        const sessionLookupDigest = tokenLookupDigest(guestSessionToken);
        if (sessionLookupDigest === null) throw guestLinkFailed();
        const expiresAt = new Date(Date.now() + guestSessionTtlMs);
        await tx.execute(sql`
          insert into public.auth_guest_sessions (id, external_identity_id, project_id, organization_id, salt, token_hash, token_lookup_digest, expires_at)
          values (${randomUUID()}::uuid, ${identityId}::uuid, ${projectId}::uuid, ${orgId}::uuid, ${salt}, ${saltedTokenDigest(salt, guestSessionToken)}, ${sessionLookupDigest}, ${expiresAt})
        `);
        const used = await tx.execute(sql`
          update public.auth_guest_magic_links set used_at = now()
          where id = ${candidate["id"]}::uuid and used_at is null and expires_at > now()
        `);
        if ((used as { readonly rowCount?: number }).rowCount !== 1) throw new Error("Guest magic link replayed.");
        return { guestSessionToken: guestSessionToken as import("@opzava/ports").GuestSessionToken, expiresAt, orgId, projectId };
      });
      if (consumed === null) return err(guestLinkFailed());
      console.info(JSON.stringify({ level: "info", source: "identity-access", operation: "guest-magic-link-consumed", organizationId: consumed.orgId, projectId: consumed.projectId }));
      return ok({ guestSessionToken: consumed.guestSessionToken, expiresAt: consumed.expiresAt });
    } catch (error) { return err(error instanceof DomainError ? error : sessionError(error)); }
  }

  public async resolveGuestSession(token: import("@opzava/ports").GuestSessionToken): Promise<Result<import("@opzava/ports").GuestSessionPrincipal | null>> {
    try {
      const raw = String(token);
      if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) return ok(null);
      const lookupDigest = tokenLookupDigest(raw);
      if (lookupDigest === null) return ok(null);
      // Guest sessions are a separate primitive: never call resolveSessionPrincipal
      // and never manufacture an organization membership or AuthSession here.
      const row = await this.database.transaction(async (tx) => {
        const candidates = await tx.execute(sql`select * from app.find_guest_session(${lookupDigest})`);
        const candidate = rowsFromExecuteResult(candidates)[0];
        if (candidate === undefined || typeof candidate["external_identity_id"] !== "string" || typeof candidate["project_id"] !== "string" || typeof candidate["organization_id"] !== "string" ||
            typeof candidate["salt"] !== "string" || typeof candidate["token_hash"] !== "string" || !sameDigest(candidate["token_hash"], saltedTokenDigest(candidate["salt"], raw))) return undefined;
        await this.setTenantContext(tx as unknown as ExecuteDatabase, candidate["organization_id"]);
        if (!await this.organizationIsActive(tx as unknown as ExecuteDatabase, candidate["organization_id"])) return undefined;
        // Re-open under the returned tenant context: the helper is only a
        // directory, while the authorization-facing read remains RLS gated.
        const resolved = await tx.execute(sql`
          select external_identity_id::text, project_id::text, organization_id::text
          from public.auth_guest_sessions
          where token_lookup_digest = ${lookupDigest} and revoked_at is null and expires_at > now()
        `);
        return rowsFromExecuteResult(resolved)[0];
      });
      return row === undefined
        ? ok(null)
        : ok({ orgId: String(row["organization_id"]) as import("@opzava/shared-kernel").OrgId, projectId: String(row["project_id"]), externalIdentityId: String(row["external_identity_id"]) });
    } catch (error) { return err(sessionError(error)); }
  }

  public async getSession(input: {
    readonly sessionToken?: string;
    readonly headers?: Headers;
  }): Promise<Result<AuthSession | null>> {
    const sessionToken = input.sessionToken ?? sessionTokenFromHeaders(input.headers);

    if (sessionToken === undefined || sessionToken.trim() === "") {
      return ok(null);
    }

    return resolveSessionPrincipal(sessionToken, this.database);
  }

  public async revokeSession(input: RevokeSessionInput): Promise<Result<void>> {
    try {
      if (input.sessionId === undefined && input.sessionToken === undefined) {
        return err(
          new DomainError({
            code: "auth.sessionRevocationTargetRequired",
            message: "A session id or token is required to revoke a session."
          })
        );
      }

      const actorUserId = input.actorUserId as string;
      await this.database.execute(sql`
        delete from public.auth_sessions
        where user_id = ${actorUserId}
          and (
            (${input.sessionId ?? null}::text is not null and id = ${input.sessionId ?? null})
            or (${input.sessionToken ?? null}::text is not null and token = ${input.sessionToken ?? null})
          )
      `);

      return ok(undefined);
    } catch (error) {
      return err(sessionError(error));
    }
  }

  public async listSessions(input: ListSessionsInput): Promise<Result<readonly AuthSession[]>> {
    try {
      const result = await this.database.execute(sql`
        select token
        from public.auth_sessions
        where user_id = ${input.userId as string}
          and expires_at > now()
        order by created_at desc
      `);

      const sessions: AuthSession[] = [];
      for (const row of rowsFromExecuteResult(result)) {
        const token = String(row["token"]);
        const resolved = await resolveSessionPrincipal(token, this.database);
        if (resolved.ok && resolved.value !== null) {
          sessions.push(resolved.value);
        }
      }

      return ok(sessions);
    } catch (error) {
      return err(sessionError(error));
    }
  }

  public async logoutAll(input: LogoutAllInput): Promise<Result<number>> {
    try {
      const result = await this.database.execute(sql`
        delete from public.auth_sessions
        where user_id = ${input.userId as string}
          and (${input.keepSessionId ?? null}::text is null or id <> ${input.keepSessionId ?? null})
      `);

      const rowCount =
        typeof result === "object" &&
        result !== null &&
        "rowCount" in result &&
        typeof (result as { readonly rowCount?: unknown }).rowCount === "number"
          ? (result as { readonly rowCount: number }).rowCount
          : 0;

      return ok(rowCount);
    } catch (error) {
      return err(sessionError(error));
    }
  }
}

export const authPort = new BetterAuthPortAdapter();
