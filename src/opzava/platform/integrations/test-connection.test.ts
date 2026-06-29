import { describe, expect, it } from "vitest";
import {
  createTestRunner,
  type TestCallCtx,
  type TestResult,
  type TestRunnerDeps,
} from "./test-connection";

/**
 * Characterization of the connection-test domain — the per-provider "test
 * connection" dispatch extracted from src/app/api/integrations/route.ts
 * (handleTest, a 255-line switch). Behind injected fetch/execFile/env/
 * isCommandAvailable ports (construction) + a per-call ctx (resolveEnvValue,
 * hasSubscription, pluginTestHandler, envMap). The module NEVER throws — every
 * failure (bad token, network error, exec failure) is a `{ ok: false; detail }`
 * outcome so the route can audit + map to HTTP uniformly.
 *
 * Focus: the DISPATCH (built-in → plugin → generic HEAD → no-test), the distinct
 * per-case behaviors (telegram's data.ok JSON parse, github's User-Agent, the
 * anthropic/openai subscription fallback, google_workspace's exec+stderr, the
 * generic status<500 reachability rule), and the sad paths. The Bearer/x-api-key
 * HTTP providers (openai/openrouter/venice/hyperbrowser) are mechanical variants
 * of the anthropic case and are covered by it.
 */

interface RunnerOpts {
  fetchOk?: boolean;
  fetchStatus?: number;
  fetchJson?: unknown;
  fetchThrows?: boolean;
  gwsInstalled?: boolean;
  gwsThrows?: boolean;
  gwsStderr?: string;
  env?: Record<string, string | undefined>;
}

function makeRunner(opts: RunnerOpts = {}) {
  const fetchCalls: { url: string; init?: RequestInit }[] = [];
  const execCalls: { cmd: string; args: string[]; env?: unknown }[] = [];
  const deps: TestRunnerDeps = {
    fetch: (async (url, init) => {
      fetchCalls.push({ url: String(url), init: init as RequestInit });
      if (opts.fetchThrows) throw new Error("network down");
      return {
        ok: opts.fetchOk ?? true,
        status: opts.fetchStatus ?? 200,
        json: async () => opts.fetchJson ?? {},
      } as Response;
    }) as typeof fetch,
    execFile: ((cmd: string, args: string[], o: { env?: unknown }) => {
      execCalls.push({ cmd, args: [...args], env: o.env });
      if (opts.gwsThrows) {
        const e = new Error("gws failed") as Error & { stderr?: Buffer };
        if (opts.gwsStderr !== undefined) e.stderr = Buffer.from(opts.gwsStderr);
        throw e;
      }
      return "";
    }) as TestRunnerDeps["execFile"],
    env: opts.env ?? {},
    isCommandAvailable: (cmd) => cmd === "gws" && (opts.gwsInstalled ?? true),
  };
  return { runner: createTestRunner(deps), fetchCalls, execCalls };
}

function ctx(opts: {
  resolveEnvValue?: (key: string) => string;
  hasSubscription?: (id: string) => { type: string; source: string } | undefined;
  pluginTestHandler?: (envMap: Map<string, string>) => Promise<TestResult>;
} = {}): TestCallCtx {
  return {
    envMap: new Map(),
    resolveEnvValue: opts.resolveEnvValue ?? (() => ""),
    hasSubscription: opts.hasSubscription ?? (() => undefined),
    pluginTestHandler: opts.pluginTestHandler,
  };
}

// --- dispatch ---------------------------------------------------------------

describe("createTestRunner — dispatch order", () => {
  it("a built-in id runs the built-in handler (not plugin/generic)", async () => {
    const { runner, fetchCalls } = makeRunner({ fetchJson: { login: "u" } });
    await runner.testConnection("github", ctx({ resolveEnvValue: () => "tok" }));
    // github hits api.github.com — proves the built-in path ran
    expect(fetchCalls[0].url).toBe("https://api.github.com/user");
  });

  it("an unknown id WITH a pluginTestHandler runs the plugin", async () => {
    const { runner, fetchCalls } = makeRunner();
    const pluginTestHandler = async (): Promise<TestResult> => ({
      ok: true,
      detail: "plugin says ok",
    });
    const out = await runner.testConnection(
      "custom-plugin-id",
      ctx({ pluginTestHandler }),
    );
    expect(out).toEqual({ ok: true, detail: "plugin says ok" });
    expect(fetchCalls.length).toBe(0); // no HTTP fallback
  });

  it("an unknown id with a known base URL falls back to a generic HEAD", async () => {
    const { runner, fetchCalls } = makeRunner({ fetchOk: true, fetchStatus: 200 });
    const out = await runner.testConnection("nvidia", ctx());
    expect(out.ok).toBe(true);
    expect(fetchCalls[0].url).toBe("https://api.nvidia.com");
    expect((fetchCalls[0].init as RequestInit).method).toBe("HEAD");
  });

  it("an unknown id with no handler + no base URL reports no test available", async () => {
    const { runner } = makeRunner();
    const out = await runner.testConnection("totally-unknown", ctx());
    expect(out).toEqual({
      ok: false,
      detail: "No test available — configure the integration URL to enable testing",
    });
  });
});

// --- built-in representative cases ------------------------------------------

describe("createTestRunner — built-in cases", () => {
  it("telegram: parses {ok, result.username}", async () => {
    const r1 = makeRunner({ fetchJson: { ok: true, result: { username: "mybot" } } });
    const out = await r1.runner.testConnection(
      "telegram",
      ctx({ resolveEnvValue: (key) => (key === "TELEGRAM_BOT_TOKEN" ? "TOK" : "") }),
    );
    expect(out).toEqual({ ok: true, detail: "Bot: @mybot" });
    expect(r1.fetchCalls[0].url).toContain("/botTOK/getMe");

    const r2 = makeRunner({ fetchJson: { ok: false, description: "Invalid" } });
    const out2 = await r2.runner.testConnection(
      "telegram",
      ctx({ resolveEnvValue: (key) => (key === "TELEGRAM_BOT_TOKEN" ? "TOK" : "") }),
    );
    expect(out2).toEqual({ ok: false, detail: "Invalid" });
  });

  it("github: res.ok → User login; uses the Opzava User-Agent (brand fix, not MissionControl)", async () => {
    const { runner, fetchCalls } = makeRunner({
      fetchOk: true,
      fetchJson: { login: "octocat" },
    });
    const out = await runner.testConnection(
      "github",
      ctx({ resolveEnvValue: () => "ghp_x" }),
    );
    expect(out).toEqual({ ok: true, detail: "User: octocat" });
    const headers = (fetchCalls[0].init as RequestInit).headers as Record<
      string,
      string
    >;
    expect(headers["User-Agent"]).toBe("Opzava/1.0");
    expect(headers["User-Agent"]).not.toMatch(/Mission/i);
    expect(headers["Authorization"]).toBe("Bearer ghp_x");
  });

  it("github: res not ok → HTTP <status>", async () => {
    const { runner } = makeRunner({ fetchOk: false, fetchStatus: 401 });
    const out = await runner.testConnection(
      "github",
      ctx({ resolveEnvValue: () => "tok" }),
    );
    expect(out).toEqual({ ok: false, detail: "HTTP 401" });
  });

  it("anthropic: key valid → ok; uses x-api-key", async () => {
    const { runner, fetchCalls } = makeRunner({ fetchOk: true });
    const out = await runner.testConnection(
      "anthropic",
      ctx({ resolveEnvValue: () => "sk-ant" }),
    );
    expect(out).toEqual({ ok: true, detail: "API key valid" });
    const headers = (fetchCalls[0].init as RequestInit).headers as Record<
      string,
      string
    >;
    expect(headers["x-api-key"]).toBe("sk-ant");
  });

  it("anthropic: no key + subscription detected → OAuth/subscription detail", async () => {
    const { runner, fetchCalls } = makeRunner();
    const out = await runner.testConnection(
      "anthropic",
      ctx({
        resolveEnvValue: () => "",
        hasSubscription: () => ({ type: "oauth", source: "gateway" }),
      }),
    );
    expect(out).toEqual({
      ok: true,
      detail: "OAuth/subscription detected: oauth",
    });
    expect(fetchCalls.length).toBe(0); // no fetch when subscription short-circuits
  });

  it("anthropic: no key + no subscription → 'API key not set'", async () => {
    const { runner } = makeRunner();
    const out = await runner.testConnection("anthropic", ctx());
    expect(out).toEqual({ ok: false, detail: "API key not set" });
  });

  it("google_workspace: gws missing → actionable install hint", async () => {
    const { runner, execCalls } = makeRunner({ gwsInstalled: false });
    const out = await runner.testConnection("google_workspace", ctx());
    expect(out.ok).toBe(false);
    expect(out.detail).toContain("gws CLI not installed");
    expect(execCalls.length).toBe(0); // did not shell out when absent
  });

  it("google_workspace: gws present + auth ok → Authenticated", async () => {
    const { runner, execCalls } = makeRunner({ gwsInstalled: true });
    const out = await runner.testConnection(
      "google_workspace",
      ctx({ resolveEnvValue: () => "/creds.json" }),
    );
    expect(out).toEqual({ ok: true, detail: "Authenticated" });
    expect(execCalls[0]).toMatchObject({ cmd: "gws", args: ["auth", "status"] });
  });

  it("google_workspace: gws throws with stderr → stderr detail (truncated)", async () => {
    const { runner } = makeRunner({
      gwsInstalled: true,
      gwsThrows: true,
      gwsStderr: "Error: not logged in, run gws auth login",
    });
    const out = await runner.testConnection("google_workspace", ctx());
    expect(out).toEqual({ ok: false, detail: "Error: not logged in, run gws auth login" });
  });

  it("google_workspace: gws throws with NO stderr → generic auth hint", async () => {
    const { runner } = makeRunner({ gwsInstalled: true, gwsThrows: true });
    const out = await runner.testConnection("google_workspace", ctx());
    expect(out.ok).toBe(false);
    expect(out.detail).toBe("Not authenticated — run `gws auth login`");
  });
});

// --- generic HEAD reachability rule -----------------------------------------

describe("createTestRunner — generic HEAD status rule", () => {
  it("status < 500 (e.g. 404) reads as Reachable", async () => {
    const { runner } = makeRunner({ fetchOk: false, fetchStatus: 404 });
    const out = await runner.testConnection("nvidia", ctx());
    expect(out).toEqual({ ok: true, detail: "Reachable (HTTP 404)" });
  });

  it("status >= 500 reads as Unreachable", async () => {
    const { runner } = makeRunner({ fetchOk: false, fetchStatus: 503 });
    const out = await runner.testConnection("nvidia", ctx());
    expect(out).toEqual({ ok: false, detail: "Unreachable (HTTP 503)" });
  });
});

// --- sad paths --------------------------------------------------------------

describe("createTestRunner — sad paths", () => {
  it("token not set → {ok:false} (never throws, route can audit)", async () => {
    const { runner } = makeRunner();
    const out = await runner.testConnection("telegram", ctx());
    expect(out).toEqual({ ok: false, detail: "Token not set" });
  });

  it("a fetch error is caught → {ok:false}, never throws (no 500 leak)", async () => {
    const { runner } = makeRunner({ fetchThrows: true });
    const out = await runner.testConnection(
      "github",
      ctx({ resolveEnvValue: () => "tok" }),
    );
    expect(out).toEqual({ ok: false, detail: "network down" });
  });

  it("a fetch error with no message falls back to 'Connection failed'", async () => {
    const deps: TestRunnerDeps = {
      fetch: (async () => {
        throw {}; // non-Error throw
      }) as typeof fetch,
      execFile: (() => "") as TestRunnerDeps["execFile"],
      env: {},
      isCommandAvailable: () => true,
    };
    const out = await createTestRunner(deps).testConnection(
      "github",
      ctx({ resolveEnvValue: () => "tok" }),
    );
    expect(out).toEqual({ ok: false, detail: "Connection failed" });
  });

  it("an Error with an empty message also falls back to 'Connection failed'", async () => {
    const deps: TestRunnerDeps = {
      fetch: (async () => {
        throw new Error("");
      }) as typeof fetch,
      execFile: (() => "") as TestRunnerDeps["execFile"],
      env: {},
      isCommandAvailable: () => true,
    };
    const out = await createTestRunner(deps).testConnection(
      "github",
      ctx({ resolveEnvValue: () => "tok" }),
    );
    expect(out).toEqual({ ok: false, detail: "Connection failed" });
  });
});
