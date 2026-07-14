// Real-flow driver for #184: a connected provider exposes its full model catalog, and the
// operator enables/disables catalog models from the provider dialog.
// Real login (NO minted session), real gateway, real config.patch round-trips. No mocks.
//
// What it proves, at user level:
//   - CATALOG DISPLAY (the #184 headline, bundle case): the OpenCode Go row advertises its
//     20-model plugin catalog beyond the single configured model ("+N in catalog") — this is the
//     plugin-generated-catalog read working live. OpenCode Go holds no GATEWAY credential on the
//     dev stack (its subscription authenticates the host CLI, not the gateway), so the TOGGLE is
//     exercised on Z.AI instead, the stack's genuinely connected multi-model provider.
//   - TOGGLE: enabling a Z.AI catalog model flips its switch live (no reload) AND becomes gateway
//     ground truth: `models status --json` .allowed gains the ref and agents.defaults.models
//     carries the key. Disabling removes both again, leaving the gateway as the drive found it.
//
// The toggle is config-only: no credential is written or revoked, nothing is spent. Z.AI's real
// credential is never touched — this is exactly why the toggle target is a MODEL, not a provider.
//
// Usage: node tests/e2e/drives/connections-models.mjs [outDir]

import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

import { BASE, realLogin, artifactDir } from "../lib/session.mjs";

const GATEWAY = process.env.REAL_GATEWAY_CONTAINER ?? "opzava-openclaw-platform-gateway-1";

// Display case: bundle whose catalog exists only as a plugin-generated file.
const BUNDLE_TIER = /bundles/i;
const BUNDLE_LABEL = "OpenCode Go";

// Toggle case: the connected provider. glm-4.7-flash is in Z.AI's 14-model catalog but not
// enabled; it is not the primary, not a fallback, and not the last enabled zai model, so both
// toggle directions pass the worker's guardrails.
const TOGGLE_TIER = /best subagents/i;
const TOGGLE_LABEL = "Z.AI";
const TOGGLE_PROVIDER_ID = "zai";
const TARGET_MODEL_ID = "glm-4.7-flash";
const TARGET_REF = `${TOGGLE_PROVIDER_ID}/${TARGET_MODEL_ID}`;
// aria-label is "Enable <label>" / "Disable <label>"; anchor the tail so FlashX cannot match.
const TARGET_SWITCH = /^(enable|disable) glm-4\.7 flash$/i;
// The switch flips only after the worker's config.patch + restart-tolerant post-check completes.
const TOGGLE_WINDOW_MS = 120_000;
const OUT = process.argv[2] ?? artifactDir("connections-models");

mkdirSync(OUT, { recursive: true });

const findings = [];
const note = (step, ok, detail = "") => {
  findings.push({ step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? ` — ${detail}` : ""}`);
};

/** Gateway ground truth: the refs the gateway will actually route. */
function allowedModelRefs() {
  const raw = execFileSync(
    "docker",
    ["exec", GATEWAY, "node", "openclaw.mjs", "models", "status", "--json"],
    { encoding: "utf8" },
  );
  return JSON.parse(raw).allowed ?? [];
}

function enabledDefaultsKeys() {
  const raw = execFileSync(
    "docker",
    ["exec", GATEWAY, "node", "openclaw.mjs", "config", "get", "agents.defaults.models", "--json"],
    { encoding: "utf8" },
  );
  return Object.keys(JSON.parse(raw) ?? {});
}

const targetSwitch = (page) => page.getByRole("switch", { name: TARGET_SWITCH }).first();

async function waitForSwitchState(page, checked, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = (await targetSwitch(page).getAttribute("aria-checked").catch(() => null)) ?? "";
    if (last === String(checked)) {
      return { ok: true, state: last };
    }
    await page.waitForTimeout(500);
  }
  return { ok: false, state: last };
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1512, height: 950 } });
const consoleErrors = [];
const page = await realLogin(context, { what: "provider model catalogs (#184)" });
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

// Precondition, not a finding: the toggle needs the dev stack's connected Z.AI provider.
if (!allowedModelRefs().some((ref) => ref.startsWith(`${TOGGLE_PROVIDER_ID}/`))) {
  console.error(`PRECONDITION FAILED — ${TOGGLE_PROVIDER_ID} is not connected on this stack.`);
  process.exit(2);
}
const targetWasEnabled = allowedModelRefs().includes(TARGET_REF);

await page.goto(`${BASE}/connections/providers`, { waitUntil: "networkidle" });

// -------------------------------------------------- bundle catalog surfaced on the row (#184 core)
await page.getByRole("tab", { name: BUNDLE_TIER }).click();
await page.waitForTimeout(600);
const bundleRow = page.locator("tr", { hasText: BUNDLE_LABEL }).first();
const bundleText = (await bundleRow.innerText()).replace(/\s+/g, " ").trim();
const bundleSuffix = bundleText.match(/\+(\d+) in catalog/);
note(
  `#184 bundle row: ${BUNDLE_LABEL} advertises its plugin catalog beyond the configured model`,
  bundleSuffix !== null && Number(bundleSuffix[1]) >= 10,
  bundleText.slice(0, 110),
);
await page.screenshot({ path: `${OUT}/01-bundle-catalog.png`, fullPage: true });

// -------------------------------------------------- catalog listed in the connected provider's dialog
await page.getByRole("tab", { name: TOGGLE_TIER }).click();
await page.waitForTimeout(600);
await page
  .getByRole("button", { name: new RegExp(`Row actions for ${TOGGLE_LABEL}`, "i") })
  .first()
  .click();
await page.getByRole("menuitem", { name: /manage/i }).click();
await page.getByRole("heading", { name: /^models$/i }).waitFor({ timeout: 15_000 });
const switchCount = await page.getByRole("switch").count();
const checkedCount = await page.locator('[role="switch"][aria-checked="true"]').count();
note(
  `#184 dialog: ${TOGGLE_LABEL} Models section lists the catalog with the enabled subset marked`,
  switchCount >= 10 && checkedCount >= 1 && checkedCount < switchCount,
  `switches=${switchCount} checked=${checkedCount}`,
);
await page.screenshot({ path: `${OUT}/02-models-dialog.png`, fullPage: true });

// -------------------------------------------------- toggle round-trip: BOTH transitions observed
// A prior failed run may have left the target enabled; that leg order still observes enable AND
// disable, and the final state is always disabled — the stack's canonical state. The finally
// block is crash-path restoration only: the drive must never leave its model enabled behind an
// exception, and a restore it cannot prove is a loud failure, not a shrug.
try {
  if (targetWasEnabled) {
    console.log(`INFO  ${TARGET_REF} was enabled before the run (prior-run leftover) — disabling first`);
    await targetSwitch(page).click();
    const cleanup = await waitForSwitchState(page, false, TOGGLE_WINDOW_MS);
    note(`prior-run cleanup: ${TARGET_REF} disabled first`, cleanup.ok, `aria-checked=${cleanup.state}`);
  }

  await targetSwitch(page).click();
  const enabled = await waitForSwitchState(page, true, TOGGLE_WINDOW_MS);
  note(
    `#184 enable: ${TARGET_REF} switch flips on with no reload`,
    enabled.ok,
    `aria-checked=${enabled.state}`,
  );
  note(
    `#184 enable ground truth: gateway routes ${TARGET_REF}`,
    allowedModelRefs().includes(TARGET_REF) && enabledDefaultsKeys().includes(TARGET_REF),
    allowedModelRefs().join(", ").slice(0, 120),
  );
  await page.screenshot({ path: `${OUT}/03-enabled.png`, fullPage: true });

  await targetSwitch(page).click();
  const disabled = await waitForSwitchState(page, false, TOGGLE_WINDOW_MS);
  note(
    `#184 disable: ${TARGET_REF} switch flips off with no reload`,
    disabled.ok,
    `aria-checked=${disabled.state}`,
  );
  note(
    `#184 disable ground truth: gateway no longer routes ${TARGET_REF}`,
    !allowedModelRefs().includes(TARGET_REF) && !enabledDefaultsKeys().includes(TARGET_REF),
    allowedModelRefs().join(", ").slice(0, 120),
  );
  await page.screenshot({ path: `${OUT}/04-disabled-again.png`, fullPage: true });

  note("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));
} finally {
  try {
    // Split-brain counts as leftover too: a defaults key without an allowed entry (or the
    // reverse) is still drive residue the next run would trip over.
    const leftover = () =>
      allowedModelRefs().includes(TARGET_REF) || enabledDefaultsKeys().includes(TARGET_REF);
    if (leftover()) {
      if (!page.isClosed()) {
        await targetSwitch(page).click().catch(() => {});
        await waitForSwitchState(page, false, TOGGLE_WINDOW_MS);
      }
      if (leftover()) {
        note(`RESTORE FAILED — ${TARGET_REF} left enabled on the gateway`, false, "clean up manually");
      } else {
        console.log(`INFO  crash-path restore: ${TARGET_REF} disabled again`);
      }
    }
  } catch (error) {
    note(`RESTORE UNVERIFIED — could not read gateway state`, false, String(error).slice(0, 90));
  }
  writeFileSync(`${OUT}/findings.json`, JSON.stringify({ findings, consoleErrors }, null, 2));
  await browser.close().catch(() => {});
}

const failed = findings.filter((f) => !f.ok);
console.log(`\n${failed.length === 0 ? "DRIVE PASSED" : `DRIVE FAILED (${failed.length})`} — ${OUT}`);
process.exit(failed.length === 0 ? 0 : 1);
