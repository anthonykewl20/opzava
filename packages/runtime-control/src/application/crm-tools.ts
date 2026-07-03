import {
  crmTicketStatuses,
  listAccounts,
  listContactTimeline,
  listContacts,
  listDeals,
  listTickets,
  type CrmAccountDto,
  type CrmActivityDto,
  type CrmContactDto,
  type CrmDealDto,
  type CrmDealStageColumnDto,
  type CrmTicketDto,
  type CrmTicketStatus
} from "@opzava/crm";
import type { AuthorizationPort } from "@opzava/ports";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import {
  recordStartedToolOutcome,
  recordToolOutcome,
  type RuntimeControlDependencies,
  type StartedToolOutcomeReceipt,
  type ToolExecutionContext
} from "./assistant-conversations.js";
import type { AssistantToolOutcome } from "../domain/assistant.js";

export const runtimeControlCrmToolNames = [
  "opzava_crm_list_accounts",
  "opzava_crm_list_contacts",
  "opzava_crm_list_deals",
  "opzava_crm_list_tickets",
  "opzava_crm_get_contact_timeline"
] as const;

export type RuntimeControlCrmToolName = (typeof runtimeControlCrmToolNames)[number];

export interface RuntimeControlCrmToolDefinition {
  readonly name: RuntimeControlCrmToolName;
  readonly inputShape: string;
}

export const runtimeControlCrmToolRegistry: readonly RuntimeControlCrmToolDefinition[] = [
  {
    name: "opzava_crm_list_accounts",
    inputShape: "{ limit?: 1..50 }"
  },
  {
    name: "opzava_crm_list_contacts",
    inputShape: "{ limit?: 1..50 }"
  },
  {
    name: "opzava_crm_list_deals",
    inputShape: "{ limit?: 1..50 }"
  },
  {
    name: "opzava_crm_list_tickets",
    inputShape:
      "{ status?: new|triage|open|waiting_on_customer|resolved|closed, limit?: 1..50 }"
  },
  {
    name: "opzava_crm_get_contact_timeline",
    inputShape: "{ contactId, limit?: 1..50, offset?: 0..1000 }"
  }
];

export interface RuntimeControlCrmAccountSummary {
  readonly id: string;
  readonly name: string;
  readonly domain: string | null;
  readonly industry: string | null;
  readonly website: string | null;
  readonly contactCount: number;
  readonly dealCount: number;
  readonly ticketCount: number;
  readonly updatedAt: string;
}

export interface RuntimeControlCrmContactSummary {
  readonly id: string;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly title: string | null;
  readonly lifecycleStage: string;
  readonly lifecycleLabel: string;
  readonly accountName: string | null;
  readonly openDealCount: number;
  readonly openTicketCount: number;
  readonly updatedAt: string;
}

export interface RuntimeControlCrmDealSummary {
  readonly id: string;
  readonly title: string;
  readonly accountName: string;
  readonly primaryContactName: string | null;
  readonly stageName: string;
  readonly status: string;
  readonly statusLabel: string;
  readonly value: string | null;
  readonly valueCents: number | null;
  readonly currency: string;
  readonly expectedCloseDate: string | null;
  readonly updatedAt: string;
}

export interface RuntimeControlCrmDealStageSummary {
  readonly name: string;
  readonly count: number;
}

export interface RuntimeControlCrmTicketSummary {
  readonly id: string;
  readonly subject: string;
  readonly contactName: string;
  readonly accountName: string | null;
  readonly status: string;
  readonly statusLabel: string;
  readonly priority: string;
  readonly priorityLabel: string;
  readonly queue: string;
  readonly updatedAt: string;
}

export interface RuntimeControlCrmActivitySummary {
  readonly id: string;
  readonly kind: string;
  readonly kindLabel: string;
  readonly summary: string;
  readonly actor: string;
  readonly occurredAt: string;
}

export type RuntimeControlCrmToolOutput =
  | {
      readonly kind: "crm.accounts.list";
      readonly totalCount: number;
      readonly returnedCount: number;
      readonly accounts: readonly RuntimeControlCrmAccountSummary[];
    }
  | {
      readonly kind: "crm.contacts.list";
      readonly totalCount: number;
      readonly returnedCount: number;
      readonly contacts: readonly RuntimeControlCrmContactSummary[];
    }
  | {
      readonly kind: "crm.deals.list";
      readonly totalCount: number;
      readonly returnedCount: number;
      readonly stages: readonly RuntimeControlCrmDealStageSummary[];
      readonly deals: readonly RuntimeControlCrmDealSummary[];
    }
  | {
      readonly kind: "crm.tickets.list";
      readonly totalCount: number;
      readonly returnedCount: number;
      readonly tickets: readonly RuntimeControlCrmTicketSummary[];
    }
  | {
      readonly kind: "crm.contact_timeline.get";
      readonly contactId: string;
      readonly returnedCount: number;
      readonly activities: readonly RuntimeControlCrmActivitySummary[];
    };

export type RuntimeControlCrmToolExecution =
  | {
      readonly status: "succeeded";
      readonly toolName: RuntimeControlCrmToolName;
      readonly toolCallId: string;
      readonly output: RuntimeControlCrmToolOutput;
      readonly outcome: AssistantToolOutcome;
    }
  | {
      readonly status: "failed";
      readonly toolName: RuntimeControlCrmToolName;
      readonly toolCallId: string;
      readonly code: string;
      readonly message: string;
      readonly outcome: AssistantToolOutcome;
    };

export interface ExecuteRuntimeControlCrmToolInput {
  readonly context: ToolExecutionContext;
  readonly toolName: string;
  readonly toolCallId: string;
  readonly args: unknown;
}

export interface RuntimeControlCrmServices {
  readonly listAccounts: typeof listAccounts;
  readonly listContacts: typeof listContacts;
  readonly listDeals: typeof listDeals;
  readonly listTickets: typeof listTickets;
  readonly listContactTimeline: typeof listContactTimeline;
}

export interface RuntimeControlCrmToolDependencies extends RuntimeControlDependencies {
  readonly crmAuthorizationPort?: AuthorizationPort;
  readonly crmServices?: RuntimeControlCrmServices;
}

type ParsedToolArgs =
  | {
      readonly toolName: "opzava_crm_list_accounts";
      readonly args: {
        readonly limit: number;
      };
      readonly requestSummary: Readonly<Record<string, unknown>>;
    }
  | {
      readonly toolName: "opzava_crm_list_contacts";
      readonly args: {
        readonly limit: number;
      };
      readonly requestSummary: Readonly<Record<string, unknown>>;
    }
  | {
      readonly toolName: "opzava_crm_list_deals";
      readonly args: {
        readonly limit: number;
      };
      readonly requestSummary: Readonly<Record<string, unknown>>;
    }
  | {
      readonly toolName: "opzava_crm_list_tickets";
      readonly args: {
        readonly status?: CrmTicketStatus;
        readonly limit: number;
      };
      readonly requestSummary: Readonly<Record<string, unknown>>;
    }
  | {
      readonly toolName: "opzava_crm_get_contact_timeline";
      readonly args: {
        readonly contactId: string;
        readonly limit: number;
        readonly offset: number;
      };
      readonly requestSummary: Readonly<Record<string, unknown>>;
    };

interface ToolFailure {
  readonly code: string;
  readonly message: string;
}

const crmTicketStatusSet = new Set<string>(crmTicketStatuses);
const crmServices: RuntimeControlCrmServices = {
  listAccounts,
  listContacts,
  listDeals,
  listTickets,
  listContactTimeline
};

function toolError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause })
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[]
): Result<void> {
  const allowed = new Set(allowedKeys);
  const unknownKey = Object.keys(value).find((key) => !allowed.has(key));
  return unknownKey === undefined
    ? ok(undefined)
    : err(
        toolError(
          "runtimeControl.toolMalformedArgs",
          `Tool argument "${unknownKey}" is not allowed.`
        )
      );
}

function requiredString(
  value: unknown,
  field: string,
  maxLength: number
): Result<string> {
  if (typeof value !== "string") {
    return err(
      toolError("runtimeControl.toolMalformedArgs", `Tool argument "${field}" must be a string.`)
    );
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length === 0 || normalized.length > maxLength) {
    return err(
      toolError(
        "runtimeControl.toolMalformedArgs",
        `Tool argument "${field}" must be 1-${maxLength} characters.`
      )
    );
  }

  return ok(normalized);
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requiredContactId(value: unknown): Result<string> {
  const parsed = requiredString(value, "contactId", 180);
  if (!parsed.ok) {
    return parsed;
  }

  if (!uuidPattern.test(parsed.value)) {
    return err(
      toolError(
        "runtimeControl.toolMalformedArgs",
        'Tool argument "contactId" must be a contact id.'
      )
    );
  }

  return parsed;
}

function optionalTicketStatus(value: unknown): Result<CrmTicketStatus | undefined> {
  if (value === undefined) {
    return ok(undefined);
  }

  if (typeof value === "string" && crmTicketStatusSet.has(value)) {
    return ok(value as CrmTicketStatus);
  }

  return err(
    toolError(
      "runtimeControl.toolMalformedArgs",
      'Tool argument "status" must be new, triage, open, waiting_on_customer, resolved, or closed.'
    )
  );
}

function optionalLimit(value: unknown): Result<number> {
  if (value === undefined) {
    return ok(20);
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 50) {
    return err(
      toolError(
        "runtimeControl.toolMalformedArgs",
        'Tool argument "limit" must be an integer from 1 to 50.'
      )
    );
  }

  return ok(value);
}

function optionalOffset(value: unknown): Result<number> {
  if (value === undefined) {
    return ok(0);
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 1000) {
    return err(
      toolError(
        "runtimeControl.toolMalformedArgs",
        'Tool argument "offset" must be an integer from 0 to 1000.'
      )
    );
  }

  return ok(value);
}

function parseToolName(value: string): Result<RuntimeControlCrmToolName> {
  return runtimeControlCrmToolNames.includes(value as RuntimeControlCrmToolName)
    ? ok(value as RuntimeControlCrmToolName)
    : err(toolError("runtimeControl.unknownTool", "Requested CRM tool is not registered."));
}

function parseLimitOnlyArgs(
  value: unknown,
  toolName:
    | "opzava_crm_list_accounts"
    | "opzava_crm_list_contacts"
    | "opzava_crm_list_deals"
): Result<ParsedToolArgs> {
  if (!isRecord(value)) {
    return err(
      toolError("runtimeControl.toolMalformedArgs", "CRM list tool arguments must be an object.")
    );
  }

  const unknownKeys = rejectUnknownKeys(value, ["limit"]);
  if (!unknownKeys.ok) {
    return err(unknownKeys.error);
  }

  const limit = optionalLimit(value["limit"]);
  if (!limit.ok) {
    return err(limit.error);
  }

  const args = { limit: limit.value };
  return ok({
    toolName,
    args,
    requestSummary: { toolName, args }
  } as ParsedToolArgs);
}

function parseListTicketsArgs(value: unknown): Result<ParsedToolArgs> {
  if (!isRecord(value)) {
    return err(
      toolError(
        "runtimeControl.toolMalformedArgs",
        "CRM ticket list tool arguments must be an object."
      )
    );
  }

  const unknownKeys = rejectUnknownKeys(value, ["status", "limit"]);
  if (!unknownKeys.ok) {
    return err(unknownKeys.error);
  }

  const status = optionalTicketStatus(value["status"]);
  const limit = optionalLimit(value["limit"]);
  if (!status.ok) {
    return err(status.error);
  }
  if (!limit.ok) {
    return err(limit.error);
  }

  const args =
    status.value === undefined
      ? { limit: limit.value }
      : { status: status.value, limit: limit.value };
  return ok({
    toolName: "opzava_crm_list_tickets",
    args,
    requestSummary: { toolName: "opzava_crm_list_tickets", args }
  });
}

function parseContactTimelineArgs(value: unknown): Result<ParsedToolArgs> {
  if (!isRecord(value)) {
    return err(
      toolError(
        "runtimeControl.toolMalformedArgs",
        "CRM contact timeline tool arguments must be an object."
      )
    );
  }

  const unknownKeys = rejectUnknownKeys(value, ["contactId", "limit", "offset"]);
  if (!unknownKeys.ok) {
    return err(unknownKeys.error);
  }

  const contactId = requiredContactId(value["contactId"]);
  const limit = optionalLimit(value["limit"]);
  const offset = optionalOffset(value["offset"]);
  if (!contactId.ok) {
    return err(contactId.error);
  }
  if (!limit.ok) {
    return err(limit.error);
  }
  if (!offset.ok) {
    return err(offset.error);
  }

  const args = {
    contactId: contactId.value,
    limit: limit.value,
    offset: offset.value
  };
  return ok({
    toolName: "opzava_crm_get_contact_timeline",
    args,
    requestSummary: { toolName: "opzava_crm_get_contact_timeline", args }
  });
}

function parseArgs(
  toolName: RuntimeControlCrmToolName,
  value: unknown
): Result<ParsedToolArgs> {
  if (toolName === "opzava_crm_list_accounts") {
    return parseLimitOnlyArgs(value, toolName);
  }

  if (toolName === "opzava_crm_list_contacts") {
    return parseLimitOnlyArgs(value, toolName);
  }

  if (toolName === "opzava_crm_list_deals") {
    return parseLimitOnlyArgs(value, toolName);
  }

  if (toolName === "opzava_crm_list_tickets") {
    return parseListTicketsArgs(value);
  }

  return parseContactTimelineArgs(value);
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 3) {
    return "[truncated]";
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitizeValue(entry, depth + 1));
  }

  if (!isRecord(value)) {
    return String(value);
  }

  return Object.keys(value)
    .sort()
    .slice(0, 20)
    .reduce<Record<string, unknown>>((accumulator, key) => {
      accumulator[key] = sanitizeValue(value[key], depth + 1);
      return accumulator;
    }, {});
}

function malformedRequestSummary(
  toolName: RuntimeControlCrmToolName,
  args: unknown,
  error: DomainError
): Readonly<Record<string, unknown>> {
  return {
    toolName,
    malformedArgs: sanitizeValue(args),
    errorCode: error.code
  };
}

function errorStatus(error: unknown, depth = 0): number | undefined {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return undefined;
  }

  const status = (error as { readonly status?: unknown }).status;
  return typeof status === "number"
    ? status
    : errorStatus((error as { readonly cause?: unknown }).cause, depth + 1);
}

function failureFromError(error: DomainError): ToolFailure {
  if (error.code === "crm.notFound") {
    return {
      code: "not_found",
      message: "CRM record was not found."
    };
  }

  if (error.code === "crm.forbidden" || errorStatus(error) === 403) {
    return {
      code: "forbidden",
      message: "CRM tool execution is not allowed."
    };
  }

  if (error.code === "crm.validation" || error.code.startsWith("crm.invalid")) {
    return {
      code: "malformed_args",
      message: error.message
    };
  }

  return {
    code: "failed",
    message: error.message
  };
}

function failureFromMalformedArgs(error: DomainError): ToolFailure {
  return {
    code: "malformed_args",
    message: error.message
  };
}

function crmContext(context: ToolExecutionContext) {
  return {
    orgId: context.orgId,
    workspaceId: context.workspaceId,
    actor: context.actor
  };
}

function crmDependencies(dependencies: RuntimeControlCrmToolDependencies) {
  const authorizationPort = dependencies.crmAuthorizationPort ?? dependencies.authorizationPort;
  return authorizationPort === undefined ? {} : { authorizationPort };
}

function humanize(value: string): string {
  return value
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function formatMoney(valueCents: number | null, currency: string): string | null {
  if (valueCents === null) {
    return null;
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency
    }).format(valueCents / 100);
  } catch {
    return `${currency} ${(valueCents / 100).toFixed(2)}`;
  }
}

function accountSummary(account: CrmAccountDto): RuntimeControlCrmAccountSummary {
  return {
    id: account.id,
    name: account.name,
    domain: account.domain,
    industry: account.industry,
    website: account.website,
    contactCount: account.contactCount,
    dealCount: account.dealCount,
    ticketCount: account.ticketCount,
    updatedAt: account.updatedAt
  };
}

function contactSummary(contact: CrmContactDto): RuntimeControlCrmContactSummary {
  return {
    id: contact.id,
    name: contact.displayName,
    email: contact.email,
    phone: contact.phone,
    title: contact.title,
    lifecycleStage: contact.lifecycleStage,
    lifecycleLabel: humanize(contact.lifecycleStage),
    accountName: contact.accountName,
    openDealCount: contact.openDealCount,
    openTicketCount: contact.openTicketCount,
    updatedAt: contact.updatedAt
  };
}

function dealSummary(deal: CrmDealDto): RuntimeControlCrmDealSummary {
  return {
    id: deal.id,
    title: deal.title,
    accountName: deal.accountName,
    primaryContactName: deal.primaryContactName,
    stageName: deal.stageName,
    status: deal.status,
    statusLabel: humanize(deal.status),
    value: formatMoney(deal.valueCents, deal.currency),
    valueCents: deal.valueCents,
    currency: deal.currency,
    expectedCloseDate: deal.expectedCloseDate,
    updatedAt: deal.updatedAt
  };
}

function dealStageSummary(column: CrmDealStageColumnDto): RuntimeControlCrmDealStageSummary {
  return {
    name: column.stage.name,
    count: column.deals.length
  };
}

function ticketSummary(ticket: CrmTicketDto): RuntimeControlCrmTicketSummary {
  return {
    id: ticket.id,
    subject: ticket.subject,
    contactName: ticket.contactName,
    accountName: ticket.accountName,
    status: ticket.status,
    statusLabel: humanize(ticket.status),
    priority: ticket.priority,
    priorityLabel: humanize(ticket.priority),
    queue: ticket.queue,
    updatedAt: ticket.updatedAt
  };
}

function activitySummary(activity: CrmActivityDto): RuntimeControlCrmActivitySummary {
  const body = activity.body.trim();
  return {
    id: activity.id,
    kind: activity.kind,
    kindLabel: humanize(activity.kind),
    summary: body.length === 0 ? humanize(activity.kind) : body,
    actor: activity.actorKind === "assistant" ? "Assistant" : "Human",
    occurredAt: activity.occurredAt
  };
}

function resultSummary(output: RuntimeControlCrmToolOutput): Readonly<Record<string, unknown>> {
  return { ok: true, ...output };
}

function failureSummary(failure: ToolFailure): Readonly<Record<string, unknown>> {
  return { ok: false, code: failure.code, message: failure.message };
}

function targetRef(output: RuntimeControlCrmToolOutput): string | null {
  return output.kind === "crm.contact_timeline.get" ? output.contactId : null;
}

function numberField(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function outputFromOutcome(outcome: AssistantToolOutcome): RuntimeControlCrmToolOutput | null {
  const kind = outcome.resultSummary["kind"];
  if (kind === "crm.accounts.list" && Array.isArray(outcome.resultSummary["accounts"])) {
    const accounts =
      outcome.resultSummary["accounts"] as readonly RuntimeControlCrmAccountSummary[];
    return {
      kind,
      totalCount: numberField(outcome.resultSummary["totalCount"]),
      returnedCount: numberField(outcome.resultSummary["returnedCount"]),
      accounts
    };
  }

  if (kind === "crm.contacts.list" && Array.isArray(outcome.resultSummary["contacts"])) {
    const contacts =
      outcome.resultSummary["contacts"] as readonly RuntimeControlCrmContactSummary[];
    return {
      kind,
      totalCount: numberField(outcome.resultSummary["totalCount"]),
      returnedCount: numberField(outcome.resultSummary["returnedCount"]),
      contacts
    };
  }

  if (
    kind === "crm.deals.list" &&
    Array.isArray(outcome.resultSummary["stages"]) &&
    Array.isArray(outcome.resultSummary["deals"])
  ) {
    const stages =
      outcome.resultSummary["stages"] as readonly RuntimeControlCrmDealStageSummary[];
    const deals = outcome.resultSummary["deals"] as readonly RuntimeControlCrmDealSummary[];
    return {
      kind,
      totalCount: numberField(outcome.resultSummary["totalCount"]),
      returnedCount: numberField(outcome.resultSummary["returnedCount"]),
      stages,
      deals
    };
  }

  if (kind === "crm.tickets.list" && Array.isArray(outcome.resultSummary["tickets"])) {
    const tickets =
      outcome.resultSummary["tickets"] as readonly RuntimeControlCrmTicketSummary[];
    return {
      kind,
      totalCount: numberField(outcome.resultSummary["totalCount"]),
      returnedCount: numberField(outcome.resultSummary["returnedCount"]),
      tickets
    };
  }

  const contactId = outcome.resultSummary["contactId"];
  if (
    kind === "crm.contact_timeline.get" &&
    typeof contactId === "string" &&
    Array.isArray(outcome.resultSummary["activities"])
  ) {
    const activities =
      outcome.resultSummary["activities"] as readonly RuntimeControlCrmActivitySummary[];
    return {
      kind,
      contactId,
      returnedCount: numberField(outcome.resultSummary["returnedCount"]),
      activities
    };
  }

  return null;
}

function failureFromOutcome(outcome: AssistantToolOutcome): ToolFailure {
  const code = outcome.resultSummary["code"];
  const message = outcome.resultSummary["message"];
  return {
    code: typeof code === "string" ? code : "failed",
    message: typeof message === "string" ? message : "CRM tool execution failed."
  };
}

function completedExecutionFromOutcome(
  toolName: RuntimeControlCrmToolName,
  toolCallId: string,
  receipt: StartedToolOutcomeReceipt
): Result<RuntimeControlCrmToolExecution> {
  if (receipt.outcome.status === "started") {
    return err(
      toolError(
        "runtimeControl.toolOutcomeInProgress",
        "Tool call is already in progress for this assistant turn."
      )
    );
  }

  if (receipt.outcome.status === "failed") {
    const failure = failureFromOutcome(receipt.outcome);
    return ok({
      status: "failed",
      toolName,
      toolCallId,
      code: failure.code,
      message: failure.message,
      outcome: receipt.outcome
    });
  }

  const output = outputFromOutcome(receipt.outcome);
  if (output === null) {
    return err(
      toolError(
        "runtimeControl.toolOutcomeInvalidReplay",
        "Recorded CRM tool outcome cannot be replayed."
      )
    );
  }

  return ok({
    status: "succeeded",
    toolName,
    toolCallId,
    output,
    outcome: receipt.outcome
  });
}

async function finishFailure(
  input: {
    readonly context: ToolExecutionContext;
    readonly toolName: RuntimeControlCrmToolName;
    readonly toolCallId: string;
    readonly requestSummary: Readonly<Record<string, unknown>>;
    readonly failure: ToolFailure;
  },
  dependencies: RuntimeControlCrmToolDependencies
): Promise<Result<RuntimeControlCrmToolExecution>> {
  const outcome = await recordToolOutcome(
    {
      ...crmContext(input.context),
      turnId: input.context.assistantTurnId,
      toolName: input.toolName,
      toolCallId: input.toolCallId,
      idempotencyKey: input.context.commandIdempotencyKey,
      status: "failed",
      requestSummary: input.requestSummary,
      resultSummary: failureSummary(input.failure)
    },
    dependencies
  );
  if (!outcome.ok) {
    return err(outcome.error);
  }

  return ok({
    status: "failed",
    toolName: input.toolName,
    toolCallId: input.toolCallId,
    code: input.failure.code,
    message: input.failure.message,
    outcome: outcome.value
  });
}

async function performTool(
  parsed: ParsedToolArgs,
  context: ToolExecutionContext,
  dependencies: RuntimeControlCrmToolDependencies
): Promise<Result<RuntimeControlCrmToolOutput>> {
  const services = dependencies.crmServices ?? crmServices;
  const appContext = crmContext(context);
  const deps = crmDependencies(dependencies);

  if (parsed.toolName === "opzava_crm_list_accounts") {
    const result = await services.listAccounts(appContext, deps);
    if (!result.ok) {
      return err(result.error);
    }

    const accounts = result.value.map(accountSummary).slice(0, parsed.args.limit);
    return ok({
      kind: "crm.accounts.list",
      totalCount: result.value.length,
      returnedCount: accounts.length,
      accounts
    });
  }

  if (parsed.toolName === "opzava_crm_list_contacts") {
    const result = await services.listContacts(appContext, deps);
    if (!result.ok) {
      return err(result.error);
    }

    const contacts = result.value.map(contactSummary).slice(0, parsed.args.limit);
    return ok({
      kind: "crm.contacts.list",
      totalCount: result.value.length,
      returnedCount: contacts.length,
      contacts
    });
  }

  if (parsed.toolName === "opzava_crm_list_deals") {
    const result = await services.listDeals(appContext, deps);
    if (!result.ok) {
      return err(result.error);
    }

    const deals = result.value.flatMap((column) => column.deals.map(dealSummary));
    const limitedDeals = deals.slice(0, parsed.args.limit);
    return ok({
      kind: "crm.deals.list",
      totalCount: deals.length,
      returnedCount: limitedDeals.length,
      stages: result.value.map(dealStageSummary),
      deals: limitedDeals
    });
  }

  if (parsed.toolName === "opzava_crm_list_tickets") {
    const result =
      parsed.args.status === undefined
        ? await services.listTickets(appContext, deps)
        : await services.listTickets({ ...appContext, status: parsed.args.status }, deps);
    if (!result.ok) {
      return err(result.error);
    }

    const tickets = result.value.map(ticketSummary).slice(0, parsed.args.limit);
    return ok({
      kind: "crm.tickets.list",
      totalCount: result.value.length,
      returnedCount: tickets.length,
      tickets
    });
  }

  const result = await services.listContactTimeline(
    {
      ...appContext,
      contactId: parsed.args.contactId,
      limit: parsed.args.limit,
      offset: parsed.args.offset
    },
    deps
  );
  if (!result.ok) {
    return err(result.error);
  }

  return ok({
    kind: "crm.contact_timeline.get",
    contactId: parsed.args.contactId,
    returnedCount: result.value.length,
    activities: result.value.map(activitySummary)
  });
}

export async function executeRuntimeControlCrmTool(
  input: ExecuteRuntimeControlCrmToolInput,
  dependencies: RuntimeControlCrmToolDependencies = {}
): Promise<Result<RuntimeControlCrmToolExecution>> {
  const toolName = parseToolName(input.toolName);
  if (!toolName.ok) {
    return err(toolName.error);
  }

  const toolCallId =
    typeof input.toolCallId === "string" && input.toolCallId.trim() !== ""
      ? input.toolCallId.trim()
      : null;
  if (toolCallId === null) {
    return err(
      toolError("runtimeControl.invalidToolCallId", "Tool call id is required.")
    );
  }

  const parsed = parseArgs(toolName.value, input.args);
  const requestSummary = parsed.ok
    ? parsed.value.requestSummary
    : malformedRequestSummary(toolName.value, input.args, parsed.error);

  const started = await recordStartedToolOutcome(
    {
      ...crmContext(input.context),
      turnId: input.context.assistantTurnId,
      toolName: toolName.value,
      toolCallId,
      idempotencyKey: input.context.commandIdempotencyKey,
      status: "started",
      requestSummary
    },
    dependencies
  );
  if (!started.ok) {
    return err(started.error);
  }

  if (!started.value.inserted) {
    return completedExecutionFromOutcome(toolName.value, toolCallId, started.value);
  }

  if (!parsed.ok) {
    return finishFailure(
      {
        context: input.context,
        toolName: toolName.value,
        toolCallId,
        requestSummary,
        failure: failureFromMalformedArgs(parsed.error)
      },
      dependencies
    );
  }

  const performed = await performTool(parsed.value, input.context, dependencies);
  if (!performed.ok) {
    return finishFailure(
      {
        context: input.context,
        toolName: toolName.value,
        toolCallId,
        requestSummary,
        failure: failureFromError(performed.error)
      },
      dependencies
    );
  }

  const output = performed.value;
  const outcome = await recordToolOutcome(
    {
      ...crmContext(input.context),
      turnId: input.context.assistantTurnId,
      toolName: toolName.value,
      toolCallId,
      idempotencyKey: input.context.commandIdempotencyKey,
      status: "succeeded",
      requestSummary,
      resultSummary: resultSummary(output),
      targetRef: targetRef(output)
    },
    dependencies
  );
  if (!outcome.ok) {
    return err(outcome.error);
  }

  return ok({
    status: "succeeded",
    toolName: toolName.value,
    toolCallId,
    output,
    outcome: outcome.value
  });
}
