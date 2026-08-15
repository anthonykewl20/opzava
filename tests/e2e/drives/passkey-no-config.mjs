/* global console, process */
// Proves the passkey configuration boundary on the rebuilt production container.
// Run only with PASSKEY_RP_* absent and a non-local APP_URL/BETTER_AUTH_URL.
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { BASE, artifactDir, realLogin } from "../lib/session.mjs";

const OUT = process.argv[2] ?? artifactDir("passkey-no-config");
const WEB = process.env.OPZAVA_WEB_CONTAINER ?? "opzava-web-1";
const results = [];
const environment = { NODE_ENV: "", APP_URL: "", BETTER_AUTH_URL: "" };
let preconditionFailure = false;
mkdirSync(OUT, { recursive: true });

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function readContainerEnvironment() {
  const output = execFileSync("docker", ["exec", WEB, "sh", "-c", "printf 'NODE_ENV=%s\\nAPP_URL=%s\\nBETTER_AUTH_URL=%s\\n' \"${NODE_ENV:-}\" \"${APP_URL:-}\" \"${BETTER_AUTH_URL:-}\""], { encoding: "utf8" });
  for (const line of output.trim().split("\n")) {
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator);
    if (key in environment) environment[key] = line.slice(separator + 1);
  }
}

let browser;
try {
  try {
    readContainerEnvironment();
    const localUrl = "http://web.opzava.localhost:18088";
    if (environment.NODE_ENV !== "production" || environment.APP_URL === "" || environment.BETTER_AUTH_URL === "" || environment.APP_URL === localUrl || environment.BETTER_AUTH_URL === localUrl) {
      throw new Error(`expected NODE_ENV=production and non-local APP_URL/BETTER_AUTH_URL; got NODE_ENV=${environment.NODE_ENV || "(unset)"}, APP_URL=${environment.APP_URL || "(unset)"}, BETTER_AUTH_URL=${environment.BETTER_AUTH_URL || "(unset)"}`);
    }
  } catch (error) {
    preconditionFailure = true;
    throw new Error(`PASSKEY NO-CONFIG DRIVE PRECONDITION UNAVAILABLE: ${error instanceof Error ? error.message : String(error)}`);
  }
  execFileSync("docker", ["exec", WEB, "sh", "-c", "test -z \"${PASSKEY_RP_ID:-}\" && test -z \"${PASSKEY_RP_NAME:-}\" && test -z \"${PASSKEY_RP_ORIGINS:-}\""], { stdio: "pipe" });
  record("container has no PASSKEY_RP_* configuration", true);
  browser = await chromium.launch();
  const passwordContext = await browser.newContext();
  const authenticated = await realLogin(passwordContext, { what: "passkey-unconfigured password control" });
  record("password login remains available without passkey configuration", !authenticated.url().includes("/login"));
  await authenticated.screenshot({ path: join(OUT, "01-password-login.png") });
  await passwordContext.close();

  const passkeyContext = await browser.newContext();
  const login = await passkeyContext.newPage();
  await login.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await login.getByRole("button", { name: "Use a passkey" }).click();
  const unavailableMessage = "Passkey sign-in is unavailable. Try your password instead.";
  const alert = login.getByRole("alert").filter({ hasText: unavailableMessage });
  await alert.waitFor({ timeout: 15_000 });
  const alertText = await alert.innerText();
  record("passkey button reports the named unavailable state", await alert.count() === 1 && alertText.includes(unavailableMessage), alertText);
  await login.screenshot({ path: join(OUT, "02-passkey-unavailable.png") });
  await passkeyContext.close();

  const securityContext = await browser.newContext();
  const security = await realLogin(securityContext, { what: "passkey-unconfigured security settings" });
  await security.goto(`${BASE}/security`, { waitUntil: "networkidle" });
  const note = security.getByText("Passkeys are not configured on this deployment.", { exact: true });
  await note.waitFor({ timeout: 15_000 });
  record("security keeps password and MFA available while hiding passkeys", await security.getByRole("heading", { name: "Change password" }).count() === 1 && await security.getByRole("button", { name: "Enable two-factor" }).count() === 1 && await security.getByRole("heading", { name: "Passkeys" }).count() === 0, await note.innerText());
  await security.screenshot({ path: join(OUT, "03-security-passkeys-hidden.png") });
  await securityContext.close();
} catch (error) {
  record("drive execution", false, error instanceof Error ? error.message : String(error));
} finally {
  await browser?.close().catch(() => {});
}

const passed = results.filter((result) => result.ok).length;
writeFileSync(join(OUT, "report.json"), JSON.stringify({ base: BASE, environment, passed, total: results.length, results }, null, 2));
console.log(`\n${passed}/${results.length} checks passed. Artifacts in ${OUT}`);
process.exit(preconditionFailure ? 2 : passed === results.length ? 0 : 1);
