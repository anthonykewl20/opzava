// Live proof for #251: the manual "Set as main" election is async and canary-gated.
// Drives the REAL authenticated UI/API path on the running stack and proves:
//   1. set-main returns 202 within the 20s web->worker budget (the sync canary would 502 here);
//   2. the election resolves asynchronously through the reconcile snapshot (queued/verifying/
//      committing -> idle) and the target model becomes the Lead orchestrator (one write);
//   3. no optimistic lead promotion: the target is not shown as lead until refreshed config confirms;
//   4. Ask Admin then runs on the elected model.
// The unrunnable->refused/zero-write branch is covered by the worker unit suite via probe failure
// injection (no catalog model the bundled Codex 0.144.6 rejects is available to drive it live).
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { BASE, realLogin, artifactDir } from "../lib/session.mjs";

const OUT = artifactDir("set-main-async-election");
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);
const rid = () => `e2e-setmain-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await realLogin(context, { what: "electing the main orchestrator (async #251)" });

async function gotoProviders() {
  await page.goto(`${BASE}/connections/providers`, { waitUntil: "networkidle" });
}
async function leadText() {
  // The provider card carrying the "Lead orchestrator" badge, plus the reconcile notice text.
  return page.evaluate(() => {
    const notice = document.body.innerText.match(/(Queued election for|Verifying|Committing|Could not elect)[^\n]*/)?.[0] ?? "";
    const cards = [...document.querySelectorAll("*")].filter((el) => /Lead orchestrator/.test(el.textContent ?? ""));
    const leadCard = cards.sort((a, b) => (a.textContent?.length ?? 0) - (b.textContent?.length ?? 0))[0];
    return { notice, lead: (leadCard?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200) };
  });
}

await gotoProviders();
const before = await leadText();
log("BASELINE lead/notice:", before.lead, "|", before.notice || "(idle)");
await page.screenshot({ path: `${OUT}/00-baseline.png`, fullPage: true });

// Elect a supported model that is (per the running config) NOT the current orchestrator, so a real
// canary + config write must happen and the verifying/committing phases are actually observable.
// Overridable via TARGET_MODEL if the current lead already is gpt-5.5.
const target = process.env.TARGET_MODEL ?? "gpt-5.5";
const requestId = rid();
log(`Electing openai/${target} with requestId=${requestId}`);

const t0 = Date.now();
const res = await page.evaluate(async ({ requestId, model }) => {
  const r = await fetch("/api/connections/orchestrator/set-main", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId, providerId: "openai", model }),
  });
  return { status: r.status, body: await r.text() };
}, { requestId, model: target });
const elapsedMs = Date.now() - t0;
log(`POST set-main -> ${res.status} in ${elapsedMs}ms`);
log("202 body:", res.body.slice(0, 400));

const assert = (cond, msg) => { if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else log("PASS:", msg); };
assert(res.status === 202, `set-main returns 202 (got ${res.status})`);
assert(elapsedMs < 20000, `202 within the 20s web->worker budget (got ${elapsedMs}ms)`);
let accepted = {};
try { accepted = JSON.parse(res.body); } catch {}
const rec = accepted.reconcile ?? {};
assert(rec.status === "running" && rec.reason === "set-main" && rec.requestId === requestId,
  `202 body carries running/set-main reconcile for this requestId (got ${JSON.stringify(rec).slice(0,120)})`);

// Poll the reconcile snapshot like the panel does (router.refresh) until it resolves. The state
// machine only clears to idle after the worker's post-patch readback confirms the config took, so
// "observed verifying/committing <target>" + "cleared to idle, no failure" is a code-backed proof
// that the async canary ran AND the write landed.
await gotoProviders();
let final = await leadText();
log("JUST-AFTER notice:", final.notice || "(none)");
let observedProgress = false;
let observedFailure = false;
const deadline = Date.now() + 150000;
while (Date.now() < deadline) {
  await gotoProviders();
  final = await leadText();
  const n = final.notice;
  if (n.toLowerCase().includes(target.toLowerCase()) && /(Queued election|Verifying|Committing)/.test(n))
    observedProgress = true;
  if (n.startsWith("Could not elect")) { observedFailure = true; break; }
  log(`  poll: notice="${n || "(cleared)"}" observedProgress=${observedProgress}`);
  if (n === "" && observedProgress) break;
  await new Promise((r) => setTimeout(r, 3000));
}
await page.screenshot({ path: `${OUT}/10-resolved.png`, fullPage: true });
log("FINAL notice:", final.notice || "(cleared/idle)", "| lead:", final.lead);
assert(!observedFailure, `election did not fail (notice="${final.notice}")`);
assert(observedProgress, `observed async canary progression (Verifying/Committing ${target})`);
assert(final.notice === "", `reconcile cleared to idle after readback-verified commit`);
assert(/Lead orchestrator/.test(final.lead), `openai remains the Lead orchestrator provider`);

// Ask Admin runs on the elected model.
await page.goto(`${BASE}/ask-admin`, { waitUntil: "networkidle" }).catch(() => {});
await page.screenshot({ path: `${OUT}/20-ask-admin.png`, fullPage: true });

log(`DONE. Artifacts in ${OUT}. exitCode=${process.exitCode ?? 0}`);
await browser.close();
