import { createHash } from "node:crypto";

import {
  canonicalModelProviderAuthId,
  canonicalProviderLabel,
  classifyModelProvider,
  listCanonicalLlmProviderIds,
  type ConnectedAuthMode,
  type GatewayRuntimeAuthChoice,
  type ModelProviderAuthChoice,
  type ModelProviderCatalogEntry,
  type ModelSummary,
  type OrchestratorDelegationState,
  type OrchestratorReconcileState,
  type OrchestratorSubagentRole,
  type ProviderAuthHealth,
  type ProviderConnectionState,
} from "@opzava/ports";

import { ASK_ADMIN_AGENT_ID } from "./ask-admin-agent.js";
import { buildDelegationProvisioningReceipt, buildOrchestratorAgentConfig } from "./connections.js";

const durableCredentialStore = "config.auth.profiles";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function arrayValue(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function stringArrayValue(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

function splitScope(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return value
      .split(/[,\s]+/)
      .map((scope) => scope.trim())
      .filter((scope) => scope !== "");
  }

  return stringArrayValue(value);
}

function configPayload(payload: unknown): Record<string, unknown> {
  const root = recordValue(payload);
  if (root === null) {
    return {};
  }

  return recordValue(root["config"]) ?? root;
}

function authConfig(config: Record<string, unknown>): Record<string, unknown> {
  return recordValue(config["auth"]) ?? {};
}

function authProfiles(config: Record<string, unknown>): Record<string, unknown> {
  return recordValue(authConfig(config)["profiles"]) ?? {};
}

function authOrder(config: Record<string, unknown>): Record<string, unknown> {
  return recordValue(authConfig(config)["order"]) ?? {};
}

function canonicalProviderIdentity(providerId: string): string {
  return canonicalModelProviderAuthId(providerId);
}

function providerIdentitiesMatch(left: string | null, right: string): boolean {
  return left !== null && canonicalProviderIdentity(left) === canonicalProviderIdentity(right);
}

function providerIdentityEntries<T>(
  record: Readonly<Record<string, T>>,
  providerId: string,
): {
  readonly exact: readonly (readonly [string, T])[];
  readonly aliases: readonly (readonly [string, T])[];
} {
  const entries = Object.entries(record);
  const normalizedProviderId = providerId.trim().toLowerCase();
  return {
    exact: entries.filter(([candidate]) => candidate.trim().toLowerCase() === normalizedProviderId),
    aliases: entries.filter(
      ([candidate]) =>
        candidate.trim().toLowerCase() !== normalizedProviderId &&
        providerIdentitiesMatch(candidate, providerId),
    ),
  };
}

function authOrderEntry(
  config: Record<string, unknown>,
  providerId: string,
): { readonly present: boolean; readonly value: unknown; readonly ambiguous: boolean } {
  const entries = providerIdentityEntries(authOrder(config), providerId);
  // Mainframe currently accepts the first canonical-equivalent key in insertion order. The worker
  // is intentionally stricter: prefer one exact catalog key, accept one alias fallback, and fail
  // closed when same-priority keys disagree about which profile is selectable.
  if (entries.exact.length > 1 || entries.aliases.length > 1) {
    return { present: true, value: undefined, ambiguous: true };
  }
  const exact = entries.exact[0];
  const alias = entries.aliases[0];
  if (exact !== undefined && alias !== undefined) {
    return JSON.stringify(exact[1]) === JSON.stringify(alias[1])
      ? { present: true, value: exact[1], ambiguous: false }
      : { present: true, value: undefined, ambiguous: true };
  }
  const candidate = exact ?? alias;
  return candidate === undefined
    ? { present: false, value: undefined, ambiguous: false }
    : { present: true, value: candidate[1], ambiguous: false };
}

function providerHasBlockingAuthOrder(
  config: Record<string, unknown>,
  providerId: string,
): boolean {
  const order = authOrderEntry(config, providerId);
  return (
    order.ambiguous || (order.present && firstProfileIdForProvider(providerId, config) === null)
  );
}

function agentsList(config: Record<string, unknown>): readonly Record<string, unknown>[] {
  const agents = recordValue(config["agents"]);
  return arrayValue(agents?.["list"]).filter(isRecord);
}

function configuredLogoutAgentIds(config: Record<string, unknown>): readonly string[] {
  const seen = new Set<string>();
  const agentIds: string[] = [];

  // `main` is NOT skipped. It used to be, on the assumption that the un-agented logout (which
  // targets the *default* agent) already covered it — true only while default === main, which
  // Opzava is not. Now that connect writes the shared credential into `main`, a disconnect that
  // skipped it would leave a live credential behind: disconnected-but-still-usable.
  for (const agent of agentsList(config)) {
    const agentId = stringValue(agent["id"]);
    if (agentId === null || seen.has(agentId)) {
      continue;
    }
    seen.add(agentId);
    agentIds.push(agentId);
  }

  return agentIds;
}

function logoutTarget(params: { readonly provider: string; readonly agent?: string }): string {
  return typeof params.agent === "string" && params.agent.trim() !== "" ? params.agent : "default";
}

function authLogoutSuccessSummary(payload: unknown): {
  readonly removedProfilesCount: number;
  readonly abortedRunIdsCount: number;
} {
  const root = recordValue(payload);
  return {
    removedProfilesCount: arrayValue(root?.["removedProfiles"]).length,
    abortedRunIdsCount: arrayValue(root?.["abortedRunIds"]).length,
  };
}

function providerIdFromProfile(id: string, profile: Record<string, unknown>): string | null {
  return (
    stringValue(profile["providerId"]) ??
    stringValue(profile["provider"]) ??
    (id.includes(":") ? (id.split(":", 1)[0] ?? null) : null) ??
    (id.includes("-") ? (id.split("-", 1)[0] ?? null) : null)
  );
}

function providerIdFromProfilePrefix(id: string): string | null {
  return id.includes(":") ? (id.split(":", 1)[0] ?? null) : null;
}

function authChoiceIdFromProfile(id: string, profile: Record<string, unknown>): string | null {
  return (
    stringValue(profile["authChoiceId"]) ??
    stringValue(profile["authChoice"]) ??
    stringValue(profile["choice"]) ??
    (id.includes("-") ? id.slice(id.indexOf("-") + 1) : null)
  );
}

function authModeFromChoiceId(choiceId: string): "api-key" | "device-flow" {
  const normalized = choiceId.toLowerCase();
  return normalized.includes("oauth") || normalized.includes("device") ? "device-flow" : "api-key";
}

function setupTokenKeyFlag(choiceId: string): string | null {
  return choiceId.toLowerCase() === "setup-token" ? "token" : null;
}

function authChoiceFromUnknown(value: unknown, providerId: string): ModelProviderAuthChoice | null {
  if (typeof value === "string") {
    return {
      id: value,
      label: value,
      mode: authModeFromChoiceId(value),
      providerId,
      ...(authModeFromChoiceId(value) === "api-key" ? { keyFlag: value } : {}),
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  const id = stringValue(value["id"]) ?? stringValue(value["authChoiceId"]);
  if (id === null) {
    return null;
  }

  const modeValue = stringValue(value["mode"]) ?? stringValue(value["type"]);
  const mode =
    modeValue === "device-flow" || modeValue === "oauth" ? "device-flow" : authModeFromChoiceId(id);
  const keyFlag = stringValue(value["keyFlag"]) ?? setupTokenKeyFlag(id);
  const docsPath = stringValue(value["docsPath"]);
  return {
    id,
    label: stringValue(value["label"]) ?? id,
    mode,
    providerId,
    ...(keyFlag === null ? {} : { keyFlag }),
    ...(docsPath === null ? {} : { docsPath }),
  };
}

function modelProviderId(modelRef: string): string | null {
  const [providerId] = modelRef.trim().split("/", 1);
  return providerId === undefined || providerId === "" ? null : providerId;
}

function modelRefMatchesProvider(modelRef: string, providerId: string): boolean {
  return modelProviderId(modelRef)?.toLowerCase() === providerId.toLowerCase();
}

function modelSelectorPrimary(value: unknown): string | null {
  if (typeof value === "string") {
    return stringValue(value);
  }

  const record = recordValue(value);
  return record === null ? null : stringValue(record["primary"]);
}

function modelSelectorRefs(value: unknown): readonly string[] {
  if (typeof value === "string") {
    const ref = stringValue(value);
    return ref === null ? [] : [ref];
  }

  const record = recordValue(value);
  if (record === null) {
    return [];
  }
  const primary = stringValue(record["primary"]);
  const fallbacks = arrayValue(record["fallbacks"])
    .map((entry) => stringValue(entry))
    .filter((entry): entry is string => entry !== null);
  return primary === null ? fallbacks : [primary, ...fallbacks];
}

const agentModelSelectorKeys = [
  "model",
  "imageModel",
  "imageGenerationModel",
  "videoGenerationModel",
  "musicGenerationModel",
  "voiceModel",
  "pdfModel",
] as const;

function gatewayPrimaryModel(config: Record<string, unknown>): string | null {
  const defaults = recordValue(recordValue(config["agents"])?.["defaults"]);
  return modelSelectorPrimary(defaults?.["model"]);
}

function gatewayDefaultModels(config: Record<string, unknown>): Record<string, unknown> {
  const defaults = recordValue(recordValue(config["agents"])?.["defaults"]);
  return recordValue(defaults?.["models"]) ?? {};
}

function providerModelRef(providerId: string, modelId: string): string {
  return modelId.includes("/") ? modelId : `${providerId}/${modelId}`;
}

function firstConfiguredProviderModel(
  providerId: string,
  config: Record<string, unknown>,
): string | null {
  const modelsConfig = recordValue(config["models"]);
  const providers = recordValue(modelsConfig?.["providers"]);
  const provider = recordValue(providers?.[providerId]);
  if (provider === null) {
    return null;
  }

  const direct =
    modelSelectorPrimary(provider["model"]) ??
    modelSelectorPrimary(provider["default"]) ??
    stringValue(provider["primary"]) ??
    stringValue(provider["defaultModel"]) ??
    stringValue(provider["defaultModelId"]) ??
    stringValue(provider["modelId"]);
  if (direct !== null) {
    return providerModelRef(providerId, direct);
  }

  const configuredModel = arrayValue(provider["models"])
    .map((entry) =>
      typeof entry === "string"
        ? stringValue(entry)
        : isRecord(entry)
          ? (stringValue(entry["id"]) ?? stringValue(entry["model"]) ?? stringValue(entry["name"]))
          : null,
    )
    .find((value): value is string => value !== null);
  return configuredModel === undefined ? null : providerModelRef(providerId, configuredModel);
}

function configuredModelRefs(config: Record<string, unknown>): readonly string[] {
  const refs = new Set<string>();
  const agents = recordValue(config["agents"]);
  const collect = (agentLike: unknown): void => {
    const rec = recordValue(agentLike);
    if (rec === null) {
      return;
    }
    for (const key of agentModelSelectorKeys) {
      for (const ref of modelSelectorRefs(rec[key])) {
        refs.add(ref);
      }
    }
    for (const key of Object.keys(recordValue(rec["models"]) ?? {})) {
      refs.add(key);
    }
  };
  collect(recordValue(agents?.["defaults"]));
  for (const agent of arrayValue(agents?.["list"])) {
    collect(agent);
  }
  // A connected auth profile can pin the routed model directly (auth.profiles[<id>].model) — this is
  // where an api-key provider's active model lives (e.g. zai -> "zai/glm-5.2").
  for (const profile of Object.values(authProfiles(config))) {
    const model = isRecord(profile) ? modelSelectorPrimary(profile["model"]) : null;
    if (model !== null) {
      refs.add(model);
    }
  }
  return [...refs];
}

function enabledDefaultModelEntries(config: Record<string, unknown>): readonly {
  readonly key: string;
  readonly value: unknown;
}[] {
  const defaults = recordValue(recordValue(config["agents"])?.["defaults"]);
  return Object.entries(recordValue(defaults?.["models"]) ?? {}).map(([key, value]) => ({
    key,
    value,
  }));
}

function protectedModelRefs(config: Record<string, unknown>): ReadonlySet<string> {
  const refs = new Set<string>();
  const agents = recordValue(config["agents"]);
  const collect = (agentLike: unknown): void => {
    const record = recordValue(agentLike);
    if (record === null) {
      return;
    }
    for (const key of agentModelSelectorKeys) {
      for (const ref of modelSelectorRefs(record[key])) {
        refs.add(ref.toLowerCase());
      }
    }
  };
  collect(recordValue(agents?.["defaults"]));
  for (const agent of arrayValue(agents?.["list"])) {
    collect(agent);
  }
  for (const profile of Object.values(authProfiles(config))) {
    if (!isRecord(profile)) {
      continue;
    }
    for (const ref of modelSelectorRefs(profile["model"])) {
      refs.add(ref.toLowerCase());
    }
  }
  return refs;
}

function providerHasAuthProfile(config: Record<string, unknown>, providerId: string): boolean {
  return Object.entries(authProfiles(config)).some(
    ([profileId, profile]) =>
      isRecord(profile) &&
      providerIdentitiesMatch(providerIdFromProfile(profileId, profile), providerId),
  );
}

function configProviderEntry(input: {
  readonly config: Record<string, unknown>;
  readonly providerId: string;
}): { readonly key: string; readonly value: Record<string, unknown> } | null {
  const providers = recordValue(recordValue(input.config["models"])?.["providers"]);
  if (providers === null) {
    return null;
  }
  const entry = Object.entries(providers).find(
    ([key]) => key.toLowerCase() === input.providerId.toLowerCase(),
  );
  return entry === undefined || !isRecord(entry[1]) ? null : { key: entry[0], value: entry[1] };
}

interface PluginModelProviderCatalog {
  readonly baseUrl?: string;
  readonly api?: string;
  readonly models: readonly Record<string, unknown>[];
}

interface PluginModelCatalogDiscovery {
  readonly catalogs: readonly {
    readonly pluginId: string;
    readonly providers: Readonly<Record<string, PluginModelProviderCatalog>>;
  }[];
  readonly plugins: readonly { readonly id: string; readonly enabled: boolean }[];
}

function modelsListRecords(payload: unknown): readonly Record<string, unknown>[] {
  const root = recordValue(payload) ?? {};
  return [...arrayValue(root["models"]), ...(Array.isArray(payload) ? payload : [])].filter(
    isRecord,
  );
}

function modelRecordProviderId(model: Record<string, unknown>): string | null {
  const id = stringValue(model["id"]) ?? stringValue(model["model"]);
  return (
    stringValue(model["providerId"]) ??
    stringValue(model["provider"]) ??
    (id?.includes("/") === true ? (id.split("/", 1)[0] ?? null) : null)
  );
}

function modelRecordId(model: Record<string, unknown>, providerId: string): string | null {
  const raw = stringValue(model["id"]) ?? stringValue(model["model"]);
  if (raw === null) {
    return null;
  }
  const prefix = `${providerId}/`;
  return raw.toLowerCase().startsWith(prefix.toLowerCase()) ? raw.slice(prefix.length) : raw;
}

function modelSummaryFromRecord(
  model: Record<string, unknown>,
  providerId: string,
): ModelSummary | null {
  const id = modelRecordId(model, providerId);
  if (id === null || id === "") {
    return null;
  }
  return {
    id,
    label: stringValue(model["name"]) ?? stringValue(model["label"]) ?? id,
  };
}

function enabledPluginCatalogProvider(input: {
  readonly discovery: PluginModelCatalogDiscovery | null;
  readonly providerId: string;
}): PluginModelProviderCatalog | null {
  if (input.discovery === null) {
    return null;
  }
  const normalizedProvider = input.providerId.toLowerCase();
  const enabledPlugins = new Set(
    input.discovery.plugins
      .filter((plugin) => plugin.enabled)
      .map((plugin) => plugin.id.toLowerCase()),
  );
  for (const catalog of input.discovery.catalogs) {
    if (
      catalog.pluginId.toLowerCase() !== normalizedProvider ||
      !enabledPlugins.has(catalog.pluginId.toLowerCase())
    ) {
      continue;
    }
    const providerEntry = Object.entries(catalog.providers).find(
      ([providerId]) => providerId.toLowerCase() === normalizedProvider,
    );
    if (providerEntry !== undefined) {
      return providerEntry[1];
    }
  }
  return null;
}

function catalogModelsForProvider(input: {
  readonly modelsPayload: unknown;
  readonly discovery: PluginModelCatalogDiscovery | null;
  readonly providerId: string;
}): readonly ModelSummary[] {
  const seen = new Map<string, ModelSummary>();
  for (const model of modelsListRecords(input.modelsPayload)) {
    if (modelRecordProviderId(model)?.toLowerCase() !== input.providerId.toLowerCase()) {
      continue;
    }
    const summary = modelSummaryFromRecord(model, input.providerId);
    if (summary !== null) {
      seen.set(summary.id.toLowerCase(), summary);
    }
  }
  const pluginProvider = enabledPluginCatalogProvider({
    discovery: input.discovery,
    providerId: input.providerId,
  });
  for (const model of pluginProvider?.models ?? []) {
    const summary = modelSummaryFromRecord(model, input.providerId);
    if (summary !== null && !seen.has(summary.id.toLowerCase())) {
      seen.set(summary.id.toLowerCase(), summary);
    }
  }
  return [...seen.values()];
}

function pluginModelRecord(input: {
  readonly discovery: PluginModelCatalogDiscovery | null;
  readonly providerId: string;
  readonly modelId: string;
}): {
  readonly provider: PluginModelProviderCatalog;
  readonly model: Record<string, unknown>;
} | null {
  const provider = enabledPluginCatalogProvider(input);
  const model = provider?.models.find(
    (entry) =>
      modelRecordId(entry, input.providerId)?.toLowerCase() === input.modelId.toLowerCase(),
  );
  return provider === null || model === undefined ? null : { provider, model };
}

function configuredModelsForProvider(
  providerId: string,
  config: Record<string, unknown>,
): readonly ModelSummary[] {
  const seen = new Map<string, ModelSummary>();
  for (const ref of configuredModelRefs(config)) {
    if (!modelRefMatchesProvider(ref, providerId)) {
      continue;
    }
    const id = ref.includes("/") ? ref.slice(ref.indexOf("/") + 1) : ref;
    if (id !== "" && !seen.has(id)) {
      seen.set(id, { id, label: id });
    }
  }
  return [...seen.values()];
}

function enabledModelsForProvider(
  providerId: string,
  config: Record<string, unknown>,
): readonly ModelSummary[] {
  const seen = new Map<string, ModelSummary>();
  for (const { key } of enabledDefaultModelEntries(config)) {
    if (!modelRefMatchesProvider(key, providerId)) {
      continue;
    }
    const id = key.slice(key.indexOf("/") + 1);
    if (id !== "" && !seen.has(id.toLowerCase())) {
      seen.set(id.toLowerCase(), { id, label: id });
    }
  }
  return [...seen.values()];
}

function configuredModelForProvider(input: {
  readonly providerId: string;
  readonly config: Record<string, unknown>;
  readonly models?: readonly ModelSummary[] | undefined;
}): string | null {
  const configured = configuredModelsForProvider(input.providerId, input.config);
  if (configured[0] !== undefined) {
    return providerModelRef(input.providerId, configured[0].id);
  }

  const primary = gatewayPrimaryModel(input.config);
  if (primary !== null && modelRefMatchesProvider(primary, input.providerId)) {
    return primary;
  }

  return (
    firstConfiguredProviderModel(input.providerId, input.config) ?? input.models?.[0]?.id ?? null
  );
}

function withModelProviderClassification(
  provider: ModelProviderCatalogEntry,
  config: Record<string, unknown>,
  modelsPayload: unknown,
  discovery: PluginModelCatalogDiscovery | null,
): ModelProviderCatalogEntry {
  const classification = classifyModelProvider(provider.id);

  return {
    ...provider,
    label: classification.canonicalLabel ?? provider.label,
    category: classification.category,
    parentId: classification.parentId,
    runtimeLabel: classification.runtimeLabel,
    // Models come ONLY from the gateway CONFIG (the models it actually routes to) — never a raw
    // `models.list` catalog dump. Agnostic (no hardcoding) + aligned: a connected provider shows its
    // configured model(s); an unconfigured/unconnected provider shows none.
    // `agents.defaults.models` is the gateway's routable allow-list. Primaries and fallbacks are
    // protected references, but they do not become enabled choices merely by being referenced.
    models: enabledModelsForProvider(provider.id, config),
    catalogModels: catalogModelsForProvider({
      modelsPayload,
      discovery,
      providerId: provider.id,
    }),
  };
}

function providerCatalogFromModels(
  payload: unknown,
  config: Record<string, unknown>,
  discovery: PluginModelCatalogDiscovery | null = null,
): readonly ModelProviderCatalogEntry[] {
  const root = recordValue(payload) ?? {};
  const providerSources = [
    ...arrayValue(root["providers"]),
    ...arrayValue(root["authProviders"]),
    ...arrayValue(root["authChoices"]),
  ];
  // Model entries are used only to DISCOVER providers (which providers exist), never to populate the
  // per-provider model list — that comes from config (configuredModelsForProvider), keeping the
  // Models column agnostic and config-driven.
  const modelSources = [...arrayValue(root["models"]), ...(Array.isArray(payload) ? payload : [])];
  const catalog = new Map<string, ModelProviderCatalogEntry>();

  for (const providerSource of providerSources) {
    if (!isRecord(providerSource)) {
      continue;
    }

    const id = stringValue(providerSource["id"]) ?? stringValue(providerSource["providerId"]);
    if (id === null) {
      continue;
    }

    const authChoices = [
      ...arrayValue(providerSource["authChoices"]),
      ...arrayValue(providerSource["auth"]),
      ...arrayValue(providerSource["choices"]),
    ]
      .map((choice) => authChoiceFromUnknown(choice, id))
      .filter((choice): choice is ModelProviderAuthChoice => choice !== null);

    catalog.set(id, {
      id,
      label: stringValue(providerSource["label"]) ?? stringValue(providerSource["name"]) ?? id,
      vendor: stringValue(providerSource["vendor"]) ?? id,
      ...(stringValue(providerSource["docsPath"]) === null
        ? {}
        : { docsPath: stringValue(providerSource["docsPath"]) ?? "" }),
      authChoices,
      suggestedModel:
        stringValue(providerSource["suggestedModel"]) ?? stringValue(providerSource["model"]) ?? id,
      roleStrength: stringValue(providerSource["roleStrength"]) ?? "Gateway-advertised provider",
      whenToUse:
        stringValue(providerSource["whenToUse"]) ?? "Use when this connected model is appropriate.",
    });
  }

  for (const modelSource of modelSources) {
    if (!isRecord(modelSource)) {
      continue;
    }

    const modelId = stringValue(modelSource["id"]) ?? stringValue(modelSource["model"]);
    const providerId =
      stringValue(modelSource["providerId"]) ??
      stringValue(modelSource["provider"]) ??
      (modelId?.includes("/") === true ? (modelId.split("/", 1)[0] ?? null) : null);
    if (providerId === null) {
      continue;
    }

    const existing = catalog.get(providerId);
    if (existing !== undefined) {
      if (existing.suggestedModel === providerId && modelId !== null) {
        catalog.set(providerId, { ...existing, suggestedModel: modelId });
      }
      continue;
    }

    catalog.set(providerId, {
      id: providerId,
      label: stringValue(modelSource["providerLabel"]) ?? providerId,
      vendor: stringValue(modelSource["vendor"]) ?? providerId,
      authChoices: [],
      suggestedModel: modelId ?? providerId,
      roleStrength: "Gateway-advertised provider",
      whenToUse: "Use when this connected model is appropriate.",
    });
  }

  for (const [id, profile] of Object.entries(authProfiles(config))) {
    if (!isRecord(profile)) {
      continue;
    }

    const providerId = providerIdFromProfile(id, profile);
    if (providerId === null || catalog.has(providerId)) {
      continue;
    }

    const authChoiceId = authChoiceIdFromProfile(id, profile) ?? id;
    catalog.set(providerId, {
      id: providerId,
      label: providerId,
      vendor: providerId,
      authChoices: [
        {
          id: authChoiceId,
          label: authChoiceId,
          mode: authModeFromChoiceId(authChoiceId),
          providerId,
          ...(authModeFromChoiceId(authChoiceId) === "api-key" ? { keyFlag: authChoiceId } : {}),
        },
      ],
      suggestedModel: stringValue(profile["model"]) ?? providerId,
      roleStrength: "Connected provider",
      whenToUse: "Use when this connected model is appropriate.",
    });
  }

  return [...catalog.values()].map((provider) => {
    const withAuthChoices =
      provider.authChoices.length === 0
        ? {
            ...provider,
            authChoices: authChoicesFromConfig(provider.id, config),
          }
        : provider;

    return withModelProviderClassification(withAuthChoices, config, payload, discovery);
  });
}

function authChoicesFromConfig(
  providerId: string,
  config: Record<string, unknown>,
): readonly ModelProviderAuthChoice[] {
  const choices = arrayValue(authConfig(config)["choices"])
    .map((choice) => authChoiceFromUnknown(choice, providerId))
    .filter(
      (choice): choice is ModelProviderAuthChoice =>
        choice !== null && choice.providerId === providerId,
    );

  return choices;
}

function firstProfileIdForProvider(
  providerId: string,
  config: Record<string, unknown>,
): string | null {
  const order = authOrderEntry(config, providerId);
  const orderValue = order.value;
  if (Array.isArray(orderValue)) {
    const profiles = authProfiles(config);
    const ordered = orderValue.find((entry): entry is string => {
      if (typeof entry !== "string") {
        return false;
      }
      const profile = recordValue(profiles[entry]);
      return (
        profile !== null &&
        providerIdentitiesMatch(providerIdFromProfile(entry, profile), providerId)
      );
    });
    if (ordered !== undefined) {
      return ordered;
    }
    // Empty, ambiguous, missing, or cross-provider orders disable selection. Falling through to
    // inventory would make a provider look connected when the runtime cannot select its credential.
    return null;
  }

  if (typeof orderValue === "string" && orderValue.trim() !== "") {
    const profile = recordValue(authProfiles(config)[orderValue]);
    return profile !== null &&
      providerIdentitiesMatch(providerIdFromProfile(orderValue, profile), providerId)
      ? orderValue
      : null;
  }

  if (order.present) {
    return null;
  }

  for (const [id, profile] of Object.entries(authProfiles(config))) {
    const profileProviderId = isRecord(profile) ? providerIdFromProfile(id, profile) : null;
    if (providerIdentitiesMatch(profileProviderId, providerId)) {
      return id;
    }
  }

  return null;
}

function providerConnectionFromConfig(input: {
  readonly provider: ModelProviderCatalogEntry;
  readonly config: Record<string, unknown>;
  readonly now: Date;
}): ProviderConnectionState {
  const id = firstProfileIdForProvider(input.provider.id, input.config);
  const profile = id === null ? null : recordValue(authProfiles(input.config)[id]);
  const model = configuredModelForProvider({
    providerId: input.provider.id,
    config: input.config,
    models: input.provider.models,
  });
  if (id === null || profile === null) {
    return {
      providerId: input.provider.id,
      status: "not_connected",
      authChoiceId: null,
      accountLabel: null,
      scopes: [],
      model,
      usageLabel: null,
      lastCheckedAt: input.now.toISOString(),
      message: null,
      connectedAuthMode: null,
    };
  }

  const hasRoutableModel = model !== null;
  return {
    providerId: input.provider.id,
    status: hasRoutableModel ? "connected" : "needs_attention",
    authChoiceId: authChoiceIdFromProfile(id, profile),
    accountLabel: stringValue(profile["accountLabel"]) ?? stringValue(profile["label"]),
    scopes: stringArrayValue(profile["scopes"]),
    model,
    usageLabel: stringValue(profile["usageLabel"]),
    lastCheckedAt: input.now.toISOString(),
    message: hasRoutableModel
      ? "Opzava Gateway auth profile is present."
      : "Provider has credentials but no routable Gateway model.",
    // The config profile records its own auth mode (e.g. {mode:"api_key"}); surface it so Manage
    // renders the right form (rotate key vs subscription) instead of a dead "no auth method" state.
    connectedAuthMode: connectedAuthMode(profile["mode"]) ?? connectedAuthMode(profile["type"]),
  };
}

function orchestratorProviderIdFromConnections(input: {
  readonly primaryModel: string | null;
  readonly providerConnections: readonly ProviderConnectionState[];
}): string | null {
  if (input.primaryModel === null) {
    return null;
  }

  const primaryModel = input.primaryModel.trim();
  const connection = input.providerConnections.find(
    (entry) =>
      entry.status === "connected" && entry.model !== null && entry.model.trim() === primaryModel,
  );
  return connection?.providerId ?? modelProviderId(input.primaryModel);
}

function connectedProviderIdForModel(input: {
  readonly model: string | null;
  readonly providerConnections: readonly ProviderConnectionState[];
}): string | null {
  if (input.model === null) {
    return null;
  }

  const providerId = orchestratorProviderIdFromConnections({
    primaryModel: input.model,
    providerConnections: input.providerConnections,
  });
  return providerId !== null &&
    input.providerConnections.some(
      (connection) => connection.providerId === providerId && connection.status === "connected",
    )
    ? providerId
    : null;
}

function preferredConnectedOrchestratorSelection(input: {
  readonly config: Record<string, unknown>;
  readonly providerConnections: readonly ProviderConnectionState[];
}): { readonly model: string; readonly providerId: string } | null {
  const askAdmin = agentsList(input.config).find(
    (agent) => stringValue(agent["id"]) === ASK_ADMIN_AGENT_ID,
  );
  const selectedModel = modelSelectorPrimary(askAdmin?.["model"]);
  const selectedProviderId = connectedProviderIdForModel({
    model: selectedModel,
    providerConnections: input.providerConnections,
  });
  if (selectedModel !== null && selectedProviderId !== null) {
    return { model: selectedModel, providerId: selectedProviderId };
  }

  const primaryModel = gatewayPrimaryModel(input.config);
  const primaryProviderId = connectedProviderIdForModel({
    model: primaryModel,
    providerConnections: input.providerConnections,
  });
  return primaryModel !== null && primaryProviderId !== null
    ? { model: primaryModel, providerId: primaryProviderId }
    : null;
}

function currentOrchestratorState(input: {
  readonly config: Record<string, unknown>;
  readonly catalog: readonly ModelProviderCatalogEntry[];
  readonly providerConnections: readonly ProviderConnectionState[];
  readonly reconcile: OrchestratorReconcileState;
  readonly now: Date;
}): OrchestratorDelegationState {
  const askAdmin = agentsList(input.config).find(
    (agent) => stringValue(agent["id"]) === ASK_ADMIN_AGENT_ID,
  );
  const subagents = agentsList(input.config)
    .filter((agent) => stringValue(agent["id"])?.startsWith("subagent-") === true)
    .map((agent): OrchestratorSubagentRole | null => {
      const agentId = stringValue(agent["id"]);
      const providerId = agentId?.replace(/^subagent-/, "") ?? null;
      if (agentId === null || providerId === null) {
        return null;
      }

      const provider = input.catalog.find((entry) => entry.id === providerId);
      return {
        agentId,
        providerId,
        providerLabel: provider?.label ?? providerId,
        model: stringValue(agent["model"]) ?? provider?.suggestedModel ?? providerId,
        strength: provider?.roleStrength ?? "Connected provider",
        whenToUse: provider?.whenToUse ?? "Use when this connected model is appropriate.",
      };
    })
    .filter((entry): entry is OrchestratorSubagentRole => entry !== null);
  const subagentConfig = recordValue(askAdmin?.["subagents"]);
  const allowAgents = stringArrayValue(subagentConfig?.["allowAgents"]);
  const selection = preferredConnectedOrchestratorSelection({
    config: input.config,
    providerConnections: input.providerConnections,
  });

  return {
    orchestratorAgentId: ASK_ADMIN_AGENT_ID,
    orchestratorModel: selection?.model ?? null,
    orchestratorProviderId: selection?.providerId ?? null,
    delegationMode: "prefer",
    allowAgents,
    subagents,
    toolPolicyExpansion: {
      allow: ["sessions_spawn", "subagents", "group:sessions"],
      receiptId: askAdmin === undefined ? null : "openclaw-config",
    },
    reconcile: input.reconcile,
    updatedAt: askAdmin === undefined ? null : input.now.toISOString(),
  };
}

function connectedProviderSubagents(input: {
  readonly catalog: readonly ModelProviderCatalogEntry[];
  readonly providerConnections: readonly ProviderConnectionState[];
  readonly connectedProviderIds: ReadonlySet<string>;
  readonly orchestratorProviderId: string | null;
}): readonly OrchestratorSubagentRole[] {
  return input.providerConnections
    .filter(
      (connection) =>
        connection.status === "connected" &&
        input.connectedProviderIds.has(connection.providerId) &&
        connection.providerId !== input.orchestratorProviderId,
    )
    .map((connection): OrchestratorSubagentRole => {
      const provider = input.catalog.find((entry) => entry.id === connection.providerId);
      return {
        agentId: `subagent-${connection.providerId}`,
        providerId: connection.providerId,
        providerLabel: provider?.label ?? connection.providerId,
        model: connection.model ?? provider?.suggestedModel ?? connection.providerId,
        strength: provider?.roleStrength ?? "Connected provider",
        whenToUse: provider?.whenToUse ?? "Use when this connected model is appropriate.",
      };
    });
}

function orchestratorConfigIsCurrent(input: {
  readonly config: Record<string, unknown>;
  readonly orchestratorModel: string;
  readonly primaryModel: string | null;
  readonly subagents: readonly OrchestratorSubagentRole[];
}): boolean {
  if (input.orchestratorModel !== input.primaryModel) {
    return false;
  }
  if (
    !enabledDefaultModelEntries(input.config).some(
      ({ key }) => key.toLowerCase() === input.orchestratorModel.toLowerCase(),
    )
  ) {
    return false;
  }

  const canonical = buildOrchestratorAgentConfig({
    orchestratorModel: input.orchestratorModel,
    subagents: input.subagents,
  });
  if (!canonical.ok) {
    return false;
  }

  const agents = agentsList(input.config);
  const ownedIds = new Set(canonical.value.agents.list.map((agent) => agent.id));
  const liveOwned = agents.filter((agent) => {
    const id = stringValue(agent["id"]);
    return id === ASK_ADMIN_AGENT_ID || id?.startsWith("subagent-") === true;
  });
  if (
    liveOwned.length !== canonical.value.agents.list.length ||
    liveOwned.some((agent) => {
      const id = stringValue(agent["id"]);
      return id === null || !ownedIds.has(id);
    })
  ) {
    return false;
  }

  return canonical.value.agents.list.every((wanted) => {
    const live = liveOwned.find((agent) => stringValue(agent["id"]) === wanted.id);
    return live !== undefined && ownedAgentConfigEquals(live, wanted);
  });
}

function ownedAgentConfigEquals(
  live: Record<string, unknown>,
  wanted: Record<string, unknown>,
): boolean {
  return (
    ownedAgentRowEquals(live, wanted) &&
    ownedConfigValueEquals(recordValue(live["tools"]), recordValue(wanted["tools"]))
  );
}

function ownedAgentRowEquals(
  live: Record<string, unknown>,
  wanted: Record<string, unknown>,
): boolean {
  const liveRow = Object.fromEntries(Object.entries(live).filter(([key]) => key !== "tools"));
  const wantedRow = Object.fromEntries(Object.entries(wanted).filter(([key]) => key !== "tools"));
  return ownedConfigValueEquals(liveRow, wantedRow);
}

function ownedConfigValueEquals(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => ownedConfigValueEquals(value, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) {
    return false;
  }

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && ownedConfigValueEquals(left[key], right[rightKeys[index]!]),
    )
  );
}

function orchestratorModelForProvider(input: {
  readonly providerId: string | null;
  readonly catalog: readonly ModelProviderCatalogEntry[];
  readonly config: Record<string, unknown>;
}): string | null {
  if (input.providerId === null) {
    return null;
  }

  const provider = input.catalog.find((entry) => entry.id === input.providerId);
  const configuredModel = configuredModelForProvider({
    providerId: input.providerId,
    config: input.config,
    models: provider?.models,
  });
  if (configuredModel !== null) {
    return providerModelRef(input.providerId, configuredModel);
  }

  return provider?.suggestedModel === undefined
    ? null
    : providerModelRef(input.providerId, provider.suggestedModel);
}

function orchestratorDelegationState(input: {
  readonly orchestratorModel: string | null;
  readonly orchestratorProviderId: string | null;
  readonly subagents: readonly OrchestratorSubagentRole[];
  readonly now: Date;
}): OrchestratorDelegationState {
  const receipt = buildDelegationProvisioningReceipt({ subagents: input.subagents });
  return {
    orchestratorAgentId: ASK_ADMIN_AGENT_ID,
    orchestratorModel: input.orchestratorModel,
    orchestratorProviderId: input.orchestratorProviderId,
    delegationMode: "prefer",
    allowAgents: input.subagents.map((subagent) => subagent.agentId),
    subagents: input.subagents,
    toolPolicyExpansion: {
      allow: ["sessions_spawn", "subagents", "group:sessions"],
      receiptId: receiptId(receipt),
    },
    reconcile: { status: "idle" },
    updatedAt: input.now.toISOString(),
  };
}

function receiptId(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}

function providerChoiceRoots(providerId: string): readonly string[] {
  const roots = new Set<string>([providerId]);
  if (providerId === "anthropic") {
    roots.add("claude-max-api-proxy");
    roots.add("claude");
  }
  if (providerId.endsWith("-plan")) {
    roots.add(providerId.replace(/-plan$/, ""));
  }
  if (providerId.includes("-token-plan")) {
    roots.add(providerId.replace(/-token-plan.*$/, ""));
  }
  const [first] = providerId.split("-");
  if (first !== undefined && first !== "") {
    roots.add(first);
  }

  return [...roots];
}

function choiceMatchesProvider(input: {
  readonly providerId: string;
  readonly choiceId: string;
  readonly keyFlag: string | null;
}): boolean {
  if (input.providerId === "anthropic" && input.choiceId === "setup-token") {
    return true;
  }

  const roots = providerChoiceRoots(input.providerId);
  return roots.some(
    (root) =>
      input.choiceId === root ||
      input.choiceId.startsWith(`${root}-`) ||
      input.keyFlag === `${root}-api-key` ||
      input.keyFlag?.startsWith(`${root}-`) === true,
  );
}

function deviceCodeProviderArg(input: {
  readonly providerId: string;
  readonly authChoiceId: string;
}): string {
  return (
    providerChoiceRoots(input.providerId).find(
      (root) => input.authChoiceId === root || input.authChoiceId.startsWith(`${root}-`),
    ) ?? input.providerId
  );
}

function authChoicesForProvider(input: {
  readonly providerId: string;
  readonly choices: readonly GatewayRuntimeAuthChoice[];
}): readonly ModelProviderAuthChoice[] {
  const matches = input.choices.filter((choice) =>
    choiceMatchesProvider({
      providerId: input.providerId,
      choiceId: choice.id,
      keyFlag: choice.keyFlag ?? null,
    }),
  );
  const apiKeyLegacy = input.choices.find((choice) => choice.id === "apiKey");
  const roots = providerChoiceRoots(input.providerId);
  const legacyKeyFlag = roots
    .map((root) => `${root}-api-key`)
    .find((flag) => input.choices.some((choice) => choice.keyFlag === flag));
  const withLegacy =
    apiKeyLegacy !== undefined &&
    legacyKeyFlag !== undefined &&
    matches.every((choice) => choice.keyFlag !== legacyKeyFlag)
      ? [...matches, { ...apiKeyLegacy, keyFlag: legacyKeyFlag, mode: "api-key" as const }]
      : matches;

  return withLegacy.map((choice) => ({
    id: choice.id,
    label: choice.label,
    mode: choice.mode,
    providerId: input.providerId,
    ...(choice.keyFlag === undefined ? {} : { keyFlag: choice.keyFlag }),
  }));
}

function mergeRuntimeAuthChoices(input: {
  readonly catalog: readonly ModelProviderCatalogEntry[];
  readonly choices: readonly GatewayRuntimeAuthChoice[];
}): readonly ModelProviderCatalogEntry[] {
  return input.catalog.map((provider) => {
    const authChoices = authChoicesForProvider({
      providerId: provider.id,
      choices: input.choices,
    });
    if (authChoices.length === 0) {
      return provider;
    }

    const merged = new Map<string, ModelProviderAuthChoice>();
    for (const choice of [...provider.authChoices, ...authChoices]) {
      merged.set(`${choice.providerId}:${choice.mode}:${choice.id}`, choice);
    }

    return { ...provider, authChoices: [...merged.values()] };
  });
}

function ensureCanonicalLlmProviders(input: {
  readonly catalog: readonly ModelProviderCatalogEntry[];
  readonly choices: readonly GatewayRuntimeAuthChoice[];
}): readonly ModelProviderCatalogEntry[] {
  // Compare case-insensitively so a mixed-case catalog id (e.g. "OpenAI") is not treated as absent
  // and duplicated by the lowercase canonical id (glm review LOW #2). Ids used for gateway writes are
  // left untouched — this normalizes only the dedupe comparison.
  const present = new Set(input.catalog.map((provider) => provider.id.toLowerCase()));
  const additions: ModelProviderCatalogEntry[] = [];

  for (const rootId of listCanonicalLlmProviderIds()) {
    if (present.has(rootId.toLowerCase())) {
      continue;
    }

    // Only ever ADD top-level LLM parents. A canonical id that folds under a parent (e.g. an
    // alias/plan/proxy like claude-max-api-proxy -> anthropic) must NOT become its own row — it
    // merges into its parent via the web projection instead.
    if (classifyModelProvider(rootId).parentId !== null) {
      continue;
    }

    const authChoices = authChoicesForProvider({ providerId: rootId, choices: input.choices });
    if (authChoices.length === 0) {
      continue;
    }

    const label = canonicalProviderLabel(rootId);
    additions.push({
      id: rootId,
      label,
      vendor: label,
      authChoices,
      suggestedModel: rootId,
      roleStrength: "Gateway-advertised provider",
      whenToUse: "Connect to route the fleet to this provider.",
      category: "llm",
      parentId: null,
      runtimeLabel: null,
      models: [],
    });
  }

  return [...input.catalog, ...additions];
}

function modelStatusAllowedModels(status: unknown): readonly string[] {
  const root = recordValue(status);
  return stringArrayValue(root?.["allowed"]);
}

function modelStatusProvider(status: unknown, providerId: string): Record<string, unknown> | null {
  const auth = recordValue(recordValue(status)?.["auth"]);
  const providers = arrayValue(auth?.["providers"]).filter(isRecord);
  const requestedProviderId = providerIdFromModel(providerId);
  return (
    providers.find(
      (provider) =>
        stringValue(provider["provider"])?.toLowerCase() === requestedProviderId.toLowerCase(),
    ) ??
    providers.find((provider) =>
      providerIdentitiesMatch(stringValue(provider["provider"]), requestedProviderId),
    ) ??
    null
  );
}

function modelStatusOAuthProvider(
  status: unknown,
  providerId: string,
): Record<string, unknown> | null {
  const auth = recordValue(recordValue(status)?.["auth"]);
  const oauth = recordValue(auth?.["oauth"]);
  return (
    arrayValue(oauth?.["providers"])
      .filter(isRecord)
      .find((provider) => providerIdentitiesMatch(stringValue(provider["provider"]), providerId)) ??
    null
  );
}

function providerIdFromModel(providerId: string): string {
  return providerId.split("/", 1)[0] ?? providerId;
}

function modelStatusProfileCount(provider: Record<string, unknown> | null): number {
  const profiles = recordValue(provider?.["profiles"]);
  const count = profiles?.["count"];
  if (typeof count === "number" && Number.isFinite(count)) {
    return count;
  }

  const typedCount = ["oauth", "token", "apiKey", "api_key", "api-key"]
    .map((key) => numberValue(profiles?.[key]) ?? 0)
    .reduce((sum, value) => sum + value, 0);
  return typedCount > 0 ? typedCount : modelStatusProfileLabels(provider).length;
}

function modelStatusProfileLabels(provider: Record<string, unknown> | null): readonly string[] {
  const profiles = recordValue(provider?.["profiles"]);
  return stringArrayValue(profiles?.["labels"]);
}

type ProviderAuthUsability = "usable" | "blocked" | "absent" | "unknown";

interface ModelStatusAuthEvidence {
  readonly usability: ProviderAuthUsability;
  readonly provider: Record<string, unknown> | null;
  readonly profileCount: number;
}

function modelStatusAuthEvidence(input: {
  readonly status: unknown;
  readonly providerId: string;
  readonly config: Record<string, unknown>;
}): ModelStatusAuthEvidence {
  const provider = modelStatusProvider(input.status, input.providerId);
  const profileCount = modelStatusProfileCount(provider);
  const evidence = (usability: ProviderAuthUsability): ModelStatusAuthEvidence => ({
    usability,
    provider,
    profileCount,
  });
  const root = recordValue(input.status);
  const auth = recordValue(root?.["auth"]);
  if (root === null || auth === null) {
    return evidence(
      providerHasBlockingAuthOrder(input.config, input.providerId) ? "blocked" : "unknown",
    );
  }

  const providerMatches = (value: unknown): boolean =>
    providerIdentitiesMatch(stringValue(value), input.providerId);
  if (stringArrayValue(auth["missingProvidersInUse"]).some(providerMatches)) {
    return evidence("blocked");
  }

  const routes = arrayValue(auth["runtimeAuthRoutes"])
    .filter(isRecord)
    .filter((route) => providerMatches(route["provider"]));
  if (routes.length > 0) {
    return evidence(
      routes.some((route) => stringValue(route["status"]) === "usable") ? "usable" : "blocked",
    );
  }

  const effectiveKind = stringValue(recordValue(provider?.["effective"])?.["kind"]);
  if (effectiveKind === "env" || effectiveKind === "models.json" || effectiveKind === "synthetic") {
    return evidence("usable");
  }

  const oauthProvider = modelStatusOAuthProvider(input.status, input.providerId);
  if (oauthProvider !== null && Object.hasOwn(oauthProvider, "effectiveProfiles")) {
    const effectiveProfiles = arrayValue(oauthProvider["effectiveProfiles"]).filter(isRecord);
    if (effectiveProfiles.length === 0) {
      return evidence("blocked");
    }
    return evidence(
      effectiveProfiles.some((profile) => {
        const status = stringValue(profile["status"]);
        return status === "ok" || status === "expiring" || status === "static";
      })
        ? "usable"
        : "blocked",
    );
  }

  if (effectiveKind === "profiles") {
    return evidence(profileCount > 0 ? "usable" : "blocked");
  }
  if (effectiveKind === "missing") {
    return evidence(profileCount > 0 ? "blocked" : "absent");
  }

  const providersPresent = Object.hasOwn(auth, "providers");
  if (provider !== null) {
    if (providerHasBlockingAuthOrder(input.config, input.providerId)) {
      return evidence("blocked");
    }
    return evidence(profileCount > 0 ? "usable" : "absent");
  }
  return evidence(providersPresent ? "absent" : "unknown");
}

function connectedAuthModeFromModelStatus(
  statusProvider: Record<string, unknown> | null,
): ConnectedAuthMode | null {
  const profiles = recordValue(statusProvider?.["profiles"]);
  if (profiles === null) {
    return null;
  }
  if ((numberValue(profiles["oauth"]) ?? 0) > 0) {
    return "oauth";
  }
  if ((numberValue(profiles["token"]) ?? 0) > 0) {
    return "token";
  }
  if (
    (numberValue(profiles["apiKey"]) ?? 0) > 0 ||
    (numberValue(profiles["api_key"]) ?? 0) > 0 ||
    (numberValue(profiles["api-key"]) ?? 0) > 0
  ) {
    return "api_key";
  }
  return null;
}

function providerConnectionFromModelStatus(input: {
  readonly provider: ModelProviderCatalogEntry;
  readonly config: Record<string, unknown>;
  readonly modelStatus: unknown;
  readonly now: Date;
}): ProviderConnectionState | null {
  const authEvidence = modelStatusAuthEvidence({
    status: input.modelStatus,
    providerId: input.provider.id,
    config: input.config,
  });
  const hasConfigInventory = providerHasAuthProfile(input.config, input.provider.id);
  if (
    authEvidence.usability === "unknown" ||
    (authEvidence.usability === "absent" && authEvidence.profileCount <= 0 && !hasConfigInventory)
  ) {
    return null;
  }

  const allowedModels = modelStatusAllowedModels(input.modelStatus);
  const providerAllowed = allowedModels.some((model) => model.startsWith(`${input.provider.id}/`));
  const id = firstProfileIdForProvider(input.provider.id, input.config);
  const profile = id === null ? null : recordValue(authProfiles(input.config)[id]);
  const model = configuredModelForProvider({
    providerId: input.provider.id,
    config: input.config,
    models: input.provider.models,
  });
  const hasRoutableModel = providerAllowed || model !== null;
  const connected = authEvidence.usability === "usable" && hasRoutableModel;

  return {
    providerId: input.provider.id,
    status: connected ? "connected" : "needs_attention",
    authChoiceId: id === null || profile === null ? null : authChoiceIdFromProfile(id, profile),
    // CLI labels may embed a profile id (often an email address). Inventory labels never cross the
    // worker boundary; models.authStatus can overlay its provider-safe display name when available.
    accountLabel: stringValue(authEvidence.provider?.["provider"]),
    scopes: [],
    model,
    usageLabel:
      authEvidence.profileCount === 1
        ? "1 auth profile"
        : `${authEvidence.profileCount} auth profiles`,
    lastCheckedAt: input.now.toISOString(),
    message:
      authEvidence.usability === "usable"
        ? hasRoutableModel
          ? "Gateway model authentication is usable."
          : "Provider has credentials but no routable Gateway model."
        : "Gateway reports credentials, but none are eligible for runtime use.",
    connectedAuthMode: connectedAuthModeFromModelStatus(authEvidence.provider),
  };
}

function providerConnectionFromConnectionSources(input: {
  readonly provider: ModelProviderCatalogEntry;
  readonly config: Record<string, unknown>;
  readonly modelStatus: unknown | null;
  readonly authStatus: ReadonlyMap<string, ModelAuthStatusConnection> | null;
  readonly now: Date;
}): ProviderConnectionState {
  const baseConnection =
    (input.modelStatus === null
      ? null
      : providerConnectionFromModelStatus({
          provider: input.provider,
          config: input.config,
          modelStatus: input.modelStatus,
          now: input.now,
        })) ??
    providerConnectionFromConfig({
      provider: input.provider,
      config: input.config,
      now: input.now,
    });
  const authState = input.authStatus?.get(input.provider.id);
  if (authState === undefined) {
    return baseConnection;
  }

  const status: ProviderConnectionState["status"] =
    authState.authHealth === "missing"
      ? baseConnection.status
      : authState.authHealth === "expired"
        ? "needs_attention"
        : baseConnection.status;

  return {
    ...baseConnection,
    status,
    authHealth: authState.authHealth,
    connectedAuthMode:
      status === "not_connected"
        ? (baseConnection.connectedAuthMode ?? null)
        : (authState.connectedAuthMode ?? baseConnection.connectedAuthMode ?? null),
    expiryLabel: authState.expiryLabel,
    planLabel: authState.planLabel,
    usageLabel: authState.usageLabel ?? baseConnection.usageLabel,
    accountLabel: authState.accountLabel ?? baseConnection.accountLabel,
  };
}

interface ModelAuthStatusConnection {
  readonly providerId: string;
  readonly status: ProviderConnectionState["status"];
  readonly authHealth: ProviderAuthHealth;
  readonly connectedAuthMode: ConnectedAuthMode | null;
  readonly expiryLabel: string | null;
  readonly planLabel: string | null;
  readonly usageLabel: string | null;
  readonly accountLabel: string | null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function providerAuthHealth(value: unknown): ProviderAuthHealth | null {
  const status = stringValue(value);
  if (
    status === "ok" ||
    status === "expiring" ||
    status === "expired" ||
    status === "missing" ||
    status === "static"
  ) {
    return status;
  }

  return null;
}

function connectedAuthMode(value: unknown): ConnectedAuthMode | null {
  const mode = stringValue(value);
  if (mode === "oauth" || mode === "token" || mode === "api_key") {
    return mode;
  }

  return null;
}

function connectedAuthModeFromProfiles(value: unknown): ConnectedAuthMode | null {
  const profiles = arrayValue(value).filter(isRecord);
  const ranked = [
    "ok",
    "expiring",
    "static",
    "expired",
    "missing",
  ] as const satisfies readonly ProviderAuthHealth[];

  for (const status of ranked) {
    const profile = profiles.find((entry) => stringValue(entry["status"]) === status);
    const mode = connectedAuthMode(profile?.["type"]);
    if (mode !== null) {
      return mode;
    }
  }

  return (
    profiles.map((profile) => connectedAuthMode(profile["type"])).find((mode) => mode !== null) ??
    null
  );
}

function connectionStatusFromAuthHealth(
  status: ProviderAuthHealth,
): ProviderConnectionState["status"] {
  if (status === "expired" || status === "missing") {
    return "needs_attention";
  }

  return "connected";
}

function cleanOptionalLabel(value: unknown): string | null {
  const label = stringValue(value);
  return label === null || label.toLowerCase() === "unknown" ? null : label;
}

function usageLabelFromAuthStatus(usage: Record<string, unknown> | null): string | null {
  if (usage === null) {
    return null;
  }

  const windows = arrayValue(usage["windows"])
    .filter(isRecord)
    .map((window) => numberValue(window["usedPercent"]))
    .filter((usedPercent): usedPercent is number => usedPercent !== null)
    .map((usedPercent) => Math.max(0, Math.min(100, 100 - Math.round(usedPercent))))
    .sort((left, right) => left - right);
  const lowestRemaining = windows[0];
  if (lowestRemaining !== undefined) {
    return `${lowestRemaining}% window left`;
  }

  return stringValue(usage["summary"]);
}

function modelAuthStatusMap(payload: unknown): ReadonlyMap<string, ModelAuthStatusConnection> {
  const root = recordValue(payload) ?? {};
  const providers = arrayValue(root["providers"]).filter(isRecord);
  const byProvider = new Map<string, ModelAuthStatusConnection>();

  for (const provider of providers) {
    const providerId = stringValue(provider["provider"]) ?? stringValue(provider["providerId"]);
    const authHealth = providerAuthHealth(provider["status"]);
    if (providerId === null || authHealth === null) {
      continue;
    }

    const expiry = recordValue(provider["expiry"]);
    const usage = recordValue(provider["usage"]);
    byProvider.set(providerId, {
      providerId,
      status: connectionStatusFromAuthHealth(authHealth),
      authHealth,
      connectedAuthMode: connectedAuthModeFromProfiles(provider["profiles"]),
      expiryLabel: cleanOptionalLabel(expiry?.["label"]),
      planLabel: stringValue(usage?.["plan"]),
      usageLabel: usageLabelFromAuthStatus(usage),
      accountLabel: stringValue(provider["displayName"]),
    });
  }

  return byProvider;
}

function profileUsesGatewayCredentialAuth(
  profileIdValue: string,
  profile: Record<string, unknown>,
): boolean {
  const mode =
    stringValue(profile["type"]) ?? stringValue(profile["mode"]) ?? stringValue(profile["auth"]);
  if (mode === "oauth" || mode === "token" || mode === "api_key" || mode === "api-key") {
    return true;
  }

  const authChoiceId = authChoiceIdFromProfile(profileIdValue, profile);
  return authChoiceId === null ? false : authModeFromChoiceId(authChoiceId) === "api-key";
}

function configCredentialProfileIdsForProvider(
  config: Record<string, unknown>,
  providerId: string,
): readonly string[] {
  return Object.entries(authProfiles(config))
    .filter(
      ([id, profile]) =>
        isRecord(profile) &&
        providerIdentitiesMatch(providerIdFromProfile(id, profile), providerId) &&
        profileUsesGatewayCredentialAuth(id, profile),
    )
    .map(([id]) => id);
}

type ProviderProfileOwnership = Readonly<Record<string, readonly string[]>>;

function ownedProfileIdsForProvider(
  ownership: ProviderProfileOwnership | null,
  providerId: string,
): readonly string[] {
  const entries = providerIdentityEntries(ownership ?? {}, providerId);
  return [
    ...new Set([...entries.exact, ...entries.aliases].flatMap(([, profileIds]) => profileIds)),
  ];
}

function disconnectProfileIdsForProvider(input: {
  readonly config: Record<string, unknown>;
  readonly providerId: string;
  readonly ownership: ProviderProfileOwnership | null;
}): readonly string[] {
  const profiles = authProfiles(input.config);
  const ids = new Set(configCredentialProfileIdsForProvider(input.config, input.providerId));
  for (const profileId of ownedProfileIdsForProvider(input.ownership, input.providerId)) {
    const profile = profiles[profileId];
    // A declared profile MISSING from config is exactly the state a half-completed disconnect
    // leaves: the config entry is gone but the secret is still in the auth store. Include it so the
    // logout below still revokes it — filtering on config presence would re-orphan it.
    if (!isRecord(profile) || profileUsesGatewayCredentialAuth(profileId, profile)) {
      ids.add(profileId);
    }
  }

  return [...ids];
}

function profileOwnersForDisconnect(
  config: Record<string, unknown>,
  profileIds: readonly string[],
  ownership: ProviderProfileOwnership | null,
  disconnectedProviderId: string,
): ReadonlyMap<string, string> {
  const profiles = authProfiles(config);
  const owners = new Map<string, string>();
  for (const profileId of profileIds) {
    const profile = profiles[profileId];
    const ownershipEntries = Object.entries(ownership ?? {}).filter(([, ownedProfileIds]) =>
      ownedProfileIds.includes(profileId),
    );
    const identityEntries = providerIdentityEntries(
      Object.fromEntries(ownershipEntries),
      disconnectedProviderId,
    );
    const declaredOwnerId =
      identityEntries.exact[0]?.[0] ??
      identityEntries.aliases[0]?.[0] ??
      ownershipEntries[0]?.[0] ??
      null;
    const providerId = isRecord(profile)
      ? providerIdFromProfile(profileId, profile)
      : (providerIdFromProfilePrefix(profileId) ??
        declaredOwnerId ??
        providerIdFromProfile(profileId, {}));
    if (providerId !== null) {
      owners.set(profileId, providerId);
    }
  }

  return owners;
}

function modelStatusProfileKeyLabels(modelStatus: unknown): ReadonlyMap<string, string> {
  const labels = new Map<string, string>();
  const auth = recordValue(recordValue(modelStatus)?.["auth"]);
  for (const provider of arrayValue(auth?.["providers"]).filter(isRecord)) {
    const profiles = recordValue(provider["profiles"]);
    for (const entry of arrayValue(profiles?.["labels"])) {
      const label = stringValue(entry);
      const separator = label === null ? -1 : label.indexOf("=");
      if (label === null || separator <= 0) {
        continue;
      }
      labels.set(label.slice(0, separator), label.slice(separator + 1));
    }
  }

  return labels;
}

function providerStillHasCredentials(input: {
  readonly providerIds: readonly string[];
  readonly profileIds: readonly string[];
  readonly authStatus: ReadonlyMap<string, ModelAuthStatusConnection> | null;
  readonly config: Record<string, unknown>;
  readonly modelStatus: unknown | null;
}): {
  readonly stores: readonly string[];
  readonly connectedAuthMode: ConnectedAuthMode | null;
  readonly survivingProfileIds: readonly string[];
} {
  const stores: string[] = [];
  let connectedAuthMode: ConnectedAuthMode | null = null;

  for (const providerId of input.providerIds) {
    const authStatusProviders = [...(input.authStatus?.values() ?? [])].filter((provider) =>
      providerIdentitiesMatch(provider.providerId, providerId),
    );
    const survivingAuthStatusProvider = authStatusProviders.find(
      (provider) =>
        provider.connectedAuthMode === "oauth" ||
        provider.connectedAuthMode === "token" ||
        (provider.authHealth !== "missing" && provider.status !== "not_connected"),
    );
    const managedCredentialSurvived = survivingAuthStatusProvider !== undefined;
    if (managedCredentialSurvived && !stores.includes("models.authStatus")) {
      stores.push("models.authStatus");
      connectedAuthMode = survivingAuthStatusProvider.connectedAuthMode;
    }

    const statusProviders = arrayValue(
      recordValue(recordValue(input.modelStatus)?.["auth"])?.["providers"],
    )
      .filter(isRecord)
      .filter((provider) => providerIdentitiesMatch(stringValue(provider["provider"]), providerId));
    const survivingStatusProvider = statusProviders.find(
      (provider) => modelStatusProfileCount(provider) > 0,
    );
    if (survivingStatusProvider !== undefined && !stores.includes("models.status")) {
      stores.push("models.status");
      connectedAuthMode ??= connectedAuthModeFromModelStatus(survivingStatusProvider);
    }
  }

  // The profile-id check is what catches an orphaned SIBLING: it survives under a provider id that
  // is not in `providerIds`, so a provider-scoped read alone reports "clean" while the key lives on.
  const profiles = authProfiles(input.config);
  const survivingProfileIds = input.profileIds.filter((profileId) => isRecord(profiles[profileId]));
  const idMatchedSurvives = input.providerIds.some(
    (providerId) => configCredentialProfileIdsForProvider(input.config, providerId).length > 0,
  );
  const equivalentOrderSurvives = input.providerIds.some((providerId) => {
    const entries = providerIdentityEntries(authOrder(input.config), providerId);
    return [...entries.exact, ...entries.aliases].some(
      ([, value]) =>
        (Array.isArray(value) && value.some((entry) => typeof entry === "string")) ||
        (typeof value === "string" && value.trim() !== ""),
    );
  });
  if (
    (survivingProfileIds.length > 0 || idMatchedSurvives || equivalentOrderSurvives) &&
    !stores.includes(durableCredentialStore)
  ) {
    stores.push(durableCredentialStore);
  }

  return { stores, connectedAuthMode, survivingProfileIds };
}

function disconnectedProviderState(input: {
  readonly providerId: string;
  readonly now: Date;
  readonly message: string;
}): ProviderConnectionState {
  return {
    providerId: input.providerId,
    status: "not_connected",
    authChoiceId: null,
    accountLabel: null,
    scopes: [],
    model: null,
    usageLabel: null,
    lastCheckedAt: input.now.toISOString(),
    message: input.message,
    connectedAuthMode: null,
  };
}

export {
  durableCredentialStore,
  agentModelSelectorKeys,
  agentsList,
  arrayValue,
  authChoiceFromUnknown,
  authChoiceIdFromProfile,
  authChoicesForProvider,
  authChoicesFromConfig,
  authConfig,
  authLogoutSuccessSummary,
  authModeFromChoiceId,
  authOrder,
  authOrderEntry,
  authProfiles,
  canonicalProviderIdentity,
  catalogModelsForProvider,
  choiceMatchesProvider,
  cleanOptionalLabel,
  configCredentialProfileIdsForProvider,
  configPayload,
  configProviderEntry,
  configuredLogoutAgentIds,
  configuredModelForProvider,
  configuredModelRefs,
  configuredModelsForProvider,
  connectedAuthMode,
  connectedAuthModeFromModelStatus,
  connectedAuthModeFromProfiles,
  connectedProviderIdForModel,
  connectedProviderSubagents,
  connectionStatusFromAuthHealth,
  currentOrchestratorState,
  deviceCodeProviderArg,
  disconnectedProviderState,
  disconnectProfileIdsForProvider,
  enabledDefaultModelEntries,
  enabledModelsForProvider,
  enabledPluginCatalogProvider,
  ensureCanonicalLlmProviders,
  firstConfiguredProviderModel,
  firstProfileIdForProvider,
  gatewayDefaultModels,
  gatewayPrimaryModel,
  isRecord,
  logoutTarget,
  mergeRuntimeAuthChoices,
  modelAuthStatusMap,
  modelProviderId,
  modelRecordId,
  modelRecordProviderId,
  modelRefMatchesProvider,
  modelSelectorPrimary,
  modelSelectorRefs,
  modelsListRecords,
  modelStatusAllowedModels,
  modelStatusAuthEvidence,
  modelStatusOAuthProvider,
  modelStatusProfileCount,
  modelStatusProfileKeyLabels,
  modelStatusProfileLabels,
  modelStatusProvider,
  modelSummaryFromRecord,
  numberValue,
  orchestratorConfigIsCurrent,
  orchestratorDelegationState,
  orchestratorModelForProvider,
  orchestratorProviderIdFromConnections,
  ownedAgentConfigEquals,
  ownedAgentRowEquals,
  ownedConfigValueEquals,
  ownedProfileIdsForProvider,
  pluginModelRecord,
  preferredConnectedOrchestratorSelection,
  profileOwnersForDisconnect,
  profileUsesGatewayCredentialAuth,
  protectedModelRefs,
  providerAuthHealth,
  providerCatalogFromModels,
  providerChoiceRoots,
  providerConnectionFromConfig,
  providerConnectionFromConnectionSources,
  providerConnectionFromModelStatus,
  providerHasAuthProfile,
  providerHasBlockingAuthOrder,
  providerIdentitiesMatch,
  providerIdentityEntries,
  providerIdFromModel,
  providerIdFromProfile,
  providerIdFromProfilePrefix,
  providerModelRef,
  providerStillHasCredentials,
  receiptId,
  recordValue,
  setupTokenKeyFlag,
  splitScope,
  stringArrayValue,
  stringValue,
  usageLabelFromAuthStatus,
  withModelProviderClassification,
};

export type {
  ModelAuthStatusConnection,
  ModelStatusAuthEvidence,
  PluginModelCatalogDiscovery,
  PluginModelProviderCatalog,
  ProviderAuthUsability,
  ProviderProfileOwnership,
};
