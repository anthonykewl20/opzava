// #187 + #191 real-flow driver: a submitted provider API key must never reach the gateway container's
// process list (argv, #187) NOR its process environment (environ, #191). Real login (NO minted
// session), real api-key connect through the UI with a canary key, while sampling both
// /proc/*/cmdline and /proc/*/environ inside the gateway container.
//
// The connect is EXPECTED to end rejected: the canary is not a real credential, so the #183 liveness
// probe refuses it and rolls it back. That is the point — the key still travels the whole write path
// (onboard exec + shared-store write) with nothing left behind.
//
// The control assertions matter most — without them a clean result is vacuous:
//   1. The sampler must SEE THIS connect's credential-carrying onboard running. Otherwise "the key
//      was not in the process list" only says the sampler was looking at nothing.
//   2. The sampler must have READ that onboard's environ, and must be able to see a DIFFERENT,
//      deliberately planted secret in a process environment. Otherwise "the key was not in environ"
//      only says the sampler cannot read environs at all.
//   3. The connect must actually FINISH. If stdin never arrived or EOF was lost, onboard would hang
//      and a "no canary anywhere" result would be an artifact of the command never getting the key.
// Only then does it mean anything that the canary appears in NO command line and NO environment.
//
// The canary is never passed to the sampler through its own argv or env — that would plant it in
// /proc and the drive would flag itself. It travels on stdin into a pattern file, and all matching
// happens INSIDE the container: raw environments never leave it (they hold unrelated real gateway
// secrets) and are never written to an artifact. Only pids, command lines and booleans come back.
//
// Usage: node tests/e2e/drives/connections-apikey-argv.mjs [outDir]

import { chromium } from "@playwright/test";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { BASE, realLogin, artifactDir } from "../lib/session.mjs";

const GATEWAY = process.env.REAL_GATEWAY_CONTAINER ?? "opzava-openclaw-platform-gateway-1";
const WORKER = process.env.REAL_WORKER_CONTAINER ?? "opzava-provisioning-worker-1";
const OUT = process.argv[2] ?? artifactDir("apikey-argv");

mkdirSync(OUT, { recursive: true });

// Shaped like a real key so nothing along the path can dismiss it as obviously malformed.
const CANARY = `sk-canary187-${randomUUID().replaceAll("-", "")}`;
// The positive control for the environ sampler MUST be a different secret from the one under test:
// planting the canary itself would make the negative assertion ("the canary is in no environ")
// impossible to state. This one is deliberately put somewhere the sampler must find it.
const ENV_CONTROL = `sk-envcontrol191-${randomUUID().replaceAll("-", "")}`;
// Two files, matched with `grep -f`: the secrets must never appear in grep's OWN argv, or the
// per-process cmdline scan would catch the sampler red-handed and report its own pattern as a leak.
// Per-run paths: a fixed name would let two concurrent drives overwrite — or delete — each other's
// canary pattern, quietly disarming one of them.
const RUN_ID = randomUUID().slice(0, 8);
const CANARY_PATTERN_FILE = `/tmp/opzava-canary-pattern-${RUN_ID}`;
const CONTROL_PATTERN_FILE = `/tmp/opzava-control-pattern-${RUN_ID}`;
const findings = [];
let samples = "";

/**
 * Stages a secret in an in-container pattern file, delivered on stdin.
 *
 * One exec per pattern: two `head -1`s sharing a single stdin do not work — the first consumes the
 * whole buffer and the second file lands empty, which silently disables that matcher. `cat`'s argv
 * carries no secret, which is the whole point of routing them through a file.
 */
function stagePatternFile(path, secret) {
  execFileSync("docker", ["exec", "-i", GATEWAY, "sh", "-c", `cat > ${path}`], { input: secret });
}

/**
 * Samples every process's argv AND environ inside the gateway container until killed.
 *
 * Matching happens in-container against a pattern file: the secrets never enter the sampler's own
 * argv or env (that would plant them in the very /proc this drive reads, and the drive would flag
 * itself), and no environ content is ever emitted — only pids, command lines, and which marker
 * matched.
 *
 * Runs as the container's DEFAULT user, deliberately — not root. Reading another process's environ
 * needs PTRACE_MODE_READ, and the container drops CAP_SYS_PTRACE, so root actually reads back zero
 * bytes; a same-uid process reads it in full. The gateway runs the tenant's agent workloads under
 * that same uid as `onboard`, which is exactly the reader #191 is about. Sampling as root would
 * quietly succeed at nothing and pass this drive forever.
 */
function startProcessSampler() {
  stagePatternFile(CANARY_PATTERN_FILE, CANARY);
  stagePatternFile(CONTROL_PATTERN_FILE, ENV_CONTROL);

  const script = [
    "while true; do",
    "  for d in /proc/[0-9]*; do",
    '    cmd=$(tr "\\0" " " < "$d/cmdline" 2>/dev/null)',
    '    [ -z "$cmd" ] && continue',
    "    pid=${d#/proc/}",
    '    echo "CMD $pid $cmd"',
    // A /proc file always stat()s as size 0, so `-s` is useless here: count the bytes actually read.
    // Proving the environ was READABLE is what makes a clean scan mean something.
    '    bytes=$(wc -c < "$d/environ" 2>/dev/null || echo 0)',
    '    [ "$bytes" -gt 0 ] && echo "ENVREAD $pid $cmd"',
    `    grep -qaf ${CANARY_PATTERN_FILE} "$d/environ" 2>/dev/null && echo "ENVHIT $pid $cmd"`,
    `    grep -qaf ${CONTROL_PATTERN_FILE} "$d/environ" 2>/dev/null && echo "ENVCTL $pid $cmd"`,
    "  done",
    "  sleep 0.05",
    "done",
  ].join("\n");

  const child = spawn("docker", ["exec", GATEWAY, "sh", "-c", script], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  child.stdout.on("data", (chunk) => {
    samples += String(chunk);
  });
  return child;
}

/**
 * Plants ENV_CONTROL in a real process environment inside the gateway — the sampler's positive
 * control. If the sampler cannot see THIS, it cannot see a credential in an environ either, and a
 * clean canary result proves nothing.
 */
function plantEnvironControl() {
  execFileSync(
    "docker",
    ["exec", "-d", "-e", `OPZAVA_ENV_CONTROL=${ENV_CONTROL}`, GATEWAY, "sleep", "120"],
    { stdio: "ignore" },
  );
}

function sampledLines(prefix) {
  return [
    ...new Set(
      samples
        .split("\n")
        .filter((line) => line.startsWith(`${prefix} `))
        .map((line) => line.slice(prefix.length + 1)),
    ),
  ];
}


// Providers live under tier tabs, and only the open tab renders its rows.
const TIERS = [/^frontier/i, /^bundles/i, /^best subagents/i, /^other/i];
// Prefer a provider whose connect needs nothing but the key, so onboard runs the FULL write path
// rather than bailing on a missing second field (Cloudflare wants account + gateway ids). Any
// api-key provider still proves the argv property; only the flow proof needs this.
const PREFERRED = (process.env.REAL_PROVIDER ?? "zai,moonshot,openrouter,deepseek").split(",");

/** Every provider row that offers an api-key connect, preferred single-field ones first. */
async function findApiKeyConnectRows(page) {
  const candidates = [];
  for (const tier of TIERS) {
    const tab = page.getByRole("tab", { name: tier });
    if ((await tab.count()) === 0) {
      continue;
    }
    await tab.first().click();
    await page.waitForTimeout(400);

    const rows = page.locator("article[data-provider-id]");
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      // Only NOT-connected rows offer Connect; a connected provider shows Manage/Disconnect. Never
      // touch a live credential.
      if ((await row.getByRole("button", { name: /^connect$/i }).count()) === 0) {
        continue;
      }
      const providerId = (await row.getAttribute("data-provider-id")) ?? "";
      candidates.push({ tier, providerId });
    }
  }
  const rank = (providerId) => {
    const index = PREFERRED.indexOf(providerId);
    return index === -1 ? PREFERRED.length : index;
  };
  return candidates.sort((left, right) => rank(left.providerId) - rank(right.providerId));
}

/** Opens the api-key connect dialog for the first candidate that actually has a key field. */
async function openApiKeyConnectDialog(page) {
  for (const candidate of await findApiKeyConnectRows(page)) {
    await page.getByRole("tab", { name: candidate.tier }).first().click();
    await page.waitForTimeout(400);
    const row = page.locator(`article[data-provider-id="${candidate.providerId}"]`).first();
    await row.getByRole("button", { name: /^connect$/i }).first().click();

    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});

    // A setup-token provider (Anthropic) leads with the browser flow and folds the paste form — the
    // one that submits a credential, and the argv path this drive exists to watch — into a <details>.
    const pasteToggle = dialog.locator("summary", { hasText: /already have a setup token/i });
    if ((await pasteToggle.count()) > 0) {
      await pasteToggle.first().click();
      await page.waitForTimeout(250);
    }

    const field = dialog.locator('input[name="apiKey"]');
    if ((await field.count()) > 0) {
      return { dialog, field, providerId: candidate.providerId };
    }
    // Device-flow/OAuth-only provider: no credential is submitted, so no argv path. Keep looking.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  }
  return null;
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
plantEnvironControl();
const sampler = startProcessSampler();
const startedAt = new Date();
let providerId = null;

try {
  const page = await realLogin(context, { what: "the api-key connect" });
  await page.goto(`${BASE}/connections/providers`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);

  const target = await openApiKeyConnectDialog(page);
  if (target === null) {
    throw new Error("no api-key connect dialog found - cannot exercise the onboard write path");
  }
  providerId = target.providerId;

  await target.field.fill(CANARY);
  await target.dialog
    .getByRole("button", { name: /connect (provider|setup token)/i })
    .first()
    .click();

  // The connect is async (worker execs onboard in the gateway, then probes). Give the whole write
  // path time to run under the sampler; the outcome itself is asserted below, not here.
  await page.waitForTimeout(45_000);
  await page.screenshot({ path: `${OUT}/apikey-connect-outcome.png`, fullPage: true });
} catch (error) {
  findings.push(`drive-failed=${error instanceof Error ? error.message : String(error)}`);
} finally {
  sampler.kill("SIGKILL");
  // The pattern files hold the canary; do not leave them in the container for the next drive to find.
  execFileSync(
    "docker",
    ["exec", GATEWAY, "rm", "-f", CANARY_PATTERN_FILE, CONTROL_PATTERN_FILE],
    { stdio: "ignore" },
  );
  await context.close();
  await browser.close();
}

// BOTH streams: `docker logs` sends the container's stderr to ITS stderr, and the worker logs plenty
// there. Reading only stdout would leave half the log surface unscanned for the canary.
const workerLogProcess = spawnSync(
  "docker",
  ["logs", "--since", startedAt.toISOString(), WORKER],
  { encoding: "utf8" },
);
const workerLogs = `${workerLogProcess.stdout ?? ""}\n${workerLogProcess.stderr ?? ""}`;

const commandLines = sampledLines("CMD");
const onboardLines = commandLines.filter((line) => line.includes("openclaw.mjs onboard"));

// CONTROL: the sampler must have caught THIS connect's onboard while it ran. Without that, "the key
// was never in the process list" only says the sampler was looking at nothing. It has to be the
// credential-carrying command for the provider we submitted to — `onboard --help` (the capability
// check) runs on the same path and must not be allowed to stand in for it.
const isThisConnect = (line) =>
  line.includes("--credential-stdin") && providerId !== null && line.includes(providerId);
const connectLines = onboardLines.filter(isThisConnect);
if (connectLines.length === 0) {
  findings.push("control-sampler-never-saw-this-connects-onboard=true");
}

// CONTROL: the sampler must be able to see a secret that IS in an environment. If the planted
// control never shows up, the sampler cannot read environs and a clean canary result is vacuous.
const controlEnvironHits = sampledLines("ENVCTL");
if (controlEnvironHits.length === 0) {
  findings.push("control-environ-sampler-saw-no-planted-secret=true");
}

// CONTROL: and specifically THIS connect's onboard environ must have been read at least once —
// otherwise the credential-carrying process is exactly the one the sampler missed.
const environReadLines = sampledLines("ENVREAD");
if (!environReadLines.some(isThisConnect)) {
  findings.push("control-never-read-this-connects-onboard-environ=true");
}

// CONTROL: the connect must have reached a real terminal outcome. A hijacked stdin that never
// delivered the key, or lost its EOF, would leave onboard blocked forever — and a blocked onboard
// also leaves the canary nowhere, which would read as a pass. The worker logs the verdict for this
// provider; require it, rather than inferring completion from a fixed wait.
// The #183 liveness probe publishes the verdict once onboard has actually run and the credential was
// filed. Correlate the verdict to THIS provider: the worker pretty-prints its payload across several
// lines, so the event name and the providerId never share one — but accepting "some authProbe event
// happened, and the provider is named somewhere in the window" would let an unrelated probe stand in
// for ours, which is the same vacuous pass the controls above exist to prevent. Take the event's own
// payload block and require the provider inside it.
const probeVerdictBlocks = [...workerLogs.matchAll(/connections\.authProbe\.(rejected|verified)\s*\{([^}]*)\}/gi)];
const connectSettled =
  providerId !== null &&
  probeVerdictBlocks.some((block) => new RegExp(`providerId:\\s*'${providerId}'`).test(block[2]));
if (!connectSettled) {
  findings.push("control-connect-never-reached-a-terminal-outcome=true");
}

// CONTROL: a hung onboard (stdin never delivered, or EOF lost) would also leave the canary nowhere.
// The connect has to have actually run to completion for absence to mean anything.
const stillRunning = execFileSync(
  "docker",
  ["exec", GATEWAY, "sh", "-c", 'ps -o args= -A 2>/dev/null | grep -c "[c]redential-stdin" || true'],
  { encoding: "utf8" },
).trim();
if (stillRunning !== "0") {
  findings.push(`onboard-still-running-after-connect=${stillRunning}`);
}

// THE ASSERTIONS: the submitted key in no command line (#187), and in no process environment (#191).
if (commandLines.some((line) => line.includes(CANARY))) {
  findings.push("canary-in-gateway-process-list=true");
}
const canaryEnvironHits = sampledLines("ENVHIT");
if (canaryEnvironHits.length > 0) {
  findings.push(`canary-in-gateway-process-environ=${canaryEnvironHits.length}`);
}
if (workerLogs.includes(CANARY)) {
  findings.push("canary-in-worker-logs=true");
}
writeFileSync(
  `${OUT}/apikey-argv-report.json`,
  JSON.stringify(
    {
      base: BASE,
      providerId,
      canaryLength: CANARY.length,
      sampledProcessLines: samples.split("\n").length,
      sawThisConnectsOnboardInProcessList: connectLines.length > 0,
      environSamplerSawPlantedControl: controlEnvironHits.length > 0,
      readThisConnectsOnboardEnviron: environReadLines.some(isThisConnect),
      connectReachedTerminalOutcome: connectSettled,
      onboardStillRunningAfterConnect: stillRunning,
      // Safe to record: that these carry no credential is exactly what this drive proves. Process
      // ENVIRONMENTS are never recorded — they hold unrelated real gateway secrets.
      onboardCommandLines: onboardLines,
      canaryInProcessList: commandLines.some((line) => line.includes(CANARY)),
      canaryInProcessEnviron: canaryEnvironHits.length > 0,
      canaryInWorkerLogs: workerLogs.includes(CANARY),
      findings,
    },
    null,
    2,
  ),
);

if (findings.length > 0) {
  console.error(findings.join("; "));
  process.exitCode = 1;
} else {
  console.log(`apikey-argv-drive OK (provider=${providerId}): ${OUT}`);
}
