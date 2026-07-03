import { redirect } from "next/navigation";

import {
  connectModelProviderApiKeyAction,
  disconnectGitHubAction,
  disconnectModelProviderAction,
  refreshConnectionsAction,
  startGitHubDeviceFlowAction,
  startModelProviderDeviceFlowAction,
} from "@/app/(app)/connections/actions";
import { DeviceFlowPoller } from "@/components/connections/device-flow-poller";
import { loadConnectionsPageData, type ConnectionsPageData } from "@/lib/connections";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

type ProviderRow = ConnectionsPageData["providers"][number];

const connectionsPageStyles = `
    /* Page-specific layout only — no color, font-size, shadow, or radius overrides */
    .conn-group { margin-top: var(--space-8); padding-top: var(--space-5); border-top: 1px solid var(--border); }
    .conn-group-head { margin-bottom: var(--space-4); }
    .conn-group-eyebrow { text-transform: uppercase; letter-spacing: var(--tracking-caps); font-size: var(--text-xs); font-weight: var(--fw-semibold); color: var(--accent); }
    .conn-group-head h2 { font-size: var(--text-lg); margin-top: 2px; }
    .conn-group-head p { color: var(--fg-muted); font-size: var(--text-sm); margin: 4px 0 0; max-width: 70ch; }
    .connections-status-cell { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-2); padding: var(--space-2) 0; }
    .connections-provider-actions { margin-top: var(--space-1); }
    .connections-provider-actions .connections-actions { gap: var(--space-2); }
    .connections-table-card { overflow: visible; }
    .connections-github-card { border-left: 3px solid var(--accent); }
    .connections-github-card .card-body { display: flex; flex-direction: column; gap: var(--space-4); }
    @media (max-width: 640px) {
      .connections-page { padding: var(--space-4); }
      .connections-header { display: grid; grid-template-columns: 1fr; }
    }
`;

function ConnectionsPageStyles() {
  return <style>{connectionsPageStyles}</style>;
}

function errorStatus(error: unknown, depth = 0): number | undefined {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return undefined;
  }

  const status = (error as { readonly status?: unknown }).status;
  return typeof status === "number"
    ? status
    : errorStatus((error as { readonly cause?: unknown }).cause, depth + 1);
}

function errorCode(error: unknown, depth = 0): string | undefined {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return undefined;
  }

  const code = (error as { readonly code?: unknown }).code;
  return typeof code === "string"
    ? code
    : errorCode((error as { readonly cause?: unknown }).cause, depth + 1);
}

function relativeTime(value: string | null): string {
  if (value === null) {
    return "not checked";
  }

  const diffMs = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diffMs)) {
    return "unknown";
  }

  if (diffMs < 60_000) {
    return "now";
  }

  if (diffMs < 3_600_000) {
    return `${Math.floor(diffMs / 60_000)}m ago`;
  }

  return `${Math.floor(diffMs / 3_600_000)}h ago`;
}

function providerAuthLabel(provider: ProviderRow): string {
  const hasDeviceFlow = provider.deviceFlowChoices.length > 0;
  const hasApiKey = provider.apiKeyChoices.length > 0;

  if (hasDeviceFlow && hasApiKey) {
    return "OAuth → API key";
  }

  if (hasDeviceFlow) {
    return "OAuth";
  }

  if (hasApiKey) {
    return "API key";
  }

  return "Unavailable";
}

function githubStatusDotClass(status: ConnectionsPageData["snapshot"]["github"]["status"]): string {
  if (status === "connected") {
    return "dot dot-success dot-beat";
  }

  if (status === "pending" || status === "needs_attention") {
    return "dot dot-warning";
  }

  return "dot";
}

function ProviderBacks({ provider }: { readonly provider: ProviderRow }) {
  if (provider.roleLabel === "Lead orchestrator") {
    return (
      <span className="u-row" style={{ gap: "6px" }}>
        <span className="u-sr-only">AI lead — </span>
        <span
          className="u-accent"
          aria-hidden="true"
          style={{ fontSize: "var(--text-base)", lineHeight: 1 }}
        >
          ✦
        </span>
        Lead orchestrator
      </span>
    );
  }

  return (
    <span>
      Subagent <span className="u-subtle">({provider.whenToUse})</span>
    </span>
  );
}

function ProviderActions({
  providerId,
  apiKeyChoices,
  deviceFlowChoices,
  connected,
}: {
  readonly providerId: string;
  readonly apiKeyChoices: readonly { readonly id: string; readonly label: string }[];
  readonly deviceFlowChoices: readonly { readonly id: string; readonly label: string }[];
  readonly connected: boolean;
}) {
  return (
    <div className="connections-actions">
      {deviceFlowChoices.map((choice) => (
        <form action={startModelProviderDeviceFlowAction} key={choice.id}>
          <input type="hidden" name="providerId" value={providerId} />
          <input type="hidden" name="authChoiceId" value={choice.id} />
          <button type="submit" className={connected ? "btn btn-ghost btn-sm" : "btn btn-sm"}>
            {connected ? "Reconnect" : "Connect"} {choice.label}
          </button>
        </form>
      ))}
      {apiKeyChoices.map((choice) => (
        <details className="connections-key-form" key={choice.id}>
          <summary className={connected ? "btn btn-ghost btn-sm" : "btn btn-primary btn-sm"}>
            {connected ? "Rotate key" : "Connect"} {choice.label}
          </summary>
          <form action={connectModelProviderApiKeyAction}>
            <input type="hidden" name="providerId" value={providerId} />
            <input type="hidden" name="authChoiceId" value={choice.id} />
            <label className="label" htmlFor={`${providerId}-${choice.id}-key`}>
              Paste once
            </label>
            <input
              className="input"
              id={`${providerId}-${choice.id}-key`}
              name="apiKey"
              type="password"
              autoComplete="off"
              required
            />
            <p className="hint">The key is sent only to the provisioning worker.</p>
            <button type="submit" className="btn btn-primary btn-sm">
              Store in Gateway profile
            </button>
          </form>
        </details>
      ))}
      {connected ? (
        <form action={disconnectModelProviderAction}>
          <input type="hidden" name="providerId" value={providerId} />
          <button type="submit" className="btn btn-ghost btn-sm">
            Disconnect
          </button>
        </form>
      ) : null}
    </div>
  );
}

export default async function ConnectionsPage() {
  const context = await getAppSessionContext();
  if (context === null) {
    redirect("/login");
  }

  const result = await loadConnectionsPageData(context);
  if (!result.ok) {
    if (
      errorCode(result.error) === "projectManagement.forbidden" ||
      errorStatus(result.error) === 403
    ) {
      redirect("/");
    }

    throw result.error;
  }

  const data = result.value;
  const githubPendingFlow =
    data.snapshot.pendingDeviceFlows.find((flow) => flow.kind === "github") ?? null;
  const connectedSubagentProviders = data.providers.filter(
    (provider) => provider.id !== "openai" && provider.status === "connected",
  );

  const connectedProviderCount = data.providers.filter(
    (provider) => provider.status === "connected",
  ).length;

  return (
    <div className="page connections-page">
      <ConnectionsPageStyles />
      <div className="page-stack">
        <div className="page-header connections-header">
          <div>
            <h1>Connections</h1>
            <p className="page-sub">
              Gateway providers and GitHub credentials · keys never return to the browser
            </p>
          </div>
          <div className="u-row connections-header-actions">
            <form action={refreshConnectionsAction}>
              <button type="submit" className="btn">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M13 8a5 5 0 1 1-1.46-3.54M13 2.5v3h-3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Run health check
              </button>
            </form>
            <a href="#providers-lbl" className="btn btn-primary">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M8 3v10M3 8h10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              Add connection
            </a>
          </div>
        </div>

        <section aria-label="Connection health summary">
          <div className="stat-grid">
            <div className="stat">
              <div className="stat-label">Connected</div>
              <div className="u-row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
                <span className="stat-value u-tnum">{data.health.connected}</span>
                <span className="dot dot-success dot-beat" aria-hidden="true" title="live" />
              </div>
              <div className="stat-delta u-subtle">live now · of {data.health.total} total</div>
            </div>

            <div className="stat">
              <div className="stat-label">Needs attention</div>
              <div className="u-row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
                <span className="stat-value u-tnum">{data.health.needsAttention}</span>
                <span className="dot dot-warning" aria-hidden="true" />
              </div>
              <div className="stat-delta u-subtle">{data.health.pending} pending flows</div>
            </div>

            <div className="stat">
              <div className="stat-label">Gateway</div>
              <div className="u-row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
                <span className="stat-value">
                  {data.snapshot.gateway.status === "active" ? "Active" : "Unavailable"}
                </span>
                <span
                  className={
                    data.snapshot.gateway.status === "active"
                      ? "dot dot-success dot-beat"
                      : "dot dot-warning"
                  }
                  aria-hidden="true"
                  title="heartbeat live"
                />
              </div>
              <div className="stat-delta u-subtle">
                OpenClaw ·{" "}
                <span className="u-mono">{data.snapshot.gateway.region ?? "unknown"}</span>
              </div>
            </div>
          </div>
        </section>

        <div className="conn-group">
          <div className="conn-group-head">
            <span className="conn-group-eyebrow">OpenClaw gateway</span>
            <h2>Gateway & models</h2>
            <p>
              The backend LLM substrate the fleet runs on. The <strong>gateway</strong> holds
              provider credentials server-side (SecretRef / OAuth) and routes agent turns to the{" "}
              <strong>model providers</strong> below — raw keys never reach the browser.
            </p>
          </div>
        </div>

        <section aria-labelledby="gw-heading">
          <div
            className="card connections-gateway-card"
            style={{ borderLeft: "3px solid var(--accent)" }}
          >
            <div className="card-header">
              <h2 className="card-title" id="gw-heading">
                OpenClaw gateway
              </h2>
              <span className="badge badge-accent">24/7 substrate</span>
            </div>
            <div className="card-body">
              <dl
                style={{
                  display: "grid",
                  gridTemplateColumns: "148px 1fr",
                  gap: "var(--space-3) var(--space-4)",
                  alignItems: "baseline",
                  margin: 0,
                }}
              >
                <dt className="u-muted">Status</dt>
                <dd style={{ margin: 0 }}>
                  <span className="u-row" style={{ gap: "var(--space-2)" }}>
                    <span
                      className={
                        data.snapshot.gateway.status === "active"
                          ? "dot dot-success dot-beat"
                          : "dot dot-warning"
                      }
                      aria-hidden="true"
                    />
                    {data.snapshot.gateway.status === "active" ? "Active" : "Unavailable"}
                  </span>
                </dd>

                <dt className="u-muted">Auth</dt>
                <dd style={{ margin: 0 }}>{data.snapshot.gateway.authLabel}</dd>

                <dt className="u-muted">Hosts</dt>
                <dd style={{ margin: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "var(--space-2)",
                      alignItems: "center",
                    }}
                  >
                    <span className="badge">
                      <span className="u-sr-only">AI lead — </span>
                      <span
                        className="u-accent"
                        aria-hidden="true"
                        style={{ fontSize: "var(--text-sm)" }}
                      >
                        ✦
                      </span>{" "}
                      Lead orchestrator
                    </span>
                    {connectedSubagentProviders.map((provider) => (
                      <span className="badge" key={provider.id}>
                        {provider.label}
                      </span>
                    ))}
                  </div>
                </dd>

                <dt className="u-muted">Last heartbeat</dt>
                <dd style={{ margin: 0 }}>
                  <span className="u-mono">
                    {relativeTime(data.snapshot.gateway.lastHeartbeatAt)}
                  </span>
                </dd>

                <dt className="u-muted">Region</dt>
                <dd style={{ margin: 0 }}>
                  <span className="u-mono">{data.snapshot.gateway.region ?? "unknown"}</span>
                </dd>
              </dl>
            </div>
          </div>
        </section>

        <section aria-labelledby="providers-lbl">
          <div
            className="u-between u-wrap"
            style={{ gap: "var(--space-2)", marginBottom: "var(--space-2)" }}
          >
            <div className="section-label" id="providers-lbl" style={{ padding: 0 }}>
              Model providers
            </div>
            <span className="u-subtle" style={{ fontSize: "var(--text-xs)" }}>
              The gateway routes the fleet to these · {connectedProviderCount} linked · auth order
              OAuth → API key
            </span>
          </div>

          {data.providers.length === 0 ? (
            <div className="empty">
              <p className="empty-title">Gateway catalog unavailable</p>
              <p className="empty-desc">
                Configure the provisioning worker to read the live Gateway auth-choice catalog.
              </p>
            </div>
          ) : (
            <div className="card connections-table-card">
              <table className="table table-compact table-cards">
                <caption className="u-sr-only">
                  AI providers backing the fleet — provider, authentication, what each backs, plan
                  or usage, and live status.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Provider</th>
                    <th scope="col">Auth</th>
                    <th scope="col">Backs</th>
                    <th scope="col">Plan / usage</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.providers.map((provider) => (
                    <tr key={provider.id}>
                      <td data-label="Provider">
                        <div
                          style={{ fontWeight: "var(--fw-medium)", lineHeight: "var(--lh-snug)" }}
                        >
                          {provider.label}
                        </div>
                        <div
                          className="u-subtle"
                          style={{ fontSize: "var(--text-xs)", marginTop: "2px" }}
                        >
                          {provider.vendor}
                        </div>
                      </td>
                      <td data-label="Auth">
                        <span className="badge">{providerAuthLabel(provider)}</span>
                      </td>
                      <td data-label="Backs">
                        <ProviderBacks provider={provider} />
                      </td>
                      <td data-label="Plan / usage">
                        {provider.usageLabel === null ? (
                          <span className="u-muted">
                            <span className="u-mono">{provider.model}</span> until connected
                          </span>
                        ) : (
                          <span className="u-muted">{provider.usageLabel}</span>
                        )}
                      </td>
                      <td data-label="Status">
                        <div className="connections-status-cell">
                          <span className="u-row">
                            <span className={provider.statusClassName} aria-hidden="true" />
                            {provider.statusLabel}
                          </span>
                          {provider.accountLabel === null ? null : (
                            <span className="u-subtle">{provider.accountLabel}</span>
                          )}
                          {provider.pendingFlow === null ? null : (
                            <DeviceFlowPoller
                              flowId={provider.pendingFlow.flowId}
                              verificationUri={provider.pendingFlow.verificationUri}
                              userCode={provider.pendingFlow.userCode}
                              intervalSeconds={provider.pendingFlow.intervalSeconds}
                              expiresAt={provider.pendingFlow.expiresAt}
                            />
                          )}
                          <div className="connections-provider-actions">
                            <ProviderActions
                              providerId={provider.id}
                              apiKeyChoices={provider.apiKeyChoices}
                              deviceFlowChoices={provider.deviceFlowChoices}
                              connected={provider.status === "connected"}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* DESCOPE(gateway-configuration): P8 PRD-013 keeps restart-gated gateway settings out of the shipped thin slice until those controls are backed by live data. */}
        {/* DESCOPE(provider-policy-catalogs): P8 PRD-013 omits catalog policy controls until auth-order editing and model catalog reads are implemented. */}
        {/* DESCOPE(orchestrator-role-details): P8 PRD-013 omits the standalone role-apply table; provider rows expose the live orchestrator/subagent role labels for this slice. */}

        <section aria-labelledby="github-heading" className="nav-section-gap">
          <div className="card connections-github-card">
            <div className="card-header">
              <div>
                <h2 className="card-title" id="github-heading">
                  GitHub
                </h2>
                <p className="hint">{data.githubSummary}</p>
              </div>
              <span className="badge">SecretsVaultPort</span>
            </div>
            <div className="card-body">
              <dl className="connections-dl">
                <dt>Status</dt>
                <dd>
                  <span className="u-row">
                    <span
                      className={githubStatusDotClass(data.snapshot.github.status)}
                      aria-hidden="true"
                    />
                    {data.snapshot.github.status}
                  </span>
                </dd>
                <dt>Repo</dt>
                <dd className="u-mono">{data.snapshot.github.repository}</dd>
                <dt>Account</dt>
                <dd>{data.snapshot.github.accountLabel ?? "not connected"}</dd>
                <dt>Scopes</dt>
                <dd>
                  {data.snapshot.github.scopes.length === 0
                    ? "unknown until connected"
                    : data.snapshot.github.scopes.join(", ")}
                </dd>
              </dl>

              {githubPendingFlow === null ? null : (
                <DeviceFlowPoller
                  flowId={githubPendingFlow.flowId}
                  verificationUri={githubPendingFlow.verificationUri}
                  userCode={githubPendingFlow.userCode}
                  intervalSeconds={githubPendingFlow.intervalSeconds}
                  expiresAt={githubPendingFlow.expiresAt}
                />
              )}

              <div className="connections-actions">
                <form action={startGitHubDeviceFlowAction}>
                  <button type="submit" className="btn btn-primary btn-sm">
                    {data.snapshot.github.status === "connected" ? "Reconnect" : "Connect"} GitHub
                  </button>
                </form>
                {data.snapshot.github.status === "connected" ? (
                  <form action={disconnectGitHubAction}>
                    <button type="submit" className="btn btn-ghost btn-sm">
                      Disconnect
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {/* DESCOPE(agent-tools-mcp): P8 PRD-013 omits operator-owned tool and MCP inventory rows until those resources have a live backend seam. */}
        {/* DESCOPE(channels-services): P8 PRD-013 omits publishing and messaging channel rows until channel connection state is live. */}

        <p className="hint">
          Connection actions are provisioning/admin operations. The broker hot path cannot request
          provider secrets or operator.admin scopes.
        </p>
      </div>
    </div>
  );
}
