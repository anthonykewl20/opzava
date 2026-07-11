import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

import {
  CONFIG,
  SEVERITY,
  logSlice,
  preflight,
  realLogin,
  reconDom,
  screenshot,
  writeFinding,
  writeReport,
} from "./senior-qa-probe.local.mjs";

const SURFACE = "/connections";
const SERVICE_LOG_PATTERNS = [
  "/./",
  "closed before connect",
  "1005",
  "gatewayUnavailable",
  "connectionClosed",
  "operator.admin",
  "operatorAdminRequired",
  "auth",
  "scope",
  "not found",
  "device",
  "RPC",
  "UNAVAILABLE",
  "error",
];
const SERVICES = ["gateway-broker", "provisioning-worker", "openclaw-platform-gateway"];
const BLOCKER_LOG_PATTERN =
  /closed before connect|1005|gatewayUnavailable|connectionClosed|operatorAdminRequired|operator\.admin|OPENCLAW_OPERATOR_DEVICE_TOKEN|device token|auth|scope|not found|UNAVAILABLE|RPC failed|error/i;

const runSummary = {
  objective:
    "As the admin, confirm the Opzava Gateway is connected and view its real providers/models.",
  surface: SURFACE,
  startedAt: new Date().toISOString(),
  workerDeviceToken: null,
  usability: null,
  actions: [],
  logs: {},
  findings: [],
  artifactsDir: CONFIG.artifactsDir,
};

const findings = [];

function runCommand(command) {
  const result = spawnSync(command, {
    shell: true,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    combined: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
  };
}

function compact(value, max = 1800) {
  return String(value ?? "")
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\s+\n/g, "\n")
    .trim()
    .slice(0, max);
}

function nowMinus(ms) {
  return new Date(Date.now() - ms).toISOString();
}

function artifactPath(name) {
  mkdirSync(CONFIG.artifactsDir, { recursive: true });
  return `${CONFIG.artifactsDir}/${name}`;
}

function writeJsonArtifact(name, data) {
  const path = artifactPath(name);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  return path;
}

function recordFinding(input) {
  const finding = writeFinding(input);
  findings.push(finding);
  runSummary.findings.push({
    id: finding.id,
    lens: finding.lens,
    severity: finding.severity,
    actual: finding.actual,
  });
  console.log(`${finding.id} ${finding.severity} ${finding.lens}: ${finding.actual}`);
  return finding;
}

function evidenceFromParts(parts) {
  return parts
    .filter((part) => String(part ?? "").trim() !== "")
    .map((part) => compact(part, 1800))
    .join("\n\n");
}

function responseSlice(capture) {
  const responseLines = capture.responses
    .slice(-40)
    .map((item) => `${item.method} ${item.status} ${item.path}`);
  const pageLines = capture.pageIssues.slice(-20).map((item) => `${item.type}: ${item.text}`);
  return [...responseLines, ...pageLines].join("\n");
}

function attachCapture(page) {
  const baseOrigin = new URL(CONFIG.baseUrl).origin;
  const capture = { responses: [], pageIssues: [] };

  page.on("response", (response) => {
    let parsed;
    try {
      parsed = new URL(response.url());
    } catch {
      return;
    }
    const request = response.request();
    const method = request.method();
    const status = response.status();
    const relevant =
      parsed.origin === baseOrigin &&
      (method !== "GET" ||
        status >= 400 ||
        /connections|api|login|_actions/i.test(parsed.pathname));
    if (!relevant) return;
    capture.responses.push({
      method,
      status,
      path: `${parsed.pathname}${parsed.search}`,
    });
    if (capture.responses.length > 120) capture.responses.shift();
  });

  page.on("console", (message) => {
    if (!["error", "warning"].includes(message.type())) return;
    capture.pageIssues.push({ type: `console:${message.type()}`, text: message.text() });
    if (capture.pageIssues.length > 80) capture.pageIssues.shift();
  });

  page.on("pageerror", (error) => {
    capture.pageIssues.push({ type: "pageerror", text: error.message });
    if (capture.pageIssues.length > 80) capture.pageIssues.shift();
  });

  return capture;
}

async function waitForSettled(page) {
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await delay(500);
}

async function ensureConnections(page) {
  if (!new URL(page.url()).pathname.startsWith(SURFACE)) {
    await page.goto(new URL(SURFACE, CONFIG.baseUrl).toString(), { waitUntil: "networkidle" });
  }
  await waitForSettled(page);
}

async function collectPageState(page) {
  await waitForSettled(page);
  return page.evaluate(() => {
    const norm = (value, max = 5000) =>
      String(value ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max);
    const textOf = (element, max = 5000) => norm(element?.textContent ?? "", max);
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const findHeading = (pattern) =>
      [...document.querySelectorAll("h1,h2,h3")]
        .filter(visible)
        .find((heading) => pattern.test(textOf(heading, 300)));
    const sectionText = (pattern) => {
      const heading = findHeading(pattern);
      const container = heading?.closest("section, .card, main, [role='region']");
      return textOf(container ?? heading, 2500);
    };
    const providerRows = [...document.querySelectorAll("[data-provider-id]")]
      .filter(visible)
      .map((row) => ({
        id: row.getAttribute("data-provider-id") ?? "",
        text: textOf(row, 1400),
        buttons: [...row.querySelectorAll("button, [role='button']")]
          .filter(visible)
          .map((button) => textOf(button, 200)),
      }));
    const buttons = [...document.querySelectorAll("button, [role='button']")]
      .filter(visible)
      .map((button) => ({
        text: textOf(button, 240),
        disabled: Boolean(button.disabled || button.getAttribute("aria-disabled") === "true"),
      }));
    const alerts = [...document.querySelectorAll("[role='alert'], [role='status']")]
      .filter(visible)
      .map((element) => textOf(element, 1000));
    const dialog = document.querySelector("[role='dialog']");
    const modelTexts = [...document.querySelectorAll("[data-model], [data-active-model]")]
      .filter(visible)
      .map((element) => textOf(element, 240));

    return {
      url: location.href,
      title: document.title,
      text: norm(document.body?.innerText ?? "", 12000),
      headings: [...document.querySelectorAll("h1,h2,h3")]
        .filter(visible)
        .map((heading) => `${heading.localName}:${textOf(heading, 240)}`),
      gatewayText: sectionText(/gateway health/i),
      providersText: sectionText(/provider connection status/i),
      githubText: sectionText(/^github$/i),
      providerRows,
      providerCount: providerRows.length,
      modelTexts,
      buttons,
      alerts,
      dialogText: dialog === null ? "" : textOf(dialog, 2500),
    };
  });
}

function analyzeConnectionsState(state) {
  const gateway = state.gatewayText.toLowerCase();
  const providers = state.providersText.toLowerCase();
  const all = state.text.toLowerCase();
  const gatewayClaimsConnected =
    /\bconnected\b/.test(gateway) || /\bactive\b/.test(gateway) || /\bopzava gateway\s+active\b/.test(all);
  const gatewayClaimsUnavailable = /\bunavailable\b/.test(gateway) || /gateway unavailable/.test(all);
  const catalogUnavailable =
    /provider catalog unavailable/.test(providers) ||
    /0 connected\s*\/\s*0 available/.test(all) ||
    state.providerCount === 0;
  const realModelSignals = state.modelTexts.filter(
    (text) => !/no configured model|routes many|^[-\u2014]$|^\s*$/.test(text.toLowerCase()),
  );
  const placeholderSignals = [
    /provider catalog unavailable/.test(all),
    /configure the provisioning worker/.test(all),
    /no live auth method/.test(all),
    /no configured model/.test(all),
  ].filter(Boolean).length;

  return {
    gatewayClaimsConnected,
    gatewayClaimsUnavailable,
    catalogUnavailable,
    providerRows: state.providerCount,
    modelSignals: realModelSignals.length,
    placeholderSignals,
    hasRealGatewayData: state.providerCount > 0 && realModelSignals.length > 0 && !catalogUnavailable,
  };
}

function firstEnabledButton(dom, pattern) {
  return dom.buttons.find((button) => !button.disabled && pattern.test(button.text));
}

async function clickButtonByPattern(page, pattern, label, options = {}) {
  const locator = page.getByRole("button", { name: pattern }).first();
  if ((await locator.count()) === 0) {
    return { ok: false, reason: `${label} button not found` };
  }
  try {
    if (options.doubleClick === true) await locator.dblclick({ timeout: 5000 });
    else await locator.click({ timeout: 5000 });
    await waitForSettled(page);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: `${label} click failed: ${error.message}` };
  }
}

async function closeDialogs(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if ((await page.getByRole("dialog").count()) === 0) return;
    const closeLike = page.getByRole("button", { name: /cancel|close/i }).first();
    if ((await closeLike.count()) > 0) {
      await closeLike.click({ timeout: 3000 }).catch(() => {});
    } else {
      await page.keyboard.press("Escape").catch(() => {});
    }
    await delay(300);
  }
}

async function openProviderDialog(page, preferPattern) {
  const state = await collectPageState(page);
  const provider = state.providerRows.find((row) =>
    row.buttons.some((button) => preferPattern.test(button)),
  );
  if (provider === undefined) {
    return { ok: false, reason: "No provider row exposes the requested action." };
  }

  const row = page.locator(`[data-provider-id="${cssEscape(provider.id)}"]`).first();
  const actionText = provider.buttons.find((button) => preferPattern.test(button)) ?? "";
  const button = row.getByRole("button", { name: new RegExp(`^\\s*${escapeRegex(actionText)}\\s*$`, "i") }).first();
  if ((await button.count()) === 0) {
    return { ok: false, reason: `Provider ${provider.id} action ${actionText} was not clickable.` };
  }
  await button.click({ timeout: 5000 });
  await waitForSettled(page);
  return { ok: true, provider, actionText };
}

async function submitOpenDialog(page, options = {}) {
  const dialog = page.getByRole("dialog").first();
  if ((await dialog.count()) === 0) {
    return { ok: false, reason: "No dialog is open." };
  }
  if (options.clearProviderId === true) {
    const providerId = dialog.locator('input[name="providerId"]').first();
    if ((await providerId.count()) > 0) {
      await providerId.evaluate((input) => {
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
  }
  const apiKey = dialog.locator('input[name="apiKey"]').first();
  if ((await apiKey.count()) > 0 && options.apiKey !== undefined) {
    await apiKey.fill(options.apiKey);
  }

  const submit = dialog.locator('button[type="submit"], [role="button"][type="submit"]').last();
  if ((await submit.count()) === 0) {
    return { ok: false, reason: "Open dialog has no submit button." };
  }
  try {
    if (options.doubleClick === true) await submit.dblclick({ timeout: 5000 });
    else await submit.click({ timeout: 5000 });
    await waitForSettled(page);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: `Dialog submit failed: ${error.message}` };
  }
}

function cssEscape(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function inspectWorkerDeviceToken() {
  const result = runCommand(
    "docker compose exec -T provisioning-worker sh -lc 'if [ -n \"$OPENCLAW_OPERATOR_DEVICE_TOKEN\" ]; then echo set; else echo unset; fi'",
  );
  const output = compact(result.combined, 1000);
  const token = {
    ok: result.status === 0,
    set: result.status === 0 && /^set$/m.test(output),
    unset: result.status === 0 && /^unset$/m.test(output),
    output,
  };
  runSummary.workerDeviceToken = token;
  return token;
}

async function collectServiceLogs(sinceIso, label) {
  const entries = {};
  for (const service of SERVICES) {
    entries[service] = await logSlice(sinceIso, SERVICE_LOG_PATTERNS, {
      ...CONFIG,
      logCommand: `docker compose logs --since {sinceIso} --no-color ${service}`,
    });
  }
  runSummary.logs[label] = entries;
  return entries;
}

function combinedLogText(logs) {
  return Object.entries(logs)
    .map(([service, entry]) => `== ${service} ==\n${entry.text}`)
    .join("\n\n");
}

function detectRetryStorm(logs) {
  const text = combinedLogText(logs);
  const closedBeforeConnect = /closed before connect/i.test(text);
  const code1005 = /\b1005\b/.test(text);
  const deviceIssue =
    /OPENCLAW_OPERATOR_DEVICE_TOKEN|device token|operator device|operatorAdminRequired|operator\.admin/i.test(
      text,
    );
  return {
    matched: closedBeforeConnect || code1005 || deviceIssue,
    closedBeforeConnect,
    code1005,
    deviceIssue,
    text,
  };
}

async function runUsabilityLens(page, capture, initialDom) {
  const transcript = [];
  transcript.push(`I landed on ${SURFACE} after a real login.`);
  transcript.push(
    `Recon exposed headings: ${initialDom.headings.map((heading) => heading.text).join(" | ") || "none"}.`,
  );
  transcript.push(
    `Recon exposed buttons: ${initialDom.buttons.map((button) => button.text).join(" | ") || "none"}.`,
  );

  const firstState = await collectPageState(page);
  const firstAnalysis = analyzeConnectionsState(firstState);
  transcript.push(
    `Gateway section says: ${compact(firstState.gatewayText, 600) || "no Gateway health section"}.`,
  );
  transcript.push(
    `Provider section has ${firstAnalysis.providerRows} rows and ${firstAnalysis.modelSignals} concrete model labels.`,
  );

  const healthButton = firstEnabledButton(initialDom, /run health check|refresh|heartbeat|check/i);
  if (healthButton !== undefined) {
    transcript.push(`I used the visible "${healthButton.text}" action to refresh the snapshot.`);
    await clickButtonByPattern(page, /run health check|refresh|heartbeat|check/i, "health refresh");
  } else {
    transcript.push("No refresh or heartbeat action was discoverable from reconDom.");
  }

  const refreshedState = await collectPageState(page);
  const refreshedAnalysis = analyzeConnectionsState(refreshedState);
  const shot = await screenshot(page, "gateway-connections-usability");
  const steps = healthButton === undefined ? 2 : 3;
  const deadEnds = refreshedAnalysis.hasRealGatewayData ? 0 : 1;
  const wrongTurns = healthButton === undefined ? 1 : 0;
  const taskSuccess =
    refreshedAnalysis.gatewayClaimsConnected && refreshedAnalysis.hasRealGatewayData && deadEnds === 0;

  runSummary.usability = {
    taskSuccess,
    steps,
    wrongTurns,
    deadEnds,
    transcript,
    firstAnalysis,
    refreshedAnalysis,
  };

  if (!taskSuccess) {
    recordFinding({
      lens: "usability",
      surface: SURFACE,
      objective: runSummary.objective,
      repro: [
        "Log in as owner@opzava.localhost.",
        "Navigate to /connections.",
        healthButton === undefined
          ? "Try to confirm gateway connection and provider catalog from the page."
          : `Use the discovered ${healthButton.text} action, then inspect Gateway health and Provider connection status.`,
      ],
      expected:
        "The page should clearly prove whether the Gateway is connected and should show real provider and model inventory when it claims the Gateway is connected.",
      actual: `Task success=${taskSuccess}; steps=${steps}; wrongTurns=${wrongTurns}; deadEnds=${deadEnds}; gatewayConnectedClaim=${refreshedAnalysis.gatewayClaimsConnected}; providerRows=${refreshedAnalysis.providerRows}; concreteModelLabels=${refreshedAnalysis.modelSignals}; placeholders=${refreshedAnalysis.placeholderSignals}.`,
      evidence: {
        screenshot: shot,
        responseSlice: evidenceFromParts([transcript.join("\n"), responseSlice(capture)]),
        logSlice: "",
      },
      severity: refreshedAnalysis.gatewayClaimsConnected ? SEVERITY.major : SEVERITY.major,
    });
  }

  if (
    refreshedAnalysis.gatewayClaimsConnected &&
    (refreshedAnalysis.catalogUnavailable || refreshedAnalysis.modelSignals === 0)
  ) {
    recordFinding({
      lens: "usability",
      surface: SURFACE,
      objective: "verify status honesty for gateway connection inventory",
      repro: [
        "Log in as the owner.",
        "Open /connections.",
        "Read the Gateway health badge and the Provider connection status table.",
      ],
      expected:
        "A Connected or Active gateway state should be backed by visible live catalog rows and model labels, or it should clearly say the inventory could not be loaded.",
      actual: `The page claims the Gateway is connected/active while provider inventory is incomplete: providerRows=${refreshedAnalysis.providerRows}, concreteModelLabels=${refreshedAnalysis.modelSignals}, catalogUnavailable=${refreshedAnalysis.catalogUnavailable}.`,
      evidence: {
        screenshot: shot,
        responseSlice: evidenceFromParts([refreshedState.gatewayText, refreshedState.providersText]),
        logSlice: "",
      },
      severity: SEVERITY.major,
    });
  }
}

async function runFunctionalLens(page, capture, workerToken) {
  await ensureConnections(page);
  const actionStartedAt = nowMinus(2000);
  const outcomes = [];

  const dom = await reconDom(page);
  const healthAction = firstEnabledButton(dom, /run health check|refresh|heartbeat|check/i);
  if (healthAction !== undefined) {
    for (let index = 0; index < 3; index += 1) {
      outcomes.push({
        action: `refresh ${index + 1}`,
        ...(await clickButtonByPattern(page, /run health check|refresh|heartbeat|check/i, "health refresh")),
      });
    }
    const state = await collectPageState(page);
    if (!/health check complete|snapshot updated/i.test(`${state.text} ${state.alerts.join(" ")}`)) {
      recordFinding({
        lens: "functional",
        surface: SURFACE,
        objective: "trigger connection health refresh repeatedly",
        repro: [
          "Open /connections after real login.",
          `Click the discovered ${healthAction.text} action three times in sequence.`,
        ],
        expected: "Each refresh should either complete visibly or produce an honest error state.",
        actual: "Repeated refresh did not leave a clear success or failure notice.",
        evidence: {
          screenshot: await screenshot(page, "gateway-functional-refresh-unclear"),
          responseSlice: responseSlice(capture),
          logSlice: "",
        },
        severity: SEVERITY.major,
      });
    }
  } else {
    outcomes.push({ action: "refresh", ok: false, reason: "No refresh action discovered." });
  }

  await ensureConnections(page);
  let providerDialog = await openProviderDialog(page, /connect|manage/i);
  if (providerDialog.ok) {
    const submitOutcome = await submitOpenDialog(page, {
      clearProviderId: true,
      apiKey: "seniorqa-no-provider-secret",
    });
    outcomes.push({
      action: "provider action with providerId cleared",
      provider: providerDialog.provider.id,
      ...submitOutcome,
    });
    const state = await collectPageState(page);
    const honestError =
      /connection failed|admin device required|required|not found|failed|could not complete|no live auth method/i.test(
        `${state.dialogText} ${state.text}`,
      );
    const fakeSuccess = /connection updated|connected in opzava gateway/i.test(
      `${state.dialogText} ${state.text}`,
    );
    if (fakeSuccess || (submitOutcome.ok && !honestError)) {
      recordFinding({
        lens: "functional",
        surface: SURFACE,
        objective: "act with no provider selected",
        repro: [
          "Open /connections.",
          `Open the discovered ${providerDialog.actionText} dialog for provider ${providerDialog.provider.id}.`,
          "Clear the hidden providerId field and submit the dialog.",
        ],
        expected: "The UI should reject the action with a clear error and must not report success.",
        actual: fakeSuccess
          ? "The no-provider action reported a connection success."
          : "The no-provider action produced no clear user-facing error.",
        evidence: {
          screenshot: await screenshot(page, "gateway-functional-no-provider"),
          responseSlice: evidenceFromParts([state.dialogText, responseSlice(capture)]),
          logSlice: "",
        },
        severity: fakeSuccess ? SEVERITY.blocker : SEVERITY.major,
      });
    }
    await closeDialogs(page);
  } else {
    outcomes.push({ action: "provider no-provider edge", ok: false, reason: providerDialog.reason });
  }

  await ensureConnections(page);
  providerDialog = await openProviderDialog(page, /connect/i);
  if (providerDialog.ok) {
    const beforeResponses = capture.responses.length;
    const stateBeforeSubmit = await collectPageState(page);
    const hasApiKeyInput = /api key/i.test(stateBeforeSubmit.dialogText);
    const submitOutcome = await submitOpenDialog(page, {
      doubleClick: true,
      ...(hasApiKeyInput ? {} : {}),
    });
    outcomes.push({
      action: "double-click provider connect submit",
      provider: providerDialog.provider.id,
      hasApiKeyInput,
      responsesAdded: capture.responses.length - beforeResponses,
      ...submitOutcome,
    });
    const state = await collectPageState(page);
    const fakeSuccess = /connection updated|connected in opzava gateway/i.test(
      `${state.dialogText} ${state.text}`,
    );
    const clearResult = /connection failed|admin device required|required|requesting device code|waiting for device authorization|could not complete|failed/i.test(
      `${state.dialogText} ${state.text}`,
    );
    if (fakeSuccess || (submitOutcome.ok && !clearResult && !hasApiKeyInput)) {
      recordFinding({
        lens: "functional",
        surface: SURFACE,
        objective: "double-click provider connect",
        repro: [
          "Open /connections.",
          `Open the discovered Connect dialog for provider ${providerDialog.provider.id}.`,
          "Double-click the dialog submit action.",
        ],
        expected:
          "Double-submit should be idempotent or visibly blocked, and it must not show success unless the Gateway actually accepted the connection.",
        actual: fakeSuccess
          ? "Double-clicking provider connect produced a success state."
          : "Double-clicking provider connect did not produce an honest pending or error state.",
        evidence: {
          screenshot: await screenshot(page, "gateway-functional-double-connect"),
          responseSlice: evidenceFromParts([state.dialogText, responseSlice(capture)]),
          logSlice: "",
        },
        severity: fakeSuccess ? SEVERITY.blocker : SEVERITY.major,
      });
    }
    await closeDialogs(page);
  } else {
    outcomes.push({ action: "double-click provider connect", ok: false, reason: providerDialog.reason });
  }

  await ensureConnections(page);
  const disconnectDialog = await openProviderDialog(page, /disconnect/i);
  if (disconnectDialog.ok) {
    if (workerToken.unset === true) {
      const dialog = page.getByRole("dialog").first();
      const confirm = dialog.getByRole("button", { name: /^disconnect/i }).last();
      if ((await confirm.count()) > 0) {
        await confirm.click({ timeout: 5000 }).catch((error) => {
          outcomes.push({ action: "confirm provider disconnect", ok: false, reason: error.message });
        });
        await waitForSettled(page);
        outcomes.push({
          action: "confirm provider disconnect",
          ok: true,
          provider: disconnectDialog.provider.id,
          expectedToFailBecauseWorkerTokenUnset: true,
        });
        const state = await collectPageState(page);
        if (!/admin device required|connection action could not complete|failed|operator/i.test(state.text)) {
          recordFinding({
            lens: "functional",
            surface: SURFACE,
            objective: "disconnect a connected provider when provisioning worker has no paired device",
            repro: [
              "Verify provisioning-worker OPENCLAW_OPERATOR_DEVICE_TOKEN is unset.",
              "Open /connections.",
              `Open Disconnect for connected provider ${disconnectDialog.provider.id} and confirm it.`,
            ],
            expected:
              "The disconnect should fail honestly with an admin/device/provisioning error and must not silently disconnect.",
            actual: "The disconnect confirmation did not produce a clear failure notice.",
            evidence: {
              screenshot: await screenshot(page, "gateway-functional-disconnect-unclear"),
              responseSlice: responseSlice(capture),
              logSlice: "",
            },
            severity: SEVERITY.major,
          });
        }
      } else {
        outcomes.push({ action: "confirm provider disconnect", ok: false, reason: "No confirm button." });
      }
    } else {
      outcomes.push({
        action: "provider disconnect",
        ok: true,
        provider: disconnectDialog.provider.id,
        note: "Opened destructive confirmation and cancelled because worker token was not verified unset.",
      });
      await closeDialogs(page);
    }
  } else {
    outcomes.push({ action: "provider disconnect", ok: false, reason: disconnectDialog.reason });
  }

  await ensureConnections(page);
  const githubDom = await reconDom(page);
  const githubAction = firstEnabledButton(githubDom, /connect github|reconnect github/i);
  if (githubAction !== undefined) {
    const outcome = await clickButtonByPattern(page, /connect github|reconnect github/i, "GitHub connect");
    outcomes.push({ action: githubAction.text, ...outcome });
    const state = await collectPageState(page);
    const honestResult =
      /device|authorization|admin device required|connection action could not complete|failed|scope|connect github/i.test(
        `${state.githubText} ${state.text}`,
      );
    const fakeConnected =
      /github[\s\S]{0,600}\bconnected\b/i.test(state.githubText) &&
      !/waiting|pending|authorize|failed/i.test(state.githubText);
    if (fakeConnected || (outcome.ok && !honestResult)) {
      recordFinding({
        lens: "functional",
        surface: SURFACE,
        objective: "start GitHub connection",
        repro: ["Open /connections.", `Click the discovered ${githubAction.text} action.`],
        expected:
          "GitHub connect should show a real device-flow, a pending state, or an honest provisioning/auth error.",
        actual: fakeConnected
          ? "The GitHub panel appeared connected without visible authorization proof."
          : "The GitHub connect action produced no clear outcome.",
        evidence: {
          screenshot: await screenshot(page, "gateway-functional-github-connect"),
          responseSlice: evidenceFromParts([state.githubText, responseSlice(capture)]),
          logSlice: "",
        },
        severity: fakeConnected ? SEVERITY.blocker : SEVERITY.major,
      });
    }
  } else {
    outcomes.push({ action: "GitHub connect", ok: false, reason: "No GitHub connect action discovered." });
  }

  const actionLogs = await collectServiceLogs(actionStartedAt, "functionalActions");
  runSummary.actions.push(...outcomes);
  return actionLogs;
}

async function runOutputLens(page, workerToken, recentLogs, actionLogs, capture) {
  const state = await collectPageState(page);
  const analysis = analyzeConnectionsState(state);
  const recentStorm = detectRetryStorm(recentLogs);
  const actionStorm = detectRetryStorm(actionLogs);
  const storm = {
    matched: recentStorm.matched || actionStorm.matched,
    closedBeforeConnect: recentStorm.closedBeforeConnect || actionStorm.closedBeforeConnect,
    code1005: recentStorm.code1005 || actionStorm.code1005,
    deviceIssue: recentStorm.deviceIssue || actionStorm.deviceIssue,
    text: evidenceFromParts([recentStorm.text, actionStorm.text]),
  };

  if (workerToken.unset === true && !storm.matched) {
    recordFinding({
      lens: "output",
      surface: SURFACE,
      objective: "verify known worker device pairing failure in logs",
      repro: [
        "Run the SeniorQA Gateway probe.",
        "Inspect provisioning-worker, gateway-broker, and openclaw-platform-gateway logs during /connections load and actions.",
      ],
      expected:
        "With WORKER_OPENCLAW_OPERATOR_DEVICE_TOKEN unset, logs should expose the failed worker Gateway connection instead of hiding it.",
      actual: "The worker device token is unset but the action-window log slices did not expose the expected failure signature.",
      evidence: {
        screenshot: await screenshot(page, "gateway-output-token-unset-no-log-signature"),
        responseSlice: responseSlice(capture),
        logSlice: storm.text,
      },
      severity: SEVERITY.major,
    });
  }

  if (storm.matched) {
    recordFinding({
      lens: "output",
      surface: SURFACE,
      objective: "confirm provisioning-worker to OpenClaw Gateway connection health",
      repro: [
        "Run /connections after real login.",
        "Load the page, refresh health, and exercise provider/GitHub connection actions.",
        "Inspect provisioning-worker, gateway-broker, and openclaw-platform-gateway log slices for the same window.",
      ],
      expected:
        "The worker should maintain a paired operator Gateway connection with no retry-storm, device-token, auth, scope, or RPC failures.",
      actual: `Log signature indicates Gateway connection failure: closedBeforeConnect=${storm.closedBeforeConnect}, code1005=${storm.code1005}, deviceOrAuthIssue=${storm.deviceIssue}.`,
      evidence: {
        screenshot: await screenshot(page, "gateway-output-retry-storm"),
        responseSlice: responseSlice(capture),
        logSlice: storm.text,
      },
      severity: SEVERITY.major,
    });
  }

  if (analysis.gatewayClaimsConnected && BLOCKER_LOG_PATTERN.test(storm.text)) {
    recordFinding({
      lens: "output",
      surface: SURFACE,
      objective: "detect green UI over failing Gateway logs",
      repro: [
        "Open /connections after real login.",
        "Observe Gateway health status.",
        "Correlate the same window with gateway-broker, provisioning-worker, and openclaw-platform-gateway logs.",
      ],
      expected:
        "If the UI says the Opzava Gateway is Connected or Active, broker/worker/gateway logs in the same window should not show connection, auth, scope, device, not-found, or RPC failures.",
      actual: "The UI shows a connected/active Gateway state while the correlated service logs contain failing Gateway connection signatures.",
      evidence: {
        screenshot: await screenshot(page, "gateway-output-green-ui-failing-logs"),
        responseSlice: evidenceFromParts([state.gatewayText, state.providersText, responseSlice(capture)]),
        logSlice: storm.text,
      },
      severity: SEVERITY.blocker,
    });
  }
}

async function main() {
  const recentSince = nowMinus(10 * 60_000);
  const runWindowSince = nowMinus(5000);
  await preflight();

  const workerToken = await inspectWorkerDeviceToken();
  const recentLogs = await collectServiceLogs(recentSince, "recentBeforeAndDuringProbe");

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  let reportPath = "";

  try {
    const page = await realLogin(context);
    const capture = attachCapture(page);
    await page.goto(new URL(SURFACE, CONFIG.baseUrl).toString(), { waitUntil: "networkidle" });
    await waitForSettled(page);
    const initialDom = await reconDom(page);
    await screenshot(page, "gateway-connections-initial");

    await runUsabilityLens(page, capture, initialDom);
    const actionLogs = await runFunctionalLens(page, capture, workerToken);
    const finalLogs = await collectServiceLogs(runWindowSince, "fullProbeWindow");
    await runOutputLens(page, workerToken, recentLogs, { ...actionLogs, ...finalLogs }, capture);

    runSummary.finishedAt = new Date().toISOString();
    runSummary.reportFindings = findings.length;
    runSummary.summaryArtifact = writeJsonArtifact("gateway-probe-summary.json", runSummary);
    reportPath = writeReport();
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  console.log(`SeniorQA Gateway PROBE report: ${reportPath}`);
  console.log(`SeniorQA Gateway PROBE summary: ${runSummary.summaryArtifact}`);
  console.log(`SeniorQA Gateway PROBE findings: ${findings.length}`);
}

await main();
