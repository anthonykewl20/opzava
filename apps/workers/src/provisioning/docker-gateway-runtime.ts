import { randomUUID } from "node:crypto";
import * as http from "node:http";

import {
  type GatewayRuntimeAgentCredential,
  type GatewayRuntimeAgentCredentialWrite,
  type GatewayRuntimeAgentProviderQuery,
  type GatewayRuntimeAuthChoice,
  type GatewayRuntimeAuthProbeQuery,
  type GatewayRuntimeCommandResult,
  type GatewayRuntimeDeviceCodeLogin,
  type GatewayRuntimeModelRunProbeQuery,
  type GatewayRuntimePort,
  type GatewayRuntimeSetupTokenLogin,
  type ModelRunProbe,
  type PluginModelCatalog,
  type PluginModelDiscoveryRead,
  type ProviderAuthProbe,
} from "@opzava/ports";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import { ASK_ADMIN_AGENT_DIR } from "./ask-admin-agent.js";

type Fetch = typeof fetch;

export interface DockerExecStdinConnection {
  readonly statusCode: number;
  readonly head: Uint8Array;
  readonly output: AsyncIterable<Uint8Array>;
  readonly end: (stdin: Uint8Array) => void;
  readonly destroy: () => void;
}

export type DockerExecStdinTransport = (input: {
  readonly url: URL;
  readonly connectionTimeoutMs: number;
}) => Promise<DockerExecStdinConnection>;

const dockerRequestTimeoutMs = 15_000;
const execStdinConnectionTimeoutMs = 15_000;
const execStdinExecutionTimeoutMs = 60_000;
const execStdinInspectTimeoutMs = 5_000;
const execStdinInspectPollMs = 50;
const deviceCodeStopInspectTimeoutMs = 5_000;
const deviceCodeStopInspectPollMs = 100;
const flowControlReadyTimeoutMs = 5_000;
const execStdinMaxOutputBytes = 2 * 1024 * 1024;
// A probe is one deliberately tiny model call ("Reply with OK", tools disabled). The gateway's own
// defaults are 8s/8 tokens; give it a little more room than that because the exec has to cold-start
// the runtime, and keep concurrency at 1 so a probe cannot itself trip a provider rate limit.
const authProbeTimeoutMs = 20_000;
const authProbeMaxTokens = 8;
// The exec must outlive the probe's own timeout, or we would time the docker request out while the
// gateway is still deciding — which reads as "unproven" and silently disarms the guard.
const authProbeExecTimeoutMs = 60_000;
const modelCanaryExecTimeoutMs = 60_000;
const modelCanaryProcessTimeoutSeconds = 45;
const modelCanaryMaxOutputBytes = 1024 * 1024;
const pluginModelDiscoveryTimeoutMs = 15_000;
const pluginModelDiscoveryMaxOutputBytes = 2 * 1024 * 1024;
const pluginModelDiscoveryTruncatedExitCode = 73;
const pluginModelDiscoveryMagic = "OPZAVA_PLUGIN_DISCOVERY_V1";
const generatedPluginModelCatalogVersion = "openclaw-plugin-model-catalog-v1";

/** The one place credential material is stripped out of text on its way to a Result or a log (#191). */
function redactCredential(text: string, credential: string): string {
  return credential === "" ? text : text.replaceAll(credential, "[redacted]");
}

class ExecStdinFailure extends Error {
  public constructor(
    public readonly kind: "connectionTimeout" | "executionTimeout" | "outputTooLarge",
  ) {
    super(kind);
  }
}

function nodeHttpExecStdinTransport(input: {
  readonly url: URL;
  readonly connectionTimeoutMs: number;
}): Promise<DockerExecStdinConnection> {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify({ Detach: false, Tty: false }), "utf8");
    let settled = false;
    const request = http.request(input.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(payload.length),
        connection: "Upgrade",
        upgrade: "tcp",
      },
    });
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        request.destroy();
        reject(new ExecStdinFailure("connectionTimeout"));
      }
    }, input.connectionTimeoutMs);
    const rejectOnce = (error: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      request.destroy();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    request.once("upgrade", (response, socket, head) => {
      if (response.statusCode !== 101) {
        socket.destroy();
        rejectOnce(new Error(`Docker exec stdin upgrade returned HTTP ${response.statusCode}.`));
        return;
      }
      if (settled) {
        socket.destroy();
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve({
        statusCode: response.statusCode,
        head,
        output: socket,
        end: (stdin) => socket.end(stdin),
        destroy: () => socket.destroy(),
      });
    });
    request.once("response", (response) => {
      response.resume();
      rejectOnce(
        new Error(`Docker exec stdin request was not upgraded (HTTP ${response.statusCode}).`),
      );
    });
    request.once("error", rejectOnce);
    request.write(payload);
    // Ending the HTTP request before the upgrade closes the write side that becomes exec stdin.
  });
}

function provisioningError(
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): DomainError {
  return new DomainError({
    code,
    message,
    ...(details === undefined ? {} : { details }),
  });
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

// `script` inherits the exec's window size, and the provisioning exec has no TTY, so the PTY it
// allocates is 0x0. An Ink CLI asked to render into a zero-width terminal wraps EVERY WORD onto its
// own line and chops long values (a 108-char setup-token) into fragments -- which is how the log
// scrapers ended up gluing prose onto a captured secret (#145). Give the PTY a real window before
// the CLI starts so its output is laid out the way the parsers assume.
const ptyColumns = 200;
const ptyRows = 50;

function ptySized(command: string): string {
  return `stty cols ${ptyColumns} rows ${ptyRows} >/dev/null 2>&1 || true; ${command}`;
}

function stripAnsi(value: string): string {
  // The device-code CLI is a TTY prompter (ANSI escapes + spinners); strip CSI sequences so the
  // verification URL + code parse cleanly. ESC (0x1B) is intentional here.
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1B\[[0-9;?]*[a-zA-Z]/g, "");
}

function secureDeleteCommand(logPath: string): string {
  const quotedLogPath = shellQuote(logPath);
  return [
    `if [ -f ${quotedLogPath} ]; then`,
    `if command -v shred >/dev/null 2>&1; then shred -u ${quotedLogPath} || exit 1;`,
    "else",
    `size=$(wc -c < ${quotedLogPath} 2>/dev/null) || exit 1;`,
    `if [ "$size" -gt 0 ] 2>/dev/null; then dd if=/dev/zero of=${quotedLogPath} bs=4096 count=$(( (size + 4095) / 4096 )) conv=notrunc status=none 2>/dev/null || exit 1; fi;`,
    `rm -f ${quotedLogPath} || exit 1;`,
    "fi;",
    "fi;",
    `rmdir "$(dirname ${quotedLogPath})" 2>/dev/null || true`,
  ].join(" ");
}

function flowControlPath(logPath: string): string {
  const separator = logPath.lastIndexOf("/");
  if (separator <= 0) {
    throw provisioningError(
      "provisioning.docker.flowPathInvalid",
      "The provider authorization flow path is invalid.",
    );
  }
  return `${logPath.slice(0, separator)}/session.pid`;
}

function sessionWrappedCommand(controlPath: string, command: string): string {
  const temporaryControlPath = `${controlPath}.tmp`;
  const sessionCommand = [
    "set -eu",
    "umask 077",
    `printf '%s\\n' "$$" > ${shellQuote(temporaryControlPath)}`,
    `chmod 600 ${shellQuote(temporaryControlPath)}`,
    `mv ${shellQuote(temporaryControlPath)} ${shellQuote(controlPath)}`,
    command,
  ].join("; ");
  // The outer Docker exec remains alive in `wait`, while the inner shell becomes a fresh session
  // leader. Its in-container PID is the process-group id that cancellation may safely signal.
  return `setsid sh -c ${shellQuote(sessionCommand)} & session_pid=$!; wait "$session_pid"`;
}

function secureDeleteFlowArtifactsCommand(logPath: string): string {
  const controlPath = flowControlPath(logPath);
  const flowDir = logPath.slice(0, logPath.lastIndexOf("/"));
  return [
    "set -eu",
    secureDeleteCommand(logPath),
    `rm -f ${shellQuote(controlPath)} ${shellQuote(`${controlPath}.tmp`)} ${shellQuote(`${flowDir}/stdin`)}`,
    `rmdir ${shellQuote(flowDir)}`,
  ].join("; ");
}

function redactDeviceCodeLog(value: string): string {
  return value
    .replace(
      /(["']?(?:refresh_token|access_token|id_token|api[_-]?key|token)["']?\s*:\s*)["'][^"']+["']/gi,
      '$1"[redacted]"',
    )
    .replace(
      /\b(refresh_token|access_token|id_token|api[_-]?key|token)\s*[:=]\s*\S+/gi,
      "$1=[redacted]",
    )
    .replace(/\bsk-[a-z0-9_-]{8,}\b/gi, "[redacted]")
    .replace(/\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g, "[redacted]");
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function pluginModelDiscoveryCommand(): string {
  const outputLimit = pluginModelDiscoveryMaxOutputBytes;
  const outputLimitWithSentinel = outputLimit + 1;
  const catalogGlob = `${shellQuote(ASK_ADMIN_AGENT_DIR)}/plugins/*/catalog.json`;

  // Build the framed document before emitting it so stdout can be capped with one sentinel byte.
  // The sentinel plus a dedicated exit code lets the caller distinguish truncation from an honest
  // empty directory; silently accepting a partial catalog would under-report paid-for models.
  return [
    "set -u",
    "out=$(mktemp /tmp/opzava-plugin-discovery.XXXXXX)",
    "plugins=$(mktemp /tmp/opzava-plugin-list.XXXXXX)",
    'cleanup() { rm -f "$out" "$plugins"; }',
    "trap cleanup EXIT HUP INT TERM",
    'node openclaw.mjs plugins list --json > "$plugins" || exit 1',
    `printf '${pluginModelDiscoveryMagic}\\n' > "$out"`,
    'plugin_size=$(wc -c < "$plugins" | tr -d "[:space:]")',
    'printf "P %s\\n" "$plugin_size" >> "$out"',
    'cat "$plugins" >> "$out"',
    `for f in ${catalogGlob}; do`,
    '[ -f "$f" ] || continue',
    'path_size=$(printf "%s" "$f" | wc -c | tr -d "[:space:]")',
    'body_size=$(wc -c < "$f" | tr -d "[:space:]")',
    'printf "C %s %s\\n" "$path_size" "$body_size" >> "$out"',
    'printf "%s" "$f" >> "$out"',
    'cat "$f" >> "$out"',
    "done",
    'printf "E\\n" >> "$out"',
    'output_size=$(wc -c < "$out" | tr -d "[:space:]")',
    `if [ "$output_size" -gt ${outputLimit} ]; then head -c ${outputLimitWithSentinel} "$out"; exit ${pluginModelDiscoveryTruncatedExitCode}; fi`,
    'cat "$out"',
  ].join("\n");
}

interface PluginDiscoveryFrameRead {
  readonly pluginJson: string;
  readonly catalogs: readonly { readonly path: string; readonly json: string }[];
}

function framedLine(
  bytes: Buffer,
  offset: number,
): { readonly line: string; readonly nextOffset: number } | null {
  const newline = bytes.indexOf(0x0a, offset);
  if (newline < 0) {
    return null;
  }
  return {
    line: bytes.subarray(offset, newline).toString("utf8"),
    nextOffset: newline + 1,
  };
}

function framedBytes(
  bytes: Buffer,
  offset: number,
  length: number,
): { readonly value: string; readonly nextOffset: number } | null {
  const nextOffset = offset + length;
  if (!Number.isSafeInteger(length) || length < 0 || nextOffset > bytes.length) {
    return null;
  }
  return { value: bytes.subarray(offset, nextOffset).toString("utf8"), nextOffset };
}

function parsePluginDiscoveryFrames(stdout: string): PluginDiscoveryFrameRead | null {
  const bytes = Buffer.from(stdout, "utf8");
  const magic = framedLine(bytes, 0);
  if (magic === null || magic.line !== pluginModelDiscoveryMagic) {
    return null;
  }

  const pluginHeader = framedLine(bytes, magic.nextOffset);
  const pluginHeaderMatch = pluginHeader?.line.match(/^P (\d+)$/) ?? null;
  if (pluginHeader === null || pluginHeaderMatch?.[1] === undefined) {
    return null;
  }
  const pluginPayload = framedBytes(bytes, pluginHeader.nextOffset, Number(pluginHeaderMatch[1]));
  if (pluginPayload === null) {
    return null;
  }

  let offset = pluginPayload.nextOffset;
  const catalogs: { path: string; json: string }[] = [];
  while (offset < bytes.length) {
    const header = framedLine(bytes, offset);
    if (header === null) {
      return null;
    }
    if (header.line === "E") {
      return header.nextOffset === bytes.length
        ? { pluginJson: pluginPayload.value, catalogs }
        : null;
    }

    const catalogHeaderMatch = header.line.match(/^C (\d+) (\d+)$/);
    if (catalogHeaderMatch?.[1] === undefined || catalogHeaderMatch[2] === undefined) {
      return null;
    }
    const path = framedBytes(bytes, header.nextOffset, Number(catalogHeaderMatch[1]));
    if (path === null) {
      return null;
    }
    const json = framedBytes(bytes, path.nextOffset, Number(catalogHeaderMatch[2]));
    if (json === null) {
      return null;
    }
    catalogs.push({ path: path.value, json: json.value });
    offset = json.nextOffset;
  }

  return null;
}

function parsePluginSummaries(json: string): PluginModelDiscoveryRead["plugins"] | null {
  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    return null;
  }
  const plugins = recordValue(payload)?.["plugins"];
  if (!Array.isArray(plugins)) {
    return null;
  }

  return plugins.flatMap((plugin) => {
    const entry = recordValue(plugin);
    const id = stringValue(entry?.["id"]);
    const enabled = entry?.["enabled"];
    return id === null || typeof enabled !== "boolean" ? [] : [{ id, enabled }];
  });
}

function pluginIdFromCatalogPath(path: string): string | null {
  const encodedPluginId = path.match(/\/plugins\/([^/]+)\/catalog\.json$/)?.[1];
  if (encodedPluginId === undefined) {
    return null;
  }
  try {
    return stringValue(decodeURIComponent(encodedPluginId));
  } catch {
    return null;
  }
}

function parsePluginModelCatalog(input: {
  readonly path: string;
  readonly json: string;
}): PluginModelCatalog | null {
  const pluginId = pluginIdFromCatalogPath(input.path);
  if (pluginId === null) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(input.json);
  } catch {
    return null;
  }
  const catalog = recordValue(payload);
  if (
    catalog?.["generatedBy"] !== generatedPluginModelCatalogVersion ||
    !isRecord(catalog["providers"])
  ) {
    return null;
  }

  const providers: PluginModelCatalog["providers"] = {};
  for (const [providerId, rawProvider] of Object.entries(catalog["providers"])) {
    const provider = recordValue(rawProvider);
    const models = provider?.["models"];
    if (
      provider === null ||
      !Array.isArray(models) ||
      !models.every(isRecord) ||
      ("baseUrl" in provider && typeof provider["baseUrl"] !== "string") ||
      ("api" in provider && typeof provider["api"] !== "string")
    ) {
      continue;
    }
    providers[providerId] = {
      ...(typeof provider["baseUrl"] === "string" ? { baseUrl: provider["baseUrl"] } : {}),
      ...(typeof provider["api"] === "string" ? { api: provider["api"] } : {}),
      models,
    };
  }

  return Object.keys(providers).length === 0 ? null : { pluginId, providers };
}

function commandFailureError(input: {
  readonly providerId: string;
  readonly authChoiceId: string;
  readonly result: GatewayRuntimeCommandResult;
  readonly submittedCredential?: string;
}): DomainError {
  // SECURITY: `onboard` is credential-bearing and can echo the submitted key/token. Classify from
  // raw output internally, but only surface a bounded, redacted reason to the browser.
  const rawOutput = `${input.result.stderr}\n${input.result.stdout}`;
  const normalized = rawOutput.toLowerCase();
  const code =
    normalized.includes("allow") && normalized.includes("plugin")
      ? "provisioning.connections.providerBlockedByAllowlist"
      : normalized.includes("auth choice") ||
          normalized.includes("auth method") ||
          normalized.includes("not matched") ||
          normalized.includes("unsupported")
        ? "provisioning.connections.authMethodMismatch"
        : normalized.includes("invalid") ||
            normalized.includes("unauthorized") ||
            normalized.includes("401") ||
            normalized.includes("403")
          ? "provisioning.connections.invalidProviderCredential"
          : "provisioning.connections.gatewayOnboardFailed";

  const sanitizedReason = sanitizedCommandFailureReason(rawOutput, input.submittedCredential);
  const message =
    code === "provisioning.connections.providerBlockedByAllowlist"
      ? `Gateway blocked ${input.providerId} on the plugin allowlist.`
      : code === "provisioning.connections.authMethodMismatch"
        ? `Gateway rejected the ${input.providerId} auth method: ${sanitizedReason}.`
        : code === "provisioning.connections.invalidProviderCredential"
          ? `Gateway rejected the ${input.providerId} credential: ${sanitizedReason}.`
          : `Gateway onboard failed for ${input.providerId}: ${sanitizedReason}.`;

  return provisioningError(code, message, {
    providerId: input.providerId,
    authChoiceId: input.authChoiceId,
    exitCode: input.result.exitCode,
  });
}

function sanitizedCommandFailureReason(rawOutput: string, submittedCredential?: string): string {
  const withoutAnsi = stripAnsi(rawOutput)
    .replaceAll("\r", "\n")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line !== "");
  const fallback = "command exited non-zero";
  let reason = withoutAnsi ?? fallback;
  if (submittedCredential !== undefined && submittedCredential.trim() !== "") {
    reason = reason.replaceAll(submittedCredential, "[redacted]");
  }
  reason = reason
    .replace(/\bsk-[a-z0-9_-]{8,}\b/gi, "[redacted]")
    .replace(/\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g, "[redacted]")
    .replace(/(--(?:api-)?key|--token)\s+\S+/gi, "$1 [redacted]")
    .replace(/\s+/g, " ")
    .slice(0, 240)
    .trim();

  return reason === "" ? fallback : reason;
}

function dockerHttpBaseUrl(dockerHost: string): Result<string> {
  if (!dockerHost.startsWith("tcp://")) {
    return err(
      provisioningError(
        "provisioning.docker.unsupportedHost",
        "DOCKER_HOST must use tcp:// for the provisioning worker docker-socket-proxy path.",
      ),
    );
  }

  try {
    return ok(new URL(dockerHost.replace(/^tcp:\/\//, "http://")).toString().replace(/\/$/, ""));
  } catch (error) {
    return err(
      provisioningError("provisioning.docker.invalidHost", "DOCKER_HOST is invalid.", {
        error: String(error),
      }),
    );
  }
}

function dockerMultiplexedOutput(buffer: Buffer): {
  readonly stdout: string;
  readonly stderr: string;
} {
  let offset = 0;
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  while (offset + 8 <= buffer.length) {
    const stream = buffer[offset];
    const size = buffer.readUInt32BE(offset + 4);
    const next = offset + 8 + size;
    if (size < 0 || next > buffer.length) {
      return { stdout: buffer.toString("utf8"), stderr: "" };
    }

    const chunk = buffer.subarray(offset + 8, next);
    if (stream === 2) {
      stderr.push(chunk);
    } else {
      stdout.push(chunk);
    }
    offset = next;
  }

  if (offset !== buffer.length) {
    return { stdout: buffer.toString("utf8"), stderr: "" };
  }

  return {
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
  };
}

function authChoiceMode(choiceId: string, keyFlag: string | null): "api-key" | "device-flow" {
  if (keyFlag !== null) {
    return "api-key";
  }

  const normalized = choiceId.toLowerCase();
  return normalized.includes("oauth") ||
    normalized.includes("device") ||
    normalized.includes("cli") ||
    normalized.includes("claude-max") ||
    normalized === "openai" ||
    normalized === "github-copilot"
    ? "device-flow"
    : "api-key";
}

function authChoiceLabel(choiceId: string, mode: "api-key" | "device-flow"): string {
  if (choiceId === "setup-token") {
    return "Anthropic setup-token";
  }

  if (mode === "api-key") {
    return "API key";
  }

  if (choiceId.includes("claude-max") || choiceId.includes("claude")) {
    return "Claude Max proxy subscription";
  }

  if (choiceId.includes("cli")) {
    return "Interactive CLI";
  }

  return "OAuth device flow";
}

function parseOnboardAuthChoiceIds(helpText: string): readonly string[] {
  const match = helpText.match(/--auth-choice <choice>\s+Auth:\s+([^\n]+)/);
  if (match === null || match[1] === undefined) {
    return [];
  }

  return match[1]
    .split("|")
    .map((choice) => choice.trim())
    .filter((choice) => choice !== "");
}

function parseOnboardApiKeyFlags(helpText: string): readonly string[] {
  const flags = new Set<string>();
  for (const line of helpText.split("\n")) {
    const match = line.match(/^\s+--([a-z0-9-]+-api-key)\s+<key>\s+/i);
    if (match?.[1] !== undefined) {
      flags.add(match[1]);
    }
  }

  return [...flags].sort((left, right) => left.localeCompare(right));
}

function setupTokenKeyFlag(choiceId: string): string | null {
  return choiceId.toLowerCase() === "setup-token" ? "token" : null;
}

// `models auth list --json` answers with the profiles the agent can RESOLVE, which already accounts
// for read-through inheritance from the shared store. An unparseable payload yields no profile ids,
// so a post-check reading this fails closed rather than reporting a provider as usable on a guess.
function parseAgentProviderProfileIds(stdout: string): readonly string[] {
  let payload: unknown;
  try {
    payload = JSON.parse(stdout);
  } catch {
    return [];
  }

  const profiles = Array.isArray(payload)
    ? payload
    : ((payload as { readonly profiles?: unknown } | null)?.profiles ?? []);
  if (!Array.isArray(profiles)) {
    return [];
  }

  return profiles
    .map((profile) =>
      typeof profile === "string"
        ? profile
        : ((profile as { readonly id?: unknown } | null)?.id ?? null),
    )
    .filter((id): id is string => typeof id === "string" && id.trim() !== "");
}

// `models auth paste-api-key|paste-token` declares what it wrote on its last line:
//   `Auth profile: anthropic:manual (anthropic/token)`
// Read BOTH the profile id and the provider from it rather than recomputing them. The gateway
// canonicalizes some providers on the way in (`codex` and `openai-codex` both collapse to `openai`),
// so locally-derived values would be wrong for exactly the providers Opzava cares most about — and a
// probe addressed to a profile or provider the gateway does not have probes NOTHING, which fails
// open and silently disarms the guard.
function parseWrittenAuthProfile(stdout: string): {
  readonly profileId: string | null;
  readonly providerId: string | null;
} {
  const match = stripAnsi(stdout).match(/^\s*Auth profile:\s*(\S+)\s+\(([^/)]+)\//m);
  return {
    profileId: match?.[1] ?? null,
    providerId: match?.[2] === undefined ? null : (stringValue(match[2]) ?? null),
  };
}

/**
 * The probe summary the gateway emits under `auth.probes` in `models status --json`.
 *
 * The nesting is load-bearing: an earlier draft of this read a top-level `probes` key, which parses
 * to nothing on every real payload and would have made the whole guard a no-op that always answered
 * "unproven" — a security check that silently never fires is worse than no check, because it is
 * believed.
 */
function parseAuthProbeResults(stdout: string): readonly Record<string, unknown>[] | null {
  let payload: unknown;
  try {
    payload = JSON.parse(stdout);
  } catch {
    return null;
  }

  const auth = recordValue(recordValue(payload)?.["auth"]);
  const probes = recordValue(auth?.["probes"]);
  if (probes === null) {
    return null;
  }

  const results = probes["results"];
  return Array.isArray(results) ? results.filter(isRecord) : [];
}

/**
 * Classify the gateway's own probe buckets into a verdict.
 *
 * `auth` is the ONLY invalidating one. Everything else — rate_limit, billing, timeout, format,
 * unknown, no_model, and every pre-call reasonCode — means the probe did not get an answer, not
 * that the answer was no. Treating those as rejections would reject valid credentials during a
 * provider outage, which #183 explicitly calls worse than the bug it is fixing.
 */
function providerAuthProbeVerdict(results: readonly Record<string, unknown>[]): ProviderAuthProbe {
  const rejected = results.find((result) => stringValue(result["status"]) === "auth");
  if (rejected !== undefined) {
    return {
      verdict: "rejected",
      reason: probeReason(rejected) ?? "the provider rejected the credential",
    };
  }

  if (results.some((result) => stringValue(result["status"]) === "ok")) {
    return { verdict: "verified", reason: "the provider accepted the credential" };
  }

  const inconclusive = results[0];
  if (inconclusive === undefined) {
    // No target at all: the profile we asked about is not one the gateway would ever resolve, so
    // there was nothing to prove. Fail open, loudly, at the call site.
    return { verdict: "unproven", reason: "the gateway had no credential to probe" };
  }

  const status = stringValue(inconclusive["status"]) ?? "unknown";
  return {
    verdict: "unproven",
    reason: probeReason(inconclusive) ?? `the probe was inconclusive (${status})`,
  };
}

function parseModelCanaryEvents(stdout: string): readonly Record<string, unknown>[] | null {
  const lines = stdout.split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) {
    return null;
  }

  const events: Record<string, unknown>[] = [];
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as unknown;
      if (!isRecord(event)) {
        return null;
      }
      events.push(event);
    } catch {
      return null;
    }
  }
  return events;
}

function modelCanaryVerdict(result: GatewayRuntimeCommandResult): ModelRunProbe {
  const events = parseModelCanaryEvents(result.stdout);
  if (events === null) {
    return { verdict: "unproven", reason: "Could not verify the model; try again." };
  }

  const unsupported = events.some((event) => {
    const upstreamError = recordValue(event["error"]);
    return (
      event["status"] === 400 && stringValue(upstreamError?.["type"]) === "invalid_request_error"
    );
  });
  if (unsupported) {
    // This is deliberately structural, never message parsing. The private app-server canary emits
    // this summary only for turn/start or a correlated turn notification after a valid thread/start;
    // setup failures never feed the unsupported flag. On that fixed, minimal turn this is the model
    // version-floor rejection from #251.
    return {
      verdict: "unrunnable",
      reason: "The gateway's runtime cannot run this model yet.",
    };
  }

  if (
    result.exitCode === 0 &&
    events.some((event) => stringValue(event["type"]) === "turn.completed")
  ) {
    return { verdict: "runnable", reason: "The gateway's runtime ran this model." };
  }

  // Auth failures, rate limits, provider outages, timeouts, exec failures, and every unknown
  // shape say only that this attempt proved nothing. Fail open: none may become `unrunnable`.
  return { verdict: "unproven", reason: "Could not verify the model; try again." };
}

export const modelCanaryScript = String.raw`
import { pathToFileURL } from "node:url";

const [sharedClientModule, agentDir, providerId, model, codexHome, nativeHome] =
  process.argv.slice(2);
const sharedClientExports = await import(pathToFileURL(sharedClientModule).href);
const sharedClientNamespace = Object.values(sharedClientExports).find(
  (value) =>
    value !== null &&
    typeof value === "object" &&
    typeof value.createIsolatedCodexAppServerClient === "function",
);
const createIsolatedCodexAppServerClient =
  sharedClientExports.createIsolatedCodexAppServerClient ??
  sharedClientNamespace?.createIsolatedCodexAppServerClient;
if (typeof createIsolatedCodexAppServerClient !== "function") {
  throw new Error("Codex app-server client is unavailable");
}

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isBadRequestError = (value) =>
  isRecord(value) && value.codexErrorInfo === "badRequest";
const isUnsupportedModelSignal = (value) => {
  if (!isRecord(value)) return false;
  const error = isRecord(value.error) ? value.error : undefined;
  const turn = isRecord(value.turn) ? value.turn : undefined;
  const turnError = isRecord(turn?.error) ? turn.error : undefined;
  return (
    isBadRequestError(value) ||
    isBadRequestError(error) ||
    isBadRequestError(turnError) ||
    (value.status === 400 && error?.type === "invalid_request_error")
  );
};

const startOptions = {
  transport: "stdio",
  homeScope: "agent",
  command: "codex",
  commandSource: "managed",
  args: ["app-server", "--listen", "stdio://"],
  headers: {},
  env: { CODEX_HOME: codexHome, HOME: nativeHome },
  clearEnv: ["OPENCLAW_CODEX_APP_SERVER_ARGS"],
};

let client;
let closePromise;
let unsupported = false;
let phase = "setup";
let threadId;
let turnId;
let settled = false;
let resolveCompletion;
const completion = new Promise((resolve) => { resolveCompletion = resolve; });
const settle = (outcome) => {
  if (settled) return;
  settled = true;
  resolveCompletion(outcome);
};
const closeClient = () => {
  if (closePromise) return closePromise;
  closePromise = client?.closeAndWait
    ? client.closeAndWait({ exitTimeoutMs: 1_000, forceKillDelayMs: 250 })
    : Promise.resolve(client?.close());
  return closePromise.catch(() => undefined);
};
const terminate = () => {
  void closeClient().finally(() => process.exit(1));
};
const isCurrentTurnNotification = (params) => {
  if (phase !== "turn" || typeof threadId !== "string") return false;
  const turn = isRecord(params.turn) ? params.turn : undefined;
  const notificationThreadId = typeof turn?.threadId === "string"
    ? turn.threadId
    : params.threadId;
  const notificationTurnId = typeof turn?.id === "string" ? turn.id : params.turnId;
  return (
    notificationThreadId === threadId &&
    typeof notificationTurnId === "string" &&
    (typeof turnId !== "string" || notificationTurnId === turnId)
  );
};
process.once("SIGTERM", terminate);
process.once("SIGINT", terminate);
process.once("SIGHUP", terminate);

try {
  client = await createIsolatedCodexAppServerClient({
    startOptions,
    agentDir,
    timeoutMs: 20_000,
  });
  client.addNotificationHandler((notification) => {
    const params = isRecord(notification.params) ? notification.params : {};
    if (notification.method === "error") {
      if (!isCurrentTurnNotification(params)) return;
      unsupported ||= isUnsupportedModelSignal(params);
      if (params.willRetry !== true) settle("failed");
      return;
    }
    if (notification.method === "turn/completed") {
      if (!isCurrentTurnNotification(params)) return;
      unsupported ||= isUnsupportedModelSignal(params);
      const turn = isRecord(params.turn) ? params.turn : {};
      settle(turn.status === "completed" ? "completed" : "failed");
    }
  });
  client.addRequestHandler((request) => {
    if (request.method === "item/permissions/requestApproval") {
      return { permissions: {}, scope: "turn" };
    }
    if (request.method.includes("requestApproval")) {
      return { decision: "decline", reason: "The Opzava model canary does not use tools." };
    }
    if (request.method === "mcpServer/elicitation/request") return { action: "decline" };
    return undefined;
  });

  const threadParams = {
    model,
    // Codex is virtual and OAuth-backed OpenAI is native to app-server. OpenClaw's canonical
    // provider resolver omits modelProvider for both so the elected auth/provider pair is kept.
    ...(providerId === "codex" || providerId === "openai" ? {} : { modelProvider: providerId }),
    cwd: process.cwd(),
    approvalPolicy: "never",
    sandbox: "read-only",
    serviceName: "Opzava model canary",
    developerInstructions: "Return exactly one token: OK. Do not use tools.",
    config: {
      "features.multi_agent": false,
      "features.apps": false,
      "features.plugins": false,
      "features.hooks": false,
      "features.image_generation": false,
      "features.standalone_web_search": false,
      web_search: "disabled",
      notify: [],
    },
    environments: [],
    dynamicTools: [],
    experimentalRawEvents: true,
    persistExtendedHistory: false,
    ephemeral: true,
  };
  const threadResponse = await client.request(
    "thread/start",
    threadParams,
    { timeoutMs: 20_000 },
  );
  if (
    !isRecord(threadResponse) ||
    !isRecord(threadResponse.thread) ||
    typeof threadResponse.thread.id !== "string"
  ) {
    throw new Error("invalid thread response");
  }
  threadId = threadResponse.thread.id;
  phase = "turn";

  const turnResponse = await client.request("turn/start", {
    threadId: threadResponse.thread.id,
    input: [{ type: "text", text: "Reply exactly: OK", text_elements: [] }],
    cwd: process.cwd(),
    model,
  }, { timeoutMs: 20_000 });
  unsupported ||= isUnsupportedModelSignal(turnResponse);
  const immediateTurn = isRecord(turnResponse) && isRecord(turnResponse.turn)
    ? turnResponse.turn
    : undefined;
  turnId = immediateTurn?.id;
  if (immediateTurn?.status === "completed") settle("completed");
  if (immediateTurn?.status === "failed" || immediateTurn?.status === "interrupted") {
    settle("failed");
  }

  let completionTimer;
  const outcome = await Promise.race([
    completion,
    new Promise((resolve) => {
      completionTimer = setTimeout(() => resolve("timeout"), 20_000);
    }),
  ]);
  clearTimeout(completionTimer);
  if (outcome === "completed") {
    process.stdout.write('{"type":"turn.completed"}\n');
    process.exitCode = 0;
  } else if (unsupported) {
    process.stdout.write(
      '{"type":"error","status":400,"error":{"type":"invalid_request_error"}}\n',
    );
    process.exitCode = 2;
  } else {
    process.stdout.write('{"type":"error"}\n');
    process.exitCode = 1;
  }
} catch (error) {
  if (phase === "turn") unsupported ||= isUnsupportedModelSignal(error?.data);
  process.stdout.write(
    unsupported
      ? '{"type":"error","status":400,"error":{"type":"invalid_request_error"}}\n'
      : '{"type":"error"}\n',
  );
  process.exitCode = unsupported ? 2 : 1;
} finally {
  process.removeListener("SIGTERM", terminate);
  process.removeListener("SIGINT", terminate);
  process.removeListener("SIGHUP", terminate);
  await closeClient();
}
`;

function modelCanaryCommand(agentId: string, providerId: string, model: string): string {
  const agentDir = `/home/node/.openclaw/agents/${agentId}/agent`;

  return [
    "set -u",
    "flow_dir=$(mktemp -d /tmp/opzava-model-canary.XXXXXX)",
    'cleanup() { rm -rf "$flow_dir"; }',
    "trap cleanup EXIT HUP INT TERM",
    'output="$flow_dir/codex.jsonl"',
    'status_file="$flow_dir/status"',
    `printf '%s' ${shellQuote(modelCanaryScript)} > "$flow_dir/canary.mjs"`,
    'mkdir -m 700 "$flow_dir/codex-home" "$flow_dir/home"',
    'shared_client_module=""',
    "for candidate in /app/dist-runtime/extensions/codex/src/app-server/shared-client.js /app/dist/extensions/codex/src/app-server/shared-client.js /app/extensions/codex/src/app-server/shared-client.js /app/dist-runtime/extensions/codex/shared-client-*.js /app/dist/extensions/codex/shared-client-*.js /app/extensions/codex/dist/shared-client-*.js /home/node/.openclaw/npm/projects/openclaw-codex-*/node_modules/@openclaw/codex/dist/shared-client-*.js; do",
    'if [ -f "$candidate" ]; then shared_client_module="$candidate"; break; fi',
    "done",
    'if [ -z "$shared_client_module" ]; then exit 127; fi',
    'cd "$flow_dir"',
    // The script emits only an Opzava-owned structural summary. `head` remains a defense-in-depth
    // output bound; if it ever truncates, the invalid JSON becomes safely `unproven`.
    `(
      timeout -k 5s -s TERM ${modelCanaryProcessTimeoutSeconds}s node "$flow_dir/canary.mjs" \
        "$shared_client_module" \
        ${shellQuote(agentDir)} \
        ${shellQuote(providerId)} \
        ${shellQuote(model)} \
        "$flow_dir/codex-home" \
        "$flow_dir/home" 2>/dev/null
      printf '%s' "$?" > "$status_file"
    ) | head -c ${modelCanaryMaxOutputBytes} > "$output"`,
    'cat "$output"',
    'status=$(cat "$status_file" 2>/dev/null) || status=1',
    'case "$status" in ""|*[!0-9]*) status=1;; esac',
    'exit "$status"',
  ].join("\n");
}

function logModelCanary(input: GatewayRuntimeModelRunProbeQuery, probe: ModelRunProbe): void {
  const fields = {
    providerId: input.providerId,
    model: input.model,
    verdict: probe.verdict,
  };
  if (probe.verdict === "unrunnable") {
    console.warn("connections.modelCanary.unrunnable", fields);
  } else if (probe.verdict === "unproven") {
    console.warn("connections.modelCanary.unproven", fields);
  } else {
    console.info("connections.modelCanary.result", fields);
  }
}

function probeReason(result: Record<string, unknown>): string | null {
  const status = stringValue(result["status"]);
  const reasonCode = stringValue(result["reasonCode"]);
  const error = stringValue(result["error"]);
  const detail = error === null ? null : sanitizedCommandFailureReason(error);
  const label = reasonCode ?? status;
  if (label === null) {
    return detail;
  }

  return detail === null ? label : `${label}: ${detail}`;
}

function parseOnboardAuthChoices(helpText: string): readonly GatewayRuntimeAuthChoice[] {
  const choiceIds = parseOnboardAuthChoiceIds(helpText);
  const keyFlags = parseOnboardApiKeyFlags(helpText);
  const byId = new Map<string, GatewayRuntimeAuthChoice>();

  for (const choiceId of choiceIds) {
    const keyFlag =
      setupTokenKeyFlag(choiceId) ??
      keyFlags.find((flag) => flag === choiceId || flag === `${choiceId}-api-key`) ??
      null;
    const mode = authChoiceMode(choiceId, keyFlag);
    byId.set(choiceId, {
      id: choiceId,
      label: authChoiceLabel(choiceId, mode),
      mode,
      ...(keyFlag === null ? {} : { keyFlag }),
    });
  }

  for (const keyFlag of keyFlags) {
    const choiceId = choiceIds.includes(keyFlag)
      ? keyFlag
      : choiceIds.includes(keyFlag.replace(/-api-key$/, ""))
        ? keyFlag.replace(/-api-key$/, "")
        : keyFlag;
    if (!byId.has(choiceId)) {
      byId.set(choiceId, {
        id: choiceId,
        label: "API key",
        mode: "api-key",
        keyFlag,
      });
    }
  }

  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export class DockerOpenClawGatewayRuntime implements GatewayRuntimePort {
  private readonly baseUrlResult: Result<string>;

  public constructor(
    private readonly options: {
      readonly dockerHost: string;
      readonly containerName?: string;
      readonly fetch?: Fetch;
      readonly execStdinTransport?: DockerExecStdinTransport;
    },
  ) {
    this.baseUrlResult = dockerHttpBaseUrl(options.dockerHost);
  }

  public async listAuthChoices(): Promise<Result<readonly GatewayRuntimeAuthChoice[]>> {
    const result = await this.exec(["node", "openclaw.mjs", "onboard", "--help"]);
    if (!result.ok) {
      return err(result.error);
    }

    if (result.value.exitCode !== 0) {
      return err(
        commandFailureError({
          providerId: "catalog",
          authChoiceId: "onboard-help",
          result: result.value,
        }),
      );
    }

    return ok(parseOnboardAuthChoices(`${result.value.stdout}\n${result.value.stderr}`));
  }

  public async modelStatus(): Promise<Result<unknown>> {
    const result = await this.exec(["node", "openclaw.mjs", "models", "status", "--json"]);
    if (!result.ok) {
      return err(result.error);
    }

    if (result.value.exitCode !== 0) {
      return err(
        commandFailureError({
          providerId: "status",
          authChoiceId: "models-status",
          result: result.value,
        }),
      );
    }

    try {
      return ok(JSON.parse(result.value.stdout) as unknown);
    } catch (error) {
      return err(
        provisioningError(
          "provisioning.connections.modelStatusInvalidJson",
          "models status JSON was invalid.",
          {
            error: String(error),
          },
        ),
      );
    }
  }

  public async readPluginModelDiscovery(): Promise<Result<PluginModelDiscoveryRead>> {
    const result = await this.exec(
      ["sh", "-lc", pluginModelDiscoveryCommand()],
      undefined,
      pluginModelDiscoveryTimeoutMs,
    );
    if (!result.ok) {
      return err(result.error);
    }
    if (result.value.exitCode === pluginModelDiscoveryTruncatedExitCode) {
      return err(
        provisioningError(
          "provisioning.connections.pluginModelDiscoveryOutputTooLarge",
          "Plugin model discovery exceeded the bounded output limit.",
          { maxOutputBytes: pluginModelDiscoveryMaxOutputBytes },
        ),
      );
    }
    if (result.value.exitCode !== 0) {
      return err(
        provisioningError(
          "provisioning.connections.pluginModelDiscoveryFailed",
          "Gateway plugin model discovery failed.",
          { exitCode: result.value.exitCode },
        ),
      );
    }

    const frames = parsePluginDiscoveryFrames(result.value.stdout);
    if (frames === null) {
      return err(
        provisioningError(
          "provisioning.connections.pluginModelDiscoveryInvalidOutput",
          "Gateway plugin model discovery returned an invalid framed document.",
        ),
      );
    }
    const plugins = parsePluginSummaries(frames.pluginJson);
    if (plugins === null) {
      return err(
        provisioningError(
          "provisioning.connections.pluginListInvalidJson",
          "Gateway plugin list JSON was invalid.",
        ),
      );
    }

    return ok({
      plugins,
      catalogs: frames.catalogs.flatMap((catalog) => {
        const parsed = parsePluginModelCatalog(catalog);
        return parsed === null ? [] : [parsed];
      }),
    });
  }

  public async connectApiKey(input: {
    readonly providerId: string;
    readonly authChoiceId: string;
    readonly keyFlag: string;
    readonly apiKey: string;
  }): Promise<Result<GatewayRuntimeCommandResult>> {
    console.log(
      `provisioning-worker running gateway onboard for provider ${input.providerId} authChoice ${input.authChoiceId}`,
    );
    const supported = await this.assertOnboardReadsCredentialFromStdin(input.providerId);
    if (!supported.ok) {
      return err(supported.error);
    }

    // `--credential-stdin` keeps the credential out of argv, exec Env, and the shell (#187, #191).
    // `--token-provider` still names the provider for token choices; only the credential moves.
    const providerArgs = input.keyFlag === "token" ? ["--token-provider", input.providerId] : [];
    return this.execWithCredentialOnStdin(
      [
        "node",
        "openclaw.mjs",
        "onboard",
        "--non-interactive",
        "--accept-risk",
        "--flow",
        "manual",
        "--auth-choice",
        input.authChoiceId,
        ...providerArgs,
        "--credential-stdin",
        "--json",
      ],
      input.apiKey,
    );
  }

  /**
   * Runs a gateway command with the credential attached directly to stdin.
   *
   * The Docker hop remains plaintext over tcp://docker-socket-proxy:2375. This closes /proc,
   * exec-inspect Env, argv, and shell exposure (#191), but cannot protect against a compromised
   * worker, proxy, daemon, or container-network sniffer.
   */
  private async execWithCredentialOnStdin(
    cmd: readonly string[],
    credential: string,
  ): Promise<Result<GatewayRuntimeCommandResult>> {
    if (!this.baseUrlResult.ok) {
      return err(this.baseUrlResult.error);
    }
    const containerId = await this.resolveContainerId();
    if (!containerId.ok) {
      return err(containerId.error);
    }
    const created = await this.dockerRequest<{ readonly Id?: unknown }>(
      `/containers/${encodeURIComponent(containerId.value)}/exec`,
      {
        method: "POST",
        body: {
          AttachStdin: true,
          AttachStdout: true,
          AttachStderr: true,
          Tty: false,
          Cmd: cmd,
        },
      },
    );
    if (!created.ok) {
      return err(created.error);
    }
    const execId = stringValue(created.value["Id"]);
    if (execId === null) {
      return err(
        provisioningError(
          "provisioning.docker.execCreateInvalid",
          "Docker exec create did not return an exec id.",
        ),
      );
    }

    const transport = this.options.execStdinTransport ?? nodeHttpExecStdinTransport;
    let connection: DockerExecStdinConnection;
    try {
      connection = await transport({
        url: new URL(`/exec/${encodeURIComponent(execId)}/start`, this.baseUrlResult.value),
        connectionTimeoutMs: execStdinConnectionTimeoutMs,
      });
    } catch (error) {
      const timedOut = error instanceof ExecStdinFailure && error.kind === "connectionTimeout";
      return err(
        provisioningError(
          timedOut
            ? "provisioning.docker.execStdinConnectionTimeout"
            : "provisioning.docker.execStdinUpgradeFailed",
          timedOut
            ? "Docker exec stdin connection timed out."
            : "Docker exec stdin connection was not upgraded.",
          { error: String(error), timeoutMs: execStdinConnectionTimeoutMs },
        ),
      );
    }
    if (connection.statusCode !== 101) {
      connection.destroy();
      return err(
        provisioningError(
          "provisioning.docker.execStdinUpgradeRejected",
          `Docker exec stdin connection failed closed on HTTP ${connection.statusCode}.`,
        ),
      );
    }

    const captured: Buffer[] = [];
    let capturedBytes = 0;
    const capture = (bytes: Uint8Array): void => {
      capturedBytes += bytes.byteLength;
      if (capturedBytes > execStdinMaxOutputBytes) {
        throw new ExecStdinFailure("outputTooLarge");
      }
      captured.push(Buffer.from(bytes));
    };
    // Exactly once: the execution-timeout path destroys before it rejects, and the catch below
    // destroys everything else. Both can run for one failure.
    let destroyed = false;
    const destroyOnce = (): void => {
      if (!destroyed) {
        destroyed = true;
        connection.destroy();
      }
    };
    let executionTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const completed = (async (): Promise<void> => {
        capture(connection.head);
        connection.end(Buffer.from(credential, "utf8"));
        for await (const chunk of connection.output) {
          capture(chunk);
        }
      })();
      await Promise.race([
        completed,
        new Promise<never>((_resolve, reject) => {
          executionTimeout = setTimeout(() => {
            // Closing the worker's socket bounds this call; the container process may still run.
            destroyOnce();
            reject(new ExecStdinFailure("executionTimeout"));
          }, execStdinExecutionTimeoutMs);
        }),
      ]);
    } catch (error) {
      // Destroy on EVERY failing path, not just the two typed ones: a generic stream error would
      // otherwise leave the socket open and the exec blocked on a stdin that never gets its EOF.
      destroyOnce();
      if (error instanceof ExecStdinFailure && error.kind === "outputTooLarge") {
        return err(
          provisioningError(
            "provisioning.docker.execStdinOutputTooLarge",
            "Docker exec output exceeded the bounded capture limit.",
            { maxOutputBytes: execStdinMaxOutputBytes },
          ),
        );
      }
      const timedOut = error instanceof ExecStdinFailure && error.kind === "executionTimeout";
      return err(
        provisioningError(
          timedOut
            ? "provisioning.docker.execStdinExecutionTimeout"
            : "provisioning.docker.execStdinStreamFailed",
          timedOut ? "Docker exec stdin command timed out." : "Docker exec stdin stream failed.",
          // The credential is already in the transport's hands by here, so the exception text is
          // untrusted: redact it rather than hand a stream error the chance to carry the secret
          // into a DomainError and from there into a log (#191).
          {
            error: redactCredential(String(error), credential),
            timeoutMs: execStdinExecutionTimeoutMs,
          },
        ),
      );
    } finally {
      clearTimeout(executionTimeout);
    }

    const output = dockerMultiplexedOutput(Buffer.concat(captured));
    const stdout = redactCredential(output.stdout, credential);
    const stderr = redactCredential(output.stderr, credential);
    const inspected = await this.inspectExecAfterStdinEof(execId);
    if (!inspected.ok) {
      return err(inspected.error);
    }
    return ok({ exitCode: inspected.value, stdout, stderr });
  }

  private async inspectExecAfterStdinEof(execId: string): Promise<Result<number>> {
    const deadline = Date.now() + execStdinInspectTimeoutMs;
    while (true) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        return err(
          provisioningError(
            "provisioning.docker.execStdinInspectTimeout",
            "Docker exec did not publish a stopped state before the inspect timeout.",
            { timeoutMs: execStdinInspectTimeoutMs },
          ),
        );
      }
      const inspected = await this.dockerRequest<{
        readonly Running?: unknown;
        readonly ExitCode?: unknown;
      }>(`/exec/${encodeURIComponent(execId)}/json`, {
        method: "GET",
        timeoutMs: remainingMs,
      });
      if (!inspected.ok) {
        return err(inspected.error);
      }
      if (inspected.value.Running === false) {
        const exitCode = inspected.value.ExitCode;
        return ok(typeof exitCode === "number" && Number.isFinite(exitCode) ? exitCode : 1);
      }
      await new Promise<void>((resolve) => setTimeout(resolve, execStdinInspectPollMs));
    }
  }

  /**
   * Refuses to onboard against a gateway image whose `onboard` cannot read the credential from stdin.
   *
   * Such an image rejects `--credential-stdin` on its own, but only AFTER the worker has handed it
   * the secret. Ask first, and fail closed: a stale image is an ops problem to fix by rebuilding, not
   * a reason to fall back to passing the key in argv — that fallback is the leak this closes (#187).
   */
  private async assertOnboardReadsCredentialFromStdin(providerId: string): Promise<Result<void>> {
    const help = await this.exec(["node", "openclaw.mjs", "onboard", "--help"]);
    if (!help.ok) {
      return err(help.error);
    }
    if (help.value.exitCode !== 0) {
      return err(
        commandFailureError({
          providerId,
          authChoiceId: "onboard-help",
          result: help.value,
        }),
      );
    }

    const helpText = stripAnsi(`${help.value.stdout}\n${help.value.stderr}`);
    if (helpText.includes("--credential-stdin")) {
      return ok(undefined);
    }

    return err(
      provisioningError(
        "provisioning.connections.onboardCredentialStdinUnsupported",
        `The gateway image's onboard does not support --credential-stdin, so connecting ${providerId} would expose the credential in the container's process list. Rebuild the gateway image from ./mainframe and retry.`,
        { providerId },
      ),
    );
  }

  public async writeAgentCredential(
    input: GatewayRuntimeAgentCredential,
  ): Promise<Result<GatewayRuntimeAgentCredentialWrite>> {
    console.log(
      `provisioning-worker storing ${input.providerId} credential in the ${input.agentId} auth store`,
    );
    // `paste-token`/`paste-api-key` read the secret from stdin when stdin is not a TTY.
    const subcommand = input.keyFlag === "token" ? "paste-token" : "paste-api-key";
    const result = await this.execWithCredentialOnStdin(
      [
        "node",
        "openclaw.mjs",
        "models",
        "auth",
        "--agent",
        input.agentId,
        subcommand,
        "--provider",
        input.providerId,
      ],
      input.apiKey,
    );
    if (!result.ok) {
      return err(result.error);
    }

    return ok({ ...result.value, ...parseWrittenAuthProfile(result.value.stdout) });
  }

  public async probeProviderAuth(
    input: GatewayRuntimeAuthProbeQuery,
  ): Promise<Result<ProviderAuthProbe>> {
    console.log(
      `provisioning-worker probing the ${input.providerId} credential (${input.profileId}) in the ${input.agentId} auth store`,
    );
    const result = await this.exec(
      [
        "node",
        "openclaw.mjs",
        "models",
        "status",
        "--json",
        "--probe",
        "--agent",
        input.agentId,
        "--probe-provider",
        input.providerId,
        // Scope to the ONE profile this connect wrote. Without it the probe would also try any other
        // profile the provider happens to own — a stale OAuth token from an earlier connect could
        // then reject a perfectly good new API key.
        "--probe-profile",
        input.profileId,
        "--probe-timeout",
        String(authProbeTimeoutMs),
        "--probe-concurrency",
        "1",
        "--probe-max-tokens",
        String(authProbeMaxTokens),
      ],
      undefined,
      authProbeExecTimeoutMs,
    );
    if (!result.ok) {
      return err(result.error);
    }

    const results = parseAuthProbeResults(result.value.stdout);
    if (results === null) {
      // The command ran but said nothing we understand. That is not evidence the key is bad.
      return err(
        provisioningError(
          "provisioning.connections.authProbeUnavailable",
          "Gateway auth probe did not return a readable probe summary.",
          { providerId: input.providerId, exitCode: result.value.exitCode },
        ),
      );
    }

    return ok(providerAuthProbeVerdict(results));
  }

  public async probeModelRunnable(
    input: GatewayRuntimeModelRunProbeQuery,
  ): Promise<Result<ModelRunProbe>> {
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(input.agentId)) {
      return err(
        provisioningError(
          "provisioning.connections.modelCanaryAgentInvalid",
          "The model canary agent id is invalid.",
        ),
      );
    }

    // The bundled Codex app-server harness owns OpenClaw's `openai` and `codex` providers. Other
    // providers run through different harnesses, so asking Codex about their model id would not be
    // a valid probe of that provider/model pair and therefore cannot support an `unrunnable` claim.
    if (input.providerId !== "openai" && input.providerId !== "codex") {
      const probe: ModelRunProbe = {
        verdict: "unproven",
        reason: "Could not verify the model; try again.",
      };
      logModelCanary(input, probe);
      return ok(probe);
    }

    const result = await this.exec(
      ["sh", "-lc", modelCanaryCommand(input.agentId, input.providerId, input.model)],
      undefined,
      modelCanaryExecTimeoutMs,
    );
    if (!result.ok) {
      // Invalid Docker adapter configuration is not a probe verdict. Docker/gateway/exec outages
      // are: they make this attempt inconclusive and must fail open.
      if (
        result.error.code === "provisioning.docker.unsupportedHost" ||
        result.error.code === "provisioning.docker.invalidHost"
      ) {
        return err(result.error);
      }
      const probe: ModelRunProbe = {
        verdict: "unproven",
        reason: "Could not verify the model; try again.",
      };
      logModelCanary(input, probe);
      return ok(probe);
    }

    const probe = modelCanaryVerdict(result.value);
    logModelCanary(input, probe);
    return ok(probe);
  }

  public async listAgentProviderProfiles(
    input: GatewayRuntimeAgentProviderQuery,
  ): Promise<Result<readonly string[]>> {
    const result = await this.exec([
      "node",
      "openclaw.mjs",
      "models",
      "auth",
      "--agent",
      input.agentId,
      "list",
      "--provider",
      input.providerId,
      "--json",
    ]);
    if (!result.ok) {
      return err(result.error);
    }
    if (result.value.exitCode !== 0) {
      return err(
        commandFailureError({
          providerId: input.providerId,
          authChoiceId: "models-auth-list",
          result: result.value,
        }),
      );
    }

    return ok(parseAgentProviderProfileIds(result.value.stdout));
  }

  public async startDeviceCodeLogin(
    providerId: string,
    agentId: string,
  ): Promise<Result<GatewayRuntimeDeviceCodeLogin>> {
    const flowDir = `/tmp/opzava-df-${randomUUID()}`;
    const logPath = `${flowDir}/device.log`;
    const controlPath = flowControlPath(logPath);
    const command = `node openclaw.mjs models auth --agent ${shellQuote(
      agentId,
    )} login --provider ${shellQuote(providerId)} --device-code`;
    const redactor =
      "sed -u -E " +
      shellQuote(
        [
          's/("?)(refresh_token|access_token|id_token|api[_-]?key|token)("?)[[:space:]]*:[[:space:]]*["\']?[^"\']+["\']?/\\1\\2\\3:\\"[redacted]\\"/Ig',
          "s/\\b(refresh_token|access_token|id_token|api[_-]?key|token)[[:space:]]*[:=][[:space:]]*[^[:space:]]+/\\1=[redacted]/Ig",
          "s/\\bsk-[A-Za-z0-9_-]{8,}\\b/[redacted]/g",
          "s/\\b[A-Za-z0-9_-]{24,}\\.[A-Za-z0-9_-]{12,}\\.[A-Za-z0-9_-]{12,}\\b/[redacted]/g",
        ].join("; "),
      );
    const shellCommand = [
      "set -eu",
      `mkdir -m 700 ${shellQuote(flowDir)}`,
      `umask 077; : > ${shellQuote(logPath)}`,
      sessionWrappedCommand(
        controlPath,
        `/usr/bin/script -qfc ${shellQuote(ptySized(command))} /dev/null | ${redactor} >> ${shellQuote(logPath)}`,
      ),
    ].join("; ");
    const containerId = await this.resolveContainerId();
    if (!containerId.ok) {
      return err(containerId.error);
    }

    const created = await this.dockerRequest<{ readonly Id?: unknown }>(
      `/containers/${encodeURIComponent(containerId.value)}/exec`,
      {
        method: "POST",
        body: {
          AttachStdout: false,
          AttachStderr: false,
          Tty: false,
          Cmd: ["sh", "-lc", shellCommand],
        },
      },
    );
    if (!created.ok) {
      return err(created.error);
    }

    const execId = stringValue(created.value["Id"]);
    if (execId === null) {
      return err(
        provisioningError(
          "provisioning.docker.execCreateInvalid",
          "Docker exec create did not return an exec id.",
        ),
      );
    }

    const started = await this.dockerRawRequest(`/exec/${encodeURIComponent(execId)}/start`, {
      method: "POST",
      body: {
        Detach: true,
        Tty: false,
      },
    });
    if (!started.ok) {
      return this.recoverAfterFlowStartFailure(execId, logPath, started.error);
    }

    const controlPid = await this.waitForFlowControlPid(logPath);
    if (!controlPid.ok) {
      return this.cleanupAfterFlowReadinessFailure(execId, logPath, controlPid.error);
    }

    return ok({ execId, logPath });
  }

  public async readDeviceCodeLog(logPath: string): Promise<Result<string>> {
    const result = await this.exec(["sh", "-lc", `cat ${shellQuote(logPath)} 2>/dev/null || true`]);
    if (!result.ok) {
      return err(result.error);
    }

    return ok(redactDeviceCodeLog(result.value.stdout));
  }

  public async readSetupTokenLog(logPath: string): Promise<Result<string>> {
    const result = await this.exec(["sh", "-lc", `cat ${shellQuote(logPath)} 2>/dev/null || true`]);
    if (!result.ok) {
      return err(result.error);
    }

    return ok(result.value.stdout);
  }

  public async startSetupTokenLogin(): Promise<Result<GatewayRuntimeSetupTokenLogin>> {
    const flowDir = `/tmp/opzava-st-${randomUUID()}`;
    const logPath = `${flowDir}/setup.log`;
    const stdinPath = `${flowDir}/stdin`;
    const controlPath = flowControlPath(logPath);
    const shellCommand = [
      "set -eu",
      `mkdir -m 700 ${shellQuote(flowDir)}`,
      `mkfifo -m 600 ${shellQuote(stdinPath)}`,
      `umask 077; : > ${shellQuote(logPath)}`,
      sessionWrappedCommand(
        controlPath,
        `exec 3<>${shellQuote(stdinPath)}; /usr/bin/script -qfc ${shellQuote(
          ptySized("claude setup-token"),
        )} /dev/null <&3 >> ${shellQuote(logPath)} 2>&1`,
      ),
    ].join("; ");
    const containerId = await this.resolveContainerId();
    if (!containerId.ok) {
      return err(containerId.error);
    }

    const created = await this.dockerRequest<{ readonly Id?: unknown }>(
      `/containers/${encodeURIComponent(containerId.value)}/exec`,
      {
        method: "POST",
        body: {
          AttachStdout: false,
          AttachStderr: false,
          Tty: false,
          Cmd: ["sh", "-lc", shellCommand],
        },
      },
    );
    if (!created.ok) {
      return err(created.error);
    }

    const execId = stringValue(created.value["Id"]);
    if (execId === null) {
      return err(
        provisioningError(
          "provisioning.docker.execCreateInvalid",
          "Docker exec create did not return an exec id.",
        ),
      );
    }

    const started = await this.dockerRawRequest(`/exec/${encodeURIComponent(execId)}/start`, {
      method: "POST",
      body: {
        Detach: true,
        Tty: false,
      },
    });
    if (!started.ok) {
      return this.recoverAfterFlowStartFailure(execId, logPath, started.error);
    }

    const controlPid = await this.waitForFlowControlPid(logPath);
    if (!controlPid.ok) {
      return this.cleanupAfterFlowReadinessFailure(execId, logPath, controlPid.error);
    }

    return ok({ execId, logPath, stdinPath });
  }

  public async writeSetupTokenInput(stdinPath: string, value: string): Promise<Result<void>> {
    const containerId = await this.resolveContainerId();
    if (!containerId.ok) {
      return err(containerId.error);
    }
    const created = await this.dockerRequest<{ readonly Id?: unknown }>(
      `/containers/${encodeURIComponent(containerId.value)}/exec`,
      {
        method: "POST",
        body: {
          AttachStdout: false,
          AttachStderr: false,
          Tty: false,
          Env: [`OPZAVA_INPUT=${value}`],
          Cmd: [
            "sh",
            "-c",
            // The code is passed via exec env for a short-lived write; docker exec inspect can see
            // it during that window, but the socket proxy is admin-only and the code is one-use.
            // Write the code, pause, THEN CR. claude's masked "Paste code" reader echoes each char
            // before it honors Enter; a single burst of code+CR loses the CR for longer codes (the
            // chars are still echoing when Enter arrives) and the flow hangs. Pacing the CR after the
            // echo settles makes codes of any length submit reliably. CR (\r) is the Enter byte.
            `{ printf "%s" "$OPZAVA_INPUT"; sleep 1; printf "\\r"; } > ${shellQuote(stdinPath)}`,
          ],
        },
      },
    );
    if (!created.ok) {
      return err(created.error);
    }
    const execId = stringValue(created.value["Id"]);
    if (execId === null) {
      return err(
        provisioningError(
          "provisioning.docker.execCreateInvalid",
          "Docker exec create did not return an exec id.",
        ),
      );
    }
    const started = await this.dockerRawRequest(`/exec/${encodeURIComponent(execId)}/start`, {
      method: "POST",
      body: { Detach: true, Tty: false },
    });
    return started.ok ? ok(undefined) : err(started.error);
  }

  private async waitForFlowControlPid(logPath: string): Promise<Result<number>> {
    const controlPath = flowControlPath(logPath);
    const attempts = Math.ceil(flowControlReadyTimeoutMs / 100);
    const result = await this.exec(
      [
        "sh",
        "-lc",
        [
          "set -u",
          "attempt=0",
          `while [ "$attempt" -lt ${attempts} ]; do`,
          `if [ -s ${shellQuote(controlPath)} ]; then`,
          `pid=$(cat ${shellQuote(controlPath)})`,
          `case "$pid" in ''|*[!0-9]*) exit 2;; esac`,
          `if [ "$pid" -gt 0 ] 2>/dev/null; then printf '%s\\n' "$pid"; exit 0; fi`,
          "exit 2",
          "fi",
          "attempt=$((attempt + 1))",
          "sleep 0.1",
          "done",
          "exit 3",
        ].join("\n"),
      ],
      undefined,
      flowControlReadyTimeoutMs + 2_000,
    );
    if (!result.ok || result.value.exitCode !== 0) {
      return err(
        provisioningError(
          "provisioning.docker.flowControlUnavailable",
          "The provider authorization process did not publish a valid control pid in time.",
          { timeoutMs: flowControlReadyTimeoutMs },
        ),
      );
    }
    return this.validatedFlowControlPid(result.value.stdout);
  }

  private async readFlowControlPid(logPath: string): Promise<number> {
    const controlPath = flowControlPath(logPath);
    const result = await this.exec(["sh", "-lc", `cat ${shellQuote(controlPath)}`]);
    if (!result.ok) {
      throw result.error;
    }
    if (result.value.exitCode !== 0) {
      throw provisioningError(
        "provisioning.docker.flowControlUnavailable",
        "The provider authorization control pid could not be read.",
      );
    }
    const pid = this.validatedFlowControlPid(result.value.stdout);
    if (!pid.ok) {
      throw pid.error;
    }
    return pid.value;
  }

  private validatedFlowControlPid(value: string): Result<number> {
    const normalized = value.trim();
    if (!/^[1-9][0-9]*$/.test(normalized)) {
      return err(
        provisioningError(
          "provisioning.docker.flowControlInvalid",
          "The provider authorization control pid is invalid.",
        ),
      );
    }
    const pid = Number(normalized);
    if (!Number.isSafeInteger(pid) || pid <= 0 || pid > 2_147_483_647) {
      return err(
        provisioningError(
          "provisioning.docker.flowControlInvalid",
          "The provider authorization control pid is invalid.",
        ),
      );
    }
    return ok(pid);
  }

  private async cleanupInactiveFlowArtifacts(logPath: string): Promise<Result<void>> {
    const controlPath = flowControlPath(logPath);
    const flowDir = logPath.slice(0, logPath.lastIndexOf("/"));
    const command = [
      "set -eu",
      `if [ -d ${shellQuote(flowDir)} ]; then`,
      secureDeleteCommand(logPath),
      `rm -f ${shellQuote(controlPath)} ${shellQuote(`${controlPath}.tmp`)} ${shellQuote(`${flowDir}/stdin`)}`,
      `rmdir ${shellQuote(flowDir)}`,
      "fi",
    ].join("\n");
    const removed = await this.exec(["sh", "-lc", command]);
    if (!removed.ok) return err(removed.error);
    if (removed.value.exitCode !== 0) {
      return err(
        provisioningError(
          "provisioning.docker.flowArtifactCleanupFailed",
          "Could not remove provider authorization artifacts after startup failed.",
          { exitCode: removed.value.exitCode },
        ),
      );
    }
    return ok(undefined);
  }

  private async cleanupAfterFlowReadinessFailure(
    execId: string,
    logPath: string,
    readinessError: DomainError,
  ): Promise<Result<never>> {
    const inspected = await this.dockerRequest<{ readonly Running?: unknown }>(
      `/exec/${encodeURIComponent(execId)}/json`,
      { method: "GET" },
    );
    if (!inspected.ok) return err(inspected.error);
    if (inspected.value.Running === true) {
      return err(
        provisioningError(
          "provisioning.docker.flowControlUnavailableRunning",
          "The provider authorization process is running without a trusted control pid; manual container intervention is required.",
          { execId, originalCode: readinessError.code },
        ),
      );
    }
    const cleanup = await this.cleanupInactiveFlowArtifacts(logPath);
    return cleanup.ok ? err(readinessError) : err(cleanup.error);
  }

  private async recoverAfterFlowStartFailure(
    execId: string,
    logPath: string,
    startError: DomainError,
  ): Promise<Result<never>> {
    const inspected = await this.dockerRequest<{ readonly Running?: unknown }>(
      `/exec/${encodeURIComponent(execId)}/json`,
      { method: "GET" },
    );
    if (!inspected.ok || typeof inspected.value.Running !== "boolean") {
      return err(
        provisioningError(
          "provisioning.docker.flowStartStateUnknown",
          "Docker did not confirm whether the provider authorization process started; artifacts were retained for manual intervention.",
        ),
      );
    }
    if (inspected.value.Running === false) {
      const cleanup = await this.cleanupInactiveFlowArtifacts(logPath);
      return cleanup.ok ? err(startError) : err(cleanup.error);
    }

    const controlPid = await this.waitForFlowControlPid(logPath);
    if (!controlPid.ok) {
      return err(
        provisioningError(
          "provisioning.docker.flowStartRecoveryRequired",
          "Docker may have started provider authorization without a trusted control pid; artifacts were retained for manual intervention.",
        ),
      );
    }
    try {
      await this.stopDeviceCodeLogin(execId, logPath);
      return err(startError);
    } catch {
      return err(
        provisioningError(
          "provisioning.docker.flowStartRecoveryRequired",
          "Docker may have started provider authorization and verified cleanup did not complete; retained artifacts require manual intervention.",
        ),
      );
    }
  }

  public async stopDeviceCodeLogin(execId: string, logPath: string): Promise<void> {
    const controlPid = await this.readFlowControlPid(logPath);
    const initial = await this.dockerRequest<{
      readonly Running?: unknown;
    }>(`/exec/${encodeURIComponent(execId)}/json`, { method: "GET" });
    if (!initial.ok) {
      throw initial.error;
    }
    if (initial.value.Running === true) {
      const flowDir = logPath.slice(0, logPath.lastIndexOf("/"));
      const killed = await this.exec([
        "sh",
        "-lc",
        [
          "set -u",
          `pid=${controlPid}`,
          `expected_dir=${shellQuote(flowDir)}`,
          `if kill -0 "$pid" 2>/dev/null; then`,
          `identity=$(ps -o pgid= -o sid= -p "$pid" 2>/dev/null) || identity=""`,
          `set -- $identity`,
          `if [ "\${1:-}" = "$pid" ] && [ "\${2:-}" = "$pid" ]; then`,
          `cmdline=$(tr '\\000' ' ' < "/proc/$pid/cmdline" 2>/dev/null) || cmdline=""`,
          `case "$cmdline" in *"$expected_dir"*) kill -TERM -"$pid" 2>/dev/null || true;; esac`,
          "fi",
          "fi",
        ].join("\n"),
      ]);
      if (!killed.ok) {
        throw killed.error;
      }
      if (killed.value.exitCode !== 0) {
        throw provisioningError(
          "provisioning.docker.deviceCodeStopKillFailed",
          "Could not stop the device-code login process.",
          { exitCode: killed.value.exitCode },
        );
      }
    }

    const deadline = Date.now() + deviceCodeStopInspectTimeoutMs;
    while (true) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        throw provisioningError(
          "provisioning.docker.deviceCodeStopTimeout",
          "Docker did not confirm that the device-code login stopped in time.",
          { timeoutMs: deviceCodeStopInspectTimeoutMs },
        );
      }
      const inspected = await this.dockerRequest<{ readonly Running?: unknown }>(
        `/exec/${encodeURIComponent(execId)}/json`,
        { method: "GET", timeoutMs: remainingMs },
      );
      if (!inspected.ok) {
        throw inspected.error;
      }
      if (inspected.value.Running === false) {
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, deviceCodeStopInspectPollMs));
    }

    const deleted = await this.exec(["sh", "-lc", secureDeleteFlowArtifactsCommand(logPath)]);
    if (!deleted.ok) {
      throw deleted.error;
    }
    if (deleted.value.exitCode !== 0) {
      throw provisioningError(
        "provisioning.docker.deviceCodeLogDeleteFailed",
        "Could not securely delete the device-code login log.",
        { exitCode: deleted.value.exitCode },
      );
    }
  }

  public async stopSetupTokenLogin(execId: string, logPath: string): Promise<void> {
    await this.stopDeviceCodeLogin(execId, logPath);
  }

  private async exec(
    cmd: readonly string[],
    env?: readonly string[],
    timeoutMs?: number,
  ): Promise<Result<GatewayRuntimeCommandResult>> {
    const containerId = await this.resolveContainerId();
    if (!containerId.ok) {
      return err(containerId.error);
    }

    const created = await this.dockerRequest<{ readonly Id?: unknown }>(
      `/containers/${encodeURIComponent(containerId.value)}/exec`,
      {
        method: "POST",
        body: {
          AttachStdout: true,
          AttachStderr: true,
          Tty: false,
          Cmd: cmd,
          ...(env === undefined ? {} : { Env: env }),
        },
      },
    );
    if (!created.ok) {
      return err(created.error);
    }

    const execId = stringValue(created.value["Id"]);
    if (execId === null) {
      return err(
        provisioningError(
          "provisioning.docker.execCreateInvalid",
          "Docker exec create did not return an exec id.",
        ),
      );
    }

    const started = await this.dockerRawRequest(`/exec/${encodeURIComponent(execId)}/start`, {
      method: "POST",
      body: {
        Detach: false,
        Tty: false,
      },
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    });
    if (!started.ok) {
      return err(started.error);
    }

    const inspected = await this.dockerRequest<{ readonly ExitCode?: unknown }>(
      `/exec/${encodeURIComponent(execId)}/json`,
      { method: "GET" },
    );
    if (!inspected.ok) {
      return err(inspected.error);
    }

    const output = dockerMultiplexedOutput(started.value);
    const exitCode = inspected.value.ExitCode;
    return ok({
      exitCode: typeof exitCode === "number" && Number.isFinite(exitCode) ? exitCode : 1,
      stdout: output.stdout,
      stderr: output.stderr,
    });
  }

  private async resolveContainerId(): Promise<Result<string>> {
    if (this.options.containerName !== undefined && this.options.containerName !== "") {
      return ok(this.options.containerName);
    }

    const filters = encodeURIComponent(
      JSON.stringify({ label: ["com.docker.compose.service=openclaw-platform-gateway"] }),
    );
    const containers = await this.dockerRequest<readonly { readonly Id?: unknown }[]>(
      `/containers/json?filters=${filters}`,
      { method: "GET" },
    );
    if (!containers.ok) {
      return err(containers.error);
    }

    const id = containers.value
      .map((container) => stringValue(container.Id))
      .find((value): value is string => value !== null);
    if (id === undefined) {
      return err(
        provisioningError(
          "provisioning.docker.gatewayContainerNotFound",
          "Could not find the openclaw-platform-gateway container through docker-socket-proxy.",
        ),
      );
    }

    return ok(id);
  }

  private async dockerRequest<T>(
    path: string,
    init: { readonly method: "GET" | "POST"; readonly body?: unknown; readonly timeoutMs?: number },
  ): Promise<Result<T>> {
    const response = await this.dockerTextRequest(path, init);
    if (!response.ok) {
      return err(response.error);
    }

    try {
      return ok(JSON.parse(response.value) as T);
    } catch (error) {
      return err(
        provisioningError("provisioning.docker.invalidJson", "Docker API returned invalid JSON.", {
          error: String(error),
        }),
      );
    }
  }

  private async dockerRawRequest(
    path: string,
    init: { readonly method: "GET" | "POST"; readonly body?: unknown; readonly timeoutMs?: number },
  ): Promise<Result<Buffer>> {
    return this.dockerConsume(path, init, async (response) =>
      Buffer.from(await response.arrayBuffer()),
    );
  }

  private async dockerTextRequest(
    path: string,
    init: { readonly method: "GET" | "POST"; readonly body?: unknown; readonly timeoutMs?: number },
  ): Promise<Result<string>> {
    return this.dockerConsume(path, init, async (response) => response.text());
  }

  private async dockerConsume<T>(
    path: string,
    init: { readonly method: "GET" | "POST"; readonly body?: unknown; readonly timeoutMs?: number },
    consume: (response: Response) => Promise<T>,
  ): Promise<Result<T>> {
    if (!this.baseUrlResult.ok) {
      return err(this.baseUrlResult.error);
    }

    const requestTimeoutMs = init.timeoutMs ?? dockerRequestTimeoutMs;
    const controller = new AbortController();
    let didTimeout = false;
    const timeout = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, requestTimeoutMs);
    try {
      const requestInit: RequestInit = {
        method: init.method,
        signal: controller.signal,
        ...(init.body === undefined
          ? {}
          : {
              headers: { "content-type": "application/json" },
              body: JSON.stringify(init.body),
            }),
      };
      const response = await (this.options.fetch ?? fetch)(
        `${this.baseUrlResult.value}${path}`,
        requestInit,
      );
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return err(
          provisioningError(
            "provisioning.docker.requestRejected",
            `Docker API request failed with HTTP ${response.status}.`,
            { bodyLength: body.length },
          ),
        );
      }

      return ok(await consume(response));
    } catch (error) {
      const code = didTimeout
        ? "provisioning.docker.requestTimeout"
        : "provisioning.docker.requestFailed";
      const message = didTimeout ? "Docker API request timed out." : "Docker API request failed.";
      return err(
        provisioningError(code, message, {
          error: String(error),
          timeoutMs: requestTimeoutMs,
        }),
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
