import type { OrgId, UserId, WorkspaceId } from "@opzava/shared-kernel";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

export const crmContactLifecycles = ["lead", "qualified", "customer", "former"] as const;
export type CrmContactLifecycle = (typeof crmContactLifecycles)[number];

export const crmDealStatuses = ["open", "won", "lost"] as const;
export type CrmDealStatus = (typeof crmDealStatuses)[number];

export const crmTicketStatuses = [
  "new",
  "triage",
  "open",
  "waiting_on_customer",
  "resolved",
  "closed"
] as const;
export type CrmTicketStatus = (typeof crmTicketStatuses)[number];

export const crmTicketPriorities = ["low", "normal", "high", "urgent"] as const;
export type CrmTicketPriority = (typeof crmTicketPriorities)[number];

export const crmActivityKinds = [
  "note",
  "call",
  "contact_created",
  "account_created",
  "deal_created",
  "deal_stage_changed",
  "deal_status_changed",
  "ticket_created",
  "ticket_status_changed"
] as const;
export type CrmActivityKind = (typeof crmActivityKinds)[number];

export const crmActivityActorKinds = ["human", "assistant"] as const;
export type CrmActivityActorKind = (typeof crmActivityActorKinds)[number];

export interface CrmAccount {
  readonly id: string;
  readonly organizationId: OrgId;
  readonly workspaceId: WorkspaceId;
  readonly name: string;
  readonly domain: string | null;
  readonly industry: string | null;
  readonly website: string | null;
  readonly description: string;
  readonly ownerUserId: UserId | null;
  readonly parentAccountId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CrmContact {
  readonly id: string;
  readonly organizationId: OrgId;
  readonly workspaceId: WorkspaceId;
  readonly displayName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly title: string | null;
  readonly lifecycleStage: CrmContactLifecycle;
  readonly accountId: string | null;
  readonly ownerUserId: UserId | null;
  readonly notes: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CrmPipeline {
  readonly id: string;
  readonly organizationId: OrgId;
  readonly workspaceId: WorkspaceId;
  readonly key: string;
  readonly version: number;
  readonly name: string;
  readonly createdAt: Date;
}

export interface CrmPipelineStage {
  readonly id: string;
  readonly pipelineId: string;
  readonly organizationId: OrgId;
  readonly workspaceId: WorkspaceId;
  readonly name: string;
  readonly position: number;
}

export interface CrmDeal {
  readonly id: string;
  readonly organizationId: OrgId;
  readonly workspaceId: WorkspaceId;
  readonly title: string;
  readonly accountId: string;
  readonly primaryContactId: string | null;
  readonly pipelineId: string;
  readonly stageId: string;
  readonly status: CrmDealStatus;
  readonly valueCents: number | null;
  readonly currency: string;
  readonly ownerUserId: UserId | null;
  readonly expectedCloseAt: Date | null;
  readonly closedAt: Date | null;
  readonly closeReason: string | null;
  readonly position: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CrmTicket {
  readonly id: string;
  readonly organizationId: OrgId;
  readonly workspaceId: WorkspaceId;
  readonly subject: string;
  readonly body: string;
  readonly contactId: string;
  readonly accountId: string | null;
  readonly status: CrmTicketStatus;
  readonly priority: CrmTicketPriority;
  readonly queue: string;
  readonly assigneeUserId: UserId | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CrmActivity {
  readonly id: string;
  readonly organizationId: OrgId;
  readonly workspaceId: WorkspaceId;
  readonly kind: CrmActivityKind;
  readonly body: string;
  readonly actorKind: CrmActivityActorKind;
  readonly actorUserId: UserId | null;
  readonly contactId: string | null;
  readonly accountId: string | null;
  readonly dealId: string | null;
  readonly ticketId: string | null;
  readonly occurredAt: Date;
  readonly createdAt: Date;
}

const contactLifecycleSet = new Set<string>(crmContactLifecycles);
const dealStatusSet = new Set<string>(crmDealStatuses);
const ticketStatusSet = new Set<string>(crmTicketStatuses);
const ticketPrioritySet = new Set<string>(crmTicketPriorities);
const activityKindSet = new Set<string>(crmActivityKinds);

function crmValidationError(code: string, message: string): DomainError {
  return new DomainError({ code, message });
}

export function parseCrmContactLifecycle(value: unknown): Result<CrmContactLifecycle> {
  if (typeof value === "string" && contactLifecycleSet.has(value)) {
    return ok(value as CrmContactLifecycle);
  }

  return err(
    crmValidationError(
      "crm.invalidContactLifecycle",
      `Contact lifecycle must be one of: ${crmContactLifecycles.join(", ")}.`
    )
  );
}

export function parseCrmDealStatus(value: unknown): Result<CrmDealStatus> {
  if (typeof value === "string" && dealStatusSet.has(value)) {
    return ok(value as CrmDealStatus);
  }

  return err(
    crmValidationError(
      "crm.invalidDealStatus",
      `Deal status must be one of: ${crmDealStatuses.join(", ")}.`
    )
  );
}

export function parseCrmTicketStatus(value: unknown): Result<CrmTicketStatus> {
  if (typeof value === "string" && ticketStatusSet.has(value)) {
    return ok(value as CrmTicketStatus);
  }

  return err(
    crmValidationError(
      "crm.invalidTicketStatus",
      `Ticket status must be one of: ${crmTicketStatuses.join(", ")}.`
    )
  );
}

export function parseCrmTicketPriority(value: unknown): Result<CrmTicketPriority> {
  if (typeof value === "string" && ticketPrioritySet.has(value)) {
    return ok(value as CrmTicketPriority);
  }

  return err(
    crmValidationError(
      "crm.invalidTicketPriority",
      `Ticket priority must be one of: ${crmTicketPriorities.join(", ")}.`
    )
  );
}

export function parseCrmActivityKind(value: unknown): Result<CrmActivityKind> {
  if (typeof value === "string" && activityKindSet.has(value)) {
    return ok(value as CrmActivityKind);
  }

  return err(
    crmValidationError(
      "crm.invalidActivityKind",
      `Activity kind must be one of: ${crmActivityKinds.join(", ")}.`
    )
  );
}
