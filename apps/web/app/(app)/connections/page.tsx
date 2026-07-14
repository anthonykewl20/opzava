import Link from "next/link";

import {
  PageNotice,
  noticeFromSearchParams,
} from "@/app/(app)/connections/_components/page-notice";
import {
  githubStatusDotClass,
  gatewayUnavailableCopy,
  modelProviderCountLabel,
  relativeTime,
  requireConnectionsPageData,
} from "@/app/(app)/connections/_lib/page-data";
import { openclawHealthSummary } from "@/lib/connections-state";

interface ConnectionsPageProps {
  readonly searchParams?: Promise<{
    readonly notice?: string;
    readonly provider?: string;
  }>;
}

export default async function ConnectionsPage({ searchParams }: ConnectionsPageProps) {
  const [params, data] = await Promise.all([searchParams, requireConnectionsPageData()]);
  const notice = noticeFromSearchParams(params);
  const gatewayActive = data.snapshot.gateway.status === "active";
  const gatewaySummary = gatewayActive
    ? `Heartbeat ${relativeTime(data.snapshot.gateway.lastHeartbeatAt)}`
    : gatewayUnavailableCopy(data.snapshot.gateway);
  const githubConnected = data.snapshot.github.status === "connected";
  const health = openclawHealthSummary(data.snapshot.openclawHealth);

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
              {health.percent === null
                ? "OpenClaw health not checked"
                : `${health.healthy} of ${health.healthy + health.attention} checked components healthy`}
              {health.attention > 0 ? `, ${health.attention} need attention` : ""}
              {health.notChecked > 0 ? `, ${health.notChecked} not checked` : ""}.
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
