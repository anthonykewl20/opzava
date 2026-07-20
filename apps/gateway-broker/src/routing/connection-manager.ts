import type {
  ExpectedToolInventory,
  OpenClawAuditActivityFilters,
  OpenClawAuditActivityPage,
  OpenClawActingPrincipal,
  OpenClawGatewayHealthSnapshot,
  OpenClawGatewayPort,
  OpenClawGatewayRoute,
  OpenClawGatewayRouteId,
  StartAssistantStreamInput,
  StartAssistantStreamReceipt,
  ToolInventorySnapshot,
} from "@opzava/ports";
import { err, ok, type Result } from "@opzava/shared-kernel";

import { gatewayBrokerError } from "../acl/openclaw/errors.js";
import type { BrokerLogger } from "../acl/openclaw/logger.js";
import { silentBrokerLogger } from "../acl/openclaw/logger.js";
import {
  OpenClawOperatorClient,
  type OpenClawOperatorClientOptions,
} from "../acl/openclaw/operator-client.js";
import type { GatewayRouteConfig, GatewayRoutingTable } from "./routes.js";

interface ManagedClient {
  readonly route: GatewayRouteConfig;
  readonly client: OpenClawOperatorClient;
  idleTimer: NodeJS.Timeout | undefined;
}

interface CircuitState {
  readonly openedUntil: number;
  readonly reason: string;
  readonly failures: number;
}

export interface GatewayConnectionManagerOptions {
  readonly routingTable: GatewayRoutingTable;
  readonly idleDisconnectMs?: number;
  readonly maxFailuresBeforeOpen?: number;
  readonly circuitOpenMs?: number;
  readonly baseBackoffMs?: number;
  readonly maxBackoffMs?: number;
  readonly jitter?: () => number;
  readonly now?: () => number;
  readonly logger?: BrokerLogger;
  readonly clientOptions?: Partial<Omit<OpenClawOperatorClientOptions, "route" | "logger" | "now">>;
}

export class GatewayConnectionManager implements OpenClawGatewayPort {
  private readonly routingTable: GatewayRoutingTable;
  private readonly idleDisconnectMs: number;
  private readonly maxFailuresBeforeOpen: number;
  private readonly circuitOpenMs: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly jitter: () => number;
  private readonly now: () => number;
  private readonly logger: BrokerLogger;
  private readonly clientOptions:
    Partial<Omit<OpenClawOperatorClientOptions, "route" | "logger" | "now">> | undefined;
  private readonly clients = new Map<OpenClawGatewayRouteId, ManagedClient>();
  private readonly circuits = new Map<OpenClawGatewayRouteId, CircuitState>();

  public constructor(options: GatewayConnectionManagerOptions) {
    this.routingTable = options.routingTable;
    this.idleDisconnectMs = options.idleDisconnectMs ?? 60_000;
    this.maxFailuresBeforeOpen = options.maxFailuresBeforeOpen ?? 3;
    this.circuitOpenMs = options.circuitOpenMs ?? 30_000;
    this.baseBackoffMs = options.baseBackoffMs ?? 1_000;
    this.maxBackoffMs = options.maxBackoffMs ?? 30_000;
    this.jitter = options.jitter ?? Math.random;
    this.now = options.now ?? Date.now;
    this.logger = options.logger ?? silentBrokerLogger;
    this.clientOptions = options.clientOptions;
  }

  public async forPrincipal(input: {
    readonly routeId: OpenClawGatewayRouteId;
    readonly actingPrincipal: OpenClawActingPrincipal;
  }): Promise<Result<OpenClawGatewayRoute>> {
    const route = this.routingTable.getRoute(input.routeId);
    if (route === undefined) {
      return err(
        gatewayBrokerError("gatewayBroker.gatewayUnavailable", "Gateway route was not found."),
      );
    }

    if (input.actingPrincipal.tenantId !== route.tenantId) {
      // The browser denial is deliberately opaque; both ids keep stale OPENCLAW_GATEWAY_TENANT_ID
      // versus seeded-org drift diagnosable in logs.
      this.logger.warn(
        {
          routeId: input.routeId,
          routeTenantId: route.tenantId,
          principalTenantId: input.actingPrincipal.tenantId,
        },
        "Gateway route tenant does not match the acting principal.",
      );
      return err(
        gatewayBrokerError(
          "gatewayBroker.tenantMismatch",
          "Gateway route tenant does not match the authenticated principal.",
        ),
      );
    }

    return ok({
      startAssistantStream: (streamInput) =>
        this.startAssistantStreamForRoute({
          ...streamInput,
          routeId: input.routeId,
          actingPrincipal: input.actingPrincipal,
        }),
      getEffectiveTools: (toolInput) =>
        this.getEffectiveToolsForRoute({ ...toolInput, routeId: input.routeId }),
      auditActivityList: (filters) => this.auditActivityListForRoute(input.routeId, filters),
    });
  }

  public async getHealthForOps(
    routeId: OpenClawGatewayRouteId,
  ): Promise<Result<OpenClawGatewayHealthSnapshot>> {
    const route = this.routingTable.getRoute(routeId);
    if (route === undefined) {
      return err(
        gatewayBrokerError("gatewayBroker.gatewayUnavailable", "Gateway route was not found."),
      );
    }

    const circuit = this.circuits.get(routeId);
    const managed = this.clients.get(routeId);
    if (managed !== undefined) {
      return ok(managed.client.health());
    }

    return ok({
      routeId,
      reachable: false,
      circuitOpen: circuit !== undefined && circuit.openedUntil > this.now(),
      checkedAt: new Date(),
      ...(circuit === undefined ? {} : { degradedReason: circuit.reason }),
    });
  }

  public disconnectAll(): void {
    for (const managed of this.clients.values()) {
      this.clearIdleTimer(managed);
      managed.client.disconnect();
    }
    this.clients.clear();
  }

  private async startAssistantStreamForRoute(
    input: StartAssistantStreamInput,
  ): Promise<Result<StartAssistantStreamReceipt>> {
    const client = this.getOrCreateClient(input.routeId);
    if (!client.ok) {
      return err(client.error);
    }

    this.clearIdleTimer(client.value);
    const result = await client.value.client.startAssistantStream(input);
    this.recordResult(client.value, result);
    if (client.value.client.activeStreamCount === 0) {
      this.scheduleIdleDisconnect(client.value);
    }
    return result;
  }

  private async getEffectiveToolsForRoute(
    input: ExpectedToolInventory,
  ): Promise<Result<ToolInventorySnapshot>> {
    const client = this.getOrCreateClient(input.routeId);
    if (!client.ok) {
      return err(client.error);
    }

    this.clearIdleTimer(client.value);
    const result = await client.value.client.getEffectiveTools(input);
    this.recordResult(client.value, result);
    if (client.value.client.activeStreamCount === 0) {
      this.scheduleIdleDisconnect(client.value);
    }
    return result;
  }

  private async auditActivityListForRoute(
    routeId: OpenClawGatewayRouteId,
    filters: OpenClawAuditActivityFilters,
  ): Promise<Result<OpenClawAuditActivityPage>> {
    const client = this.getOrCreateClient(routeId);
    if (!client.ok) return err(client.error);
    this.clearIdleTimer(client.value);
    const result = await client.value.client.auditActivityList(filters);
    this.recordResult(client.value, result);
    if (client.value.client.activeStreamCount === 0) this.scheduleIdleDisconnect(client.value);
    return result;
  }

  private getOrCreateClient(routeId: OpenClawGatewayRouteId): Result<ManagedClient> {
    const route = this.routingTable.getRoute(routeId);
    if (route === undefined) {
      return err(
        gatewayBrokerError("gatewayBroker.gatewayUnavailable", "Gateway route was not found."),
      );
    }

    const circuit = this.circuits.get(routeId);
    if (circuit !== undefined && circuit.openedUntil > this.now()) {
      return err(
        gatewayBrokerError(
          "gatewayBroker.circuitOpen",
          "Tenant Gateway route circuit breaker is open.",
          { routeId: route.routeId, tenantId: route.tenantId, reason: circuit.reason },
        ),
      );
    }

    const existing = this.clients.get(routeId);
    if (existing !== undefined) {
      return ok(existing);
    }

    const client = new OpenClawOperatorClient({
      ...this.clientOptions,
      route,
      logger: this.logger,
      now: this.now,
      onActiveStreamDrained: () => {
        const current = this.clients.get(routeId);
        if (current !== undefined) {
          this.scheduleIdleDisconnect(current);
        }
      },
    });
    const managed: ManagedClient = {
      route,
      idleTimer: undefined,
      client,
    };
    this.clients.set(routeId, managed);
    return ok(managed);
  }

  private recordResult<T>(managed: ManagedClient, result: Result<T>): void {
    const { routeId, tenantId } = managed.route;
    if (result.ok) {
      this.circuits.delete(routeId);
      return;
    }

    if (
      result.error.code === "gatewayBroker.sessionBusy" ||
      result.error.code === "gatewayBroker.auditUnsupported"
    ) {
      return;
    }

    const previous = this.circuits.get(routeId);
    const failures = (previous?.failures ?? 0) + 1;
    if (failures < this.maxFailuresBeforeOpen) {
      const backoff = this.backoffMs(failures);
      this.circuits.set(routeId, {
        failures,
        openedUntil: this.now() + backoff,
        reason: result.error.code,
      });
      return;
    }

    this.logger.warn(
      { routeId, tenantId, reason: result.error.code },
      "Tenant Gateway route circuit opened.",
    );
    this.circuits.set(routeId, {
      failures,
      openedUntil: this.now() + this.circuitOpenMs,
      reason: result.error.code,
    });
  }

  private backoffMs(failures: number): number {
    const exponential = Math.min(this.maxBackoffMs, this.baseBackoffMs * 2 ** (failures - 1));
    const jittered = exponential * (0.5 + this.jitter());
    return Math.max(1, Math.floor(jittered));
  }

  private scheduleIdleDisconnect(managed: ManagedClient): void {
    if (managed.client.activeStreamCount > 0) {
      return;
    }

    this.clearIdleTimer(managed);
    managed.idleTimer = setTimeout(() => {
      managed.idleTimer = undefined;
      if (managed.client.activeStreamCount > 0) {
        return;
      }

      managed.client.disconnect();
      this.clients.delete(managed.route.routeId);
    }, this.idleDisconnectMs);
  }

  private clearIdleTimer(managed: ManagedClient): void {
    if (managed.idleTimer !== undefined) {
      clearTimeout(managed.idleTimer);
      managed.idleTimer = undefined;
    }
  }
}
