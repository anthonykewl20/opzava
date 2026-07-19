import type { Result } from "@opzava/shared-kernel";

export interface GatewayRuntimeAuthChoice {
  readonly id: string;
  readonly label: string;
  readonly mode: "api-key" | "device-flow";
  readonly keyFlag?: string;
}

export interface GatewayRuntimeCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface GatewayRuntimeDeviceCodeLogin {
  readonly execId: string;
  readonly logPath: string;
}

export interface GatewayRuntimeSetupTokenLogin {
  readonly execId: string;
  readonly logPath: string;
  readonly stdinPath: string;
}

export interface GatewayRuntimeAgentCredential {
  readonly agentId: string;
  readonly providerId: string;
  /** The auth-choice key flag: `token` stores a token profile, anything else an api-key profile. */
  readonly keyFlag: string;
  readonly apiKey: string;
}

export interface PluginModelCatalog {
  readonly pluginId: string;
  readonly providers: Record<
    string,
    {
      readonly baseUrl?: string;
      readonly api?: string;
      readonly models: readonly Record<string, unknown>[];
    }
  >;
}

export interface PluginModelCatalogRead {
  readonly catalogs: readonly PluginModelCatalog[];
}

export interface GatewayRuntimePluginSummary {
  readonly id: string;
  readonly enabled: boolean;
}

/**
 * Catalogs and their owning plugin state from one runtime observation.
 *
 * Keeping these together prevents a plugin enable/disable between separate reads from making a
 * generated catalog appear to belong to an enabled plugin when it did not at discovery time.
 */
export interface PluginModelDiscoveryRead extends PluginModelCatalogRead {
  readonly plugins: readonly GatewayRuntimePluginSummary[];
}

/**
 * What the gateway says it just stored, read back from its own stdout.
 *
 * Both fields are gateway-declared rather than locally derived, because the gateway CANONICALIZES
 * providers on the way in — `codex` and `openai-codex` both land as `openai`. A probe addressed to
 * the id we sent, rather than the id it kept, would find no such credential and prove nothing.
 */
export interface GatewayRuntimeAgentCredentialWrite extends GatewayRuntimeCommandResult {
  /** The auth profile the gateway wrote. `null` when it did not name one. */
  readonly profileId: string | null;
  /** The provider id the gateway filed it under. `null` when it did not name one. */
  readonly providerId: string | null;
}

export interface GatewayRuntimeAgentProviderQuery {
  readonly agentId: string;
  readonly providerId: string;
}

/**
 * What a live auth probe proved about a stored credential.
 *
 * Deliberately three-valued. `unproven` is NOT a soft `rejected`: a rate limit, a timeout, or a
 * provider outage says nothing about whether the key is good, and rejecting a VALID credential is
 * worse than the bug this probe exists to catch (#183) — so only an explicit authentication
 * rejection is allowed to fail a connect.
 */
export type ProviderAuthProbeVerdict = "verified" | "rejected" | "unproven";

export interface ProviderAuthProbe {
  readonly verdict: ProviderAuthProbeVerdict;
  /** Redacted, bounded, human-facing reason. Safe to surface in the browser. */
  readonly reason: string;
}

export interface GatewayRuntimeAuthProbeQuery {
  readonly agentId: string;
  readonly providerId: string;
  /**
   * The auth profile to probe. Scoping to ONE profile is what makes the verdict mean "the
   * credential this connect just wrote", rather than "some credential this provider happens to
   * have" — an unrelated stale profile for the same provider must never reject a good new key.
   */
  readonly profileId: string;
}

/**
 * What a live model canary proved about whether the gateway's bundled runtime can actually RUN a
 * given model (#251).
 *
 * The catalog offering a model does NOT mean the bundled Codex can run it: the gateway pins its own
 * Codex install, and a model can need a newer backend than the pinned one (e.g. `gpt-5.6-sol`
 * rejected by Codex `0.142.4` with "requires a newer version of Codex"). Structural catalog/status
 * checks all pass; the only thing that proves runnability is asking the runtime to run it.
 *
 * Deliberately three-valued, mirroring {@link ProviderAuthProbeVerdict}. `unproven` is NOT a soft
 * `unrunnable`: a rate limit, a timeout, an auth hiccup, or a gateway outage says nothing about the
 * model's version floor, and BLOCKING a valid election (which would rate-limit the operator out of
 * their 3-writes/60s budget on retry) is worse than the bug this canary exists to catch — so only an
 * explicit "the runtime cannot run this model" rejection is allowed to fail an election. Everything
 * else is `unproven` and the election proceeds (fail-open).
 */
export type ModelRunProbeVerdict = "runnable" | "unrunnable" | "unproven";

export interface ModelRunProbe {
  readonly verdict: ModelRunProbeVerdict;
  /**
   * Redacted, bounded, Opzava-owned human-facing reason. Safe to surface in the browser. NEVER the
   * raw upstream error string — the vendor's "requires a newer version of Codex" text changes
   * without warning and must not be parsed or forwarded.
   */
  readonly reason: string;
}

export interface GatewayRuntimeModelRunProbeQuery {
  readonly agentId: string;
  readonly providerId: string;
  /** The model key being elected, exactly as the catalog named it. */
  readonly model: string;
  /**
   * A known-good reference model: the gateway's currently-working orchestrator/primary model.
   * Running it first isolates turn/start schema failures from target model-version failures.
   */
  readonly baselineModel?: string;
}

export interface GatewayRuntimePort {
  listAuthChoices(): Promise<Result<readonly GatewayRuntimeAuthChoice[]>>;
  modelStatus(): Promise<Result<unknown>>;
  readPluginModelDiscovery(): Promise<Result<PluginModelDiscoveryRead>>;
  connectApiKey(input: {
    readonly providerId: string;
    readonly authChoiceId: string;
    readonly keyFlag: string;
    readonly apiKey: string;
  }): Promise<Result<GatewayRuntimeCommandResult>>;
  /**
   * Store a provider credential in ONE named agent's auth store. `connectApiKey` (onboard) cannot
   * do this: it has no `--agent` flag and always writes to the *configured default* agent, which is
   * the orchestrator — a store no other agent reads (issue #169).
   *
   * Resolves to the auth profile id the gateway wrote, which it declares on stdout. The id is read
   * back rather than recomputed because the gateway canonicalizes some providers on the way in
   * (openai/codex/openai-codex all collapse to `openai`), and a probe that guessed the id wrong
   * would silently probe nothing.
   */
  writeAgentCredential(
    input: GatewayRuntimeAgentCredential,
  ): Promise<Result<GatewayRuntimeAgentCredentialWrite>>;
  /**
   * Spend one real, bounded model call proving a stored credential actually authenticates.
   *
   * The gateway reporting a routable provider does NOT mean the credential works: a stored-but-401
   * key passes every structural check there is, which is how two providers were connected with
   * deliberately bogus keys and reported Connected (#183).
   */
  probeProviderAuth(input: GatewayRuntimeAuthProbeQuery): Promise<Result<ProviderAuthProbe>>;
  /**
   * Spend one real, bounded, side-effect-free model call proving the bundled runtime can actually
   * RUN a model before it is elected as an orchestrator (#251).
   *
   * The canary runs on the admin/JIT path (this port), NEVER through the gateway-broker hot-path ACL.
   * It uses a known-good baseline to prove the minimal turn/start schema before a structural target
   * rejection can be attributed to the model. Callers MUST run this before the control-plane config
   * write and abort the election only on an `unrunnable` verdict; `unproven` proceeds (see
   * {@link ModelRunProbeVerdict}).
   */
  probeModelRunnable(
    input: GatewayRuntimeModelRunProbeQuery,
  ): Promise<Result<ModelRunProbe>>;
  /**
   * Auth-profile ids the given agent can actually RESOLVE for a provider, counting the read-through
   * inheritance from the shared store. Empty means that agent would fail with "No API key found".
   */
  listAgentProviderProfiles(
    input: GatewayRuntimeAgentProviderQuery,
  ): Promise<Result<readonly string[]>>;
  /**
   * `agentId` names the auth store the completed OAuth login writes to. It is required rather than
   * defaulted: an un-agented device-code login silently lands in the *configured default* agent,
   * which is the orchestrator's private store that no other agent reads (issue #169).
   */
  startDeviceCodeLogin(
    providerId: string,
    agentId: string,
  ): Promise<Result<GatewayRuntimeDeviceCodeLogin>>;
  readDeviceCodeLog(logPath: string): Promise<Result<string>>;
  /**
   * Resolve only after the exec is confirmed stopped and its private log is securely deleted.
   * Reject when either condition cannot be verified within the adapter's bounded timeout.
   */
  stopDeviceCodeLogin(execId: string, logPath: string): Promise<void>;
  startSetupTokenLogin(): Promise<Result<GatewayRuntimeSetupTokenLogin>>;
  readSetupTokenLog(logPath: string): Promise<Result<string>>;
  writeSetupTokenInput(stdinPath: string, value: string): Promise<Result<void>>;
  stopSetupTokenLogin(execId: string, logPath: string): Promise<void>;
}
