"use server";

import { createAccount, updateAccount } from "@opzava/crm";
import { revalidatePath } from "next/cache";
import { forbidden, redirect } from "next/navigation";
import { z } from "zod";

import {
  crmContextInput,
  isCrmForbidden,
  normalizeCrmWebsiteForStorage,
  optionalStringFromForm,
  ownerUserIdFromForm,
  stringFromForm,
} from "@/lib/crm-pages";
import { formFailureState, formValidationState, type FormActionState } from "@/lib/action-state";
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

function accountActionErrorState(error: unknown, fallback: string): FormActionState {
  if (isCrmForbidden(error)) {
    forbidden();
  }

  return formFailureState(error instanceof Error ? error.message : fallback);
}

export async function createAccountAction(
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
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
    return formValidationState(parsed.error.issues);
  }

  const website = normalizeCrmWebsiteForStorage(parsed.data.website);
  if (!website.ok) {
    return formFailureState(website.message);
  }

  const result = await createAccount({
    ...crmContextInput(context),
    name: parsed.data.name,
    domain: parsed.data.domain,
    industry: parsed.data.industry,
    website: website.value,
    description: parsed.data.description,
    ownerUserId: ownerUserIdFromForm(parsed.data.owner, context),
    parentAccountId: parsed.data.parentAccountId,
    idempotencyKey: parsed.data.idempotencyKey,
  });

  if (!result.ok) {
    return accountActionErrorState(result.error, "Account could not be created.");
  }

  revalidatePath("/crm/accounts");
  redirect(`/crm/accounts/${result.value.id}`);
}

export async function updateAccountAction(
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
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
    return formValidationState(parsed.error.issues);
  }

  const website = normalizeCrmWebsiteForStorage(parsed.data.website);
  if (!website.ok) {
    return formFailureState(website.message);
  }

  const ownerUserId =
    parsed.data.owner === "keep" ? undefined : ownerUserIdFromForm(parsed.data.owner, context);
  const result = await updateAccount({
    ...crmContextInput(context),
    accountId: parsed.data.accountId,
    name: parsed.data.name,
    domain: parsed.data.domain,
    industry: parsed.data.industry,
    website: website.value,
    description: parsed.data.description,
    parentAccountId: parsed.data.parentAccountId,
    ...(ownerUserId === undefined ? {} : { ownerUserId }),
  });

  if (!result.ok) {
    return accountActionErrorState(result.error, "Account could not be updated.");
  }

  revalidatePath("/crm/accounts");
  revalidatePath(`/crm/accounts/${result.value.id}`);
  redirect(`/crm/accounts/${result.value.id}`);
}
