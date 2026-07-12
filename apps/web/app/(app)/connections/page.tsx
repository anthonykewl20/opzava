import Link from "next/link";

import {
  githubStatusDotClass,
  gatewayUnavailableCopy,
  modelProviderCountLabel,
  relativeTime,
  requireConnectionsPageData,
} from "@/app/(app)/connections/_lib/page-data";

interface ConnectionsPageProps {
  readonly searchParams?: Promise<{
    readonly notice?: string;
    readonly provider?: string;
  }>;
}

type ConnectionsNotice =
  | { readonly kind: "health-check-complete" }
  | { readonly kind: "health-check-error" }
  | { readonly kind: "connection-action-error"; readonly providerId?: string }
  | { readonly kind: "operator-admin-required"; readonly providerId?: string };

function noticeFromSearchParams(
  params: Awaited<NonNullable<ConnectionsPageProps["searchParams"]>> | undefined,
): ConnectionsNotice | null {
  if (params?.notice === "health-check-complete") {
    return { kind: "health-check-complete" };
  }

  if (params?.notice === "health-check-error") {
    return { kind: "health-check-error" };
  }

  if (params?.notice === "operator-admin-required") {
    return {
      kind: "operator-admin-required",
      ...(params.provider === undefined ? {} : { providerId: params.provider }),
    };
  }

  if (params?.notice === "connection-action-error") {
    return {
      kind: "connection-action-error",
      ...(params.provider === undefined ? {} : { providerId: params.provider }),
    };
  }

  return null;
}

function PageNotice({
  notice,
  refreshedAt,
}: {
  readonly notice: ConnectionsNotice | null;
  readonly refreshedAt: string;
}) {
  if (notice === null) {
    return null;
  }

  if (notice.kind === "operator-admin-required") {
    return (
      <div className="connections-notice connections-notice-warning" role="alert">
        <span className="dot dot-warning" aria-hidden="true" />
        <div>
          <strong>Admin device required.</strong>
          <p className="hint">
            Pair or upgrade an operator.admin device before changing provider credentials
            {notice.providerId === undefined ? "." : ` for ${notice.providerId}.`}
          </p>
        </div>
      </div>
    );
  }

  if (notice.kind === "connection-action-error") {
    return (
      <div className="connections-notice connections-notice-danger" role="alert">
        <span className="dot dot-danger" aria-hidden="true" />
        <div>
          <strong>Connection action could not complete.</strong>
          <p className="hint">
            Showing the latest available connection snapshot
            {notice.providerId === undefined ? "." : ` for ${notice.providerId}.`}
          </p>
        </div>
      </div>
    );
  }

  if (notice.kind === "health-check-error") {
    return (
      <div className="connections-notice connections-notice-danger" role="alert">
        <span className="dot dot-danger" aria-hidden="true" />
        <div>
          <strong>Health check could not complete.</strong>
          <p className="hint">Showing the latest available connection snapshot.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="connections-notice" role="status">
      <span className="dot dot-success" aria-hidden="true" />
      <div>
        <strong>Health check complete.</strong>
        <p className="hint">Snapshot updated {relativeTime(refreshedAt)}.</p>
      </div>
    </div>
  );
}

export default async function ConnectionsPage({ searchParams }: ConnectionsPageProps) {
  const [params, data] = await Promise.all([searchParams, requireConnectionsPageData()]);
  const notice = noticeFromSearchParams(params);
  const gatewayActive = data.snapshot.gateway.status === "active";
  const gatewaySummary = gatewayActive
    ? `Heartbeat ${relativeTime(data.snapshot.gateway.lastHeartbeatAt)}`
    : gatewayUnavailableCopy(data.snapshot.gateway);

  return (
    <>
      <div className="page-header connections-header">
        <div>
          <h1>Connections</h1>
          <p className="page-sub">
            Live provider credentials and GitHub access. Keys never return to the browser.
          </p>
        </div>
      </div>

      <PageNotice notice={notice} refreshedAt={data.snapshot.refreshedAt} />

      <section className="connections-overview" aria-label="Connection status summary">
        <Link className="stat" href="/connections/gateway">
          <div className="stat-label">Opzava Gateway</div>
          <div className="u-row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
            <span className="stat-value">{gatewayActive ? "Active" : "Unavailable"}</span>
            <span
              className={gatewayActive ? "dot dot-success dot-beat" : "dot dot-warning"}
              aria-hidden="true"
            />
          </div>
          <p className="stat-delta u-subtle">{gatewaySummary}</p>
        </Link>

        <Link className="stat" href="/connections/providers">
          <div className="stat-label">Model providers</div>
          <div className="stat-value u-tnum">{modelProviderCountLabel(data)}</div>
          <p className="stat-delta u-subtle">
            Counts only model providers from the live gateway catalog.
          </p>
        </Link>

        <Link className="stat" href="/connections/github">
          <div className="stat-label">GitHub</div>
          <div className="u-row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
            <span className="stat-value">
              {data.snapshot.github.status === "connected" ? "Connected" : "Not connected"}
            </span>
            <span className={githubStatusDotClass(data.snapshot.github.status)} aria-hidden="true" />
          </div>
          <p className="stat-delta u-subtle">{data.githubSummary}</p>
        </Link>

        <Link className="stat" href="/connections/add">
          <div className="stat-label">Add integration</div>
          <div className="stat-value">Catalog</div>
          <p className="stat-delta u-subtle">Connect another supported integration.</p>
        </Link>
      </section>

      <p className="connections-footer-note">
        Connection actions are provisioning/admin operations. The broker hot path cannot request
        provider secrets or operator.admin scopes.
      </p>
    </>
  );
}
