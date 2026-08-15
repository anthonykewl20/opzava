/* global Buffer, console, process */
// Real passkey drive for #93. Browser WebAuthn is exercised through Chromium's
// CDP virtual authenticator; no credential response is fabricated by this drive.
// Usage: node tests/e2e/drives/passkey-round.mjs [outDir]
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID, scrypt } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import { BASE, PASSWORD as SHARED_PASSWORD, artifactDir, realLogin } from "../lib/session.mjs";

const OUT = process.argv[2] ?? artifactDir("passkey-round");
const POSTGRES = process.env.OPZAVA_POSTGRES_CONTAINER ?? "opzava-postgres-1";
const PASSWORD = "PasskeyDisposable!2026";
const fixture = { userId: randomUUID(), organizationId: randomUUID(), workspaceId: randomUUID(), email: `passkey-drive-${randomUUID()}@example.test`, slug: `passkey-${randomUUID().slice(0, 8)}` };
const results = [];
const derive = promisify(scrypt);
mkdirSync(OUT, { recursive: true });

function record(name, ok, detail = "") { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); }
function literal(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function psql(query) { return execFileSync("docker", ["exec", POSTGRES, "psql", "-v", "ON_ERROR_STOP=1", "-U", "opzava_owner", "-d", "opzava", "-c", query], { encoding: "utf8" }); }
function scalar(query) { return execFileSync("docker", ["exec", POSTGRES, "psql", "-tA", "-v", "ON_ERROR_STOP=1", "-U", "opzava_owner", "-d", "opzava", "-c", query], { encoding: "utf8" }).trim(); }
async function passwordHash(value) { const salt = randomBytes(16); const hash = await derive(value, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }); return `opzava_scrypt_v1$N=16384,r=8,p=1,keylen=64$${salt.toString("base64url")}$${Buffer.from(hash).toString("base64url")}`; }
async function seed() {
  const hash = await passwordHash(PASSWORD);
  psql(`insert into public.auth_users (id,name,email,email_verified) values (${literal(fixture.userId)},'Passkey Drive',${literal(fixture.email)},true);
    insert into public.auth_accounts (id,user_id,account_id,provider_id,password) values (${literal(randomUUID())},${literal(fixture.userId)},${literal(fixture.email)},'email-password',${literal(hash)});
    insert into public.organizations (id,slug,name,lifecycle_state) values (${literal(fixture.organizationId)},${literal(fixture.slug)},'Passkey Drive','active');
    insert into public.workspaces (id,organization_id,slug,name) values (${literal(fixture.workspaceId)},${literal(fixture.organizationId)},'passkey','Passkey');
    insert into public.memberships (organization_id,user_id,status,membership_version) values (${literal(fixture.organizationId)},${literal(fixture.userId)},'active',1);
    insert into public.role_grants (organization_id,subject_type,subject_id,role_key,scope_type,scope_id,granted_by_user_id) values (${literal(fixture.organizationId)},'user',${literal(fixture.userId)},'owner','organization',${literal(fixture.organizationId)},${literal(fixture.userId)});`);
}
function cleanup() { psql(`delete from public.auth_passkey_challenges where user_id=${literal(fixture.userId)}; delete from public.auth_passkeys where user_id=${literal(fixture.userId)}; delete from public.auth_mfa_challenges where user_id=${literal(fixture.userId)}; delete from public.auth_sessions where user_id=${literal(fixture.userId)}; delete from public.role_grants where organization_id=${literal(fixture.organizationId)}::uuid; delete from public.memberships where organization_id=${literal(fixture.organizationId)}::uuid; delete from public.workspaces where organization_id=${literal(fixture.organizationId)}::uuid; delete from public.organizations where id=${literal(fixture.organizationId)}::uuid; delete from public.auth_accounts where user_id=${literal(fixture.userId)}; delete from public.auth_users where id=${literal(fixture.userId)};`); }
async function loginWithPassword(page) { await page.goto(`${BASE}/login`, { waitUntil: "networkidle" }); await page.locator('input[name="email"]').fill(fixture.email); await page.locator('input[name="password"]').fill(PASSWORD); await page.getByRole("button", { name: "Sign in" }).click(); await page.waitForURL((url) => !url.pathname.startsWith("/login")); }
async function logout(page) { await page.goto(BASE, { waitUntil: "networkidle" }); await page.locator("#acctBtn").click(); await page.getByRole("menuitem", { name: "Sign out" }).click(); await page.waitForURL((url) => url.pathname === "/signout"); await page.getByRole("link", { name: "Sign back in" }).click(); await page.waitForURL((url) => url.pathname.startsWith("/login")); }
async function addVirtualAuthenticator(context, page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  // CDP's command takes one `options` object (not its fields at the top level).
  const created = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", ctap2Version: "ctap2_1", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  if (typeof created.authenticatorId !== "string" || created.authenticatorId === "") throw new Error("CDP did not return a virtual authenticator id.");
  return { cdp, authenticatorId: created.authenticatorId };
}

let browser; let preconditionFailure = false; let virtual;
try {
  try { psql("select 1 from public.auth_passkeys limit 1"); } catch (error) { preconditionFailure = true; throw new Error(`PASSKEY DRIVE PRECONDITION UNAVAILABLE: 0032 is not applied or ${POSTGRES} cannot be reached (${String(error)}).`); }
  await seed(); browser = await chromium.launch();
  const sharedContext = await browser.newContext({ viewport: { width: 1440, height: 960 } }); const shared = await realLogin(sharedContext, { what: "passkey regression control" }); record("shared seeded owner still completes ordinary form login", !shared.url().includes("/login"), SHARED_PASSWORD.length > 0 ? "real form login" : ""); await shared.screenshot({ path: join(OUT, "00-shared-owner-login.png") }); await sharedContext.close();
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } }); const page = await context.newPage();
  try { virtual = await addVirtualAuthenticator(context, page); } catch (error) { preconditionFailure = true; throw new Error(`PASSKEY DRIVE PRECONDITION UNAVAILABLE: Chromium CDP WebAuthn virtual authenticators are unavailable (${error instanceof Error ? error.message : String(error)}). Integration ceremonies remain the proof.`); }
  await loginWithPassword(page); record("disposable user completes real password form login before enrollment", !page.url().includes("/login"));
  await page.goto(`${BASE}/security`, { waitUntil: "networkidle" }); await page.locator("#passkey-name").fill("Drive passkey"); await page.locator("#passkey-password").fill(PASSWORD); await page.getByRole("button", { name: "Add a passkey" }).click(); await page.getByRole("alert").filter({ hasText: "Passkey added." }).waitFor({ timeout: 15_000 }); record("navigator.credentials.create enrolls the virtual passkey", await page.locator("li").filter({ hasText: "Drive passkey" }).count() === 1); await page.screenshot({ path: join(OUT, "01-passkey-enrolled.png") });
  await logout(page); record("real sign out returns to login", page.url().includes("/login"));
  await page.getByRole("button", { name: "Use a passkey" }).click(); await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 }); record("navigator.credentials.get completes passwordless passkey login", !page.url().includes("/login"));
  await page.goto(`${BASE}/security`, { waitUntil: "networkidle" }); record("security page lists the enrolled passkey after passwordless login", await page.locator("li").filter({ hasText: "Drive passkey" }).count() === 1); await page.screenshot({ path: join(OUT, "02-passkey-passwordless-login.png") });
  const renameDialogs = []; const renameHandler = (dialog) => { renameDialogs.push(dialog.message()); void dialog.accept(renameDialogs.length === 1 ? PASSWORD : "Renamed drive passkey"); }; page.on("dialog", renameHandler); await page.getByRole("button", { name: "Rename" }).click(); await page.getByRole("alert").filter({ hasText: "Passkey renamed." }).waitFor({ timeout: 15_000 }); page.off("dialog", renameHandler); record("rename requires password and persists", await page.locator("li").filter({ hasText: "Renamed drive passkey" }).count() === 1); await page.screenshot({ path: join(OUT, "03-passkey-renamed.png") });
  const revokeHandler = (dialog) => { void dialog.accept(PASSWORD); }; page.on("dialog", revokeHandler); await page.getByRole("button", { name: "Remove" }).click(); await page.getByRole("alert").filter({ hasText: "Passkey removed." }).waitFor({ timeout: 15_000 }); page.off("dialog", revokeHandler); await page.reload({ waitUntil: "networkidle" }); record("revoke requires password and removes the credential", await page.getByText("No passkeys added yet.", { exact: true }).count() === 1 && scalar(`select count(*) from public.auth_passkeys where user_id=${literal(fixture.userId)}`) === "0"); await page.screenshot({ path: join(OUT, "04-passkey-revoked.png") });
  await virtual.cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId: virtual.authenticatorId }); await virtual.cdp.send("WebAuthn.disable"); await context.close();
} catch (error) { record("drive execution", false, error instanceof Error ? error.message : String(error)); }
finally { await browser?.close().catch(() => {}); try { cleanup(); record("disposable fixture cleanup", scalar(`select count(*) from public.auth_users where id=${literal(fixture.userId)}`) === "0"); } catch (error) { record("disposable fixture cleanup", false, error instanceof Error ? error.message : String(error)); } }
const passed = results.filter((result) => result.ok).length; writeFileSync(join(OUT, "report.json"), JSON.stringify({ base: BASE, passed, total: results.length, results }, null, 2)); console.log(`\n${passed}/${results.length} checks passed. Artifacts in ${OUT}`); process.exit(preconditionFailure ? 2 : passed === results.length ? 0 : 1);
