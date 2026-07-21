import { redirect } from "next/navigation";

import { ModelsPage } from "@/components/models/models-page";
import { loadConnectionsPageDataForRequest } from "@/lib/connections";
import { buildModelsPageViewModel } from "@/lib/models/models-view-model";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ModelsRoute() {
  const context = await getAppSessionContext();
  if (context === null) redirect("/login");

  const result = await loadConnectionsPageDataForRequest(context);
  if (!result.ok) throw result.error;

  const now = new Date();
  const view = buildModelsPageViewModel(result.value, {
    evaluatedAt: now.toISOString(),
    observationGeneration: now.getTime(),
  });

  return <ModelsPage view={view} />;
}
