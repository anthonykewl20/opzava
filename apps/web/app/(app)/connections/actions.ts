"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  applyOrchestratorRolesForContext,
  disconnectGitHubForContext,
  refreshConnectionsPageData,
  requireConnectionMutationRole,
  startGitHubDeviceFlowForContext,
} from "@/lib/connections";
import { errorCode, requireContext } from "@/lib/authed-action";

function throwConnectionActionError(error: unknown): never {
  throw error instanceof Error ? error : new Error("Connection provisioning action failed.");
}

function redirectToConnectionsNotice(input: {
  readonly notice: string;
  readonly basePath?: string;
  readonly providerId?: string;
}): never {
  const params = new URLSearchParams({ notice: input.notice });
  if (input.providerId !== undefined && input.providerId !== "") {
    params.set("provider", input.providerId);
  }

  redirect(`${input.basePath ?? "/connections"}?${params.toString()}`);
}

function handleConnectionMutationError(
  error: unknown,
  providerId?: string,
  basePath = "/connections",
): never {
  if (errorCode(error) === "provisioning.openclawAdmin.operatorAdminRequired") {
    redirectToConnectionsNotice({
      notice: "operator-admin-required",
      basePath,
      ...(providerId === undefined ? {} : { providerId }),
    });
  }

  if (errorCode(error) === "provisioning.githubOAuth.notConfigured") {
    redirectToConnectionsNotice({
      notice: "github-not-configured",
      basePath,
      ...(providerId === undefined ? {} : { providerId }),
    });
  }

  throwConnectionActionError(error);
}

async function requireConnectionsMutationContext() {
  const context = await requireContext();
  const allowed = requireConnectionMutationRole(context);
  if (!allowed.ok) {
    throwConnectionActionError(allowed.error);
  }

  return context;
}

export async function applyOrchestratorRolesAction(): Promise<void> {
  const context = await requireConnectionsMutationContext();
  const result = await applyOrchestratorRolesForContext(context);
  if (!result.ok) {
    handleConnectionMutationError(result.error);
  }

  revalidatePath("/connections");
}

export async function startGitHubDeviceFlowAction(basePath = "/connections"): Promise<void> {
  const context = await requireConnectionsMutationContext();
  const result = await startGitHubDeviceFlowForContext(context);
  if (!result.ok) {
    handleConnectionMutationError(result.error, undefined, basePath);
  }

  revalidatePath(basePath);
}

export async function disconnectGitHubAction(basePath = "/connections/github"): Promise<void> {
  const context = await requireConnectionsMutationContext();
  const result = await disconnectGitHubForContext(context);
  if (!result.ok) {
    handleConnectionMutationError(result.error, undefined, basePath);
  }

  revalidatePath(basePath);
  revalidatePath("/connections/add");
  redirect("/connections/add");
}

export async function refreshConnectionsAction(basePath = "/connections"): Promise<void> {
  const context = await requireContext();
  const result = await refreshConnectionsPageData(context);
  if (!result.ok) {
    redirectToConnectionsNotice({ notice: "health-check-error", basePath });
  }

  revalidatePath(basePath);
  redirectToConnectionsNotice({ notice: "health-check-complete", basePath });
}
