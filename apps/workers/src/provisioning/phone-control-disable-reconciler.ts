import type { OpenClawAdminRpcPort } from "@opzava/ports";
import { ok, type Result } from "@opzava/shared-kernel";

import { configPatchParams } from "./gateway-config-mutation.js";

export interface PhoneControlDisableReconcilerOptions {
  readonly adminClient: OpenClawAdminRpcPort;
  readonly maxAttempts?: number;
  readonly retryBackoffMs?: readonly number[];
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface PhoneControlDisableReconcileReceipt {
  readonly patched: boolean;
}

const defaultRetryBackoffMs = [100, 250, 500, 1000] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class PhoneControlDisableReconciler {
  private readonly maxAttempts: number;
  private readonly retryBackoffMs: readonly number[];
  private readonly sleep: (ms: number) => Promise<void>;

  public constructor(private readonly options: PhoneControlDisableReconcilerOptions) {
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 5);
    this.retryBackoffMs = options.retryBackoffMs ?? defaultRetryBackoffMs;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  public async reconcile(): Promise<Result<PhoneControlDisableReconcileReceipt>> {
    const patched = await this.retry(async () => {
      const current = await this.options.adminClient.request("config.get", {});
      if (!current.ok) {
        return current;
      }

      const patchParams = configPatchParams({
        configGetPayload: current.value,
        patch: { plugins: { entries: { "phone-control": { enabled: false } } } },
      });
      if (!patchParams.ok) {
        return patchParams;
      }

      return this.options.adminClient.request("config.patch", patchParams.value, {
        requiredScope: "operator.admin",
      });
    });

    if (!patched.ok) {
      // Unlike the security-critical SecretRef reconcile, disabling this unused plugin is an ops
      // optimization, so failure must not block worker startup.
      console.warn("workers.phoneControlDisable.reconcileFailed", patched.error);
      return ok({ patched: false });
    }

    return ok({ patched: true });
  }

  private async retry<T>(operation: () => Promise<Result<T>>): Promise<Result<T>> {
    let latest: Result<T> | null = null;
    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      latest = await operation();
      if (latest.ok) {
        return latest;
      }
      if (attempt + 1 < this.maxAttempts && this.retryable(latest.error)) {
        const delayMs = this.retryBackoffMs[Math.min(attempt, this.retryBackoffMs.length - 1)] ?? 0;
        await this.sleep(delayMs);
      } else if (!this.retryable(latest.error)) {
        return latest;
      }
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
