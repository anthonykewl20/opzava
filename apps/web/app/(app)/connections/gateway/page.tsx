import { refreshConnectionsAction } from "@/app/(app)/connections/actions";
import {
  gatewayUnavailableCopy,
  relativeTime,
  requireConnectionsPageData,
} from "@/app/(app)/connections/_lib/page-data";
import { HealthCheckSubmitButton } from "@/components/connections/health-check-submit";

export default async function GatewayConnectionsPage() {
  const data = await requireConnectionsPageData();
  const connectedLeadProviders = data.providers.filter(
    (provider) => provider.roleLabel === "Lead orchestrator" && provider.status === "connected",
  );
  const connectedSubagentProviders = data.providers.filter(
    (provider) => provider.roleLabel === "Subagent" && provider.status === "connected",
  );
  const gatewayActive = data.snapshot.gateway.status === "active";
  const gatewayCopy = gatewayActive ? null : gatewayUnavailableCopy(data.snapshot.gateway);
  const gatewayHeartbeat = relativeTime(data.snapshot.gateway.lastHeartbeatAt);
  const refreshedAt = relativeTime(data.snapshot.refreshedAt);

  return (
    <>
      <div className="page-header connections-header">
        <div>
          <h1>Gateway health</h1>
          <p className="page-sub">Opzava Gateway status, auth, and routing inventory.</p>
        </div>
        <div className="connections-header-actions">
          <form action={refreshConnectionsAction}>
            <HealthCheckSubmitButton describedBy="connections-refresh-status" />
          </form>
          <p className="connections-refresh-status" id="connections-refresh-status">
            Snapshot updated {refreshedAt}
          </p>
        </div>
      </div>

      <section aria-labelledby="gw-heading">
        <div className="card connections-gateway-card">
          <div className="card-header">
            <div>
              <h2 className="card-title" id="gw-heading">
                Gateway health
              </h2>
              <p className="hint">Opzava Gateway status, auth, and routing inventory.</p>
            </div>
            <span className={gatewayActive ? "badge badge-success" : "badge badge-warning"}>
              {gatewayActive ? "Connected" : "Unavailable"}
            </span>
          </div>
          <div className="card-body">
            {gatewayCopy === null ? null : (
              <div className="connections-notice connections-notice-warning" role="status">
                <span className="dot dot-warning" aria-hidden="true" />
                <div>
                  <strong>{gatewayCopy}</strong>
                  <p className="hint">
                    Last heartbeat {gatewayHeartbeat}. Provider credentials remain stored
                    server-side while the gateway reconnects.
                  </p>
                </div>
              </div>
            )}
            <p className="connections-card-copy">
              The gateway stores provider credentials server-side and routes agent turns to the
              model providers below. Raw provider keys never reach the browser.
            </p>
            <dl className="connections-dl">
              <dt>Status</dt>
              <dd>
                <span className="u-row">
                  <span
                    className={gatewayActive ? "dot dot-success dot-beat" : "dot dot-warning"}
                    aria-hidden="true"
                  />
                  {gatewayActive ? "Active" : "Unavailable"}
                </span>
              </dd>
              <dt>Auth</dt>
              <dd>{data.snapshot.gateway.authLabel}</dd>
              <dt>Catalog</dt>
              <dd>
                {data.providerSummary.total} model providers · {data.providerSummary.connected}{" "}
                connected
              </dd>
              <dt>Last heartbeat</dt>
              <dd className="u-mono">{gatewayHeartbeat}</dd>
              {data.snapshot.gateway.region === null ? null : (
                <>
                  <dt>Region</dt>
                  <dd className="u-mono">{data.snapshot.gateway.region}</dd>
                </>
              )}
              <dt>Hosts</dt>
              <dd>
                <div className="connections-actions">
                  {connectedLeadProviders.length === 0 ? (
                    <span className="badge">No connected lead orchestrator</span>
                  ) : (
                    connectedLeadProviders.map((provider) => (
                      <span className="badge" key={provider.id}>
                        <span className="u-sr-only">AI lead - </span>
                        <span className="u-accent" aria-hidden="true">
                          ✦
                        </span>
                        {provider.label} · LEAD ORCHESTRATOR
                      </span>
                    ))
                  )}
                  {connectedSubagentProviders.length === 0 ? (
                    <span className="u-subtle">No connected subagent providers yet</span>
                  ) : (
                    connectedSubagentProviders.map((provider) => (
                      <span className="badge" key={provider.id}>
                        {provider.label} · SUBAGENT
                      </span>
                    ))
                  )}
                </div>
              </dd>
            </dl>
          </div>
        </div>
      </section>

      {/* DESCOPE(gateway-configuration): P8 PRD-013 keeps restart-gated gateway settings out of the shipped thin slice until those controls are backed by live data. */}
      {/* DESCOPE(orchestrator-role-details): P8 PRD-013 omits the standalone role-apply table; provider rows expose the live orchestrator/subagent role labels for this slice. */}
    </>
  );
}
