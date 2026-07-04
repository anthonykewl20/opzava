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

function connectionActionErrorCode(error: unknown, depth = 0): string | undefined {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return undefined;
  }

  const code = (error as { readonly code?: unknown }).code;
  return typeof code === "string"
    ? code
    : connectionActionErrorCode((error as { readonly cause?: unknown }).cause, depth + 1);
}

function redirectToConnectionsNotice(input: {
  readonly notice: string;
  readonly providerId?: string;
}): never {
  const params = new URLSearchParams({ notice: input.notice });
  if (input.providerId !== undefined && input.providerId !== "") {
    params.set("provider", input.providerId);
  }

  redirect(`/connections?${params.toString()}`);
}

function handleConnectionMutationError(error: unknown, providerId?: string): never {
  if (connectionActionErrorCode(error) === "provisioning.openclawAdmin.operatorAdminRequired") {
    redirectToConnectionsNotice({
      notice: "operator-admin-required",
      ...(providerId === undefined ? {} : { providerId }),
    });
  }

  throwConnectionActionError(error);
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
  const providerId = stringFromForm(formData, "providerId");
  const result = await connectModelProviderApiKeyForContext({
    context,
    providerId,
    authChoiceId: stringFromForm(formData, "authChoiceId"),
    apiKey: stringFromForm(formData, "apiKey"),
  });
  if (!result.ok) {
    handleConnectionMutationError(result.error, providerId);
  }

  revalidatePath("/connections");
}

export async function startModelProviderDeviceFlowAction(formData: FormData): Promise<void> {
  const context = await requireConnectionsMutationContext();
  const providerId = stringFromForm(formData, "providerId");
  const result = await startModelProviderDeviceFlowForContext({
    context,
    providerId,
    authChoiceId: stringFromForm(formData, "authChoiceId"),
  });
  if (!result.ok) {
    handleConnectionMutationError(result.error, providerId);
  }

  revalidatePath("/connections");
}

export async function disconnectModelProviderAction(formData: FormData): Promise<void> {
  const context = await requireConnectionsMutationContext();
  const providerId = stringFromForm(formData, "providerId");
  const result = await disconnectModelProviderForContext({
    context,
    providerId,
  });
  if (!result.ok) {
    handleConnectionMutationError(result.error, providerId);
  }

  revalidatePath("/connections");
}

export async function applyOrchestratorRolesAction(): Promise<void> {
  const context = await requireConnectionsMutationContext();
  const result = await applyOrchestratorRolesForContext(context);
  if (!result.ok) {
    handleConnectionMutationError(result.error);
  }

  revalidatePath("/connections");
}

export async function startGitHubDeviceFlowAction(): Promise<void> {
  const context = await requireConnectionsMutationContext();
  const result = await startGitHubDeviceFlowForContext(context);
  if (!result.ok) {
    handleConnectionMutationError(result.error);
  }

  revalidatePath("/connections");
}

export async function disconnectGitHubAction(): Promise<void> {
  const context = await requireConnectionsMutationContext();
  const result = await disconnectGitHubForContext(context);
  if (!result.ok) {
    handleConnectionMutationError(result.error);
  }

  revalidatePath("/connections");
}

export async function refreshConnectionsAction(): Promise<void> {
  const context = await requireConnectionsContext();
  const result = await loadConnectionsPageData(context);
  if (!result.ok) {
    redirectToConnectionsNotice({ notice: "health-check-error" });
  }

  revalidatePath("/connections");
  redirectToConnectionsNotice({ notice: "health-check-complete" });
}
