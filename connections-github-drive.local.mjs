// Connections GitHub catalog real-flow driver.
// Real login (NO minted session), starts the REAL GitHub device flow from /connections/add.
// Usage: node connections-github-drive.local.mjs [outDir]

import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.REAL_BASE ?? "http://web.opzava.localhost:18088";
const EMAIL = process.env.REAL_EMAIL ?? "owner@opzava.localhost";
const PASSWORD = process.env.REAL_PASSWORD ?? "OpzavaLocalDev!2026";
const OUT =
  process.argv[2] ??
  `real-validate-artifacts/connections-github-${new Date().toISOString().replaceAll(":", "-")}`;

mkdirSync(OUT, { recursive: true });

if (process.env.PARITY_COOKIE) {
  console.warn("PARITY_COOKIE is ignored: connections-github-drive requires a real login.");
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
      throw new Error("REAL LOGIN FAILED - cannot validate Connections GitHub catalog.");
    });
  await page.waitForLoadState("networkidle");
  return page;
}

async function hasVisible(locator) {
  return (await locator.count()) > 0 && (await locator.first().isVisible().catch(() => false));
}

async function detectGitHubConnected(page) {
  await page.goto(`${BASE}/connections`, { waitUntil: "networkidle" });
  const railLink = page.getByRole("link", { name: /github/i });
  if (!(await hasVisible(railLink))) {
    return false;
  }

  await page.goto(`${BASE}/connections/github`, { waitUntil: "networkidle" });
  return hasVisible(page.getByText(/^Connected$/i));
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  colorScheme: "dark",
});
const findings = [];
const exercised = [];
const skipped = [];

try {
  const page = await realLogin(context);

  const initiallyConnected = await detectGitHubConnected(page);
  if (initiallyConnected) {
    exercised.push("connected-github-present-in-rail");
    await page.goto(`${BASE}/connections/github`, { waitUntil: "networkidle" });
    if (!(await hasVisible(page.getByRole("button", { name: /^Disconnect$/i })))) {
      findings.push("github-disconnect-control=false");
    } else {
      await page.screenshot({ path: `${OUT}/github-connected-detail.png`, fullPage: true });
      await page.getByRole("button", { name: /^Disconnect$/i }).click();
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.goto(`${BASE}/connections/add`, { waitUntil: "networkidle" });
      if (!(await hasVisible(page.getByRole("button", { name: /^Connect GitHub$/i })))) {
        findings.push("disconnect-returned-github-to-catalog=false");
      } else {
        exercised.push("disconnect-returned-github-to-catalog");
      }
    }
  } else {
    skipped.push("connected-state-and-disconnect:no-live-github-connection");
  }

  await page.goto(`${BASE}/connections/add`, { waitUntil: "networkidle" });
  const githubHeading = page.getByText(/^GitHub$/i);
  const connect = page.getByRole("button", { name: /^Connect GitHub$/i });
  if (!(await hasVisible(githubHeading))) {
    findings.push("catalog-github=false");
  }
  if (!(await hasVisible(connect))) {
    findings.push("catalog-connect-github=false");
  } else {
    await connect.click();
    await page.waitForLoadState("networkidle").catch(() => {});
    // Wait for the server-action redirect + render to settle: either a device-flow marker
    // or the not-configured notice becomes visible (a fixed short delay races the round-trip).
    await page
      .locator(".connections-device-code, .connections-notice")
      .first()
      .waitFor({ state: "visible", timeout: 8_000 })
      .catch(() => {});
    await page.waitForTimeout(500);
    const hasUserCode = await hasVisible(page.locator(".connections-device-code"));
    const hasVerificationLink = await hasVisible(page.getByRole("link", { name: /sign-in page/i }));
    const hasPendingCode = await hasVisible(page.getByText(/Generating your device code/i));
    const hasGitHubNotConfiguredNotice =
      (await hasVisible(page.getByText(/GitHub connect isn.?t available/i))) ||
      (await hasVisible(page.getByText(/no GitHub OAuth app configured/i)));
    if (!hasUserCode && !hasVerificationLink && !hasPendingCode) {
      if (hasGitHubNotConfiguredNotice) {
        skipped.push("github-device-flow:no-oauth-client-id-in-env");
        await page.screenshot({
          path: `${OUT}/github-device-flow-not-configured.png`,
          fullPage: true,
        });
      } else {
        findings.push("github-device-flow-visible=false");
      }
    } else {
      exercised.push("catalog-started-github-device-flow");
      await page.screenshot({ path: `${OUT}/github-device-flow.png`, fullPage: true });
    }
  }

  writeFileSync(
    `${OUT}/connections-github-report.json`,
    JSON.stringify(
      {
        base: BASE,
        exercised,
        skipped,
        findings,
      },
      null,
      2,
    ),
  );

  if (findings.length > 0) {
    throw new Error(findings.join("; "));
  }
  console.log("connections-github-drive OK:", OUT);
  if (skipped.length > 0) {
    console.log("skipped:", skipped.join("; "));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
