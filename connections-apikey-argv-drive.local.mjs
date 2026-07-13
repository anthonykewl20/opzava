// #187 real-flow driver: a submitted provider API key must never reach the gateway container's
// process list. Real login (NO minted session), real api-key connect through the UI with a canary
// key, while sampling /proc/*/cmdline inside the gateway container.
//
// The connect is EXPECTED to end rejected: the canary is not a real credential, so the #183 liveness
// probe refuses it and rolls it back. That is the point — the key still travels the whole write path
// (onboard exec + shared-store write) with nothing left behind.
//
// Two assertions, and the control one matters most:
//   1. CONTROL: the sampler must SEE THIS connect's credential-carrying onboard running. Without it,
//      "the key was not in the process list" would just mean the sampler was looking at nothing.
//   2. The canary must appear in NO sampled command line, and in no worker log line.
//
// Usage: node connections-apikey-argv-drive.local.mjs [outDir]

import { chromium } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const BASE = process.env.REAL_BASE ?? "http://web.opzava.localhost:18088";
const EMAIL = process.env.REAL_EMAIL ?? "owner@opzava.localhost";
const PASSWORD = process.env.REAL_PASSWORD ?? "OpzavaLocalDev!2026";
const GATEWAY = process.env.REAL_GATEWAY_CONTAINER ?? "opzava-openclaw-platform-gateway-1";
const WORKER = process.env.REAL_WORKER_CONTAINER ?? "opzava-provisioning-worker-1";
const OUT =
  process.argv[2] ??
  `real-validate-artifacts/apikey-argv-${new Date().toISOString().replaceAll(":", "-")}`;

mkdirSync(OUT, { recursive: true });

// Shaped like a real key so nothing along the path can dismiss it as obviously malformed.
const CANARY = `sk-canary187-${randomUUID().replaceAll("-", "")}`;
const findings = [];
let samples = "";

/** Samples every process's argv inside the gateway container until killed. */
function startProcessListSampler() {
  const script =
    'while true; do for p in /proc/[0-9]*/cmdline; do tr "\\0" " " < "$p" 2>/dev/null; echo; done; sleep 0.05; done';
  const child = spawn("docker", ["exec", GATEWAY, "sh", "-c", script], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  child.stdout.on("data", (chunk) => {
    samples += String(chunk);
  });
  return child;
}

async function realLogin(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page
    .waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 })
    .catch(() => {
      throw new Error("REAL LOGIN FAILED - cannot validate the api-key connect.");
    });
  await page.waitForLoadState("networkidle");
  return page;
}

// Providers live under tier tabs, and only the open tab renders its rows.
const TIERS = [/^frontier/i, /^bundles/i, /^best subagents/i, /^other/i];
// Prefer a provider whose connect needs nothing but the key, so onboard runs the FULL write path
// rather than bailing on a missing second field (Cloudflare wants account + gateway ids). Any
// api-key provider still proves the argv property; only the flow proof needs this.
const PREFERRED = (process.env.REAL_PROVIDER ?? "zai,moonshot,openrouter,deepseek").split(",");

/** Every provider row that offers an api-key connect, preferred single-field ones first. */
async function findApiKeyConnectRows(page) {
  const candidates = [];
  for (const tier of TIERS) {
    const tab = page.getByRole("tab", { name: tier });
    if ((await tab.count()) === 0) {
      continue;
    }
    await tab.first().click();
    await page.waitForTimeout(400);

    const rows = page.locator("tr[data-provider-id]");
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      // Only NOT-connected rows offer Connect; a connected provider shows Manage/Disconnect. Never
      // touch a live credential.
      if ((await row.getByRole("button", { name: /^connect$/i }).count()) === 0) {
        continue;
      }
      const providerId = (await row.getAttribute("data-provider-id")) ?? "";
      candidates.push({ tier, providerId });
    }
  }
  const rank = (providerId) => {
    const index = PREFERRED.indexOf(providerId);
    return index === -1 ? PREFERRED.length : index;
  };
  return candidates.sort((left, right) => rank(left.providerId) - rank(right.providerId));
}

/** Opens the api-key connect dialog for the first candidate that actually has a key field. */
async function openApiKeyConnectDialog(page) {
  for (const candidate of await findApiKeyConnectRows(page)) {
    await page.getByRole("tab", { name: candidate.tier }).first().click();
    await page.waitForTimeout(400);
    const row = page.locator(`tr[data-provider-id="${candidate.providerId}"]`).first();
    await row.getByRole("button", { name: /^connect$/i }).first().click();

    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});

    // A setup-token provider (Anthropic) leads with the browser flow and folds the paste form — the
    // one that submits a credential, and the argv path this drive exists to watch — into a <details>.
    const pasteToggle = dialog.locator("summary", { hasText: /already have a setup token/i });
    if ((await pasteToggle.count()) > 0) {
      await pasteToggle.first().click();
      await page.waitForTimeout(250);
    }

    const field = dialog.locator('input[name="apiKey"]');
    if ((await field.count()) > 0) {
      return { dialog, field, providerId: candidate.providerId };
    }
    // Device-flow/OAuth-only provider: no credential is submitted, so no argv path. Keep looking.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  }
  return null;
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const sampler = startProcessListSampler();
const startedAt = new Date();
let providerId = null;

try {
  const page = await realLogin(context);
  await page.goto(`${BASE}/connections/providers`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);

  const target = await openApiKeyConnectDialog(page);
  if (target === null) {
    throw new Error("no api-key connect dialog found - cannot exercise the onboard write path");
  }
  providerId = target.providerId;

  await target.field.fill(CANARY);
  await target.dialog
    .getByRole("button", { name: /connect (provider|setup token)/i })
    .first()
    .click();

  // The connect is async (worker execs onboard in the gateway, then probes). Give the whole write
  // path time to run under the sampler; the outcome itself is asserted below, not here.
  await page.waitForTimeout(45_000);
  await page.screenshot({ path: `${OUT}/apikey-connect-outcome.png`, fullPage: true });
} catch (error) {
  findings.push(`drive-failed=${error instanceof Error ? error.message : String(error)}`);
} finally {
  sampler.kill("SIGKILL");
  await context.close();
  await browser.close();
}

const workerLogs = execFileSync(
  "docker",
  ["logs", "--since", startedAt.toISOString(), WORKER],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
);

const onboardLines = [
  ...new Set(samples.split("\n").filter((line) => line.includes("openclaw.mjs onboard"))),
];

// CONTROL: the sampler must have caught THIS connect's onboard while it ran. Without that, "the key
// was never in the process list" only says the sampler was looking at nothing. It has to be the
// credential-carrying command for the provider we submitted to — `onboard --help` (the capability
// check) runs on the same path and must not be allowed to stand in for it.
const connectLines = onboardLines.filter(
  (line) =>
    line.includes("--credential-stdin") && providerId !== null && line.includes(providerId),
);
if (connectLines.length === 0) {
  findings.push("control-sampler-never-saw-this-connects-onboard=true");
}
if (samples.includes(CANARY)) {
  findings.push("canary-in-gateway-process-list=true");
}
if (workerLogs.includes(CANARY)) {
  findings.push("canary-in-worker-logs=true");
}
writeFileSync(
  `${OUT}/apikey-argv-report.json`,
  JSON.stringify(
    {
      base: BASE,
      providerId,
      canaryLength: CANARY.length,
      sampledProcessLines: samples.split("\n").length,
      sawThisConnectsOnboardInProcessList: connectLines.length > 0,
      // Safe to record: that these carry no credential is exactly what this drive proves.
      onboardCommandLines: onboardLines,
      canaryInProcessList: samples.includes(CANARY),
      canaryInWorkerLogs: workerLogs.includes(CANARY),
      findings,
    },
    null,
    2,
  ),
);

if (findings.length > 0) {
  console.error(findings.join("; "));
  process.exitCode = 1;
} else {
  console.log(`apikey-argv-drive OK (provider=${providerId}): ${OUT}`);
}
