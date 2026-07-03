"use server";

import {
  addNote,
  createContact,
  crmContactLifecycles,
  updateContact,
  type CrmContactLifecycle,
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

const contactLifecycleSchema = z.enum(crmContactLifecycles);
const contactActivityKindSchema = z.enum(["note", "call"]);

const createContactSchema = z.object({
  displayName: z.string().trim().min(1).max(240),
  email: z.string().trim().max(320).nullable(),
  phone: z.string().trim().max(80).nullable(),
  title: z.string().trim().max(240).nullable(),
  lifecycleStage: contactLifecycleSchema.default("lead"),
  accountId: z.string().trim().nullable(),
  owner: z.string().trim().nullable(),
  notes: z.string().max(4000).nullable(),
  idempotencyKey: z.string().trim().min(1).max(160),
});

const updateContactSchema = z.object({
  contactId: z.string().trim().min(1),
  displayName: z.string().trim().min(1).max(240),
  email: z.string().trim().max(320).nullable(),
  phone: z.string().trim().max(80).nullable(),
  title: z.string().trim().max(240).nullable(),
  lifecycleStage: contactLifecycleSchema,
  accountId: z.string().trim().nullable(),
  owner: z.string().trim().nullable(),
  notes: z.string().max(4000).nullable(),
});

const addContactActivitySchema = z.object({
  contactId: z.string().trim().min(1),
  kind: contactActivityKindSchema,
  body: z.string().trim().min(1).max(4000),
});

async function requireCrmContext(): Promise<AppSessionContext> {
  const context = await getAppSessionContext();
  if (context === null) {
    redirect("/login");
  }

  return context;
}

function throwContactActionError(error: unknown): never {
  if (isCrmForbidden(error)) {
    forbidden();
  }

  throw error instanceof Error ? error : new Error("CRM contact action failed.");
}

export async function createContactAction(formData: FormData): Promise<void> {
  const context = await requireCrmContext();
  const parsed = createContactSchema.safeParse({
    displayName: stringFromForm(formData, "displayName"),
    email: optionalStringFromForm(formData, "email"),
    phone: optionalStringFromForm(formData, "phone"),
    title: optionalStringFromForm(formData, "title"),
    lifecycleStage: stringFromForm(formData, "lifecycleStage"),
    accountId: optionalStringFromForm(formData, "accountId"),
    owner: optionalStringFromForm(formData, "owner"),
    notes: optionalStringFromForm(formData, "notes"),
    idempotencyKey: stringFromForm(formData, "idempotencyKey"),
  });

  if (!parsed.success) {
    throw new Error("Contact form is invalid.");
  }

  const result = await createContact({
    ...crmContextInput(context),
    displayName: parsed.data.displayName,
    email: parsed.data.email,
    phone: parsed.data.phone,
    title: parsed.data.title,
    lifecycleStage: parsed.data.lifecycleStage as CrmContactLifecycle,
    accountId: parsed.data.accountId,
    ownerUserId: ownerUserIdFromForm(parsed.data.owner, context),
    notes: parsed.data.notes,
    idempotencyKey: parsed.data.idempotencyKey,
  });

  if (!result.ok) {
    throwContactActionError(result.error);
  }

  revalidatePath("/crm/contacts");
  redirect(`/crm/contacts/${result.value.id}`);
}

export async function updateContactAction(formData: FormData): Promise<void> {
  const context = await requireCrmContext();
  const parsed = updateContactSchema.safeParse({
    contactId: stringFromForm(formData, "contactId"),
    displayName: stringFromForm(formData, "displayName"),
    email: optionalStringFromForm(formData, "email"),
    phone: optionalStringFromForm(formData, "phone"),
    title: optionalStringFromForm(formData, "title"),
    lifecycleStage: stringFromForm(formData, "lifecycleStage"),
    accountId: optionalStringFromForm(formData, "accountId"),
    owner: optionalStringFromForm(formData, "owner"),
    notes: optionalStringFromForm(formData, "notes"),
  });

  if (!parsed.success) {
    throw new Error("Contact form is invalid.");
  }

  const ownerUserId =
    parsed.data.owner === "keep" ? undefined : ownerUserIdFromForm(parsed.data.owner, context);
  const result = await updateContact({
    ...crmContextInput(context),
    contactId: parsed.data.contactId,
    displayName: parsed.data.displayName,
    email: parsed.data.email,
    phone: parsed.data.phone,
    title: parsed.data.title,
    lifecycleStage: parsed.data.lifecycleStage as CrmContactLifecycle,
    accountId: parsed.data.accountId,
    notes: parsed.data.notes,
    ...(ownerUserId === undefined ? {} : { ownerUserId }),
  });

  if (!result.ok) {
    throwContactActionError(result.error);
  }

  revalidatePath("/crm/contacts");
  revalidatePath(`/crm/contacts/${result.value.id}`);
  redirect(`/crm/contacts/${result.value.id}`);
}

export async function addContactActivityAction(formData: FormData): Promise<void> {
  const context = await requireCrmContext();
  const parsed = addContactActivitySchema.safeParse({
    contactId: stringFromForm(formData, "contactId"),
    kind: stringFromForm(formData, "kind"),
    body: stringFromForm(formData, "body"),
  });

  if (!parsed.success) {
    throw new Error("Contact activity form is invalid.");
  }

  const result = await addNote({
    ...crmContextInput(context),
    contactId: parsed.data.contactId,
    kind: parsed.data.kind,
    body: parsed.data.body,
  });

  if (!result.ok) {
    throwContactActionError(result.error);
  }

  revalidatePath(`/crm/contacts/${parsed.data.contactId}`);
  redirect(`/crm/contacts/${parsed.data.contactId}`);
}
