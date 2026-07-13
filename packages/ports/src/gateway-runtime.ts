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

export interface GatewayRuntimePort {
  listAuthChoices(): Promise<Result<readonly GatewayRuntimeAuthChoice[]>>;
  modelStatus(): Promise<Result<unknown>>;
  connectApiKey(input: {
    readonly providerId: string;
    readonly authChoiceId: string;
    readonly keyFlag: string;
    readonly apiKey: string;
  }): Promise<Result<GatewayRuntimeCommandResult>>;
  startDeviceCodeLogin(providerId: string): Promise<Result<GatewayRuntimeDeviceCodeLogin>>;
  readDeviceCodeLog(logPath: string): Promise<Result<string>>;
  stopDeviceCodeLogin(execId: string, logPath: string): Promise<void>;
  startSetupTokenLogin(): Promise<Result<GatewayRuntimeSetupTokenLogin>>;
  readSetupTokenLog(logPath: string): Promise<Result<string>>;
  writeSetupTokenInput(stdinPath: string, value: string): Promise<Result<void>>;
  stopSetupTokenLogin(execId: string, logPath: string): Promise<void>;
}
