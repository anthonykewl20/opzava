import type { OpenClawAdminRpcPort } from "@opzava/ports";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

type ConfigRevision = string & { readonly __brand: "ConfigRevision" };

export interface GatewayConfigView {
  readonly [key: string]: unknown;
}

export interface GatewayConfigSnapshot {
  readonly revision: ConfigRevision;
  readonly config: GatewayConfigView;
}

export interface PluginAllowListPlan {
  readonly allow: readonly string[];
}

export interface CanonicalAgentGraphPlan {
  readonly agentsList: readonly [GatewayConfigView, ...GatewayConfigView[]];
}

export interface ProviderDisconnectPlan {
  readonly providerId: string;
  readonly profileIdsToRemove: readonly string[];
  readonly authOrderForProvider: readonly string[];
}

export interface ModelRoutabilityPlan {
  readonly models: Readonly<Record<string, unknown>>;
}

export type ConfigPatchPlan =
  | PluginAllowListPlan
  | CanonicalAgentGraphPlan
  | ProviderDisconnectPlan
  | ModelRoutabilityPlan;

export interface ConfigCommit {
  readonly response: unknown;
}

export interface GatewayConfigWriterOptions {
  readonly adminClient: OpenClawAdminRpcPort;
  readonly maxAttempts?: number;
  readonly retryBackoffMs?: readonly number[];
  readonly sleep?: (ms: number) => Promise<void>;
}

interface CompiledPatch {
  readonly patch: Record<string, unknown>;
  readonly replacePaths?: readonly string[];
}

const defaultRetryBackoffMs = [100, 250, 500, 1000] as const;

const canonicalAgentListReplacePaths = [
  "agents.list",
  "agents.list[].skills",
  "agents.list[].tools.allow",
  "agents.list[].tools.deny",
  "agents.list[].subagents.allowAgents",
] as const;

function configError(code: string, message: string): DomainError {
  return new DomainError({ code, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compilePlan(plan: ConfigPatchPlan): CompiledPatch {
  if ("allow" in plan) {
    return {
      patch: { plugins: { allow: plan.allow } },
      replacePaths: ["plugins.allow"],
    };
  }

  if ("agentsList" in plan) {
    return {
      patch: { agents: { list: plan.agentsList } },
      replacePaths: canonicalAgentListReplacePaths,
    };
  }

  if ("providerId" in plan) {
    return {
      patch: {
        auth: {
          profiles: Object.fromEntries(plan.profileIdsToRemove.map((id) => [id, null])),
          order: { [plan.providerId]: plan.authOrderForProvider },
        },
      },
      replacePaths: [`auth.order.${plan.providerId}`],
    };
  }

  return {
    patch: { agents: { defaults: { models: plan.models } } },
  };
}

export class GatewayConfigWriter {
  private readonly maxAttempts: number;
  private readonly retryBackoffMs: readonly number[];
  private readonly sleep: (ms: number) => Promise<void>;

  public constructor(private readonly options: GatewayConfigWriterOptions) {
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 5);
    this.retryBackoffMs = options.retryBackoffMs ?? defaultRetryBackoffMs;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  public async read(): Promise<Result<GatewayConfigSnapshot>> {
    const result = await this.options.adminClient.request("config.get", {});
    if (!result.ok) {
      return result;
    }
    if (!isRecord(result.value) || typeof result.value["hash"] !== "string") {
      return err(
        configError(
          "provisioning.connections.configBaseHashMissing",
          "Opzava Gateway config.get did not return the base hash required by config.patch.",
        ),
      );
    }
    if (!isRecord(result.value["config"])) {
      return err(
        configError(
          "provisioning.connections.configPayloadMissing",
          "Opzava Gateway config.get did not return a configuration object.",
        ),
      );
    }

    return ok({
      revision: result.value["hash"] as ConfigRevision,
      config: result.value["config"],
    });
  }

  public async commit(
    snapshot: GatewayConfigSnapshot,
    plan: ConfigPatchPlan,
  ): Promise<Result<ConfigCommit>> {
    let currentSnapshot = snapshot;
    let latest: Result<unknown> | null = null;

    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      if (attempt > 0) {
        const refreshed = await this.read();
        if (!refreshed.ok) {
          return refreshed;
        }
        currentSnapshot = refreshed.value;
      }

      const compiled = compilePlan(plan);
      latest = await this.options.adminClient.request(
        "config.patch",
        {
          raw: JSON.stringify(compiled.patch),
          baseHash: currentSnapshot.revision,
          ...(compiled.replacePaths === undefined ? {} : { replacePaths: compiled.replacePaths }),
        },
        { requiredScope: "operator.admin" },
      );
      if (latest.ok) {
        return ok({ response: latest.value });
      }
      if (!this.retryable(latest.error) || attempt + 1 >= this.maxAttempts) {
        return latest;
      }

      const delayMs = this.retryBackoffMs[Math.min(attempt, this.retryBackoffMs.length - 1)] ?? 0;
      await this.sleep(delayMs);
    }

    return latest!;
  }

  private retryable(error: unknown): boolean {
    const code = isRecord(error) && typeof error["code"] === "string" ? error["code"] : "";
    if (
      [
        "provisioning.openclawAdmin.connectionClosed",
        "provisioning.openclawAdmin.notConnected",
        "provisioning.openclawAdmin.gatewayUnavailable",
        "provisioning.openclawAdmin.requestTimeout",
        "provisioning.openclawAdmin.connectTimeout",
      ].includes(code)
    ) {
      return true;
    }

    const message = isRecord(error) && typeof error["message"] === "string" ? error["message"] : "";
    const text = `${code} ${message}`.toLowerCase();
    return (
      text.includes("closed before a response") ||
      text.includes("connection closed") ||
      text.includes("socket closed") ||
      text.includes("service restart") ||
      text.includes("operatorwshandshakefailed") ||
      text.includes("circuitopen") ||
      text.includes("econnrefused") ||
      text.includes("config changed since last load") ||
      text.includes("stalebasehash") ||
      (text.includes("basehash") &&
        (text.includes("stale") ||
          text.includes("mismatch") ||
          text.includes("changed") ||
          text.includes("conflict") ||
          text.includes("rejected")))
    );
  }
}
