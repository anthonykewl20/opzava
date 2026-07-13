// #127 probe: start a REAL `claude setup-token` flow through the UI and inspect the authorize URL
// we hand the user. The malformed code reported in #127 carried a BEL (U+0007) and a trailing
// authorize URL -- BEL is the OSC-8 hyperlink terminator, and the CLI wraps its URL in OSC-8. So the
// junk almost certainly came from OUR parse, not from the user's clipboard.
//
// This starts the flow and stops. It never approves anything, so it needs no Claude account.
//
// Usage: node tests/e2e/probes/setup-token-url.mjs

import { chromium } from "@playwright/test";

import { BASE, realLogin } from "../lib/session.mjs";


const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1512, height: 950 } });
const page = await realLogin(context, { what: "the setup-token URL", timeoutMs: 20_000 });

await page.goto(`${BASE}/connections/providers`, { waitUntil: "networkidle" });
await page.locator("tr", { hasText: "Anthropic" }).first().getByRole("button", { name: /^connect$/i }).click();
await page.waitForTimeout(1000);

// Start the subscription (setup-token) flow.
const start = page.getByRole("button", { name: /claude subscription|setup token|subscription/i }).first();
if ((await start.count()) > 0) {
  await start.click();
}

// The authorize link appears once the CLI prints its URL.
const link = page.locator('a[href*="claude.com"], a[href*="anthropic.com"]').first();
await link.waitFor({ state: "visible", timeout: 90_000 });
const href = await link.getAttribute("href");

await page.screenshot({ path: "real-validate-artifacts/setup-token-url.png", fullPage: true });
await browser.close();

console.log("\nauthorize URL handed to the user:");
console.log(href);
console.log("\n--- checks ---");
const controlChars = [...(href ?? "")].filter((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);
const httpsCount = (href ?? "").split("https://").length - 1;
const checks = [
  ["no control chars (incl. BEL U+0007)", controlChars.length === 0, JSON.stringify(controlChars)],
  ["exactly one https:// (not a glued duplicate)", httpsCount === 1, `count=${httpsCount}`],
  ["parses as a URL", (() => { try { new URL(href); return true; } catch { return false; } })(), ""],
  ["is the claude.com authorize endpoint", /^https:\/\/claude\.com\/cai\/oauth\/authorize\?/.test(href ?? ""), ""],
  ["carries a code_challenge (a real PKCE flow)", /code_challenge=/.test(href ?? ""), ""],
];
let failed = 0;
for (const [name, ok, detail] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
console.log(failed === 0 ? "\nURL IS CLEAN" : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
