import type { TenantId } from "@opzava/shared-kernel";
import type { OpaqueExternalRef, Result } from "@opzava/shared-kernel";

export type OpenClawGatewayRouteId = string & {
  readonly __openClawGatewayRouteId: "OpenClawGatewayRouteId";
};

export type OpenClawSessionRef = OpaqueExternalRef & {
  readonly __openClawSessionRef?: "OpenClawSessionRef";
};

export type OpenClawRunRef = OpaqueExternalRef & {
  readonly __openClawRunRef?: "OpenClawRunRef";
};

export type OpenClawToolCallId = string & {
  readonly __openClawToolCallId: "OpenClawToolCallId";
};

export type OpenClawStreamEvent =
  | {
      readonly type: "queued";
      readonly turnId: string;
    }
  | {
      readonly type: "delta";
      readonly turnId: string;
      readonly deltaText: string;
    }
  | {
      readonly type: "tool.started";
      readonly turnId: string;
      readonly toolCallId: OpenClawToolCallId;
      readonly toolName: string;
    }
  | {
      readonly type: "tool.call";
      readonly turnId: string;
      readonly toolCallId: OpenClawToolCallId;
      readonly toolName: string;
      readonly args: Readonly<Record<string, unknown>>;
    }
  | {
      readonly type: "tool.completed";
      readonly turnId: string;
      readonly toolCallId: OpenClawToolCallId;
      readonly toolName: string;
      readonly output: Readonly<Record<string, unknown>>;
    }
  | {
      readonly type: "approval.requested";
      readonly turnId: string;
      readonly approvalRef: OpaqueExternalRef;
      readonly summary: string;
    }
  | {
      readonly type: "final";
      readonly turnId: string;
      readonly content: Readonly<Record<string, unknown>>;
      readonly sessionRef?: OpenClawSessionRef;
      readonly runRef?: OpenClawRunRef;
    }
  | {
      readonly type: "failed";
      readonly turnId: string;
      readonly code: string;
      readonly message: string;
    };

export interface OpenClawActingPrincipal {
  readonly tenantId: TenantId;
}

export interface StartAssistantStreamInput {
  readonly routeId: OpenClawGatewayRouteId;
  readonly assistantKey: string;
  readonly conversationId: string;
  readonly turnId: string;
  readonly prompt: string;
  readonly idempotencyKey: string;
  readonly actingPrincipal: OpenClawActingPrincipal;
  readonly sessionRef?: OpenClawSessionRef;
}

export interface StartAssistantStreamReceipt {
  readonly sessionRef: OpenClawSessionRef;
  readonly runRef?: OpenClawRunRef;
  readonly events: AsyncIterable<OpenClawStreamEvent>;
}

export interface ExpectedToolInventory {
  readonly routeId: OpenClawGatewayRouteId;
  readonly sessionRef: OpenClawSessionRef;
  readonly toolNames: readonly string[];
}

export interface ToolInventorySnapshot {
  readonly sessionRef: OpenClawSessionRef;
  readonly toolNames: readonly string[];
  readonly checkedAt: Date;
}

export interface OpenClawGatewayHealthSnapshot {
  readonly routeId: OpenClawGatewayRouteId;
  readonly reachable: boolean;
  readonly circuitOpen: boolean;
  readonly checkedAt: Date;
  readonly degradedReason?: string;
}

export type OpenClawAuditKind = "agent_run" | "tool_action" | "message";
export type OpenClawAuditStatus =
  "started" | "succeeded" | "failed" | "cancelled" | "timed_out" | "blocked" | "unknown";

export interface OpenClawAuditActivityFilters {
  readonly agent?: string;
  readonly session?: string;
  readonly run?: string;
  readonly kind?: OpenClawAuditKind;
  readonly status?: OpenClawAuditStatus;
  readonly direction?: "inbound" | "outbound";
  readonly channel?: string;
  readonly after?: number;
  readonly before?: number;
  readonly limit?: number;
  readonly cursor?: string;
}

interface OpenClawAuditEventCommon {
  readonly eventId: string;
  readonly sequence: number;
  readonly sourceSequence: number;
  readonly occurredAt: number;
  readonly action: string;
  readonly status: OpenClawAuditStatus;
}

export type OpenClawAuditEvent =
  | (OpenClawAuditEventCommon & {
      readonly eventType: "agent_run";
      readonly agentId: string;
      readonly runId: string;
      readonly errorCode?: string;
    })
  | (OpenClawAuditEventCommon & {
      readonly eventType: "tool_action";
      readonly agentId: string;
      readonly runId: string;
      readonly toolName?: string;
      readonly errorCode?: string;
    })
  | (OpenClawAuditEventCommon & {
      readonly eventType: "inbound_message";
      readonly channel: string;
      readonly conversationKind: "direct" | "group" | "channel" | "unknown";
      readonly outcome: "completed" | "skipped" | "failed";
      readonly agentId?: string;
      readonly runId?: string;
      readonly durationMs?: number;
      readonly resultCount?: number;
      readonly reasonCode?: string;
      readonly errorCode?: string;
    })
  | (OpenClawAuditEventCommon & {
      readonly eventType: "outbound_message";
      readonly channel: string;
      readonly conversationKind: "direct" | "group" | "channel" | "unknown";
      readonly outcome: "sent" | "suppressed" | "failed" | "unknown";
      readonly agentId?: string;
      readonly runId?: string;
      readonly durationMs?: number;
      readonly resultCount?: number;
      readonly reasonCode?: string;
      readonly deliveryKind?: "text" | "media" | "other";
      readonly failureStage?: "platform_send" | "queue" | "unknown";
      readonly errorCode?: string;
    });

export interface OpenClawAuditActivityPage {
  readonly events: readonly OpenClawAuditEvent[];
  readonly nextCursor?: string;
}

export interface OpenClawGatewayRoute {
  startAssistantStream(
    input: Omit<StartAssistantStreamInput, "routeId" | "actingPrincipal">,
  ): Promise<Result<StartAssistantStreamReceipt>>;
  getEffectiveTools(
    input: Omit<ExpectedToolInventory, "routeId">,
  ): Promise<Result<ToolInventorySnapshot>>;
  auditActivityList(
    filters: OpenClawAuditActivityFilters,
  ): Promise<Result<OpenClawAuditActivityPage>>;
}

export interface OpenClawGatewayPort {
  /**
   * The only tenant-scoped Gateway acquisition path. The acting principal
   * carries a single field, `tenantId`; binding the route to it prevents
   * accidental omission of the tenant check from current or future handle
   * methods. This is not impersonation defence: a holder of the internal token
   * can act for the tenant it fronts — the accepted, inherent trust in the BFF.
   * (ADR-018 Option 3, per-tenant scoped tokens, is a separate deferred control
   * that only bounds the fleet-wide blast radius of a stolen token.) No user/org/
   * workspace/role identity crosses this boundary — the BFF owns the verified session.
   */
  forPrincipal(input: {
    readonly routeId: OpenClawGatewayRouteId;
    readonly actingPrincipal: OpenClawActingPrincipal;
  }): Promise<Result<OpenClawGatewayRoute>>;

  /**
   * Operations/liveness capability exposing per-route existence, reachability,
   * circuit state, and degradation metadata. It is not gated on a principal and
   * is not tenant-proof; the shared internal token holder remains trusted.
   */
  getHealthForOps(routeId: OpenClawGatewayRouteId): Promise<Result<OpenClawGatewayHealthSnapshot>>;
}
