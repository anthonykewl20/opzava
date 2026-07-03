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

function throwDealActionError(error: unknown): never {
  if (isCrmForbidden(error)) {
    forbidden();
  }

  throw error instanceof Error ? error : new Error("CRM deal action failed.");
}

function valueCentsFromForm(value: string | null): number | null {
  if (value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("Deal value is invalid.");
  }

  return Math.round(parsed * 100);
}

function redirectToDeals(): never {
  revalidatePath("/crm/deals");
  redirect("/crm/deals");
}

export async function createDealAction(formData: FormData): Promise<void> {
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
    throw new Error("Deal form is invalid.");
  }

  const result = await createDeal({
    ...crmContextInput(context),
    title: parsed.data.title,
    accountId: parsed.data.accountId,
    primaryContactId: parsed.data.primaryContactId,
    valueCents: valueCentsFromForm(parsed.data.value),
    ...(typeof parsed.data.currency === "string" && parsed.data.currency.length > 0
      ? { currency: parsed.data.currency }
      : {}),
    ownerUserId: ownerUserIdFromForm(parsed.data.owner, context),
    expectedCloseDate: parsed.data.expectedCloseDate,
    idempotencyKey: parsed.data.idempotencyKey,
  });

  if (!result.ok) {
    throwDealActionError(result.error);
  }

  redirectToDeals();
}

export async function moveDealStageAction(formData: FormData): Promise<void> {
  const context = await requireCrmContext();
  const parsed = moveDealStageSchema.safeParse({
    dealId: stringFromForm(formData, "dealId"),
    stageId: stringFromForm(formData, "stageId"),
  });

  if (!parsed.success) {
    throw new Error("Deal move is invalid.");
  }

  const result = await moveDealStage({
    ...crmContextInput(context),
    dealId: parsed.data.dealId,
    stageId: parsed.data.stageId,
  });

  if (!result.ok) {
    throwDealActionError(result.error);
  }

  redirectToDeals();
}

export async function closeDealAction(formData: FormData): Promise<void> {
  const context = await requireCrmContext();
  const parsed = closeDealSchema.safeParse({
    dealId: stringFromForm(formData, "dealId"),
    outcome: stringFromForm(formData, "outcome"),
    closeReason: optionalStringFromForm(formData, "closeReason"),
  });

  if (!parsed.success) {
    throw new Error("Deal close form is invalid.");
  }

  const result = await closeDeal({
    ...crmContextInput(context),
    dealId: parsed.data.dealId,
    outcome: parsed.data.outcome as Exclude<CrmDealStatus, "open">,
    closeReason: parsed.data.closeReason,
  });

  if (!result.ok) {
    throwDealActionError(result.error);
  }

  redirectToDeals();
}

export async function reopenDealAction(formData: FormData): Promise<void> {
  const context = await requireCrmContext();
  const parsed = reopenDealSchema.safeParse({
    dealId: stringFromForm(formData, "dealId"),
  });

  if (!parsed.success) {
    throw new Error("Deal reopen form is invalid.");
  }

  const result = await reopenDeal({
    ...crmContextInput(context),
    dealId: parsed.data.dealId,
  });

  if (!result.ok) {
    throwDealActionError(result.error);
  }

  redirectToDeals();
}
