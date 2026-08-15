import { createPostgresPool, db, pool } from "@opzava/adapters";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { BetterAuthPortAdapter } from "../adapters/better-auth/auth-port-adapter.js";

const migrationUrl = process.env["DATABASE_MIGRATION_URL"];
const enabled = migrationUrl !== undefined && migrationUrl.trim() !== "";
const admin = enabled ? createPostgresPool(migrationUrl!) : null;
const appUrl = process.env["DATABASE_URL"];
const app = appUrl === undefined || appUrl.trim() === "" ? null : createPostgresPool(appUrl);
const orgId = randomUUID();
const otherOrgId = randomUUID();
const projectId = randomUUID();
const otherProjectId = randomUUID();
const ownerId = randomUUID();
const memberId = randomUUID();
const strangerId = randomUUID();
const memberEmail = `invitee-${randomUUID()}@example.test`;

async function seed(): Promise<void> {
  if (admin === null) return;
  process.env["BETTER_AUTH_SECRET"] = "identity-completion-test-secret";
  for (const [id, email] of [[ownerId, `owner-${randomUUID()}@example.test`], [memberId, memberEmail], [strangerId, `stranger-${randomUUID()}@example.test`]] as const) {
    await admin.query("insert into public.auth_users (id, name, email, email_verified) values ($1, $2, $3, true)", [id, id, email]);
  }
  await admin.query("insert into public.organizations (id, slug, name, lifecycle_state) values ($1, $2, 'Identity completion', 'active'), ($3, $4, 'Other identity completion', 'active')", [orgId, `identity-${orgId.slice(0, 8)}`, otherOrgId, `identity-other-${otherOrgId.slice(0, 8)}`]);
  await admin.query("insert into public.workspaces (id, organization_id, slug, name) values ($1, $2, 'identity', 'Identity'), ($3, $4, 'other', 'Other')", [projectId, orgId, otherProjectId, otherOrgId]);
  await admin.query("insert into public.memberships (organization_id, user_id, status, membership_version) values ($1, $2, 'active', 1)", [orgId, ownerId]);
  await admin.query("insert into public.role_grants (organization_id, subject_type, subject_id, role_key, scope_type, scope_id, granted_by_user_id) values ($1, 'user', $2, 'owner', 'organization', $1, $2)", [orgId, ownerId]);
  await admin.query("insert into public.memberships (organization_id, user_id, status, membership_version) values ($1, $2, 'active', 1)", [otherOrgId, ownerId]);
  await admin.query("insert into public.role_grants (organization_id, subject_type, subject_id, role_key, scope_type, scope_id, granted_by_user_id) values ($1, 'user', $2, 'owner', 'organization', $1, $2)", [otherOrgId, ownerId]);
}
async function reset(): Promise<void> {
  if (admin === null) return;
  await admin.query("update public.organizations set lifecycle_state = 'active' where id = any($1::uuid[])", [[orgId, otherOrgId]]);
  await admin.query("delete from public.auth_guest_sessions where organization_id = any($1::uuid[])", [[orgId, otherOrgId]]);
  await admin.query("delete from public.auth_guest_magic_links where organization_id = any($1::uuid[])", [[orgId, otherOrgId]]);
  await admin.query("delete from public.auth_external_identities where organization_id = any($1::uuid[])", [[orgId, otherOrgId]]);
  await admin.query("delete from public.auth_invitations where organization_id = any($1::uuid[])", [[orgId, otherOrgId]]);
  await admin.query("delete from public.auth_sessions where user_id = any($1::text[])", [[ownerId, memberId, strangerId]]);
  await admin.query("delete from public.role_grants where organization_id = $1 and subject_id <> $2", [orgId, ownerId]);
  await admin.query("delete from public.memberships where organization_id = $1 and user_id <> $2", [orgId, ownerId]);
}
async function cleanup(): Promise<void> {
  if (admin === null) return;
  await reset();
  await admin.query("delete from public.role_grants where organization_id = any($1::uuid[])", [[orgId, otherOrgId]]);
  await admin.query("delete from public.memberships where organization_id = any($1::uuid[])", [[orgId, otherOrgId]]);
  await admin.query("delete from public.workspaces where id = any($1::uuid[])", [[projectId, otherProjectId]]);
  await admin.query("delete from public.organizations where id = any($1::uuid[])", [[orgId, otherOrgId]]);
  await admin.query("delete from public.auth_users where id = any($1::text[])", [[ownerId, memberId, strangerId]]);
}

beforeAll(seed);
beforeEach(reset);
afterAll(async () => { await cleanup(); await pool.end(); await admin?.end(); await app?.end(); });

describe.skipIf(!enabled)("ADR-006 identity completion", () => {
  it("accepts an invitation exactly once in one transaction and grants its role", async () => {
    const auth = new BetterAuthPortAdapter(db);
    const created = await auth.createInvitation({ orgId: orgId as import("@opzava/shared-kernel").OrgId, email: memberEmail.toUpperCase(), role: "admin", actor: ownerId as import("@opzava/shared-kernel").UserId });
    if (!created.ok) throw created.error;
    const accepted = await auth.acceptInvitation({ token: created.value.token, userId: memberId as import("@opzava/shared-kernel").UserId });
    if (!accepted.ok) throw accepted.error;
    await expect(admin!.query("select status from public.memberships where organization_id = $1 and user_id = $2", [orgId, memberId])).resolves.toMatchObject({ rows: [{ status: "active" }] });
    await expect(admin!.query("select accepted_at is not null as accepted from public.auth_invitations where id = $1::uuid", [created.value.invitation.id])).resolves.toMatchObject({ rows: [{ accepted: true }] });
    await expect(auth.acceptInvitation({ token: created.value.token, userId: memberId as import("@opzava/shared-kernel").UserId })).resolves.toMatchObject({ ok: false });
  });

  it("keeps an active membership active and additively grants the invited role", async () => {
    const auth = new BetterAuthPortAdapter(db);
    await admin!.query("insert into public.memberships (organization_id, user_id, status, membership_version) values ($1, $2, 'active', 1)", [orgId, memberId]);
    await admin!.query("insert into public.role_grants (organization_id, subject_type, subject_id, role_key, scope_type, scope_id, granted_by_user_id) values ($1, 'user', $2, 'member', 'organization', $1, $3)", [orgId, memberId, ownerId]);
    const created = await auth.createInvitation({ orgId: orgId as import("@opzava/shared-kernel").OrgId, email: memberEmail, role: "admin", actor: ownerId as import("@opzava/shared-kernel").UserId });
    if (!created.ok) throw created.error;
    await expect(auth.acceptInvitation({ token: created.value.token, userId: memberId as import("@opzava/shared-kernel").UserId })).resolves.toMatchObject({ ok: true });
    await expect(admin!.query("select role_key from public.role_grants where organization_id = $1 and subject_id = $2 order by role_key", [orgId, memberId])).resolves.toMatchObject({ rows: [{ role_key: "admin" }, { role_key: "member" }] });
  });

  it("revokes an invitation when its inviter loses the authority it had at creation", async () => {
    const auth = new BetterAuthPortAdapter(db);
    const created = await auth.createInvitation({ orgId: orgId as import("@opzava/shared-kernel").OrgId, email: memberEmail, role: "admin", actor: ownerId as import("@opzava/shared-kernel").UserId });
    if (!created.ok) throw created.error;
    await admin!.query("delete from public.role_grants where organization_id = $1 and subject_id = $2 and role_key = 'owner'", [orgId, ownerId]);
    await admin!.query("insert into public.role_grants (organization_id, subject_type, subject_id, role_key, scope_type, scope_id, granted_by_user_id) values ($1, 'user', $2, 'admin', 'organization', $1, $2)", [orgId, ownerId]);
    await expect(auth.acceptInvitation({ token: created.value.token, userId: memberId as import("@opzava/shared-kernel").UserId })).resolves.toMatchObject({ ok: false, error: { code: "auth.invitationInvalid" } });
    await expect(admin!.query("select revoked_at is not null as revoked from public.auth_invitations where id = $1::uuid", [created.value.invitation.id])).resolves.toMatchObject({ rows: [{ revoked: true }] });
  });

  it("rejects an admin attempting to create an admin invitation", async () => {
    const auth = new BetterAuthPortAdapter(db);
    await admin!.query("insert into public.memberships (organization_id, user_id, status, membership_version) values ($1, $2, 'active', 1)", [orgId, strangerId]);
    await admin!.query("insert into public.role_grants (organization_id, subject_type, subject_id, role_key, scope_type, scope_id, granted_by_user_id) values ($1, 'user', $2, 'admin', 'organization', $1, $3)", [orgId, strangerId, ownerId]);
    await expect(auth.createInvitation({ orgId: orgId as import("@opzava/shared-kernel").OrgId, email: memberEmail, role: "admin", actor: strangerId as import("@opzava/shared-kernel").UserId })).resolves.toMatchObject({ ok: false, error: { code: "auth.invitationForbidden" } });
    await expect(auth.createInvitation({ orgId: orgId as import("@opzava/shared-kernel").OrgId, email: memberEmail, role: "member", actor: strangerId as import("@opzava/shared-kernel").UserId })).resolves.toMatchObject({ ok: true });
  });

  it("revokes and reports a membership conflict rather than reactivating a removed member", async () => {
    const auth = new BetterAuthPortAdapter(db);
    const created = await auth.createInvitation({ orgId: orgId as import("@opzava/shared-kernel").OrgId, email: memberEmail, role: "member", actor: ownerId as import("@opzava/shared-kernel").UserId });
    if (!created.ok) throw created.error;
    await admin!.query("insert into public.memberships (organization_id, user_id, status, membership_version) values ($1, $2, 'removed', 1)", [orgId, memberId]);
    await expect(auth.acceptInvitation({ token: created.value.token, userId: memberId as import("@opzava/shared-kernel").UserId })).resolves.toMatchObject({ ok: false, error: { code: "auth.invitationMembershipConflict" } });
    await expect(admin!.query("select status from public.memberships where organization_id = $1 and user_id = $2", [orgId, memberId])).resolves.toMatchObject({ rows: [{ status: "removed" }] });
    await expect(admin!.query("select revoked_at is not null as revoked from public.auth_invitations where id = $1::uuid", [created.value.invitation.id])).resolves.toMatchObject({ rows: [{ revoked: true }] });
  });

  it("rejects and revokes invitation acceptance for a suspended organization", async () => {
    const auth = new BetterAuthPortAdapter(db);
    const created = await auth.createInvitation({ orgId: orgId as import("@opzava/shared-kernel").OrgId, email: memberEmail, role: "member", actor: ownerId as import("@opzava/shared-kernel").UserId });
    if (!created.ok) throw created.error;
    await admin!.query("update public.organizations set lifecycle_state = 'suspended' where id = $1", [orgId]);
    await expect(auth.acceptInvitation({ token: created.value.token, userId: memberId as import("@opzava/shared-kernel").UserId })).resolves.toMatchObject({ ok: false, error: { code: "auth.invitationInvalid" } });
    await expect(admin!.query("select revoked_at is not null as revoked from public.auth_invitations where id = $1::uuid", [created.value.invitation.id])).resolves.toMatchObject({ rows: [{ revoked: true }] });
  });

  it("rejects expired, revoked, wrong-email, and concurrent invitation acceptance without granting membership", async () => {
    const auth = new BetterAuthPortAdapter(db);
    const created = await auth.createInvitation({ orgId: orgId as import("@opzava/shared-kernel").OrgId, email: memberEmail, role: "member", actor: ownerId as import("@opzava/shared-kernel").UserId });
    if (!created.ok) throw created.error;
    await admin!.query("update public.auth_invitations set expires_at = now() - interval '1 second' where id = $1::uuid", [created.value.invitation.id]);
    await expect(auth.acceptInvitation({ token: created.value.token, userId: memberId as import("@opzava/shared-kernel").UserId })).resolves.toMatchObject({ ok: false });
    await expect(admin!.query("select count(*)::int as count from public.memberships where organization_id = $1", [orgId])).resolves.toMatchObject({ rows: [{ count: 1 }] });
    const revoked = await auth.createInvitation({ orgId: orgId as import("@opzava/shared-kernel").OrgId, email: memberEmail, role: "member", actor: ownerId as import("@opzava/shared-kernel").UserId });
    if (!revoked.ok) throw revoked.error;
    await expect(auth.revokeInvitation({ id: revoked.value.invitation.id, orgId: orgId as import("@opzava/shared-kernel").OrgId, actor: ownerId as import("@opzava/shared-kernel").UserId })).resolves.toMatchObject({ ok: true });
    await expect(auth.acceptInvitation({ token: revoked.value.token, userId: memberId as import("@opzava/shared-kernel").UserId })).resolves.toMatchObject({ ok: false });
    const second = await auth.createInvitation({ orgId: orgId as import("@opzava/shared-kernel").OrgId, email: memberEmail, role: "member", actor: ownerId as import("@opzava/shared-kernel").UserId });
    if (!second.ok) throw second.error;
    const results = await Promise.all([auth.acceptInvitation({ token: second.value.token, userId: memberId as import("@opzava/shared-kernel").UserId }), auth.acceptInvitation({ token: second.value.token, userId: memberId as import("@opzava/shared-kernel").UserId })]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
    await expect(auth.createInvitation({ orgId: orgId as import("@opzava/shared-kernel").OrgId, email: memberEmail, role: "member", actor: strangerId as import("@opzava/shared-kernel").UserId })).resolves.toMatchObject({ ok: false, error: { code: "auth.invitationForbidden" } });
  });

  it("clamps guest-link TTL, enforces the workspace tenant boundary, and never creates membership", async () => {
    const auth = new BetterAuthPortAdapter(db);
    const created = await auth.createGuestMagicLink({ orgId: orgId as import("@opzava/shared-kernel").OrgId, projectId, email: "CLIENT@EXAMPLE.TEST", actor: ownerId as import("@opzava/shared-kernel").UserId, expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000) });
    if (!created.ok) throw created.error;
    expect(created.value.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 24 * 60 * 60 * 1000 + 1_000);
    await expect(auth.createGuestMagicLink({ orgId: orgId as import("@opzava/shared-kernel").OrgId, projectId: otherProjectId, email: "client@example.test", actor: ownerId as import("@opzava/shared-kernel").UserId })).resolves.toMatchObject({ ok: false });
    await expect(auth.createGuestMagicLink({ orgId: orgId as import("@opzava/shared-kernel").OrgId, projectId, email: "client@example.test", actor: strangerId as import("@opzava/shared-kernel").UserId })).resolves.toMatchObject({ ok: false, error: { code: "auth.invitationForbidden" } });
    const session = await auth.consumeGuestMagicLink({ token: created.value.guestMagicLinkToken });
    if (!session.ok) throw session.error;
    await expect(auth.consumeGuestMagicLink({ token: created.value.guestMagicLinkToken })).resolves.toMatchObject({ ok: false });
    await expect(auth.resolveGuestSession(session.value.guestSessionToken)).resolves.toMatchObject({ ok: true, value: { orgId, projectId } });
    await expect(admin!.query("select count(*)::int as count from public.memberships where organization_id = $1", [orgId])).resolves.toMatchObject({ rows: [{ count: 1 }] });
    await admin!.query("update public.auth_guest_sessions set expires_at = now() - interval '1 second' where token_hash is not null");
    await expect(auth.resolveGuestSession(session.value.guestSessionToken)).resolves.toEqual({ ok: true, value: null });
    const second = await auth.createGuestMagicLink({ orgId: orgId as import("@opzava/shared-kernel").OrgId, projectId, email: "client@example.test", actor: ownerId as import("@opzava/shared-kernel").UserId });
    if (!second.ok) throw second.error;
    const secondSession = await auth.consumeGuestMagicLink({ token: second.value.guestMagicLinkToken });
    if (!secondSession.ok) throw secondSession.error;
    await admin!.query("update public.auth_guest_sessions set revoked_at = now() where token_hash is not null and expires_at > now()");
    await expect(auth.resolveGuestSession(secondSession.value.guestSessionToken)).resolves.toEqual({ ok: true, value: null });
  });

  it("fails closed for guest create, consume, and resolution when the organization is suspended", async () => {
    const auth = new BetterAuthPortAdapter(db);
    const resolvable = await auth.createGuestMagicLink({ orgId: orgId as import("@opzava/shared-kernel").OrgId, projectId, email: "resolve-client@example.test", actor: ownerId as import("@opzava/shared-kernel").UserId });
    const consumable = await auth.createGuestMagicLink({ orgId: orgId as import("@opzava/shared-kernel").OrgId, projectId, email: "consume-client@example.test", actor: ownerId as import("@opzava/shared-kernel").UserId });
    if (!resolvable.ok || !consumable.ok) throw new Error("Expected guest links.");
    const session = await auth.consumeGuestMagicLink({ token: resolvable.value.guestMagicLinkToken });
    if (!session.ok) throw session.error;
    await admin!.query("update public.organizations set lifecycle_state = 'suspended' where id = $1", [orgId]);
    await expect(auth.createGuestMagicLink({ orgId: orgId as import("@opzava/shared-kernel").OrgId, projectId, email: "blocked-client@example.test", actor: ownerId as import("@opzava/shared-kernel").UserId })).resolves.toMatchObject({ ok: false, error: { code: "auth.invitationForbidden" } });
    await expect(auth.consumeGuestMagicLink({ token: consumable.value.guestMagicLinkToken })).resolves.toMatchObject({ ok: false, error: { code: "auth.guestLinkInvalid" } });
    await expect(auth.resolveGuestSession(session.value.guestSessionToken)).resolves.toEqual({ ok: true, value: null });
  });

  it("uses RLS for direct tenant reads while unauthenticated directory consumption can cross tenants", async () => {
    if (app === null) throw new Error("DATABASE_URL must use opzava_app for tenant RLS coverage.");
    const auth = new BetterAuthPortAdapter(db);
    const own = await auth.createGuestMagicLink({ orgId: orgId as import("@opzava/shared-kernel").OrgId, projectId, email: "own-client@example.test", actor: ownerId as import("@opzava/shared-kernel").UserId });
    if (!own.ok) throw own.error;
    await expect(auth.consumeGuestMagicLink({ token: own.value.guestMagicLinkToken })).resolves.toMatchObject({ ok: true });
    const other = await auth.createGuestMagicLink({ orgId: otherOrgId as import("@opzava/shared-kernel").OrgId, projectId: otherProjectId, email: "other-client@example.test", actor: ownerId as import("@opzava/shared-kernel").UserId });
    if (!other.ok) throw other.error;
    await expect(auth.consumeGuestMagicLink({ token: other.value.guestMagicLinkToken })).resolves.toMatchObject({ ok: true });
    await admin!.query("insert into public.auth_invitations (id, organization_id, email, role, salt, token_hash, token_lookup_digest, invited_by_user_id, expires_at) values ($1, $2, 'one@example.test', 'member', 'salt', 'hash', $3, $4, now() + interval '1 hour'), ($5, $6, 'two@example.test', 'member', 'salt', 'hash', $7, $4, now() + interval '1 hour')", [randomUUID(), orgId, randomUUID(), ownerId, randomUUID(), otherOrgId, randomUUID()]);
    const client = await app.connect();
    try {
      for (const table of ["auth_invitations", "auth_external_identities", "auth_guest_magic_links", "auth_guest_sessions"] as const) {
        await client.query("begin");
        await expect(client.query(`select organization_id from public.${table}`)).resolves.toMatchObject({ rows: [] });
        await client.query("select set_config('app.current_org', $1, true)", [orgId]);
        const visible = await client.query(`select organization_id::text from public.${table}`);
        expect(visible.rows).not.toHaveLength(0);
        expect(visible.rows.every((row) => row.organization_id === orgId)).toBe(true);
        await client.query("rollback");
      }
    } finally { client.release(); }
    await expect(admin!.query("select indexname from pg_indexes where schemaname = 'public' and indexname = any($1::text[]) order by indexname", [["auth_invitations_token_lookup_digest_unique", "auth_guest_magic_links_token_lookup_digest_unique", "auth_guest_sessions_token_lookup_digest_unique"]])).resolves.toMatchObject({ rows: [
      { indexname: "auth_guest_magic_links_token_lookup_digest_unique" },
      { indexname: "auth_guest_sessions_token_lookup_digest_unique" },
      { indexname: "auth_invitations_token_lookup_digest_unique" }
    ] });
  });

  it("rejects cross-tenant projects and external identities through composite foreign keys", async () => {
    if (app === null) throw new Error("DATABASE_URL must use opzava_app for composite FK coverage.");
    const externalIdentityId = randomUUID();
    await admin!.query("insert into public.auth_external_identities (id, organization_id, project_id, email, email_hash) values ($1, $2, $3, 'other-fk@example.test', 'other-fk')", [externalIdentityId, otherOrgId, otherProjectId]);
    const client = await app.connect();
    const expectForeignKeyViolation = async (query: string, values: unknown[]) => {
      await client.query("begin");
      try {
        await client.query("select set_config('app.current_org', $1, true)", [orgId]);
        await expect(client.query(query, values)).rejects.toMatchObject({ code: "23503" });
      } finally {
        await client.query("rollback");
      }
    };
    try {
      await expectForeignKeyViolation(
        "insert into public.auth_external_identities (id, organization_id, project_id, email, email_hash) values ($1, $2, $3, 'cross-project@example.test', 'cross-project')",
        [randomUUID(), orgId, otherProjectId]
      );
      await expectForeignKeyViolation(
        "insert into public.auth_guest_magic_links (id, organization_id, project_id, email, salt, token_hash, token_lookup_digest, created_by_user_id, expires_at) values ($1, $2, $3, 'cross-project@example.test', 'salt', 'hash', $4, $5, now() + interval '1 hour')",
        [randomUUID(), orgId, otherProjectId, randomUUID(), ownerId]
      );
      await expectForeignKeyViolation(
        "insert into public.auth_guest_sessions (id, external_identity_id, project_id, organization_id, salt, token_hash, token_lookup_digest, expires_at) values ($1, $2, $3, $4, 'salt', 'hash', $5, now() + interval '1 hour')",
        [randomUUID(), externalIdentityId, otherProjectId, orgId, randomUUID()]
      );
      await expectForeignKeyViolation(
        "insert into public.auth_guest_sessions (id, external_identity_id, project_id, organization_id, salt, token_hash, token_lookup_digest, expires_at) values ($1, $2, $3, $4, 'salt', 'hash', $5, now() + interval '1 hour')",
        [randomUUID(), externalIdentityId, projectId, orgId, randomUUID()]
      );
    } finally {
      client.release();
    }
  });
});
