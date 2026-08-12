import { afterEach, describe, expect, it, vi } from "vitest";

import type { OpenClawAdminRpcPort } from "@opzava/ports";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import { MemorySearchProviderReconciler } from "../memory-search-provider-reconciler.js";

interface FakeState {
  getFailures: number;
  patchFailures: number;
  stalePatchFailures: number;
  nonRetryablePatch: boolean;
}

class GatewayAdminClient implements OpenClawAdminRpcPort {
  public readonly calls: Array<{
    readonly method: string;
    readonly params: Record<string, unknown>;
    readonly requiredScope?: string;
  }> = [];
  public closed = false;
  private getCount = 0;

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
      if (this.state.getFailures > 0) {
        this.state.getFailures -= 1;
        return err(
          new DomainError({
            code: "provisioning.openclawAdmin.connectionClosed",
            message: "reload",
          }),
        );
      }
      this.getCount += 1;
      return ok({ hash: `hash-${this.getCount}`, config: {} });
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
      if (this.state.stalePatchFailures > 0) {
        this.state.stalePatchFailures -= 1;
        return err(
          new DomainError({
            code: "provisioning.openclawAdmin.staleBaseHash",
            message: "config changed since last load",
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

function state(overrides: Partial<FakeState> = {}): FakeState {
  return {
    getFailures: 0,
    patchFailures: 0,
    stalePatchFailures: 0,
    nonRetryablePatch: false,
    ...overrides,
  };
}

function reconciler(adminClient: GatewayAdminClient, maxAttempts = 5) {
  return new MemorySearchProviderReconciler({
    adminClient,
    maxAttempts,
    sleep: async () => undefined,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MemorySearchProviderReconciler", () => {
  it("sends one atomic memory-search provider opt-out patch with operator.admin scope", async () => {
    const admin = new GatewayAdminClient(state());

    await reconciler(admin).reconcile();

    expect(admin.calls.map((call) => call.method)).toEqual(["config.get", "config.patch"]);
    const patchCall = admin.calls[1]!;
    expect(patchCall.requiredScope).toBe("operator.admin");
    expect(JSON.parse(String(patchCall.params["raw"]))).toEqual({
      agents: { defaults: { memorySearch: { provider: "none" } } },
    });
  });

  it("returns patched true when the gateway accepts the patch", async () => {
    const result = await reconciler(new GatewayAdminClient(state())).reconcile();

    expect(result).toEqual({ ok: true, value: { patched: true } });
  });

  it("returns patched false instead of failing closed when reconciliation fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await reconciler(
      new GatewayAdminClient(state({ nonRetryablePatch: true })),
    ).reconcile();

    expect(result).toEqual({ ok: true, value: { patched: false } });
    expect(warn).toHaveBeenCalledOnce();
  });

  it("retries a transient disconnect and then succeeds", async () => {
    const admin = new GatewayAdminClient(state({ patchFailures: 1 }));

    const result = await reconciler(admin).reconcile();

    expect(result).toEqual({ ok: true, value: { patched: true } });
    expect(admin.calls.map((call) => call.method)).toEqual([
      "config.get",
      "config.patch",
      "config.get",
      "config.patch",
    ]);
  });

  it("re-gets a fresh base hash before retrying a stale-base-hash patch", async () => {
    const admin = new GatewayAdminClient(state({ stalePatchFailures: 1 }));

    const result = await reconciler(admin).reconcile();

    expect(result).toEqual({ ok: true, value: { patched: true } });
    const patchCalls = admin.calls.filter((call) => call.method === "config.patch");
    expect(patchCalls.map((call) => call.params["baseHash"])).toEqual(["hash-1", "hash-2"]);
  });
});
