// The connection-test dispatch extracted from src/app/api/integrations/route.ts
// behind injected fetch/exec/env/probe ports. Engine-B purity: NO @/lib imports.

import { resolveOllamaBaseUrl } from "./probes";
import { INTEGRATIONS } from "./registry";

export interface TestResult {
  ok: boolean;
  detail: string;
}

export interface TestRunnerDeps {
  fetch: typeof fetch;
  execFile: (
    cmd: string,
    args: string[],
    opts: { timeout: number; stdio: string[]; env: NodeJS.ProcessEnv },
  ) => unknown;
  env: Record<string, string | undefined>;
  isCommandAvailable: (cmd: string) => boolean;
}

export interface TestCallCtx {
  envMap: Map<string, string>;
  resolveEnvValue: (key: string) => string;
  hasSubscription: (id: string) => { type: string; source: string } | undefined;
  pluginTestHandler?: (envMap: Map<string, string>) => Promise<TestResult>;
}

type StderrCarrier = { stderr?: { toString(): string } };

function stderrOf(err: unknown): string {
  if (typeof err !== "object" || err === null || !("stderr" in err)) {
    return "";
  }
  return (err as StderrCarrier).stderr?.toString() || "";
}

export function createTestRunner(deps: TestRunnerDeps): {
  testConnection(id: string, ctx: TestCallCtx): Promise<TestResult>;
} {
  async function testTelegram(ctx: TestCallCtx): Promise<TestResult> {
    const token = ctx.resolveEnvValue(
      INTEGRATIONS.find((i) => i.id === "telegram")?.envVars[0] ??
        "TELEGRAM_BOT_TOKEN",
    );
    if (!token) return { ok: false, detail: "Token not set" };
    const res = await deps.fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return data.ok
      ? { ok: true, detail: `Bot: @${data.result.username}` }
      : { ok: false, detail: data.description || "Failed" };
  }

  async function testGithub(ctx: TestCallCtx): Promise<TestResult> {
    const token = ctx.resolveEnvValue("GITHUB_TOKEN");
    if (!token) return { ok: false, detail: "Token not set" };
    const res = await deps.fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "Opzava/1.0",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, detail: `User: ${data.login}` };
    }
    return { ok: false, detail: `HTTP ${res.status}` };
  }

  async function testAnthropic(ctx: TestCallCtx): Promise<TestResult> {
    const key = ctx.resolveEnvValue("ANTHROPIC_API_KEY");
    if (!key) {
      const sub = ctx.hasSubscription("anthropic");
      if (sub) {
        return {
          ok: true,
          detail: `OAuth/subscription detected: ${sub.type}`,
        };
      }
      return { ok: false, detail: "API key not set" };
    }
    const res = await deps.fetch("https://api.anthropic.com/v1/models", {
      method: "GET",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok
      ? { ok: true, detail: "API key valid" }
      : { ok: false, detail: `HTTP ${res.status}` };
  }

  async function testOpenai(ctx: TestCallCtx): Promise<TestResult> {
    const key = ctx.resolveEnvValue("OPENAI_API_KEY");
    if (!key) {
      const sub = ctx.hasSubscription("openai");
      if (sub) {
        return {
          ok: true,
          detail: `OAuth/subscription detected: ${sub.type}`,
        };
      }
      return { ok: false, detail: "API key not set" };
    }
    const res = await deps.fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok
      ? { ok: true, detail: "API key valid" }
      : { ok: false, detail: `HTTP ${res.status}` };
  }

  async function testOpenrouter(ctx: TestCallCtx): Promise<TestResult> {
    const key = ctx.resolveEnvValue("OPENROUTER_API_KEY");
    if (!key) return { ok: false, detail: "API key not set" };
    const res = await deps.fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok
      ? { ok: true, detail: "API key valid" }
      : { ok: false, detail: `HTTP ${res.status}` };
  }

  async function testVenice(ctx: TestCallCtx): Promise<TestResult> {
    const key = ctx.resolveEnvValue("VENICE_API_KEY");
    if (!key) return { ok: false, detail: "API key not set" };
    const res = await deps.fetch("https://api.venice.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok
      ? { ok: true, detail: "API key valid" }
      : { ok: false, detail: `HTTP ${res.status}` };
  }

  async function testHyperbrowser(ctx: TestCallCtx): Promise<TestResult> {
    const key = ctx.resolveEnvValue("HYPERBROWSER_API_KEY");
    if (!key) return { ok: false, detail: "API key not set" };
    const res = await deps.fetch("https://app.hyperbrowser.ai/api/v2/sessions", {
      headers: { "x-api-key": key },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok
      ? { ok: true, detail: "API key valid" }
      : { ok: false, detail: `HTTP ${res.status}` };
  }

  async function testGoogleWorkspace(ctx: TestCallCtx): Promise<TestResult> {
    const credsFile = ctx.resolveEnvValue(
      "GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE",
    );
    const gwsAvail = deps.isCommandAvailable("gws");
    if (!gwsAvail) {
      return {
        ok: false,
        detail: "gws CLI not installed — run: npm i -g @googleworkspace/cli",
      };
    }
    try {
      const env = {
        ...deps.env,
        ...(credsFile
          ? { GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE: credsFile }
          : {}),
      } as NodeJS.ProcessEnv;
      deps.execFile("gws", ["auth", "status"], {
        timeout: 10000,
        stdio: ["pipe", "pipe", "pipe"],
        env,
      });
      return { ok: true, detail: "Authenticated" };
    } catch (err) {
      const stderr = stderrOf(err);
      return {
        ok: false,
        detail:
          stderr.slice(0, 120) || "Not authenticated — run `gws auth login`",
      };
    }
  }

  async function testDefault(
    id: string,
    ctx: TestCallCtx,
  ): Promise<TestResult> {
    if (ctx.pluginTestHandler) {
      return await ctx.pluginTestHandler(ctx.envMap);
    }

    const baseUrls: Record<string, string> = {
      nvidia: "https://api.nvidia.com",
      moonshot: "https://api.moonshot.cn",
      brave: "https://api.search.brave.com",
      linkedin: "https://api.linkedin.com",
      ollama: resolveOllamaBaseUrl(deps.env),
      gateway: String(deps.env.OPENCLAW_GATEWAY_URL || "").trim() || "",
    };
    const url = baseUrls[id];
    if (url) {
      const res = await deps.fetch(url, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
      });
      return res.ok || res.status < 500
        ? { ok: true, detail: `Reachable (HTTP ${res.status})` }
        : { ok: false, detail: `Unreachable (HTTP ${res.status})` };
    }

    return {
      ok: false,
      detail: "No test available — configure the integration URL to enable testing",
    };
  }

  async function testConnection(
    id: string,
    ctx: TestCallCtx,
  ): Promise<TestResult> {
    try {
      switch (id) {
        case "telegram":
          return await testTelegram(ctx);
        case "github":
          return await testGithub(ctx);
        case "anthropic":
          return await testAnthropic(ctx);
        case "openai":
          return await testOpenai(ctx);
        case "openrouter":
          return await testOpenrouter(ctx);
        case "venice":
          return await testVenice(ctx);
        case "hyperbrowser":
          return await testHyperbrowser(ctx);
        case "google_workspace":
          return await testGoogleWorkspace(ctx);
        default:
          return await testDefault(id, ctx);
      }
    } catch (err) {
      return {
        ok: false,
        detail: (err as { message?: string })?.message || "Connection failed",
      };
    }
  }

  return { testConnection };
}
