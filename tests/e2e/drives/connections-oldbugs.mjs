// Real-flow driver for the old Connections bugs (#128, #146, #172), rewritten for #183 (#189).
// Real login (NO minted session), real gateway, real credential probe. No mocks.
//
// Since #183, connect PROVES the submitted credential against the provider with one real call
// before keeping it. A deliberately bogus api key can therefore no longer reach Connected — the
// previous version of this drive asserted that it did, which #183 correctly made false (#189).
//
// What it proves now, at user level:
//   #183  an api-key connect with a bogus key is REJECTED: the connect dialog surfaces the
//         rollback message ("The provider rejected the credential ... not connected"), the
//         credential is not kept, and the provider row ends NOT connected.
//   #128 (residual) the page is NEVER reloaded: the failed connect must leave the row un-flipped
//         live in the DOM, and the prior-run cleanup path still asserts the realtime disconnect
//         flip when it runs.
//   #172 (residual) the prior-run cleanup path still fails on a false "Gateway still reports
//         provider credentials".
//
// LOST coverage (#189): the full connect -> gateway reload -> set-main (#146) -> disconnect
// (#172/#128 connect+disconnect flips) lifecycle now requires a credential that actually
// authenticates. Restoring it needs a dedicated low-value real key for the dev stack
// (issue #189, option 2); a probe bypass for drives was rejected there as a mock by another name.
//
// The bogus key is deliberate: it exercises the #183 reject-and-remove path end to end. Nothing
// real is spent or revoked, and the drive leaves the gateway as it found it: provider disconnected.
//
// Usage: node tests/e2e/drives/connections-oldbugs.mjs [outDir]

import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

import { BASE, realLogin, artifactDir } from "../lib/session.mjs";

const TIER = /best subagents/i;
const P1 = "Moonshot";
// Xiaomi is only touched by the prior-run cleanup: the reject path is gateway-side and
// provider-agnostic, so driving it once (Moonshot) is enough — a second pass would only double a
// minutes-long rollback. Z.AI is deliberately NOT used here: it holds a real credential.
const P2 = "Xiaomi";
const bogusKey = (tag) => `sk-opzava-drive-${tag}-${"0".repeat(36)}`;
// The rejection is only reported after the worker has probed AND rolled the credential back, and
// the rollback paces one gateway logout per agent — the UI poller allows 10 minutes, so we do too.
const REJECT_WINDOW_MS = 10 * 60 * 1000;
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

const showsConnected = (text) => /connected/i.test(text) && !/not connected/i.test(text);
const isConnected = async (page, provider) => showsConnected(await rowText(page, provider));

async function openRowMenu(page, provider) {
  // aria-label is `Row actions for ${provider.label}` and the label is fuller than the id
  // ("Moonshot (Kimi)"), so match on a prefix.
  await page
    .getByRole("button", { name: new RegExp(`Row actions for ${provider}`, "i") })
    .first()
    .click();
}

async function submitBogusKey(page, provider, tag) {
  await row(page, provider).getByRole("button", { name: /^connect$/i }).click();
  const keyInput = page.locator('input[placeholder*="Paste"]').first();
  await keyInput.waitFor({ state: "visible", timeout: 15_000 });
  await keyInput.fill(bogusKey(tag));
  await page.getByRole("button", { name: /^(connect|save|update)/i }).last().click();
}

// Watch the open connect dialog until the operation is terminal. Terminal states:
//   rejected      the #183 rollback message is on screen — the expected outcome. "rejected the
//                 credential" alone is NOT enough: the rollback-FAILED message ("... could not
//                 remove it again") starts the same way, so this demands the "has not been kept"
//                 tail that only the clean reject-and-remove path produces.
//   connected     the success notice appeared, i.e. a bogus key was kept — #183 regressed.
//   failed-other  the connect failed any other way (rollback failure, worker down, timeout, ...):
//                 the run cannot say anything good about #183, so it fails loudly with that text.
// A transient Connected row mid-window is recorded but not judged here: while the probe runs the
// credential IS briefly inside the gateway, so a realtime snapshot may honestly show it.
async function watchForRejection(page, provider, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let sawTransientConnected = false;
  let lastAlert = "";
  while (Date.now() < deadline) {
    lastAlert = (await page.getByRole("alert").allInnerTexts().catch(() => []))
      .join(" | ")
      .replace(/\s+/g, " ")
      .trim();
    if (/rejected the credential/i.test(lastAlert) && /has not been kept/i.test(lastAlert)) {
      return { outcome: "rejected", text: lastAlert, sawTransientConnected };
    }
    if (lastAlert !== "") {
      return { outcome: "failed-other", text: lastAlert, sawTransientConnected };
    }
    const body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
    if (/Connection updated|Provider connected in Opzava Gateway/i.test(body)) {
      return { outcome: "connected", text: "success notice shown", sawTransientConnected };
    }
    if (showsConnected(await rowText(page, provider))) {
      sawTransientConnected = true;
    }
    await page.waitForTimeout(1_000);
  }
  return { outcome: "timeout", text: lastAlert, sawTransientConnected };
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

// -------------------------------------------------- reset: leave no provider connected from a prior
// (pre-#183) run. This is the residual #172/#128-disconnect coverage: when it runs, it must settle
// realtime with no reload and no false credential warning.
for (const provider of [P1, P2]) {
  if (await isConnected(page, provider)) {
    const { settled, falseFailure } = await disconnect(page, provider);
    note(`reset: ${provider} disconnected`, settled.ok && !falseFailure, settled.text.slice(0, 70));
  }
}

// -------------------------------------------------- #183: a bogus key must be rejected, not kept
await submitBogusKey(page, P1, "p1");
await page.screenshot({ path: `${OUT}/02-reject-submitted.png`, fullPage: true });

const verdict = await watchForRejection(page, P1, REJECT_WINDOW_MS);
note(
  `#183 reject: ${P1} bogus key refused with the rollback message`,
  verdict.outcome === "rejected",
  verdict.outcome === "connected"
    ? "BOGUS KEY REPORTED CONNECTED — #183 regressed"
    : verdict.text.slice(0, 140) || `no terminal state within ${REJECT_WINDOW_MS / 60_000} min`,
);
if (verdict.sawTransientConnected) {
  console.log(
    `INFO  ${P1} row showed Connected transiently while the probe held the credential (not judged)`,
  );
}
await page.screenshot({ path: `${OUT}/03-rejection-notice.png`, fullPage: true });

// The rejected credential must not survive: the row ends not connected, live in the DOM, no reload.
const rolledBack = await waitForRow(page, P1, /not connected|available/i, 60_000);
note(
  `#183 rollback: ${P1} row ends not connected with no reload`,
  rolledBack.ok,
  rolledBack.text.slice(0, 70),
);

await page.getByRole("button", { name: /^close$/i }).last().click().catch(() => {});
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/04-final-row.png`, fullPage: true });

note("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));

writeFileSync(`${OUT}/findings.json`, JSON.stringify({ findings, consoleErrors }, null, 2));
await browser.close();

const failed = findings.filter((f) => !f.ok);
console.log(`\n${failed.length === 0 ? "DRIVE PASSED" : `DRIVE FAILED (${failed.length})`} — ${OUT}`);
process.exit(failed.length === 0 ? 0 : 1);
