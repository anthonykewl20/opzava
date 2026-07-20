// Real user-level verification drive for #260 (Admin Control Center Wave-0 shell: TB-F1 + TB-F4).
// Real form login as the seeded Owner, then drives the shadcn admin shell like a human:
// desktop + mobile screenshots, the 4-group IA, pinned Ask Admin, Soon-disabled destinations,
// the legacy Connections bridge, an existing page loading unchanged inside the shell, the /dev-board
// stub, the keyboard skip link, and the hard-403 admission on an unregistered route.
// Usage: node tests/e2e/drives/admin-shell-wave0.mjs [outDir]
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BASE, realLogin, artifactDir } from "../lib/session.mjs";

const OUT = process.argv[2] ?? artifactDir("admin-shell-wave0");
mkdirSync(OUT, { recursive: true });
const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();
try {
  // ---- Desktop ----
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await realLogin(desktop, { what: "admin shell Wave-0 (#260)" });

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" }).catch(() => {});
  await page.screenshot({ path: join(OUT, "01-overview-desktop.png"), fullPage: false });

  // Sidebar landmark + 4 groups in order + pinned Ask Admin
  const sidebar = page.locator('[data-slot="sidebar"], [data-sidebar="sidebar"]').first();
  record("sidebar renders", await sidebar.count() > 0);
  for (const label of ["Develop", "AI Runtime", "Operate", "Configure"]) {
    record(`group "${label}" present`, await page.getByText(label, { exact: true }).count() > 0);
  }
  record("pinned Ask Admin Opzava", await page.getByRole("link", { name: /Ask Admin Opzava/i }).count() > 0);

  // Soon-disabled destinations (unbuilt target routes)
  const soonCount = await page.locator('[aria-disabled="true"]').count();
  record("Soon-disabled destinations present", soonCount >= 10, `${soonCount} aria-disabled`);

  // Legacy Connections bridge
  record("legacy Connections link", await page.getByRole("link", { name: /Connections \(legacy\)/i }).count() > 0);

  // Skip link (visible on focus)
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: /skip to main content/i });
  record("keyboard skip link", await skip.count() > 0);

  // Existing page loads UNCHANGED inside the shell
  await page.goto(`${BASE}/connections`, { waitUntil: "networkidle" }).catch(() => {});
  const connOk = await page.getByRole("heading", { name: /Connections/i }).count() > 0
    && await sidebar.count() > 0;
  record("existing /connections loads inside new shell", connOk);
  await page.screenshot({ path: join(OUT, "02-connections-in-shell.png") });

  // /dev-board redirect-placeholder stub
  await page.goto(`${BASE}/dev-board`, { waitUntil: "networkidle" }).catch(() => {});
  record("/dev-board stub renders", await page.locator("body").innerText().then((t) => /dev board/i.test(t)));
  await page.screenshot({ path: join(OUT, "03-dev-board-stub.png") });

  // Hard-403 on an unregistered admin route (admitted user → catch-all forbidden)
  const resp = await page.goto(`${BASE}/definitely-not-a-real-route-xyz`, { waitUntil: "networkidle" }).catch(() => null);
  const status = resp ? resp.status() : 0;
  const bodyText = await page.locator("body").innerText().catch(() => "");
  record("unregistered route → 403", status === 403 || /access denied|403/i.test(bodyText), `HTTP ${status}`);
  await page.screenshot({ path: join(OUT, "04-forbidden.png") });

  await desktop.close();

  // ---- Mobile (Sheet) ----
  const mobileCtx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true });
  const m = await realLogin(mobileCtx, { what: "admin shell mobile (#260)" });
  await m.goto(`${BASE}/`, { waitUntil: "networkidle" }).catch(() => {});
  await m.screenshot({ path: join(OUT, "05-overview-mobile.png") });
  // No horizontal overflow at 375
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  record("no horizontal overflow @375px", !overflow);
  // Open the mobile Sheet
  const trigger = m.getByRole("button", { name: /toggle admin navigation/i }).first();
  if (await trigger.count() > 0) {
    await trigger.click().catch(() => {});
    await m.waitForTimeout(400);
    await m.screenshot({ path: join(OUT, "06-mobile-sheet-open.png") });
    record("mobile Sheet opens", await m.getByText("Develop", { exact: true }).count() > 0);
  } else {
    record("mobile Sheet opens", false, "trigger not found");
  }
  await mobileCtx.close();
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.ok).length;
writeFileSync(join(OUT, "report.json"), JSON.stringify({ base: BASE, passed, total: results.length, results }, null, 2));
console.log(`\n${passed}/${results.length} checks passed. Artifacts in ${OUT}`);
process.exit(passed === results.length ? 0 : 1);
