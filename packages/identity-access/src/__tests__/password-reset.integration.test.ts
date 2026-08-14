import { createPostgresPool, db, pool } from "@opzava/adapters";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BetterAuthPortAdapter } from "../adapters/better-auth/auth-port-adapter.js";
import { hashPassword } from "../adapters/better-auth/password-hasher.js";

const migrationUrl = process.env["DATABASE_MIGRATION_URL"];
const enabled = migrationUrl !== undefined && migrationUrl.trim() !== "";
const admin = enabled ? createPostgresPool(migrationUrl!) : null;
const fixture = { userId: randomUUID(), orgId: randomUUID(), workspaceId: randomUUID(), email: `reset-${randomUUID()}@example.test` };
const otherUser = { userId: randomUUID(), email: `reset-other-${randomUUID()}@example.test` };
const oldPassword = "Correct-Horse-Battery-Staple-1";
const newPassword = "A-New-Correct-Horse-Battery-2";

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
  await admin.query("delete from public.auth_password_reset_tokens where user_id = $1", [fixture.userId]);
  await admin.query("delete from public.auth_password_reset_tokens where user_id = $1", [otherUser.userId]);
  await admin.query("delete from public.auth_mfa_challenges where user_id = $1", [fixture.userId]);
  await admin.query("delete from public.auth_sessions where user_id = $1", [otherUser.userId]);
  await admin.query("delete from public.memberships where organization_id = $1 and user_id = $2", [fixture.orgId, otherUser.userId]);
  await admin.query("delete from public.auth_accounts where user_id = $1", [otherUser.userId]);
  await admin.query("delete from public.auth_users where id = $1", [otherUser.userId]);
  await admin.query("delete from public.auth_sessions where user_id = $1", [fixture.userId]);
  await admin.query("delete from public.memberships where organization_id = $1", [fixture.orgId]);
  await admin.query("delete from public.workspaces where organization_id = $1", [fixture.orgId]);
  await admin.query("delete from public.organizations where id = $1", [fixture.orgId]);
  await admin.query("delete from public.auth_accounts where user_id = $1", [fixture.userId]);
  await admin.query("delete from public.auth_users where id = $1", [fixture.userId]);
}

beforeAll(seed);
afterAll(async () => { await cleanup(); await pool.end(); await admin?.end(); });

describe.skipIf(!enabled)("password reset integration", () => {
  it("enforces the reset password policy after token verification, invalidates sessions and MFA challenges, and resets the shared throttle", async () => {
    const auth = new BetterAuthPortAdapter(db);
    const first = await auth.signIn({ email: fixture.email, password: oldPassword });
    const second = await auth.signIn({ email: fixture.email, password: oldPassword });
    if (!first.ok || "challengeId" in first.value || !second.ok || "challengeId" in second.value) throw new Error("Expected fixture sessions.");
    await admin!.query("insert into public.auth_mfa_challenges (id, user_id, active_organization_id, membership_version, expires_at) values ($1, $2, $3, 1, now() + interval '5 minutes')", [randomUUID().replaceAll("-", ""), fixture.userId, fixture.orgId]);
    const issued = await auth.requestPasswordReset({ email: fixture.email, authenticatedSelf: { userId: first.value.identity.userId, sessionId: first.value.sessionId } });
    expect(issued.ok && issued.value.resetToken).toBeTruthy();
    if (!issued.ok || issued.value.resetToken === undefined) throw new Error("Expected a controlled out-of-band token.");
    await expect(auth.resetPassword({ token: issued.value.resetToken, newPassword: "too-short" })).resolves.toMatchObject({ ok: false, error: { code: "auth.passwordPolicyInvalid" } });
    await expect(admin!.query("select password_failed_count from public.auth_users where id = $1", [fixture.userId])).resolves.toMatchObject({ rows: [{ password_failed_count: 1 }] });
    await admin!.query("update public.auth_users set password_failed_count = 4 where id = $1", [fixture.userId]);
    await expect(auth.resetPassword({ token: issued.value.resetToken, newPassword })).resolves.toMatchObject({ ok: true });
    await expect(auth.getSession({ sessionToken: first.value.sessionToken })).resolves.toMatchObject({ ok: true, value: null });
    await expect(auth.getSession({ sessionToken: second.value.sessionToken })).resolves.toMatchObject({ ok: true, value: null });
    await expect(admin!.query("select count(*)::int as count from public.auth_mfa_challenges where user_id = $1", [fixture.userId])).resolves.toMatchObject({ rows: [{ count: 0 }] });
    await expect(auth.signIn({ email: fixture.email, password: newPassword })).resolves.toMatchObject({ ok: true });
    await expect(admin!.query("select password_failed_count, password_locked_until from public.auth_users where id = $1", [fixture.userId])).resolves.toMatchObject({ rows: [{ password_failed_count: 0, password_locked_until: null }] });
    await expect(auth.resetPassword({ token: issued.value.resetToken, newPassword: oldPassword })).resolves.toMatchObject({ ok: false, error: { code: "auth.resetInvalid" } });
  });

  it("rejects a wrong current password, enforces the port policy, invalidates reset tokens, resets the throttle, and keeps only the current session", async () => {
    const auth = new BetterAuthPortAdapter(db);
    const current = await auth.signIn({ email: fixture.email, password: newPassword });
    const other = await auth.signIn({ email: fixture.email, password: newPassword });
    if (!current.ok || "challengeId" in current.value || !other.ok || "challengeId" in other.value) throw new Error("Expected change-password sessions.");
    await expect(auth.changePassword({ userId: current.value.identity.userId, currentSessionId: current.value.sessionId, currentPassword: "wrong-password", newPassword: oldPassword })).resolves.toMatchObject({ ok: false, error: { code: "auth.invalidCredentials" } });
    await expect(auth.changePassword({ userId: current.value.identity.userId, currentSessionId: current.value.sessionId, currentPassword: newPassword, newPassword: "too-short" })).resolves.toMatchObject({ ok: false, error: { code: "auth.passwordPolicyInvalid" } });
    const issued = await auth.requestPasswordReset({ email: fixture.email, authenticatedSelf: { userId: current.value.identity.userId, sessionId: current.value.sessionId } });
    if (!issued.ok || issued.value.resetToken === undefined) throw new Error("Expected pending reset token.");
    await admin!.query("update public.auth_users set password_failed_count = 4, password_locked_until = now() + interval '5 minutes' where id = $1", [fixture.userId]);
    await admin!.query("update public.auth_users set password_locked_until = null where id = $1", [fixture.userId]);
    await expect(auth.changePassword({ userId: current.value.identity.userId, currentSessionId: current.value.sessionId, currentPassword: newPassword, newPassword: oldPassword })).resolves.toMatchObject({ ok: true });
    await expect(auth.getSession({ sessionToken: current.value.sessionToken })).resolves.toMatchObject({ ok: true, value: expect.anything() });
    await expect(auth.getSession({ sessionToken: other.value.sessionToken })).resolves.toMatchObject({ ok: true, value: null });
    await expect(admin!.query("select used_at is not null as used from public.auth_password_reset_tokens where id = $1::uuid", [issued.value.resetToken.slice(0, issued.value.resetToken.indexOf("."))])).resolves.toMatchObject({ rows: [{ used: true }] });
    await expect(admin!.query("select password_failed_count, password_locked_until from public.auth_users where id = $1", [fixture.userId])).resolves.toMatchObject({ rows: [{ password_failed_count: 0, password_locked_until: null }] });
  });

  it("does not write for unknown emails and kills a guessed token after five failures without locking the account", async () => {
    const auth = new BetterAuthPortAdapter(db);
    const before = await admin!.query("select count(*)::int as count from public.auth_password_reset_tokens where user_id = $1", [fixture.userId]);
    await expect(auth.requestPasswordReset({ email: "not-a-user@example.test" })).resolves.toEqual({ ok: true, value: { status: "reset-token-issued" } });
    await expect(admin!.query("select count(*)::int as count from public.auth_password_reset_tokens where user_id = $1", [fixture.userId])).resolves.toEqual(before);
    const session = await auth.signIn({ email: fixture.email, password: oldPassword });
    if (!session.ok || "challengeId" in session.value) throw new Error("Expected fixture session.");
    const issued = await auth.requestPasswordReset({ email: fixture.email, authenticatedSelf: { userId: session.value.identity.userId, sessionId: session.value.sessionId } });
    if (!issued.ok || issued.value.resetToken === undefined) throw new Error("Expected token.");
    const wrong = `${issued.value.resetToken.slice(0, -1)}x`;
    for (let count = 0; count < 5; count += 1) await expect(auth.resetPassword({ token: wrong as import("@opzava/ports").PasswordResetToken, newPassword: oldPassword })).resolves.toMatchObject({ ok: false });
    const tokenId = issued.value.resetToken.slice(0, issued.value.resetToken.indexOf("."));
    await expect(admin!.query("select failed_attempts, used_at is not null as used from public.auth_password_reset_tokens where id = $1::uuid", [tokenId])).resolves.toMatchObject({ rows: [{ failed_attempts: 5, used: true }] });
    await expect(admin!.query("select password_failed_count, password_locked_until from public.auth_users where id = $1", [fixture.userId])).resolves.toMatchObject({ rows: [{ password_failed_count: 0, password_locked_until: null }] });
    await expect(auth.signIn({ email: fixture.email, password: oldPassword })).resolves.toMatchObject({ ok: true });
    await expect(auth.resetPassword({ token: issued.value.resetToken, newPassword: newPassword })).resolves.toMatchObject({ ok: false, error: { code: "auth.resetInvalid" } });
  });

  it("rejects an expired reset token", async () => {
    const auth = new BetterAuthPortAdapter(db);
    const session = await auth.signIn({ email: fixture.email, password: oldPassword });
    if (!session.ok || "challengeId" in session.value) throw new Error("Expected fixture session.");
    const issued = await auth.requestPasswordReset({ email: fixture.email, authenticatedSelf: { userId: session.value.identity.userId, sessionId: session.value.sessionId } });
    if (!issued.ok || issued.value.resetToken === undefined) throw new Error("Expected token.");
    await admin!.query("update public.auth_password_reset_tokens set expires_at = now() - interval '1 second' where id = $1::uuid", [issued.value.resetToken.slice(0, issued.value.resetToken.indexOf("."))]);
    await expect(auth.resetPassword({ token: issued.value.resetToken, newPassword })).resolves.toMatchObject({ ok: false, error: { code: "auth.resetInvalid" } });
  });

  it("does not issue a reset token from a session older than fifteen minutes", async () => {
    const auth = new BetterAuthPortAdapter(db);
    const session = await auth.signIn({ email: fixture.email, password: oldPassword });
    if (!session.ok || "challengeId" in session.value) throw new Error("Expected fixture session.");
    await admin!.query("update public.auth_sessions set created_at = now() - interval '16 minutes' where id = $1", [session.value.sessionId]);
    const before = await admin!.query("select count(*)::int as count from public.auth_password_reset_tokens where user_id = $1", [fixture.userId]);
    await expect(auth.requestPasswordReset({ email: fixture.email, authenticatedSelf: { userId: session.value.identity.userId, sessionId: session.value.sessionId } })).resolves.toEqual({ ok: true, value: { status: "reset-token-issued" } });
    await expect(admin!.query("select count(*)::int as count from public.auth_password_reset_tokens where user_id = $1", [fixture.userId])).resolves.toEqual(before);
  });

  it("serializes concurrent reset attempts so exactly one consumes a token", async () => {
    const auth = new BetterAuthPortAdapter(db);
    const session = await auth.signIn({ email: fixture.email, password: oldPassword });
    if (!session.ok || "challengeId" in session.value) throw new Error("Expected fixture session.");
    const issued = await auth.requestPasswordReset({ email: fixture.email, authenticatedSelf: { userId: session.value.identity.userId, sessionId: session.value.sessionId } });
    if (!issued.ok || issued.value.resetToken === undefined) throw new Error("Expected token.");
    const results = await Promise.all([auth.resetPassword({ token: issued.value.resetToken, newPassword }), auth.resetPassword({ token: issued.value.resetToken, newPassword })]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
  });

  it("does not issue a token when the authenticated session belongs to another account", async () => {
    const auth = new BetterAuthPortAdapter(db);
    const otherSession = await auth.signIn({ email: otherUser.email, password: oldPassword });
    if (!otherSession.ok || "challengeId" in otherSession.value) throw new Error("Expected other-user session.");
    const before = await admin!.query("select count(*)::int as count from public.auth_password_reset_tokens where user_id = $1", [fixture.userId]);
    await expect(auth.requestPasswordReset({ email: fixture.email, authenticatedSelf: { userId: otherSession.value.identity.userId, sessionId: otherSession.value.sessionId } })).resolves.toEqual({ ok: true, value: { status: "reset-token-issued" } });
    await expect(admin!.query("select count(*)::int as count from public.auth_password_reset_tokens where user_id = $1", [fixture.userId])).resolves.toEqual(before);
  });

  it("rejects a credential-less account without consuming its valid token", async () => {
    const auth = new BetterAuthPortAdapter(db);
    const session = await auth.signIn({ email: fixture.email, password: newPassword });
    if (!session.ok || "challengeId" in session.value) throw new Error("Expected fixture session.");
    const issued = await auth.requestPasswordReset({ email: fixture.email, authenticatedSelf: { userId: session.value.identity.userId, sessionId: session.value.sessionId } });
    if (!issued.ok || issued.value.resetToken === undefined) throw new Error("Expected token.");
    const tokenId = issued.value.resetToken.slice(0, issued.value.resetToken.indexOf("."));
    await admin!.query("delete from public.auth_accounts where user_id = $1 and provider_id = 'email-password'", [fixture.userId]);
    await expect(auth.resetPassword({ token: issued.value.resetToken, newPassword: oldPassword })).resolves.toMatchObject({ ok: false, error: { code: "auth.resetInvalid" } });
    await expect(admin!.query("select used_at from public.auth_password_reset_tokens where id = $1::uuid", [tokenId])).resolves.toMatchObject({ rows: [{ used_at: null }] });
  });
});
