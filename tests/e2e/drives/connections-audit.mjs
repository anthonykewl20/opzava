// TEMP validation drive for #192 (connections governance audit). Real form login (no minted
// session), then the SAME authenticated request the UI's model toggle makes
// (POST /api/connections/model/models) against a genuinely-connected provider. Proves a real
// user-level connections mutation writes governance_audit rows. Restores the model to its prior state.
// Usage: node tests/e2e/drives/_audit-validate.mjs [outDir]

import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { BASE, realLogin, artifactDir } from "../lib/session.mjs";

const OUT = process.argv[2] ?? artifactDir("audit-validate");
mkdirSync(OUT, { recursive: true });

const PROVIDER_ID = "zai";
const MODEL_ID = "glm-4.7-flash";

const psql = (sql) =>
  execFileSync("docker", ["exec", "opzava-postgres-1", "psql", "-U", "opzava", "-d", "opzava", "-tA", "-c", sql], { encoding: "utf8" }).trim();
const auditCount = () => Number(psql("select count(*) from governance_audit"));

const before = auditCount();
console.log(`baseline governance_audit rows: ${before}`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
const page = await realLogin(context, { what: "connections audit (#192)" });
await page.goto(`${BASE}/connections/providers`, { waitUntil: "networkidle" }).catch(() => {});

async function toggle(enabled) {
  // context.request carries the real login session cookies — the exact call the UI button fires.
  const res = await context.request.post(`${BASE}/api/connections/model/models`, {
    data: { providerId: PROVIDER_ID, modelId: MODEL_ID, enabled },
    headers: { "content-type": "application/json" },
  });
  const status = res.status();
  const bodyText = await res.text().catch(() => "");
  console.log(`POST model/models enabled=${enabled} -> HTTP ${status}`);
  return { status, bodyText };
}

const r1 = await toggle(true);
const mid = auditCount();
await new Promise((r) => setTimeout(r, 1500));
const r2 = await toggle(false); // restore
const after = auditCount();

console.log(`\ngovernance_audit rows: before=${before} mid=${mid} after=${after} (delta=${after - before})`);
console.log("=== newest governance_audit rows ===");
console.log(psql(
  "select intent||' | '||transition||' | '||target_kind||'/'||coalesce(target_ref,'-')||' | actor='||actor_id||'('||actor_type||') | '||result||'/'||coalesce(result_code,'-')||' | cfg='||(config_version_id is not null) from governance_audit order by recorded_at desc limit 6"
));
console.log("=== a full row (verify no secret material) ===");
console.log(execFileSync("docker", ["exec", "opzava-postgres-1", "psql", "-U", "opzava", "-d", "opzava", "-x", "-c",
  "select intent,transition,target_ref,actor_id,actor_type,triggered_by_actor_id,triggered_by_action,result,result_code,result_message,config_version_id from governance_audit order by recorded_at desc limit 1"], { encoding: "utf8" }));

writeFileSync(`${OUT}/report.json`, JSON.stringify({ before, mid, after, r1: { status: r1.status }, r2: { status: r2.status } }, null, 2));
const proved = after > before;
console.log(`\n==== #192 audit rows written by a real authenticated connections mutation: ${proved ? "YES ✅ (+" + (after - before) + " rows)" : "NO ❌"} ====`);
await browser.close().catch(() => {});
process.exit(proved ? 0 : 1);
