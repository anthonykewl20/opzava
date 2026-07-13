import { describe, expect, it } from "vitest";

import { DockerOpenClawGatewayRuntime } from "../docker-gateway-runtime.js";

/**
 * The auth probe is the guard that stops Opzava storing a provider credential it never proved works
 * (#183). Everything it decides comes out of ONE payload — `models status --json --probe` — so these
 * exercise the real adapter against the real payload shape rather than a stand-in. The service-level
 * tests fake `probeProviderAuth` wholesale and cannot see a parsing regression at all.
 */

/** Docker multiplexes exec output into 8-byte-headed frames; stdout is stream 1. */
function dockerStdoutFrame(stdout: string): Buffer {
  const payload = Buffer.from(stdout, "utf8");
  const header = Buffer.alloc(8);
  header[0] = 1;
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

interface FakeDocker {
  readonly runtime: DockerOpenClawGatewayRuntime;
  readonly commands: string[][];
}

function fakeDocker(input: { readonly stdout: string; readonly exitCode?: number }): FakeDocker {
  const commands: string[][] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/exec")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { readonly Cmd?: string[] };
      commands.push(body.Cmd ?? []);
      return new Response(JSON.stringify({ Id: "exec-1" }), { status: 200 });
    }
    if (path.endsWith("/start")) {
      return new Response(dockerStdoutFrame(input.stdout), { status: 200 });
    }
    if (path.endsWith("/json")) {
      return new Response(JSON.stringify({ ExitCode: input.exitCode ?? 0 }), { status: 200 });
    }
    throw new Error(`unexpected docker path ${path}`);
  }) as unknown as typeof fetch;

  return {
    runtime: new DockerOpenClawGatewayRuntime({
      dockerHost: "tcp://docker-socket-proxy:2375",
      containerName: "openclaw-platform-gateway",
      fetch: fetchImpl,
    }),
    commands,
  };
}

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

describe("DockerOpenClawGatewayRuntime credential write (#183)", () => {
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

  // Scoped to THIS command on purpose. `writeAgentCredential` pipes the secret through stdin so it
  // never lands in argv, where the container's process list would expose it for the life of the
  // command. `connectApiKey` (onboard) still passes the key as an argv element and does NOT hold
  // this property — a pre-existing exposure this change does not touch, and not something to imply
  // is fixed by asserting it here.
  it("keeps the credential out of argv, where the container process list would expose it", async () => {
    const docker = fakeDocker({ stdout: "Auth profile: zai:manual (zai/api_key)\n" });

    await docker.runtime.writeAgentCredential({
      agentId: "main",
      providerId: "zai",
      keyFlag: "zai-api-key",
      apiKey: "sk-super-secret",
    });

    expect(JSON.stringify(docker.commands)).not.toContain("sk-super-secret");
  });
});
