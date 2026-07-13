import type { OrgId, TenantId, UserId, WorkspaceId } from "@opzava/shared-kernel";
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
  readonly orgId: OrgId;
  readonly workspaceId: WorkspaceId;
  readonly userId: UserId;
  readonly roleKeys: readonly string[];
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

export interface OpenClawGatewayPort {
  startAssistantStream(
    input: StartAssistantStreamInput
  ): Promise<Result<StartAssistantStreamReceipt>>;
  getEffectiveTools(input: ExpectedToolInventory): Promise<Result<ToolInventorySnapshot>>;
  getHealth(routeId: OpenClawGatewayRouteId): Promise<Result<OpenClawGatewayHealthSnapshot>>;
}
