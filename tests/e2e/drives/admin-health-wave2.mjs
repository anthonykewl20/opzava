// Real user-level verification drive for #266 (Admin Control Center Wave-2: Health leaf).
// Real Owner login, real Connections snapshot, no mocks or mutations. Proves the approved
// ring → attention → KPI → disclosure reading order, honest counts/states, keyboard disclosure,
// disabled Re-check affordance, reduced-motion behavior, responsive layout, and both themes.
// Usage: node tests/e2e/drives/admin-health-wave2.mjs [outDir]
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BASE, realLogin, artifactDir } from "../lib/session.mjs";

const OUT = process.argv[2] ?? artifactDir("admin-health-wave2");
mkdirSync(OUT, { recursive: true });
const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();
try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await realLogin(desktop, { what: "Admin Health Wave-2 (#266)" });
  const response = await page
    .goto(`${BASE}/health`, { waitUntil: "networkidle" })
    .catch(() => null);
  record(
    "/health responds successfully",
    response?.status() === 200,
    `HTTP ${response?.status() ?? 0}`,
  );
  record(
    "Health is navigable in Operate",
    (await page.getByRole("link", { name: "Health", exact: true }).count()) > 0,
  );
  record(
    "Health heading renders",
    (await page.getByRole("heading", { name: "Health", level: 1 }).count()) === 1,
  );

  const mainText = (await page.locator("main").innerText()).toLowerCase();
  const readingOrder = [
    "health",
    "needs your attention",
    "gateway",
    "runtime",
    "runtime sessions",
    "all components",
  ];
  const positions = readingOrder.map((label) => mainText.indexOf(label));
  record(
    "approved reading order is preserved",
    positions.every(
      (position, index) => position >= 0 && (index === 0 || position > positions[index - 1]),
    ),
    positions.join(","),
  );

  const ring = page
    .locator('[role="img"][aria-label]')
    .filter({ has: page.locator("svg") })
    .first();
  const ringLabel = (await ring.getAttribute("aria-label")) ?? "";
  const counts = ringLabel.match(
    /(\d+) of (\d+) checks healthy, (\d+) needs? attention, (\d+) not checked/,
  );
  const currentCountsTruthful =
    counts !== null &&
    Number(counts[1]) + Number(counts[3]) + Number(counts[4]) === Number(counts[2]);
  const honestNoCurrentState =
    ringLabel === "No current health check is available" &&
    /not configured|unavailable|unknown/i.test(mainText) &&
    !mainText.includes("0/0");
  record(
    "ring exposes truthful accessible counts or an honest no-current state",
    currentCountsTruthful || honestNoCurrentState,
    ringLabel,
  );

  const recheck = page.getByRole("button", { name: "Re-check now" });
  record("Re-check is disabled instead of faked", await recheck.isDisabled());
  await recheck.locator("xpath=..").focus();
  record(
    "disabled Re-check explains the owning command",
    (await page
      .getByText("Re-check runs through the gateway — coming soon", { exact: true })
      .count()) > 0,
  );

  const disclosure = page.getByRole("button", { name: /All components/ });
  await disclosure.focus();
  await page.keyboard.press("Enter");
  record(
    "All components disclosure opens from the keyboard",
    (await disclosure.getAttribute("data-state")) === "open",
  );
  const componentCount = Number(
    (await page.locator("[data-component-count]").getAttribute("data-component-count")) ?? "0",
  );
  const visibleGroups = await page
    .getByRole("heading", { name: /System core|Channels|Agents/ })
    .count();
  record(
    "real disclosure lists component evidence",
    componentCount > 0 && visibleGroups > 0,
    `${componentCount} components`,
  );

  const unknownRows = await page.getByText("Unknown · not checked", { exact: true }).count();
  record(
    "not-checked components are labelled unknown",
    !ringLabel.includes("not checked") || ringLabel.endsWith("0 not checked") || unknownRows > 0,
    `${unknownRows} unknown rows`,
  );

  await page.getByRole("button", { name: "Light mode" }).click();
  await page.screenshot({ path: join(OUT, "01-health-light.png"), fullPage: true });
  await page.getByRole("button", { name: "Dark mode" }).click();
  await page.screenshot({ path: join(OUT, "02-health-dark.png"), fullPage: true });
  record(
    "light and dark themes render",
    (await page.locator("html").getAttribute("data-theme")) === "dark",
  );
  await desktop.close();

  const reduced = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    reducedMotion: "reduce",
  });
  const reducedPage = await realLogin(reduced, { what: "Admin Health reduced motion (#266)" });
  await reducedPage.goto(`${BASE}/health`, { waitUntil: "networkidle" });
  const animationNames = await reducedPage.evaluate(() => ({
    arc: getComputedStyle(document.querySelector("[data-ring-status]") ?? document.body)
      .animationName,
    tile: getComputedStyle(document.querySelector('[data-slot="card"]') ?? document.body)
      .animationName,
  }));
  record(
    "prefers-reduced-motion disables ring and tile animations",
    animationNames.arc === "none" && animationNames.tile === "none",
    JSON.stringify(animationNames),
  );
  await reduced.close();

  const mobile = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
  });
  const mobilePage = await realLogin(mobile, { what: "Admin Health mobile (#266)" });
  await mobilePage.goto(`${BASE}/health`, { waitUntil: "networkidle" });
  const overflow = await mobilePage.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  record("Health has no horizontal overflow at 375px", !overflow);
  await mobilePage.screenshot({ path: join(OUT, "03-health-mobile.png"), fullPage: true });
  await mobile.close();
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
