import { AssertionError } from "node:assert";

import {
  makeOrgId,
  makeProjectId,
  makeTenantId,
  makeUserId,
  makeWorkspaceId,
} from "@opzava/shared-kernel";

import type {
  AuthorizationAction,
  AuthorizationDecision,
  AuthorizationPort,
  AuthorizationResource,
  AuthorizationSubject,
} from "./authorization.js";

export interface AuthorizationContractCase {
  readonly name: string;
  readonly subject: AuthorizationSubject;
  readonly action: AuthorizationAction;
  readonly resource: AuthorizationResource;
  readonly expected: AuthorizationDecision;
}

const tenantId = makeTenantId("authz-contract-tenant");
const otherTenantId = makeTenantId("authz-contract-other-tenant");
const orgId = makeOrgId("authz-contract-org");
const otherOrgId = makeOrgId("authz-contract-other-org");
const workspaceId = makeWorkspaceId("authz-contract-workspace");
const otherWorkspaceId = makeWorkspaceId("authz-contract-other-workspace");
const projectId = makeProjectId("authz-contract-project");

function subject(roleKeys: readonly string[]): AuthorizationSubject {
  return {
    userId: makeUserId(`authz-contract-${roleKeys.join("-") || "none"}-user`),
    tenantId,
    orgId,
    workspaceIds: [workspaceId],
    roleKeys,
  };
}

function workspaceResource(
  overrides: Partial<AuthorizationResource> = {},
): AuthorizationResource {
  return {
    type: "workspace",
    tenantId,
    orgId,
    workspaceId,
    projectId,
    ...overrides,
  };
}

export const authorizationContractCases: readonly AuthorizationContractCase[] = [
  {
    name: "owner can update a workspace in their tenant and workspace set",
    subject: subject(["owner"]),
    action: "update",
    resource: workspaceResource(),
    expected: { allowed: true },
  },
  {
    name: "member can read a workspace in their tenant and workspace set",
    subject: subject(["member"]),
    action: "read",
    resource: workspaceResource(),
    expected: { allowed: true },
  },
  {
    name: "guest cannot create in a workspace",
    subject: subject(["guest"]),
    action: "create",
    resource: workspaceResource(),
    expected: { allowed: false },
  },
  {
    name: "owner cannot act across workspaces",
    subject: subject(["owner"]),
    action: "read",
    resource: workspaceResource({ workspaceId: otherWorkspaceId }),
    expected: { allowed: false },
  },
  {
    name: "owner cannot act across tenants",
    subject: subject(["owner"]),
    action: "read",
    resource: workspaceResource({ tenantId: otherTenantId }),
    expected: { allowed: false },
  },
  {
    name: "owner cannot act across organizations",
    subject: subject(["owner"]),
    action: "read",
    resource: workspaceResource({ orgId: otherOrgId }),
    expected: { allowed: false },
  },
  {
    name: "owner cannot use an unsupported shared action",
    subject: subject(["owner"]),
    action: "approve",
    resource: workspaceResource(),
    expected: { allowed: false },
  },
  {
    name: "owner cannot use an unsupported shared resource",
    subject: subject(["owner"]),
    action: "read",
    resource: workspaceResource({ type: "tenant" }),
    expected: { allowed: false },
  },
];

export async function assertAuthorizationPortContract(
  port: AuthorizationPort,
): Promise<void> {
  for (const contractCase of authorizationContractCases) {
    const result = await port.can(
      contractCase.subject,
      contractCase.action,
      contractCase.resource,
    );

    if (!result.ok) {
      throw new AssertionError({
        message: `AuthorizationPort contract case failed with error: ${contractCase.name}`,
        actual: result.error,
        expected: contractCase.expected,
      });
    }

    if (result.value.allowed !== contractCase.expected.allowed) {
      throw new AssertionError({
        message: `AuthorizationPort contract case failed: ${contractCase.name}`,
        actual: result.value,
        expected: contractCase.expected,
      });
    }
  }
}
