import type { OrgId, WorkspaceId } from "@opzava/shared-kernel";

export const organizationLifecycleStates = [
  "provisioning",
  "active",
  "suspended",
  "deprovisioning",
  "deleted"
] as const;

export type OrganizationLifecycleState = (typeof organizationLifecycleStates)[number];

export interface Organization {
  readonly id: OrgId;
  readonly slug: string;
  readonly name: string;
  readonly lifecycleState: OrganizationLifecycleState;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface Workspace {
  readonly id: WorkspaceId;
  readonly organizationId: OrgId;
  readonly slug: string;
  readonly name: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
