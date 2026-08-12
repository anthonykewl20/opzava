import type {
  ConnectionsSnapshot,
  ModelProviderCatalogEntry,
  OpenClawAdminRpcPort,
  OpenClawHealth,
  OpenClawHealthComponent,
  ProviderConnectionState,
} from "@opzava/ports";
import type { Result } from "@opzava/shared-kernel";

import { ASK_ADMIN_AGENT_ID } from "./ask-admin-agent.js";
import { buildOrchestratorAgentConfig } from "./connections.js";
import {
  agentsList,
  connectedProviderSubagents,
  isRecord,
  modelProviderId,
  modelRecordId,
  modelRecordProviderId,
  modelSelectorPrimary,
  numberValue,
  ownedAgentRowEquals,
  ownedConfigValueEquals,
  preferredConnectedOrchestratorSelection,
  providerIdentitiesMatch,
  recordValue,
  splitScope,
  stringValue,
} from "./provider-read-model.js";

function githubTokenScopes(value: unknown): readonly string[] {
  return splitScope(value);
}

function isoTimestamp(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const timestamp = value < 10_000_000_000 ? value * 1000 : value;
    return new Date(timestamp).toISOString();
  }

  return null;
}

function firstNestedString(value: unknown, keys: readonly string[], depth = 0): string | null {
  if (depth > 4 || !isRecord(value)) {
    return null;
  }

  for (const key of keys) {
    const direct = stringValue(value[key]);
    if (direct !== null) {
      return direct;
    }
  }

  for (const nested of Object.values(value)) {
    const found = firstNestedString(nested, keys, depth + 1);
    if (found !== null) {
      return found;
    }
  }

  return null;
}

function firstNestedTimestamp(value: unknown, depth = 0): string | null {
  if (depth > 4) {
    return null;
  }

  const direct = isoTimestamp(value);
  if (direct !== null) {
    return direct;
  }

  if (!isRecord(value)) {
    return null;
  }

  const timestampKeys = [
    "lastHeartbeatAt",
    "lastHeartbeat",
    "heartbeatAt",
    "lastSeenAt",
    "updatedAt",
    "timestamp",
    "time",
  ] as const;
  for (const key of timestampKeys) {
    const timestamp = isoTimestamp(value[key]);
    if (timestamp !== null) {
      return timestamp;
    }
  }

  for (const nested of Object.values(value)) {
    const found = firstNestedTimestamp(nested, depth + 1);
    if (found !== null) {
      return found;
    }
  }

  return null;
}

function healthPayloadIsUnavailable(value: unknown): boolean {
  const root = recordValue(value);
  if (root === null) {
    return false;
  }

  if (root["ok"] === false || root["healthy"] === false) {
    return true;
  }

  const status = stringValue(root["status"])?.toLowerCase();
  return (
    status === "down" || status === "failed" || status === "unavailable" || status === "unhealthy"
  );
}

function gatewayRegion(input: {
  readonly config: Record<string, unknown>;
  readonly healthPayload: unknown;
  readonly heartbeatPayload: unknown;
}): string | null {
  return (
    firstNestedString(input.healthPayload, ["region", "gatewayRegion", "location"]) ??
    firstNestedString(input.heartbeatPayload, ["region", "gatewayRegion", "location"]) ??
    stringValue(input.config["region"]) ??
    stringValue(input.config["gatewayRegion"])
  );
}

function gatewayConnectionState(input: {
  readonly config: Record<string, unknown>;
  readonly healthResult: Result<unknown>;
  readonly heartbeatResult: Result<unknown>;
  readonly modelsResult: Result<unknown>;
  readonly grantedScopes: readonly string[] | null;
  readonly now: Date;
}): ConnectionsSnapshot["gateway"] {
  const healthPayload = input.healthResult.ok ? input.healthResult.value : {};
  const heartbeatPayload = input.heartbeatResult.ok ? input.heartbeatResult.value : {};
  const messages = [
    input.healthResult.ok ? null : input.healthResult.error.message,
    input.heartbeatResult.ok ? null : input.heartbeatResult.error.message,
    input.modelsResult.ok ? null : input.modelsResult.error.message,
  ].filter((message): message is string => message !== null);

  return {
    status: healthPayloadIsUnavailable(healthPayload) ? "unavailable" : "active",
    region: gatewayRegion({
      config: input.config,
      healthPayload,
      heartbeatPayload,
    }),
    authLabel:
      input.grantedScopes === null || input.grantedScopes.length === 0
        ? "Opzava Gateway operator.read"
        : `Opzava Gateway ${input.grantedScopes.join(", ")}`,
    lastHeartbeatAt:
      firstNestedTimestamp(heartbeatPayload) ??
      firstNestedTimestamp(healthPayload) ??
      input.now.toISOString(),
    message: messages.length === 0 ? null : messages.join(" "),
  };
}

const coreHealthComponents = [
  { id: "gateway", kind: "gateway", label: "Gateway" },
  { id: "event-loop", kind: "event-loop", label: "Event loop" },
  { id: "plugins", kind: "plugins", label: "Plugins" },
  { id: "context-engines", kind: "context-engines", label: "Context engines" },
  { id: "delivery-queues", kind: "delivery-queues", label: "Delivery queues" },
  { id: "config-reload", kind: "config-reload", label: "Config reload" },
] as const;

function healthComponent(input: {
  readonly id: string;
  readonly kind: OpenClawHealthComponent["kind"];
  readonly label: string;
  readonly status: OpenClawHealthComponent["status"];
  readonly managed?: boolean;
  readonly detail: string | null;
  readonly lastCheckedAt: string | null;
}): OpenClawHealthComponent {
  return { ...input, managed: input.managed ?? true };
}

function unknownCoreHealthComponents(): readonly OpenClawHealthComponent[] {
  return coreHealthComponents.map((component) =>
    healthComponent({
      ...component,
      status: "not_checked",
      detail: "Health data was not available.",
      lastCheckedAt: null,
    }),
  );
}

function channelAccountRecords(
  channel: Record<string, unknown>,
): readonly [string, Record<string, unknown>][] {
  const accounts = recordValue(channel["accounts"]);
  if (accounts !== null) {
    return Object.entries(accounts)
      .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
      .filter(([, account]) => account["configured"] === true);
  }

  const accountId = stringValue(channel["accountId"]);
  return accountId !== null && channel["configured"] === true ? [[accountId, channel]] : [];
}

const positiveChannelHealthStates = new Set([
  "linked",
  "connected",
  "configured",
  "healthy",
  "ok",
  "ready",
  "running",
  "unmanaged",
]);

const negativeChannelHealthStates = new Set([
  "not-linked",
  "disconnected",
  "unstable",
  "unconfigured",
  "failed",
  "error",
  "unhealthy",
]);

function channelAccountComponent(input: {
  readonly channelId: string;
  readonly channelLabel: string;
  readonly accountId: string;
  readonly account: Record<string, unknown>;
  readonly healthCheckedAt: string;
}): OpenClawHealthComponent {
  const probe = recordValue(input.account["probe"]);
  const healthState = stringValue(input.account["healthState"])?.toLowerCase() ?? null;
  const statusState = stringValue(input.account["statusState"])?.toLowerCase() ?? null;
  const explicitlyUnhealthy =
    input.account["linked"] === false ||
    input.account["running"] === false ||
    input.account["connected"] === false ||
    probe?.["ok"] === false ||
    (healthState !== null && negativeChannelHealthStates.has(healthState)) ||
    (statusState !== null && negativeChannelHealthStates.has(statusState));
  const explicitlyHealthy =
    input.account["linked"] === true ||
    input.account["running"] === true ||
    input.account["connected"] === true ||
    probe?.["ok"] === true ||
    (healthState !== null && positiveChannelHealthStates.has(healthState)) ||
    (statusState !== null && positiveChannelHealthStates.has(statusState));
  const lastCheckedAt = isoTimestamp(input.account["lastProbeAt"]);

  return healthComponent({
    id: `channel:${input.channelId}:${input.accountId}`,
    kind: "channel",
    label: `${input.channelLabel} (${input.accountId})`,
    status: explicitlyUnhealthy ? "attention" : explicitlyHealthy ? "healthy" : "not_checked",
    detail: explicitlyUnhealthy
      ? "The configured channel account reported an unhealthy state."
      : explicitlyHealthy
        ? "The configured channel account is healthy."
        : "The configured channel account has not been probed.",
    lastCheckedAt:
      explicitlyUnhealthy || explicitlyHealthy ? (lastCheckedAt ?? input.healthCheckedAt) : null,
  });
}

function validUnavailablePluginEntry(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const diagnostic = recordValue(value["diagnostic"]);
  return (
    stringValue(value["id"]) !== null &&
    value["state"] === "configured-unavailable" &&
    diagnostic?.["kind"] === "plugin-verification" &&
    stringValue(diagnostic["reason"]) !== null &&
    stringValue(diagnostic["detail"]) !== null
  );
}

function modelCatalogPayloadIsUsable(result: Result<unknown>): boolean {
  if (!result.ok) return false;
  const root = recordValue(result.value);
  const models = root?.["models"];
  return (
    Array.isArray(models) &&
    models.every((model) => {
      if (!isRecord(model)) return false;
      const providerId = modelRecordProviderId(model);
      return providerId !== null && modelRecordId(model, providerId) !== null;
    })
  );
}

const agentReadinessReasonOrder = [
  "model_assignment_missing",
  "model_catalog_unavailable",
  "model_route_unresolved",
  "provider_auth_unknown",
  "provider_not_authenticated",
  "config_row_missing",
  "canonical_config_unavailable",
  "config_drift",
  "tool_policy_unavailable",
  "tool_policy_drift",
] as const;

type AgentReadinessReasonCode = (typeof agentReadinessReasonOrder)[number];

function isOpzavaOwnedAgentId(agentId: string): boolean {
  return agentId === ASK_ADMIN_AGENT_ID || agentId.startsWith("subagent-");
}

function canonicalOwnedAgentRows(input: {
  readonly config: Record<string, unknown>;
  readonly catalog: readonly ModelProviderCatalogEntry[];
  readonly providerConnections: readonly ProviderConnectionState[];
}): readonly Record<string, unknown>[] | null {
  const askAdmin = agentsList(input.config).find(
    (agent) => stringValue(agent["id"]) === ASK_ADMIN_AGENT_ID,
  );
  const selectedModel = modelSelectorPrimary(askAdmin?.["model"]);
  const selectedProviderId =
    selectedModel === null
      ? null
      : (input.providerConnections.find((connection) =>
          providerIdentitiesMatch(connection.providerId, modelProviderId(selectedModel) ?? ""),
        )?.providerId ?? null);
  const selection =
    selectedModel !== null && selectedProviderId !== null
      ? { model: selectedModel, providerId: selectedProviderId }
      : preferredConnectedOrchestratorSelection(input);
  if (selection === null) return null;

  const connectedProviderIds = new Set(
    input.providerConnections
      .filter((connection) => connection.status === "connected")
      .map((connection) => connection.providerId),
  );
  const canonical = buildOrchestratorAgentConfig({
    orchestratorModel: selection.model,
    subagents: connectedProviderSubagents({
      catalog: input.catalog,
      providerConnections: input.providerConnections,
      connectedProviderIds,
      orchestratorProviderId: selection.providerId,
    }),
  });
  return canonical.ok ? canonical.value.agents.list : null;
}

function agentReadinessComponent(input: {
  readonly agentId: string;
  readonly label: string;
  readonly checkedAt: string;
  readonly config: Record<string, unknown>;
  readonly canonicalRows: readonly Record<string, unknown>[] | null;
  readonly catalog: readonly ModelProviderCatalogEntry[];
  readonly providerConnections: readonly ProviderConnectionState[];
  readonly modelCatalogAvailable: boolean;
  readonly authStatusAvailable: boolean;
}): OpenClawHealthComponent {
  if (!isOpzavaOwnedAgentId(input.agentId)) {
    return healthComponent({
      id: `agent:${input.agentId}`,
      kind: "agent",
      label: input.label,
      status: "not_checked",
      managed: false,
      detail: "Unmanaged (not an Opzava agent).",
      lastCheckedAt: null,
    });
  }

  const reasons = new Map<AgentReadinessReasonCode, string>();
  const live = agentsList(input.config).find((agent) => stringValue(agent["id"]) === input.agentId);
  const model = modelSelectorPrimary(live?.["model"]);
  let providerId: string | null = null;
  if (model === null) {
    reasons.set("model_assignment_missing", "model_assignment_missing");
  } else if (!input.modelCatalogAvailable) {
    reasons.set("model_catalog_unavailable", "model_catalog_unavailable");
  } else {
    providerId = modelProviderId(model);
    const modelId = model.includes("/") ? model.slice(model.indexOf("/") + 1) : model;
    const provider = input.catalog.find((entry) =>
      providerIdentitiesMatch(entry.id, providerId ?? ""),
    );
    const resolves =
      provider !== undefined &&
      Array.isArray(provider.catalogModels) &&
      provider.catalogModels.some((entry) => entry.id.toLowerCase() === modelId.toLowerCase());
    if (!resolves) reasons.set("model_route_unresolved", `model_route_unresolved:${model}`);
  }

  if (providerId !== null) {
    const connection = input.providerConnections.find((entry) =>
      providerIdentitiesMatch(entry.providerId, providerId),
    );
    if (connection === undefined || !input.authStatusAvailable || connection.authHealth == null) {
      reasons.set("provider_auth_unknown", `provider_auth_unknown:${providerId}`);
    } else if (
      connection.status !== "connected" ||
      connection.authHealth === "expired" ||
      connection.authHealth === "missing"
    ) {
      reasons.set("provider_not_authenticated", `provider_not_authenticated:${providerId}`);
    }
  }

  const wanted = input.canonicalRows?.find((agent) => stringValue(agent["id"]) === input.agentId);
  if (live === undefined) {
    reasons.set("config_row_missing", "config_row_missing");
  }
  if (input.canonicalRows === null) {
    reasons.set("canonical_config_unavailable", "canonical_config_unavailable");
  } else if (wanted !== undefined && live !== undefined) {
    if (!ownedAgentRowEquals(live, wanted)) reasons.set("config_drift", "config_drift");
    const liveTools = recordValue(live["tools"]);
    const wantedTools = recordValue(wanted["tools"]);
    if (liveTools === null || wantedTools === null) {
      reasons.set("tool_policy_unavailable", "tool_policy_unavailable");
    } else if (!ownedConfigValueEquals(liveTools, wantedTools)) {
      reasons.set("tool_policy_drift", "tool_policy_drift");
    }
  } else if (live !== undefined) {
    reasons.set("config_drift", "config_drift");
    reasons.set("tool_policy_drift", "tool_policy_drift");
  }

  const orderedReasons = agentReadinessReasonOrder.flatMap((code) => {
    const reason = reasons.get(code);
    return reason === undefined ? [] : [reason];
  });
  const unknown = orderedReasons.some(
    (reason) =>
      reason === "model_assignment_missing" ||
      reason === "model_catalog_unavailable" ||
      reason.startsWith("provider_auth_unknown:") ||
      reason === "config_row_missing" ||
      reason === "canonical_config_unavailable" ||
      reason === "tool_policy_unavailable",
  );
  const status = unknown ? "not_checked" : orderedReasons.length > 0 ? "attention" : "healthy";
  return healthComponent({
    id: `agent:${input.agentId}`,
    kind: "agent",
    label: input.label,
    status,
    detail:
      orderedReasons.length === 0
        ? "Agent readiness checks passed."
        : `Agent readiness: ${orderedReasons.join(", ")}.`,
    lastCheckedAt: status === "not_checked" ? null : input.checkedAt,
  });
}

function projectOpenClawComponents(input: {
  readonly healthResult: Result<unknown>;
  readonly config: Record<string, unknown>;
  readonly catalog: readonly ModelProviderCatalogEntry[];
  readonly providerConnections: readonly ProviderConnectionState[];
  readonly modelCatalogAvailable: boolean;
  readonly authStatusAvailable: boolean;
}): {
  readonly components: readonly OpenClawHealthComponent[];
  readonly warnings: OpenClawHealth["warnings"];
  readonly checkedAt: string | null;
} {
  if (!input.healthResult.ok) {
    return { components: unknownCoreHealthComponents(), warnings: [], checkedAt: null };
  }
  const health = recordValue(input.healthResult.value);
  const checkedAt = isoTimestamp(health?.["ts"]);
  if (health === null || health["ok"] !== true || checkedAt === null) {
    return { components: unknownCoreHealthComponents(), warnings: [], checkedAt: null };
  }

  const components: OpenClawHealthComponent[] = [
    healthComponent({
      ...coreHealthComponents[0],
      status: "healthy",
      detail: "The Gateway health RPC responded successfully.",
      lastCheckedAt: checkedAt,
    }),
  ];
  const eventLoop = recordValue(health["eventLoop"]);
  components.push(
    healthComponent({
      ...coreHealthComponents[1],
      status:
        eventLoop?.["degraded"] === true
          ? "attention"
          : eventLoop?.["degraded"] === false
            ? "healthy"
            : "not_checked",
      detail:
        eventLoop?.["degraded"] === true
          ? "The Gateway reported degraded event-loop health."
          : eventLoop?.["degraded"] === false
            ? "Event-loop health is within limits."
            : "Event-loop health was not checked.",
      lastCheckedAt: typeof eventLoop?.["degraded"] === "boolean" ? checkedAt : null,
    }),
  );

  const plugins = health["plugins"];
  const pluginRecord = recordValue(plugins);
  const pluginLoaded = pluginRecord?.["loaded"];
  const pluginErrors = pluginRecord?.["errors"];
  const pluginUnavailable = pluginRecord?.["unavailable"];
  const validPluginFacts =
    pluginRecord !== null &&
    Array.isArray(pluginLoaded) &&
    pluginLoaded.every((entry) => typeof entry === "string") &&
    Array.isArray(pluginErrors) &&
    pluginErrors.every(
      (entry) =>
        isRecord(entry) &&
        stringValue(entry["id"]) !== null &&
        stringValue(entry["origin"]) !== null &&
        typeof entry["activated"] === "boolean" &&
        stringValue(entry["error"]) !== null,
    ) &&
    Array.isArray(pluginUnavailable) &&
    pluginUnavailable.every(validUnavailablePluginEntry);
  const pluginErrorCount = Array.isArray(pluginErrors) ? pluginErrors.length : 0;
  const pluginUnavailableCount = Array.isArray(pluginUnavailable) ? pluginUnavailable.length : 0;
  const pluginIssueCount = pluginErrorCount + pluginUnavailableCount;
  components.push(
    healthComponent({
      ...coreHealthComponents[2],
      status: !validPluginFacts ? "not_checked" : pluginIssueCount > 0 ? "attention" : "healthy",
      detail: !validPluginFacts
        ? "Plugin availability was not checked."
        : pluginIssueCount > 0
          ? `${pluginErrorCount} plugin error${pluginErrorCount === 1 ? "" : "s"} and ${pluginUnavailableCount} unavailable plugin${pluginUnavailableCount === 1 ? "" : "s"} reported.`
          : "No plugin errors or unavailable plugins were reported.",
      lastCheckedAt: validPluginFacts ? checkedAt : null,
    }),
  );

  const contextEngines = health["contextEngines"];
  const contextRecord = recordValue(contextEngines);
  const quarantined = contextRecord?.["quarantined"];
  const validContextFacts =
    contextEngines === undefined ||
    (contextRecord !== null &&
      Array.isArray(quarantined) &&
      quarantined.every(
        (entry) =>
          isRecord(entry) &&
          stringValue(entry["engineId"]) !== null &&
          stringValue(entry["operation"]) !== null &&
          stringValue(entry["reason"]) !== null &&
          numberValue(entry["failedAt"]) !== null,
      ));
  const quarantineCount = Array.isArray(quarantined) ? quarantined.length : 0;
  components.push(
    healthComponent({
      ...coreHealthComponents[3],
      status: !validContextFacts ? "not_checked" : quarantineCount > 0 ? "attention" : "healthy",
      detail: !validContextFacts
        ? "Context-engine health could not be read."
        : quarantineCount > 0
          ? `${quarantineCount} context engine${quarantineCount === 1 ? " is" : "s are"} quarantined.`
          : "No context engines are quarantined.",
      lastCheckedAt: validContextFacts ? checkedAt : null,
    }),
  );

  const deliveryQueues = recordValue(health["deliveryQueues"]);
  const failedDeliveries = deliveryQueues?.["failed"];
  const validDeliveryQueueFacts =
    deliveryQueues !== null &&
    Array.isArray(failedDeliveries) &&
    failedDeliveries.every(
      (entry) =>
        isRecord(entry) &&
        stringValue(entry["queueName"]) !== null &&
        Number.isSafeInteger(entry["count"]) &&
        numberValue(entry["count"]) !== null &&
        (numberValue(entry["count"]) ?? -1) >= 0,
    );
  const deadLetterCount = Array.isArray(failedDeliveries)
    ? failedDeliveries.reduce(
        (total, entry) => total + (isRecord(entry) ? (numberValue(entry["count"]) ?? 0) : 0),
        0,
      )
    : 0;
  components.push(
    healthComponent({
      ...coreHealthComponents[4],
      status: !validDeliveryQueueFacts
        ? "not_checked"
        : deadLetterCount > 0
          ? "attention"
          : "healthy",
      detail: !validDeliveryQueueFacts
        ? "Delivery queue failures were not checked."
        : deadLetterCount > 0
          ? `${deadLetterCount} dead-lettered deliver${deadLetterCount === 1 ? "y" : "ies"} reported.`
          : "No dead-lettered deliveries were reported.",
      lastCheckedAt: validDeliveryQueueFacts ? checkedAt : null,
    }),
  );

  const configReload = recordValue(health["configReload"]);
  const hotReloadStatus = stringValue(configReload?.["hotReloadStatus"]);
  const validConfigReloadFact = hotReloadStatus === "active" || hotReloadStatus === "disabled";
  components.push(
    healthComponent({
      ...coreHealthComponents[5],
      status: !validConfigReloadFact
        ? "not_checked"
        : hotReloadStatus === "active"
          ? "healthy"
          : "attention",
      detail: !validConfigReloadFact
        ? "Config reload status was not checked."
        : hotReloadStatus === "active"
          ? "Config hot reload is active."
          : "Config hot reload is disabled.",
      lastCheckedAt: validConfigReloadFact ? checkedAt : null,
    }),
  );

  const channels = recordValue(health["channels"]);
  if (channels !== null) {
    const order = Array.isArray(health["channelOrder"])
      ? health["channelOrder"].filter((entry): entry is string => typeof entry === "string")
      : [];
    const channelIds = [
      ...order.filter((id) => channels[id] !== undefined),
      ...Object.keys(channels)
        .filter((id) => !order.includes(id))
        .sort(),
    ];
    const labels = recordValue(health["channelLabels"]);
    for (const channelId of channelIds) {
      const channel = recordValue(channels[channelId]);
      if (channel === null) continue;
      for (const [accountId, account] of [...channelAccountRecords(channel)].sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        components.push(
          channelAccountComponent({
            channelId,
            channelLabel: stringValue(labels?.[channelId]) ?? channelId,
            accountId,
            account,
            healthCheckedAt: checkedAt,
          }),
        );
      }
    }
  }

  const canonicalRows = canonicalOwnedAgentRows(input);
  if (Array.isArray(health["agents"])) {
    const agents = health["agents"]
      .filter((agent): agent is Record<string, unknown> => isRecord(agent))
      .map((agent) => ({ agent, agentId: stringValue(agent["agentId"]) }))
      .filter(
        (entry): entry is { agent: Record<string, unknown>; agentId: string } =>
          entry.agentId !== null,
      )
      .sort((left, right) => left.agentId.localeCompare(right.agentId));
    for (const { agent, agentId } of agents) {
      components.push(
        agentReadinessComponent({
          agentId,
          label: stringValue(agent["name"]) ?? agentId,
          checkedAt,
          config: input.config,
          canonicalRows,
          catalog: input.catalog,
          providerConnections: input.providerConnections,
          modelCatalogAvailable: input.modelCatalogAvailable,
          authStatusAvailable: input.authStatusAvailable,
        }),
      );
    }
  }

  const pricing = recordValue(health["modelPricing"]);
  const canonicalIds = new Set(
    (canonicalRows ?? [])
      .map((agent) => stringValue(agent["id"]))
      .filter((id): id is string => id !== null),
  );
  const liveOwnedIds = new Set(
    agentsList(input.config)
      .map((agent) => stringValue(agent["id"]))
      .filter((id): id is string => id !== null && isOpzavaOwnedAgentId(id)),
  );
  const ownershipDrift =
    canonicalIds.size > 0 &&
    (liveOwnedIds.size !== canonicalIds.size ||
      [...liveOwnedIds].some((id) => !canonicalIds.has(id)));
  const warnings: OpenClawHealth["warnings"] = [
    ...(ownershipDrift
      ? [
          {
            id: "agent-ownership-drift",
            label: "Agent ownership",
            detail: "The Opzava-owned agent set differs from canonical configuration.",
          },
        ]
      : []),
    ...(pricing?.["state"] === "degraded"
      ? [
          {
            id: "model-pricing",
            label: "Model pricing",
            detail: "Model pricing refresh is degraded; runtime health is unaffected.",
          },
        ]
      : []),
  ];
  return { components, warnings, checkedAt };
}

function projectOpenClawRuntimeAndSessions(input: {
  readonly statusResult: Result<unknown>;
  readonly healthResult: Result<unknown>;
  readonly metadata: ReturnType<OpenClawAdminRpcPort["connectionMetadata"]>;
}): Pick<OpenClawHealth, "runtime" | "sessions"> {
  const status = input.statusResult.ok ? recordValue(input.statusResult.value) : null;
  const sessions = recordValue(status?.["sessions"]);
  const count = sessions?.["count"];
  const recent = sessions?.["recent"];
  const validStatus =
    status !== null &&
    sessions !== null &&
    typeof count === "number" &&
    Number.isSafeInteger(count) &&
    count >= 0 &&
    Array.isArray(recent);
  const health = input.healthResult.ok ? recordValue(input.healthResult.value) : null;
  const healthSessions = recordValue(health?.["sessions"]);
  const healthCount = healthSessions?.["count"];
  const healthRecent = healthSessions?.["recent"];
  const validHealthSessions =
    health?.["ok"] === true &&
    healthSessions !== null &&
    typeof healthCount === "number" &&
    Number.isSafeInteger(healthCount) &&
    healthCount >= 0 &&
    Array.isArray(healthRecent);
  const sessionRows = validStatus ? recent : validHealthSessions ? healthRecent : [];

  return {
    runtime: {
      version:
        (status === null ? null : stringValue(status["runtimeVersion"])) ??
        input.metadata?.serverVersion ??
        null,
      uptimeMs: input.metadata?.uptimeMs ?? null,
      hostUptimeMs: null,
      updateAvailable: input.metadata?.updateAvailable ?? null,
    },
    sessions: {
      count: validStatus ? count : validHealthSessions ? healthCount : null,
      recent:
        validStatus || validHealthSessions
          ? sessionRows.filter(isRecord).map((entry) => {
              const ageMs = numberValue(entry["ageMs"] ?? entry["age"]);
              return {
                agentId: validStatus ? stringValue(entry["agentId"]) : null,
                updatedAt: isoTimestamp(entry["updatedAt"]),
                ageMs: ageMs !== null && ageMs >= 0 ? ageMs : null,
              };
            })
          : [],
    },
  };
}

export {
  agentReadinessComponent,
  agentReadinessReasonOrder,
  canonicalOwnedAgentRows,
  channelAccountComponent,
  channelAccountRecords,
  coreHealthComponents,
  firstNestedString,
  firstNestedTimestamp,
  gatewayConnectionState,
  gatewayRegion,
  githubTokenScopes,
  healthComponent,
  healthPayloadIsUnavailable,
  isOpzavaOwnedAgentId,
  isoTimestamp,
  modelCatalogPayloadIsUsable,
  negativeChannelHealthStates,
  positiveChannelHealthStates,
  projectOpenClawComponents,
  projectOpenClawRuntimeAndSessions,
  unknownCoreHealthComponents,
  validUnavailablePluginEntry,
};

export type { AgentReadinessReasonCode };
