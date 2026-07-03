"use server";

import { createAccount, updateAccount } from "@opzava/crm";
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

const createAccountSchema = z.object({
  name: z.string().trim().min(1).max(240),
  domain: z.string().trim().max(240).nullable(),
  industry: z.string().trim().max(240).nullable(),
  website: z.string().trim().max(500).nullable(),
  description: z.string().max(4000).nullable(),
  owner: z.string().trim().nullable(),
  parentAccountId: z.string().trim().nullable(),
  idempotencyKey: z.string().trim().min(1).max(160),
});

const updateAccountSchema = z.object({
  accountId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(240),
  domain: z.string().trim().max(240).nullable(),
  industry: z.string().trim().max(240).nullable(),
  website: z.string().trim().max(500).nullable(),
  description: z.string().max(4000).nullable(),
  owner: z.string().trim().nullable(),
  parentAccountId: z.string().trim().nullable(),
});

async function requireCrmContext(): Promise<AppSessionContext> {
  const context = await getAppSessionContext();
  if (context === null) {
    redirect("/login");
  }

  return context;
}

function throwAccountActionError(error: unknown): never {
  if (isCrmForbidden(error)) {
    forbidden();
  }

  throw error instanceof Error ? error : new Error("CRM account action failed.");
}

export async function createAccountAction(formData: FormData): Promise<void> {
  const context = await requireCrmContext();
  const parsed = createAccountSchema.safeParse({
    name: stringFromForm(formData, "name"),
    domain: optionalStringFromForm(formData, "domain"),
    industry: optionalStringFromForm(formData, "industry"),
    website: optionalStringFromForm(formData, "website"),
    description: optionalStringFromForm(formData, "description"),
    owner: optionalStringFromForm(formData, "owner"),
    parentAccountId: optionalStringFromForm(formData, "parentAccountId"),
    idempotencyKey: stringFromForm(formData, "idempotencyKey"),
  });

  if (!parsed.success) {
    throw new Error("Account form is invalid.");
  }

  const result = await createAccount({
    ...crmContextInput(context),
    name: parsed.data.name,
    domain: parsed.data.domain,
    industry: parsed.data.industry,
    website: parsed.data.website,
    description: parsed.data.description,
    ownerUserId: ownerUserIdFromForm(parsed.data.owner, context),
    parentAccountId: parsed.data.parentAccountId,
    idempotencyKey: parsed.data.idempotencyKey,
  });

  if (!result.ok) {
    throwAccountActionError(result.error);
  }

  revalidatePath("/crm/accounts");
  redirect(`/crm/accounts/${result.value.id}`);
}

export async function updateAccountAction(formData: FormData): Promise<void> {
  const context = await requireCrmContext();
  const parsed = updateAccountSchema.safeParse({
    accountId: stringFromForm(formData, "accountId"),
    name: stringFromForm(formData, "name"),
    domain: optionalStringFromForm(formData, "domain"),
    industry: optionalStringFromForm(formData, "industry"),
    website: optionalStringFromForm(formData, "website"),
    description: optionalStringFromForm(formData, "description"),
    owner: optionalStringFromForm(formData, "owner"),
    parentAccountId: optionalStringFromForm(formData, "parentAccountId"),
  });

  if (!parsed.success) {
    throw new Error("Account form is invalid.");
  }

  const ownerUserId =
    parsed.data.owner === "keep" ? undefined : ownerUserIdFromForm(parsed.data.owner, context);
  const result = await updateAccount({
    ...crmContextInput(context),
    accountId: parsed.data.accountId,
    name: parsed.data.name,
    domain: parsed.data.domain,
    industry: parsed.data.industry,
    website: parsed.data.website,
    description: parsed.data.description,
    parentAccountId: parsed.data.parentAccountId,
    ...(ownerUserId === undefined ? {} : { ownerUserId }),
  });

  if (!result.ok) {
    throwAccountActionError(result.error);
  }

  revalidatePath("/crm/accounts");
  revalidatePath(`/crm/accounts/${result.value.id}`);
  redirect(`/crm/accounts/${result.value.id}`);
}
