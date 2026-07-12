import type { Result } from "@opzava/shared-kernel";

export type OpenClawOperatorScope = `operator.${string}`;

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
  close(): void;
}
