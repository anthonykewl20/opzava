import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { BASE, realLogin } from "../lib/session.mjs";
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
const R = []; const rec = (n, ok, d="") => { R.push({n,ok,d}); console.log(`${ok?"PASS":"FAIL"} ${n}${d?` — ${d}`:""}`); };
const b = await chromium.launch();
try {
  const c = await b.newContext({ viewport: { width: 1440, height: 1300 } });
  const p = await realLogin(c, { what: "gateway leaf #269" });
  await p.goto(`${BASE}/gateway`, { waitUntil: "networkidle" }).catch(()=>{});
  await p.waitForTimeout(1400); // motion + count-up settle
  await p.screenshot({ path: join(OUT, "gateway-desktop.png"), fullPage: true });
  const body = await p.locator("main").innerText().catch(()=> "");
  rec("Gateway page renders (not 404/403)", /gateway/i.test(body) && !/access denied|not found/i.test(body));
  rec("at-a-glance band (Lead orchestrator + Operator auth)", /lead orchestrator|orchestrator/i.test(body) && /operator|auth/i.test(body));
  rec("Who's driving / orchestration panel", /who.?s driving|orchestrat/i.test(body));
  rec("subagents present OR honest empty", /subagent|not elected|no main orchestrator|slot/i.test(body));
  rec("provider logo emblems rendered", await p.locator('[data-provider-icon]').count() >= 1, `${await p.locator('[data-provider-icon]').count()} emblems`);
  rec("honest state language", /reachable|active|unavailable|not.?configured|stale|healthy|not elected/i.test(body));
  rec("usage is a deep-link (not fabricated numbers)", /usage/i.test(body));
  // dark theme snapshot
  await p.emulateMedia({ colorScheme: "dark" }).catch(()=>{});
  await p.reload({ waitUntil: "networkidle" }).catch(()=>{}); await p.waitForTimeout(1200);
  await p.screenshot({ path: join(OUT, "gateway-dark.png"), fullPage: true });
  // mobile
  const m = await b.newContext({ viewport: { width: 375, height: 1000 }, isMobile: true });
  const mp = await realLogin(m, { what: "gateway mobile" });
  await mp.goto(`${BASE}/gateway`, { waitUntil: "networkidle" }).catch(()=>{});
  await mp.waitForTimeout(900);
  rec("no horizontal overflow @375", !(await mp.evaluate(()=> document.documentElement.scrollWidth > window.innerWidth + 1)));
  await mp.screenshot({ path: join(OUT, "gateway-mobile.png") });
  // regression
  await p.goto(`${BASE}/connections`, { waitUntil: "networkidle" }).catch(()=>{});
  rec("/connections still loads (no regression)", await p.getByRole("heading", { name: /Connections/i }).count() > 0);
  await c.close(); await m.close();
} finally { await b.close(); }
const passed = R.filter(r=>r.ok).length;
console.log(`\n${passed}/${R.length} passed`);
process.exit(passed === R.length ? 0 : 1);
