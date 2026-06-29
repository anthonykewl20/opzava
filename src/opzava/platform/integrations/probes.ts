import { join } from "path";

export interface IntegrationProbeSnapshot {
  opAvailable: boolean;
  xint: {
    installed: boolean;
    oauthConfigured: boolean;
    envConfigured: boolean;
  };
  ollamaInstalled: boolean;
  ollamaReachable: boolean;
  gwsInstalled: boolean;
}

export interface ProbeDeps {
  execFile: (
    cmd: string,
    args: string[],
    opts: { stdio: "pipe"; timeout: number; env?: NodeJS.ProcessEnv },
  ) => unknown;
  fetch: typeof fetch;
  exists: (path: string) => boolean;
  env: Record<string, string | undefined>;
  homeDir: () => string;
  now: () => number;
}

const INTEGRATION_PROBE_TTL_MS = 5000;
const COMMAND_TIMEOUT_MS = 3000;
const OLLAMA_TIMEOUT_MS = 1200;
const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";

export function resolveOllamaBaseUrl(
  env: Record<string, string | undefined>,
): string {
  const raw = String(env.OLLAMA_HOST || "").trim();
  if (!raw) return DEFAULT_OLLAMA_BASE_URL;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `http://${raw}`;
}

export function createProbes(deps: ProbeDeps): {
  snapshot(): Promise<IntegrationProbeSnapshot>;
  isCommandAvailable(command: string): boolean;
  isOpAvailable(): boolean;
  isOpAuthenticated(opEnv?: NodeJS.ProcessEnv): boolean;
} {
  let integrationProbeCache: {
    ts: number;
    value: IntegrationProbeSnapshot;
  } | null = null;

  function checkOpAuthenticated(opEnv?: NodeJS.ProcessEnv): boolean {
    try {
      deps.execFile("op", ["whoami", "--format", "json"], {
        stdio: "pipe",
        timeout: COMMAND_TIMEOUT_MS,
        env: opEnv || (deps.env as NodeJS.ProcessEnv),
      });
      return true;
    } catch {
      return false;
    }
  }

  function checkCommandAvailable(command: string): boolean {
    try {
      deps.execFile("which", [command], {
        stdio: "pipe",
        timeout: COMMAND_TIMEOUT_MS,
      });
      return true;
    } catch {
      return false;
    }
  }

  function checkExists(path: string): boolean {
    try {
      return deps.exists(path);
    } catch {
      return false;
    }
  }

  function checkXintState(): {
    installed: boolean;
    oauthConfigured: boolean;
    envConfigured: boolean;
  } {
    const installed = checkCommandAvailable("xint");
    try {
      const oauthPath = join(
        deps.homeDir(),
        ".xint",
        "data",
        "oauth-tokens.json",
      );
      const envPath = join(deps.homeDir(), ".xint", ".env");
      const oauthConfigured = checkExists(oauthPath);
      const envConfigured = checkExists(envPath);
      return { installed, oauthConfigured, envConfigured };
    } catch {
      return { installed, oauthConfigured: false, envConfigured: false };
    }
  }

  async function checkOllamaReachable(): Promise<boolean> {
    try {
      const base = resolveOllamaBaseUrl(deps.env).replace(/\/+$/, "");
      const res = await deps.fetch(`${base}/api/tags`, {
        signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  function checkOpAvailable(): boolean {
    try {
      deps.execFile("which", ["op"], {
        stdio: "pipe",
        timeout: COMMAND_TIMEOUT_MS,
      });
      return true;
    } catch {
      return false;
    }
  }

  async function getIntegrationProbeSnapshot(): Promise<IntegrationProbeSnapshot> {
    const now = deps.now();
    if (
      integrationProbeCache &&
      now - integrationProbeCache.ts < INTEGRATION_PROBE_TTL_MS
    ) {
      return integrationProbeCache.value;
    }

    const value: IntegrationProbeSnapshot = {
      opAvailable: checkOpAvailable(),
      xint: checkXintState(),
      ollamaInstalled: checkCommandAvailable("ollama"),
      ollamaReachable: await checkOllamaReachable(),
      gwsInstalled: checkCommandAvailable("gws"),
    };
    integrationProbeCache = { ts: now, value };
    return value;
  }

  return {
    snapshot: getIntegrationProbeSnapshot,
    isCommandAvailable: checkCommandAvailable,
    isOpAvailable: checkOpAvailable,
    isOpAuthenticated: checkOpAuthenticated,
  };
}
