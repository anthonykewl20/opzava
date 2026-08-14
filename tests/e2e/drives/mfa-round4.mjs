/* global Buffer, console, process */
// Real MFA remediation drive for #93. The shared owner proves only ordinary login;
// all MFA and lockout mutations use a disposable, psql-seeded owner account.
// Usage: node tests/e2e/drives/mfa-round4.mjs [outDir]
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHmac, randomBytes, randomUUID, scrypt } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import { BASE, PASSWORD as SHARED_PASSWORD, artifactDir, realLogin } from "../lib/session.mjs";

const OUT = process.argv[2] ?? artifactDir("mfa-round4");
const POSTGRES = process.env.OPZAVA_POSTGRES_CONTAINER ?? "opzava-postgres-1";
const PASSWORD = "MfaDisposable!2026";
const runId = randomUUID();
const fixture = {
  userId: randomUUID(),
  organizationId: randomUUID(),
  workspaceId: randomUUID(),
  email: `mfa-drive-${runId}@example.test`,
  slug: `mfa-drive-${runId.slice(0, 8)}`,
};
const results = [];
const derive = promisify(scrypt);

mkdirSync(OUT, { recursive: true });

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function psql(query) {
  return execFileSync("docker", [
    "exec", POSTGRES, "psql", "-v", "ON_ERROR_STOP=1", "-U", "opzava_owner", "-d", "opzava", "-c", query,
  ], { encoding: "utf8" });
}

async function passwordHash(password) {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `opzava_scrypt_v1$N=16384,r=8,p=1,keylen=64$${salt.toString("base64url")}$${Buffer.from(hash).toString("base64url")}`;
}

async function seedFixture() {
  const hash = await passwordHash(PASSWORD);
  psql(`
    insert into public.auth_users (id, name, email, email_verified)
      values (${sqlLiteral(fixture.userId)}, 'MFA Drive Owner', ${sqlLiteral(fixture.email)}, true);
    insert into public.auth_accounts (id, user_id, account_id, provider_id, password)
      values (${sqlLiteral(randomUUID())}, ${sqlLiteral(fixture.userId)}, ${sqlLiteral(fixture.email)}, 'email-password', ${sqlLiteral(hash)});
    insert into public.organizations (id, slug, name, lifecycle_state)
      values (${sqlLiteral(fixture.organizationId)}, ${sqlLiteral(fixture.slug)}, 'MFA Drive Organization', 'active');
    insert into public.workspaces (id, organization_id, slug, name)
      values (${sqlLiteral(fixture.workspaceId)}, ${sqlLiteral(fixture.organizationId)}, 'mfa-drive', 'MFA Drive Workspace');
    insert into public.memberships (organization_id, user_id, status, membership_version)
      values (${sqlLiteral(fixture.organizationId)}, ${sqlLiteral(fixture.userId)}, 'active', 1);
    insert into public.role_grants (organization_id, subject_type, subject_id, role_key, scope_type, scope_id, granted_by_user_id)
      values (${sqlLiteral(fixture.organizationId)}, 'user', ${sqlLiteral(fixture.userId)}, 'owner', 'organization', ${sqlLiteral(fixture.organizationId)}, ${sqlLiteral(fixture.userId)});
  `);
}

function cleanupFixture() {
  psql(`
    delete from public.auth_mfa_challenges where user_id = ${sqlLiteral(fixture.userId)};
    delete from public.auth_two_factor where user_id = ${sqlLiteral(fixture.userId)};
    delete from public.auth_sessions where user_id = ${sqlLiteral(fixture.userId)};
    delete from public.role_grants where organization_id = ${sqlLiteral(fixture.organizationId)}::uuid;
    delete from public.memberships where organization_id = ${sqlLiteral(fixture.organizationId)}::uuid;
    delete from public.workspaces where organization_id = ${sqlLiteral(fixture.organizationId)}::uuid;
    delete from public.organizations where id = ${sqlLiteral(fixture.organizationId)}::uuid;
    delete from public.auth_accounts where user_id = ${sqlLiteral(fixture.userId)};
    delete from public.auth_users where id = ${sqlLiteral(fixture.userId)};
  `);
}

function fixtureRowCount() {
  const output = execFileSync("docker", [
    "exec", POSTGRES, "psql", "-v", "ON_ERROR_STOP=1", "-U", "opzava_owner", "-d", "opzava", "-tA", "-c",
    `select count(*) from public.auth_users where id = ${sqlLiteral(fixture.userId)};`,
  ], { encoding: "utf8" });
  return Number(output.trim());
}

function base32Decode(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let buffer = 0;
  let bits = 0;
  const bytes = [];
  for (const char of value.replaceAll("=", "").toUpperCase()) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error("Invalid enrollment setup key.");
    buffer = (buffer << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totp(secret) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const digest = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function waitForAction(page, action) {
  const response = page.waitForResponse((candidate) =>
    candidate.request().method() === "POST" && candidate.url().startsWith(BASE), { timeout: 15_000 });
  await action();
  await response;
}

async function submitLogin(page, email, password) {
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await waitForAction(page, () => page.getByRole("button", { name: "Sign in" }).click());
}

async function enterMfaCode(page, code) {
  for (const [index, digit] of [...code].entries()) {
    await page.getByLabel(`Verification code digit ${index + 1}`).fill(digit);
  }
  await waitForAction(page, () => page.getByRole("button", { name: "Sign in" }).click());
}

async function enterRecoveryCode(page, code) {
  await page.getByRole("button", { name: "Use a recovery code" }).click();
  await page.getByLabel("Recovery code").fill(code);
  await waitForAction(page, () => page.getByRole("button", { name: "Sign in" }).click());
}

let browser;
let preconditionFailure = false;
try {
  try {
    psql("select 1");
  } catch (error) {
    preconditionFailure = true;
    throw new Error(`MFA drive precondition unavailable: cannot reach ${POSTGRES} as opzava_owner (${String(error)}).`);
  }
  await seedFixture();
  browser = await chromium.launch();

  // Regression control: this is the only interaction with the shared owner.
  const sharedContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const shared = await realLogin(sharedContext, { what: "non-MFA login regression" });
  record("shared seeded owner still completes ordinary non-MFA login", !shared.url().includes("/login"), SHARED_PASSWORD.length > 0 ? "real form login" : "");
  await shared.screenshot({ path: join(OUT, "00-shared-owner-login.png") });
  await sharedContext.close();

  const enrolledContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const security = await enrolledContext.newPage();
  await security.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await submitLogin(security, fixture.email, PASSWORD);
  await security.waitForURL((url) => !url.pathname.startsWith("/login"));
  await security.goto(`${BASE}/security`, { waitUntil: "networkidle" });
  await security.locator('input[name="password"]').fill("wrong-password");
  await waitForAction(security, () => security.getByRole("button", { name: "Enable two-factor" }).click());
  const securityError = security.locator(".sb-alert--destructive").first();
  await securityError.waitFor();
  record("wrong enrollment password discloses no setup material", await security.locator("#setup-secret").count() === 0, await securityError.innerText());
  await security.screenshot({ path: join(OUT, "01-wrong-password-no-secret.png") });

  await security.locator('input[name="password"]').fill(PASSWORD);
  await waitForAction(security, () => security.getByRole("button", { name: "Enable two-factor" }).click());
  await security.locator("#setup-secret").waitFor();
  const secret = await security.locator("#setup-secret").inputValue();
  record("disposable user enrollment reveals current setup material", secret.length > 0 && await security.locator("#setup-uri").count() === 1);
  await security.locator('input[name="code"]').fill(totp(secret));
  await waitForAction(security, () => security.getByRole("button", { name: "Verify and enable" }).click());
  await security.getByRole("heading", { name: "Save your recovery codes" }).waitFor();
  const recovery = (await security.locator("pre").innerText()).split(/\s+/).find(Boolean);
  if (recovery === undefined) throw new Error("MFA drive could not read a recovery code from the one-time display.");
  record("MFA enablement returns one-time recovery codes", recovery.length > 0);
  await security.screenshot({ path: join(OUT, "02-recovery-codes.png") });

  const recoveryContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const recoveryLogin = await recoveryContext.newPage();
  await recoveryLogin.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await submitLogin(recoveryLogin, fixture.email, PASSWORD);
  await recoveryLogin.getByLabel("Verification code digit 1").waitFor();
  await enterRecoveryCode(recoveryLogin, recovery);
  await recoveryLogin.waitForURL((url) => !url.pathname.startsWith("/login"));
  record("single-use recovery code completes the MFA challenge", !recoveryLogin.url().includes("/login"));
  await recoveryContext.close();

  const challengeContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const login = await challengeContext.newPage();
  await login.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await submitLogin(login, fixture.email, PASSWORD);
  await login.getByLabel("Verification code digit 1").waitFor();
  record("subsequent password login requires an MFA challenge", await login.getByLabel("Six-digit verification code").count() === 1);
  const valid = totp(secret);
  const wrong = `${valid.slice(0, 5)}${valid[5] === "9" ? "0" : "9"}`;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await enterMfaCode(login, wrong);
    await login.locator(".sb-alert--destructive").first().waitFor();
  }
  // The fifth failure creates the lock; this next real action observes the
  // deliberately distinct lockout response without a timing sleep.
  await enterMfaCode(login, wrong);
  const lockoutText = await login.locator(".sb-alert--destructive").first().innerText();
  record("MFA lockout copy remains distinct", /Too many attempts/i.test(lockoutText), lockoutText);
  await login.screenshot({ path: join(OUT, "03-mfa-lockout.png") });
  await challengeContext.close();

  // The exercised lockout is intentionally server-side. Expire only this disposable
  // fixture's lock so the real Security action can prove its disable cleanup path.
  psql(`update public.auth_two_factor set locked_until = now() - interval '1 second' where user_id = ${sqlLiteral(fixture.userId)};`);
  await security.goto(`${BASE}/security`, { waitUntil: "networkidle" });
  await security.locator('input[name="code"]').fill(totp(secret));
  await waitForAction(security, () => security.getByRole("button", { name: "Turn off two-factor" }).click());
  await security.getByText("Two-factor authentication is off.").waitFor();
  record("disposable user's MFA is disabled before fixture deletion", true);
  await security.screenshot({ path: join(OUT, "04-mfa-disabled.png") });
  await enrolledContext.close();
} catch (error) {
  record("drive execution", false, error instanceof Error ? error.message : String(error));
} finally {
  await browser?.close().catch(() => {});
  try {
    cleanupFixture();
    const remaining = fixtureRowCount();
    record("disposable fixture cleanup", remaining === 0, `${remaining} fixture users remain`);
  } catch (error) {
    record("disposable fixture cleanup", false, error instanceof Error ? error.message : String(error));
  }
}

const passed = results.filter((result) => result.ok).length;
writeFileSync(join(OUT, "report.json"), JSON.stringify({ base: BASE, passed, total: results.length, results }, null, 2));
console.log(`\n${passed}/${results.length} checks passed. Artifacts in ${OUT}`);
process.exit(preconditionFailure ? 2 : passed === results.length ? 0 : 1);
