import type { Result } from "@opzava/shared-kernel";

export type OpenClawOperatorScope = `operator.${string}`;

export interface OpenClawAdminConnectionMetadata {
  readonly serverVersion: string | null;
  readonly uptimeMs: number | null;
  readonly updateAvailable: {
    readonly currentVersion: string;
    readonly latestVersion: string;
    readonly channel: string;
  } | null;
}

export interface OpenClawAdminRpcPort {
  request(
    method: string,
    params: Record<string, unknown>,
    options?: {
      readonly idempotencyKey?: string;
      readonly requiredScope?: OpenClawOperatorScope;
    },
  ): Promise<Result<unknown>>;
  grantedScopes(): readonly OpenClawOperatorScope[] | null;
  connectionMetadata(): OpenClawAdminConnectionMetadata | null;
  close(): void;
}
