// Connections real-flow driver.
//
// One run validates one explicitly prepared, real health/integration state. It uses the real login,
// live Gateway data, and real server actions: no session minting, API mocks, or state fabrication.
// See tests/e2e/README.md for the required scenario matrix.
// Usage: node tests/e2e/drives/connections.mjs [outDir]
// Static classifier check: node tests/e2e/drives/connections.mjs --self-test
// Fixed-point timing capture: node tests/e2e/drives/connections.mjs --capture-baseline [outDir]

import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { BASE, artifactDir, realLogin } from "../lib/session.mjs";

const HEALTH_SCENARIOS = new Set(["healthy", "degraded", "unreachable"]);
const INTEGRATION_SCENARIOS = new Set(["empty", "connected"]);
const EXECUTION_MODE = connectionsExecutionMode(process.argv.slice(2));
const CAPTURE_BASELINE = EXECUTION_MODE === "baseline-capture";

if (EXECUTION_MODE === "self-test") {
  runScenarioClassifierSelfTest();
  console.log("connections scenario classifier self-test OK");
  process.exit(0);
}

const OUT =
  process.argv.slice(2).find((argument) => !argument.startsWith("--")) ??
  artifactDir("connections");

function requiredChoice(name, allowed) {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`${name} is required; prepare and declare a real Connections scenario.`);
  }
  if (!allowed.has(value)) {
    throw new Error(`${name} must be one of: ${[...allowed].join(", ")}.`);
  }
  return value;
}

function requiredNumber(name, { allowZero }) {
  const raw = process.env[name];
  if (raw === undefined)
    throw new Error(`${name} is required for Connections regression validation.`);
  if (raw.trim() === "")
    throw new Error(`${name} must be a ${allowZero ? "nonnegative" : "positive"} number.`);
  const value = Number(raw);
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new Error(`${name} must be a ${allowZero ? "nonnegative" : "positive"} number.`);
  }
  return value;
}

const expectedHealth = CAPTURE_BASELINE
  ? null
  : requiredChoice("REAL_CONNECTIONS_HEALTH", HEALTH_SCENARIOS);
const expectedIntegration = CAPTURE_BASELINE
  ? null
  : requiredChoice("REAL_CONNECTIONS_INTEGRATIONS", INTEGRATION_SCENARIOS);
let expectedAttention = 0;
if (!CAPTURE_BASELINE && expectedHealth === "degraded") {
  const raw = process.env.REAL_CONNECTIONS_ATTENTION;
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(
      "REAL_CONNECTIONS_ATTENTION is required and must be a positive integer for degraded health.",
    );
  }
  expectedAttention = parsed;
} else if (!CAPTURE_BASELINE && process.env.REAL_CONNECTIONS_ATTENTION !== undefined) {
  const parsed = Number(process.env.REAL_CONNECTIONS_ATTENTION);
  if (!Number.isInteger(parsed) || parsed !== 0) {
    throw new Error("REAL_CONNECTIONS_ATTENTION must be 0 or omitted outside degraded health.");
  }
}
const baselineLoadMs = CAPTURE_BASELINE
  ? null
  : requiredNumber("REAL_CONNECTIONS_BASELINE_LOAD_MS", { allowZero: false });
const maxRegressionMs = CAPTURE_BASELINE
  ? null
  : requiredNumber("REAL_CONNECTIONS_MAX_REGRESSION_MS", { allowZero: true });
const allowedConnectionsLoadMs =
  baselineLoadMs === null || maxRegressionMs === null ? null : baselineLoadMs + maxRegressionMs;
const reportBase = new URL(BASE).origin;

mkdirSync(OUT, { recursive: true });

const TIERS = [
  { id: "frontier", tab: /^frontier/i, expect: ["openai", "anthropic"] },
  {
    id: "bundles",
    tab: /^bundles/i,
    expect: ["opencode-go", "openrouter", "qwen", "cloudflare-ai-gateway"],
  },
  {
    id: "best-subagents",
    tab: /^best subagents/i,
    expect: ["zai", "moonshot", "minimax", "xiaomi"],
  },
  { id: "other", tab: /^other/i, expect: [] },
];
const RUNTIME_IDS = new Set([
  "codex",
  "codex-cli",
  "codex-app-server",
  "claude-cli",
  "google-gemini-cli",
  "gemini-cli",
]);
const NON_LLM_IDS = new Set([
  "deepgram",
  "elevenlabs",
  "azure-speech",
  "senseaudio",
  "comfy",
  "fal",
  "runway",
  "pixverse",
]);

const report = {
  base: reportBase,
  mode: EXECUTION_MODE,
  expectedScenario: CAPTURE_BASELINE
    ? null
    : {
        health: expectedHealth,
        integrations: expectedIntegration,
        attentionCount: expectedAttention,
      },
  performanceContract: {
    baselineLoadMs,
    maxRegressionMs,
    allowedConnectionsLoadMs,
  },
  observed: null,
  heroHealth: null,
  pillHealth: null,
  gatewayState: null,
  integrationState: null,
  providerOrdering: null,
  providerPage: null,
  expandedSections: [],
  redirectChain: [],
  healthCheck: null,
  navigationTimings: {},
  baselineCapture: null,
  screenshotPaths: [],
  findings: [],
};

function finding(detail) {
  report.findings.push(detail);
}

function assertFinding(condition, detail) {
  if (!condition) finding(detail);
}

function failOnFindings(stage) {
  if (report.findings.length > 0) {
    throw new Error(`${stage}: ${report.findings.join("; ")}`);
  }
}

async function timedGoto(page, route, options = {}) {
  const started = performance.now();
  const response = await page.goto(`${BASE}${route}`, {
    waitUntil: "networkidle",
    timeout: 30_000,
    ...options,
  });
  const elapsedMs = Math.round(performance.now() - started);
  (report.navigationTimings[route] ??= []).push(elapsedMs);
  if (
    route === "/connections" &&
    allowedConnectionsLoadMs !== null &&
    elapsedMs > allowedConnectionsLoadMs
  ) {
    finding(
      `${route} load ${elapsedMs}ms exceeded baseline plus allowed regression (${allowedConnectionsLoadMs}ms)`,
    );
  }
  return response;
}

function canonicalCheckedAt(value) {
  return value === null || value === "" || value === "not-checked" ? null : value;
}

async function healthFrom(locator) {
  const status = await locator.getAttribute("data-health-status");
  const attentionRaw = await locator.getAttribute("data-health-attention-count");
  const checkedAt = canonicalCheckedAt(await locator.getAttribute("data-health-checked-at"));
  const attentionCount = attentionRaw === null ? Number.NaN : Number(attentionRaw);
  return { status, attentionCount, checkedAt };
}

function assertHealthShape(value, label) {
  assertFinding(
    ["healthy", "attention", "unknown"].includes(value.status),
    `${label} has invalid health status`,
  );
  assertFinding(
    Number.isInteger(value.attentionCount) && value.attentionCount >= 0,
    `${label} has invalid attention count`,
  );
}

async function overviewHealth(page) {
  const hero = page
    .locator('main section[aria-labelledby="system-health-title"] [data-health-status]')
    .first();
  const pill = page.locator("header .health-pill").first();
  await hero.waitFor({ state: "visible" });
  await pill.waitFor({ state: "visible" });
  const heroHealth = await healthFrom(hero);
  const pillHealth = await healthFrom(pill);
  assertHealthShape(heroHealth, "hero");
  assertHealthShape(pillHealth, "global pill");
  assertFinding(
    JSON.stringify(heroHealth) === JSON.stringify(pillHealth),
    "hero/pill health mismatch",
  );

  const heroText = (await hero.innerText()).replaceAll(/\s+/g, " ").trim();
  const pillText = (await pill.innerText()).replaceAll(/\s+/g, " ").trim();
  if (heroHealth.status === "healthy") {
    assertFinding(heroText.includes("All systems healthy"), "healthy hero text mismatch");
    assertFinding(pillText === "All systems healthy", "healthy pill text mismatch");
  } else if (heroHealth.status === "attention") {
    const count = heroHealth.attentionCount;
    const heroExpected = `${count} ${count === 1 ? "component needs" : "components need"} attention`;
    const pillExpected = `${count} ${count === 1 ? "needs" : "need"} attention`;
    assertFinding(heroText.includes(heroExpected), "attention hero text mismatch");
    assertFinding(pillText === pillExpected, "attention pill text mismatch");
  } else {
    const expectedHeadline = unknownHealthHeadline(expectedHealth);
    assertFinding(heroText.includes(expectedHeadline), "unknown hero text mismatch");
    assertFinding(pillText === "Health unknown", "unknown pill text mismatch");
  }

  return { hero: heroHealth, pill: pillHealth };
}

async function overviewGatewayState(page) {
  const card = page.locator('main section[aria-labelledby="gateway-card-title"]');
  const activeCount = await card.getByText("Active", { exact: true }).count();
  const unavailableCount = await card.getByText("Unavailable", { exact: true }).count();
  const connectionStatus =
    activeCount === 1 && unavailableCount === 0
      ? "active"
      : unavailableCount === 1 && activeCount === 0
        ? "unavailable"
        : null;

  const componentLabels = [
    ["Healthy", "healthy"],
    ["Needs attention", "attention"],
    ["Not checked", "not_checked"],
  ];
  const presentComponentStatuses = [];
  for (const [label, status] of componentLabels) {
    if ((await card.getByText(label, { exact: true }).count()) === 1) {
      presentComponentStatuses.push(status);
    }
  }
  const componentStatus =
    presentComponentStatuses.length === 1 ? presentComponentStatuses[0] : null;

  assertFinding(connectionStatus !== null, "Overview Gateway connection state is ambiguous");
  assertFinding(componentStatus !== null, "Overview Gateway component health is ambiguous");
  return { connectionStatus, componentStatus, source: "overview-gateway-card" };
}

function classifyObservedScenario(input) {
  if (
    input.health.status === "healthy" &&
    input.health.checkedAt !== null &&
    input.gateway.connectionStatus === "active" &&
    input.gateway.componentStatus === "healthy"
  ) {
    return "healthy";
  }
  if (input.health.status === "attention") return "degraded";
  if (
    input.health.status === "unknown" &&
    input.health.checkedAt === null &&
    input.gateway.connectionStatus === "unavailable" &&
    input.gateway.componentStatus === "not_checked"
  ) {
    return "unreachable";
  }
  return "partial-unknown";
}

function connectionsExecutionMode(argumentsList) {
  if (argumentsList.includes("--self-test")) return "self-test";
  if (argumentsList.includes("--capture-baseline")) return "baseline-capture";
  return "scenario-validation";
}

function healthCheckExpectation(scenario) {
  return scenario === "unreachable"
    ? { noticeParam: "health-check-error", reportNotice: "error", checkedAt: "unchanged-null" }
    : { noticeParam: "health-check-complete", reportNotice: "complete", checkedAt: "changed" };
}

function unknownHealthHeadline(scenario) {
  return scenario === "unreachable" ? "OpenClaw unreachable" : "System health is not fully checked";
}

function runScenarioClassifierSelfTest() {
  const cases = [
    {
      name: "healthy requires checked reachable Gateway facts",
      input: {
        health: { status: "healthy", checkedAt: "2026-07-14T00:00:00.000Z" },
        gateway: { connectionStatus: "active", componentStatus: "healthy" },
      },
      expected: "healthy",
    },
    {
      name: "attention is degraded",
      input: {
        health: { status: "attention", checkedAt: "2026-07-14T00:00:00.000Z" },
        gateway: { connectionStatus: "active", componentStatus: "healthy" },
      },
      expected: "degraded",
    },
    {
      name: "unknown agents do not make a reachable Gateway unreachable",
      input: {
        health: { status: "unknown", checkedAt: "2026-07-14T00:00:00.000Z" },
        gateway: { connectionStatus: "active", componentStatus: "healthy" },
      },
      expected: "partial-unknown",
    },
    {
      name: "active Gateway with missing probes remains partial unknown",
      input: {
        health: { status: "unknown", checkedAt: null },
        gateway: { connectionStatus: "active", componentStatus: "not_checked" },
      },
      expected: "partial-unknown",
    },
    {
      name: "unreachable requires unavailable unchecked Gateway and no checkedAt",
      input: {
        health: { status: "unknown", checkedAt: null },
        gateway: { connectionStatus: "unavailable", componentStatus: "not_checked" },
      },
      expected: "unreachable",
    },
    {
      name: "stale checkedAt does not prove unreachable",
      input: {
        health: { status: "unknown", checkedAt: "2026-07-14T00:00:00.000Z" },
        gateway: { connectionStatus: "unavailable", componentStatus: "not_checked" },
      },
      expected: "partial-unknown",
    },
  ];
  for (const testCase of cases) {
    const actual = classifyObservedScenario(testCase.input);
    if (actual !== testCase.expected) {
      throw new Error(`${testCase.name}: expected ${testCase.expected}, received ${actual}`);
    }
  }

  const modeCases = [
    { argumentsList: [], expected: "scenario-validation" },
    { argumentsList: ["artifacts"], expected: "scenario-validation" },
    { argumentsList: ["--capture-baseline"], expected: "baseline-capture" },
    { argumentsList: ["--self-test", "--capture-baseline"], expected: "self-test" },
  ];
  for (const testCase of modeCases) {
    const actual = connectionsExecutionMode(testCase.argumentsList);
    if (actual !== testCase.expected) {
      throw new Error(`execution mode: expected ${testCase.expected}, received ${actual}`);
    }
  }

  const reachableCheck = healthCheckExpectation("healthy");
  const degradedCheck = healthCheckExpectation("degraded");
  const unreachableCheck = healthCheckExpectation("unreachable");
  if (
    reachableCheck.reportNotice !== "complete" ||
    degradedCheck.checkedAt !== "changed" ||
    unreachableCheck.noticeParam !== "health-check-error" ||
    unreachableCheck.checkedAt !== "unchanged-null"
  ) {
    throw new Error("health-check outcome contract self-test failed");
  }
  if (
    unknownHealthHeadline("unreachable") !== "OpenClaw unreachable" ||
    unknownHealthHeadline("healthy") !== "System health is not fully checked" ||
    unknownHealthHeadline(null) !== "System health is not fully checked"
  ) {
    throw new Error("unknown health headline contract self-test failed");
  }
}

function assertExpectedHealth(health, gateway, label) {
  const observed = classifyObservedScenario({ health, gateway });
  assertFinding(
    observed === expectedHealth,
    `${label} health classified as ${observed}, not expected ${expectedHealth}`,
  );
  assertFinding(
    health.attentionCount === expectedAttention,
    `${label} attention count does not match scenario`,
  );
  if (expectedHealth === "unreachable") {
    assertFinding(
      gateway.connectionStatus === "unavailable",
      `${label} unreachable scenario requires Gateway unavailable`,
    );
    assertFinding(
      gateway.componentStatus === "not_checked",
      `${label} unreachable scenario requires Gateway component not checked`,
    );
    assertFinding(
      health.checkedAt === null,
      `${label} unreachable scenario requires no successful health checkedAt`,
    );
  }
}

function rowActions(row) {
  return row.getByRole("button", { name: /^row actions for /i });
}

async function openRowAction(page, row, name) {
  await rowActions(row).first().click();
  await page.getByRole("menuitem", { name }).first().click();
}

async function openTier(page, tier) {
  const tab = page.getByRole("tab", { name: tier.tab });
  if ((await tab.count()) === 0) return { present: false, ids: [], connectedModelCount: 0 };
  await tab.first().click();
  await page.waitForTimeout(250);
  const panel = page.locator(`[data-provider-tier="${tier.id}"]`);
  const ids = await panel
    .locator("tr[data-provider-id]")
    .evaluateAll((rows) =>
      rows.map((row) => (row.getAttribute("data-provider-id") ?? "").toLowerCase()),
    );
  const connectedModelCount = await panel.locator("tr[data-provider-id]").evaluateAll((rows) =>
    rows.reduce((count, row) => {
      const status = row.querySelector('[data-label="Status"]')?.textContent ?? "";
      if (!/connected/i.test(status) || /not connected/i.test(status)) return count;
      return count + row.querySelectorAll('[data-label="Models"] .font-mono').length;
    }, 0),
  );
  return { present: true, ids, connectedModelCount };
}

async function validateProviderPage(page) {
  await timedGoto(page, "/connections/providers");
  assertFinding(
    (await page.getByRole("table", { name: /llm model providers/i }).count()) > 0,
    "providers table missing",
  );
  for (const tier of TIERS.slice(0, 3)) {
    assertFinding(
      (await page.getByRole("tab", { name: tier.tab }).count()) > 0,
      `tier tab ${tier.id} missing`,
    );
  }

  const perTier = {};
  const allIds = [];
  let connectedModelCount = 0;
  for (const tier of TIERS) {
    const result = await openTier(page, tier);
    perTier[tier.id] = result.ids;
    allIds.push(...result.ids);
    connectedModelCount += result.connectedModelCount;
    for (const id of tier.expect) {
      assertFinding(result.ids.includes(id), `${id} missing from ${tier.id} tier`);
    }
  }
  assertFinding(allIds.includes("zai"), "zai provider missing");
  assertFinding(allIds.includes("openrouter"), "openrouter provider missing");
  assertFinding(!allIds.some((id) => RUNTIME_IDS.has(id)), "standalone runtime provider present");
  assertFinding(!allIds.some((id) => NON_LLM_IDS.has(id)), "non-LLM provider present");
  assertFinding(connectedModelCount > 0, "connected provider has no real configured model");

  let connectedRow = null;
  let connectedTier = null;
  for (const tier of TIERS) {
    const tab = page.getByRole("tab", { name: tier.tab });
    if ((await tab.count()) === 0) continue;
    await tab.first().click();
    await page.waitForTimeout(250);
    const rows = page.locator(`[data-provider-tier="${tier.id}"] tr[data-provider-id]`);
    for (let index = 0; index < (await rows.count()); index += 1) {
      const row = rows.nth(index);
      if ((await rowActions(row).count()) > 0) {
        connectedRow = row;
        connectedTier = tier.id;
        break;
      }
    }
    if (connectedRow !== null) break;
  }

  assertFinding(connectedRow !== null, "no connected provider available for Manage coverage");
  if (connectedRow !== null) {
    await openRowAction(page, connectedRow, /^manage$/i);
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible", timeout: 5_000 });
    const model = (await dialog.locator("[data-active-model]").first().textContent())?.trim() ?? "";
    assertFinding(model !== "" && model !== "No configured model", "Manage lacks a real model");
    await dialog.getByRole("button", { name: /^close$/i }).click();
    await dialog.waitFor({ state: "hidden", timeout: 5_000 });

    let postedBeforeConfirm = false;
    const observePost = (request) => {
      if (request.method() === "POST") postedBeforeConfirm = true;
    };
    page.on("request", observePost);
    await openRowAction(page, connectedRow, /^disconnect$/i);
    const confirm = page.getByRole("alertdialog");
    await confirm.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
    assertFinding((await confirm.count()) > 0, "Disconnect confirmation missing");
    assertFinding(!postedBeforeConfirm, "Disconnect posted before confirmation");
    await confirm
      .getByRole("button", { name: /^cancel$/i })
      .click()
      .catch(() => {});
    page.off("request", observePost);
  }

  report.providerPage = { perTier, connectedModelCount, connectedTier };
}

async function validateOverviewStructure(page) {
  for (const heading of [
    "System health",
    "Opzava Gateway",
    "Model Providers",
    "Third-Party Integrations",
  ]) {
    assertFinding(
      (await page.getByRole("heading", { name: heading, exact: true }).count()) > 0,
      `${heading} heading missing`,
    );
  }

  const healthBar = page.getByRole("img", {
    name: /^\d+ healthy, \d+ (?:needs|need) attention, \d+ not checked$/,
  });
  assertFinding((await healthBar.count()) === 1, "health bar exact-count accessible label missing");
  const healthBarLabel = (await healthBar.getAttribute("aria-label")) ?? "";
  const counts = healthBarLabel.match(
    /^(\d+) healthy, (\d+) (?:needs|need) attention, (\d+) not checked$/,
  );
  assertFinding(counts !== null, "health bar count label could not be parsed");

  const groupNav = page.getByRole("navigation", { name: "OpenClaw component groups" });
  const groupCounts = {};
  for (const group of ["System Core", "Channels", "Agents"]) {
    const link = groupNav.getByRole("link", {
      name: new RegExp(`^${group}: \\d+ healthy, \\d+ (?:needs|need) attention, \\d+ not checked$`),
    });
    assertFinding((await link.count()) === 1, `${group} summary missing`);
    if ((await link.count()) === 1) {
      assertFinding(
        (await link.getAttribute("href")) === "/connections/system",
        `${group} link mismatch`,
      );
      const label = (await link.getAttribute("aria-label")) ?? "";
      const groupMatch = label.match(
        new RegExp(
          `^${group}: (\\d+) healthy, (\\d+) (?:needs|need) attention, (\\d+) not checked$`,
        ),
      );
      assertFinding(groupMatch !== null, `${group} exact-count summary could not be parsed`);
      if (groupMatch !== null) {
        groupCounts[group] = {
          healthy: Number(groupMatch[1]),
          attention: Number(groupMatch[2]),
          notChecked: Number(groupMatch[3]),
        };
      }
    }
  }

  return counts === null
    ? null
    : {
        healthy: Number(counts[1]),
        attention: Number(counts[2]),
        notChecked: Number(counts[3]),
        groups: groupCounts,
      };
}

function providerPriority(status, authHealth) {
  if (
    status === "needs_attention" ||
    status === "pending" ||
    ["expired", "missing", "expiring"].includes(authHealth)
  ) {
    return 0;
  }
  return status === "connected" ? 1 : 2;
}

async function validateOverviewProviders(page) {
  const card = page.locator('main section[aria-labelledby="providers-card-title"]');
  const rows = card.locator("li[data-provider-id]");
  const count = await rows.count();
  const text = (await card.innerText()).replaceAll(/\s+/g, " ");
  const catalogMatch = text.match(/\d+ of (\d+) connected/i);
  const catalogSupportsThree = catalogMatch !== null && Number(catalogMatch[1]) >= 3;
  assertFinding(count <= 4, "Overview displays more than four provider rows");
  if (catalogSupportsThree)
    assertFinding(count >= 3, "Overview displays fewer than three provider rows");

  const observed = [];
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    const id = (await row.getAttribute("data-provider-id")) ?? "";
    const status = (await row.getAttribute("data-provider-status")) ?? "";
    const authHealth = (await row.getAttribute("data-provider-auth-health")) ?? "";
    const action = row.getByRole("link", { name: /^(Setup|Fix|Manage)$/ });
    const priority = providerPriority(status, authHealth);
    assertFinding(id.toLowerCase() !== "github", "GitHub appeared in model provider rows");
    assertFinding((await action.count()) === 1, `provider ${id || index} lacks a real action`);
    if ((await action.count()) === 1) {
      assertFinding(
        (await action.getAttribute("href")) === "/connections/providers",
        `provider ${id || index} action destination mismatch`,
      );
    }
    observed.push({ id, status, authHealth, priority });
  }
  assertFinding(
    observed.every((row, index) => index === 0 || observed[index - 1].priority <= row.priority),
    "provider rows are not problem-first, connected-second, suggestions-last",
  );
  report.providerOrdering = observed;
}

async function validateIntegration(page) {
  const card = page.locator('main section[aria-labelledby="integrations-card-title"]');
  const github = card.locator('[data-integration-id="github"]');
  const connected = (await github.count()) === 1;
  const observed = connected ? "connected" : "empty";
  report.integrationState = observed;
  assertFinding(
    observed === expectedIntegration,
    "observed integration state does not match scenario",
  );
  if (connected) {
    assertFinding(
      (await github.getAttribute("data-integration-status")) === "connected",
      "GitHub integration is not connected",
    );
    assertFinding(
      (await github.getByText("GitHub", { exact: true }).count()) === 1,
      "GitHub row missing",
    );
    const open = github.getByRole("link", { name: "Open", exact: true });
    assertFinding(
      (await open.getAttribute("href")) === "/connections/github",
      "GitHub Open link mismatch",
    );
  } else {
    assertFinding(
      (await card.getByText("No integrations connected", { exact: true }).count()) === 1,
      "integration empty-state text missing",
    );
    const add = card.getByRole("link", { name: "Add integration", exact: true });
    assertFinding(
      (await add.getAttribute("href")) === "/connections/add",
      "Add integration link missing",
    );
  }
}

async function runHealthCheck(page) {
  const beforeHealth = await overviewHealth(page);
  const beforeGateway = await overviewGatewayState(page);
  const expectation = healthCheckExpectation(expectedHealth);
  const button = page.getByRole("button", { name: "Run health check", exact: true }).first();
  await Promise.all([
    page.waitForURL(
      (url) =>
        url.pathname === "/connections" &&
        url.searchParams.get("notice") === expectation.noticeParam,
      {
        timeout: 30_000,
      },
    ),
    button.click(),
  ]);
  await page.waitForLoadState("networkidle");
  if (expectation.reportNotice === "complete") {
    const notice = page.getByRole("status");
    assertFinding(
      (await notice.getByText("Health check complete.", { exact: true }).count()) === 1,
      "manual health check did not report server-action success",
    );
  } else {
    const notice = page.getByRole("alert");
    assertFinding(
      (await notice.getByText("Health check could not complete.", { exact: true }).count()) === 1,
      "unreachable health check did not report the server-action error",
    );
  }
  const afterHealth = await overviewHealth(page);
  const afterGateway = await overviewGatewayState(page);
  if (expectation.checkedAt === "changed") {
    assertFinding(
      beforeHealth.hero.checkedAt !== afterHealth.hero.checkedAt,
      "manual health check did not change checkedAt",
    );
  } else {
    assertFinding(
      beforeHealth.hero.checkedAt === null && afterHealth.hero.checkedAt === null,
      "unreachable health check must preserve a null checkedAt",
    );
  }
  assertExpectedHealth(beforeHealth.hero, beforeGateway, "pre-check");
  assertExpectedHealth(afterHealth.hero, afterGateway, "post-check");
  report.healthCheck = {
    before: { health: beforeHealth.hero, gateway: beforeGateway },
    after: { health: afterHealth.hero, gateway: afterGateway },
    notice: expectation.reportNotice,
  };
  report.heroHealth = afterHealth.hero;
  report.pillHealth = afterHealth.pill;
  report.gatewayState = afterGateway;
}

async function validateSystem(page) {
  await timedGoto(page, "/connections/system");
  const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
  assertFinding(
    (await breadcrumb.getByRole("link", { name: "Connections" }).count()) === 1,
    "System breadcrumb missing",
  );
  assertFinding(
    (await breadcrumb.getByText("System status", { exact: true }).count()) === 1,
    "System breadcrumb page missing",
  );
  assertFinding(
    (await page.getByRole("heading", { name: "System status", exact: true }).count()) === 1,
    "System page heading missing",
  );
  for (const group of ["System Core", "Channels", "Agents"]) {
    assertFinding(
      (await page.getByRole("heading", { name: group, exact: true }).count()) === 1,
      `${group} detail group missing`,
    );
  }
  const components = page.locator("[data-component-id][data-component-status]");
  const componentCount = await components.count();
  assertFinding(componentCount > 0, "System page has no live component facts");
  for (let index = 0; index < componentCount; index += 1) {
    const card = components.nth(index);
    const id = (await card.getAttribute("data-component-id")) ?? "";
    const status = await card.getAttribute("data-component-status");
    assertFinding(id.trim() !== "", "component id missing");
    assertFinding(
      ["healthy", "attention", "not_checked"].includes(status),
      `component ${id} status invalid`,
    );
    assertFinding(
      ((await card.innerText()).trim().length ?? 0) >= 12,
      `component ${id} has no meaningful fact`,
    );
  }

  for (const section of ["Sessions", "Gateway detail", "Runtime"]) {
    const trigger = page.getByRole("button", { name: section, exact: true });
    assertFinding((await trigger.count()) === 1, `${section} Radix trigger missing`);
    if ((await trigger.count()) !== 1) continue;
    assertFinding(
      (await trigger.evaluate((element) => element.tagName)) === "BUTTON",
      `${section} is not a button`,
    );
    if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
    assertFinding(
      (await trigger.getAttribute("aria-expanded")) === "true",
      `${section} did not expand`,
    );
    const triggerId = await trigger.getAttribute("id");
    const content = page.locator(`[role="region"][aria-labelledby="${triggerId}"]`);
    await content.waitFor({ state: "visible" });
    const contentText = (await content.innerText()).replaceAll(/\s+/g, " ").trim();
    assertFinding(contentText.length >= 12, `${section} content is not meaningful`);
    if (section === "Sessions")
      assertFinding(/session/i.test(contentText), "Sessions content lacks session facts");
    if (section === "Gateway detail")
      assertFinding(/status/i.test(contentText), "Gateway detail lacks status");
    if (section === "Runtime")
      assertFinding(
        /runtime|version|uptime|reported/i.test(contentText),
        "Runtime content lacks facts or honest empty wording",
      );
    report.expandedSections.push({ name: section, expanded: true });
  }
  assertFinding(
    (await page.locator("main details").count()) === 0,
    "System detail uses native details",
  );
}

async function validateLegacyRedirect(page) {
  const chain = [];
  const redirect404s = [];
  const onResponse = (response) => {
    const request = response.request();
    const type = request.resourceType();
    if (
      response.status() === 404 &&
      response.url().startsWith(BASE) &&
      ["document", "fetch", "xhr"].includes(type)
    ) {
      redirect404s.push({ path: new URL(response.url()).pathname, type });
    }
    if (type === "document" && request.isNavigationRequest()) {
      chain.push({ path: new URL(response.url()).pathname, status: response.status() });
    }
  };
  page.on("response", onResponse);
  await timedGoto(page, "/connections/gateway");
  page.off("response", onResponse);
  report.redirectChain = chain;
  assertFinding(
    new URL(page.url()).pathname === "/connections",
    "legacy Gateway did not end at /connections",
  );
  assertFinding(
    chain.some((entry) => entry.status === 307 || entry.status === 308),
    "legacy Gateway lacks 307/308 redirect response",
  );
  assertFinding(redirect404s.length === 0, "legacy Gateway redirect produced a same-origin 404");
}

async function captureThemes(page, prefix) {
  for (const theme of ["light", "dark"]) {
    await page
      .getByRole("button", { name: `${theme[0].toUpperCase()}${theme.slice(1)} mode` })
      .click();
    await page.waitForFunction((wanted) => {
      const current = document.documentElement.getAttribute("data-theme");
      return wanted === "dark"
        ? current === "dark" || current === "hc"
        : current !== "dark" && current !== "hc";
    }, theme);
    const path = `${OUT}/${prefix}-${theme}.png`;
    await page.screenshot({ path, fullPage: false });
    report.screenshotPaths.push(path);
  }
}

async function captureStaticMockup(context, file, prefix) {
  const page = await context.newPage();
  try {
    await page.goto(pathToFileURL(resolve(file)).href, { waitUntil: "load" });
    await page.getByRole("button", { name: "Light mode" }).waitFor({ state: "visible" });
    await captureThemes(page, prefix);
  } finally {
    await page.close();
  }
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  colorScheme: "dark",
});

try {
  const page = await realLogin(context, {
    what: CAPTURE_BASELINE
      ? "Connections fixed-point baseline"
      : "Connections Overview real-state matrix",
  });
  if (CAPTURE_BASELINE) {
    for (let sample = 0; sample < 3; sample += 1) await timedGoto(page, "/connections");
    const samples = report.navigationTimings["/connections"];
    report.baselineCapture = {
      sampleCount: samples.length,
      observedLoadMs: samples,
      suggestedBaselineLoadMs: Math.max(...samples),
    };
    console.log("connections baseline capture OK:", OUT);
  } else {
    await timedGoto(page, "/connections");
    const healthBar = await validateOverviewStructure(page);
    const initialHealth = await overviewHealth(page);
    const initialGateway = await overviewGatewayState(page);
    report.heroHealth = initialHealth.hero;
    report.pillHealth = initialHealth.pill;
    report.gatewayState = initialGateway;
    report.observed = {
      health: classifyObservedScenario({ health: initialHealth.hero, gateway: initialGateway }),
      rollupStatus: initialHealth.hero.status,
      attentionCount: initialHealth.hero.attentionCount,
      gateway: initialGateway,
    };
    assertExpectedHealth(initialHealth.hero, initialGateway, "observed");
    if (healthBar !== null) {
      const grouped = Object.values(healthBar.groups);
      assertFinding(
        healthBar.attention === initialHealth.hero.attentionCount,
        "health bar attention count does not match health rollup",
      );
      assertFinding(
        healthBar.healthy + healthBar.attention + healthBar.notChecked > 0,
        "health bar is vacuous",
      );
      assertFinding(grouped.length === 3, "health group exact-count summaries are incomplete");
      assertFinding(
        grouped.reduce((total, group) => total + group.healthy, 0) === healthBar.healthy &&
          grouped.reduce((total, group) => total + group.attention, 0) === healthBar.attention &&
          grouped.reduce((total, group) => total + group.notChecked, 0) === healthBar.notChecked,
        "health group exact counts do not reconcile with the health bar",
      );
    }
    await validateOverviewProviders(page);
    await validateIntegration(page);
    failOnFindings("scenario prerequisite failed");

    await validateProviderPage(page);
    failOnFindings("provider-page validation failed");
    await timedGoto(page, "/connections");
    await runHealthCheck(page);
    failOnFindings("manual health check failed");
    await timedGoto(page, "/connections");
    const screenshotHealth = await overviewHealth(page);
    const screenshotGateway = await overviewGatewayState(page);
    assertExpectedHealth(screenshotHealth.hero, screenshotGateway, "screenshot");
    report.heroHealth = screenshotHealth.hero;
    report.pillHealth = screenshotHealth.pill;
    report.gatewayState = screenshotGateway;
    failOnFindings("post-check Overview reload failed");
    await captureThemes(page, `connections-${expectedHealth}-live`);
    const overviewMockup =
      expectedHealth === "healthy"
        ? "ux-redesign/mockups/connections.html"
        : `ux-redesign/mockups/connections-${expectedHealth}.html`;
    await captureStaticMockup(context, overviewMockup, `connections-${expectedHealth}-mockup`);

    await validateSystem(page);
    failOnFindings("System status validation failed");
    await captureThemes(page, `connections-system-${expectedHealth}-live`);
    await captureStaticMockup(
      context,
      "ux-redesign/mockups/connections-system.html",
      `connections-system-${expectedHealth}-mockup`,
    );

    await validateLegacyRedirect(page);
    failOnFindings("legacy redirect validation failed");
    console.log("connections-drive OK:", OUT);
  }
} catch (error) {
  const unsafeMessage = error instanceof Error ? error.message : String(error);
  const message = unsafeMessage.replaceAll(BASE, reportBase);
  if (!report.findings.includes(message)) report.findings.push(message);
  console.error(message);
  process.exitCode = 1;
} finally {
  writeFileSync(`${OUT}/connections-report.json`, JSON.stringify(report, null, 2));
  await context.close();
  await browser.close();
}
