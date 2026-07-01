import type { OrgId, ProjectId, TenantId, UserId, WorkspaceId } from "@opzava/shared-kernel";
import type { Result } from "@opzava/shared-kernel";

export interface AuthorizationSubject {
  readonly userId: UserId;
  readonly tenantId: TenantId;
  readonly orgId: OrgId;
  readonly workspaceIds: readonly WorkspaceId[];
  readonly roleKeys?: readonly string[];
}

export type AuthorizationAction =
  | "read"
  | "create"
  | "update"
  | "delete"
  | "admin"
  | "approve"
  | "execute";

export interface AuthorizationResource {
  readonly type:
    | "tenant"
    | "organization"
    | "workspace"
    | "project"
    | "task"
    | "agent"
    | "gateway"
    | "secret";
  readonly tenantId: TenantId;
  readonly orgId?: OrgId;
  readonly workspaceId?: WorkspaceId;
  readonly projectId?: ProjectId;
  readonly id?: string;
}

export interface AuthorizationDecision {
  readonly allowed: boolean;
  readonly reason?: string;
}

export type TenantGrant = "owner" | "admin" | "member" | "guest";
export type ProjectGrant = "project:admin" | "project:write" | "project:read";

export interface TenantGrantCheckInput {
  readonly subject: AuthorizationSubject;
  readonly tenantId: TenantId;
  readonly grant: TenantGrant;
}

export interface ProjectGrantCheckInput {
  readonly subject: AuthorizationSubject;
  readonly tenantId: TenantId;
  readonly projectId: ProjectId;
  readonly grant: ProjectGrant;
}

export interface AuthorizationPort {
  can(
    subject: AuthorizationSubject,
    action: AuthorizationAction,
    resource: AuthorizationResource
  ): Promise<Result<AuthorizationDecision>>;
  hasTenantGrant(input: TenantGrantCheckInput): Promise<Result<AuthorizationDecision>>;
  hasProjectGrant(input: ProjectGrantCheckInput): Promise<Result<AuthorizationDecision>>;
}
