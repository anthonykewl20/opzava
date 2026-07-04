// Slice 3.7 Models & Providers real-flow driver (full-shadcn tabbed UI).
// Real login (NO minted session), drives the REAL interactions: switches tier tabs, opens Manage,
// checks the OAuth dialog has no api-key field + a real model, and that Disconnect never 404s.
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

const TIERS = [
  { id: "frontier", tab: /^frontier/i, expect: ["openai", "anthropic"] },
  { id: "bundles", tab: /^bundles/i, expect: ["opencode-go", "openrouter", "qwen", "cloudflare-ai-gateway"] },
  { id: "best-subagents", tab: /^best subagents/i, expect: ["zai", "moonshot", "minimax", "xiaomi"] },
  { id: "other", tab: /^other/i, expect: [] },
];
const RUNTIME_IDS = new Set([
  "codex", "codex-cli", "codex-app-server", "claude-cli", "google-gemini-cli", "gemini-cli",
]);
const NON_LLM_IDS = new Set([
  "deepgram", "elevenlabs", "azure-speech", "senseaudio", "comfy", "fal", "runway", "pixverse",
]);

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

async function openTier(page, tier) {
  const tab = page.getByRole("tab", { name: tier.tab });
  if ((await tab.count()) === 0) {
    return { present: false, ids: [], connectedModels: [] };
  }
  await tab.first().click();
  await page.waitForTimeout(250);
  const panel = page.locator(`[data-provider-tier="${tier.id}"]`);
  const ids = await panel
    .locator("tr[data-provider-id]")
    .evaluateAll((rows) =>
      rows.map((row) => (row.getAttribute("data-provider-id") ?? "").toLowerCase()),
    );
  const connectedModels = await panel
    .locator("tr[data-provider-id]")
    .evaluateAll((rows) =>
      rows.flatMap((row) => {
        const status = row.querySelector('[data-label="Status"]')?.textContent ?? "";
        if (!/\bconnected\b/i.test(status) || /not connected/i.test(status)) return [];
        return [...row.querySelectorAll('[data-label="Models"] .font-mono')].map(
          (m) => (m.textContent ?? "").trim(),
        );
      }),
    );
  return { present: true, ids, connectedModels };
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

  if ((await page.getByRole("table", { name: /llm model providers/i }).count()) === 0) {
    findings.push("providers-table=false");
  }
  // Tier tabs must render (Frontier / Bundles / Best Subagents).
  for (const tier of TIERS.slice(0, 3)) {
    if ((await page.getByRole("tab", { name: tier.tab }).count()) === 0) {
      findings.push(`tier-tab-${tier.id}=false`);
    }
  }

  // Walk every tier tab, aggregate the provider ids + real connected models across all tiers.
  const perTier = {};
  const allIds = [];
  const connectedModels = [];
  for (const tier of TIERS) {
    const result = await openTier(page, tier);
    perTier[tier.id] = result.ids;
    allIds.push(...result.ids);
    connectedModels.push(...result.connectedModels);
    for (const expectedId of tier.expect) {
      if (!result.ids.includes(expectedId)) findings.push(`tier-${tier.id}-${expectedId}=false`);
    }
  }

  const hasZai = allIds.includes("zai");
  const hasOpenRouter = allIds.includes("openrouter");
  const hasStandaloneRuntime = allIds.some((id) => RUNTIME_IDS.has(id));
  const hasNonLlm = allIds.some((id) => NON_LLM_IDS.has(id));
  if (!hasZai) findings.push("has-zai=false");
  if (!hasOpenRouter) findings.push("has-openrouter=false");
  if (hasStandaloneRuntime) findings.push("no-standalone-runtime-row=false");
  if (hasNonLlm) findings.push("no-non-llm=false");
  if (connectedModels.filter(Boolean).length === 0) findings.push("connected-provider-real-model=false");

  // Manage OpenAI (OAuth connection): dialog must NOT ask for an API key + must show a real model.
  await page.getByRole("tab", { name: /^frontier/i }).first().click();
  await page.waitForTimeout(250);
  const openaiRow = page
    .locator('[data-provider-tier="frontier"] tr[data-provider-id="openai"]')
    .first();
  if ((await openaiRow.count()) === 0) {
    findings.push("openai-frontier-row=false");
  } else {
    const manageButton = openaiRow.getByRole("button", { name: /^manage$/i });
    if ((await manageButton.count()) === 0) {
      findings.push("openai-manage-button=false");
    } else {
      await manageButton.click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor({ state: "visible", timeout: 5_000 });
      if ((await dialog.locator('input[name="apiKey"]').count()) !== 0) {
        findings.push("openai-manage-api-key-input=true");
      }
      const model = (await dialog.locator("[data-active-model]").first().textContent())?.trim() ?? "";
      if (model === "" || model === "No configured model" || model === "gpt-5.3-chat-latest") {
        findings.push(`openai-manage-real-model=false:${model || "empty"}`);
      }
      await dialog.getByRole("button", { name: /^close$/i }).click();
      await dialog.waitFor({ state: "hidden", timeout: 5_000 });
    }

    // Capture the CLEAN working page (Frontier tab, OpenAI connected) before the disconnect probe.
    await page.screenshot({ path: `${OUT}/connections-model-providers.png`, fullPage: true });

    // Disconnect must not 404. Observe the server-action POST target WITHOUT committing (abort), so
    // the live OpenAI credential is never removed. The bug was a navigation to a 404 page; here we
    // assert the action posts same-origin to /connections (not a dead route).
    let intercept = false;
    let observed = false;
    let badTarget = null;
    await page.route("**/*", async (route) => {
      const req = route.request();
      if (intercept && req.method() === "POST") {
        observed = true;
        const path = new URL(req.url()).pathname;
        if (!path.startsWith("/connections")) badTarget = req.url();
        await route.abort();
        return;
      }
      await route.continue();
    });
    const disconnectButton = openaiRow.getByRole("button", { name: /^disconnect$/i }).first();
    if ((await disconnectButton.count()) === 0) {
      findings.push("openai-disconnect-button=false");
    } else {
      intercept = true;
      await disconnectButton.click().catch(() => {});
      await page.waitForTimeout(500);
      intercept = false;
      if (!observed) findings.push("openai-disconnect-action-observed=false");
      if (badTarget !== null) findings.push(`openai-disconnect-bad-target=${badTarget}`);
    }
  }
  writeFileSync(
    `${OUT}/connections-report.json`,
    JSON.stringify(
      {
        base: BASE,
        perTier,
        hasZai,
        hasOpenRouter,
        noStandaloneRuntimeRow: !hasStandaloneRuntime,
        noNonLlm: !hasNonLlm,
        connectedModels,
        findings,
      },
      null,
      2,
    ),
  );

  if (findings.length > 0) {
    throw new Error(findings.join("; "));
  }
  console.log("connections-drive OK:", OUT);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
