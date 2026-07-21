import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs"; import { join } from "node:path";
import { BASE, realLogin } from "../lib/session.mjs";
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
const R=[]; const rec=(n,ok,d="")=>{R.push({n,ok});console.log(`${ok?"PASS":"FAIL"} ${n}${d?` — ${d}`:""}`);};
const b = await chromium.launch();
try {
  const c = await b.newContext({ viewport:{width:1440,height:1300} });
  const p = await realLogin(c, { what:"models leaf #271" });
  await p.goto(`${BASE}/models`, { waitUntil:"networkidle" }).catch(()=>{}); await p.waitForTimeout(1400);
  await p.screenshot({ path: join(OUT,"models-desktop.png"), fullPage:true });
  const body = await p.locator("main").innerText().catch(()=> "");
  rec("Models page renders (not 404/403)", /models|providers/i.test(body) && !/access denied|not found/i.test(body));
  rec("at-a-glance band (Connected/Routable/Lead)", /connected/i.test(body) && /routable|lead/i.test(body));
  rec("provider cards w/ logos", await p.locator('[data-provider-icon]').count() >= 2, `${await p.locator('[data-provider-icon]').count()} emblems`);
  rec("role tags (Lead orchestrator / Subagent)", /lead orchestrator|subagent/i.test(body));
  rec("auth/token health surfaced", /oauth|api key|expir|static|healthy/i.test(body));
  rec("honest state language", /connected|not connected|unavailable|not.?configured|stale|advertised|catalog/i.test(body));
  rec("no token/secret displayed", !/sk-[a-z0-9]{8}|bearer [a-z0-9]{8}|secret:/i.test(body));
  const overflow = await p.evaluate(()=> document.documentElement.scrollWidth > window.innerWidth + 1);
  rec("no horizontal overflow desktop", !overflow);
  await p.goto(`${BASE}/connections`, { waitUntil:"networkidle" }).catch(()=>{});
  rec("/connections still loads (no regression)", await p.getByRole("heading",{name:/Connections/i}).count() > 0);
  await c.close();
} finally { await b.close(); }
const passed=R.filter(r=>r.ok).length; console.log(`\n${passed}/${R.length} passed`); process.exit(passed===R.length?0:1);
