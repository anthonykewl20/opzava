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

export interface GatewayRuntimeAgentProviderQuery {
  readonly agentId: string;
  readonly providerId: string;
}

export interface GatewayRuntimePort {
  listAuthChoices(): Promise<Result<readonly GatewayRuntimeAuthChoice[]>>;
  modelStatus(): Promise<Result<unknown>>;
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
   */
  writeAgentCredential(
    input: GatewayRuntimeAgentCredential,
  ): Promise<Result<GatewayRuntimeCommandResult>>;
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
  stopDeviceCodeLogin(execId: string, logPath: string): Promise<void>;
  startSetupTokenLogin(): Promise<Result<GatewayRuntimeSetupTokenLogin>>;
  readSetupTokenLog(logPath: string): Promise<Result<string>>;
  writeSetupTokenInput(stdinPath: string, value: string): Promise<Result<void>>;
  stopSetupTokenLogin(execId: string, logPath: string): Promise<void>;
}
