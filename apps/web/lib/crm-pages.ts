import type {
  CrmAccountDto,
  CrmActivityDto,
  CrmContactDto,
  CrmDealDto,
  CrmTicketDto,
} from "@opzava/crm";

import type { AppSessionContext } from "@/lib/session";

export function crmActorFromContext(context: AppSessionContext) {
  return {
    userId: context.user.id,
    roleKeys: context.roleKeys,
  };
}

export function crmErrorStatus(error: unknown, depth = 0): number | undefined {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return undefined;
  }

  const status = (error as { readonly status?: unknown }).status;
  return typeof status === "number"
    ? status
    : crmErrorStatus((error as { readonly cause?: unknown }).cause, depth + 1);
}

export function crmErrorCode(error: unknown, depth = 0): string | undefined {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return undefined;
  }

  const code = (error as { readonly code?: unknown }).code;
  return typeof code === "string"
    ? code
    : crmErrorCode((error as { readonly cause?: unknown }).cause, depth + 1);
}

export function isCrmForbidden(error: unknown): boolean {
  return crmErrorCode(error) === "crm.forbidden" || crmErrorStatus(error) === 403;
}

export function isCrmNotFound(error: unknown): boolean {
  return crmErrorCode(error) === "crm.notFound";
}

export function stringFromForm(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function optionalStringFromForm(formData: FormData, key: string): string | null {
  const value = stringFromForm(formData, key).trim();
  return value === "" ? null : value;
}

export function ownerUserIdFromForm(
  value: string | null,
  context: AppSessionContext,
): string | null {
  return value === "me" ? context.user.id : null;
}

export function crmContextInput(context: AppSessionContext) {
  return {
    orgId: context.orgId,
    workspaceId: context.workspaceId,
    actor: crmActorFromContext(context),
  };
}

export type WebsiteNormalizationResult =
  | { readonly ok: true; readonly value: string | null }
  | { readonly ok: false; readonly message: string };

const websiteSchemePattern = /^[A-Za-z][A-Za-z0-9+.-]*:/;

export function normalizeCrmWebsiteForStorage(value: string | null): WebsiteNormalizationResult {
  if (value === null) {
    return { ok: true, value: null };
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return { ok: true, value: null };
  }

  const candidate = websiteSchemePattern.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;

  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, message: "Website must be a valid URL." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, message: "Website must use http:// or https://." };
  }

  return { ok: true, value: url.toString() };
}

export function accountWebsiteHref(value: string | null): string | null {
  const normalized = normalizeCrmWebsiteForStorage(value);
  return normalized.ok ? normalized.value : null;
}

export function lifecycleLabel(value: CrmContactDto["lifecycleStage"]): string {
  if (value === "lead") {
    return "Lead";
  }

  if (value === "qualified") {
    return "Qualified";
  }

  if (value === "customer") {
    return "Customer";
  }

  return "Former";
}

export function lifecycleBadgeClassName(value: CrmContactDto["lifecycleStage"]): string {
  if (value === "customer") {
    return "badge badge-success";
  }

  if (value === "qualified") {
    return "badge badge-accent";
  }

  if (value === "former") {
    return "badge";
  }

  return "badge badge-warning";
}

export function dealStatusLabel(value: CrmDealDto["status"]): string {
  if (value === "won") {
    return "Won";
  }

  if (value === "lost") {
    return "Lost";
  }

  return "Open";
}

export function dealStatusBadgeClassName(value: CrmDealDto["status"]): string {
  if (value === "won") {
    return "badge badge-success";
  }

  if (value === "lost") {
    return "badge badge-danger";
  }

  return "badge badge-accent";
}

export function ticketStatusLabel(value: CrmTicketDto["status"]): string {
  if (value === "waiting_on_customer") {
    return "Waiting";
  }

  return value
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ticketStatusBadgeClassName(value: CrmTicketDto["status"]): string {
  if (value === "resolved" || value === "closed") {
    return "badge badge-success";
  }

  if (value === "waiting_on_customer") {
    return "badge badge-warning";
  }

  if (value === "new") {
    return "badge badge-accent";
  }

  return "badge";
}

export function ticketPriorityLabel(value: CrmTicketDto["priority"]): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

export function ticketPriorityBadgeClassName(value: CrmTicketDto["priority"]): string {
  if (value === "urgent") {
    return "badge badge-danger";
  }

  if (value === "high") {
    return "badge badge-warning";
  }

  return "badge";
}

export function activityKindLabel(value: CrmActivityDto["kind"]): string {
  if (value === "call") {
    return "Call";
  }

  if (value === "note") {
    return "Note";
  }

  return value
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

export function activityKindIcon(value: CrmActivityDto["kind"]): string {
  if (value === "call") {
    return "C";
  }

  if (value === "note") {
    return "N";
  }

  return "A";
}

export function actorLabel(activity: CrmActivityDto, context: AppSessionContext): string {
  if (activity.actorKind === "assistant") {
    return "Assistant";
  }

  if (activity.actorUserId === context.user.id) {
    return context.user.name;
  }

  return activity.actorUserId ?? "Unknown actor";
}

export function relativeTime(value: string): string {
  const diffMs = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diffMs)) {
    return "unknown";
  }

  if (diffMs < 60_000) {
    return "now";
  }

  if (diffMs < 3_600_000) {
    return `${Math.floor(diffMs / 60_000)}m ago`;
  }

  if (diffMs < 86_400_000) {
    return `${Math.floor(diffMs / 3_600_000)}h ago`;
  }

  return `${Math.floor(diffMs / 86_400_000)}d ago`;
}

export function ownerLabel(ownerUserId: string | null, context: AppSessionContext): string {
  if (ownerUserId === null) {
    return "Unassigned";
  }

  return ownerUserId === context.user.id ? context.user.name : ownerUserId;
}

export function openDealsFromColumns(
  columns: readonly { readonly deals: readonly CrmDealDto[] }[],
): readonly CrmDealDto[] {
  return columns.flatMap((column) => column.deals).filter((deal) => deal.status === "open");
}

export function accountOpenDealCount(
  account: CrmAccountDto,
  openDeals: readonly CrmDealDto[],
): number {
  return openDeals.filter((deal) => deal.accountId === account.id).length;
}

export function accountOpenTicketCount(
  account: CrmAccountDto,
  tickets: readonly CrmTicketDto[],
): number {
  return tickets.filter(
    (ticket) =>
      ticket.accountId === account.id && ticket.status !== "resolved" && ticket.status !== "closed",
  ).length;
}

export function formatMoney(valueCents: number | null, currency: string): string {
  if (valueCents === null) {
    return "No value";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(valueCents / 100);
}
