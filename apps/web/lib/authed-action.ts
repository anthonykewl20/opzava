import { forbidden, redirect } from "next/navigation";

import { getAppSessionContext, type AppSessionContext } from "@/lib/session";

/**
 * Require the verified application session used by server actions.
 *
 * A missing session redirects before action rendering. Session resolution failures
 * deliberately remain thrown; this helper does not add a raw-cookie fallback.
 */
export async function requireContext(): Promise<AppSessionContext> {
  const context = await getAppSessionContext();

  if (context === null) {
    redirect("/login");
  }

  return context;
}

export function errorStatusCode(error: unknown, depth = 0): number | undefined {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return undefined;
  }

  const status = (error as { readonly status?: unknown }).status;
  return typeof status === "number"
    ? status
    : errorStatusCode((error as { readonly cause?: unknown }).cause, depth + 1);
}

export function errorCode(error: unknown, depth = 0): string | undefined {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return undefined;
  }

  const code = (error as { readonly code?: unknown }).code;
  return typeof code === "string"
    ? code
    : errorCode((error as { readonly cause?: unknown }).cause, depth + 1);
}

export function forbiddenFromError(error: unknown): void {
  if (errorCode(error) === "projectManagement.forbidden" || errorStatusCode(error) === 403) {
    forbidden();
  }
}
