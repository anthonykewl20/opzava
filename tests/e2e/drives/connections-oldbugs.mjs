// Real-flow driver for the old Connections bugs: #128, #146, #172.
// Real login (NO minted session), real gateway, real config.patch reloads. No mocks.
//
// What it proves, at user level:
//   #172  a disconnect the gateway ALREADY APPLIED is not reported as "Gateway still reports
//         provider credentials". Providers are connected with an api-key, which writes a
//         config.auth.profiles entry -- removing it makes the gateway RELOAD, which is the race.
//   #128  the provider row flips on connect AND on disconnect with NO page reload. The script never
//         reloads before asserting, so a row that only settles after F5 fails here.
//   #146  "Set as main orchestrator" rebuilds agents.list. The live ask-admin entry must keep its
//         canonical tool policy (profile: minimal, opzava_* allow-list, deny-wins) ALONGSIDE the
//         delegation tools. Asserted against the gateway config by the caller (see the runbook
//         command in the issue), because it is a gateway-side fact, not a DOM fact.
//
// The api keys are deliberately bogus: this exercises OUR credential lifecycle (write profile ->
// gateway reload -> remove profile), not any provider's API. Nothing real is spent or revoked.
// The drive leaves the gateway as it found it: both providers disconnected.
//
// Usage: node tests/e2e/drives/connections-oldbugs.mjs [outDir]

import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

import { BASE, realLogin, artifactDir } from "../lib/session.mjs";

const TIER = /best subagents/i;
const P1 = "Moonshot";
// Xiaomi is api-key-only, so its connect dialog opens straight on the key field (MiniMax defaults to
// its OAuth panel). Z.AI is deliberately NOT used here: it holds a real credential.
const P2 = "Xiaomi";
const bogusKey = (tag) => `sk-opzava-drive-${tag}-${"0".repeat(36)}`;
const OUT = process.argv[2] ?? artifactDir("connections-oldbugs");

mkdirSync(OUT, { recursive: true });

const findings = [];
const note = (step, ok, detail = "") => {
  findings.push({ step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? ` — ${detail}` : ""}`);
};


const row = (page, provider) => page.locator("tr", { hasText: provider }).first();

// Read the row live from the DOM. NEVER reload: a status that only appears after a reload is the
// #128 bug, so reloading here would hide the very thing under test.
async function rowText(page, provider) {
  return (await row(page, provider).innerText().catch(() => ""))
    .replace(/\s+/g, " ")
    .trim();
}

async function waitForRow(page, provider, matcher, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = await rowText(page, provider);
    if (matcher.test(last)) {
      return { ok: true, text: last };
    }
    await page.waitForTimeout(500);
  }
  return { ok: false, text: last };
}

const isConnected = async (page, provider) => /connected/i.test(await rowText(page, provider));

async function openRowMenu(page, provider) {
  // aria-label is `Row actions for ${provider.label}` and the label is fuller than the id
  // ("Moonshot (Kimi)"), so match on a prefix.
  await page
    .getByRole("button", { name: new RegExp(`Row actions for ${provider}`, "i") })
    .first()
    .click();
}

async function connect(page, provider, tag) {
  await row(page, provider).getByRole("button", { name: /^connect$/i }).click();
  const keyInput = page.locator('input[placeholder*="Paste"]').first();
  await keyInput.waitFor({ state: "visible", timeout: 15_000 });
  await keyInput.fill(bogusKey(tag));
  await page.getByRole("button", { name: /^(connect|save|update)/i }).last().click();
  return waitForRow(page, provider, /connected/i, 120_000);
}

async function disconnect(page, provider) {
  await openRowMenu(page, provider);
  await page.getByRole("menuitem", { name: /disconnect/i }).click();
  await page.getByRole("button", { name: /disconnect/i }).last().click();
  const settled = await waitForRow(page, provider, /not connected|available/i, 240_000);
  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  return {
    settled,
    falseFailure: /Gateway still reports provider credentials/i.test(body),
  };
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1512, height: 950 } });
const consoleErrors = [];
const page = await realLogin(context, { what: "the Connections regressions" });
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

await page.goto(`${BASE}/connections/providers`, { waitUntil: "networkidle" });
await page.getByRole("tab", { name: TIER }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/01-providers.png`, fullPage: true });

// -------------------------------------------------- reset: leave no provider connected from a prior run
for (const provider of [P1, P2]) {
  if (await isConnected(page, provider)) {
    const { settled, falseFailure } = await disconnect(page, provider);
    note(`reset: ${provider} disconnected`, settled.ok && !falseFailure, settled.text.slice(0, 70));
  }
}

// -------------------------------------------------- connect both (#128 connect side)
const c1 = await connect(page, P1, "p1");
note(`#128 connect: ${P1} row flips to Connected with no reload`, c1.ok, c1.text.slice(0, 70));
const c2 = await connect(page, P2, "p2");
note(`#128 connect: ${P2} row flips to Connected with no reload`, c2.ok, c2.text.slice(0, 70));
await page.screenshot({ path: `${OUT}/02-both-connected.png`, fullPage: true });

// -------------------------------------------------- set main orchestrator (this is what runs #146's code)
await openRowMenu(page, P2);
const setMain = page.getByRole("menuitem", { name: /set as main orchestrator/i });
const canSetMain = await setMain.count();
if (canSetMain > 0) {
  await setMain.click();
  // The confirm button is "Set <provider label> as main".
  await page.getByRole("button", { name: /as main$/i }).last().click();
  const lead = await waitForRow(page, P2, /main orchestrator|lead orchestrator/i, 120_000);
  note(`#146 set-main applied for ${P2} (rebuilds agents.list)`, lead.ok, lead.text.slice(0, 70));
} else {
  await page.keyboard.press("Escape");
  note("#146 set-main menu item present", false, "menu item not offered");
}
await page.screenshot({ path: `${OUT}/03-main-orchestrator.png`, fullPage: true });

// -------------------------------------------------- disconnect both (#172 + #128 disconnect side)
for (const provider of [P2, P1]) {
  const { settled, falseFailure } = await disconnect(page, provider);
  note(
    `#172 ${provider}: no false "Gateway still reports provider credentials"`,
    !falseFailure,
    falseFailure ? "THE BUG REPRODUCED" : "clean",
  );
  note(
    `#128 disconnect: ${provider} row flips back with no reload`,
    settled.ok,
    settled.text.slice(0, 70),
  );
}
await page.screenshot({ path: `${OUT}/04-disconnected.png`, fullPage: true });

note("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));

writeFileSync(`${OUT}/findings.json`, JSON.stringify({ findings, consoleErrors }, null, 2));
await browser.close();

const failed = findings.filter((f) => !f.ok);
console.log(`\n${failed.length === 0 ? "DRIVE PASSED" : `DRIVE FAILED (${failed.length})`} — ${OUT}`);
process.exit(failed.length === 0 ? 0 : 1);
