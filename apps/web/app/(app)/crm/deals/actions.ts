"use server";

import { closeDeal, createDeal, moveDealStage, reopenDeal, type CrmDealStatus } from "@opzava/crm";
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
import { formFailureState, formValidationState, type FormActionState } from "@/lib/action-state";
import { getAppSessionContext, type AppSessionContext } from "@/lib/session";

const dealOutcomeSchema = z.enum(["won", "lost"]);

const createDealSchema = z.object({
  title: z.string().trim().min(1).max(240),
  accountId: z.string().trim().min(1),
  primaryContactId: z.string().trim().nullable(),
  value: z.string().trim().nullable(),
  currency: z.string().trim().max(3).nullable(),
  expectedCloseDate: z.string().trim().nullable(),
  owner: z.string().trim().nullable(),
  idempotencyKey: z.string().trim().min(1).max(160),
});

const moveDealStageSchema = z.object({
  dealId: z.string().trim().min(1),
  stageId: z.string().trim().min(1),
});

const closeDealSchema = z.object({
  dealId: z.string().trim().min(1),
  outcome: dealOutcomeSchema,
  closeReason: z.string().max(1000).nullable(),
});

const reopenDealSchema = z.object({
  dealId: z.string().trim().min(1),
});

async function requireCrmContext(): Promise<AppSessionContext> {
  const context = await getAppSessionContext();
  if (context === null) {
    redirect("/login");
  }

  return context;
}

function dealActionErrorState(error: unknown, fallback: string): FormActionState {
  if (isCrmForbidden(error)) {
    forbidden();
  }

  return formFailureState(error instanceof Error ? error.message : fallback);
}

function valueCentsFromForm(
  value: string | null,
):
  | { readonly ok: true; readonly value: number | null }
  | { readonly ok: false; readonly message: string } {
  if (value === null || value === "") {
    return { ok: true, value: null };
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return { ok: false, message: "Deal value must be a valid number." };
  }

  return { ok: true, value: Math.round(parsed * 100) };
}

function redirectToDeals(): never {
  revalidatePath("/crm/deals");
  redirect("/crm/deals");
}

export async function createDealAction(
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requireCrmContext();
  const parsed = createDealSchema.safeParse({
    title: stringFromForm(formData, "title"),
    accountId: stringFromForm(formData, "accountId"),
    primaryContactId: optionalStringFromForm(formData, "primaryContactId"),
    value: optionalStringFromForm(formData, "value"),
    currency: optionalStringFromForm(formData, "currency"),
    expectedCloseDate: optionalStringFromForm(formData, "expectedCloseDate"),
    owner: optionalStringFromForm(formData, "owner"),
    idempotencyKey: stringFromForm(formData, "idempotencyKey"),
  });

  if (!parsed.success) {
    return formValidationState(parsed.error.issues);
  }

  const valueCents = valueCentsFromForm(parsed.data.value);
  if (!valueCents.ok) {
    return formFailureState(valueCents.message);
  }

  const result = await createDeal({
    ...crmContextInput(context),
    title: parsed.data.title,
    accountId: parsed.data.accountId,
    primaryContactId: parsed.data.primaryContactId,
    valueCents: valueCents.value,
    ...(typeof parsed.data.currency === "string" && parsed.data.currency.length > 0
      ? { currency: parsed.data.currency }
      : {}),
    ownerUserId: ownerUserIdFromForm(parsed.data.owner, context),
    expectedCloseDate: parsed.data.expectedCloseDate,
    idempotencyKey: parsed.data.idempotencyKey,
  });

  if (!result.ok) {
    return dealActionErrorState(result.error, "Deal could not be created.");
  }

  redirectToDeals();
}

export async function moveDealStageAction(
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requireCrmContext();
  const parsed = moveDealStageSchema.safeParse({
    dealId: stringFromForm(formData, "dealId"),
    stageId: stringFromForm(formData, "stageId"),
  });

  if (!parsed.success) {
    return formValidationState(parsed.error.issues);
  }

  const result = await moveDealStage({
    ...crmContextInput(context),
    dealId: parsed.data.dealId,
    stageId: parsed.data.stageId,
  });

  if (!result.ok) {
    return dealActionErrorState(result.error, "Deal could not be moved.");
  }

  redirectToDeals();
}

export async function closeDealAction(
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requireCrmContext();
  const parsed = closeDealSchema.safeParse({
    dealId: stringFromForm(formData, "dealId"),
    outcome: stringFromForm(formData, "outcome"),
    closeReason: optionalStringFromForm(formData, "closeReason"),
  });

  if (!parsed.success) {
    return formValidationState(parsed.error.issues);
  }

  const result = await closeDeal({
    ...crmContextInput(context),
    dealId: parsed.data.dealId,
    outcome: parsed.data.outcome as Exclude<CrmDealStatus, "open">,
    closeReason: parsed.data.closeReason,
  });

  if (!result.ok) {
    return dealActionErrorState(result.error, "Deal could not be closed.");
  }

  redirectToDeals();
}

export async function reopenDealAction(
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requireCrmContext();
  const parsed = reopenDealSchema.safeParse({
    dealId: stringFromForm(formData, "dealId"),
  });

  if (!parsed.success) {
    return formValidationState(parsed.error.issues);
  }

  const result = await reopenDeal({
    ...crmContextInput(context),
    dealId: parsed.data.dealId,
  });

  if (!result.ok) {
    return dealActionErrorState(result.error, "Deal could not be reopened.");
  }

  redirectToDeals();
}
