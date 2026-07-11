// SeniorQA thin black-box harness primitives. Codex drives exploration.
import { chromium } from "@playwright/test";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_BASE_URL = "http://web.opzava.localhost:18088";
const DEFAULT_LOG_CMD = "docker compose logs --since {sinceIso} --no-color";
const DEFAULT_HEALTH_CMD = "docker compose ps -a --format json";
const DEFAULT_ARTIFACT_DIR = `real-validate-artifacts/senior-qa-probe-${new Date().toISOString().replaceAll(":", "-")}`;
const LOG_INTEREST = /error|exception|unhandled|fatal|panic/i;
const VALID_LENSES = new Set(["functional", "usability", "output"]);

export const SEVERITY = Object.freeze({ blocker: "blocker", major: "major", minor: "minor", nit: "nit" });
export const CONFIG = {
  baseUrl: process.env.SENIORQA_BASE_URL ?? DEFAULT_BASE_URL,
  artifactsDir: process.env.SENIORQA_ARTIFACT_DIR ?? DEFAULT_ARTIFACT_DIR,
  healthCommand: process.env.SENIORQA_HEALTH_CMD ?? DEFAULT_HEALTH_CMD,
  logCommand: process.env.SENIORQA_LOG_CMD ?? DEFAULT_LOG_CMD,
  allowExitedServices: new Set((process.env.SENIORQA_ALLOW_EXITED ?? "minio-bucket-init").split(",").map((item) => item.trim()).filter(Boolean)),
  expectedServices: null, healthCheck: null, logFetcher: null,
  login: {
    path: process.env.SENIORQA_LOGIN_PATH ?? "/login",
    email: process.env.SENIORQA_LOGIN_EMAIL ?? "owner@opzava.localhost",
    password: process.env.SENIORQA_LOGIN_PASSWORD ?? "OpzavaLocalDev!2026",
    emailSelector: 'input[name="email"], input[type="email"]',
    passwordSelector: 'input[name="password"], input[type="password"]',
    submitSelector: 'button[type="submit"], input[type="submit"]',
    timeoutMs: 15_000,
  },
};

let reportState;

export async function preflight(config = CONFIG) {
  if (typeof config.healthCheck === "function") return config.healthCheck(config);
  const result = runCommand(config.healthCommand);
  if (result.status !== 0) failPreflight(`Health check failed (${result.status}): ${compact(result.combined)}`);

  let rows;
  try {
    rows = parseJsonRows(result.stdout);
  } catch (error) {
    if (config.healthCommand !== DEFAULT_HEALTH_CMD) return { ok: true, services: [], output: compact(result.stdout) };
    failPreflight(`Could not parse docker compose health JSON: ${error.message}`);
  }

  const expected = Array.isArray(config.expectedServices) ? config.expectedServices : config.healthCommand === DEFAULT_HEALTH_CMD ? dockerComposeServices() : [];
  const problems = healthProblems(rows, expected, config.allowExitedServices ?? new Set());
  if (problems.length) failPreflight(`Stack unhealthy:\n  ${problems.join("\n  ")}`);
  return { ok: true, services: rows.length, expected: expected.length };
}

export async function realLogin(context, config = CONFIG) {
  if (process.env.PARITY_COOKIE) console.warn("PARITY_COOKIE is ignored: SeniorQA requires a real form login.");
  const page = await context.newPage();
  const loginPath = new URL(config.login.path, slash(config.baseUrl)).pathname;
  await page.goto(joinUrl(config.baseUrl, config.login.path), { waitUntil: "networkidle" });
  await page.locator(config.login.emailSelector).first().fill(config.login.email);
  await page.locator(config.login.passwordSelector).first().fill(config.login.password);
  await page.locator(config.login.submitSelector).first().click();
  await page.waitForURL((url) => !url.pathname.startsWith(loginPath), { timeout: config.login.timeoutMs }).catch(() => {
    throw new Error("REAL LOGIN FAILED - cannot run SeniorQA.");
  });
  await page.waitForLoadState("networkidle").catch(() => {});
  return page;
}

export async function reconDom(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  return page.evaluate(() => {
    const norm = (value, max = 160) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const labels = (element) => norm(element.labels ? [...element.labels].map((label) => label.textContent).join(" ") : "");
    const disabled = (element) => Boolean(element.disabled || element.getAttribute("aria-disabled") === "true");
    const textOf = (element) => norm(["aria-label", "title", "placeholder", "name", "id"].map((name) => element.getAttribute(name)).concat(labels(element), element.textContent).filter(Boolean).join(" "));
    const inputInfo = (element, index) => ({ index, tag: element.localName, type: element.getAttribute("type") ?? element.localName, name: element.getAttribute("name") ?? "", label: labels(element), placeholder: element.getAttribute("placeholder") ?? "", required: element.hasAttribute("required"), disabled: disabled(element) });
    const controlInfo = (element, index) => ({ index, text: textOf(element), type: element.getAttribute("type") ?? element.localName, name: element.getAttribute("name") ?? "", disabled: disabled(element) });
    const inputsOf = (form) => [...form.querySelectorAll("input, textarea, select")]
      .filter((element) => visible(element) && element.getAttribute("type") !== "hidden").slice(0, 40).map(inputInfo);

    return {
      url: location.href,
      title: document.title,
      forms: [...document.querySelectorAll("form")].filter(visible).slice(0, 20).map((form, index) => ({ index, action: form.getAttribute("action") || location.href, method: (form.getAttribute("method") || "GET").toUpperCase(), inputs: inputsOf(form) })),
      buttons: [...document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]')]
        .filter(visible).slice(0, 80).map(controlInfo),
      links: [...document.querySelectorAll("a[href]")]
        .filter(visible).slice(0, 80).map((element, index) => ({ index, text: textOf(element), href: element.href })),
      headings: [...document.querySelectorAll("h1,h2,h3")]
        .filter(visible).slice(0, 30).map((element) => ({ level: element.localName, text: textOf(element) })),
    };
  });
}

export async function logSlice(sinceIso, patterns = [], config = CONFIG) {
  const raw = typeof config.logFetcher === "function"
    ? await config.logFetcher({ sinceIso, patterns, config })
    : runCommand(config.logCommand, { sinceIso }, { SENIORQA_SINCE_ISO: sinceIso }).combined;
  const checks = patterns.map((pattern) => ({ pattern: String(pattern), matched: toRegex(pattern).test(String(raw)) }));
  const regexes = patterns.map(toRegex);
  return {
    sinceIso,
    text: compactLogs(raw, regexes),
    matched: checks.filter((check) => check.matched).map((check) => check.pattern),
    unmatched: checks.filter((check) => !check.matched).map((check) => check.pattern),
  };
}

export function setupArtifacts(config = CONFIG) {
  mkdirSync(config.artifactsDir, { recursive: true });
  getReport(config);
  return config.artifactsDir;
}

export async function screenshot(page, name, config = CONFIG) {
  const path = `${setupArtifacts(config)}/${slug(name)}.png`;
  await page.screenshot({ path, fullPage: true });
  return path;
}

export function writeFinding(finding, config = CONFIG) {
  const report = getReport(config);
  const normalized = normalizeFinding(finding, report.findings.length + 1);
  report.findings.push(normalized);
  appendFileSync(`${config.artifactsDir}/findings.ndjson`, `${JSON.stringify(normalized)}\n`);
  writeReport(config);
  return normalized;
}

export function writeReport(config = CONFIG) {
  const report = getReport(config);
  report.finishedAt = new Date().toISOString();
  const path = `${config.artifactsDir}/senior-qa-probe-report.json`;
  writeFileSync(path, JSON.stringify(report, null, 2));
  return path;
}

function getReport(config) {
  if (!reportState || reportState.artifactsDir !== config.artifactsDir) {
    mkdirSync(config.artifactsDir, { recursive: true });
    reportState = { mode: "probe", baseUrl: config.baseUrl, artifactsDir: config.artifactsDir, startedAt: new Date().toISOString(), findings: [] };
  }
  return reportState;
}

async function runCli(argv) {
  let cli;
  try {
    cli = parseCli(argv);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
    return;
  }
  if (cli.out) CONFIG.artifactsDir = cli.out;
  if (cli.help) return printHelp();
  if (!cli.selftest) {
    printHelp();
    process.exitCode = 2;
    return;
  }
  try {
    await runSelftest(cli.surface, cli.json);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = /health|preflight|compose|unhealthy/i.test(message) ? 2 : 1;
  }
}

async function runSelftest(surface, json) {
  await preflight();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  try {
    const page = await realLogin(context);
    await page.goto(joinUrl(CONFIG.baseUrl, surface), { waitUntil: "networkidle" });
    const dom = await reconDom(page);
    const shot = await screenshot(page, `selftest-${surface}`);
    const logs = await logSlice(new Date(Date.now() - 60_000).toISOString(), [surface, "error"]);
    const finding = writeFinding({
      lens: "functional",
      surface,
      objective: "dogfood the SeniorQA helper harness",
      repro: [`Run node senior-qa-probe.local.mjs --selftest ${surface}`, "Inspect the generated artifact report."],
      expected: "preflight, realLogin, reconDom, screenshot, logSlice, and writeFinding compose successfully.",
      actual: `Recon found ${dom.forms.length} forms, ${dom.buttons.length} buttons, ${dom.links.length} links, and ${dom.headings.length} headings.`,
      evidence: { screenshot: shot, responseSlice: "", logSlice: `${logs.text}\nunmatched: ${logs.unmatched.join(", ")}`.trim() },
      severity: SEVERITY.nit,
    });
    if (json) process.stdout.write(`${JSON.stringify(getReport(CONFIG), null, 2)}\n`);
    else console.log(`selftest wrote ${finding.id} to ${CONFIG.artifactsDir}`);
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

function parseCli(argv) {
  const parsed = { help: false, selftest: false, surface: "/", out: "", json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const [flag, inline] = raw.includes("=") ? raw.split(/=(.*)/s, 2) : [raw, undefined];
    const take = () => {
      const value = inline ?? argv[++index];
      if (!value) throw new Error(`${flag} requires a value`);
      return value;
    };
    if (flag === "--help" || flag === "-h") parsed.help = true;
    else if (flag === "--json") parsed.json = true;
    else if (flag === "--out") parsed.out = take();
    else if (flag === "--selftest") {
      parsed.selftest = true;
      if (inline) parsed.surface = inline;
      else if (argv[index + 1] && !argv[index + 1].startsWith("-")) parsed.surface = argv[++index];
    } else throw new Error(`Unknown option: ${raw}`);
  }
  return parsed;
}

function printHelp() {
  console.log(`SeniorQA PROBE thin harness

Usage: node senior-qa-probe.local.mjs --selftest [surface] [--out dir] [--json]

Exports: preflight, realLogin, reconDom, logSlice, screenshot, writeFinding, setupArtifacts, writeReport, CONFIG, SEVERITY

Driver shape:
  await preflight();
  const page = await realLogin(context);
  const dom = await reconDom(page);
  const logs = await logSlice(startedAt, ["expected signature"]);
  writeFinding({ lens, surface, objective, repro, expected, actual, evidence, severity });

Codex chooses actions, payloads, personas, and sequencing at runtime from the objective and live DOM.

Config:
  SENIORQA_BASE_URL       default ${DEFAULT_BASE_URL}
  SENIORQA_LOGIN_PATH     default /login
  SENIORQA_LOGIN_EMAIL    default owner@opzava.localhost
  SENIORQA_LOGIN_PASSWORD default OpzavaLocalDev!2026
  SENIORQA_HEALTH_CMD     default "${DEFAULT_HEALTH_CMD}"
  SENIORQA_LOG_CMD        default "${DEFAULT_LOG_CMD}", supports {sinceIso}
  SENIORQA_ARTIFACT_DIR   default real-validate-artifacts/senior-qa-probe-<timestamp>
  SENIORQA_ALLOW_EXITED   comma list, default minio-bucket-init

Non-docker drivers can import CONFIG and replace healthCheck, logFetcher, login selectors, or commands.`);
}

function normalizeFinding(finding, index) {
  const severity = finding.severity ?? SEVERITY.major;
  if (!Object.values(SEVERITY).includes(severity)) throw new Error(`Invalid severity: ${severity}`);
  if (!VALID_LENSES.has(finding.lens)) throw new Error(`Invalid lens: ${finding.lens}`);
  return {
    id: finding.id ?? `probe-${String(index).padStart(3, "0")}`,
    lens: finding.lens,
    surface: finding.surface ?? "",
    objective: finding.objective ?? "",
    repro: Array.isArray(finding.repro) ? finding.repro : [],
    expected: finding.expected ?? "",
    actual: finding.actual ?? "",
    evidence: {
      screenshot: evidenceText(finding.evidence?.screenshot),
      responseSlice: evidenceText(finding.evidence?.responseSlice),
      logSlice: evidenceText(finding.evidence?.logSlice),
    },
    severity,
  };
}

function runCommand(command, replacements = {}, extraEnv = {}) {
  const result = spawnSync(template(command, replacements), {
    shell: true,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, ...extraEnv },
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    combined: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function dockerComposeServices() {
  const result = spawnSync("docker", ["compose", "config", "--services"], { encoding: "utf8" });
  if (result.status !== 0) failPreflight(`docker compose config failed: ${result.stderr}`);
  return result.stdout.trim().split(/\r?\n/).filter(Boolean);
}

function healthProblems(rows, expected, allowExited) {
  const byService = new Map(rows.map((row) => [serviceName(row), row]));
  const problems = [];
  for (const service of expected.length ? expected : rows.map(serviceName).filter(Boolean)) {
    const row = byService.get(service);
    if (!row) {
      problems.push(`${service}: NOT CREATED`);
      continue;
    }
    const state = String(row.State ?? row.state ?? "").toLowerCase();
    const health = String(row.Health ?? row.health ?? "").toLowerCase();
    const status = String(row.Status ?? row.status ?? "").toLowerCase();
    const exitCode = Number(row.ExitCode ?? row.exitCode ?? row.exit_code ?? 0);
    const running = state === "running" || status.startsWith("up");
    const allowedExit = state === "exited" && exitCode === 0 && allowExited.has(service);
    const badHealth = health === "unhealthy" || health === "starting" || /unhealthy|starting/.test(status);
    if ((!running && !allowedExit) || (running && badHealth)) problems.push(`${service}: ${row.State ?? row.Status ?? "unknown"}`);
  }
  return problems;
}

function parseJsonRows(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return trimmed.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  }
}

function compactLogs(raw, patterns) {
  const lines = String(raw).split(/\r?\n/).filter(Boolean);
  const interesting = lines.filter((line) => LOG_INTEREST.test(line) || patterns.some((pattern) => pattern.test(line)));
  return compact((interesting.length ? interesting : lines.slice(-80)).join("\n"), 5000);
}

function toRegex(pattern) {
  if (pattern instanceof RegExp) return new RegExp(pattern.source, pattern.flags.replaceAll("g", ""));
  const match = String(pattern).match(/^\/(.+)\/([a-z]*)$/i);
  try {
    return match ? new RegExp(match[1], match[2].replaceAll("g", "")) : new RegExp(String(pattern), "i");
  } catch {
    return new RegExp(String(pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }
}

function failPreflight(message) {
  const error = new Error(message);
  error.exitCode = 2;
  throw error;
}

const evidenceText = (value) => (value == null ? "" : typeof value === "string" ? value : JSON.stringify(value));
const template = (command, values) => Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, quote(value)), command);
const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
const serviceName = (row) => row.Service ?? row.service ?? row.Name ?? row.name ?? "";
const joinUrl = (baseUrl, path) => new URL(path, slash(baseUrl)).toString();
const slash = (value) => (value.endsWith("/") ? value : `${value}/`);
const compact = (value, max = 1000) => String(value ?? "").replace(/\u001b\[[0-9;]*m/g, "").trim().slice(0, max);
const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "root";
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await runCli(process.argv.slice(2));
