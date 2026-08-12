import { describe, expect, it } from "vitest";

import type { OpenClawAdminRpcPort } from "@opzava/ports";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import { GatewayAuthTokenSecretRefReconciler } from "../gateway-auth-secretref-reconciler.js";

const GATEWAY_TOKEN_ENV = "OPENCLAW_GATEWAY_TOKEN";
const TARGET_REF = { source: "env", provider: "default", id: GATEWAY_TOKEN_ENV };

interface FakeState {
  getFailures: number;
  patchFailures: number;
  configGetMissingHash?: boolean;
  /** Times config.patch returns a "closed before a response" drop (matches the restart-window retryable set only). */
  patchDropResponse?: number;
  patchStaleBaseHash?: number;
  nonRetryableGet: boolean;
  nonRetryablePatch: boolean;
}

class GatewayAdminClient implements OpenClawAdminRpcPort {
  public readonly calls: Array<{
    readonly method: string;
    readonly params: Record<string, unknown>;
    readonly requiredScope?: string;
  }> = [];
  public closed = false;
  private hash = 0;
  public constructor(private readonly state: FakeState) {}

  public async request(
    method: string,
    params: Record<string, unknown>,
    options?: { readonly requiredScope?: `operator.${string}` },
  ): Promise<Result<unknown>> {
    this.calls.push({
      method,
      params,
      ...(options?.requiredScope === undefined ? {} : { requiredScope: options.requiredScope }),
    });

    if (method === "config.get") {
      if (this.state.nonRetryableGet) {
        return err(
          new DomainError({
            code: "provisioning.connections.configBaseHashMissing",
            message: "no hash",
          }),
        );
      }
      if (this.state.getFailures > 0) {
        this.state.getFailures -= 1;
        return err(
          new DomainError({
            code: "provisioning.openclawAdmin.connectionClosed",
            message: "reload",
          }),
        );
      }
      if (this.state.configGetMissingHash) {
        return ok({ config: { gateway: { auth: { token: "__OPENCLAW_REDACTED__" } } } });
      }
      // gateway.auth.token is redacted in the real readback; the reconciler must not depend on it.
      this.hash += 1;
      return ok({
        hash: `hash-${this.hash}`,
        config: { gateway: { auth: { token: "__OPENCLAW_REDACTED__" } } },
      });
    }

    if (method === "config.patch") {
      if (this.state.nonRetryablePatch) {
        return err(
          new DomainError({
            code: "provisioning.openclawAdmin.operatorAdminRequired",
            message: "scope",
          }),
        );
      }
      if ((this.state.patchStaleBaseHash ?? 0) > 0) {
        this.state.patchStaleBaseHash = (this.state.patchStaleBaseHash ?? 0) - 1;
        return err(
          new DomainError({
            code: "provisioning.openclawAdmin.requestError",
            message: "config changed since last load; re-run config.get and retry",
          }),
        );
      }
      if ((this.state.patchDropResponse ?? 0) > 0) {
        this.state.patchDropResponse = (this.state.patchDropResponse ?? 0) - 1;
        return err(
          new DomainError({
            code: "provisioning.openclawAdmin.requestError",
            message: "config.patch closed before a response",
          }),
        );
      }
      if (this.state.patchFailures > 0) {
        this.state.patchFailures -= 1;
        return err(
          new DomainError({
            code: "provisioning.openclawAdmin.connectionClosed",
            message: "reload",
          }),
        );
      }
      return ok({ ok: true });
    }

    return err(new DomainError({ code: "unexpected", message: method }));
  }

  public grantedScopes() {
    return ["operator.read", "operator.admin"] as const;
  }
  public connectionMetadata() {
    return null;
  }
  public close(): void {
    this.closed = true;
  }
}

function reconciler(state: FakeState, env: NodeJS.ProcessEnv = { OPENCLAW_GATEWAY_TOKEN: "tok" }) {
  return new GatewayAuthTokenSecretRefReconciler({
    adminClient: new GatewayAdminClient(state),
    env,
    sleep: async () => undefined,
  });
}

describe("GatewayAuthTokenSecretRefReconciler", () => {
  it("sends one atomic patch (token SecretRef + env provider) and trusts the ok response", async () => {
    const state: FakeState = {
      getFailures: 0,
      patchFailures: 0,
      nonRetryableGet: false,
      nonRetryablePatch: false,
    };
    const admin = new GatewayAdminClient(state);
    const r = new GatewayAuthTokenSecretRefReconciler({
      adminClient: admin,
      env: { OPENCLAW_GATEWAY_TOKEN: "tok" },
      sleep: async () => undefined,
    });

    const result = await r.reconcile();

    expect(result).toMatchObject({ ok: true, value: { skipped: false, patched: true } });
    expect(admin.calls.map((call) => call.method)).toEqual(["config.get", "config.patch"]);
    const patchCall = admin.calls[1]!;
    expect(patchCall.requiredScope).toBe("operator.admin");
    const raw = JSON.parse(String(patchCall.params["raw"])) as Record<string, unknown>;
    expect(raw).toEqual({
      gateway: { auth: { token: TARGET_REF } },
      secrets: { providers: { default: { source: "env" } } },
    });
  });

  it("skips without touching the gateway when the token env is unset", async () => {
    const state: FakeState = {
      getFailures: 0,
      patchFailures: 0,
      nonRetryableGet: false,
      nonRetryablePatch: false,
    };
    const admin = new GatewayAdminClient(state);
    const r = new GatewayAuthTokenSecretRefReconciler({
      adminClient: admin,
      env: {},
      sleep: async () => undefined,
    });

    const result = await r.reconcile();

    expect(result).toMatchObject({ ok: true, value: { skipped: true, patched: false } });
    expect(admin.calls).toEqual([]); // no config.get, no config.patch
  });

  it("retries a transient config.get disconnect and still patches", async () => {
    const state: FakeState = {
      getFailures: 1,
      patchFailures: 0,
      nonRetryableGet: false,
      nonRetryablePatch: false,
    };
    const result = await reconciler(state).reconcile();
    expect(result).toMatchObject({ ok: true, value: { patched: true } });
  });

  it("retries a transient config.patch disconnect and still succeeds", async () => {
    const state: FakeState = {
      getFailures: 0,
      patchFailures: 1,
      nonRetryableGet: false,
      nonRetryablePatch: false,
    };
    const result = await reconciler(state).reconcile();
    expect(result).toMatchObject({ ok: true, value: { patched: true } });
  });

  it("retries when the patch response is dropped mid-restart (closed before a response)", async () => {
    const state: FakeState = {
      getFailures: 0,
      patchFailures: 0,
      patchDropResponse: 1,
      nonRetryableGet: false,
      nonRetryablePatch: false,
    };
    const result = await reconciler(state).reconcile();
    expect(result).toMatchObject({ ok: true, value: { patched: true } });
  });

  it("re-gets and re-patches with a fresh base hash after a stale-base-hash error", async () => {
    const state: FakeState = {
      getFailures: 0,
      patchFailures: 0,
      patchStaleBaseHash: 1,
      nonRetryableGet: false,
      nonRetryablePatch: false,
    };
    const admin = new GatewayAdminClient(state);
    const r = new GatewayAuthTokenSecretRefReconciler({
      adminClient: admin,
      env: { OPENCLAW_GATEWAY_TOKEN: "tok" },
      sleep: async () => undefined,
    });

    const result = await r.reconcile();

    expect(result).toMatchObject({ ok: true, value: { skipped: false, patched: true } });
    const getCalls = admin.calls.filter((call) => call.method === "config.get");
    const patchCalls = admin.calls.filter((call) => call.method === "config.patch");
    expect(getCalls).toHaveLength(2);
    expect(patchCalls).toHaveLength(2);
    expect(patchCalls.map((call) => call.params["baseHash"])).toEqual(["hash-1", "hash-2"]);
  });

  it("fails closed on a non-retryable config.get error", async () => {
    const state: FakeState = {
      getFailures: 0,
      patchFailures: 0,
      nonRetryableGet: true,
      nonRetryablePatch: false,
    };
    const result = await reconciler(state).reconcile();
    expect(result).toMatchObject({
      ok: false,
      error: { code: "workers.gatewayAuthTokenSecretRef.configReadFailed" },
    });
  });

  it("surfaces a raw configBaseHashMissing error when config.get omits the hash (no patch attempted)", async () => {
    const state: FakeState = {
      getFailures: 0,
      patchFailures: 0,
      configGetMissingHash: true,
      nonRetryableGet: false,
      nonRetryablePatch: false,
    };
    const admin = new GatewayAdminClient(state);
    const r = new GatewayAuthTokenSecretRefReconciler({
      adminClient: admin,
      env: { OPENCLAW_GATEWAY_TOKEN: "tok" },
      sleep: async () => undefined,
    });

    const result = await r.reconcile();

    expect(result).toMatchObject({
      ok: false,
      error: { code: "provisioning.connections.configBaseHashMissing" },
    });
    expect(admin.calls.map((call) => call.method)).toEqual(["config.get"]);
  });

  it("fails closed on a non-retryable config.patch error", async () => {
    const state: FakeState = {
      getFailures: 0,
      patchFailures: 0,
      nonRetryableGet: false,
      nonRetryablePatch: true,
    };
    const result = await reconciler(state).reconcile();
    expect(result).toMatchObject({
      ok: false,
      error: { code: "workers.gatewayAuthTokenSecretRef.configPatchFailed" },
    });
  });
});
