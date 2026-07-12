import { requireConnectionsPageData } from "@/app/(app)/connections/_lib/page-data";
import { ModelProvidersPanel } from "@/components/connections/model-providers-panel";

export default async function ModelProviderConnectionsPage() {
  const data = await requireConnectionsPageData();

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Model providers</h1>
          <p className="page-sub">LLM credentials the gateway can route to.</p>
        </div>
      </div>

      <ModelProvidersPanel
        gatewayStatus={data.snapshot.gateway.status}
        providers={data.providers}
        summary={data.providerSummary}
      />

      {/* DESCOPE(provider-policy-catalogs): P8 PRD-013 omits catalog policy controls until auth-order editing and model catalog reads are implemented. */}
    </>
  );
}
