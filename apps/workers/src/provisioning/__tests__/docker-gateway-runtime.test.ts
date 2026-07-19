import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  type DockerExecStdinConnection,
  DockerOpenClawGatewayRuntime,
  modelCanaryScript,
} from "../docker-gateway-runtime.js";

/**
 * The auth probe is the guard that stops Opzava storing a provider credential it never proved works
 * (#183). Everything it decides comes out of ONE payload — `models status --json --probe` — so these
 * exercise the real adapter against the real payload shape rather than a stand-in. The service-level
 * tests fake `probeProviderAuth` wholesale and cannot see a parsing regression at all.
 */

/** Docker multiplexes exec output into 8-byte-headed frames. */
function dockerOutputFrame(stream: 1 | 2, output: string): Buffer {
  const payload = Buffer.from(output, "utf8");
  const header = Buffer.alloc(8);
  header[0] = stream;
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

function dockerStdoutFrame(stdout: string): Buffer {
  return dockerOutputFrame(1, stdout);
}

interface DockerExec {
  readonly cmd: string[];
  readonly env?: string[];
  readonly attachStdin: boolean;
}

interface DockerExecCreateBody {
  readonly AttachStdin?: boolean;
  readonly AttachStdout?: boolean;
  readonly AttachStderr?: boolean;
  readonly Tty?: boolean;
  readonly Cmd?: string[];
  readonly Env?: string[];
}

interface FakeDocker {
  readonly runtime: DockerOpenClawGatewayRuntime;
  readonly commands: string[][];
  readonly execs: DockerExec[];
  readonly execCreateBodies: DockerExecCreateBody[];
  readonly stdinWrites: Buffer[];
  readonly stdinInspectCount: () => number;
  readonly stdinDestroyCount: () => number;
}

function fakeDocker(input: {
  /** A function answers per command, for flows that exec more than once (onboard reads `--help` first). */
  readonly stdout: string | ((cmd: readonly string[]) => string);
  readonly exitCode?: number;
  readonly startStatus?: number;
  readonly stdinStatusCode?: number;
  readonly stdinHead?: Buffer;
  readonly stdinChunks?: readonly Buffer[];
  readonly stdinTransportError?: Error;
  readonly stdinStreamError?: Error;
  readonly stdinNeverEnds?: boolean;
  readonly stdinInspectStates?: readonly {
    readonly Running: boolean;
    readonly ExitCode?: number;
  }[];
}): FakeDocker {
  const commands: string[][] = [];
  const execs: DockerExec[] = [];
  const execCreateBodies: DockerExecCreateBody[] = [];
  const stdinWrites: Buffer[] = [];
  let stdinInspectCount = 0;
  let stdinDestroyCount = 0;
  const stdoutFor = (cmd: readonly string[]): string =>
    typeof input.stdout === "function" ? input.stdout(cmd) : input.stdout;
  const fetchImpl = (async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/exec")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as DockerExecCreateBody;
      execCreateBodies.push(body);
      commands.push(body.Cmd ?? []);
      execs.push({
        cmd: body.Cmd ?? [],
        ...(body.Env === undefined ? {} : { env: body.Env }),
        attachStdin: body.AttachStdin === true,
      });
      return new Response(JSON.stringify({ Id: `exec-${execs.length}` }), { status: 200 });
    }
    if (path.endsWith("/start")) {
      const current = execs.at(-1)?.cmd ?? [];
      return new Response(dockerStdoutFrame(stdoutFor(current)), {
        status: input.startStatus ?? 200,
      });
    }
    if (path.endsWith("/json")) {
      const execNumber = Number(path.match(/\/exec-(\d+)\/json$/)?.[1]);
      const isStdinExec = execs[execNumber - 1]?.attachStdin === true;
      if (isStdinExec && input.stdinInspectStates !== undefined) {
        const state =
          input.stdinInspectStates[
            Math.min(stdinInspectCount, input.stdinInspectStates.length - 1)
          ];
        stdinInspectCount += 1;
        return new Response(JSON.stringify(state), { status: 200 });
      }
      return new Response(JSON.stringify({ Running: false, ExitCode: input.exitCode ?? 0 }), {
        status: 200,
      });
    }
    throw new Error(`unexpected docker path ${path}`);
  }) as unknown as typeof fetch;

  const execStdinTransport = async (): Promise<DockerExecStdinConnection> => {
    if (input.stdinTransportError !== undefined) {
      throw input.stdinTransportError;
    }
    const current = execs.at(-1)?.cmd ?? [];
    const chunks = input.stdinChunks ?? [dockerStdoutFrame(stdoutFor(current))];
    return {
      statusCode: input.stdinStatusCode ?? 101,
      head: input.stdinHead ?? Buffer.alloc(0),
      output: (async function* () {
        for (const chunk of chunks) {
          yield chunk;
        }
        if (input.stdinStreamError !== undefined) {
          throw input.stdinStreamError;
        }
        if (input.stdinNeverEnds === true) {
          await new Promise<void>(() => undefined);
        }
      })(),
      end: (stdin) => stdinWrites.push(Buffer.from(stdin)),
      destroy: () => {
        stdinDestroyCount += 1;
      },
    };
  };

  return {
    runtime: new DockerOpenClawGatewayRuntime({
      dockerHost: "tcp://docker-socket-proxy:2375",
      containerName: "openclaw-platform-gateway",
      fetch: fetchImpl,
      execStdinTransport,
    }),
    commands,
    execs,
    execCreateBodies,
    stdinWrites,
    stdinInspectCount: () => stdinInspectCount,
    stdinDestroyCount: () => stdinDestroyCount,
  };
}

function pluginDiscoveryStdout(input: {
  readonly plugins: unknown;
  readonly catalogs?: readonly { readonly path: string; readonly body: string }[];
}): string {
  const pluginJson = JSON.stringify(input.plugins);
  return [
    "OPZAVA_PLUGIN_DISCOVERY_V1\n",
    `P ${Buffer.byteLength(pluginJson, "utf8")}\n`,
    pluginJson,
    ...(input.catalogs ?? []).flatMap(({ path, body }) => [
      `C ${Buffer.byteLength(path, "utf8")} ${Buffer.byteLength(body, "utf8")}\n`,
      path,
      body,
    ]),
    "E\n",
  ].join("");
}

function generatedCatalog(providers: Record<string, unknown>): string {
  return JSON.stringify({
    generatedBy: "openclaw-plugin-model-catalog-v1",
    providers,
  });
}

type ModelCanaryScenario =
  | "setupRequestBadRequest"
  | "setupNotificationBadRequest"
  | "setupMalformedThreadResponse"
  | "baselineTurnBadRequest"
  | "turnCompleted"
  | "turnModelBadRequest"
  | "turnUnrelatedNestedBadRequest";

const targetCanaryModel = "openai/gpt-5.6-sol";
const baselineCanaryModel = "openai/gpt-5.5-codex";

async function runModelCanaryScript(scenario: ModelCanaryScenario, model: string): Promise<{
  readonly stdout: string;
  readonly exitCode: number;
}> {
  const directory = await mkdtemp(join(tmpdir(), "opzava-model-canary-test-"));
  const scriptPath = join(directory, "canary.mjs");
  const clientPath = join(directory, "shared-client.mjs");
  try {
    await writeFile(scriptPath, modelCanaryScript, "utf8");
    await writeFile(
      clientPath,
      `
const scenario = ${JSON.stringify(scenario)};

export async function createIsolatedCodexAppServerClient() {
  let notificationHandler;
  return {
    addNotificationHandler(handler) { notificationHandler = handler; },
    addRequestHandler() {},
    async request(method, params) {
      if (method === "thread/start") {
        if (scenario === "setupRequestBadRequest") {
          throw { data: { status: 400, error: { type: "invalid_request_error" } } };
        }
        if (scenario === "setupNotificationBadRequest") {
          notificationHandler?.({
            method: "error",
            params: {
              error: { codexErrorInfo: "badRequest" },
              willRetry: false,
            },
          });
        }
        if (scenario === "setupMalformedThreadResponse") return { thread: {} };
        return { thread: { id: "thread-canary" } };
      }
      if (method === "turn/start") {
        const turn = {
          id: "turn-canary",
          threadId: "thread-canary",
          status: "failed",
          items: [],
        };
        if (
          scenario === "baselineTurnBadRequest" ||
          (scenario === "turnModelBadRequest" && params.model === ${JSON.stringify(targetCanaryModel)}) ||
          scenario === "setupMalformedThreadResponse"
        ) {
          return { turn: { ...turn, error: { codexErrorInfo: "badRequest" } } };
        }
        if (scenario === "turnUnrelatedNestedBadRequest") {
          return { turn: { ...turn, metadata: { codexErrorInfo: "badRequest" } } };
        }
        if (scenario === "turnModelBadRequest" || scenario === "turnCompleted") {
          return { turn: { ...turn, status: "completed" } };
        }
        return { turn };
      }
      throw new Error(\`unexpected method \${method}\`);
    },
    async closeAndWait() {},
  };
}
`,
      "utf8",
    );

    return await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          scriptPath,
          clientPath,
          "/agent",
          "openai",
          model,
          join(directory, "codex-home"),
          join(directory, "home"),
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.once("error", reject);
      child.once("close", (code) => {
        if (code === null) {
          reject(new Error(`model canary exited without a status: ${Buffer.concat(stderr)}`));
          return;
        }
        resolve({ stdout: Buffer.concat(stdout).toString("utf8"), exitCode: code });
      });
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function modelCanaryVerdictForScenario(
  scenario: ModelCanaryScenario,
  baselineModel?: string,
): Promise<string> {
  const targetCanary = await runModelCanaryScript(scenario, targetCanaryModel);
  const baselineCanary =
    baselineModel === undefined ? null : await runModelCanaryScript(scenario, baselineModel);
  const docker = fakeDocker({
    stdout: (cmd) =>
      baselineModel !== undefined && cmd.join("\n").includes(baselineModel)
        ? (baselineCanary?.stdout ?? "")
        : targetCanary.stdout,
  });

  const probe = await docker.runtime.probeModelRunnable({
    agentId: "ask-admin-opzava",
    providerId: "openai",
    model: targetCanaryModel,
    ...(baselineModel === undefined ? {} : { baselineModel }),
  });

  if (!probe.ok) throw probe.error;
  return probe.value.verdict;
}

describe("DockerOpenClawGatewayRuntime model canary (#251)", () => {
  it("leaves a thread/start badRequest unproven because setup never reached the model", async () => {
    await expect(modelCanaryVerdictForScenario("setupRequestBadRequest")).resolves.toBe("unproven");
  });

  it("leaves an unscoped badRequest notification during setup unproven", async () => {
    await expect(modelCanaryVerdictForScenario("setupNotificationBadRequest")).resolves.toBe(
      "unproven",
    );
  });

  it("does not enter the turn phase from a malformed thread/start response", async () => {
    await expect(modelCanaryVerdictForScenario("setupMalformedThreadResponse")).resolves.toBe(
      "unproven",
    );
  });

  it("leaves a target model badRequest unproven without a known-good baseline", async () => {
    await expect(modelCanaryVerdictForScenario("turnModelBadRequest")).resolves.toBe("unproven");
  });

  it("classifies a target model badRequest as unrunnable after the baseline succeeds", async () => {
    await expect(
      modelCanaryVerdictForScenario("turnModelBadRequest", baselineCanaryModel),
    ).resolves.toBe("unrunnable");
  });

  it("leaves a target model unproven when the baseline turn/start also badRequests", async () => {
    await expect(
      modelCanaryVerdictForScenario("baselineTurnBadRequest", baselineCanaryModel),
    ).resolves.toBe("unproven");
  });

  it("classifies the target as runnable when the baseline and target both succeed", async () => {
    await expect(
      modelCanaryVerdictForScenario("turnCompleted", baselineCanaryModel),
    ).resolves.toBe("runnable");
  });

  it("does not search arbitrary nested turn metadata for badRequest", async () => {
    await expect(modelCanaryVerdictForScenario("turnUnrelatedNestedBadRequest")).resolves.toBe(
      "unproven",
    );
  });
});

describe("DockerOpenClawGatewayRuntime plugin model discovery (#184)", () => {
  it("reads enabled plugins and parses multiple generated catalogs in one exec", async () => {
    const docker = fakeDocker({
      stdout: pluginDiscoveryStdout({
        plugins: {
          plugins: [
            { id: "opencode-go", enabled: true, status: "loaded" },
            { id: "disabled-bundle", enabled: false, status: "disabled" },
          ],
        },
        catalogs: [
          {
            path: "/home/node/.openclaw/agents/ask-admin-opzava/agent/plugins/opencode-go/catalog.json",
            body: generatedCatalog({
              "opencode-go": {
                baseUrl: "https://opencode.ai/zen/v1",
                api: "openai-completions",
                models: [{ id: "kimi-k2.6", name: "Kimi K2.6", contextWindow: 262_144 }],
              },
            }),
          },
          {
            path: "/home/node/.openclaw/agents/ask-admin-opzava/agent/plugins/disabled-bundle/catalog.json",
            body: generatedCatalog({
              "disabled-bundle": { models: [{ id: "one" }] },
            }),
          },
        ],
      }),
    });

    const discovered = await docker.runtime.readPluginModelDiscovery();

    expect(discovered).toEqual({
      ok: true,
      value: {
        plugins: [
          { id: "opencode-go", enabled: true },
          { id: "disabled-bundle", enabled: false },
        ],
        catalogs: [
          {
            pluginId: "opencode-go",
            providers: {
              "opencode-go": {
                baseUrl: "https://opencode.ai/zen/v1",
                api: "openai-completions",
                models: [{ id: "kimi-k2.6", name: "Kimi K2.6", contextWindow: 262_144 }],
              },
            },
          },
          {
            pluginId: "disabled-bundle",
            providers: { "disabled-bundle": { models: [{ id: "one" }] } },
          },
        ],
      },
    });
    expect(docker.execs).toHaveLength(1);
    expect(docker.commands[0]?.slice(0, 2)).toEqual(["sh", "-lc"]);
    expect(docker.commands[0]?.[2]).toContain("node openclaw.mjs plugins list --json");
    expect(docker.commands[0]?.[2]).toContain(
      "'/home/node/.openclaw/agents/ask-admin-opzava/agent'/plugins/*/catalog.json",
    );
  });

  it("skips non-generated, malformed, invalid-path, and invalid-provider catalogs", async () => {
    const docker = fakeDocker({
      stdout: pluginDiscoveryStdout({
        plugins: { plugins: [] },
        catalogs: [
          {
            path: "/home/node/.openclaw/agents/ask-admin-opzava/agent/plugins/user-file/catalog.json",
            body: JSON.stringify({ generatedBy: "someone-else", providers: {} }),
          },
          {
            path: "/home/node/.openclaw/agents/ask-admin-opzava/agent/plugins/malformed/catalog.json",
            body: "{not json",
          },
          {
            path: "/home/node/.openclaw/agents/ask-admin-opzava/agent/plugins/bad%ZZ/catalog.json",
            body: generatedCatalog({ bad: { models: [{ id: "ignored" }] } }),
          },
          {
            path: "/home/node/.openclaw/agents/ask-admin-opzava/agent/plugins/invalid-provider/catalog.json",
            body: generatedCatalog({ invalid: { baseUrl: 42, models: [{ id: "ignored" }] } }),
          },
          {
            path: "/home/node/.openclaw/agents/ask-admin-opzava/agent/plugins/bundle%20provider/catalog.json",
            body: generatedCatalog({ bundle: { models: [{ id: "valid" }] } }),
          },
        ],
      }),
    });

    const discovered = await docker.runtime.readPluginModelDiscovery();

    expect(discovered.ok && discovered.value.catalogs).toEqual([
      {
        pluginId: "bundle provider",
        providers: { bundle: { models: [{ id: "valid" }] } },
      },
    ]);
  });

  it("returns an honest empty catalog list when the plugin directory is empty", async () => {
    const docker = fakeDocker({
      stdout: pluginDiscoveryStdout({ plugins: { plugins: [{ id: "core", enabled: true }] } }),
    });

    const read = await docker.runtime.readPluginModelDiscovery();

    expect(read.ok).toBe(true);
    expect(read.ok ? read.value.catalogs : null).toEqual([]);
  });

  it("returns a typed error when the discovery command exits non-zero", async () => {
    const docker = fakeDocker({ stdout: "plugin list failed", exitCode: 1 });

    const discovered = await docker.runtime.readPluginModelDiscovery();

    expect(discovered.ok).toBe(false);
    expect(!discovered.ok && discovered.error.code).toBe(
      "provisioning.connections.pluginModelDiscoveryFailed",
    );
  });

  it("returns a typed error when a successful exec emits a truncated framed document", async () => {
    const docker = fakeDocker({
      stdout: 'OPZAVA_PLUGIN_DISCOVERY_V1\nP 999\n{"plugins":[]}',
    });

    const discovered = await docker.runtime.readPluginModelDiscovery();

    expect(discovered.ok).toBe(false);
    expect(!discovered.ok && discovered.error.code).toBe(
      "provisioning.connections.pluginModelDiscoveryInvalidOutput",
    );
  });

  it("returns a typed error when a framed plugin-list payload is invalid JSON", async () => {
    const invalidPluginJson = "{not json";
    const docker = fakeDocker({
      stdout: [
        "OPZAVA_PLUGIN_DISCOVERY_V1\n",
        `P ${Buffer.byteLength(invalidPluginJson, "utf8")}\n`,
        invalidPluginJson,
        "E\n",
      ].join(""),
    });

    const discovered = await docker.runtime.readPluginModelDiscovery();

    expect(discovered.ok).toBe(false);
    expect(!discovered.ok && discovered.error.code).toBe(
      "provisioning.connections.pluginListInvalidJson",
    );
  });

  it("returns a typed error when Docker cannot start the discovery exec", async () => {
    const docker = fakeDocker({ stdout: "", startStatus: 500 });

    const discovered = await docker.runtime.readPluginModelDiscovery();

    expect(discovered.ok).toBe(false);
    expect(!discovered.ok && discovered.error.code).toBe("provisioning.docker.requestRejected");
  });

  it("returns a typed error instead of treating capped output as an empty catalog", async () => {
    const docker = fakeDocker({ stdout: "partial-frame", exitCode: 73 });

    const discovered = await docker.runtime.readPluginModelDiscovery();

    expect(discovered.ok).toBe(false);
    expect(!discovered.ok && discovered.error.code).toBe(
      "provisioning.connections.pluginModelDiscoveryOutputTooLarge",
    );
  });
});

function probePayload(results: readonly Record<string, unknown>[]): string {
  return JSON.stringify({
    configPath: "/config/openclaw.json",
    allowed: ["moonshot/kimi-k2"],
    auth: {
      providers: [],
      probes: { startedAt: 1, finishedAt: 2, durationMs: 1, totalTargets: results.length, results },
    },
  });
}

describe("DockerOpenClawGatewayRuntime auth probe (#183)", () => {
  it("rejects a credential the provider refused to authenticate", async () => {
    const docker = fakeDocker({
      stdout: probePayload([
        {
          provider: "moonshot",
          model: "moonshot/kimi-k2",
          profileId: "moonshot:manual",
          label: "API key",
          source: "profile",
          status: "auth",
          error: "401 Unauthorized: invalid api key",
        },
      ]),
    });

    const probe = await docker.runtime.probeProviderAuth({
      agentId: "main",
      providerId: "moonshot",
      profileId: "moonshot:manual",
    });

    expect(probe.ok && probe.value.verdict).toBe("rejected");
    expect(probe.ok && probe.value.reason).toContain("401 Unauthorized");
  });

  it("verifies a credential the provider accepted", async () => {
    const docker = fakeDocker({
      stdout: probePayload([
        {
          provider: "zai",
          profileId: "zai:manual",
          label: "API key",
          status: "ok",
          latencyMs: 412,
        },
      ]),
    });

    const probe = await docker.runtime.probeProviderAuth({
      agentId: "main",
      providerId: "zai",
      profileId: "zai:manual",
    });

    expect(probe.ok && probe.value.verdict).toBe("verified");
  });

  it.each([
    ["rate_limit", { status: "rate_limit", error: "429 Too Many Requests" }],
    ["timeout", { status: "timeout", error: "probe timed out" }],
    ["billing", { status: "billing", error: "payment required" }],
    ["unknown", { status: "unknown", error: "socket hang up" }],
    ["no_model", { status: "no_model", reasonCode: "no_model", error: "No model available" }],
  ])("leaves a credential UNPROVEN, never rejected, on a %s probe", async (_label, result) => {
    const docker = fakeDocker({
      stdout: probePayload([{ provider: "zai", profileId: "zai:manual", label: "k", ...result }]),
    });

    const probe = await docker.runtime.probeProviderAuth({
      agentId: "main",
      providerId: "zai",
      profileId: "zai:manual",
    });

    // Rejecting a VALID credential because the provider was rate-limited or down is the one
    // outcome #183 calls worse than the bug. Only an explicit auth failure may reject.
    expect(probe.ok && probe.value.verdict).toBe("unproven");
  });

  it("treats a probe with no target as unproven rather than verified", async () => {
    const docker = fakeDocker({ stdout: probePayload([]) });

    const probe = await docker.runtime.probeProviderAuth({
      agentId: "main",
      providerId: "zai",
      profileId: "zai:manual",
    });

    expect(probe.ok && probe.value.verdict).toBe("unproven");
  });

  // The regression that a green test suite would otherwise miss entirely: the probe summary lives
  // at `auth.probes`, and an earlier draft of this adapter read a top-level `probes`. That parses to
  // nothing on every real payload — so the guard would have answered "unproven" forever and quietly
  // let every bogus credential through, exactly like the bug it was written to fix.
  it("errors rather than passing when the probe summary is not where it belongs", async () => {
    const docker = fakeDocker({
      stdout: JSON.stringify({
        allowed: [],
        auth: { providers: [] },
        probes: { results: [{ provider: "zai", profileId: "zai:manual", status: "auth" }] },
      }),
    });

    const probe = await docker.runtime.probeProviderAuth({
      agentId: "main",
      providerId: "zai",
      profileId: "zai:manual",
    });

    expect(probe.ok).toBe(false);
    expect(!probe.ok && probe.error.code).toBe("provisioning.connections.authProbeUnavailable");
  });

  it("scopes the probe to the one profile the connect wrote", async () => {
    const docker = fakeDocker({ stdout: probePayload([]) });

    await docker.runtime.probeProviderAuth({
      agentId: "main",
      providerId: "openai",
      profileId: "openai:manual",
    });

    const command = docker.commands[0] ?? [];
    expect(command).toContain("--probe");
    expect(command.slice(command.indexOf("--agent"), command.indexOf("--agent") + 2)).toEqual([
      "--agent",
      "main",
    ]);
    expect(
      command.slice(command.indexOf("--probe-profile"), command.indexOf("--probe-profile") + 2),
    ).toEqual(["--probe-profile", "openai:manual"]);
  });
});

describe("DockerOpenClawGatewayRuntime credential write (#183, #191)", () => {
  // The gateway canonicalizes `codex` to `openai` on the way in. Probing the id we SENT would find
  // no such credential and prove nothing, so both ids are read back from what the gateway says it
  // actually stored.
  it("reads back the profile and provider the gateway really filed the credential under", async () => {
    const docker = fakeDocker({
      stdout: "Config updated.\nAuth profile: openai:manual (openai/api_key)\n",
    });

    const written = await docker.runtime.writeAgentCredential({
      agentId: "main",
      providerId: "codex",
      keyFlag: "openai-api-key",
      apiKey: "sk-secret",
    });

    expect(written.ok && written.value.profileId).toBe("openai:manual");
    expect(written.ok && written.value.providerId).toBe("openai");
  });

  it("reports no profile when the gateway does not name one", async () => {
    const docker = fakeDocker({ stdout: "Config updated.\n" });

    const written = await docker.runtime.writeAgentCredential({
      agentId: "main",
      providerId: "zai",
      keyFlag: "zai-api-key",
      apiKey: "sk-secret",
    });

    expect(written.ok && written.value.profileId).toBeNull();
    expect(written.ok && written.value.providerId).toBeNull();
  });

  // Both credential writers must hold this. `connectApiKey` exposed argv until #187; both writers
  // then exposed exec Env until #191 moved the credential onto the hijacked stdin stream.
  it("keeps the credential out of the write exec body and sends exact stdin bytes", async () => {
    const docker = fakeDocker({ stdout: "Auth profile: zai:manual (zai/api_key)\n" });

    await docker.runtime.writeAgentCredential({
      agentId: "main",
      providerId: "zai",
      keyFlag: "zai-api-key",
      apiKey: "sk-super-secret",
    });

    expect(docker.execCreateBodies).toEqual([
      {
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
        Cmd: [
          "node",
          "openclaw.mjs",
          "models",
          "auth",
          "--agent",
          "main",
          "paste-api-key",
          "--provider",
          "zai",
        ],
      },
    ]);
    expect(JSON.stringify(docker.execCreateBodies)).not.toContain("sk-super-secret");
    expect(docker.stdinWrites).toEqual([Buffer.from("sk-super-secret")]);
  });

  it("keeps paste-token and its agent and provider flags as separate argv elements", async () => {
    const docker = fakeDocker({ stdout: "Auth profile: anthropic:manual (anthropic/token)\n" });

    await docker.runtime.writeAgentCredential({
      agentId: "ask-admin-opzava",
      providerId: "anthropic",
      keyFlag: "token",
      apiKey: "setup-token-secret",
    });

    expect(docker.execCreateBodies[0]?.Cmd).toEqual([
      "node",
      "openclaw.mjs",
      "models",
      "auth",
      "--agent",
      "ask-admin-opzava",
      "paste-token",
      "--provider",
      "anthropic",
    ]);
    expect(docker.stdinWrites).toEqual([Buffer.from("setup-token-secret")]);
  });

  it("fails closed without sending the credential when stdin start is not HTTP 101", async () => {
    const docker = fakeDocker({ stdout: "unused", stdinStatusCode: 200 });

    const written = await docker.runtime.writeAgentCredential({
      agentId: "main",
      providerId: "zai",
      keyFlag: "zai-api-key",
      apiKey: "sk-super-secret",
    });

    expect(written.ok).toBe(false);
    expect(!written.ok && written.error.code).toBe("provisioning.docker.execStdinUpgradeRejected");
    expect(docker.stdinWrites).toEqual([]);
  });

  it("fails closed when the hijacked stdin transport rejects", async () => {
    const docker = fakeDocker({
      stdout: "unused",
      stdinTransportError: new Error("proxy stripped the upgrade"),
    });

    const written = await docker.runtime.writeAgentCredential({
      agentId: "main",
      providerId: "zai",
      keyFlag: "zai-api-key",
      apiKey: "sk-super-secret",
    });

    expect(written.ok).toBe(false);
    expect(!written.ok && written.error.code).toBe("provisioning.docker.execStdinUpgradeFailed");
    expect(docker.stdinWrites).toEqual([]);
  });

  // By the time the stream fails, the credential is already in the transport's hands: the socket has
  // to be torn down (or the exec sits forever on a stdin that never gets its EOF), and the exception
  // text has to be scrubbed before it can ride a DomainError into a log.
  it("destroys the connection and redacts the credential when the stdin stream fails", async () => {
    const docker = fakeDocker({
      stdout: "unused",
      stdinStreamError: new Error("socket hang up while sending sk-super-secret"),
    });

    const written = await docker.runtime.writeAgentCredential({
      agentId: "main",
      providerId: "zai",
      keyFlag: "zai-api-key",
      apiKey: "sk-super-secret",
    });

    expect(written.ok).toBe(false);
    expect(!written.ok && written.error.code).toBe("provisioning.docker.execStdinStreamFailed");
    expect(docker.stdinDestroyCount()).toBe(1);
    expect(JSON.stringify(!written.ok && written.error)).not.toContain("sk-super-secret");
  });

  it("preserves output delivered in the HTTP upgrade head buffer", async () => {
    const docker = fakeDocker({
      stdout: "unused",
      stdinHead: dockerStdoutFrame("head output"),
      stdinChunks: [],
    });

    const written = await docker.runtime.writeAgentCredential({
      agentId: "main",
      providerId: "zai",
      keyFlag: "zai-api-key",
      apiKey: "secret",
    });

    expect(written.ok && written.value.stdout).toBe("head output");
  });

  it("demultiplexes a Docker frame whose header is split across chunks", async () => {
    const frame = dockerStdoutFrame("split header output");
    const docker = fakeDocker({
      stdout: "unused",
      stdinHead: frame.subarray(0, 3),
      stdinChunks: [frame.subarray(3, 6), frame.subarray(6, 11), frame.subarray(11)],
    });

    const written = await docker.runtime.writeAgentCredential({
      agentId: "main",
      providerId: "zai",
      keyFlag: "zai-api-key",
      apiKey: "secret",
    });

    expect(written.ok && written.value.stdout).toBe("split header output");
  });

  it("scrubs an echoed credential from demultiplexed stdout and stderr", async () => {
    const credential = "sk-echoed-secret";
    const docker = fakeDocker({
      stdout: "unused",
      stdinChunks: [
        dockerOutputFrame(1, `stdout ${credential}`),
        dockerOutputFrame(2, `stderr ${credential}`),
      ],
    });

    const written = await docker.runtime.writeAgentCredential({
      agentId: "main",
      providerId: "zai",
      keyFlag: "zai-api-key",
      apiKey: credential,
    });

    expect(written.ok && written.value.stdout).toBe("stdout [redacted]");
    expect(written.ok && written.value.stderr).toBe("stderr [redacted]");
    expect(JSON.stringify(written)).not.toContain(credential);
  });

  it("fails with bounded capture instead of retaining oversized exec output", async () => {
    const docker = fakeDocker({
      stdout: "unused",
      stdinChunks: [dockerStdoutFrame("x".repeat(2 * 1024 * 1024))],
    });

    const written = await docker.runtime.writeAgentCredential({
      agentId: "main",
      providerId: "zai",
      keyFlag: "zai-api-key",
      apiKey: "secret",
    });

    expect(written.ok).toBe(false);
    expect(!written.ok && written.error.code).toBe("provisioning.docker.execStdinOutputTooLarge");
  });

  it("destroys the stream and returns a timeout while the container process may still run", async () => {
    vi.useFakeTimers();
    try {
      const docker = fakeDocker({ stdout: "partial output", stdinNeverEnds: true });

      const writtenPromise = docker.runtime.writeAgentCredential({
        agentId: "main",
        providerId: "zai",
        keyFlag: "zai-api-key",
        apiKey: "secret",
      });
      await vi.runAllTimersAsync();
      const written = await writtenPromise;

      expect(written.ok).toBe(false);
      expect(!written.ok && written.error.code).toBe(
        "provisioning.docker.execStdinExecutionTimeout",
      );
      expect(docker.stdinDestroyCount()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("polls exec inspect until Docker publishes Running false", async () => {
    const docker = fakeDocker({
      stdout: "stored",
      stdinInspectStates: [
        { Running: true, ExitCode: 0 },
        { Running: false, ExitCode: 7 },
      ],
    });

    const written = await docker.runtime.writeAgentCredential({
      agentId: "main",
      providerId: "zai",
      keyFlag: "zai-api-key",
      apiKey: "secret",
    });

    expect(written.ok && written.value.exitCode).toBe(7);
    expect(docker.stdinInspectCount()).toBe(2);
  });
});

/** Help text for a gateway image whose onboard can read the credential from stdin. */
function onboardHelp(input: { readonly credentialStdin: boolean }): string {
  return [
    "Options:",
    "  --auth-choice <choice>   Auth: setup-token|zai-api-key",
    "  --zai-api-key <key>      Z.AI API key",
    "  --token <token>          Token value",
    ...(input.credentialStdin
      ? ["  --credential-stdin       Read the auth-choice credential from stdin"]
      : []),
  ].join("\n");
}

function onboardStdout(input: { readonly credentialStdin: boolean }) {
  return (cmd: readonly string[]): string =>
    cmd.includes("--help") ? onboardHelp(input) : "Config updated.\n";
}

describe("DockerOpenClawGatewayRuntime onboard connect (#187, #191)", () => {
  it("sends the credential only through attached stdin", async () => {
    const docker = fakeDocker({ stdout: onboardStdout({ credentialStdin: true }) });

    const connected = await docker.runtime.connectApiKey({
      providerId: "zai",
      authChoiceId: "zai-api-key",
      keyFlag: "zai-api-key",
      apiKey: "sk-super-secret",
    });

    expect(connected.ok).toBe(true);

    const onboard = docker.execs.at(-1);
    expect(docker.execCreateBodies.at(-1)).toEqual({
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      Cmd: [
        "node",
        "openclaw.mjs",
        "onboard",
        "--non-interactive",
        "--accept-risk",
        "--flow",
        "manual",
        "--auth-choice",
        "zai-api-key",
        "--credential-stdin",
        "--json",
      ],
    });
    expect(JSON.stringify(docker.execCreateBodies)).not.toContain("sk-super-secret");
    expect(onboard?.cmd).not.toContain("sh");
    expect(onboard?.cmd).not.toContain("printf");
    expect(docker.stdinWrites).toEqual([Buffer.from("sk-super-secret")]);
  });

  // The setup-token choice used to put the Anthropic token in argv behind `--token`. It now rides the
  // same pipe; only `--token-provider`, which names the provider, stays on the command line.
  it("pipes a setup-token too, and still names the token provider", async () => {
    const docker = fakeDocker({ stdout: onboardStdout({ credentialStdin: true }) });

    await docker.runtime.connectApiKey({
      providerId: "anthropic",
      authChoiceId: "setup-token",
      keyFlag: "token",
      apiKey: "sk-ant-oat01-secret",
    });

    const onboard = docker.execs.at(-1);
    expect(JSON.stringify(docker.execCreateBodies)).not.toContain("sk-ant-oat01-secret");
    expect(onboard?.cmd).toEqual([
      "node",
      "openclaw.mjs",
      "onboard",
      "--non-interactive",
      "--accept-risk",
      "--flow",
      "manual",
      "--auth-choice",
      "setup-token",
      "--token-provider",
      "anthropic",
      "--credential-stdin",
      "--json",
    ]);
    expect(onboard?.env).toBeUndefined();
    expect(docker.stdinWrites).toEqual([Buffer.from("sk-ant-oat01-secret")]);
  });

  // A gateway image built before --credential-stdin would reject the flag anyway — but only after
  // being handed the secret. Fail before that, and never fall back to argv.
  it("refuses to send the credential to a gateway image that cannot read it from stdin", async () => {
    const docker = fakeDocker({ stdout: onboardStdout({ credentialStdin: false }) });

    const connected = await docker.runtime.connectApiKey({
      providerId: "zai",
      authChoiceId: "zai-api-key",
      keyFlag: "zai-api-key",
      apiKey: "sk-super-secret",
    });

    expect(connected.ok).toBe(false);
    expect(!connected.ok && connected.error.code).toBe(
      "provisioning.connections.onboardCredentialStdinUnsupported",
    );
    expect(docker.execs).toHaveLength(1);
    expect(JSON.stringify(docker.execs)).not.toContain("sk-super-secret");
  });
});
