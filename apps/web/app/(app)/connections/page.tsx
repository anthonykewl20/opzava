import {
  PageNotice,
  noticeFromSearchParams,
} from "@/app/(app)/connections/_components/page-notice";
import { requireConnectionsPageData } from "@/app/(app)/connections/_lib/page-data";
import { refreshConnectionsAction } from "@/app/(app)/connections/actions";
import { ConnectionsAutoRefresh } from "@/components/connections/connections-auto-refresh";
import { ConnectionsOverview } from "@/components/connections/connections-overview";

interface ConnectionsPageProps {
  readonly searchParams?: Promise<{
    readonly notice?: string;
    readonly provider?: string;
  }>;
}

export default async function ConnectionsPage({ searchParams }: ConnectionsPageProps) {
  const [params, data] = await Promise.all([searchParams, requireConnectionsPageData()]);
  const notice = noticeFromSearchParams(params);
  const refreshAction = refreshConnectionsAction.bind(null, "/connections");

  return (
    <>
      <ConnectionsAutoRefresh />
      <div className="page-header connections-header">
        <div>
          <h1>Connections</h1>
          <p className="page-sub">
            OpenClaw health, model providers, and third-party integrations for this workspace.
          </p>
        </div>
      </div>

      <PageNotice notice={notice} refreshedAt={data.snapshot.refreshedAt} />
      <ConnectionsOverview data={data} refreshAction={refreshAction} />

      <p className="connections-footer-note">
        Connection actions are provisioning/admin operations. The broker hot path cannot request
        provider secrets or operator.admin scopes.
      </p>
    </>
  );
}
