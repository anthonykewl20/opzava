"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  applyOrchestratorRolesForContext,
  disconnectGitHubForContext,
  loadConnectionsPageData,
  requireConnectionMutationRole,
  startGitHubDeviceFlowForContext,
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
  if (connectionActionErrorCode(error) === "provisioning.openclawAdmin.operatorAdminRequired") {
    redirectToConnectionsNotice({
      notice: "operator-admin-required",
      basePath,
      ...(providerId === undefined ? {} : { providerId }),
    });
  }

  if (connectionActionErrorCode(error) === "provisioning.githubOAuth.notConfigured") {
    redirectToConnectionsNotice({
      notice: "github-not-configured",
      basePath,
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
  const context = await requireConnectionsContext();
  const result = await loadConnectionsPageData(context);
  if (!result.ok) {
    redirectToConnectionsNotice({ notice: "health-check-error", basePath });
  }

  revalidatePath(basePath);
  redirectToConnectionsNotice({ notice: "health-check-complete", basePath });
}
