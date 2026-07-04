import type {
  AuthorizationAction,
  AuthorizationDecision,
  AuthorizationPort,
  AuthorizationResource,
  AuthorizationSubject,
  ProjectGrantCheckInput,
  TenantGrant,
  TenantGrantCheckInput,
} from "@opzava/ports";
import { ok, type Result } from "@opzava/shared-kernel";

const crmMemberRoles = new Set(["owner", "admin", "member"]);

function roleAllows(required: TenantGrant, roleKeys: readonly string[]): boolean {
  if (required === "guest") {
    return roleKeys.includes("guest");
  }

  if (required === "member") {
    return roleKeys.some((roleKey) => crmMemberRoles.has(roleKey));
  }

  if (required === "admin") {
    return roleKeys.includes("owner") || roleKeys.includes("admin");
  }

  return roleKeys.includes("owner");
}

function decision(allowed: boolean, reason?: string): Result<AuthorizationDecision> {
  return ok(reason === undefined ? { allowed } : { allowed, reason });
}

function roleDecision(allowed: boolean, reason: string): Result<AuthorizationDecision> {
  return allowed ? decision(true) : decision(false, reason);
}

export class RoleKeyCrmAuthorizationPort implements AuthorizationPort {
  public async can(
    subject: AuthorizationSubject,
    action: AuthorizationAction,
    resource: AuthorizationResource,
  ): Promise<Result<AuthorizationDecision>> {
    if (resource.type !== "workspace") {
      return decision(false, "unsupported-resource");
    }

    if (resource.tenantId !== subject.tenantId) {
      return decision(false, "tenant-mismatch");
    }

    if (resource.orgId !== undefined && resource.orgId !== subject.orgId) {
      return decision(false, "organization-mismatch");
    }

    if (
      resource.workspaceId !== undefined &&
      !subject.workspaceIds.includes(resource.workspaceId)
    ) {
      return decision(false, "workspace-mismatch");
    }

    if (
      action !== "read" &&
      action !== "create" &&
      action !== "update" &&
      action !== "delete"
    ) {
      return decision(false, "unsupported-action");
    }

    return roleDecision(roleAllows("member", subject.roleKeys ?? []), "missing-crm-role");
  }

  public async hasTenantGrant(
    input: TenantGrantCheckInput,
  ): Promise<Result<AuthorizationDecision>> {
    if (input.tenantId !== input.subject.tenantId) {
      return decision(false, "tenant-mismatch");
    }

    return roleDecision(
      roleAllows(input.grant, input.subject.roleKeys ?? []),
      "missing-tenant-grant",
    );
  }

  public async hasProjectGrant(
    input: ProjectGrantCheckInput,
  ): Promise<Result<AuthorizationDecision>> {
    if (input.tenantId !== input.subject.tenantId) {
      return decision(false, "tenant-mismatch");
    }

    return roleDecision(
      roleAllows("member", input.subject.roleKeys ?? []),
      "missing-project-grant",
    );
  }
}

export const defaultCrmAuthorizationPort = new RoleKeyCrmAuthorizationPort();
