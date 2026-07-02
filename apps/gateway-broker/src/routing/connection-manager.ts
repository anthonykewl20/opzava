import type {
  ExpectedToolInventory,
  OpenClawGatewayHealthSnapshot,
  OpenClawGatewayPort,
  OpenClawGatewayRouteId,
  StartAssistantStreamInput,
  StartAssistantStreamReceipt,
  ToolInventorySnapshot
} from "@opzava/ports";
import { err, ok, type Result } from "@opzava/shared-kernel";

import { gatewayBrokerError } from "../acl/openclaw/errors.js";
import type { BrokerLogger } from "../acl/openclaw/logger.js";
import { silentBrokerLogger } from "../acl/openclaw/logger.js";
import {
  OpenClawOperatorClient,
  type OpenClawOperatorClientOptions
} from "../acl/openclaw/operator-client.js";
import type { GatewayRoutingTable } from "./routes.js";

interface ManagedClient {
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
  readonly clientOptions?: Partial<
    Omit<OpenClawOperatorClientOptions, "route" | "logger" | "now">
  >;
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
    | Partial<Omit<OpenClawOperatorClientOptions, "route" | "logger" | "now">>
    | undefined;
  private readonly clients = new Map<string, ManagedClient>();
  private readonly circuits = new Map<string, CircuitState>();

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

  public async startAssistantStream(
    input: StartAssistantStreamInput
  ): Promise<Result<StartAssistantStreamReceipt>> {
    const client = this.getOrCreateClient(input.routeId);
    if (!client.ok) {
      return err(client.error);
    }

    this.clearIdleTimer(client.value);
    const result = await client.value.client.startAssistantStream(input);
    this.recordResult(client.value.client, result);
    this.scheduleIdleDisconnect(client.value);
    return result;
  }

  public async getEffectiveTools(
    input: ExpectedToolInventory
  ): Promise<Result<ToolInventorySnapshot>> {
    let lastError: Result<ToolInventorySnapshot> | undefined;
    for (const managed of this.clients.values()) {
      const result = await managed.client.getEffectiveTools(input);
      this.recordResult(managed.client, result);
      if (result.ok) {
        return result;
      }
      lastError = result;
    }

    if (lastError !== undefined) {
      return lastError;
    }

    return err(
      gatewayBrokerError(
        "gatewayBroker.gatewayUnavailable",
        "No connected OpenClaw Gateway route is available for tools.effective."
      )
    );
  }

  public async getHealth(
    routeId: OpenClawGatewayRouteId
  ): Promise<Result<OpenClawGatewayHealthSnapshot>> {
    const route = this.routingTable.getRoute(routeId);
    if (route === undefined) {
      return err(
        gatewayBrokerError("gatewayBroker.gatewayUnavailable", "Gateway route was not found.")
      );
    }

    const circuit = this.circuits.get(String(route.tenantId));
    const managed = this.clients.get(String(route.tenantId));
    if (managed !== undefined) {
      return ok(managed.client.health());
    }

    return ok({
      routeId,
      reachable: false,
      circuitOpen: circuit !== undefined && circuit.openedUntil > this.now(),
      checkedAt: new Date(),
      ...(circuit === undefined ? {} : { degradedReason: circuit.reason })
    });
  }

  public disconnectAll(): void {
    for (const managed of this.clients.values()) {
      this.clearIdleTimer(managed);
      managed.client.disconnect();
    }
    this.clients.clear();
  }

  private getOrCreateClient(
    routeId: StartAssistantStreamInput["routeId"]
  ): Result<ManagedClient> {
    const route = this.routingTable.getRoute(routeId);
    if (route === undefined) {
      return err(
        gatewayBrokerError("gatewayBroker.gatewayUnavailable", "Gateway route was not found.")
      );
    }

    const circuit = this.circuits.get(String(route.tenantId));
    if (circuit !== undefined && circuit.openedUntil > this.now()) {
      return err(
        gatewayBrokerError(
          "gatewayBroker.circuitOpen",
          "Tenant Gateway route circuit breaker is open.",
          { routeId: route.routeId, tenantId: route.tenantId, reason: circuit.reason }
        )
      );
    }

    const key = String(route.tenantId);
    const existing = this.clients.get(key);
    if (existing !== undefined) {
      return ok(existing);
    }

    const managed: ManagedClient = {
      idleTimer: undefined,
      client: new OpenClawOperatorClient({
        ...this.clientOptions,
        route,
        logger: this.logger,
        now: this.now
      })
    };
    this.clients.set(key, managed);
    return ok(managed);
  }

  private recordResult<T>(client: OpenClawOperatorClient, result: Result<T>): void {
    const tenantId = this.routeTenant(client);
    if (result.ok) {
      this.circuits.delete(tenantId);
      return;
    }

    const previous = this.circuits.get(tenantId);
    const failures = (previous?.failures ?? 0) + 1;
    if (failures < this.maxFailuresBeforeOpen) {
      const backoff = this.backoffMs(failures);
      this.circuits.set(tenantId, {
        failures,
        openedUntil: this.now() + backoff,
        reason: result.error.code
      });
      return;
    }

    this.logger.warn(
      { routeId: client.routeId, tenantId, reason: result.error.code },
      "Tenant Gateway route circuit opened."
    );
    this.circuits.set(tenantId, {
      failures,
      openedUntil: this.now() + this.circuitOpenMs,
      reason: result.error.code
    });
  }

  private routeTenant(client: OpenClawOperatorClient): string {
    for (const [tenantId, managed] of this.clients.entries()) {
      if (managed.client === client) {
        return tenantId;
      }
    }

    return "unknown";
  }

  private backoffMs(failures: number): number {
    const exponential = Math.min(this.maxBackoffMs, this.baseBackoffMs * 2 ** (failures - 1));
    const jittered = exponential * (0.5 + this.jitter());
    return Math.max(1, Math.floor(jittered));
  }

  private scheduleIdleDisconnect(managed: ManagedClient): void {
    this.clearIdleTimer(managed);
    managed.idleTimer = setTimeout(() => {
      managed.client.disconnect();
      this.clients.delete(String(this.routeTenant(managed.client)));
    }, this.idleDisconnectMs);
  }

  private clearIdleTimer(managed: ManagedClient): void {
    if (managed.idleTimer !== undefined) {
      clearTimeout(managed.idleTimer);
      managed.idleTimer = undefined;
    }
  }
}
