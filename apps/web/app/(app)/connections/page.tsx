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
  const githubConnected = data.snapshot.github.status === "connected";

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

      <section className="card" aria-labelledby="connections-overview-title">
        <div className="card-header">
          <div>
            <h2 className="card-title" id="connections-overview-title">
              Overview
            </h2>
            <p className="page-sub">
              {data.health.connected} of {data.health.total} connections healthy
              {data.health.needsAttention > 0
                ? `, ${data.health.needsAttention} need attention`
                : ""}
              {data.health.pending > 0 ? `, ${data.health.pending} pending` : ""}.
            </p>
          </div>
        </div>
        <div className="card-body" style={{ display: "grid", gap: "var(--space-5)" }}>
          <div role="list" aria-label="Platform connections">
            <div
              role="listitem"
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                gap: "var(--space-3)",
                alignItems: "center",
                paddingBottom: "var(--space-4)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div>
                <div className="u-row">
                  <span
                    className={gatewayActive ? "dot dot-success dot-beat" : "dot dot-warning"}
                    aria-hidden="true"
                  />
                  <strong>Opzava Gateway</strong>
                  <span className={gatewayActive ? "badge badge-success" : "badge badge-warning"}>
                    {gatewayActive ? "Active" : "Unavailable"}
                  </span>
                </div>
                <p className="hint">{gatewaySummary}</p>
              </div>
              <Link
                className="btn btn-sm"
                href="/connections/gateway"
                aria-label="Open Opzava Gateway connection"
              >
                Open
              </Link>
            </div>

            <div
              role="listitem"
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                gap: "var(--space-3)",
                alignItems: "center",
                paddingTop: "var(--space-4)",
              }}
            >
              <div>
                <div className="u-row">
                  <span
                    className={
                      data.providerSummary.connected > 0 ? "dot dot-success dot-beat" : "dot"
                    }
                    aria-hidden="true"
                  />
                  <strong>Model Providers</strong>
                  <span className="badge u-tnum">
                    {data.providerSummary.connected}/{data.providerSummary.total} connected
                  </span>
                </div>
                <p className="hint">{modelProviderCountLabel(data)} in the live gateway catalog.</p>
              </div>
              <Link
                className="btn btn-sm"
                href="/connections/providers"
                aria-label="Open model provider connections"
              >
                Open
              </Link>
            </div>
          </div>

          <div>
            <h3 className="card-title">Integrations</h3>
            {githubConnected ? (
              <div
                role="list"
                aria-label="Connected integrations"
                style={{ marginTop: "var(--space-3)" }}
              >
                <div
                  role="listitem"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    gap: "var(--space-3)",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div className="u-row">
                      <span
                        className={githubStatusDotClass(data.snapshot.github.status)}
                        aria-hidden="true"
                      />
                      <strong>GitHub</strong>
                      <span className="badge badge-success">Connected</span>
                    </div>
                    <p className="hint">{data.githubSummary}</p>
                  </div>
                  <Link
                    className="btn btn-sm"
                    href="/connections/github"
                    aria-label="Open GitHub integration"
                  >
                    Open
                  </Link>
                </div>
              </div>
            ) : (
              <div
                className="empty"
                style={{
                  marginTop: "var(--space-3)",
                  padding: "var(--space-6)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                <h3 className="empty-title">No third-party integrations connected</h3>
                <p className="hint">
                  Add GitHub or another supported integration when this workspace needs external
                  access.
                </p>
                <Link className="btn btn-sm" href="/connections/add">
                  Add integration
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      <p className="connections-footer-note">
        Connection actions are provisioning/admin operations. The broker hot path cannot request
        provider secrets or operator.admin scopes.
      </p>
    </>
  );
}
