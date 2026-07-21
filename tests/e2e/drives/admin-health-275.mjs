// Real user-level verification drive for #275 (Health projection truth, slice 1 of 3).
//
// #266 shipped the Health leaf, but every agent row was hardcoded `not_checked`, so the ring sat at
// a permanent 4/7 that could never go green OR red. This drive proves the statuses are now DERIVED
// from real evidence, that OpenClaw's stock `main` agent is shown but never scored, that the three
// previously-discarded Gateway signals are projected honestly, and — the part unit tests cannot
// reach — that every surface showing the same fact now agrees about it.
//
// Real Owner login, real Connections snapshot, no mocks and no mutations.
// Usage: node tests/e2e/drives/admin-health-275.mjs [outDir]
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BASE, realLogin, artifactDir } from "../lib/session.mjs";

const OUT = process.argv[2] ?? artifactDir("admin-health-275");
mkdirSync(OUT, { recursive: true });
const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

/** Counts as rendered on /health: "9 of 10 components are healthy; 1 was not checked." */
function parseCounts(text) {
  const m = text.match(/(\d+)\s+of\s+(\d+)\s+components?\s+are\s+healthy/i);
  return m === null ? null : { healthy: Number(m[1]), total: Number(m[2]) };
}

const browser = await chromium.launch();
try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await realLogin(desktop, { what: "Admin Health projection truth (#275)" });

  const response = await page.goto(`${BASE}/health`, { waitUntil: "networkidle" }).catch(() => null);
  record("/health responds successfully", response?.status() === 200, `HTTP ${response?.status() ?? 0}`);

  // Expand the full component disclosure so every row's derived status is readable.
  const disclosure = page.getByRole("button", { name: /all components/i }).first();
  if ((await disclosure.count()) > 0) {
    await disclosure.click();
    await page.waitForTimeout(400);
  }
  const main = await page.locator("main").innerText();
  const flat = main.replace(/\s+/g, " ");
  await page.screenshot({ path: join(OUT, "01-health-expanded.png"), fullPage: true });

  // 1. Agent statuses are DERIVED, not hardcoded.
  // The old projector emitted this exact copy for every agent, unconditionally.
  record(
    "no agent still carries the hardcoded not-checked copy",
    !/Agent schedule configuration is available, but liveness was not checked/i.test(flat),
  );
  const derivedAgents = (main.match(/Agent readiness checks passed/gi) ?? []).length;
  record(
    "owned agents report a derived readiness result",
    derivedAgents > 0,
    `${derivedAgents} agent row(s) carry a derived readiness detail`,
  );

  // 2. `main` is visible but unmanaged, and never scored or attended.
  record(
    "OpenClaw's stock main agent is labelled unmanaged",
    /Unmanaged \(not an Opzava agent\)/i.test(flat),
  );
  const rowsShown = Number(flat.match(/All components\s+(\d+)/i)?.[1] ?? 0);
  const counts = parseCounts(flat);
  record(
    "the unmanaged row is listed but excluded from the score",
    counts !== null && rowsShown > counts.total,
    `${rowsShown} rows displayed, ${counts?.total ?? "?"} scored`,
  );
  record(
    "an unmanaged row never becomes an attention item",
    /Nothing needs your attention/i.test(flat) || !/Unmanaged/i.test(flat.split("Needs your attention")[1] ?? ""),
  );

  // 3. The ring is no longer pinned at the 4/7 ceiling #275 exists to remove.
  record(
    "the health ring is no longer stuck at the 4/7 ceiling",
    counts !== null && !(counts.healthy === 4 && counts.total === 7),
    counts === null ? "counts unreadable" : `${counts.healthy}/${counts.total}`,
  );

  // 4. The three recovered Gateway signals are present and honest.
  record("delivery queues are projected", /Delivery queues/i.test(flat));
  record("config reload is projected", /Config reload/i.test(flat));
  record(
    "plugin availability includes the unavailable check",
    /unavailable plugins? (were|was)? ?reported|unavailable plugins/i.test(flat),
  );
  // An absent signal must read as unknown, never as a fabricated zero or healthy.
  const absentSignalHonest =
    !/Delivery queue failures were not checked/i.test(flat) ||
    /Delivery queue failures were not checked[\s\S]{0,80}(Unknown|Not checked)/i.test(main);
  record("an absent signal reads unknown, never healthy or zero", absentSignalHonest);

  // 5. Cross-surface agreement — the regression that unit tests cannot see.
  // Each of these pages derives its totals from the same shared definition of a scored row; before
  // #275 they each counted `main` and disagreed with a corrected Health page.
  const topbarHealth = async () => {
    const header = await page.locator("header").first().innerText().catch(() => "");
    return (header.match(/\b(Healthy|Degraded|Unhealthy|Unknown)\b/i) ?? [])[0] ?? "";
  };
  const healthPill = await topbarHealth();
  record("topbar publishes a health rollup", healthPill !== "", healthPill);

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const overviewFlat = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  const overviewCounts = overviewFlat.match(/(\d+)\/(\d+)/)?.[0] ?? "";
  const overviewPill = await topbarHealth();
  await page.screenshot({ path: join(OUT, "02-overview.png"), fullPage: true });
  record(
    "Overview agrees with Health on the same rollup",
    overviewPill === healthPill,
    `health=${healthPill} overview=${overviewPill} counts=${overviewCounts}`,
  );

  await page.goto(`${BASE}/connections`, { waitUntil: "networkidle" });
  const connectionsFlat = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  await page.screenshot({ path: join(OUT, "03-connections.png"), fullPage: true });
  // The legacy Connections panel groups components itself. While it counted `main`, the Agents group
  // was permanently "unknown · 1 not checked" no matter how healthy the owned agents were.
  const agentsGroup = connectionsFlat.match(/Agents\s+[^A-Z]{0,40}/)?.[0] ?? "";
  record(
    "legacy Connections agents group is not stuck on the unmanaged row",
    !/not checked/i.test(agentsGroup),
    agentsGroup.trim(),
  );

  // 6. Neighbour regression: the leaves this slice must not have disturbed.
  for (const [path, heading] of [
    ["/gateway", "Gateway"],
    ["/models", "Models & Providers"],
  ]) {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" }).catch(() => null);
    record(
      `neighbour ${path} still renders`,
      res?.status() === 200 &&
        (await page.getByRole("heading", { name: heading, level: 1 }).count()) === 1,
      `HTTP ${res?.status() ?? 0}`,
    );
  }

  await desktop.close();
} finally {
  await browser.close();
}

const passed = results.filter((result) => result.ok).length;
writeFileSync(
  join(OUT, "report.json"),
  JSON.stringify({ base: BASE, passed, total: results.length, results }, null, 2),
);
console.log(`\n${passed}/${results.length} checks passed. Artifacts in ${OUT}`);
process.exit(passed === results.length ? 0 : 1);
