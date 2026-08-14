import { randomUUID } from "node:crypto";

import {
  type DeviceLoginHandle,
  type GatewayRuntimePort,
  type SetupTokenLoginHandle,
} from "@opzava/ports";
import { DomainError, type Result } from "@opzava/shared-kernel";

export interface PendingProviderDeviceFlow {
  readonly flowId: string;
  readonly orgId: string;
  readonly actorUserId: string;
  readonly providerId: string;
  readonly authChoiceId: string;
  readonly intervalSeconds: number;
  readonly login: DeviceLoginHandle;
  readonly generation: string;
  readonly lifecycle: "active" | "cancelling";
  readonly expiresAt: Date;
  readonly timeout: ReturnType<typeof setTimeout>;
}

export interface PendingProviderSetupTokenFlow {
  readonly flowId: string;
  readonly orgId: string;
  readonly providerId: string;
  readonly login: SetupTokenLoginHandle;
  readonly timeout: ReturnType<typeof setTimeout>;
  phase: "starting" | "awaiting_code" | "completing" | "cancelling";
  outcome?: unknown;
  outcomeCleanupTimeout?: ReturnType<typeof setTimeout>;
}

export interface ProviderConnectFlowCleanupStore {
  readonly getDevice: (flowId: string) => PendingProviderDeviceFlow | undefined;
  readonly setDevice: (flowId: string, flow: PendingProviderDeviceFlow) => void;
  readonly deleteDevice: (flowId: string) => void;
  readonly deviceFlows: () => readonly PendingProviderDeviceFlow[];
  readonly getDeviceStop: (flowId: string) => Promise<void> | undefined;
  readonly setDeviceStop: (flowId: string, stop: Promise<void>) => void;
  readonly deleteDeviceStop: (flowId: string) => void;
  readonly getSetupToken: (flowId: string) => PendingProviderSetupTokenFlow | undefined;
  readonly deleteSetupToken: (flowId: string) => void;
  readonly setupTokenFlows: () => readonly PendingProviderSetupTokenFlow[];
  readonly getSetupTokenCleanup: (flowId: string) => Promise<void> | undefined;
  readonly setSetupTokenCleanup: (flowId: string, cleanup: Promise<void>) => void;
  readonly deleteSetupTokenCleanup: (flowId: string) => void;
}

export interface ProviderConnectFlowCleanupDependencies {
  readonly gatewayRuntime: () => GatewayRuntimePort | undefined;
  readonly now: () => Date;
  readonly configWriteKey: (orgId: string) => string;
  readonly acquireProviderWrite: (key: string) => void;
  readonly releaseProviderWrite: (key: string) => void;
  readonly store: ProviderConnectFlowCleanupStore;
  readonly deviceCleanupRetryMs: number;
  readonly setupTokenCleanupRetryDelaysMs: readonly number[];
  readonly setupTokenCleanupFinalRetryDelayMs: number;
}

/**
 * Adapter-cleanup portion of the provider connect-flow seam. The facade retains flow maps and
 * reservations; this module receives only opaque store operations and explicit dependencies.
 */
export class ProviderConnectFlowCleanup {
  public constructor(private readonly deps: ProviderConnectFlowCleanupDependencies) {}

  public isCurrentActiveDeviceFlow(flow: PendingProviderDeviceFlow): boolean {
    const current = this.deps.store.getDevice(flow.flowId);
    return current?.generation === flow.generation && current.lifecycle === "active";
  }

  public isCurrentSetupTokenFlow(flow: PendingProviderSetupTokenFlow): boolean {
    return this.isMappedSetupTokenFlow(flow) && flow.phase !== "cancelling";
  }

  public async cleanupDeviceFlow(flow: PendingProviderDeviceFlow): Promise<void> {
    const activeStop = this.deps.store.getDeviceStop(flow.flowId);
    if (activeStop !== undefined) return activeStop;

    const current = this.deps.store.getDevice(flow.flowId);
    if (current === undefined || current.generation !== flow.generation) return;

    const cancelling: PendingProviderDeviceFlow = {
      ...current,
      generation: randomUUID(),
      lifecycle: "cancelling",
    };
    // Publish synchronously: polls and log parsing must lose ownership before cancellation awaits.
    this.deps.store.setDevice(flow.flowId, cancelling);
    const reservationKey = this.deps.configWriteKey(flow.orgId);
    this.deps.acquireProviderWrite(reservationKey);
    const stop = (async (): Promise<void> => {
      try {
        const runtime = this.deps.gatewayRuntime();
        if (runtime === undefined) throw new Error("Gateway runtime is unavailable.");
        const cancelled = await runtime.cancelDeviceLogin(cancelling.login);
        if (!cancelled.ok) throw cancelled.error;
        const mapped = this.deps.store.getDevice(flow.flowId);
        if (mapped?.generation === cancelling.generation && mapped.lifecycle === "cancelling") {
          clearTimeout(mapped.timeout);
          this.deps.store.deleteDevice(flow.flowId);
        }
      } catch (error) {
        const mapped = this.deps.store.getDevice(flow.flowId);
        if (mapped?.generation === cancelling.generation && mapped.lifecycle === "cancelling") {
          if (this.deps.now().getTime() >= mapped.expiresAt.getTime()) {
            const retryFlow: PendingProviderDeviceFlow = {
              ...mapped,
              lifecycle: "active",
              timeout: setTimeout(() => {
                const retry = this.deps.store.getDevice(flow.flowId);
                if (retry !== undefined) void this.cleanupDeviceFlow(retry).catch(() => undefined);
              }, this.deps.deviceCleanupRetryMs),
            };
            this.deps.store.setDevice(flow.flowId, retryFlow);
          } else {
            this.deps.store.setDevice(flow.flowId, { ...mapped, lifecycle: "active" });
          }
        }
        throw new DomainError({
          code: "provisioning.connections.deviceFlowStopUnverified",
          message: "Could not confirm that the device-code sign-in stopped.",
          details: { causeCode: error instanceof DomainError ? error.code : "runtime_stop_failed" },
        });
      } finally {
        this.deps.releaseProviderWrite(reservationKey);
      }
    })();
    this.deps.store.setDeviceStop(flow.flowId, stop);
    try {
      await stop;
    } finally {
      if (this.deps.store.getDeviceStop(flow.flowId) === stop) {
        this.deps.store.deleteDeviceStop(flow.flowId);
      }
    }
  }

  public async cleanupDeviceFlowsForProvider(providerId: string, orgId?: string): Promise<void> {
    const flows = this.deps.store
      .deviceFlows()
      .filter((flow) => flow.providerId === providerId && (orgId === undefined || flow.orgId === orgId));
    await Promise.all(flows.map((flow) => this.cleanupDeviceFlow(flow)));
  }

  public async cleanupSetupTokenFlow(flow: PendingProviderSetupTokenFlow): Promise<void> {
    const existing = this.deps.store.getSetupTokenCleanup(flow.flowId);
    if (existing !== undefined) return existing;
    const cleanup = this.cleanupSetupTokenFlowInner(flow);
    this.deps.store.setSetupTokenCleanup(flow.flowId, cleanup);
    try {
      await cleanup;
    } finally {
      if (this.deps.store.getSetupTokenCleanup(flow.flowId) === cleanup) {
        this.deps.store.deleteSetupTokenCleanup(flow.flowId);
      }
    }
  }

  public scheduleSetupTokenOutcomeCleanup(
    flow: PendingProviderSetupTokenFlow,
    delayMs: number,
    retryIndex: number,
    finalAttempt = false,
  ): void {
    flow.outcomeCleanupTimeout = setTimeout(() => {
      if (!this.isCurrentSetupTokenFlow(flow) || flow.outcome === undefined) return;
      void this.cleanupSetupTokenFlow(flow).catch((error: unknown) => {
        if (!this.isCurrentSetupTokenFlow(flow)) return;
        const retryDelayMs = this.deps.setupTokenCleanupRetryDelaysMs[retryIndex];
        if (retryDelayMs !== undefined) {
          this.scheduleSetupTokenOutcomeCleanup(flow, retryDelayMs, retryIndex + 1);
          return;
        }
        // Do not include the opaque handle, error message, or setup token: any could reveal operational or credential material.
        console.error("connections.setupToken.cleanupUnverified", {
          level: "error",
          providerId: flow.providerId,
          flowId: flow.flowId,
          attempts: retryIndex + 1,
          finalAttempt,
          causeCode: error instanceof DomainError ? error.code : "runtime_stop_failed",
        });
        if (!finalAttempt) {
          this.scheduleSetupTokenOutcomeCleanup(
            flow,
            this.deps.setupTokenCleanupFinalRetryDelayMs,
            retryIndex,
            true,
          );
        }
      });
    }, delayMs);
  }

  public async cleanupSetupTokenFlowsForProvider(providerId: string, orgId?: string): Promise<void> {
    const flows = this.deps.store
      .setupTokenFlows()
      .filter((flow) => flow.providerId === providerId && (orgId === undefined || flow.orgId === orgId));
    await Promise.all(flows.map((flow) => this.cleanupSetupTokenFlow(flow)));
  }

  private async cleanupSetupTokenFlowInner(flow: PendingProviderSetupTokenFlow): Promise<void> {
    if (!this.isMappedSetupTokenFlow(flow)) return;
    const runtime = this.deps.gatewayRuntime();
    if (runtime === undefined) throw new Error("Gateway runtime is unavailable.");
    const previousPhase = flow.phase;
    flow.phase = "cancelling";
    let cancelled: Result<void>;
    try {
      cancelled = await runtime.cancelSetupTokenLogin(flow.login);
    } catch (error) {
      if (this.isMappedSetupTokenFlow(flow) && flow.phase === "cancelling") flow.phase = previousPhase;
      throw error;
    }
    if (!cancelled.ok) {
      if (this.isMappedSetupTokenFlow(flow) && flow.phase === "cancelling") flow.phase = previousPhase;
      if (!this.isMappedSetupTokenFlow(flow)) return;
      throw cancelled.error;
    }
    if (this.isMappedSetupTokenFlow(flow) && flow.phase === "cancelling") {
      this.deps.store.deleteSetupToken(flow.flowId);
      clearTimeout(flow.timeout);
      if (flow.outcomeCleanupTimeout !== undefined) clearTimeout(flow.outcomeCleanupTimeout);
    }
  }

  private isMappedSetupTokenFlow(flow: PendingProviderSetupTokenFlow): boolean {
    return this.deps.store.getSetupToken(flow.flowId)?.login === flow.login;
  }
}
