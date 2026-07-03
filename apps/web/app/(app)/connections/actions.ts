"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  applyOrchestratorRolesForContext,
  connectModelProviderApiKeyForContext,
  disconnectGitHubForContext,
  disconnectModelProviderForContext,
  loadConnectionsPageData,
  requireConnectionMutationRole,
  startGitHubDeviceFlowForContext,
  startModelProviderDeviceFlowForContext,
} from "@/lib/connections";
import { getAppSessionContext } from "@/lib/session";

async function requireConnectionsContext() {
  const context = await getAppSessionContext();
  if (context === null) {
    redirect("/login");
  }

  return context;
}

function throwConnectionActionError(error: unknown): never {
  throw error instanceof Error ? error : new Error("Connection provisioning action failed.");
}

async function requireConnectionsMutationContext() {
  const context = await requireConnectionsContext();
  const allowed = requireConnectionMutationRole(context);
  if (!allowed.ok) {
    throwConnectionActionError(allowed.error);
  }

  return context;
}

function stringFromForm(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function connectModelProviderApiKeyAction(formData: FormData): Promise<void> {
  const context = await requireConnectionsMutationContext();
  const result = await connectModelProviderApiKeyForContext({
    context,
    providerId: stringFromForm(formData, "providerId"),
    authChoiceId: stringFromForm(formData, "authChoiceId"),
    apiKey: stringFromForm(formData, "apiKey"),
  });
  if (!result.ok) {
    throwConnectionActionError(result.error);
  }

  revalidatePath("/connections");
}

export async function startModelProviderDeviceFlowAction(formData: FormData): Promise<void> {
  const context = await requireConnectionsMutationContext();
  const result = await startModelProviderDeviceFlowForContext({
    context,
    providerId: stringFromForm(formData, "providerId"),
    authChoiceId: stringFromForm(formData, "authChoiceId"),
  });
  if (!result.ok) {
    throwConnectionActionError(result.error);
  }

  revalidatePath("/connections");
}

export async function disconnectModelProviderAction(formData: FormData): Promise<void> {
  const context = await requireConnectionsMutationContext();
  const result = await disconnectModelProviderForContext({
    context,
    providerId: stringFromForm(formData, "providerId"),
  });
  if (!result.ok) {
    throwConnectionActionError(result.error);
  }

  revalidatePath("/connections");
}

export async function applyOrchestratorRolesAction(): Promise<void> {
  const context = await requireConnectionsMutationContext();
  const result = await applyOrchestratorRolesForContext(context);
  if (!result.ok) {
    throwConnectionActionError(result.error);
  }

  revalidatePath("/connections");
}

export async function startGitHubDeviceFlowAction(): Promise<void> {
  const context = await requireConnectionsMutationContext();
  const result = await startGitHubDeviceFlowForContext(context);
  if (!result.ok) {
    throwConnectionActionError(result.error);
  }

  revalidatePath("/connections");
}

export async function disconnectGitHubAction(): Promise<void> {
  const context = await requireConnectionsMutationContext();
  const result = await disconnectGitHubForContext(context);
  if (!result.ok) {
    throwConnectionActionError(result.error);
  }

  revalidatePath("/connections");
}

export async function refreshConnectionsAction(): Promise<void> {
  const context = await requireConnectionsContext();
  const result = await loadConnectionsPageData(context);
  if (!result.ok) {
    throwConnectionActionError(result.error);
  }

  revalidatePath("/connections");
}
