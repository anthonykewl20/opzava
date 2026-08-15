import { createPostgresPool, db, pool } from "@opzava/adapters";
import { createHash, createSign, generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { BetterAuthPortAdapter } from "../adapters/better-auth/auth-port-adapter.js";
import { hashPassword } from "../adapters/better-auth/password-hasher.js";

// The synthetic ceremonies below deliberately exercise SimpleWebAuthn's real
// verification path. They are not mocks: ES256 signs authenticatorData ||
// SHA-256(clientDataJSON), and registration carries a spec-shaped none attestation.
process.env["BETTER_AUTH_SECRET"] = "passkeys-integration-test-secret";

const migrationUrl = process.env["DATABASE_MIGRATION_URL"];
const enabled = migrationUrl !== undefined && migrationUrl.trim() !== "";
const admin = enabled ? createPostgresPool(migrationUrl!) : null;
const origin = "https://passkeys.opzava.test";
const rpID = "passkeys.opzava.test";
const password = "Passkeys-Integration-Password-1";
const userA = { id: randomUUID(), email: `passkey-a-${randomUUID()}@example.test`, orgId: randomUUID(), workspaceId: randomUUID() };
const userB = { id: randomUUID(), email: `passkey-b-${randomUUID()}@example.test`, orgId: randomUUID(), workspaceId: randomUUID() };

type KeyPair = ReturnType<typeof generateKeyPairSync>;
type Ceremony = { readonly challengeId: import("@opzava/ports").PasskeyChallengeId; readonly options: Readonly<Record<string, unknown>> };

function b64url(bytes: Uint8Array): string { return Buffer.from(bytes).toString("base64url"); }
function bytes(value: string): Buffer { return Buffer.from(value, "base64url"); }
function sha256(value: string | Uint8Array): Buffer { return createHash("sha256").update(value).digest(); }
function cborBytes(value: Uint8Array): Buffer {
  const length = value.length;
  if (length < 24) return Buffer.concat([Buffer.from([0x40 | length]), Buffer.from(value)]);
  if (length < 256) return Buffer.concat([Buffer.from([0x58, length]), Buffer.from(value)]);
  return Buffer.concat([Buffer.from([0x59, length >> 8, length & 0xff]), Buffer.from(value)]);
}
function cborText(value: string): Buffer { const data = Buffer.from(value); return Buffer.concat([Buffer.from([0x60 | data.length]), data]); }
function cosePublicKey(pair: KeyPair): Buffer {
  const jwk = pair.publicKey.export({ format: "jwk" });
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || jwk.x === undefined || jwk.y === undefined) throw new Error("Expected a P-256 JWK.");
  // {1: EC2, 3: ES256, -1: P-256, -2: x, -3: y}
  return Buffer.concat([Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21]), cborBytes(bytes(jwk.x)), Buffer.from([0x22]), cborBytes(bytes(jwk.y))]);
}
function clientData(type: "webauthn.create" | "webauthn.get", challenge: string, ceremonyOrigin = origin): Buffer {
  return Buffer.from(JSON.stringify({ type, challenge, origin: ceremonyOrigin, crossOrigin: false }));
}
function authenticatorData(input: { readonly ceremonyRpID?: string; readonly flags: number; readonly counter: number; readonly credential?: { readonly id: Buffer; readonly pair: KeyPair } }): Buffer {
  const fixed = Buffer.alloc(37);
  sha256(input.ceremonyRpID ?? rpID).copy(fixed, 0);
  fixed.writeUInt8(input.flags, 32);
  fixed.writeUInt32BE(input.counter, 33);
  if (input.credential === undefined) return fixed;
  const credentialLength = Buffer.alloc(2);
  credentialLength.writeUInt16BE(input.credential.id.length);
  return Buffer.concat([fixed, Buffer.alloc(16), credentialLength, input.credential.id, cosePublicKey(input.credential.pair)]);
}
function registrationResponse(ceremony: Ceremony, pair = generateKeyPairSync("ec", { namedCurve: "P-256" }), credentialId = randomBytes(32)) {
  const client = clientData("webauthn.create", ceremony.challengeId);
  const authData = authenticatorData({ flags: 0x45, counter: 0, credential: { id: credentialId, pair } });
  const attestationObject = Buffer.concat([Buffer.from([0xa3]), cborText("fmt"), cborText("none"), cborText("authData"), cborBytes(authData), cborText("attStmt"), Buffer.from([0xa0])]);
  return { pair, credentialId, response: { id: b64url(credentialId), rawId: b64url(credentialId), type: "public-key", clientExtensionResults: {}, response: { clientDataJSON: b64url(client), attestationObject: b64url(attestationObject), transports: ["internal"] } } satisfies Readonly<Record<string, unknown>> };
}
function authenticationResponse(input: { readonly ceremony: Ceremony; readonly pair: KeyPair; readonly credentialId: Buffer; readonly counter: number; readonly flags?: number; readonly ceremonyOrigin?: string; readonly ceremonyRpID?: string }) {
  const client = clientData("webauthn.get", input.ceremony.challengeId, input.ceremonyOrigin);
  const authData = authenticatorData({ flags: input.flags ?? 0x05, counter: input.counter, ...(input.ceremonyRpID === undefined ? {} : { ceremonyRpID: input.ceremonyRpID }) });
  const signer = createSign("SHA256");
  signer.update(Buffer.concat([authData, sha256(client)]));
  signer.end();
  const signature = signer.sign(input.pair.privateKey);
  return { id: b64url(input.credentialId), rawId: b64url(input.credentialId), type: "public-key", clientExtensionResults: {}, response: { clientDataJSON: b64url(client), authenticatorData: b64url(authData), signature: b64url(signature) } } satisfies Readonly<Record<string, unknown>>;
}

function auth(): BetterAuthPortAdapter { return new BetterAuthPortAdapter(db, {}, { rpID, rpName: "Passkey tests", origins: [origin] }); }
async function signIn(user = userA) {
  const result = await auth().signIn({ email: user.email, password, userAgent: "passkey-integration", ipAddress: "198.51.100.90" });
  if (!result.ok || "challengeId" in result.value) throw new Error("Expected a password session.");
  return result.value;
}
async function enroll(user = userA) {
  const session = await signIn(user);
  const started = await auth().startPasskeyEnrollment({ userId: session.identity.userId, currentSessionId: session.sessionId, password });
  if (!started.ok) throw started.error;
  const ceremony = { challengeId: started.value.challengeId, options: started.value.options };
  const created = registrationResponse(ceremony);
  const finished = await auth().finishPasskeyEnrollment({ challengeId: ceremony.challengeId, response: created.response, name: "Integration key" });
  if (!finished.ok) throw finished.error;
  return { session, ceremony, created, passkey: finished.value };
}
async function startAuthentication(): Promise<Ceremony> {
  const started = await auth().startPasskeySignIn();
  if (!started.ok) throw started.error;
  return { challengeId: started.value.challengeId, options: started.value.options };
}
async function seedUser(user: typeof userA, label: string): Promise<void> {
  await admin!.query("insert into public.auth_users (id, name, email, email_verified) values ($1, $2, $3, true)", [user.id, label, user.email]);
  await admin!.query("insert into public.auth_accounts (id, user_id, account_id, provider_id, password) values ($1, $2, $3, 'email-password', $4)", [randomUUID(), user.id, user.email, await hashPassword(password)]);
  await admin!.query("insert into public.organizations (id, slug, name, lifecycle_state) values ($1, $2, $3, 'active')", [user.orgId, `passkeys-${user.orgId.slice(0, 8)}`, label]);
  await admin!.query("insert into public.workspaces (id, organization_id, slug, name) values ($1, $2, 'passkeys', $3)", [user.workspaceId, user.orgId, label]);
  await admin!.query("insert into public.memberships (organization_id, user_id, status, membership_version) values ($1, $2, 'active', 7)", [user.orgId, user.id]);
}
async function reset(): Promise<void> {
  if (admin === null) return;
  await admin.query("delete from public.auth_passkey_challenges where user_id = any($1::text[])", [[userA.id, userB.id]]);
  await admin.query("delete from public.auth_passkeys where user_id = any($1::text[])", [[userA.id, userB.id]]);
  await admin.query("delete from public.auth_mfa_challenges where user_id = any($1::text[])", [[userA.id, userB.id]]);
  await admin.query("delete from public.auth_two_factor where user_id = any($1::text[])", [[userA.id, userB.id]]);
  await admin.query("delete from public.auth_sessions where user_id = any($1::text[])", [[userA.id, userB.id]]);
  await admin.query("update public.auth_users set two_factor_enabled = false, password_failed_count = 0, password_locked_until = null where id = any($1::text[])", [[userA.id, userB.id]]);
}

async function withProductionPasskeysUnset(run: () => Promise<void>): Promise<void> {
  const names = ["NODE_ENV", "APP_URL", "BETTER_AUTH_URL", "PASSKEY_RP_ID", "PASSKEY_RP_NAME", "PASSKEY_RP_ORIGINS"] as const;
  const before = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  process.env["NODE_ENV"] = "production";
  process.env["APP_URL"] = "https://production.opzava.test";
  process.env["BETTER_AUTH_URL"] = "https://production.opzava.test";
  delete process.env["PASSKEY_RP_ID"];
  delete process.env["PASSKEY_RP_NAME"];
  delete process.env["PASSKEY_RP_ORIGINS"];
  try { await run(); } finally {
    for (const name of names) {
      const value = before[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}
async function cleanup(): Promise<void> {
  if (admin === null) return;
  await reset();
  await admin.query("delete from public.memberships where organization_id = any($1::uuid[])", [[userA.orgId, userB.orgId]]);
  await admin.query("delete from public.workspaces where id = any($1::uuid[])", [[userA.workspaceId, userB.workspaceId]]);
  await admin.query("delete from public.organizations where id = any($1::uuid[])", [[userA.orgId, userB.orgId]]);
  await admin.query("delete from public.auth_accounts where user_id = any($1::text[])", [[userA.id, userB.id]]);
  await admin.query("delete from public.auth_users where id = any($1::text[])", [[userA.id, userB.id]]);
}

beforeAll(async () => { if (admin !== null) { await seedUser(userA, "Passkey A"); await seedUser(userB, "Passkey B"); } });
beforeEach(reset);
afterAll(async () => { await cleanup(); await pool.end(); await admin?.end(); });

describe.skipIf(!enabled)("passkey integration", () => {
  it("keeps password authentication available when production passkey RP configuration is absent", async () => {
    await withProductionPasskeysUnset(async () => {
      const adapter = new BetterAuthPortAdapter(db);
      await expect(adapter.signIn({ email: userA.email, password })).resolves.toMatchObject({ ok: true });
      await expect(adapter.startPasskeyEnrollment({ userId: userA.id as import("@opzava/shared-kernel").UserId, currentSessionId: "missing" as import("@opzava/ports").SessionId, password })).resolves.toMatchObject({
        ok: false, error: { code: "auth.passkeyUnavailable" }
      });
    });
  });

  it("enrolls a none-attested ES256 credential once and rejects challenge replay", async () => {
    const session = await signIn();
    const started = await auth().startPasskeyEnrollment({ userId: session.identity.userId, currentSessionId: session.sessionId, password });
    if (!started.ok) throw started.error;
    const ceremony = { challengeId: started.value.challengeId, options: started.value.options };
    const created = registrationResponse(ceremony);
    await expect(auth().finishPasskeyEnrollment({ challengeId: ceremony.challengeId, response: created.response, name: "Laptop" })).resolves.toMatchObject({ ok: true, value: { name: "Laptop", transports: ["internal"] } });
    await expect(admin!.query("select credential_id, counter, transports from public.auth_passkeys where user_id = $1", [userA.id])).resolves.toMatchObject({ rows: [{ credential_id: b64url(created.credentialId), counter: "0", transports: ["internal"] }] });
    await expect(auth().finishPasskeyEnrollment({ challengeId: ceremony.challengeId, response: created.response })).resolves.toMatchObject({ ok: false, error: { code: "auth.passkeyVerificationFailed" } });
  });

  it("issues a UV passkey session with password-session hygiene and pinned membership", async () => {
    const enrolled = await enroll(); const ceremony = await startAuthentication();
    const result = await auth().finishPasskeySignIn({ challengeId: ceremony.challengeId, response: authenticationResponse({ ceremony, pair: enrolled.created.pair, credentialId: enrolled.created.credentialId, counter: 1 }), userAgent: "passkey-integration", ipAddress: "198.51.100.90" });
    if (!result.ok) throw result.error;
    expect(result.value.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.value.identity.activeMembership.orgId).toBe(userA.orgId);
    expect(result.value.identity.activeMembership.membershipVersion).toBe(7);
    expect(result.value.mfaSatisfiedAt).toBeInstanceOf(Date);
    await expect(admin!.query("select active_organization_id::text, membership_version, mfa_satisfied_at is not null as mfa, expires_at > now() + interval '6 days' as long_lived, user_agent, ip_address from public.auth_sessions where token = $1", [result.value.sessionToken])).resolves.toMatchObject({ rows: [{ active_organization_id: userA.orgId, membership_version: 7, mfa: true, long_lived: true, user_agent: "passkey-integration", ip_address: "198.51.100.90" }] });
  });

  it("lets a passkey satisfy two-factor login without creating a TOTP challenge", async () => {
    const enrolled = await enroll();
    await admin!.query("insert into public.auth_two_factor (id, user_id, secret, backup_codes, verified) values ($1, $2, 'unused', '[]', true)", [randomUUID(), userA.id]);
    await admin!.query("update public.auth_users set two_factor_enabled = true where id = $1", [userA.id]);
    const ceremony = await startAuthentication();
    await expect(auth().finishPasskeySignIn({ challengeId: ceremony.challengeId, response: authenticationResponse({ ceremony, pair: enrolled.created.pair, credentialId: enrolled.created.credentialId, counter: 1 }) })).resolves.toMatchObject({ ok: true, value: { mfaSatisfiedAt: expect.any(Date) } });
    await expect(admin!.query("select count(*)::int as count from public.auth_mfa_challenges where user_id = $1", [userA.id])).resolves.toMatchObject({ rows: [{ count: 0 }] });
  });

  it("allows UV passkey sign-in after the password factor is locked", async () => {
    const enrolled = await enroll();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await auth().signIn({ email: userA.email, password: "wrong-password" });
    }
    await expect(auth().signIn({ email: userA.email, password })).resolves.toMatchObject({ ok: false, error: { code: "auth.mfaChallengeUnavailable" } });
    const ceremony = await startAuthentication();
    await expect(auth().finishPasskeySignIn({
      challengeId: ceremony.challengeId,
      response: authenticationResponse({ ceremony, pair: enrolled.created.pair, credentialId: enrolled.created.credentialId, counter: 1 })
    })).resolves.toMatchObject({ ok: true });
  });

  it("returns fresh step-up evidence and rejects a different credential", async () => {
    const enrolled = await enroll(); const other = await enroll(userB);
    const wrong = await auth().startPasskeyStepUp({ userId: enrolled.session.identity.userId, currentSessionId: enrolled.session.sessionId });
    if (!wrong.ok) throw wrong.error;
    await expect(auth().finishPasskeyStepUp({ challengeId: wrong.value.challengeId, currentSessionId: enrolled.session.sessionId, userId: enrolled.session.identity.userId, response: authenticationResponse({ ceremony: wrong.value, pair: other.created.pair, credentialId: other.created.credentialId, counter: 1 }) })).resolves.toMatchObject({ ok: false });
    const stepUp = await auth().startPasskeyStepUp({ userId: enrolled.session.identity.userId, currentSessionId: enrolled.session.sessionId });
    if (!stepUp.ok) throw stepUp.error;
    await expect(auth().finishPasskeyStepUp({ challengeId: stepUp.value.challengeId, currentSessionId: enrolled.session.sessionId, userId: enrolled.session.identity.userId, response: authenticationResponse({ ceremony: stepUp.value, pair: enrolled.created.pair, credentialId: enrolled.created.credentialId, counter: 1 }) })).resolves.toMatchObject({ ok: true, value: { verifiedAt: expect.any(Date) } });
  });

  it("rejects an assertion without UV and issues no session", async () => {
    const enrolled = await enroll(); const ceremony = await startAuthentication();
    await expect(auth().finishPasskeySignIn({ challengeId: ceremony.challengeId, response: authenticationResponse({ ceremony, pair: enrolled.created.pair, credentialId: enrolled.created.credentialId, counter: 1, flags: 0x01 }) })).resolves.toMatchObject({ ok: false });
    await expect(admin!.query("select count(*)::int as count from public.auth_sessions where user_id = $1 and mfa_satisfied_at is not null", [userA.id])).resolves.toMatchObject({ rows: [{ count: 0 }] });
  });

  it("rejects wrong origin and RP ID assertions without issuing sessions", async () => {
    const enrolled = await enroll();
    const badOrigin = await startAuthentication();
    await expect(auth().finishPasskeySignIn({ challengeId: badOrigin.challengeId, response: authenticationResponse({ ceremony: badOrigin, pair: enrolled.created.pair, credentialId: enrolled.created.credentialId, counter: 1, ceremonyOrigin: "https://evil.example.test" }) })).resolves.toMatchObject({ ok: false });
    const badRp = await startAuthentication();
    await expect(auth().finishPasskeySignIn({ challengeId: badRp.challengeId, response: authenticationResponse({ ceremony: badRp, pair: enrolled.created.pair, credentialId: enrolled.created.credentialId, counter: 1, ceremonyRpID: "evil.example.test" }) })).resolves.toMatchObject({ ok: false });
    await expect(admin!.query("select count(*)::int as count from public.auth_sessions where user_id = $1 and mfa_satisfied_at is not null", [userA.id])).resolves.toMatchObject({ rows: [{ count: 0 }] });
  });

  it("rejects counter regression and retains the advanced counter", async () => {
    const enrolled = await enroll(); const first = await startAuthentication();
    await expect(auth().finishPasskeySignIn({ challengeId: first.challengeId, response: authenticationResponse({ ceremony: first, pair: enrolled.created.pair, credentialId: enrolled.created.credentialId, counter: 2 }) })).resolves.toMatchObject({ ok: true });
    const regressed = await startAuthentication();
    await expect(auth().finishPasskeySignIn({ challengeId: regressed.challengeId, response: authenticationResponse({ ceremony: regressed, pair: enrolled.created.pair, credentialId: enrolled.created.credentialId, counter: 2 }) })).resolves.toMatchObject({ ok: false });
    await expect(admin!.query("select counter from public.auth_passkeys where user_id = $1", [userA.id])).resolves.toMatchObject({ rows: [{ counter: "2" }] });
  });

  it("has one winner for concurrent finish of a single ceremony", async () => {
    const enrolled = await enroll(); const ceremony = await startAuthentication();
    const response = authenticationResponse({ ceremony, pair: enrolled.created.pair, credentialId: enrolled.created.credentialId, counter: 1 });
    const results = await Promise.all([auth().finishPasskeySignIn({ challengeId: ceremony.challengeId, response }), auth().finishPasskeySignIn({ challengeId: ceremony.challengeId, response })]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
  });

  it("has one winner for concurrent finish of a single step-up ceremony", async () => {
    const enrolled = await enroll();
    const stepUp = await auth().startPasskeyStepUp({ userId: enrolled.session.identity.userId, currentSessionId: enrolled.session.sessionId });
    if (!stepUp.ok) throw stepUp.error;
    const response = authenticationResponse({ ceremony: stepUp.value, pair: enrolled.created.pair, credentialId: enrolled.created.credentialId, counter: 1 });
    const results = await Promise.all([
      auth().finishPasskeyStepUp({ challengeId: stepUp.value.challengeId, currentSessionId: enrolled.session.sessionId, userId: enrolled.session.identity.userId, response }),
      auth().finishPasskeyStepUp({ challengeId: stepUp.value.challengeId, currentSessionId: enrolled.session.sessionId, userId: enrolled.session.identity.userId, response })
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
  });

  it("renames the owner passkey, exposes the new name, and rejects another user", async () => {
    const enrolledA = await enroll();
    const enrolledB = await enroll(userB);
    await expect(auth().renamePasskey({
      userId: enrolledA.session.identity.userId,
      currentSessionId: enrolledA.session.sessionId,
      password,
      passkeyId: enrolledA.passkey.id,
      name: "Renamed integration key"
    })).resolves.toMatchObject({ ok: true });
    await expect(auth().listPasskeys({ userId: enrolledA.session.identity.userId })).resolves.toMatchObject({
      ok: true, value: [expect.objectContaining({ id: enrolledA.passkey.id, name: "Renamed integration key" })]
    });
    await expect(auth().renamePasskey({
      userId: enrolledB.session.identity.userId,
      currentSessionId: enrolledB.session.sessionId,
      password,
      passkeyId: enrolledA.passkey.id,
      name: "Stolen name"
    })).resolves.toMatchObject({ ok: false });
    await expect(auth().listPasskeys({ userId: enrolledA.session.identity.userId })).resolves.toMatchObject({
      ok: true, value: [expect.objectContaining({ id: enrolledA.passkey.id, name: "Renamed integration key" })]
    });
  });

  it("rejects a revoked passkey", async () => {
    const enrolled = await enroll();
    await expect(auth().revokePasskey({ userId: enrolled.session.identity.userId, currentSessionId: enrolled.session.sessionId, password, passkeyId: enrolled.passkey.id })).resolves.toMatchObject({ ok: true });
    const ceremony = await startAuthentication();
    await expect(auth().finishPasskeySignIn({ challengeId: ceremony.challengeId, response: authenticationResponse({ ceremony, pair: enrolled.created.pair, credentialId: enrolled.created.credentialId, counter: 1 }) })).resolves.toMatchObject({ ok: false });
  });

  it("binds a step-up challenge to its user so another user's credential cannot satisfy it", async () => {
    const enrolledA = await enroll(); const enrolledB = await enroll(userB);
    const stepUp = await auth().startPasskeyStepUp({ userId: enrolledB.session.identity.userId, currentSessionId: enrolledB.session.sessionId });
    if (!stepUp.ok) throw stepUp.error;
    await expect(auth().finishPasskeyStepUp({ challengeId: stepUp.value.challengeId, userId: enrolledB.session.identity.userId, currentSessionId: enrolledB.session.sessionId, response: authenticationResponse({ ceremony: stepUp.value, pair: enrolledA.created.pair, credentialId: enrolledA.created.credentialId, counter: 1 }) })).resolves.toMatchObject({ ok: false });
  });

  it("rejects expired challenges without consuming them or issuing a session", async () => {
    const enrolled = await enroll(); const ceremony = await startAuthentication();
    await admin!.query("update public.auth_passkey_challenges set expires_at = now() - interval '1 second' where challenge_lookup_digest is not null and used_at is null");
    await expect(auth().finishPasskeySignIn({ challengeId: ceremony.challengeId, response: authenticationResponse({ ceremony, pair: enrolled.created.pair, credentialId: enrolled.created.credentialId, counter: 1 }) })).resolves.toMatchObject({ ok: false });
    await expect(admin!.query("select used_at from public.auth_passkey_challenges where id::text = (select id::text from public.auth_passkey_challenges order by created_at desc limit 1)")).resolves.toMatchObject({ rows: [{ used_at: null }] });
  });

  it("requires the existing fresh-password gate before creating an enrollment challenge", async () => {
    const session = await signIn(); const before = await admin!.query("select count(*)::int as count from public.auth_passkey_challenges where user_id = $1", [userA.id]);
    await expect(auth().startPasskeyEnrollment({ userId: session.identity.userId, currentSessionId: session.sessionId, password: "wrong-password" })).resolves.toMatchObject({ ok: false, error: { code: "auth.passkeyEnrollmentPasswordInvalid" } });
    await expect(admin!.query("select count(*)::int as count from public.auth_passkey_challenges where user_id = $1", [userA.id])).resolves.toEqual(before);
  });

  it("migrates passkey tables as user-scoped state with application grants and no RLS", async () => {
    await expect(admin!.query("select c.relname, c.relrowsecurity, has_table_privilege('opzava_app', 'public.' || c.relname, 'select,insert,update,delete') as app_granted from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = any($1::text[]) order by c.relname", [["auth_passkeys", "auth_passkey_challenges"]])).resolves.toMatchObject({ rows: [
      { relname: "auth_passkey_challenges", relrowsecurity: false, app_granted: true },
      { relname: "auth_passkeys", relrowsecurity: false, app_granted: true }
    ] });
    await expect(admin!.query("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'auth_passkeys' and column_name = 'user_id'")).resolves.toMatchObject({ rows: [{ column_name: "user_id" }] });
  });
});
