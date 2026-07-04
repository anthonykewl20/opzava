// Slice 3.7 Models & Providers real-flow driver.
// Uses the same real-login pattern as real-world-validate.local.mjs.
// Usage: node connections-drive.local.mjs [outDir]

import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.REAL_BASE ?? "http://web.opzava.localhost:18088";
const EMAIL = process.env.REAL_EMAIL ?? "owner@opzava.localhost";
const PASSWORD = process.env.REAL_PASSWORD ?? "OpzavaLocalDev!2026";
const OUT =
  process.argv[2] ??
  `real-validate-artifacts/connections-${new Date().toISOString().replaceAll(":", "-")}`;

mkdirSync(OUT, { recursive: true });

if (process.env.PARITY_COOKIE) {
  console.warn("PARITY_COOKIE is ignored: connections-drive requires a real login.");
}

function fail(message) {
  throw new Error(message);
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
      throw new Error("REAL LOGIN FAILED - cannot validate Connections.");
    });
  await page.waitForLoadState("networkidle");
  return page;
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  colorScheme: "dark",
});
const findings = [];

try {
  const page = await realLogin(context);
  await page.goto(`${BASE}/connections`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);

  const table = page.getByRole("table", { name: /llm model providers/i });
  if ((await table.count()) === 0) {
    fail("Model providers table did not render.");
  }

  const rows = table.locator("tbody tr");
  // Assert on the deterministic RAW provider id (data-provider-id), NOT the rendered display text:
  // display labels ("Claude CLI") differ from ids ("claude-cli"), which made the standalone-runtime
  // check unfalsifiable and risked a false-positive at this gate.
  const rowInfo = await rows.evaluateAll((elements) =>
    elements.map((row) => ({
      id: (row.getAttribute("data-provider-id") ?? "").toLowerCase(),
      provider: row.querySelector('[data-label="Provider"]')?.textContent?.trim() ?? "",
    })),
  );
  const providerIds = rowInfo.map((row) => row.id);
  const providerNames = rowInfo.map((row) => row.provider);
  const RUNTIME_IDS = new Set([
    "codex",
    "codex-cli",
    "codex-app-server",
    "claude-cli",
    "google-gemini-cli",
    "gemini-cli",
  ]);
  const NON_LLM_IDS = new Set([
    "deepgram",
    "elevenlabs",
    "azure-speech",
    "senseaudio",
    "comfy",
    "fal",
    "runway",
    "pixverse",
  ]);
  const hasZai = providerIds.includes("zai");
  const hasOpenRouter = providerIds.includes("openrouter");
  const hasStandaloneRuntime = providerIds.some((id) => RUNTIME_IDS.has(id));
  const hasNonLlm = providerIds.some((id) => NON_LLM_IDS.has(id));

  if (!hasZai) findings.push("has-zai=false");
  if (!hasOpenRouter) findings.push("has-openrouter=false");
  if (hasStandaloneRuntime) findings.push("no-standalone-runtime-row=false");
  if (hasNonLlm) findings.push("no-non-llm=false");

  const connectedModelIds = await rows.evaluateAll((elements) =>
    elements.flatMap((row) => {
      const status = row.querySelector('[data-label="Status"]')?.textContent ?? "";
      if (!/\bconnected\b/i.test(status) || /not connected/i.test(status)) {
        return [];
      }

      return [...row.querySelectorAll('[data-label="Models"] .u-mono')].map(
        (model) => model.textContent ?? "",
      );
    }),
  );
  if (connectedModelIds.map((value) => value.trim()).filter(Boolean).length === 0) {
    findings.push("connected-provider-real-model=false");
  }

  await page.screenshot({ path: `${OUT}/connections-model-providers.png`, fullPage: true });
  writeFileSync(
    `${OUT}/connections-report.json`,
    JSON.stringify(
      {
        base: BASE,
        providerNames,
        hasZai,
        hasOpenRouter,
        noStandaloneRuntimeRow: !hasStandaloneRuntime,
        noNonLlm: !hasNonLlm,
        connectedModelIds,
        findings,
      },
      null,
      2,
    ),
  );

  if (findings.length > 0) {
    fail(findings.join("; "));
  }

  console.log("connections-drive OK:", OUT);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
