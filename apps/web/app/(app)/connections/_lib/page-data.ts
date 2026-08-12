import { redirect } from "next/navigation";

import { loadConnectionsPageDataForRequest, type ConnectionsPageData } from "@/lib/connections";
import { errorCode, errorStatusCode } from "@/lib/authed-action";
import { getAppSessionContext } from "@/lib/session";

export async function requireConnectionsPageData(): Promise<ConnectionsPageData> {
  const context = await getAppSessionContext();
  if (context === null) {
    redirect("/login");
  }

  const result = await loadConnectionsPageDataForRequest(context);
  if (!result.ok) {
    if (
      errorCode(result.error) === "projectManagement.forbidden" ||
      errorStatusCode(result.error) === 403
    ) {
      redirect("/");
    }

    throw result.error;
  }

  return result.value;
}

export function relativeTime(value: string | null): string {
  if (value === null) {
    return "not checked";
  }

  const diffMs = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diffMs)) {
    return "not available";
  }

  if (diffMs < 60_000) {
    return "now";
  }

  if (diffMs < 3_600_000) {
    return `${Math.floor(diffMs / 60_000)}m ago`;
  }

  return `${Math.floor(diffMs / 3_600_000)}h ago`;
}

export function githubStatusDotClass(
  status: ConnectionsPageData["snapshot"]["github"]["status"],
): string {
  if (status === "connected") {
    return "dot dot-success dot-beat";
  }

  if (status === "pending" || status === "needs_attention") {
    return "dot dot-warning";
  }

  return "dot";
}

export function modelProviderCountLabel(data: ConnectionsPageData): string {
  return `${data.providerSummary.connected} connected / ${data.providerSummary.available} available`;
}

export function gatewayOutageKind(
  gateway: ConnectionsPageData["snapshot"]["gateway"],
): "transient" | "persistent" {
  if (gateway.lastHeartbeatAt === null) {
    return "persistent";
  }

  const ageMs = Date.now() - new Date(gateway.lastHeartbeatAt).getTime();
  return Number.isNaN(ageMs) || ageMs < 10 * 60_000 ? "transient" : "persistent";
}

export function gatewayUnavailableCopy(
  gateway: ConnectionsPageData["snapshot"]["gateway"],
): string {
  return gatewayOutageKind(gateway) === "transient"
    ? "Gateway unavailable - retrying automatically. The backend reconnect loop is still running."
    : "Gateway unavailable - still retrying automatically. Check provisioning worker health if this persists.";
}
