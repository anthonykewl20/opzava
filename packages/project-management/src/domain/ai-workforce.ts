import type { OrgId, TaskId, UserId, WorkspaceId } from "@opzava/shared-kernel";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import type { TaskCiState, TaskMergeState } from "./task.js";

export const agentIdentityKinds = ["orchestrator", "gateway_subagent", "local_tool"] as const;
export type AgentIdentityKind = (typeof agentIdentityKinds)[number];

export const agentIdentityStatuses = ["active", "revoked"] as const;
export type AgentIdentityStatus = (typeof agentIdentityStatuses)[number];

export const agentDispatchChannels = ["gateway_push", "local_poll"] as const;
export type AgentDispatchChannel = (typeof agentDispatchChannels)[number];

export const agentDispatchStates = [
  "pending",
  "dispatched",
  "acked",
  "degraded",
  "failed",
] as const;
export type AgentDispatchState = (typeof agentDispatchStates)[number];

export const taskRunStepStates = ["running", "done", "failed"] as const;
export type TaskRunStepState = (typeof taskRunStepStates)[number];

export interface AgentIdentity {
  readonly id: string;
  readonly organizationId: OrgId;
  readonly workspaceId: WorkspaceId;
  readonly name: string;
  readonly kind: AgentIdentityKind;
  readonly provider: string | null;
  readonly viaClient: string | null;
  readonly issuedToUserId: UserId | null;
  readonly tokenId: string | null;
  readonly openclawAgentRef: string | null;
  readonly status: AgentIdentityStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TaskAgentAssignment {
  readonly id: string;
  readonly organizationId: OrgId;
  readonly workspaceId: WorkspaceId;
  readonly taskId: TaskId;
  readonly agentIdentityId: string;
  readonly runPolicy: string | null;
  readonly assignedByUserId: UserId | null;
  readonly active: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AgentDispatch {
  readonly id: string;
  readonly organizationId: OrgId;
  readonly workspaceId: WorkspaceId;
  readonly taskId: TaskId;
  readonly outboxId: string;
  readonly channel: AgentDispatchChannel;
  readonly state: AgentDispatchState;
  readonly degradedReason: string | null;
  readonly openclawSessionRef: string | null;
  readonly openclawTaskRef: string | null;
  readonly aiRunRef: string | null;
  readonly idempotencyKey: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TaskRunStep {
  readonly id: string;
  readonly organizationId: OrgId;
  readonly workspaceId: WorkspaceId;
  readonly taskId: TaskId;
  readonly agentIdentityId: string | null;
  readonly sequence: number;
  readonly summary: string;
  readonly state: TaskRunStepState;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
  readonly createdAt: Date;
}

export interface TaskPullQueue {
  readonly id: string;
  readonly organizationId: OrgId;
  readonly workspaceId: WorkspaceId;
  readonly taskId: TaskId;
  readonly agentIdentityId: string;
  readonly reason: string | null;
  readonly claimedAt: Date | null;
  readonly claimedByTokenId: string | null;
  readonly createdAt: Date;
}

export interface TaskPrLink {
  readonly id: string;
  readonly organizationId: OrgId;
  readonly workspaceId: WorkspaceId;
  readonly taskId: TaskId;
  readonly prRef: string;
  readonly branch: string | null;
  readonly ciState: TaskCiState | null;
  readonly mergeability: string | null;
  readonly checksUrl: string | null;
  readonly mergeState: TaskMergeState | null;
  readonly mergedByUserId: UserId | null;
  readonly mergedAt: Date | null;
  readonly mergeAudit: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const agentIdentityKindSet = new Set<string>(agentIdentityKinds);
const agentIdentityStatusSet = new Set<string>(agentIdentityStatuses);
const agentDispatchChannelSet = new Set<string>(agentDispatchChannels);
const agentDispatchStateSet = new Set<string>(agentDispatchStates);
const taskRunStepStateSet = new Set<string>(taskRunStepStates);

function aiWorkforceValidationError(code: string, message: string): DomainError {
  return new DomainError({ code, message });
}

export function parseAgentIdentityKind(value: unknown): Result<AgentIdentityKind> {
  if (typeof value === "string" && agentIdentityKindSet.has(value)) {
    return ok(value as AgentIdentityKind);
  }

  return err(
    aiWorkforceValidationError(
      "projectManagement.invalidAgentIdentityKind",
      `Agent identity kind must be one of: ${agentIdentityKinds.join(", ")}.`,
    ),
  );
}

export function parseAgentIdentityStatus(value: unknown): Result<AgentIdentityStatus> {
  if (typeof value === "string" && agentIdentityStatusSet.has(value)) {
    return ok(value as AgentIdentityStatus);
  }

  return err(
    aiWorkforceValidationError(
      "projectManagement.invalidAgentIdentityStatus",
      `Agent identity status must be one of: ${agentIdentityStatuses.join(", ")}.`,
    ),
  );
}

export function parseAgentDispatchChannel(value: unknown): Result<AgentDispatchChannel> {
  if (typeof value === "string" && agentDispatchChannelSet.has(value)) {
    return ok(value as AgentDispatchChannel);
  }

  return err(
    aiWorkforceValidationError(
      "projectManagement.invalidAgentDispatchChannel",
      `Agent dispatch channel must be one of: ${agentDispatchChannels.join(", ")}.`,
    ),
  );
}

export function parseAgentDispatchState(value: unknown): Result<AgentDispatchState> {
  if (typeof value === "string" && agentDispatchStateSet.has(value)) {
    return ok(value as AgentDispatchState);
  }

  return err(
    aiWorkforceValidationError(
      "projectManagement.invalidAgentDispatchState",
      `Agent dispatch state must be one of: ${agentDispatchStates.join(", ")}.`,
    ),
  );
}

export function parseTaskRunStepState(value: unknown): Result<TaskRunStepState> {
  if (typeof value === "string" && taskRunStepStateSet.has(value)) {
    return ok(value as TaskRunStepState);
  }

  return err(
    aiWorkforceValidationError(
      "projectManagement.invalidTaskRunStepState",
      `Task run step state must be one of: ${taskRunStepStates.join(", ")}.`,
    ),
  );
}
