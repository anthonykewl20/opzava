import { redirect } from "next/navigation";

import { GatewayPage } from "@/components/gateway/gateway-page";
import { loadConnectionsPageDataForRequest } from "@/lib/connections";
import { buildGatewayPageViewModel } from "@/lib/gateway/gateway-view-model";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function GatewayRoute() {
  const context = await getAppSessionContext();
  if (context === null) redirect("/login");

  const result = await loadConnectionsPageDataForRequest(context);
  if (!result.ok) throw result.error;

  const now = new Date();
  const view = buildGatewayPageViewModel(result.value, {
    evaluatedAt: now.toISOString(),
    observationGeneration: now.getTime(),
  });

  return <GatewayPage view={view} />;
}
