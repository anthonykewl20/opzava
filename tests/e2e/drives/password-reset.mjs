/* global Buffer, console, process */
// Real password-reset drive for #93. It seeds only a disposable owner and removes it on exit.
// Usage: node tests/e2e/drives/password-reset.mjs [outDir]
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHmac, randomBytes, randomUUID, scrypt } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import { BASE, artifactDir } from "../lib/session.mjs";

const OUT = process.argv[2] ?? artifactDir("password-reset");
const POSTGRES = process.env.OPZAVA_POSTGRES_CONTAINER ?? "opzava-postgres-1";
const OLD_PASSWORD = "ResetDisposable!2026";
const NEW_PASSWORD = "ResetDisposableNew!2026";
const THIRD_PASSWORD = "ResetDisposableThird!2026";
const fixture = { userId: randomUUID(), organizationId: randomUUID(), workspaceId: randomUUID(), email: `reset-drive-${randomUUID()}@example.test`, slug: `reset-${randomUUID().slice(0, 8)}` };
const results = [];
const derive = promisify(scrypt);
mkdirSync(OUT, { recursive: true });

function record(name, ok, detail = "") { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); }
function literal(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function psql(query) { return execFileSync("docker", ["exec", POSTGRES, "psql", "-v", "ON_ERROR_STOP=1", "-U", "opzava_owner", "-d", "opzava", "-c", query], { encoding: "utf8" }); }
function scalar(query) { return execFileSync("docker", ["exec", POSTGRES, "psql", "-tA", "-v", "ON_ERROR_STOP=1", "-U", "opzava_owner", "-d", "opzava", "-c", query], { encoding: "utf8" }).trim(); }
async function passwordHash(password) { const salt = randomBytes(16); const hash = await derive(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }); return `opzava_scrypt_v1$N=16384,r=8,p=1,keylen=64$${salt.toString("base64url")}$${Buffer.from(hash).toString("base64url")}`; }
async function seed() {
  const hash = await passwordHash(OLD_PASSWORD);
  psql(`insert into public.auth_users (id,name,email,email_verified) values (${literal(fixture.userId)},'Reset Drive',${literal(fixture.email)},true);
    insert into public.auth_accounts (id,user_id,account_id,provider_id,password) values (${literal(randomUUID())},${literal(fixture.userId)},${literal(fixture.email)},'email-password',${literal(hash)});
    insert into public.organizations (id,slug,name,lifecycle_state) values (${literal(fixture.organizationId)},${literal(fixture.slug)},'Reset Drive','active');
    insert into public.workspaces (id,organization_id,slug,name) values (${literal(fixture.workspaceId)},${literal(fixture.organizationId)},'reset','Reset');
    insert into public.memberships (organization_id,user_id,status,membership_version) values (${literal(fixture.organizationId)},${literal(fixture.userId)},'active',1);`);
}
function seedResetToken() {
  const id = randomUUID(); const token = `${id}.${randomBytes(32).toString("base64url")}`; const salt = randomBytes(16).toString("hex"); const digest = createHmac("sha256", salt).update(token).digest("hex");
  psql(`insert into public.auth_password_reset_tokens (id,user_id,salt,token_hash,expires_at) values (${literal(id)}::uuid,${literal(fixture.userId)},${literal(salt)},${literal(digest)},now()+interval '30 minutes');
    insert into public.auth_mfa_challenges (id,user_id,active_organization_id,membership_version,expires_at) values (${literal(randomUUID().replaceAll("-", ""))},${literal(fixture.userId)},${literal(fixture.organizationId)}::uuid,1,now()+interval '5 minutes');`);
  return token;
}
function cleanup() { psql(`delete from public.auth_password_reset_tokens where user_id=${literal(fixture.userId)}; delete from public.auth_mfa_challenges where user_id=${literal(fixture.userId)}; delete from public.auth_two_factor where user_id=${literal(fixture.userId)}; delete from public.auth_sessions where user_id=${literal(fixture.userId)}; delete from public.memberships where organization_id=${literal(fixture.organizationId)}::uuid; delete from public.workspaces where organization_id=${literal(fixture.organizationId)}::uuid; delete from public.organizations where id=${literal(fixture.organizationId)}::uuid; delete from public.auth_accounts where user_id=${literal(fixture.userId)}; delete from public.auth_users where id=${literal(fixture.userId)};`); }
async function login(context, password) { const page = await context.newPage(); await page.goto(`${BASE}/login`, { waitUntil: "networkidle" }); await page.locator('input[name="email"]').fill(fixture.email); await page.locator('input[name="password"]').fill(password); await page.getByRole("button", { name: "Sign in" }).click(); await page.waitForURL((url) => !url.pathname.startsWith("/login")); return page; }

let browser; let preconditionFailure = false;
try {
  try { psql("select 1 from public.auth_password_reset_tokens limit 1"); } catch (error) { preconditionFailure = true; throw new Error(`password-reset drive precondition unavailable: ${String(error)}`); }
  await seed(); browser = await chromium.launch();
  const first = await browser.newContext(); const second = await browser.newContext();
  await login(first, OLD_PASSWORD); await login(second, OLD_PASSWORD);
  const token = seedResetToken();
  const reset = await browser.newContext(); const resetPage = await reset.newPage();
  await resetPage.goto(`${BASE}/reset-password?token=${encodeURIComponent(token)}`, { waitUntil: "networkidle" });
  await resetPage.locator('input[name="password"]').fill(NEW_PASSWORD); await resetPage.locator('input[name="confirmPassword"]').fill(NEW_PASSWORD); await resetPage.getByRole("button", { name: "Reset password" }).click();
  await resetPage.getByText("Password reset. Sign in with your new password.").waitFor();
  record("reset form consumes the disposable token", true); await resetPage.screenshot({ path: join(OUT, "01-reset-success.png") });
  record("reset revokes every session and invalidates MFA challenges", scalar(`select count(*) from public.auth_sessions where user_id=${literal(fixture.userId)}`) === "0" && scalar(`select count(*) from public.auth_mfa_challenges where user_id=${literal(fixture.userId)}`) === "0");
  const fresh = await browser.newContext(); await login(fresh, NEW_PASSWORD); record("new password signs in after reset", true);
  const forgot = await browser.newContext(); const forgotPage = await forgot.newPage(); await forgotPage.goto(`${BASE}/forgot-password`, { waitUntil: "networkidle" }); await forgotPage.locator('input[name="email"]').fill("unknown@example.test"); await forgotPage.getByRole("button", { name: "Request password reset" }).click(); const genericAlert = forgotPage.getByText("If that account can be reset, follow the instructions provided by your administrator."); await genericAlert.waitFor(); const generic = await genericAlert.innerText(); record("unknown email has generic confirmation", /If that account can be reset/i.test(generic)); await forgotPage.screenshot({ path: join(OUT, "02-forgot-generic.png") });
  const security = await fresh.newPage(); await security.goto(`${BASE}/security`, { waitUntil: "networkidle" }); await security.locator('#current-password').fill("wrong-password"); await security.locator('#new-password').fill(THIRD_PASSWORD); await security.locator('#confirm-password').fill(THIRD_PASSWORD); await security.getByRole("button", { name: "Change password" }).click(); const wrongAlert = security.getByText("That current password didn't match."); await wrongAlert.waitFor(); record("wrong current password is rejected", /didn't match/i.test(await wrongAlert.innerText())); await security.locator('#current-password').fill(NEW_PASSWORD); await security.locator('#new-password').fill(THIRD_PASSWORD); await security.locator('#confirm-password').fill(THIRD_PASSWORD); await security.getByRole("button", { name: "Change password" }).click(); await security.getByRole("alert").last().waitFor(); await new Promise((resolve) => setTimeout(resolve, 1_000)); const changeAlerts = await security.getByRole("alert").allInnerTexts(); record("change password retains current session", changeAlerts.includes("Password changed. Other signed-in devices were signed out."), JSON.stringify(changeAlerts)); await security.screenshot({ path: join(OUT, "03-change-password.png") });
  await Promise.all([first.close(), second.close(), reset.close(), fresh.close(), forgot.close()]);
} catch (error) { record("drive execution", false, error instanceof Error ? error.message : String(error)); }
finally { await browser?.close().catch(() => {}); try { cleanup(); record("disposable fixture cleanup", scalar(`select count(*) from public.auth_users where id=${literal(fixture.userId)}`) === "0"); } catch (error) { record("disposable fixture cleanup", false, String(error)); } }
const passed = results.filter((result) => result.ok).length; writeFileSync(join(OUT, "report.json"), JSON.stringify({ base: BASE, passed, total: results.length, results }, null, 2)); console.log(`\n${passed}/${results.length} checks passed. Artifacts in ${OUT}`); process.exit(preconditionFailure ? 2 : passed === results.length ? 0 : 1);
