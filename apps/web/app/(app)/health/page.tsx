import { redirect } from "next/navigation";

import { HealthPage } from "@/components/health/health-page";
import { loadConnectionsPageDataForRequest } from "@/lib/connections";
import { defaultDoctorScanClient, readDoctorScanScope } from "@/lib/doctor-scan";
import { buildHealthPageViewModel } from "@/lib/health/health-view-model";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HealthRoute() {
  const context = await getAppSessionContext();
  if (context === null) redirect("/login");

  const result = await loadConnectionsPageDataForRequest(context);
  if (!result.ok) throw result.error;

  const scope = readDoctorScanScope(process.env);
  let scan = undefined;
  if (scope.ok) {
    try {
      const scanResult = await defaultDoctorScanClient().readLatest(scope.value);
      scan = scanResult.ok ? scanResult.value : null;
    } catch {
      scan = null;
    }
  }

  const now = new Date();
  const view = buildHealthPageViewModel(
    result.value,
    {
      evaluatedAt: now.toISOString(),
      observationGeneration: now.getTime(),
    },
    scan,
  );

  return <HealthPage view={view} />;
}
