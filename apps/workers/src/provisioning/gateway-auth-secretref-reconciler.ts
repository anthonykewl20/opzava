import type { OpenClawAdminRpcPort } from "@opzava/ports";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import { configPatchParams } from "./gateway-config-mutation.js";

/**
 * #272 — the OpenClaw engine persists its own gateway connect-token as plaintext in `openclaw.json`
 * (`mainframe/src/commands/gateway-install-token.ts`), which an in-container agent can then read.
 * The engine skips that plaintext write when `gateway.auth.token` is a SecretRef and resolves the
 * value from `OPENCLAW_GATEWAY_TOKEN` at runtime instead. This reconciler applies that one atomic
 * config patch on every worker startup, so already-provisioned gateways migrate (local
 * docker-compose and Dokploy share the same worker path).
 *
 * `config.get` redacts `gateway.auth.token` in its readback (`redactConfigObject`), so the token's
 * plaintext-vs-SecretRef form cannot be read back to decide whether to patch or to verify. We
 * therefore always send the patch and trust the gateway's response: the config.patch handler diffs
 * the merged config against on-disk state, writes and reloads when there are changed paths, or
 * returns a noop when the ref is already present. The OpenClaw `doctor`, which reads the real
 * config out-of-band, is the independent proof that plaintext is gone — see #272 real-stack
 * verification.
 */
const GATEWAY_TOKEN_ENV = "OPENCLAW_GATEWAY_TOKEN";

const TARGET_TOKEN_REF = {
  source: "env",
  provider: "default",
  id: GATEWAY_TOKEN_ENV,
} as const;

const TARGET_DEFAULT_PROVIDER = { source: "env" } as const;

export interface GatewayAuthTokenSecretRefOptions {
  readonly adminClient: OpenClawAdminRpcPort;
  readonly env?: NodeJS.ProcessEnv;
  readonly maxAttempts?: number;
  readonly retryBackoffMs?: readonly number[];
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface GatewayAuthTokenSecretRefReceipt {
  /** No change attempted: the runtime cannot resolve an env ref, so the engine default is left intact. */
  readonly skipped: boolean;
  /** The SecretRef patch was accepted (applied, or idempotently no-op'd because already present). */
  readonly patched: boolean;
}

const defaultRetryBackoffMs = [100, 250, 500, 1000] as const;

function reconcileError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class GatewayAuthTokenSecretRefReconciler {
  private readonly maxAttempts: number;
  private readonly retryBackoffMs: readonly number[];
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly env: NodeJS.ProcessEnv;

  public constructor(private readonly options: GatewayAuthTokenSecretRefOptions) {
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 5);
    this.retryBackoffMs = options.retryBackoffMs ?? defaultRetryBackoffMs;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.env = options.env ?? process.env;
  }

  public async reconcile(): Promise<Result<GatewayAuthTokenSecretRefReceipt>> {
    // Never write an env SecretRef the runtime cannot resolve: without the gateway token env, the
    // ref becomes an active, unresolvable surface that blocks gateway startup. Leave the engine's
    // default behavior untouched in that deployment shape.
    if ((this.env[GATEWAY_TOKEN_ENV] ?? "").trim() === "") {
      return ok({ skipped: true, patched: false });
    }

    const failedStep: { value: "read" | "params" | "patch" } = { value: "read" };
    const patched = await this.retry(async () => {
      // config.get is required only for the base hash that config.patch must echo back. The token
      // field is redacted in the readback, so it is not inspected here.
      failedStep.value = "read";
      const current = await this.options.adminClient.request("config.get", {});
      if (!current.ok) {
        return current;
      }

      // One atomic patch: the token SecretRef and its env secret-provider land together, so no
      // startup cycle can observe a ref whose provider has not been declared yet.
      failedStep.value = "params";
      const patchParams = configPatchParams({
        configGetPayload: current.value,
        patch: {
          gateway: { auth: { token: TARGET_TOKEN_REF } },
          secrets: { providers: { default: TARGET_DEFAULT_PROVIDER } },
        },
      });
      if (!patchParams.ok) {
        return patchParams;
      }

      failedStep.value = "patch";
      return this.options.adminClient.request("config.patch", patchParams.value, {
        requiredScope: "operator.admin",
      });
    });
    if (!patched.ok) {
      if (failedStep.value === "params") {
        return err(patched.error);
      }
      if (failedStep.value === "read") {
        return err(
          reconcileError(
            "workers.gatewayAuthTokenSecretRef.configReadFailed",
            "Gateway config.get failed while reconciling the auth-token SecretRef.",
            patched.error,
          ),
        );
      }
      return err(
        reconcileError(
          "workers.gatewayAuthTokenSecretRef.configPatchFailed",
          "Gateway config.patch for the auth-token SecretRef failed.",
          patched.error,
        ),
      );
    }

    // ok = the gateway applied the patch or idempotently no-op'd because the ref was already
    // present. config.get cannot confirm the shape (the field is redacted); the doctor, which
    // reads the real config, is the independent proof (see #272 real-stack verification).
    return ok({ skipped: false, patched: true });
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
    // Mutating gateway.auth.* can trigger an in-process gateway restart, so a patch response can be
    // dropped ("closed before a response") and a read can land in the restart window. Treat those
    // handshake/closed/restart signals as retryable too; each retry re-fetches a fresh base hash
    // before re-applying, handling both a dropped response and a stale-base-hash rejection.
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
