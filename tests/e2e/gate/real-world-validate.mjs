// REAL-WORLD FINAL VALIDATION GATE (user directive 2026-07-04).
// Automated user-level validation against the REAL local docker stack:
//   real login (NO minted sessions), real data (NO mocks/synthetic),
//   real visuals (screenshots), iterative sweeps that LOOP UNTIL CLEAN.
// A slice is NOT Done until this exits 0. See docs/runbooks/senior-qa-gate.md.
//
// Usage (from the repo root — it shells out to `docker compose`):
//   docker compose up -d --build && node tests/e2e/gate/real-world-validate.mjs [outDir]
// Env:
//   REAL_BASE / REAL_EMAIL / REAL_PASSWORD (see tests/e2e/lib/session.mjs for defaults)
//   REAL_MAX_PASSES (default 5)  REAL_CLEAN_STREAK (default 2)
//   REAL_STORM_THRESHOLD (default 5)  connection-failure log lines in a pass
//     window that flip a warning into a blocking retry-storm finding.
//   REAL_CONNECTIONS_HEALTH / REAL_CONNECTIONS_INTEGRATIONS and the required numeric
//   REAL_CONNECTIONS_BASELINE_LOAD_MS / REAL_CONNECTIONS_MAX_REGRESSION_MS contract.
// Exit 0 = REAL_CLEAN_STREAK consecutive clean passes. Anything else = NOT DONE.

import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { BASE, realLogin } from "../lib/session.mjs";
// Positive-integer gate knobs. An invalid or non-positive value must ABORT (exit 2),
// never false-green: REAL_CLEAN_STREAK=0 would make `streak >= CLEAN_STREAK` true with
// zero passes run, and REAL_STORM_THRESHOLD=NaN would silently disable storm blocking.
const posInt = (name, def) => {
  const raw = process.env[name];
  if (raw === undefined) return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) fail(`${name} must be a positive integer, got ${JSON.stringify(raw)}`);
  return n;
};
const MAX_PASSES = posInt("REAL_MAX_PASSES", 5);
const CLEAN_STREAK = posInt("REAL_CLEAN_STREAK", 2);
const STORM_THRESHOLD = posInt("REAL_STORM_THRESHOLD", 5);
const OUT = process.argv[2] ?? `real-validate-artifacts/${new Date().toISOString().replaceAll(":", "-")}`;
const REPORT_BASE = new URL(BASE).origin;
mkdirSync(OUT, { recursive: true });

const SEED_ROUTES = ["/", "/tasks", "/issues", "/connections", "/connections/system",
  "/connections/providers", "/connections/github", "/connections/add", "/ask-opzava",
  "/crm/accounts", "/crm/contacts", "/crm/deals", "/crm/tickets"];
// One-shot init containers that legitimately exit 0.
const ALLOW_EXITED = new Set(["minio-bucket-init"]);
const HARD_LOG = /unhandled|fatal|panic/i;
// Connection-establishment failures (operator WS / device pairing). These do NOT
// contain "error|exception|..." so the plain log filter never saw them - a live
// worker->gateway retry-storm greened the gate (2026-07-06). Counted per pass:
// a storm (>= STORM_THRESHOLD) BLOCKS; a few transient blips only warn.
const CONN_FAIL = /closed before connect|closed before open|operator device token.*not found|pairing required|device is not approved|handshake (?:failed|rejected)|operator (?:handshake|connect).*(?:reject|denied|unauthor)/i;

if (process.env.PARITY_COOKIE) {
  console.warn("PARITY_COOKIE is IGNORED: final validation requires a REAL login.");
}

// ---------- Preflight: the REAL composed stack must be up (root cause of past
// false positives was acceptance passing while compose services were missing).
function preflight() {
  const cfg = spawnSync("docker", ["compose", "config", "--services"], { encoding: "utf8" });
  if (cfg.status !== 0) fail(`docker compose config failed: ${cfg.stderr}`);
  const expected = cfg.stdout.trim().split("\n").filter(Boolean);
  const ps = spawnSync("docker", ["compose", "ps", "-a", "--format", "json"], { encoding: "utf8" });
  if (ps.status !== 0) fail(`docker compose ps failed: ${ps.stderr}`);
  let rows;
  try {
    rows = ps.stdout.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch (e) {
    fail(`docker compose ps returned unparseable JSON: ${String(e).slice(0, 200)}`);
  }
  const state = new Map(rows.map((r) => [r.Service, r]));
  const problems = [];
  for (const svc of expected) {
    const row = state.get(svc);
    if (!row) { problems.push(`${svc}: NOT CREATED`); continue; }
    const running = row.State === "running";
    const cleanExit = row.State === "exited" && row.ExitCode === 0 && ALLOW_EXITED.has(svc);
    if (!running && !cleanExit) problems.push(`${svc}: ${row.State} (exit ${row.ExitCode})`);
  }
  if (problems.length) fail(`Stack incomplete - validation is meaningless:\n  ${problems.join("\n  ")}`);
  console.log(`preflight OK: ${expected.length} services (${[...ALLOW_EXITED].join(", ")} may be exited 0)`);
}
function fail(msg) { console.error(`PREFLIGHT FAIL: ${msg}`); process.exit(2); }

function requireConnectionsScenarioContract() {
  const required = [
    "REAL_CONNECTIONS_HEALTH",
    "REAL_CONNECTIONS_INTEGRATIONS",
    "REAL_CONNECTIONS_BASELINE_LOAD_MS",
    "REAL_CONNECTIONS_MAX_REGRESSION_MS",
  ];
  if (process.env.REAL_CONNECTIONS_HEALTH === "degraded")
    required.push("REAL_CONNECTIONS_ATTENTION");
  const missing = required.filter((name) => process.env[name] === undefined);
  if (missing.length > 0)
    fail(`Connections scenario contract is missing: ${missing.join(", ")}.`);
}

// A clean generic route sweep cannot prove the Connections state matrix. Require the dedicated
// real-login drive before looping. Environment is inherited by default; scenario declarations and
// credentials never enter command arguments, captured output, or the gate report.
function validateConnectionsScenario() {
  const childArtifacts = `${OUT}/connections-scenario`;
  const result = spawnSync(
    process.execPath,
    ["tests/e2e/drives/connections.mjs", childArtifacts],
    { stdio: "ignore" },
  );
  if (result.error !== undefined)
    fail("Connections scenario validation could not start; inspect the local runtime.");
  if (result.status !== 0)
    fail(`Connections scenario validation failed (exit ${result.status ?? "signal"}); inspect ${childArtifacts}/connections-report.json when present.`);
  console.log(`connections scenario OK: ${childArtifacts}`);
}

// ---------- Findings collection
function makeCollector(page, pass, findings) {
  page.on("console", (m) => { if (m.type() === "error") findings.push({ pass, kind: "console-error", where: page.url(), detail: m.text().slice(0, 500) }); });
  page.on("pageerror", (e) => findings.push({ pass, kind: "pageerror", where: page.url(), detail: String(e).slice(0, 500) }));
  page.on("response", (r) => {
    const status = r.status();
    const sameOrigin = r.url().startsWith(BASE);
    if (status >= 500) findings.push({ pass, kind: `http-${status}`, where: page.url(), detail: r.url() });
    else if (status === 404 && sameOrigin && ["document", "fetch", "xhr"].includes(r.request().resourceType()))
      findings.push({ pass, kind: "http-404", where: page.url(), detail: r.url() });
  });
}

async function discoverRoutes(page) {
  const hrefs = await page.$$eval('a[href^="/"]', (as) => as.map((a) => a.getAttribute("href")));
  const routes = new Set(SEED_ROUTES);
  for (const h of hrefs) {
    const clean = h.split("#")[0].split("?")[0];
    if (!clean || clean.startsWith("/api") || /log(in|out)|sign(in|out)/.test(clean)) continue;
    routes.add(clean);
  }
  return [...routes].slice(0, 40);
}

async function sweepRoute(page, route, pass, findings, screenshot) {
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 30000 });
  } catch (e) {
    findings.push({ pass, kind: "route-load-failed", where: route, detail: String(e).slice(0, 300) });
    return;
  }
  await page.waitForTimeout(500);
  if (new URL(page.url()).pathname.startsWith("/login"))
    findings.push({ pass, kind: "auth-bounce", where: route, detail: "redirected to /login mid-session" });
  for (const alert of await page.locator('[role="alert"]').all()) {
    const text = ((await alert.textContent()) ?? "").trim();
    if (text && /error|fail|unavailable|not implemented/i.test(text))
      findings.push({ pass, kind: "ui-error-state", where: route, detail: text.slice(0, 300) });
  }
  const mainText = (await page.locator("main").first().innerText().catch(() => "")).trim();
  if (mainText.length < 10)
    findings.push({ pass, kind: "empty-page", where: route, detail: `main has ${mainText.length} chars of text` });
  if (screenshot) await page.screenshot({ path: `${OUT}/p${pass}${route.replaceAll("/", "_") || "_root"}.png`, fullPage: true });
}

// Real WRITE round-trip: prove the UI -> server -> Postgres -> UI loop with real data.
async function writeFlowProof(page, pass, findings) {
  const title = `real-validate p${pass} ${Date.now() % 1000000}`;
  try {
    await page.goto(`${BASE}/tasks`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /new task/i }).first().click();
    await page.locator('input[name="title"], textarea[name="title"]').first().fill(title);
    await page.getByRole("button", { name: /create task/i }).first().click();
    await page.waitForLoadState("networkidle");
    await page.reload({ waitUntil: "networkidle" });
    if ((await page.getByText(title, { exact: false }).count()) === 0)
      findings.push({ pass, kind: "write-flow-failed", where: "/tasks", detail: `created task "${title}" not visible after reload` });
  } catch (e) {
    findings.push({ pass, kind: "write-flow-failed", where: "/tasks", detail: String(e).slice(0, 300) });
  }
}

// Service-log ground truth for the pass window. HARD_LOG matches block the pass;
// other error-ish lines are reported as warnings for the human/agent to audit.
// CONN_FAIL matches are counted separately: a retry-storm (>= STORM_THRESHOLD)
// blocks the pass, since a broken operator/pairing link is a real failure even
// when every page still renders; a handful of transient blips only warn.
function auditLogs(sinceIso, pass, findings, warnings) {
  const logs = spawnSync("docker", ["compose", "logs", "--since", sinceIso, "--no-color"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (logs.status !== 0)
    findings.push({ pass, kind: "service-log-unavailable", where: "docker compose logs",
      detail: `log collection failed (status ${logs.status}); logs-as-ground-truth cannot be verified this pass: ${String(logs.stderr ?? "").slice(0, 200)}` });
  const connFails = [];
  for (const line of (logs.stdout ?? "").split("\n")) {
    if (CONN_FAIL.test(line)) connFails.push(line.trim());
    if (!/error|exception|unhandled|fatal|panic/i.test(line)) continue;
    const entry = { pass, kind: "service-log", where: "docker compose logs", detail: line.trim().slice(0, 400) };
    (HARD_LOG.test(line) ? findings : warnings).push(entry);
  }
  if (connFails.length >= STORM_THRESHOLD)
    findings.push({ pass, kind: "conn-retry-storm", where: "docker compose logs",
      detail: `${connFails.length} connection-establishment failures in the pass window (>= ${STORM_THRESHOLD} = storm; a service link is down): ${connFails[0].slice(0, 300)}` });
  else
    for (const l of connFails) warnings.push({ pass, kind: "conn-fail", where: "docker compose logs", detail: l.slice(0, 400) });
}

// ---------- Main loop: iterate until CLEAN_STREAK consecutive clean passes.
requireConnectionsScenarioContract();
preflight();
validateConnectionsScenario();
const browser = await chromium.launch();
const report = { base: REPORT_BASE, startedAt: new Date().toISOString(), passes: [], verdict: "NOT-DONE" };
let streak = 0;

for (let pass = 1; pass <= MAX_PASSES && streak < CLEAN_STREAK; pass++) {
  const passStart = new Date().toISOString();
  const findings = [], warnings = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, colorScheme: "dark" });
  let routes = [];
  try {
    const page = await realLogin(ctx, { what: "anything else" });
    makeCollector(page, pass, findings);
    routes = await discoverRoutes(page);
    console.log(`pass ${pass}: sweeping ${routes.length} routes (discovered from live nav + seeds)`);
    for (const route of routes) await sweepRoute(page, route, pass, findings, pass === 1 || streak === CLEAN_STREAK - 1);
    await writeFlowProof(page, pass, findings);
  } catch (e) {
    findings.push({ pass, kind: "pass-aborted", where: REPORT_BASE, detail: String(e).slice(0, 500) });
  } finally {
    await ctx.close();
  }
  auditLogs(passStart, pass, findings, warnings);
  const clean = findings.length === 0;
  streak = clean ? streak + 1 : 0;
  report.passes.push({ pass, routes, clean, findings, warnings });
  console.log(`pass ${pass}: ${clean ? "CLEAN" : `${findings.length} FINDINGS`} (${warnings.length} log warnings) - streak ${streak}/${CLEAN_STREAK}`);
  for (const f of findings) console.log(`  [${f.kind}] ${f.where} :: ${f.detail}`);
}

await browser.close();
report.verdict = streak >= CLEAN_STREAK ? "DONE-ELIGIBLE" : "NOT-DONE";
report.finishedAt = new Date().toISOString();
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(`\nverdict: ${report.verdict} - artifacts + report.json in ${OUT}`);
process.exit(report.verdict === "DONE-ELIGIBLE" ? 0 : 1);
