import { randomUUID } from "node:crypto";

import {
  type GatewayRuntimeAgentCredential,
  type GatewayRuntimeAgentProviderQuery,
  type GatewayRuntimeAuthChoice,
  type GatewayRuntimeCommandResult,
  type GatewayRuntimeDeviceCodeLogin,
  type GatewayRuntimePort,
  type GatewayRuntimeSetupTokenLogin,
} from "@opzava/ports";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

type Fetch = typeof fetch;

const dockerRequestTimeoutMs = 15_000;

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
    `if command -v shred >/dev/null 2>&1; then shred -u ${quotedLogPath};`,
    "else",
    `size=$(wc -c < ${quotedLogPath} 2>/dev/null || echo 0);`,
    `if [ "$size" -gt 0 ] 2>/dev/null; then dd if=/dev/zero of=${quotedLogPath} bs=4096 count=$(( (size + 4095) / 4096 )) conv=notrunc status=none 2>/dev/null || true; fi;`,
    `rm -f ${quotedLogPath};`,
    "fi;",
    "fi;",
    `rmdir "$(dirname ${quotedLogPath})" 2>/dev/null || true`,
  ].join(" ");
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

  public async connectApiKey(input: {
    readonly providerId: string;
    readonly authChoiceId: string;
    readonly keyFlag: string;
    readonly apiKey: string;
  }): Promise<Result<GatewayRuntimeCommandResult>> {
    console.log(
      `provisioning-worker running gateway onboard for provider ${input.providerId} authChoice ${input.authChoiceId}`,
    );
    const providerArgs = input.keyFlag === "token" ? ["--token-provider", input.providerId] : [];
    return this.exec([
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
      `--${input.keyFlag}`,
      input.apiKey,
      "--json",
    ]);
  }

  public async writeAgentCredential(
    input: GatewayRuntimeAgentCredential,
  ): Promise<Result<GatewayRuntimeCommandResult>> {
    console.log(
      `provisioning-worker storing ${input.providerId} credential in the ${input.agentId} auth store`,
    );
    // `paste-token`/`paste-api-key` read the secret from stdin when stdin is not a TTY, so the
    // credential travels through the exec environment and a pipe instead of argv, where it would
    // be readable in the container's process list for the life of the command.
    const subcommand = input.keyFlag === "token" ? "paste-token" : "paste-api-key";
    const script = [
      `printf '%s' "$OPZAVA_CREDENTIAL"`,
      "|",
      "node openclaw.mjs models auth",
      `--agent ${shellQuote(input.agentId)}`,
      subcommand,
      `--provider ${shellQuote(input.providerId)}`,
    ].join(" ");
    return this.exec(["sh", "-lc", script], [`OPZAVA_CREDENTIAL=${input.apiKey}`]);
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
      `/usr/bin/script -qfc ${shellQuote(ptySized(command))} /dev/null | ${redactor} >> ${shellQuote(logPath)}`,
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
      await this.stopDeviceCodeLogin(execId, logPath);
      return err(started.error);
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
    const shellCommand = [
      "set -eu",
      `mkdir -m 700 ${shellQuote(flowDir)}`,
      `mkfifo -m 600 ${shellQuote(stdinPath)}`,
      `umask 077; : > ${shellQuote(logPath)}`,
      `exec 3<>${shellQuote(stdinPath)}; /usr/bin/script -qfc ${shellQuote(
        ptySized("claude setup-token"),
      )} /dev/null <&3 >> ${shellQuote(logPath)} 2>&1`,
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
      await this.stopSetupTokenLogin(execId, logPath);
      return err(started.error);
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

  public async stopDeviceCodeLogin(execId: string, logPath: string): Promise<void> {
    const inspected = await this.dockerRequest<{
      readonly Pid?: unknown;
      readonly Running?: unknown;
    }>(`/exec/${encodeURIComponent(execId)}/json`, { method: "GET" });
    const pid =
      inspected.ok && typeof inspected.value.Pid === "number" ? inspected.value.Pid : null;
    if (pid !== null && pid > 0 && inspected.ok && inspected.value.Running === true) {
      await this.exec([
        "sh",
        "-lc",
        `kill -TERM -${pid} 2>/dev/null || kill -TERM ${pid} 2>/dev/null || true`,
      ]).catch(() => undefined);
    }
    await this.exec(["sh", "-lc", secureDeleteCommand(logPath)]).catch(() => undefined);
  }

  public async stopSetupTokenLogin(execId: string, logPath: string): Promise<void> {
    await this.stopDeviceCodeLogin(execId, logPath);
    await this.exec(["sh", "-lc", `rm -rf "$(dirname ${shellQuote(logPath)})"`]).catch(
      () => undefined,
    );
  }

  private async exec(
    cmd: readonly string[],
    env?: readonly string[],
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
    init: { readonly method: "GET" | "POST"; readonly body?: unknown },
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
    init: { readonly method: "GET" | "POST"; readonly body?: unknown },
  ): Promise<Result<Buffer>> {
    return this.dockerConsume(path, init, async (response) =>
      Buffer.from(await response.arrayBuffer()),
    );
  }

  private async dockerTextRequest(
    path: string,
    init: { readonly method: "GET" | "POST"; readonly body?: unknown },
  ): Promise<Result<string>> {
    return this.dockerConsume(path, init, async (response) => response.text());
  }

  private async dockerConsume<T>(
    path: string,
    init: { readonly method: "GET" | "POST"; readonly body?: unknown },
    consume: (response: Response) => Promise<T>,
  ): Promise<Result<T>> {
    if (!this.baseUrlResult.ok) {
      return err(this.baseUrlResult.error);
    }

    const controller = new AbortController();
    let didTimeout = false;
    const timeout = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, dockerRequestTimeoutMs);
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
          timeoutMs: dockerRequestTimeoutMs,
        }),
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
