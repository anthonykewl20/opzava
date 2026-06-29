import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { logAuditEvent } from "@/lib/db";
import { config } from "@/lib/config";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import os from "os";
import { execFileSync } from "child_process";
import { writeFileAtomic } from "@/lib/atomic-write";
import { validateBody, integrationActionSchema } from "@/lib/validation";
import { mutationLimiter } from "@/lib/rate-limit";
import { detectProviderSubscriptions } from "@/lib/provider-subscriptions";
import { getPluginIntegrations, getPluginCategories } from "@/lib/plugins";
import type { PluginIntegrationDef } from "@/lib/plugins";
import {
  INTEGRATIONS,
  CATEGORIES,
  type IntegrationDef,
} from "@/opzava/platform/integrations/registry";
import { redactValue, createEnvReader } from "@/opzava/platform/integrations/env-read";
import {
  createProbes,
  resolveOllamaBaseUrl,
} from "@/opzava/platform/integrations/probes";
import { createEnvStore } from "@/opzava/platform/integrations/env-store";

// The effective-value + configured-check logic, closed over the live process.env
// + existsSync ports (see platform/integrations/env-read.ts).
const envReader = createEnvReader({
  processEnv: process.env,
  exists: existsSync,
});

// The integration probe domain (op/xint/ollama/gws presence + the 5000ms-cached
// snapshot), closed over live ports (see platform/integrations/probes.ts). Ports
// are live references/functions so they read current state per-call (no freezing).
const probes = createProbes({
  execFile: execFileSync,
  fetch,
  exists: existsSync,
  env: process.env,
  homeDir: os.homedir,
  now: () => Date.now(),
});

// The .env store: read + the write-mutation domain (setEnvVars / deleteEnvVars)
// behind injected state-dir / readFile / writeFileAtomic ports, with an in-process
// mutex serializing every read-modify-write so concurrent writers cannot lose
// updates (see platform/integrations/env-store.ts). The blocked-var + var-name
// enforcement is the module's single write gate.
const envStore = createEnvStore({
  stateDir: config.openclawStateDir || null,
  readFile: (p) => readFile(p, "utf-8"),
  writeFileAtomic,
});

// ---------------------------------------------------------------------------
// Integration registry (catalog + category metadata live in platform/integrations/registry.ts)
// ---------------------------------------------------------------------------

// INTEGRATIONS + CATEGORIES + the BLOCKED_VARS policy live in
// platform/integrations/{registry,env-read}.ts; the probe domain lives in
// platform/integrations/probes.ts; the .env read/write store lives in
// platform/integrations/env-store.ts.

/**
 * Build env for op CLI. The OP_SERVICE_ACCOUNT_TOKEN may live in the
 * OpenClaw .env (not the MC .env that systemd loads). Read it at
 * runtime so the op CLI can authenticate.
 */
async function getOpEnv(): Promise<NodeJS.ProcessEnv> {
  const base: NodeJS.ProcessEnv = { ...process.env };
  // Already in process env? Use it.
  if (base.OP_SERVICE_ACCOUNT_TOKEN) return base;
  // Try reading from the OpenClaw .env
  const envData = await envStore.readEnv();
  if (envData) {
    for (const line of envData.lines) {
      if (
        line.type === "var" &&
        line.key === "OP_SERVICE_ACCOUNT_TOKEN" &&
        line.value
      ) {
        base.OP_SERVICE_ACCOUNT_TOKEN = line.value;
        break;
      }
    }
  }
  return base;
}

// ---------------------------------------------------------------------------
// GET /api/integrations — list all integrations with status + redacted values
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const auth = requireRole(request, "admin");
  if ("error" in auth)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const envData = await envStore.readEnv();
  if (!envData) {
    return NextResponse.json(
      { error: "OPENCLAW_STATE_DIR not configured" },
      { status: 404 },
    );
  }

  const envMap = new Map<string, string>();
  for (const line of envData.lines) {
    if (line.type === "var" && line.key) {
      envMap.set(line.key, line.value!);
    }
  }

  const probe = await probes.snapshot();
  const { opAvailable, xint, ollamaInstalled, ollamaReachable, gwsInstalled } =
    probe;
  const providerSubscriptions = detectProviderSubscriptions();

  // Merge plugin integrations and categories
  const pluginIntegrations = getPluginIntegrations();
  const allIntegrations: IntegrationDef[] = [...INTEGRATIONS];
  const pluginIntegrationMap = new Map<string, PluginIntegrationDef>();
  for (const pi of pluginIntegrations) {
    if (!allIntegrations.some((i) => i.id === pi.id)) {
      allIntegrations.push({
        id: pi.id,
        name: pi.name,
        category: pi.category,
        envVars: pi.envVars,
        vaultItem: pi.vaultItem,
        testable: pi.testable,
        recommendation: pi.recommendation,
      });
    }
    pluginIntegrationMap.set(pi.id, pi);
  }

  const allCategories = { ...CATEGORIES };
  for (const pc of getPluginCategories()) {
    if (!(pc.id in allCategories)) {
      allCategories[pc.id] = { label: pc.label, order: pc.order };
    }
  }

  const integrations = allIntegrations.map((def) => {
    const vars: Record<string, { redacted: string; set: boolean }> = {};
    let allSet = true;
    let anySet = false;

    for (const envVar of def.envVars) {
      const val = envReader.getEffectiveEnvValue(envMap, envVar);
      if (envReader.isConfiguredValue(envVar, val)) {
        vars[envVar] = { redacted: redactValue(val), set: true };
        anySet = true;
      } else {
        vars[envVar] = { redacted: "", set: false };
        allSet = false;
      }
    }

    if (def.id === "onepassword" && !anySet && opAvailable) {
      const opEnv = { ...process.env };
      const fileToken = envMap.get("OP_SERVICE_ACCOUNT_TOKEN");
      if (fileToken) opEnv.OP_SERVICE_ACCOUNT_TOKEN = fileToken;
      if (probes.isOpAuthenticated(opEnv)) {
        vars.OP_SERVICE_ACCOUNT_TOKEN = {
          redacted: fileToken ? redactValue(fileToken) : "op session",
          set: true,
        };
        allSet = true;
        anySet = true;
      }
    }

    // Support OAuth/subscription-based auth for providers that may not expose API keys.
    if ((def.id === "anthropic" || def.id === "openai") && !anySet) {
      const sub = providerSubscriptions.active[def.id];
      if (sub) {
        const primaryVar = def.envVars[0];
        vars[primaryVar] = {
          redacted: `${sub.type} (${sub.source})`,
          set: true,
        };
        allSet = true;
        anySet = true;
      }
    }

    // Local Ollama can be available without API key-based auth.
    if (def.id === "ollama" && !anySet) {
      const primaryVar = def.envVars[0];
      if (ollamaReachable) {
        vars[primaryVar] = { redacted: "local daemon", set: true };
        allSet = true;
        anySet = true;
      } else if (ollamaInstalled) {
        vars[primaryVar] = {
          redacted: "installed (daemon not reachable)",
          set: true,
        };
        allSet = false;
        anySet = true;
      }
    }

    // Google Workspace CLI detection
    if (def.id === "google_workspace" && !anySet) {
      const primaryVar = def.envVars[0];
      if (gwsInstalled) {
        vars[primaryVar] = {
          redacted: "gws CLI installed (run `gws auth login`)",
          set: true,
        };
        allSet = false;
        anySet = true;
      }
    }

    // X integration should default to xint auth when present.
    if (def.id === "x_twitter" && !anySet) {
      const primaryVar = def.envVars[0];
      if (xint.oauthConfigured) {
        vars[primaryVar] = { redacted: "xint oauth", set: true };
        allSet = true;
        anySet = true;
      } else if (xint.installed || xint.envConfigured) {
        vars[primaryVar] = {
          redacted: "xint installed (run `xint auth`)",
          set: true,
        };
        allSet = false;
        anySet = true;
      }
    }

    const status =
      allSet && anySet ? "connected" : anySet ? "partial" : "not_configured";

    return {
      id: def.id,
      name: def.name,
      category: def.category,
      categoryLabel: allCategories[def.category]?.label ?? def.category,
      envVars: vars,
      status,
      vaultItem: def.vaultItem ?? null,
      testable: def.testable ?? false,
      recommendation: def.recommendation ?? null,
    };
  });

  return NextResponse.json({
    integrations,
    categories: Object.entries(allCategories)
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([id, meta]) => ({ id, label: meta.label })),
    opAvailable,
    envPath: envStore.envPath(),
  });
}

// ---------------------------------------------------------------------------
// PUT /api/integrations — update/add env vars
// Body: { vars: { KEY: "value", ... } }
// ---------------------------------------------------------------------------

export async function PUT(request: NextRequest) {
  const auth = requireRole(request, "admin");
  if ("error" in auth)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  if (!body?.vars || typeof body.vars !== "object") {
    return NextResponse.json(
      { error: "vars object required" },
      { status: 400 },
    );
  }

  // setEnvVars validates (blocked-var + name) and performs the atomic
  // read-modify-write under the store's mutex; the route just maps the outcome.
  const outcome = await envStore.setEnvVars(body.vars);
  if (!outcome.ok) {
    if (outcome.reason === "blocked")
      return NextResponse.json(
        { error: `Cannot set protected variable: ${outcome.key}` },
        { status: 403 },
      );
    if (outcome.reason === "invalid-name")
      return NextResponse.json(
        { error: `Invalid variable name: ${outcome.key}` },
        { status: 400 },
      );
    return NextResponse.json(
      { error: "OPENCLAW_STATE_DIR not configured" },
      { status: 404 },
    );
  }

  const ipAddress =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "unknown";
  logAuditEvent({
    action: "integrations_update",
    actor: auth.user.username,
    actor_id: auth.user.id,
    detail: { updated_keys: outcome.affected },
    ip_address: ipAddress,
  });

  return NextResponse.json({
    updated: outcome.affected,
    count: outcome.affected.length,
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/integrations?keys=KEY1,KEY2 — remove env vars
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  const auth = requireRole(request, "admin");
  if ("error" in auth)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body required" },
      { status: 400 },
    );
  }
  const keysParam = Array.isArray(body.keys) ? body.keys.join(",") : body.keys;
  if (!keysParam) {
    return NextResponse.json(
      { error: "keys parameter required (comma-separated string or array)" },
      { status: 400 },
    );
  }

  const keysToRemove = new Set<string>(
    keysParam
      .split(",")
      .map((k: string) => k.trim())
      .filter(Boolean),
  );
  if (keysToRemove.size === 0) {
    return NextResponse.json(
      { error: "At least one key required" },
      { status: 400 },
    );
  }

  // deleteEnvVars enforces the blocked-var gate + the atomic read-modify-write.
  const outcome = await envStore.deleteEnvVars([...keysToRemove]);
  if (!outcome.ok) {
    if (outcome.reason === "blocked")
      return NextResponse.json(
        { error: `Cannot remove protected variable: ${outcome.key}` },
        { status: 403 },
      );
    return NextResponse.json(
      { error: "OPENCLAW_STATE_DIR not configured" },
      { status: 404 },
    );
  }

  const ipAddress =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "unknown";
  logAuditEvent({
    action: "integrations_remove",
    actor: auth.user.username,
    actor_id: auth.user.id,
    detail: { removed_keys: outcome.affected },
    ip_address: ipAddress,
  });

  return NextResponse.json({
    removed: outcome.affected,
    count: outcome.affected.length,
  });
}

// ---------------------------------------------------------------------------
// POST /api/integrations — action dispatcher (test, pull)
// Body: { action: "test"|"pull", integrationId: "..." }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const auth = requireRole(request, "admin");
  if ("error" in auth)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const rateCheck = mutationLimiter(request);
  if (rateCheck) return rateCheck;

  const result = await validateBody(request, integrationActionSchema);
  if ("error" in result) return result.error;
  const body = result.data;

  // pull-all is a batch action — no integrationId needed
  if (body.action === "pull-all") {
    return handlePullAll(request, auth.user, body.category);
  }

  if (!body.integrationId) {
    return NextResponse.json(
      { error: "integrationId required" },
      { status: 400 },
    );
  }

  let integration: IntegrationDef | undefined = INTEGRATIONS.find(
    (i) => i.id === body.integrationId,
  );
  if (!integration) {
    // Check plugin integrations
    const pi = getPluginIntegrations().find((i) => i.id === body.integrationId);
    if (pi) {
      integration = {
        id: pi.id,
        name: pi.name,
        category: pi.category,
        envVars: pi.envVars,
        vaultItem: pi.vaultItem,
        testable: pi.testable,
        recommendation: pi.recommendation,
      };
    }
  }
  if (!integration) {
    return NextResponse.json(
      { error: `Unknown integration: ${body.integrationId}` },
      { status: 404 },
    );
  }

  if (body.action === "test") {
    return handleTest(integration, request, auth.user);
  }

  if (body.action === "pull") {
    return handlePull(integration, request, auth.user);
  }

  return NextResponse.json(
    { error: `Unknown action: ${body.action}` },
    { status: 400 },
  );
}

// ---------------------------------------------------------------------------
// Test connection for an integration
// ---------------------------------------------------------------------------

async function handleTest(
  integration: IntegrationDef,
  request: NextRequest,
  user: { username: string; id: number },
) {
  if (!integration.testable) {
    return NextResponse.json(
      { error: "This integration does not support testing" },
      { status: 400 },
    );
  }

  const envData = await envStore.readEnv();
  if (!envData) {
    return NextResponse.json(
      { error: "OPENCLAW_STATE_DIR not configured" },
      { status: 404 },
    );
  }

  const envMap = new Map<string, string>();
  for (const line of envData.lines) {
    if (line.type === "var" && line.key) envMap.set(line.key, line.value!);
  }

  try {
    let result: { ok: boolean; detail: string };
    const providerSubscriptions = detectProviderSubscriptions();

    switch (integration.id) {
      case "telegram": {
        const token = envReader.getEffectiveEnvValue(
          envMap,
          integration.envVars[0],
        );
        if (!token)
          return NextResponse.json({ ok: false, detail: "Token not set" });
        const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
          signal: AbortSignal.timeout(5000),
        });
        const data = await res.json();
        result = data.ok
          ? { ok: true, detail: `Bot: @${data.result.username}` }
          : { ok: false, detail: data.description || "Failed" };
        break;
      }

      case "github": {
        const token = envReader.getEffectiveEnvValue(envMap, "GITHUB_TOKEN");
        if (!token)
          return NextResponse.json({ ok: false, detail: "Token not set" });
        const res = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${token}`,
            "User-Agent": "MissionControl/1.0",
          },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = await res.json();
          result = { ok: true, detail: `User: ${data.login}` };
        } else {
          result = { ok: false, detail: `HTTP ${res.status}` };
        }
        break;
      }

      case "anthropic": {
        const key = envReader.getEffectiveEnvValue(envMap, "ANTHROPIC_API_KEY");
        if (!key) {
          const sub = providerSubscriptions.active.anthropic;
          if (sub)
            return NextResponse.json({
              ok: true,
              detail: `OAuth/subscription detected: ${sub.type}`,
            });
          return NextResponse.json({ ok: false, detail: "API key not set" });
        }
        const res = await fetch("https://api.anthropic.com/v1/models", {
          method: "GET",
          headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
          signal: AbortSignal.timeout(5000),
        });
        result = res.ok
          ? { ok: true, detail: "API key valid" }
          : { ok: false, detail: `HTTP ${res.status}` };
        break;
      }

      case "openai": {
        const key = envReader.getEffectiveEnvValue(envMap, "OPENAI_API_KEY");
        if (!key) {
          const sub = providerSubscriptions.active.openai;
          if (sub)
            return NextResponse.json({
              ok: true,
              detail: `OAuth/subscription detected: ${sub.type}`,
            });
          return NextResponse.json({ ok: false, detail: "API key not set" });
        }
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(5000),
        });
        result = res.ok
          ? { ok: true, detail: "API key valid" }
          : { ok: false, detail: `HTTP ${res.status}` };
        break;
      }

      case "openrouter": {
        const key = envReader.getEffectiveEnvValue(
          envMap,
          "OPENROUTER_API_KEY",
        );
        if (!key)
          return NextResponse.json({ ok: false, detail: "API key not set" });
        const res = await fetch("https://openrouter.ai/api/v1/models", {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(5000),
        });
        result = res.ok
          ? { ok: true, detail: "API key valid" }
          : { ok: false, detail: `HTTP ${res.status}` };
        break;
      }

      case "venice": {
        const key = envReader.getEffectiveEnvValue(envMap, "VENICE_API_KEY");
        if (!key)
          return NextResponse.json({ ok: false, detail: "API key not set" });
        const res = await fetch("https://api.venice.ai/api/v1/models", {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(5000),
        });
        result = res.ok
          ? { ok: true, detail: "API key valid" }
          : { ok: false, detail: `HTTP ${res.status}` };
        break;
      }

      case "hyperbrowser": {
        const key = envReader.getEffectiveEnvValue(
          envMap,
          "HYPERBROWSER_API_KEY",
        );
        if (!key)
          return NextResponse.json({ ok: false, detail: "API key not set" });
        const res = await fetch("https://app.hyperbrowser.ai/api/v2/sessions", {
          headers: { "x-api-key": key },
          signal: AbortSignal.timeout(5000),
        });
        result = res.ok
          ? { ok: true, detail: "API key valid" }
          : { ok: false, detail: `HTTP ${res.status}` };
        break;
      }

      case "google_workspace": {
        const credsFile = envReader.getEffectiveEnvValue(
          envMap,
          "GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE",
        );
        const gwsAvail = probes.isCommandAvailable("gws");
        if (!gwsAvail) {
          result = {
            ok: false,
            detail:
              "gws CLI not installed — run: npm i -g @googleworkspace/cli",
          };
          break;
        }
        try {
          const env: NodeJS.ProcessEnv = { ...process.env };
          if (credsFile) env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE = credsFile;
          execFileSync("gws", ["auth", "status"], {
            timeout: 10000,
            stdio: ["pipe", "pipe", "pipe"],
            env,
          });
          result = { ok: true, detail: "Authenticated" };
        } catch (err: any) {
          const stderr = err.stderr?.toString() || "";
          result = {
            ok: false,
            detail:
              stderr.slice(0, 120) ||
              "Not authenticated — run `gws auth login`",
          };
        }
        break;
      }

      default: {
        // Check plugin testHandler first
        const pluginDef = getPluginIntegrations().find(
          (pi) => pi.id === integration.id,
        );
        if (pluginDef?.testHandler) {
          result = await pluginDef.testHandler(envMap);
          break;
        }

        // Generic connectivity test: attempt a HEAD request to known base URLs
        const baseUrls: Record<string, string> = {
          nvidia: "https://api.nvidia.com",
          moonshot: "https://api.moonshot.cn",
          brave: "https://api.search.brave.com",
          linkedin: "https://api.linkedin.com",
          ollama: resolveOllamaBaseUrl(process.env),
          gateway: String(process.env.OPENCLAW_GATEWAY_URL || "").trim() || "",
        };
        const url = baseUrls[integration.id];
        if (url) {
          const res = await fetch(url, {
            method: "HEAD",
            signal: AbortSignal.timeout(5000),
          });
          result =
            res.ok || res.status < 500
              ? { ok: true, detail: `Reachable (HTTP ${res.status})` }
              : { ok: false, detail: `Unreachable (HTTP ${res.status})` };
        } else {
          return NextResponse.json({
            ok: false,
            detail:
              "No test available — configure the integration URL to enable testing",
          });
        }
        break;
      }
    }

    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";
    logAuditEvent({
      action: "integration_test",
      actor: user.username,
      actor_id: user.id,
      detail: {
        integration: integration.id,
        result: result.ok ? "success" : "failed",
      },
      ip_address: ipAddress,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      detail: err.message || "Connection failed",
    });
  }
}

// ---------------------------------------------------------------------------
// Pull value from 1Password vault — uses execFileSync (no shell) for safety
// ---------------------------------------------------------------------------

async function handlePull(
  integration: IntegrationDef,
  request: NextRequest,
  user: { username: string; id: number },
) {
  if (!integration.vaultItem) {
    return NextResponse.json(
      { error: "No vault item configured for this integration" },
      { status: 400 },
    );
  }

  if (!probes.isOpAvailable()) {
    return NextResponse.json(
      { error: "1Password CLI (op) is not installed" },
      { status: 400 },
    );
  }

  try {
    const opEnv = await getOpEnv();
    if (!opEnv.OP_SERVICE_ACCOUNT_TOKEN) {
      return NextResponse.json(
        { error: "OP_SERVICE_ACCOUNT_TOKEN not found in environment or .env" },
        { status: 400 },
      );
    }

    // execFileSync passes args as array — no shell interpolation possible
    const secret = execFileSync(
      "op",
      [
        "item",
        "get",
        integration.vaultItem,
        "--vault",
        process.env.OP_VAULT_NAME || "default",
        "--fields",
        "password",
        "--format",
        "json",
      ],
      { timeout: 15000, stdio: ["pipe", "pipe", "pipe"], env: opEnv },
    )
      .toString()
      .trim();

    let value: string;
    try {
      const parsed = JSON.parse(secret);
      value = parsed.value || parsed;
    } catch {
      value = secret;
    }

    if (!value || value.length === 0) {
      return NextResponse.json(
        { error: "Empty value returned from 1Password" },
        { status: 400 },
      );
    }

    // Write to .env (serialized + validated by the store; envVar is a registry key,
    // so the only reachable non-ok outcome is not-configured — an atomic-write error
    // would throw into the surrounding catch).
    const envVar = integration.envVars[0];
    const outcome = await envStore.setEnvVars({ [envVar]: value });
    if (!outcome.ok) {
      return NextResponse.json(
        { error: "OPENCLAW_STATE_DIR not configured" },
        { status: 404 },
      );
    }

    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";
    logAuditEvent({
      action: "integration_pull_1password",
      actor: user.username,
      actor_id: user.id,
      detail: { integration: integration.id, env_var: envVar },
      ip_address: ipAddress,
    });

    return NextResponse.json({
      ok: true,
      detail: `Pulled ${envVar} from 1Password`,
      redacted: redactValue(value),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: `1Password pull failed: ${err.message}`,
      },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Pull ALL vault-backed integrations from 1Password (optionally by category)
// ---------------------------------------------------------------------------

async function handlePullAll(
  request: NextRequest,
  user: { username: string; id: number },
  category?: string,
) {
  if (!probes.isOpAvailable()) {
    return NextResponse.json(
      { error: "1Password CLI (op) is not installed" },
      { status: 400 },
    );
  }

  const opEnv = await getOpEnv();
  if (!opEnv.OP_SERVICE_ACCOUNT_TOKEN) {
    return NextResponse.json(
      { error: "OP_SERVICE_ACCOUNT_TOKEN not found in environment or .env" },
      { status: 400 },
    );
  }

  const targets = INTEGRATIONS.filter((i) => {
    if (!i.vaultItem) return false;
    if (category && i.category !== category) return false;
    return true;
  });

  if (targets.length === 0) {
    return NextResponse.json(
      { error: "No vault-backed integrations found for this category" },
      { status: 400 },
    );
  }

  if (!envStore.envPath()) {
    return NextResponse.json(
      { error: "OPENCLAW_STATE_DIR not configured" },
      { status: 404 },
    );
  }

  // Collect pulled secrets for a single batched, mutex-protected write after the loop.
  const secrets: Record<string, string> = {};
  const results: { id: string; envVar: string; ok: boolean; detail: string }[] =
    [];

  for (const integration of targets) {
    const envVar = integration.envVars[0];
    try {
      const secret = execFileSync(
        "op",
        [
          "item",
          "get",
          integration.vaultItem!,
          "--vault",
          process.env.OP_VAULT_NAME || "default",
          "--fields",
          "password",
          "--format",
          "json",
        ],
        { timeout: 15000, stdio: ["pipe", "pipe", "pipe"], env: opEnv },
      )
        .toString()
        .trim();

      let value: string;
      try {
        const parsed = JSON.parse(secret);
        value = parsed.value || parsed;
      } catch {
        value = secret;
      }

      if (!value || value.length === 0) {
        results.push({
          id: integration.id,
          envVar,
          ok: false,
          detail: "Empty value",
        });
        continue;
      }

      // Stage for the batched write (the store does the atomic upsert under its mutex)
      secrets[envVar] = value;

      results.push({
        id: integration.id,
        envVar,
        ok: true,
        detail: `Pulled ${envVar}`,
      });
    } catch (err: any) {
      results.push({
        id: integration.id,
        envVar,
        ok: false,
        detail: err.message || "Failed",
      });
    }
  }

  // Write .env once after all pulls (serialized + validated by the store)
  const successCount = results.filter((r) => r.ok).length;
  if (successCount > 0) {
    const writeOutcome = await envStore.setEnvVars(secrets);
    // Unreachable for registry envVars (valid names, envPath pre-checked) — but fail
    // loudly rather than report success with nothing persisted (defense in depth,
    // mirroring the single-pull path).
    if (!writeOutcome.ok) {
      return NextResponse.json(
        { error: `Failed to write pulled secrets: ${writeOutcome.reason}` },
        { status: 500 },
      );
    }
  }

  const ipAddress =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "unknown";
  logAuditEvent({
    action: "integration_pull_all_1password",
    actor: user.username,
    actor_id: user.id,
    detail: {
      category: category ?? "all",
      success: successCount,
      failed: results.length - successCount,
      results: results.map((r) => ({ id: r.id, ok: r.ok })),
    },
    ip_address: ipAddress,
  });

  return NextResponse.json({
    ok: successCount > 0,
    detail: `Pulled ${successCount}/${results.length} integrations`,
    results,
  });
}
