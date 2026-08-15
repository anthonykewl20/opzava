import { createPostgresPool, db, pool } from "@opzava/adapters";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { BetterAuthPortAdapter } from "../adapters/better-auth/auth-port-adapter.js";
import { hashPassword } from "../adapters/better-auth/password-hasher.js";

const migrationUrl = process.env["DATABASE_MIGRATION_URL"];
const enabled = migrationUrl !== undefined && migrationUrl.trim() !== "";
const admin = enabled ? createPostgresPool(migrationUrl!) : null;
const fixture = { userId: randomUUID(), orgId: randomUUID(), workspaceId: randomUUID(), email: `reset-${randomUUID()}@example.test` };
const otherUser = { userId: randomUUID(), email: `reset-other-${randomUUID()}@example.test` };
const oldPassword = "Correct-Horse-Battery-Staple-1";
const newPassword = "A-New-Correct-Horse-Battery-2";

function handleFrom(issued: { readonly resetUrl?: string }): import("@opzava/ports").PasswordResetHandle {
  const resetUrl = issued.resetUrl;
  if (resetUrl === undefined) throw new Error("Expected a reset handoff URL.");
  const handle = new URL(resetUrl, "https://opzava.test").searchParams.get("h");
  if (handle === null) throw new Error("Expected reset handoff handle.");
  return handle as import("@opzava/ports").PasswordResetHandle;
}

async function issue(auth: BetterAuthPortAdapter, userId = fixture.userId, email = fixture.email) {
  const signedIn = await auth.signIn({ email, password: oldPassword });
  if (!signedIn.ok || "challengeId" in signedIn.value) throw new Error("Expected fixture session.");
  const issued = await auth.requestPasswordReset({ email, authenticatedSelf: { userId: userId as import("@opzava/shared-kernel").UserId, sessionId: signedIn.value.sessionId } });
  if (!issued.ok) throw issued.error;
  return { session: signedIn.value, handle: handleFrom(issued.value) };
}

async function seed(): Promise<void> {
  if (admin === null) return;
  await admin.query(`insert into public.auth_users (id, name, email, email_verified) values ($1, 'Reset Test', $2, true)`, [fixture.userId, fixture.email]);
  await admin.query(`insert into public.auth_accounts (id, user_id, account_id, provider_id, password) values ($1, $2, $3, 'email-password', $4)`, [randomUUID(), fixture.userId, fixture.email, await hashPassword(oldPassword)]);
  await admin.query(`insert into public.organizations (id, slug, name, lifecycle_state) values ($1, $2, 'Reset Test', 'active')`, [fixture.orgId, `reset-${fixture.orgId.slice(0, 8)}`]);
  await admin.query(`insert into public.workspaces (id, organization_id, slug, name) values ($1, $2, 'reset', 'Reset')`, [fixture.workspaceId, fixture.orgId]);
  await admin.query(`insert into public.memberships (organization_id, user_id, status, membership_version) values ($1, $2, 'active', 1)`, [fixture.orgId, fixture.userId]);
  await admin.query(`insert into public.auth_users (id, name, email, email_verified) values ($1, 'Other Reset Test', $2, true)`, [otherUser.userId, otherUser.email]);
  await admin.query(`insert into public.auth_accounts (id, user_id, account_id, provider_id, password) values ($1, $2, $3, 'email-password', $4)`, [randomUUID(), otherUser.userId, otherUser.email, await hashPassword(oldPassword)]);
  await admin.query(`insert into public.memberships (organization_id, user_id, status, membership_version) values ($1, $2, 'active', 1)`, [fixture.orgId, otherUser.userId]);
}
async function cleanup(): Promise<void> {
  if (admin === null) return;
  await admin.query("delete from public.auth_password_reset_tokens where user_id = any($1::text[])", [[fixture.userId, otherUser.userId]]);
  await admin.query("delete from public.auth_mfa_challenges where user_id = any($1::text[])", [[fixture.userId, otherUser.userId]]);
  await admin.query("delete from public.auth_sessions where user_id = any($1::text[])", [[fixture.userId, otherUser.userId]]);
  await admin.query("delete from public.memberships where organization_id = $1", [fixture.orgId]);
  await admin.query("delete from public.workspaces where organization_id = $1", [fixture.orgId]);
  await admin.query("delete from public.organizations where id = $1", [fixture.orgId]);
  await admin.query("delete from public.auth_accounts where user_id = any($1::text[])", [[fixture.userId, otherUser.userId]]);
  await admin.query("delete from public.auth_users where id = any($1::text[])", [[fixture.userId, otherUser.userId]]);
}

beforeAll(seed);
beforeEach(async () => {
  if (admin === null) return;
  await admin.query("delete from public.auth_password_reset_tokens where user_id = any($1::text[])", [[fixture.userId, otherUser.userId]]);
  await admin.query("delete from public.auth_sessions where user_id = any($1::text[])", [[fixture.userId, otherUser.userId]]);
  await admin.query("update public.auth_users set password_failed_count = 0, password_locked_until = null where id = any($1::text[])", [[fixture.userId, otherUser.userId]]);
  const password = await hashPassword(oldPassword);
  await admin.query("update public.auth_accounts set password = $1 where user_id = any($2::text[])", [password, [fixture.userId, otherUser.userId]]);
});
afterAll(async () => { await cleanup(); await pool.end(); await admin?.end(); });

describe.skipIf(!enabled)("password-reset handoff integration", () => {
  it("issues only a handle URL, applies password policy after handle verification, and revokes sessions", async () => {
    const auth = new BetterAuthPortAdapter(db);
    const first = await auth.signIn({ email: fixture.email, password: oldPassword });
    const second = await auth.signIn({ email: fixture.email, password: oldPassword });
    if (!first.ok || "challengeId" in first.value || !second.ok || "challengeId" in second.value) throw new Error("Expected fixture sessions.");
    const issued = await auth.requestPasswordReset({ email: fixture.email, authenticatedSelf: { userId: first.value.identity.userId, sessionId: first.value.sessionId } });
    expect(issued).toMatchObject({ ok: true, value: { resetUrl: expect.stringMatching(/^\/reset-password\?h=/) } });
    if (!issued.ok) throw issued.error;
    const handle = handleFrom(issued.value);
    await expect(auth.resetPassword({ handle, newPassword: "too-short", ipAddress: "198.51.100.10" })).resolves.toMatchObject({ ok: false, error: { code: "auth.passwordPolicyInvalid" } });
    await expect(auth.resetPassword({ handle, newPassword, ipAddress: "198.51.100.10" })).resolves.toMatchObject({ ok: true });
    await expect(auth.getSession({ sessionToken: first.value.sessionToken })).resolves.toMatchObject({ ok: true, value: null });
    await expect(auth.getSession({ sessionToken: second.value.sessionToken })).resolves.toMatchObject({ ok: true, value: null });
    await expect(auth.resetPassword({ handle, newPassword: oldPassword, ipAddress: "198.51.100.10" })).resolves.toMatchObject({ ok: false, error: { code: "auth.resetInvalid" } });
  });

  it("does not write for unknown emails and rejects wrong handles without locking the account", async () => {
    const auth = new BetterAuthPortAdapter(db);
    const before = await admin!.query("select count(*)::int as count from public.auth_password_reset_tokens where user_id = $1", [fixture.userId]);
    await expect(auth.requestPasswordReset({ email: "not-a-user@example.test", ipAddress: "198.51.100.1" })).resolves.toEqual({ ok: true, value: { status: "reset-token-issued" } });
    await expect(admin!.query("select count(*)::int as count from public.auth_password_reset_tokens where user_id = $1", [fixture.userId])).resolves.toEqual(before);
    const created = await issue(auth);
    const wrong = `${created.handle.slice(0, -1)}${created.handle.endsWith("a") ? "b" : "a"}` as import("@opzava/ports").PasswordResetHandle;
    for (let count = 0; count < 5; count += 1) await expect(auth.resetPassword({ handle: wrong, newPassword: oldPassword, ipAddress: "198.51.100.11" })).resolves.toMatchObject({ ok: false, error: { code: "auth.resetInvalid" } });
    await expect(admin!.query("select used_at is not null as used, handle_used_at is not null as handle_used from public.auth_password_reset_tokens where user_id = $1 order by created_at desc limit 1", [fixture.userId])).resolves.toMatchObject({ rows: [{ used: false, handle_used: false }] });
    await expect(auth.signIn({ email: fixture.email, password: oldPassword })).resolves.toMatchObject({ ok: true });
  });

  it("rejects expired and cross-account handles", async () => {
    const auth = new BetterAuthPortAdapter(db);
    const created = await issue(auth);
    await admin!.query("update public.auth_password_reset_tokens set handle_expires_at = now() - interval '1 second' where user_id = $1 and used_at is null", [fixture.userId]);
    await expect(auth.resetPassword({ handle: created.handle, newPassword, ipAddress: "198.51.100.12" })).resolves.toMatchObject({ ok: false, error: { code: "auth.resetInvalid" } });
    const other = await issue(auth, otherUser.userId, otherUser.email);
    await expect(auth.resetPassword({ handle: other.handle, newPassword, ipAddress: "198.51.100.13" })).resolves.toMatchObject({ ok: true });
    await expect(auth.signIn({ email: fixture.email, password: oldPassword })).resolves.toMatchObject({ ok: true });
  });

  it("has a single winner for concurrent handle consumption", async () => {
    const auth = new BetterAuthPortAdapter(db);
    const created = await issue(auth);
    const results = await Promise.all([auth.resetPassword({ handle: created.handle, newPassword, ipAddress: "198.51.100.14" }), auth.resetPassword({ handle: created.handle, newPassword, ipAddress: "198.51.100.14" })]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
  });

  it("limits reset exchange by the proxy-appended rightmost XFF hop without consuming the handle", async () => {
    const auth = new BetterAuthPortAdapter(db);
    const created = await issue(auth);
    const wrong = "a".repeat(43) as import("@opzava/ports").PasswordResetHandle;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(auth.resetPassword({ handle: wrong, newPassword, ipAddress: `client-spoofed-${attempt}, 198.51.100.16` })).resolves.toMatchObject({ ok: false, error: { code: "auth.resetInvalid" } });
    }
    await expect(auth.resetPassword({ handle: created.handle, newPassword, ipAddress: "different-client-spoof, 198.51.100.16" })).resolves.toMatchObject({ ok: false, error: { code: "auth.resetInvalid" } });
    await expect(admin!.query("select used_at, handle_used_at from public.auth_password_reset_tokens where user_id = $1", [fixture.userId])).resolves.toMatchObject({ rows: [{ used_at: null, handle_used_at: null }] });
  });

  it("does not issue a handle from a session older than fifteen minutes", async () => {
    const auth = new BetterAuthPortAdapter(db);
    const session = await auth.signIn({ email: fixture.email, password: oldPassword });
    if (!session.ok || "challengeId" in session.value) throw new Error("Expected fixture session.");
    await admin!.query("update public.auth_sessions set created_at = now() - interval '16 minutes' where id = $1", [session.value.sessionId]);
    const before = await admin!.query("select count(*)::int as count from public.auth_password_reset_tokens where user_id = $1", [fixture.userId]);
    await expect(auth.requestPasswordReset({ email: fixture.email, authenticatedSelf: { userId: session.value.identity.userId, sessionId: session.value.sessionId } })).resolves.toEqual({ ok: true, value: { status: "reset-token-issued" } });
    await expect(admin!.query("select count(*)::int as count from public.auth_password_reset_tokens where user_id = $1", [fixture.userId])).resolves.toEqual(before);
  });

  it("rejects cross-account authenticated-self handle issuance without a row", async () => {
    const auth = new BetterAuthPortAdapter(db);
    const other = await auth.signIn({ email: otherUser.email, password: oldPassword });
    if (!other.ok || "challengeId" in other.value) throw new Error("Expected other account session.");
    const before = await admin!.query("select count(*)::int as count from public.auth_password_reset_tokens where user_id = $1", [fixture.userId]);
    await expect(auth.requestPasswordReset({ email: fixture.email, authenticatedSelf: { userId: other.value.identity.userId, sessionId: other.value.sessionId } })).resolves.toEqual({ ok: true, value: { status: "reset-token-issued" } });
    await expect(admin!.query("select count(*)::int as count from public.auth_password_reset_tokens where user_id = $1", [fixture.userId])).resolves.toEqual(before);
  });

  it("rejects a credential-less account without consuming its handle", async () => {
    const auth = new BetterAuthPortAdapter(db);
    const created = await issue(auth);
    await admin!.query("delete from public.auth_accounts where user_id = $1 and provider_id = 'email-password'", [fixture.userId]);
    await expect(auth.resetPassword({ handle: created.handle, newPassword, ipAddress: "198.51.100.15" })).resolves.toMatchObject({ ok: false, error: { code: "auth.resetInvalid" } });
    await expect(admin!.query("select used_at, handle_used_at from public.auth_password_reset_tokens where user_id = $1", [fixture.userId])).resolves.toMatchObject({ rows: [{ used_at: null, handle_used_at: null }] });
    await admin!.query("insert into public.auth_accounts (id, user_id, account_id, provider_id, password) values ($1, $2, $3, 'email-password', $4)", [randomUUID(), fixture.userId, fixture.email, await hashPassword(oldPassword)]);
  });

  it("changePassword rejects wrong current password, throttles, enforces policy, invalidates handles, and keeps only its current session", async () => {
    const auth = new BetterAuthPortAdapter(db);
    const current = await auth.signIn({ email: fixture.email, password: oldPassword });
    const other = await auth.signIn({ email: fixture.email, password: oldPassword });
    if (!current.ok || "challengeId" in current.value || !other.ok || "challengeId" in other.value) throw new Error("Expected sessions.");
    const issued = await auth.requestPasswordReset({ email: fixture.email, authenticatedSelf: { userId: current.value.identity.userId, sessionId: current.value.sessionId } });
    if (!issued.ok) throw issued.error;
    await expect(auth.changePassword({ userId: current.value.identity.userId, currentSessionId: current.value.sessionId, currentPassword: "wrong-password", newPassword })).resolves.toMatchObject({ ok: false, error: { code: "auth.invalidCredentials" } });
    for (let attempt = 0; attempt < 4; attempt += 1) await auth.changePassword({ userId: current.value.identity.userId, currentSessionId: current.value.sessionId, currentPassword: "wrong-password", newPassword });
    await expect(auth.changePassword({ userId: current.value.identity.userId, currentSessionId: current.value.sessionId, currentPassword: oldPassword, newPassword })).resolves.toMatchObject({ ok: false, error: { code: "auth.mfaChallengeUnavailable" } });
    await admin!.query("update public.auth_users set password_failed_count = 0, password_locked_until = null where id = $1", [fixture.userId]);
    await expect(auth.changePassword({ userId: current.value.identity.userId, currentSessionId: current.value.sessionId, currentPassword: oldPassword, newPassword: "too-short" })).resolves.toMatchObject({ ok: false, error: { code: "auth.passwordPolicyInvalid" } });
    await expect(auth.changePassword({ userId: current.value.identity.userId, currentSessionId: current.value.sessionId, currentPassword: oldPassword, newPassword })).resolves.toMatchObject({ ok: true });
    await expect(auth.getSession({ sessionToken: current.value.sessionToken })).resolves.toMatchObject({ ok: true, value: expect.anything() });
    await expect(auth.getSession({ sessionToken: other.value.sessionToken })).resolves.toMatchObject({ ok: true, value: null });
    await expect(admin!.query("select used_at is not null as used, handle_used_at is not null as handle_used from public.auth_password_reset_tokens where user_id = $1", [fixture.userId])).resolves.toMatchObject({ rows: [{ used: true, handle_used: true }] });
  });
});
