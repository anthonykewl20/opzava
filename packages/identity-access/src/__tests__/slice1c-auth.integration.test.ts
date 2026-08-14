import {
  createPostgresPool,
  db,
  mapDatabaseError,
  pool,
  withAuthenticatedIdentity,
} from "@opzava/adapters";
import { makeOrgId, makeUserId } from "@opzava/shared-kernel";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { BetterAuthPortAdapter } from "../adapters/better-auth/auth-port-adapter.js";
import { totpAt } from "../adapters/better-auth/mfa-crypto.js";
import {
  listActiveMembershipsForUser,
  withTenantForSession,
} from "../adapters/better-auth/session-principal.js";
import { bumpAuthorizationVersion } from "../application/authorization-version.js";
import { FirstOwnerSetupService } from "../application/first-owner-setup.js";

const testRunId = randomUUID();
const ownerEmail = `owner-${testRunId}@example.test`;
const otherEmail = `other-${testRunId}@example.test`;
const secondSetupEmail = `second-owner-${testRunId}@example.test`;
const mfaOwnerEmail = `mfa-owner-${testRunId}@example.test`;
const ownerPassword = "Correct-Horse-Battery-Staple-1";
const failedSetupIdempotencyKey = `${testRunId}-slice1c-fail`;
const createdSetupIdempotencyKey = `${testRunId}-slice1c-create`;
const secondSetupIdempotencyKey = `${testRunId}-slice1c-second`;
const mfaSetupIdempotencyKey = `${testRunId}-mfa`;
const adminPool = createPostgresPool(readMigrationDatabaseUrlForTest());

const createdOrganizationIds: string[] = [];
const createdUserIds: string[] = [];

function readMigrationDatabaseUrlForTest(): string {
  const value = process.env["DATABASE_MIGRATION_URL"];
  if (value === undefined || value.trim() === "") {
    throw new Error("DATABASE_MIGRATION_URL is required for slice 1c auth integration tests.");
  }
  return value;
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

function slugifyForSetup(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug === "" ? fallback : slug;
}

function setupOrganizationSlug(organizationName: string, idempotencyKey: string): string {
  return `${slugifyForSetup(organizationName, "organization")}-${idempotencyKey.slice(0, 8)}`;
}

const setupEmails = [ownerEmail, secondSetupEmail, mfaOwnerEmail];
const setupAttemptIds = [
  failedSetupIdempotencyKey,
  createdSetupIdempotencyKey,
  secondSetupIdempotencyKey,
  mfaSetupIdempotencyKey,
];
const setupOrganizationSlugs = [
  setupOrganizationSlug("Opzava Internal", failedSetupIdempotencyKey),
  setupOrganizationSlug("Opzava Internal", createdSetupIdempotencyKey),
  setupOrganizationSlug("Second Org", secondSetupIdempotencyKey),
  setupOrganizationSlug("MFA Org", mfaSetupIdempotencyKey),
];

function currentTotp(secret: string): string {
  return totpAt(secret, Date.now());
}

async function adminCount(table: string): Promise<number> {
  const allowedTables = new Set([
    "auth_users",
    "auth_accounts",
    "auth_sessions",
    "organizations",
    "workspaces",
    "memberships",
    "role_grants",
    "first_owner_setup",
  ]);

  if (!allowedTables.has(table)) {
    throw new Error(`Unexpected count table ${table}`);
  }

  const countQueries: Record<string, { readonly text: string; readonly values: unknown[] }> = {
    auth_users: {
      text: "select count(*)::int as count from public.auth_users where email = any($1::text[])",
      values: [setupEmails],
    },
    auth_accounts: {
      text: `select count(*)::int as count
             from public.auth_accounts a
             join public.auth_users u on u.id = a.user_id
             where u.email = any($1::text[])`,
      values: [setupEmails],
    },
    auth_sessions: {
      text: `select count(*)::int as count
             from public.auth_sessions s
             join public.auth_users u on u.id = s.user_id
             where u.email = any($1::text[])`,
      values: [setupEmails],
    },
    organizations: {
      text: "select count(*)::int as count from public.organizations where slug = any($1::text[])",
      values: [setupOrganizationSlugs],
    },
    workspaces: {
      text: `select count(*)::int as count
             from public.workspaces w
             join public.organizations o on o.id = w.organization_id
             where o.slug = any($1::text[])`,
      values: [setupOrganizationSlugs],
    },
    memberships: {
      text: `select count(*)::int as count
             from public.memberships m
             join public.organizations o on o.id = m.organization_id
             where o.slug = any($1::text[])`,
      values: [setupOrganizationSlugs],
    },
    role_grants: {
      text: `select count(*)::int as count
             from public.role_grants r
             join public.organizations o on o.id = r.organization_id
             where o.slug = any($1::text[])`,
      values: [setupOrganizationSlugs],
    },
    first_owner_setup: {
      text: `select count(*)::int as count
             from public.first_owner_setup
             where setup_attempt_id = any($1::text[])`,
      values: [setupAttemptIds],
    },
  };

  const query = countQueries[table];
  if (query === undefined) {
    throw new Error(`Unexpected count table ${table}`);
  }

  const result = await adminPool.query(query.text, query.values);
  return Number(result.rows[0]?.["count"] ?? 0);
}

async function adminSessionCountForUser(userId: string): Promise<number> {
  const result = await adminPool.query(
    "select count(*)::int as count from public.auth_sessions where user_id = $1",
    [userId],
  );
  return Number(result.rows[0]?.["count"] ?? 0);
}

async function adminCreateOtherOrganizationMember(): Promise<{
  readonly organizationId: string;
  readonly userId: string;
}> {
  const organizationId = randomUUID();
  const userId = randomUUID();

  await adminPool.query(
    `insert into public.organizations (id, slug, name, lifecycle_state)
     values ($1, $2, $3, 'active')`,
    [organizationId, `slice1c-other-${testRunId}`, "Slice 1c Other"],
  );
  await adminPool.query(
    `insert into public.auth_users (id, name, email, email_verified)
     values ($1, 'Other User', $2, true)`,
    [userId, otherEmail],
  );
  await adminPool.query(
    `insert into public.memberships (organization_id, user_id, status, membership_version)
     values ($1, $2, 'active', 1)`,
    [organizationId, userId],
  );

  createdOrganizationIds.push(organizationId);
  createdUserIds.push(userId);
  return { organizationId, userId };
}

async function cleanupCreatedRows(): Promise<void> {
  const organizationIds = createdOrganizationIds.filter((value) => value !== "");
  const userIds = createdUserIds.filter((value) => value !== "");

  if (organizationIds.length > 0) {
    await adminPool.query(
      "delete from public.first_owner_setup where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query(
      "delete from public.role_grants where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query(
      "delete from public.memberships where organization_id = any($1::uuid[])",
      [organizationIds],
    );
    await adminPool.query("delete from public.workspaces where organization_id = any($1::uuid[])", [
      organizationIds,
    ]);
    await adminPool.query("delete from public.organizations where id = any($1::uuid[])", [
      organizationIds,
    ]);
  }

  if (userIds.length > 0) {
    await adminPool.query("delete from public.auth_sessions where user_id = any($1::text[])", [
      userIds,
    ]);
    await adminPool.query("delete from public.auth_accounts where user_id = any($1::text[])", [
      userIds,
    ]);
    await adminPool.query("delete from public.auth_users where id = any($1::text[])", [userIds]);
  }

  createdOrganizationIds.length = 0;
  createdUserIds.length = 0;
}

// This suite proves first-owner setup on a never-set-up database, but the
// shared local DB may already hold a completed setup (e.g. the workers
// roadmap seed). Park any existing singleton for the duration of the suite
// and restore it afterwards so other suites keep their expected state.
let parkedFirstOwnerSetup: Record<string, unknown> | null = null;

beforeAll(async () => {
  await adminPool.query(
    "select pg_advisory_lock(hashtext('opzava:first-owner-setup:test-fixture'))",
  );

  const result = await db.execute(sql`
    select current_user as session_role, rolsuper as is_super, rolbypassrls as bypass_rls
    from pg_roles
    where rolname = current_user
  `);
  const row = rowsFromExecuteResult(result)[0];
  if (
    row?.["session_role"] !== "opzava_app" ||
    row?.["is_super"] === true ||
    row?.["bypass_rls"] === true
  ) {
    throw new Error(
      `Slice 1c auth integration test must run as non-owner opzava_app; got ${JSON.stringify(row)}`,
    );
  }

  const existing = await adminPool.query(
    "select setup_attempt_id, organization_id, owner_user_id, completed_at from public.first_owner_setup",
  );
  parkedFirstOwnerSetup = (existing.rows[0] as Record<string, unknown> | undefined) ?? null;
  await adminPool.query("delete from public.first_owner_setup");
});

afterEach(async () => {
  await cleanupCreatedRows();
});

afterAll(async () => {
  if (parkedFirstOwnerSetup !== null) {
    await adminPool.query(
      `insert into public.first_owner_setup
         (singleton_id, setup_attempt_id, organization_id, owner_user_id, completed_at)
       values (true, $1, $2, $3, $4)
       on conflict (singleton_id) do nothing`,
      [
        parkedFirstOwnerSetup["setup_attempt_id"],
        parkedFirstOwnerSetup["organization_id"],
        parkedFirstOwnerSetup["owner_user_id"],
        parkedFirstOwnerSetup["completed_at"],
      ],
    );
  }
  await adminPool.query(
    "select pg_advisory_unlock(hashtext('opzava:first-owner-setup:test-fixture'))",
  );
  await pool.end();
  await adminPool.end();
});

describe("slice 1c auth acceptance", () => {
  it("requires a single-use server-side MFA challenge, locks brute-force attempts, and consumes recovery codes", async () => {
    process.env["BETTER_AUTH_SECRET"] ??= "mfa-test-secret-must-never-be-used-in-production";
    const authPort = new BetterAuthPortAdapter(db);
    const setup = await new FirstOwnerSetupService({ database: db, authPort }).setup({
      ownerName: "MFA Owner",
      ownerEmail: mfaOwnerEmail,
      ownerPassword,
      organizationName: "MFA Org",
      workspaceName: "MFA Workspace",
      timezone: "Asia/Manila",
      idempotencyKey: mfaSetupIdempotencyKey,
    });
    if (!setup.ok || setup.value.status !== "created" || setup.value.session === undefined) {
      throw new Error("Expected MFA fixture setup to create a session.");
    }
    expect(setup.value.session.mfaSatisfiedAt).toBeUndefined();
    createdOrganizationIds.push(setup.value.organizationId ?? "");
    createdUserIds.push(setup.value.ownerUserId ?? "");
    const factorCountBeforeRejectedEnrollment = await adminPool.query(
      "select count(*)::int as count from public.auth_two_factor where user_id = $1",
      [String(setup.value.session.identity.userId)],
    );
    const rejectedEnrollment = await authPort.startMfaEnrollment({
      userId: setup.value.session.identity.userId,
      email: mfaOwnerEmail,
      password: "wrong-password",
      currentSessionId: setup.value.session.sessionId,
    });
    expect(rejectedEnrollment).toMatchObject({ ok: false, error: { code: "auth.mfaEnrollmentPasswordInvalid" } });
    const factorCountAfterRejectedEnrollment = await adminPool.query(
      "select count(*)::int as count from public.auth_two_factor where user_id = $1",
      [String(setup.value.session.identity.userId)],
    );
    expect(factorCountAfterRejectedEnrollment.rows).toEqual(factorCountBeforeRejectedEnrollment.rows);

    const enrollment = await authPort.startMfaEnrollment({
      userId: setup.value.session.identity.userId,
      email: mfaOwnerEmail,
      password: ownerPassword,
      currentSessionId: setup.value.session.sessionId,
    });
    expect(enrollment.ok).toBe(true);
    if (!enrollment.ok) throw enrollment.error;
    // Start enablement, replace the pending secret while it has not yet acquired
    // the factor lock, then prove the stale code cannot verify the replacement.
    let enteredEnable!: () => void;
    let resumeEnable!: () => void;
    const enableEntered = new Promise<void>((resolve) => { enteredEnable = resolve; });
    const resume = new Promise<void>((resolve) => { resumeEnable = resolve; });
    const secretRaceAdapter = new BetterAuthPortAdapter(db, {
      beforeEnableMfaLock: async () => { enteredEnable(); await resume; },
    });
    const staleEnable = secretRaceAdapter.enableMfa({
      userId: setup.value.session.identity.userId,
      code: currentTotp(enrollment.value.secret),
      currentSessionId: setup.value.session.sessionId,
      generation: enrollment.value.generation,
    });
    await enableEntered;
    const replacementEnrollment = await authPort.startMfaEnrollment({
      userId: setup.value.session.identity.userId,
      email: mfaOwnerEmail,
      password: ownerPassword,
      currentSessionId: setup.value.session.sessionId,
    });
    expect(replacementEnrollment.ok).toBe(true);
    if (!replacementEnrollment.ok) throw replacementEnrollment.error;
    resumeEnable();
    await expect(staleEnable).resolves.toMatchObject({ ok: false, error: { code: "auth.mfaEnrollmentExpired" } });
    const afterStaleGeneration = await adminPool.query(
      "select two_factor_enabled from public.auth_users where id = $1",
      [String(setup.value.session.identity.userId)],
    );
    expect(afterStaleGeneration.rows[0]).toMatchObject({ two_factor_enabled: false });
    const replacementCode = currentTotp(replacementEnrollment.value.secret);
    const wrongReplacementCode = `${replacementCode.slice(0, 5)}${replacementCode[5] === "9" ? "0" : "9"}`;
    const wrongEnrollmentCode = await authPort.enableMfa({
      userId: setup.value.session.identity.userId,
      code: wrongReplacementCode,
      currentSessionId: setup.value.session.sessionId,
      generation: replacementEnrollment.value.generation,
    });
    expect(wrongEnrollmentCode).toMatchObject({ ok: false, error: { code: "auth.mfaEnrollmentVerificationFailed" } });

    // Pause a password-authenticated sign-in before issuance, enable MFA to
    // completion, then resume. The sign-in must re-read the locked user row and
    // mint a challenge rather than inserting a seven-day password-only session.
    let enteredSignIn!: () => void;
    let resumeSignIn!: () => void;
    const signInEntered = new Promise<void>((resolve) => { enteredSignIn = resolve; });
    const resumePasswordSignIn = new Promise<void>((resolve) => { resumeSignIn = resolve; });
    const racingSignInAdapter = new BetterAuthPortAdapter(db, {
      afterPasswordVerified: async () => { enteredSignIn(); await resumePasswordSignIn; },
    });
    const passwordSignIn = racingSignInAdapter.signIn({ email: mfaOwnerEmail, password: ownerPassword });
    await signInEntered;
    // This extra password-only session proves enable revokes every session other
    // than its authenticated actor session and stamps the retained actor session.
    const extraSession = await authPort.signIn({ email: mfaOwnerEmail, password: ownerPassword });
    expect(extraSession.ok && !("challengeId" in extraSession.value)).toBe(true);
    const enabled = await authPort.enableMfa({
      userId: setup.value.session.identity.userId,
      code: currentTotp(replacementEnrollment.value.secret),
      currentSessionId: setup.value.session.sessionId,
      generation: replacementEnrollment.value.generation,
    });
    expect(enabled.ok).toBe(true);
    if (!enabled.ok) throw enabled.error;
    resumeSignIn();
    await expect(passwordSignIn).resolves.toMatchObject({ ok: true, value: { challengeId: expect.any(String) } });
    const retainedSessionState = await adminPool.query(
      `select id, mfa_satisfied_at is not null as mfa_satisfied
       from public.auth_sessions where user_id = $1`,
      [String(setup.value.session.identity.userId)],
    );
    expect(retainedSessionState.rows).toEqual([{ id: setup.value.session.sessionId, mfa_satisfied: true }]);
    const passwordOnlySessions = await adminPool.query(
      "select count(*)::int as count from public.auth_sessions where user_id = $1 and mfa_satisfied_at is null",
      [String(setup.value.session.identity.userId)],
    );
    expect(passwordOnlySessions.rows[0]).toMatchObject({ count: 0 });

    const zeroChallenge = await authPort.signIn({
      email: mfaOwnerEmail,
      password: ownerPassword,
      userAgent: "original-browser",
      ipAddress: "198.51.100.8",
    });
    expect(zeroChallenge.ok).toBe(true);
    if (!zeroChallenge.ok || !("challengeId" in zeroChallenge.value)) throw new Error("Expected MFA challenge.");

    // A failed challenge must not mint a password-only session. The different UA
    // and IP prove those audit hashes do not falsely invalidate a real challenge.
    const zero = await authPort.verifyMfaChallenge({
      challengeId: zeroChallenge.value.challengeId,
      method: "totp",
      code: "000000",
      userAgent: "privacy-browser",
      ipAddress: "2001:db8::1",
    });
    expect(zero).toMatchObject({ ok: false, error: { code: "auth.mfaVerificationFailed" } });
    await expect(adminSessionCountForUser(String(setup.value.session.identity.userId))).resolves.toBe(1);
    // Isolate the lockout assertion below so its five failures are exactly five
    // test-driven attempts rather than including the all-zero rejection probe.
    await adminPool.query(
      "update public.auth_two_factor set failed_verification_count = 0, locked_until = null where user_id = $1",
      [String(setup.value.session.identity.userId)],
    );

    const challenged = await authPort.signIn({ email: mfaOwnerEmail, password: ownerPassword });
    expect(challenged.ok).toBe(true);
    if (!challenged.ok || !("challengeId" in challenged.value)) throw new Error("Expected MFA challenge.");
    const challenge = challenged.value;
    const validCode = currentTotp(replacementEnrollment.value.secret);
    const wrongCode = `${validCode.slice(0, 5)}${validCode[5] === "9" ? "0" : "9"}`;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const wrong = await authPort.verifyMfaChallenge({
        challengeId: challenge.challengeId,
        method: "totp",
        code: wrongCode,
      });
      expect(wrong).toMatchObject({ ok: false, error: { code: "auth.mfaVerificationFailed" } });
    }
    const nextChallenge = await authPort.signIn({ email: mfaOwnerEmail, password: ownerPassword });
    expect(nextChallenge.ok).toBe(true);
    if (!nextChallenge.ok || !("challengeId" in nextChallenge.value)) throw new Error("Expected a new MFA challenge.");
    const fifthFailureOnNewChallenge = await authPort.verifyMfaChallenge({
      challengeId: nextChallenge.value.challengeId,
      method: "totp",
      code: wrongCode,
    });
    expect(fifthFailureOnNewChallenge).toMatchObject({ ok: false, error: { code: "auth.mfaVerificationFailed" } });
    const lockState = await adminPool.query(
      "select locked_until > now() as locked, locked_until from public.auth_two_factor where user_id = $1",
      [String(setup.value.session.identity.userId)],
    );
    expect(lockState.rows[0]).toMatchObject({ locked: true });
    const lockedUntil = new Date(String(lockState.rows[0]?.["locked_until"])).getTime();
    expect(lockedUntil).toBeGreaterThan(Date.now() + 4 * 60 * 1000);
    expect(lockedUntil).toBeLessThan(Date.now() + 6 * 60 * 1000);

    const correctDuringLock = await authPort.verifyMfaChallenge({
      challengeId: nextChallenge.value.challengeId,
      method: "totp",
      code: validCode,
    });
    expect(correctDuringLock).toMatchObject({ ok: false, error: { code: "auth.mfaChallengeUnavailable" } });
    const noChallengeDuringLock = await authPort.signIn({ email: mfaOwnerEmail, password: ownerPassword });
    expect(noChallengeDuringLock).toMatchObject({ ok: false, error: { code: "auth.mfaChallengeUnavailable" } });

    // Expire the server-side lock without sleeping. The next sign-in is a new
    // challenge because the previous one may have reached its five-minute TTL.
    await adminPool.query(
      "update public.auth_two_factor set locked_until = now() - interval '1 second' where user_id = $1",
      [String(setup.value.session.identity.userId)],
    );
    const afterLockExpiry = await authPort.signIn({
      email: mfaOwnerEmail,
      password: ownerPassword,
      userAgent: "second-original-browser",
      ipAddress: "198.51.100.9",
    });
    expect(afterLockExpiry.ok).toBe(true);
    if (!afterLockExpiry.ok || !("challengeId" in afterLockExpiry.value)) throw new Error("Expected MFA challenge after lock expiry.");
    const verified = await authPort.verifyMfaChallenge({
      challengeId: afterLockExpiry.value.challengeId,
      method: "totp",
      code: currentTotp(replacementEnrollment.value.secret),
      userAgent: "new-privacy-browser",
      ipAddress: "2001:db8::2",
    });
    expect(verified.ok).toBe(true);
    if (!verified.ok) throw verified.error;
    expect(verified.value.session.mfaSatisfiedAt).toBeInstanceOf(Date);
    const lockReset = await adminPool.query(
      "select failed_verification_count, locked_until from public.auth_two_factor where user_id = $1",
      [String(setup.value.session.identity.userId)],
    );
    expect(lockReset.rows[0]).toMatchObject({ failed_verification_count: 0, locked_until: null });
    const replay = await authPort.verifyMfaChallenge({
      challengeId: afterLockExpiry.value.challengeId,
      method: "totp",
      code: currentTotp(replacementEnrollment.value.secret),
    });
    expect(replay.ok).toBe(false);

    const recoveryChallenge = await authPort.signIn({ email: mfaOwnerEmail, password: ownerPassword });
    if (!recoveryChallenge.ok || !("challengeId" in recoveryChallenge.value)) throw new Error("Expected recovery challenge.");
    const recovery = enabled.value.recoveryCodes[0];
    if (recovery === undefined) throw new Error("Expected a recovery code.");
    const recoveryVerified = await authPort.verifyMfaChallenge({ challengeId: recoveryChallenge.value.challengeId, method: "recovery-code", code: recovery });
    expect(recoveryVerified.ok).toBe(true);
    const reusedChallenge = await authPort.signIn({ email: mfaOwnerEmail, password: ownerPassword });
    if (!reusedChallenge.ok || !("challengeId" in reusedChallenge.value)) throw new Error("Expected replay challenge.");
    const reused = await authPort.verifyMfaChallenge({ challengeId: reusedChallenge.value.challengeId, method: "recovery-code", code: recovery });
    expect(reused.ok).toBe(false);

    // Disabling MFA has the identical five-attempt lockout and must reject a
    // correct code until the lock expires.
    await adminPool.query(
      "update public.auth_two_factor set failed_verification_count = 0, locked_until = null where user_id = $1",
      [String(setup.value.session.identity.userId)],
    );
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const wrongDisable = await authPort.disableMfa({
        userId: setup.value.session.identity.userId,
        method: "totp",
        code: wrongCode,
      });
      expect(wrongDisable).toMatchObject({ ok: false, error: { code: "auth.mfaVerificationFailed" } });
    }
    const disabledWhileLocked = await authPort.disableMfa({
      userId: setup.value.session.identity.userId,
      method: "totp",
      code: currentTotp(replacementEnrollment.value.secret),
    });
    expect(disabledWhileLocked).toMatchObject({ ok: false, error: { code: "auth.mfaChallengeUnavailable" } });
    await adminPool.query(
      "update public.auth_two_factor set locked_until = now() - interval '1 second' where user_id = $1",
      [String(setup.value.session.identity.userId)],
    );
    const disabledAfterExpiry = await authPort.disableMfa({
      userId: setup.value.session.identity.userId,
      method: "totp",
      code: currentTotp(replacementEnrollment.value.secret),
    });
    expect(disabledAfterExpiry).toMatchObject({ ok: true });

    // Enrollment is bound to the password-re-authenticated session. A different
    // active session cannot use its setup material, even before it is revoked.
    const reEnrollment = await authPort.startMfaEnrollment({
      userId: setup.value.session.identity.userId,
      email: mfaOwnerEmail,
      password: ownerPassword,
      currentSessionId: setup.value.session.sessionId,
    });
    expect(reEnrollment.ok).toBe(true);
    if (!reEnrollment.ok) throw reEnrollment.error;
    const revokedActor = await authPort.signIn({ email: mfaOwnerEmail, password: ownerPassword });
    expect(revokedActor.ok && !("challengeId" in revokedActor.value)).toBe(true);
    if (!revokedActor.ok || "challengeId" in revokedActor.value) throw new Error("Expected a password-only session.");
    const revokeActor = await authPort.revokeSession({
      actorUserId: setup.value.session.identity.userId,
      sessionId: revokedActor.value.sessionId,
    });
    expect(revokeActor.ok).toBe(true);
    const rejectedRevokedActor = await authPort.enableMfa({
      userId: setup.value.session.identity.userId,
      code: currentTotp(reEnrollment.value.secret),
      currentSessionId: revokedActor.value.sessionId,
      generation: reEnrollment.value.generation,
    });
    expect(rejectedRevokedActor).toMatchObject({ ok: false, error: { code: "auth.currentSessionInvalid" } });
    const mfaStillDisabled = await adminPool.query(
      "select two_factor_enabled from public.auth_users where id = $1",
      [String(setup.value.session.identity.userId)],
    );
    expect(mfaStillDisabled.rows[0]).toMatchObject({ two_factor_enabled: false });
  });

  it("shares the five-attempt password lock between sign-in and MFA enrollment", async () => {
    const email = `mfa-password-lock-${testRunId}@example.test`;
    const authPort = new BetterAuthPortAdapter(db);
    const setup = await new FirstOwnerSetupService({ database: db, authPort }).setup({
      ownerName: "MFA Password Lock Owner",
      ownerEmail: email,
      ownerPassword,
      organizationName: "MFA Password Lock Org",
      workspaceName: "MFA Password Lock Workspace",
      timezone: "Asia/Manila",
      idempotencyKey: `${testRunId}-mfa-password-lock`,
    });
    if (!setup.ok || setup.value.status !== "created" || setup.value.session === undefined) {
      throw new Error("Expected password-lock fixture setup to create a session.");
    }
    createdOrganizationIds.push(setup.value.organizationId ?? "");
    createdUserIds.push(setup.value.ownerUserId ?? "");
    const userId = setup.value.session.identity.userId;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(authPort.signIn({ email, password: "wrong-password" })).resolves.toMatchObject({
        ok: false, error: { code: "auth.invalidCredentials" },
      });
    }
    await expect(authPort.startMfaEnrollment({
      userId, email, password: "wrong-password", currentSessionId: setup.value.session.sessionId,
    })).resolves.toMatchObject({ ok: false, error: { code: "auth.mfaChallengeUnavailable" } });
    const locked = await adminPool.query(
      "select password_failed_count, password_locked_until > now() as locked from public.auth_users where id = $1",
      [String(userId)],
    );
    expect(locked.rows[0]).toMatchObject({ password_failed_count: 5, locked: true });
    await expect(authPort.signIn({ email, password: ownerPassword })).resolves.toMatchObject({
      ok: false, error: { code: "auth.mfaChallengeUnavailable" },
    });
    await expect(authPort.startMfaEnrollment({
      userId, email, password: ownerPassword, currentSessionId: setup.value.session.sessionId,
    })).resolves.toMatchObject({ ok: false, error: { code: "auth.mfaChallengeUnavailable" } });
    await adminPool.query(
      "update public.auth_users set password_locked_until = now() - interval '1 second' where id = $1",
      [String(userId)],
    );
    await expect(authPort.startMfaEnrollment({
      userId, email, password: ownerPassword, currentSessionId: setup.value.session.sessionId,
    })).resolves.toMatchObject({ ok: true });
    const reset = await adminPool.query(
      "select password_failed_count, password_locked_until from public.auth_users where id = $1",
      [String(userId)],
    );
    expect(reset.rows[0]).toMatchObject({ password_failed_count: 0, password_locked_until: null });
  });

  it("serializes enablement racing session revocation without a deadlock or serialization abort", async () => {
    process.env["BETTER_AUTH_SECRET"] ??= "mfa-test-secret-must-never-be-used-in-production";
    const email = `mfa-enable-revoke-${testRunId}@example.test`;
    const authPort = new BetterAuthPortAdapter(db);
    const setup = await new FirstOwnerSetupService({ database: db, authPort }).setup({
      ownerName: "MFA Enable Revoke Owner",
      ownerEmail: email,
      ownerPassword,
      organizationName: "MFA Enable Revoke Org",
      workspaceName: "MFA Enable Revoke Workspace",
      timezone: "Asia/Manila",
      idempotencyKey: `${testRunId}-mfa-enable-revoke`,
    });
    if (!setup.ok || setup.value.status !== "created" || setup.value.session === undefined) {
      throw new Error("Expected enable/revoke fixture setup to create a session.");
    }
    createdOrganizationIds.push(setup.value.organizationId ?? "");
    createdUserIds.push(setup.value.ownerUserId ?? "");
    const userId = setup.value.session.identity.userId;
    const sessionId = setup.value.session.sessionId;
    const enrollment = await authPort.startMfaEnrollment({ userId, email, password: ownerPassword, currentSessionId: sessionId });
    if (!enrollment.ok) throw enrollment.error;
    const outcomes = await Promise.race([
      Promise.all([
        authPort.enableMfa({ userId, code: currentTotp(enrollment.value.secret), currentSessionId: sessionId, generation: enrollment.value.generation }),
        authPort.revokeSession({ actorUserId: userId, sessionId }),
      ]),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("enable/revoke race timed out")), 10_000)),
    ]);
    const [enabled, revoked] = outcomes;
    expect(revoked).toMatchObject({ ok: true });
    if (!enabled.ok) {
      expect(enabled.error.code).toBe("auth.currentSessionInvalid");
      expect(`${enabled.error.message} ${String(enabled.error.cause ?? "")}`).not.toMatch(/deadlock detected|could not serialize/i);
    }
  });

  it("serializes MFA verification racing disable without a deadlock or serialization abort", async () => {
    process.env["BETTER_AUTH_SECRET"] ??= "mfa-test-secret-must-never-be-used-in-production";
    const authPort = new BetterAuthPortAdapter(db);
    const setup = await new FirstOwnerSetupService({ database: db, authPort }).setup({
      ownerName: "MFA Lock Owner",
      ownerEmail: `mfa-lock-${testRunId}@example.test`,
      ownerPassword,
      organizationName: "MFA Lock Org",
      workspaceName: "MFA Lock Workspace",
      timezone: "Asia/Manila",
      idempotencyKey: `${testRunId}-mfa-lock`,
    });
    if (!setup.ok || setup.value.status !== "created" || setup.value.session === undefined) {
      throw new Error("Expected MFA lock fixture setup to create a session.");
    }
    createdOrganizationIds.push(setup.value.organizationId ?? "");
    createdUserIds.push(setup.value.ownerUserId ?? "");
    const userId = setup.value.session.identity.userId;
    const enrollment = await authPort.startMfaEnrollment({
      userId,
      email: `mfa-lock-${testRunId}@example.test`,
      password: ownerPassword,
      currentSessionId: setup.value.session.sessionId,
    });
    if (!enrollment.ok) throw enrollment.error;
    const enabled = await authPort.enableMfa({
      userId,
      code: currentTotp(enrollment.value.secret),
      currentSessionId: setup.value.session.sessionId,
      generation: enrollment.value.generation,
    });
    if (!enabled.ok) throw enabled.error;
    const challenge = await authPort.signIn({ email: `mfa-lock-${testRunId}@example.test`, password: ownerPassword });
    if (!challenge.ok || !("challengeId" in challenge.value)) throw new Error("Expected MFA challenge for lock race.");

    let releaseVerification!: () => void;
    let verificationHasUserLock!: () => void;
    const verifierEntered = new Promise<void>((resolve) => { verificationHasUserLock = resolve; });
    const release = new Promise<void>((resolve) => { releaseVerification = resolve; });
    const verificationAdapter = new BetterAuthPortAdapter(db, {
      afterMfaUserLocked: async () => { verificationHasUserLock(); await release; },
    });
    const verification = verificationAdapter.verifyMfaChallenge({
      challengeId: challenge.value.challengeId,
      method: "totp",
      code: currentTotp(enrollment.value.secret),
    });
    await verifierEntered;
    // Disable is now blocked on the user lock rather than holding the factor
    // lock. Releasing verification proves the two operations serialize safely.
    const disable = authPort.disableMfa({ userId, method: "totp", code: currentTotp(enrollment.value.secret) });
    releaseVerification();
    const [verified, disabled] = await Promise.all([verification, disable]);
    expect(verified).toMatchObject({ ok: true });
    expect(disabled).toMatchObject({ ok: true });
    for (const result of [verified, disabled]) {
      if (!result.ok) {
        expect(`${result.error.message} ${String(result.error.cause ?? "")}`).not.toMatch(/deadlock detected|could not serialize/i);
      }
    }
  });

  it("proves atomic setup, DB sessions, identity discovery, and tenant denial", async () => {
    const authPort = new BetterAuthPortAdapter(db);

    const failingSetup = new FirstOwnerSetupService({
      database: db,
      authPort,
      fault: async (point) => {
        if (point === "after-auth-user-insert") {
          throw new Error("forced setup rollback");
        }
      },
    });

    const failed = await failingSetup.setup({
      ownerName: "Owner One",
      ownerEmail,
      ownerPassword,
      organizationName: "Opzava Internal",
      workspaceName: "Admin",
      timezone: "Asia/Manila",
      idempotencyKey: failedSetupIdempotencyKey,
    });

    expect(failed.ok).toBe(false);
    await expect(adminCount("auth_users")).resolves.toBe(0);
    await expect(adminCount("auth_accounts")).resolves.toBe(0);
    await expect(adminCount("organizations")).resolves.toBe(0);
    await expect(adminCount("workspaces")).resolves.toBe(0);
    await expect(adminCount("memberships")).resolves.toBe(0);
    await expect(adminCount("role_grants")).resolves.toBe(0);
    await expect(adminCount("first_owner_setup")).resolves.toBe(0);

    const setup = new FirstOwnerSetupService({ database: db, authPort });
    const created = await setup.setup({
      ownerName: "Owner One",
      ownerEmail,
      ownerPassword,
      organizationName: "Opzava Internal",
      workspaceName: "Admin",
      timezone: "Asia/Manila",
      idempotencyKey: createdSetupIdempotencyKey,
    });

    expect(created.ok).toBe(true);
    if (!created.ok || created.value.status !== "created" || created.value.session === undefined) {
      throw new Error("Expected first-owner setup to create and sign in the owner.");
    }

    if (created.value.organizationId !== undefined) {
      createdOrganizationIds.push(created.value.organizationId);
    }
    if (created.value.ownerUserId !== undefined) {
      createdUserIds.push(created.value.ownerUserId);
    }

    await expect(adminCount("auth_users")).resolves.toBe(1);
    await expect(adminCount("auth_accounts")).resolves.toBe(1);
    await expect(adminCount("organizations")).resolves.toBe(1);
    await expect(adminCount("workspaces")).resolves.toBe(1);
    await expect(adminCount("memberships")).resolves.toBe(1);
    await expect(adminCount("role_grants")).resolves.toBe(1);
    await expect(adminCount("first_owner_setup")).resolves.toBe(1);
    await expect(adminCount("auth_sessions")).resolves.toBe(1);

    const second = await setup.setup({
      ownerName: "Second Owner",
      ownerEmail: secondSetupEmail,
      ownerPassword,
      organizationName: "Second Org",
      workspaceName: "Second Workspace",
      timezone: "Asia/Manila",
      idempotencyKey: secondSetupIdempotencyKey,
    });

    expect(second).toMatchObject({ ok: true, value: { status: "already-set-up" } });
    await expect(adminCount("auth_users")).resolves.toBe(1);
    await expect(adminCount("organizations")).resolves.toBe(1);
    await expect(adminCount("memberships")).resolves.toBe(1);
    await expect(adminCount("role_grants")).resolves.toBe(1);

    const session = created.value.session;
    const activeOrgId = session.identity.activeMembership.orgId;
    expect(session.identity.email).toBe(ownerEmail);
    expect(session.identity.memberships).toHaveLength(1);
    expect(session.identity.activeMembership.authorizationVersion).toBe("av:1");
    expect(activeOrgId).toBe(created.value.organizationId);

    const resolved = await authPort.getSession({ sessionToken: session.sessionToken });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok || resolved.value === null) {
      throw new Error("Expected DB-backed session to resolve.");
    }
    expect(resolved.value.identity.activeMembership.orgId).toBe(activeOrgId);
    expect(resolved.value.identity.activeMembership.authorizationVersion).toBe("av:1");

    await withTenantForSession(resolved.value, activeOrgId, async (tx) => {
      const result = await tx.execute(sql`
        select id
        from public.workspaces
        where organization_id = ${activeOrgId}
      `);
      expect(rowsFromExecuteResult(result)).toHaveLength(1);
    });

    const other = await adminCreateOtherOrganizationMember();
    await expect(
      withTenantForSession(resolved.value, makeOrgId(other.organizationId), async () => undefined),
    ).rejects.toMatchObject({ status: 403 });

    await expect(
      (async () => {
        try {
          await db.execute(sql`
            insert into public.workspaces (organization_id, slug, name)
            values (${activeOrgId}, 'no-context', 'No Context')
          `);
        } catch (error) {
          throw mapDatabaseError(error);
        }
      })(),
    ).rejects.toMatchObject({ status: 403 });

    const noIdentityOrganizations = await db.execute(sql`
      select id
      from public.organizations
      order by id
    `);
    expect(rowsFromExecuteResult(noIdentityOrganizations)).toHaveLength(0);

    const identityOrganizations = await withAuthenticatedIdentity(
      { sessionToken: session.sessionToken },
      async (tx, identity) => {
        expect(identity.userId).toBe(session.identity.userId);
        const result = await tx.execute(sql`
          select o.id
          from public.organizations o
          join public.memberships m on m.organization_id = o.id
          order by o.id
        `);
        return rowsFromExecuteResult(result).map((row) => String(row["id"]));
      },
    );
    expect(identityOrganizations).toEqual([activeOrgId]);

    const listed = await authPort.listSessions({ userId: session.identity.userId });
    expect(listed.ok).toBe(true);
    if (!listed.ok) {
      throw listed.error;
    }
    expect(listed.value).toHaveLength(1);

    const revoked = await authPort.revokeSession({
      actorUserId: session.identity.userId,
      sessionToken: session.sessionToken,
    });
    expect(revoked.ok).toBe(true);
    const revokedSession = await authPort.getSession({ sessionToken: session.sessionToken });
    expect(revokedSession).toMatchObject({ ok: true, value: null });

    const signedInAgain = await authPort.signIn({
      email: ownerEmail,
      password: ownerPassword,
    });
    expect(signedInAgain.ok).toBe(true);
    if (!signedInAgain.ok || "challengeId" in signedInAgain.value) {
      throw new Error("Expected owner sign-in to issue a DB session.");
    }

    const loggedOut = await authPort.logoutAll({
      userId: signedInAgain.value.identity.userId,
    });
    expect(loggedOut.ok).toBe(true);
    const afterLogoutAll = await authPort.getSession({
      sessionToken: signedInAgain.value.sessionToken,
    });
    expect(afterLogoutAll).toMatchObject({ ok: true, value: null });

    const signedInForAuthorizationBump = await authPort.signIn({
      email: ownerEmail,
      password: ownerPassword,
    });
    expect(signedInForAuthorizationBump.ok).toBe(true);
    if (!signedInForAuthorizationBump.ok || "challengeId" in signedInForAuthorizationBump.value) {
      throw new Error("Expected owner sign-in to issue a session for the authorization bump.");
    }

    const bumpSession = signedInForAuthorizationBump.value;
    expect(bumpSession.identity.activeMembership.authorizationVersion).toBe("av:1");

    await expect(
      withTenantForSession(bumpSession, activeOrgId, async (tx) =>
        bumpAuthorizationVersion(tx, {
          orgId: activeOrgId,
          userId: makeUserId("missing-user"),
        }),
      ),
    ).rejects.toMatchObject({ status: 403, code: "postgres.forbidden" });

    const forcedRollback = new Error("force authorization bump rollback");
    await expect(
      withTenantForSession(bumpSession, activeOrgId, async (tx) => {
        await bumpAuthorizationVersion(tx, {
          orgId: activeOrgId,
          userId: bumpSession.identity.userId,
        });
        const insideTransaction = await tx.execute(sql`
          select membership_version
          from public.memberships
          where organization_id = ${activeOrgId}
            and user_id = ${bumpSession.identity.userId}
        `);
        expect(rowsFromExecuteResult(insideTransaction)[0]?.["membership_version"]).toBe(2);
        throw forcedRollback;
      }),
    ).rejects.toBe(forcedRollback);

    const afterRollback = await listActiveMembershipsForUser(bumpSession.identity.userId);
    expect(afterRollback[0]?.membershipVersion).toBe(1);
    expect(afterRollback[0]?.authorizationVersion).toBe("av:1");

    await withTenantForSession(bumpSession, activeOrgId, async (tx) =>
      bumpAuthorizationVersion(tx, {
        orgId: activeOrgId,
        userId: bumpSession.identity.userId,
      }),
    );

    const afterCommit = await listActiveMembershipsForUser(bumpSession.identity.userId);
    expect(afterCommit[0]?.membershipVersion).toBe(2);
    expect(afterCommit[0]?.authorizationVersion).toBe("av:2");

    const afterAuthorizationBump = await authPort.getSession({
      sessionToken: bumpSession.sessionToken,
    });
    expect(afterAuthorizationBump).toMatchObject({ ok: true, value: null });
  });
});
