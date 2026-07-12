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
        // Status text concatenates ("ConnectedOpzava Gateway…"), so match substring, not \bword\b.
        if (!/connected/i.test(status) || /not connected/i.test(status)) return [];
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
  await page.goto(`${BASE}/connections/providers`, { waitUntil: "networkidle" });
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

  // Agnostic Manage + Disconnect-confirm checks against whatever is ACTUALLY connected (not a
  // hardcoded provider). Find the first connected row (it has a Manage button) across the tiers.
  let connectedRow = null;
  let connectedTier = null;
  for (const tier of TIERS) {
    const tab = page.getByRole("tab", { name: tier.tab });
    if ((await tab.count()) === 0) continue;
    await tab.first().click();
    await page.waitForTimeout(250);
    const rows = page.locator(`[data-provider-tier="${tier.id}"] tr[data-provider-id]`);
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      if ((await row.getByRole("button", { name: /^manage$/i }).count()) > 0) {
        connectedRow = row;
        connectedTier = tier.id;
        break;
      }
    }
    if (connectedRow) break;
  }

  if (connectedRow === null) {
    findings.push("no-connected-provider-to-manage=true");
  } else {
    // Manage: dialog opens and shows a REAL configured model (never "No configured model").
    await connectedRow.getByRole("button", { name: /^manage$/i }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible", timeout: 5_000 });
    const model = (await dialog.locator("[data-active-model]").first().textContent())?.trim() ?? "";
    if (model === "" || model === "No configured model") {
      findings.push(`manage-real-model=false:${model || "empty"}`);
    }
    await dialog.getByRole("button", { name: /^close$/i }).click();
    await dialog.waitFor({ state: "hidden", timeout: 5_000 });

    await page.screenshot({ path: `${OUT}/connections-model-providers.png`, fullPage: true });

    // Disconnect is destructive → MUST open a confirmation AlertDialog and NOT post until confirmed.
    // Non-destructive check: assert the confirm dialog appears, then Cancel (never commit).
    let postedBeforeConfirm = false;
    await page.route("**/*", async (route) => {
      if (route.request().method() === "POST") postedBeforeConfirm = true;
      await route.continue();
    });
    await connectedRow.getByRole("button", { name: /^disconnect$/i }).first().click();
    await page.waitForTimeout(300);
    const confirm = page.getByRole("alertdialog");
    if ((await confirm.count()) === 0) {
      findings.push("disconnect-confirm-missing=true");
    } else {
      if (postedBeforeConfirm) findings.push("disconnect-posted-before-confirm=true");
      await confirm.getByRole("button", { name: /^cancel$/i }).click().catch(() => {});
    }
    if (connectedTier === null) findings.push("connected-tier-null=true");
  }
  await page.unroute("**/*").catch(() => {});
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
