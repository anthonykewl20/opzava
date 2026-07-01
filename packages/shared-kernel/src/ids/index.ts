import { DomainError, err, ok, type Result } from "../result/index.js";

declare const tenantIdBrand: unique symbol;
declare const orgIdBrand: unique symbol;
declare const workspaceIdBrand: unique symbol;
declare const projectIdBrand: unique symbol;
declare const userIdBrand: unique symbol;
declare const agentEmployeeIdBrand: unique symbol;
declare const taskIdBrand: unique symbol;

export type TenantId = string & { readonly [tenantIdBrand]: "TenantId" };
export type OrgId = string & { readonly [orgIdBrand]: "OrgId" };
export type WorkspaceId = string & { readonly [workspaceIdBrand]: "WorkspaceId" };
export type ProjectId = string & { readonly [projectIdBrand]: "ProjectId" };
export type UserId = string & { readonly [userIdBrand]: "UserId" };
export type AgentEmployeeId = string & { readonly [agentEmployeeIdBrand]: "AgentEmployeeId" };
export type TaskId = string & { readonly [taskIdBrand]: "TaskId" };

const opaqueIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,127}$/;

function invalidIdError(name: string, value: unknown): DomainError {
  return new DomainError({
    code: "sharedKernel.invalidId",
    message: `${name} must be a non-empty opaque identifier containing only letters, numbers, underscores, and hyphens.`,
    details: { name, value }
  });
}

function makeOpaqueId<T extends string>(name: string, value: string): T {
  const parsed = parseOpaqueId<T>(name, value);

  if (!parsed.ok) {
    throw parsed.error;
  }

  return parsed.value;
}

function parseOpaqueId<T extends string>(name: string, value: unknown): Result<T> {
  if (typeof value !== "string" || !opaqueIdPattern.test(value)) {
    return err(invalidIdError(name, value));
  }

  return ok(value as T);
}

export function makeTenantId(value: string): TenantId {
  return makeOpaqueId<TenantId>("TenantId", value);
}

export function parseTenantId(value: unknown): Result<TenantId> {
  return parseOpaqueId<TenantId>("TenantId", value);
}

export function makeOrgId(value: string): OrgId {
  return makeOpaqueId<OrgId>("OrgId", value);
}

export function parseOrgId(value: unknown): Result<OrgId> {
  return parseOpaqueId<OrgId>("OrgId", value);
}

export function makeWorkspaceId(value: string): WorkspaceId {
  return makeOpaqueId<WorkspaceId>("WorkspaceId", value);
}

export function parseWorkspaceId(value: unknown): Result<WorkspaceId> {
  return parseOpaqueId<WorkspaceId>("WorkspaceId", value);
}

export function makeProjectId(value: string): ProjectId {
  return makeOpaqueId<ProjectId>("ProjectId", value);
}

export function parseProjectId(value: unknown): Result<ProjectId> {
  return parseOpaqueId<ProjectId>("ProjectId", value);
}

export function makeUserId(value: string): UserId {
  return makeOpaqueId<UserId>("UserId", value);
}

export function parseUserId(value: unknown): Result<UserId> {
  return parseOpaqueId<UserId>("UserId", value);
}

export function makeAgentEmployeeId(value: string): AgentEmployeeId {
  return makeOpaqueId<AgentEmployeeId>("AgentEmployeeId", value);
}

export function parseAgentEmployeeId(value: unknown): Result<AgentEmployeeId> {
  return parseOpaqueId<AgentEmployeeId>("AgentEmployeeId", value);
}

export function makeTaskId(value: string): TaskId {
  return makeOpaqueId<TaskId>("TaskId", value);
}

export function parseTaskId(value: unknown): Result<TaskId> {
  return parseOpaqueId<TaskId>("TaskId", value);
}
