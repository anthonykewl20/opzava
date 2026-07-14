import {
  PageNotice,
  noticeFromSearchParams,
} from "@/app/(app)/connections/_components/page-notice";
import { requireConnectionsPageData } from "@/app/(app)/connections/_lib/page-data";
import { refreshConnectionsAction } from "@/app/(app)/connections/actions";
import { ConnectionsAutoRefresh } from "@/components/connections/connections-auto-refresh";
import { ConnectionsSystemStatus } from "@/components/connections/connections-system-status";

interface ConnectionsSystemPageProps {
  readonly searchParams?: Promise<{ readonly notice?: string }>;
}

export default async function ConnectionsSystemPage({ searchParams }: ConnectionsSystemPageProps) {
  const [params, data] = await Promise.all([searchParams, requireConnectionsPageData()]);
  const notice = noticeFromSearchParams(params);
  const refreshAction = refreshConnectionsAction.bind(null, "/connections/system");

  return (
    <>
      <ConnectionsAutoRefresh />
      <PageNotice notice={notice} refreshedAt={data.snapshot.refreshedAt} />
      <ConnectionsSystemStatus data={data} refreshAction={refreshAction} />
    </>
  );
}
