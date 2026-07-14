// PHASE 1 LOOP for the disconnect-does-not-flip bug.
//
// Symptom (user, live stack): click Disconnect on a connected provider -> the dialog sticks on
// "Disconnecting..." and the row still reads Connected. A hard refresh reveals it IS disconnected.
// So the server-side disconnect SUCCEEDS and the UI never settles.
//
// This loop drives exactly that and goes RED on exactly that: it NEVER reloads the page, and asserts
// the row flips to not-connected live in the DOM within the window. If it only "passes" after a
// reload, that is the bug.
//
// Safety: NEVER touches zai — that holds a REAL credential. Target defaults to moonshot (leftover
// canary profiles from the argv/environ drives).
//
// Usage: node repro-disconnect.mjs [provider]

import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { BASE, realLogin } from "../lib/session.mjs";

const TARGET = process.argv[2] ?? "Moonshot";
const FORBIDDEN = /z\.?ai/i;
const WINDOW_MS = Number(process.env.WINDOW_MS ?? 120_000);

if (FORBIDDEN.test(TARGET)) {
  throw new Error("refusing to disconnect Z.AI — it holds a real credential");
}

const consoleErrors = [];
const failedRequests = [];
const startedAt = new Date();

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await realLogin(context, { what: "the disconnect flip" });

page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
});
page.on("requestfailed", (r) =>
  failedRequests.push(`${r.method()} ${r.url().slice(0, 120)} :: ${r.failure()?.errorText}`),
);
page.on("response", (r) => {
  if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url().slice(0, 120)}`);
});

const rowOf = (name) => page.locator("tr", { hasText: name }).first();
const rowText = async (name) =>
  (await rowOf(name).innerText().catch(() => "")).replace(/\s+/g, " ").trim();
const isConnected = (t) => /connected/i.test(t) && !/not connected/i.test(t);

await page.goto(`${BASE}/connections/providers`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

// The provider may live under any tier tab; open each until the row is visible.
for (const tier of [/^frontier/i, /^bundles/i, /^best subagents/i, /^other/i]) {
  const tab = page.getByRole("tab", { name: tier });
  if ((await tab.count()) === 0) continue;
  await tab.first().click();
  await page.waitForTimeout(350);
  if ((await rowOf(TARGET).count()) > 0 && isConnected(await rowText(TARGET))) break;
}

const before = await rowText(TARGET);
console.log(`row BEFORE: ${before.slice(0, 90)}`);
if (!isConnected(before)) {
  console.log(`\nSKIP: ${TARGET} is not connected — cannot drive a disconnect. Connect it first.`);
  await browser.close();
  process.exit(2);
}

await page.getByRole("button", { name: new RegExp(`Row actions for ${TARGET}`, "i") }).first().click();
await page.getByRole("menuitem", { name: /disconnect/i }).click();
await page.getByRole("button", { name: /disconnect/i }).last().click();

// Poll the LIVE DOM. No reload — a status that only appears after a reload IS the bug.
const deadline = Date.now() + WINDOW_MS;
let flippedAt = null;
let lastRow = "";
let lastDialog = "";
while (Date.now() < deadline) {
  lastRow = await rowText(TARGET);
  lastDialog = (await page.getByRole("dialog").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  if (!isConnected(lastRow) && lastRow !== "") {
    flippedAt = Math.round((WINDOW_MS - (deadline - Date.now())) / 1000);
    break;
  }
  await page.waitForTimeout(1000);
}

// Ground truth: what does the GATEWAY actually say? (Did the disconnect really happen server-side?)
const profiles = execFileSync(
  "docker",
  ["exec", "opzava-openclaw-platform-gateway-1", "sh", "-lc", "openclaw config get auth.profiles --json"],
  { encoding: "utf8" },
).trim();
const gatewayStillHasIt = new RegExp(TARGET, "i").test(profiles);

// And what the UI says AFTER a reload — the user's workaround.
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);
for (const tier of [/^frontier/i, /^bundles/i, /^best subagents/i, /^other/i]) {
  const tab = page.getByRole("tab", { name: tier });
  if ((await tab.count()) === 0) continue;
  await tab.first().click();
  await page.waitForTimeout(300);
  if ((await rowOf(TARGET).count()) > 0) break;
}
const afterReload = await rowText(TARGET);

const workerLogs = execFileSync(
  "docker",
  ["logs", "--since", startedAt.toISOString(), "opzava-provisioning-worker-1"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
).slice(-1500);

await browser.close();

console.log("\n──────── RESULT ────────");
console.log(`flipped live (no reload)?   ${flippedAt !== null ? `YES after ${flippedAt}s` : "NO"}`);
console.log(`row after window:           ${lastRow.slice(0, 90)}`);
console.log(`dialog after window:        ${lastDialog.slice(0, 110) || "(closed)"}`);
console.log(`gateway still has profile?  ${gatewayStillHasIt}`);
console.log(`row AFTER hard reload:      ${afterReload.slice(0, 90)}`);
console.log(`console errors:             ${consoleErrors.length}`, consoleErrors.slice(0, 3));
console.log(`failed/4xx-5xx requests:    ${failedRequests.length}`, failedRequests.slice(0, 5));
console.log(`\nworker log tail:\n${workerLogs}`);

// RED when the server disconnected but the UI did not flip live — the user's exact symptom.
const bugReproduced = flippedAt === null && !gatewayStillHasIt && !isConnected(afterReload);
console.log(
  bugReproduced
    ? "\n>>> RED: BUG REPRODUCED — server disconnected, UI never flipped without a reload."
    : flippedAt !== null
      ? "\n>>> GREEN: the row flipped live. Bug not reproduced this run."
      : "\n>>> INCONCLUSIVE: see above (gateway may still hold the profile = disconnect genuinely failed).",
);
process.exit(bugReproduced ? 1 : 0);
