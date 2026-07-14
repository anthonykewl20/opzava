import {
  PageNotice,
  noticeFromSearchParams,
} from "@/app/(app)/connections/_components/page-notice";
import { requireConnectionsPageData } from "@/app/(app)/connections/_lib/page-data";
import { ModelProvidersPanel } from "@/components/connections/model-providers-panel";
import { ProviderRulesPopover } from "@/components/connections/provider-rules-popover";

interface ModelProviderConnectionsPageProps {
  readonly searchParams?: Promise<{
    readonly notice?: string;
    readonly provider?: string;
  }>;
}

export default async function ModelProviderConnectionsPage({
  searchParams,
}: ModelProviderConnectionsPageProps) {
  const [params, data] = await Promise.all([searchParams, requireConnectionsPageData()]);
  const notice = noticeFromSearchParams(params);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="flex items-center gap-1.5">
            <h1>Model providers</h1>
            <ProviderRulesPopover />
          </div>
          <p className="page-sub">Canonical LLM provider credentials the gateway can route to.</p>
        </div>
      </div>

      <PageNotice notice={notice} refreshedAt={data.snapshot.refreshedAt} />

      <ModelProvidersPanel
        gatewayStatus={data.snapshot.gateway.status}
        providers={data.providers}
        summary={data.providerSummary}
        orchestratorReconcile={data.snapshot.orchestrator.reconcile}
      />

      {/* DESCOPE(provider-policy-catalogs): P8 PRD-013 omits catalog policy controls until auth-order editing and model catalog reads are implemented. */}
    </>
  );
}
