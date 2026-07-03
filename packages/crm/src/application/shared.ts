import { mapDatabaseError, sql, type TenantTransaction } from "@opzava/adapters";
import type { AuthorizationPort, AuthorizationSubject } from "@opzava/ports";
import {
  DomainError,
  err,
  makeOrgId,
  makeTenantId,
  makeUserId,
  makeWorkspaceId,
  ok,
  type Result,
} from "@opzava/shared-kernel";

import { defaultCrmAuthorizationPort } from "./authorization.js";
import {
  parseCrmActivityKind,
  parseCrmContactLifecycle,
  parseCrmDealStatus,
  parseCrmTicketPriority,
  parseCrmTicketStatus,
  type CrmActivityActorKind,
  type CrmActivityKind,
  type CrmContactLifecycle,
  type CrmDealStatus,
  type CrmTicketPriority,
  type CrmTicketStatus,
} from "../domain/index.js";

export interface CrmActor {
  readonly userId: string;
  readonly roleKeys: readonly string[];
}

export interface CrmApplicationContext {
  readonly orgId: string;
  readonly workspaceId: string;
  readonly actor: CrmActor;
}

export interface CrmApplicationDependencies {
  readonly authorizationPort?: AuthorizationPort;
}

export interface CrmAccountDto {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly domain: string | null;
  readonly industry: string | null;
  readonly website: string | null;
  readonly description: string;
  readonly ownerUserId: string | null;
  readonly parentAccountId: string | null;
  readonly contactCount: number;
  readonly dealCount: number;
  readonly ticketCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CrmContactDto {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly title: string | null;
  readonly lifecycleStage: CrmContactLifecycle;
  readonly accountId: string | null;
  readonly accountName: string | null;
  readonly ownerUserId: string | null;
  readonly notes: string;
  readonly openTicketCount: number;
  readonly openDealCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CrmPipelineDto {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly key: string;
  readonly version: number;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CrmPipelineStageDto {
  readonly id: string;
  readonly pipelineId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly position: number;
  readonly createdAt: string;
}

export interface CrmPipelineWithStagesDto {
  readonly pipeline: CrmPipelineDto;
  readonly stages: readonly CrmPipelineStageDto[];
}

export interface CrmDealDto {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly title: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly primaryContactId: string | null;
  readonly primaryContactName: string | null;
  readonly pipelineId: string;
  readonly stageId: string;
  readonly stageName: string;
  readonly status: CrmDealStatus;
  readonly valueCents: number | null;
  readonly currency: string;
  readonly ownerUserId: string | null;
  readonly expectedCloseDate: string | null;
  readonly closedAt: string | null;
  readonly closeReason: string | null;
  readonly position: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CrmDealStageColumnDto {
  readonly stage: CrmPipelineStageDto;
  readonly deals: readonly CrmDealDto[];
}

export interface CrmTicketDto {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly subject: string;
  readonly body: string;
  readonly contactId: string;
  readonly contactName: string;
  readonly accountId: string | null;
  readonly accountName: string | null;
  readonly status: CrmTicketStatus;
  readonly priority: CrmTicketPriority;
  readonly queue: string;
  readonly assigneeUserId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CrmActivityDto {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly kind: CrmActivityKind;
  readonly body: string;
  readonly actorKind: CrmActivityActorKind;
  readonly actorUserId: string | null;
  readonly contactId: string | null;
  readonly accountId: string | null;
  readonly dealId: string | null;
  readonly ticketId: string | null;
  readonly occurredAt: string;
  readonly createdAt: string;
}

export type QueryRow = Record<string, unknown>;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function crmError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

export function databaseError(error: unknown): DomainError {
  return crmError("crm.databaseError", "Database operation failed.", mapDatabaseError(error));
}

export function rowsFromExecuteResult(result: unknown): readonly QueryRow[] {
  if (Array.isArray(result)) {
    return result as readonly QueryRow[];
  }

  if (typeof result !== "object" || result === null || !("rows" in result)) {
    return [];
  }

  const rows = (result as { readonly rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as readonly QueryRow[]) : [];
}

export function parseDate(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return new Date(value).toISOString();
  }

  throw crmError("crm.invalidRecord", "CRM record contains an invalid timestamp.");
}

export function parseNullableDate(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return parseDate(value);
}

export function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string" && value.trim() !== "") {
    return Number(value);
  }

  return null;
}

export function rowToAccountDto(row: QueryRow): CrmAccountDto {
  return {
    id: String(row["id"]),
    organizationId: String(row["organization_id"]),
    workspaceId: String(row["workspace_id"]),
    name: String(row["name"]),
    domain: stringOrNull(row["domain"]),
    industry: stringOrNull(row["industry"]),
    website: stringOrNull(row["website"]),
    description: String(row["description"] ?? ""),
    ownerUserId: stringOrNull(row["owner_user_id"]),
    parentAccountId: stringOrNull(row["parent_account_id"]),
    contactCount: Number(row["contact_count"] ?? 0),
    dealCount: Number(row["deal_count"] ?? 0),
    ticketCount: Number(row["ticket_count"] ?? 0),
    createdAt: parseDate(row["created_at"]),
    updatedAt: parseDate(row["updated_at"]),
  };
}

export function rowToContactDto(row: QueryRow): CrmContactDto {
  const lifecycleStage = parseCrmContactLifecycle(row["lifecycle_stage"]);
  if (!lifecycleStage.ok) {
    throw lifecycleStage.error;
  }

  return {
    id: String(row["id"]),
    organizationId: String(row["organization_id"]),
    workspaceId: String(row["workspace_id"]),
    displayName: String(row["display_name"]),
    email: stringOrNull(row["email"]),
    phone: stringOrNull(row["phone"]),
    title: stringOrNull(row["title"]),
    lifecycleStage: lifecycleStage.value,
    accountId: stringOrNull(row["account_id"]),
    accountName: stringOrNull(row["account_name"]),
    ownerUserId: stringOrNull(row["owner_user_id"]),
    notes: String(row["notes"] ?? ""),
    openTicketCount: Number(row["open_ticket_count"] ?? 0),
    openDealCount: Number(row["open_deal_count"] ?? 0),
    createdAt: parseDate(row["created_at"]),
    updatedAt: parseDate(row["updated_at"]),
  };
}

export function rowToPipelineDto(row: QueryRow): CrmPipelineDto {
  return {
    id: String(row["id"]),
    organizationId: String(row["organization_id"]),
    workspaceId: String(row["workspace_id"]),
    key: String(row["key"]),
    version: Number(row["version"]),
    name: String(row["name"]),
    createdAt: parseDate(row["created_at"]),
    updatedAt: parseDate(row["updated_at"]),
  };
}

export function rowToPipelineStageDto(row: QueryRow): CrmPipelineStageDto {
  return {
    id: String(row["id"]),
    pipelineId: String(row["pipeline_id"]),
    organizationId: String(row["organization_id"]),
    workspaceId: String(row["workspace_id"]),
    name: String(row["name"]),
    position: Number(row["position"]),
    createdAt: parseDate(row["created_at"]),
  };
}

export function rowToDealDto(row: QueryRow): CrmDealDto {
  const status = parseCrmDealStatus(row["status"]);
  if (!status.ok) {
    throw status.error;
  }

  return {
    id: String(row["id"]),
    organizationId: String(row["organization_id"]),
    workspaceId: String(row["workspace_id"]),
    title: String(row["title"]),
    accountId: String(row["account_id"]),
    accountName: String(row["account_name"] ?? ""),
    primaryContactId: stringOrNull(row["primary_contact_id"]),
    primaryContactName: stringOrNull(row["primary_contact_name"]),
    pipelineId: String(row["pipeline_id"]),
    stageId: String(row["stage_id"]),
    stageName: String(row["stage_name"] ?? ""),
    status: status.value,
    valueCents: numberOrNull(row["value_cents"]),
    currency: String(row["currency"] ?? "USD"),
    ownerUserId: stringOrNull(row["owner_user_id"]),
    expectedCloseDate: parseNullableDate(row["expected_close_date"]),
    closedAt: parseNullableDate(row["closed_at"]),
    closeReason: stringOrNull(row["close_reason"]),
    position: Number(row["position"]),
    createdAt: parseDate(row["created_at"]),
    updatedAt: parseDate(row["updated_at"]),
  };
}

export function rowToTicketDto(row: QueryRow): CrmTicketDto {
  const status = parseCrmTicketStatus(row["status"]);
  const priority = parseCrmTicketPriority(row["priority"]);

  if (!status.ok) {
    throw status.error;
  }

  if (!priority.ok) {
    throw priority.error;
  }

  return {
    id: String(row["id"]),
    organizationId: String(row["organization_id"]),
    workspaceId: String(row["workspace_id"]),
    subject: String(row["subject"]),
    body: String(row["body"] ?? ""),
    contactId: String(row["contact_id"]),
    contactName: String(row["contact_name"] ?? ""),
    accountId: stringOrNull(row["account_id"]),
    accountName: stringOrNull(row["account_name"]),
    status: status.value,
    priority: priority.value,
    queue: String(row["queue"] ?? "support"),
    assigneeUserId: stringOrNull(row["assignee_user_id"]),
    createdAt: parseDate(row["created_at"]),
    updatedAt: parseDate(row["updated_at"]),
  };
}

function activityActorKind(value: unknown): CrmActivityActorKind {
  return value === "assistant" ? "assistant" : "human";
}

export function rowToActivityDto(row: QueryRow): CrmActivityDto {
  const kind = parseCrmActivityKind(row["kind"]);
  if (!kind.ok) {
    throw kind.error;
  }

  return {
    id: String(row["id"]),
    organizationId: String(row["organization_id"]),
    workspaceId: String(row["workspace_id"]),
    kind: kind.value,
    body: String(row["body"] ?? ""),
    actorKind: activityActorKind(row["actor_kind"]),
    actorUserId: stringOrNull(row["actor_user_id"]),
    contactId: stringOrNull(row["contact_id"]),
    accountId: stringOrNull(row["account_id"]),
    dealId: stringOrNull(row["deal_id"]),
    ticketId: stringOrNull(row["ticket_id"]),
    occurredAt: parseDate(row["occurred_at"]),
    createdAt: parseDate(row["created_at"]),
  };
}

export function assertKnownIds(input: CrmApplicationContext): Result<void> {
  try {
    makeTenantId(input.orgId);
    makeOrgId(input.orgId);
    makeWorkspaceId(input.workspaceId);
    makeUserId(input.actor.userId);
    return ok(undefined);
  } catch (error) {
    return err(
      crmError(
        "crm.invalidContext",
        "CRM context contains an invalid organization, workspace, or actor id.",
        error,
      ),
    );
  }
}

export function assertKnownUuid(value: string, field: string): Result<void> {
  if (uuidPattern.test(value)) {
    return ok(undefined);
  }

  return err(crmError("crm.validation", `${field} must be a valid id.`));
}

export function authorizationSubject(input: CrmApplicationContext): AuthorizationSubject {
  return {
    userId: makeUserId(input.actor.userId),
    tenantId: makeTenantId(input.orgId),
    orgId: makeOrgId(input.orgId),
    workspaceIds: [makeWorkspaceId(input.workspaceId)],
    roleKeys: input.actor.roleKeys,
  };
}

export async function authorizeCrm(
  input: CrmApplicationContext,
  action: "read" | "create" | "update" | "delete",
  authorizationPort: AuthorizationPort = defaultCrmAuthorizationPort,
): Promise<Result<void>> {
  const decisionResult = await authorizationPort.can(authorizationSubject(input), action, {
    type: "workspace",
    tenantId: makeTenantId(input.orgId),
    orgId: makeOrgId(input.orgId),
    workspaceId: makeWorkspaceId(input.workspaceId),
  });

  if (!decisionResult.ok) {
    return err(decisionResult.error);
  }

  if (!decisionResult.value.allowed) {
    return err(crmError("crm.forbidden", "You are not allowed to manage CRM records."));
  }

  return ok(undefined);
}

export function normalizeRequiredText(
  value: string,
  field: string,
  maxLength: number,
): Result<string> {
  const normalized = value.trim().replace(/\s+/g, " ");

  if (normalized.length === 0) {
    return err(crmError("crm.validation", `${field} is required.`));
  }

  if (normalized.length > maxLength) {
    return err(crmError("crm.validation", `${field} must be ${maxLength} characters or fewer.`));
  }

  return ok(normalized);
}

export function normalizeOptionalText(
  value: string | null | undefined,
  field: string,
  maxLength: number,
): Result<string | null> {
  if (value === null || value === undefined || value.trim() === "") {
    return ok(null);
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length > maxLength) {
    return err(crmError("crm.validation", `${field} must be ${maxLength} characters or fewer.`));
  }

  return ok(normalized);
}

export function normalizeLongText(
  value: string | null | undefined,
  field: string,
  maxLength: number,
): Result<string> {
  const normalized = (value ?? "").trim();
  if (normalized.length > maxLength) {
    return err(crmError("crm.validation", `${field} must be ${maxLength} characters or fewer.`));
  }

  return ok(normalized);
}

export function normalizeOptionalUserId(
  value: string | null | undefined,
  field: string,
): Result<string | null> {
  if (value === null || value === undefined || value.trim() === "") {
    return ok(null);
  }

  const normalized = value.trim();
  try {
    makeUserId(normalized);
    return ok(normalized);
  } catch (error) {
    return err(crmError("crm.validation", `${field} must be a valid user id.`, error));
  }
}

export function normalizeIdempotencyKey(value: string | undefined): Result<string | null> {
  if (value === undefined || value.trim() === "") {
    return ok(null);
  }

  const normalized = value.trim();
  if (normalized.length > 160) {
    return err(crmError("crm.validation", "Idempotency key must be 160 characters or fewer."));
  }

  return ok(normalized);
}

export function normalizeCurrency(value: string | undefined): Result<string> {
  const currency = (value ?? "USD").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    return err(crmError("crm.validation", "Currency must be a three-letter ISO code."));
  }

  return ok(currency);
}

export function normalizeValueCents(value: number | null | undefined): Result<number | null> {
  if (value === null || value === undefined) {
    return ok(null);
  }

  if (!Number.isSafeInteger(value) || value < 0) {
    return err(crmError("crm.validation", "Deal value must be a non-negative integer."));
  }

  return ok(value);
}

export function normalizeDate(value: string | Date | null | undefined): Result<string | null> {
  if (value === null || value === undefined) {
    return ok(null);
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return err(crmError("crm.validation", "Date must be valid."));
  }

  return ok(date.toISOString());
}

export function normalizeLimit(value: number | undefined, fallback = 50): Result<number> {
  const limit = value ?? fallback;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return err(crmError("crm.validation", "Limit must be between 1 and 100."));
  }

  return ok(limit);
}

export function normalizeOffset(value: number | undefined): Result<number> {
  const offset = value ?? 0;
  if (!Number.isInteger(offset) || offset < 0) {
    return err(crmError("crm.validation", "Offset must be a non-negative integer."));
  }

  return ok(offset);
}

export async function insertCrmActivity(
  tx: TenantTransaction,
  input: CrmApplicationContext,
  params: {
    readonly kind: CrmActivityKind;
    readonly body?: string;
    readonly actorKind?: CrmActivityActorKind;
    readonly contactId?: string | null;
    readonly accountId?: string | null;
    readonly dealId?: string | null;
    readonly ticketId?: string | null;
  },
): Promise<CrmActivityDto> {
  const actorKind = params.actorKind ?? "human";
  const result = await tx.execute(sql`
    insert into public.crm_activities (
      organization_id,
      workspace_id,
      kind,
      body,
      actor_kind,
      actor_user_id,
      contact_id,
      account_id,
      deal_id,
      ticket_id
    )
    values (
      ${input.orgId},
      ${input.workspaceId},
      ${params.kind}::public.crm_activity_kind,
      ${params.body ?? ""},
      ${actorKind}::public.crm_activity_actor_kind,
      ${actorKind === "human" ? input.actor.userId : null},
      ${params.contactId ?? null},
      ${params.accountId ?? null},
      ${params.dealId ?? null},
      ${params.ticketId ?? null}
    )
    returning
      id,
      organization_id,
      workspace_id,
      kind,
      body,
      actor_kind,
      actor_user_id,
      contact_id,
      account_id,
      deal_id,
      ticket_id,
      occurred_at,
      created_at
  `);

  const row = rowsFromExecuteResult(result)[0];
  if (row === undefined) {
    throw crmError("crm.databaseError", "CRM activity could not be written.");
  }

  return rowToActivityDto(row);
}
