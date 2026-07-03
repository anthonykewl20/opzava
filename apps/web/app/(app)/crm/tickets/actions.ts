"use server";

import {
  createTicket,
  crmTicketPriorities,
  crmTicketStatuses,
  updateTicket,
  updateTicketStatus,
  type CrmTicketPriority,
  type CrmTicketStatus,
} from "@opzava/crm";
import { revalidatePath } from "next/cache";
import { forbidden, redirect } from "next/navigation";
import { z } from "zod";

import {
  crmContextInput,
  isCrmForbidden,
  optionalStringFromForm,
  ownerUserIdFromForm,
  stringFromForm,
} from "@/lib/crm-pages";
import { getAppSessionContext, type AppSessionContext } from "@/lib/session";

const ticketStatusSchema = z.enum(crmTicketStatuses);
const ticketPrioritySchema = z.enum(crmTicketPriorities);
const ticketFilterSchema = z.union([z.literal("all"), ticketStatusSchema]).default("all");

const createTicketSchema = z.object({
  subject: z.string().trim().min(1).max(240),
  body: z.string().max(8000).nullable(),
  contactId: z.string().trim().min(1),
  accountId: z.string().trim().nullable(),
  priority: ticketPrioritySchema.default("normal"),
  queue: z.string().trim().min(1).max(120).default("support"),
  assignee: z.string().trim().nullable(),
  idempotencyKey: z.string().trim().min(1).max(160),
});

const updateTicketStatusSchema = z.object({
  ticketId: z.string().trim().min(1),
  status: ticketStatusSchema,
  filter: ticketFilterSchema,
});

const updateTicketSchema = z.object({
  ticketId: z.string().trim().min(1),
  subject: z.string().trim().min(1).max(240),
  body: z.string().max(8000).nullable(),
  priority: ticketPrioritySchema,
  queue: z.string().trim().min(1).max(120),
  assignee: z.string().trim().nullable(),
});

async function requireCrmContext(): Promise<AppSessionContext> {
  const context = await getAppSessionContext();
  if (context === null) {
    redirect("/login");
  }

  return context;
}

function throwTicketActionError(error: unknown): never {
  if (isCrmForbidden(error)) {
    forbidden();
  }

  throw error instanceof Error ? error : new Error("CRM ticket action failed.");
}

function ticketListPath(filter: string): string {
  return filter === "all" ? "/crm/tickets" : `/crm/tickets?status=${filter}`;
}

export async function createTicketAction(formData: FormData): Promise<void> {
  const context = await requireCrmContext();
  const parsed = createTicketSchema.safeParse({
    subject: stringFromForm(formData, "subject"),
    body: optionalStringFromForm(formData, "body"),
    contactId: stringFromForm(formData, "contactId"),
    accountId: optionalStringFromForm(formData, "accountId"),
    priority: stringFromForm(formData, "priority"),
    queue: stringFromForm(formData, "queue") || "support",
    assignee: optionalStringFromForm(formData, "assignee"),
    idempotencyKey: stringFromForm(formData, "idempotencyKey"),
  });

  if (!parsed.success) {
    throw new Error("Ticket form is invalid.");
  }

  const result = await createTicket({
    ...crmContextInput(context),
    subject: parsed.data.subject,
    body: parsed.data.body,
    contactId: parsed.data.contactId,
    accountId: parsed.data.accountId,
    priority: parsed.data.priority as CrmTicketPriority,
    queue: parsed.data.queue,
    assigneeUserId: ownerUserIdFromForm(parsed.data.assignee, context),
    idempotencyKey: parsed.data.idempotencyKey,
  });

  if (!result.ok) {
    throwTicketActionError(result.error);
  }

  revalidatePath("/crm/tickets");
  redirect(`/crm/tickets/${result.value.id}`);
}

export async function updateTicketStatusAction(formData: FormData): Promise<void> {
  const context = await requireCrmContext();
  const parsed = updateTicketStatusSchema.safeParse({
    ticketId: stringFromForm(formData, "ticketId"),
    status: stringFromForm(formData, "status"),
    filter: stringFromForm(formData, "filter") || "all",
  });

  if (!parsed.success) {
    throw new Error("Ticket status form is invalid.");
  }

  const result = await updateTicketStatus({
    ...crmContextInput(context),
    ticketId: parsed.data.ticketId,
    status: parsed.data.status as CrmTicketStatus,
  });

  if (!result.ok) {
    throwTicketActionError(result.error);
  }

  revalidatePath("/crm/tickets");
  revalidatePath(`/crm/tickets/${result.value.id}`);
  redirect(ticketListPath(parsed.data.filter));
}

export async function updateTicketAction(formData: FormData): Promise<void> {
  const context = await requireCrmContext();
  const parsed = updateTicketSchema.safeParse({
    ticketId: stringFromForm(formData, "ticketId"),
    subject: stringFromForm(formData, "subject"),
    body: optionalStringFromForm(formData, "body"),
    priority: stringFromForm(formData, "priority"),
    queue: stringFromForm(formData, "queue"),
    assignee: optionalStringFromForm(formData, "assignee"),
  });

  if (!parsed.success) {
    throw new Error("Ticket form is invalid.");
  }

  const assigneeUserId =
    parsed.data.assignee === "keep"
      ? undefined
      : ownerUserIdFromForm(parsed.data.assignee, context);
  const result = await updateTicket({
    ...crmContextInput(context),
    ticketId: parsed.data.ticketId,
    subject: parsed.data.subject,
    body: parsed.data.body,
    priority: parsed.data.priority as CrmTicketPriority,
    queue: parsed.data.queue,
    ...(assigneeUserId === undefined ? {} : { assigneeUserId }),
  });

  if (!result.ok) {
    throwTicketActionError(result.error);
  }

  revalidatePath("/crm/tickets");
  revalidatePath(`/crm/tickets/${result.value.id}`);
  redirect(`/crm/tickets/${result.value.id}`);
}
