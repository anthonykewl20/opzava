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
import { HealthCheckSubmitButton } from "@/components/connections/health-check-submit";
import { loadConnectionsPageData, type ConnectionsPageData } from "@/lib/connections";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

type ProviderRow = ConnectionsPageData["providers"][number];

interface ConnectionsPageProps {
  readonly searchParams?: Promise<{
    readonly notice?: string;
    readonly provider?: string;
  }>;
}

type ConnectionsNotice =
  | { readonly kind: "health-check-complete" }
  | { readonly kind: "health-check-error" }
  | { readonly kind: "operator-admin-required"; readonly providerId?: string };

const connectionsPageStyles = `
    /* Page-specific layout only; shared primitives come from app tokens/classes. */
    .connections-header { display: grid; grid-template-columns: minmax(0, 1fr) auto; }
    .connections-header-actions { align-items: flex-end; }
    .connections-action-stack { display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-1); }
    .connections-refresh-status { color: var(--fg-subtle); font-size: var(--text-xs); }
    .connections-notice { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--space-2); align-items: start; padding: var(--space-3) var(--space-4); border: 1px solid var(--border); border-left: 3px solid var(--accent); border-radius: var(--radius-md); background: var(--surface); }
    .connections-notice-warning { border-left-color: var(--warning); }
    .connections-notice-danger { border-left-color: var(--danger); }
    .connections-overview { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(300px, .85fr); gap: var(--space-4); align-items: stretch; }
    .connections-gateway-card .card-body, .connections-github-card .card-body { display: flex; flex-direction: column; gap: var(--space-4); }
    .connections-card-copy { color: var(--fg-muted); font-size: var(--text-sm); max-width: 72ch; }
    .connections-provider-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-3); }
    .connections-provider-count { color: var(--fg-muted); font-size: var(--text-sm); }
    .connections-provider-list { margin: 0; padding: 0; list-style: none; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: visible; }
    .connections-provider-row { display: grid; grid-template-columns: minmax(220px, 1.05fr) minmax(230px, 1fr) minmax(260px, auto); gap: var(--space-4); align-items: start; padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--border); }
    .connections-provider-row:last-child { border-bottom: 0; }
    .connections-provider-name { font-weight: var(--fw-semibold); line-height: var(--lh-snug); }
    .connections-provider-sub { margin-top: 2px; color: var(--fg-subtle); font-size: var(--text-xs); }
    .connections-provider-meta { display: flex; flex-direction: column; gap: var(--space-2); color: var(--fg-muted); font-size: var(--text-sm); }
    .connections-provider-meta-row { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
    .connections-provider-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--space-2); }
    .connections-provider-state { display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-2); text-align: right; }
    .connections-inline-alert { width: 100%; padding: var(--space-2) var(--space-3); border: 1px solid var(--warning-soft); border-radius: var(--radius-md); background: var(--warning-soft); color: var(--fg); font-size: var(--text-sm); text-align: left; }
    .connections-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
    .connections-key-form { position: relative; }
    .connections-key-form form { z-index: var(--z-dropdown); }
    .connections-empty { border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); }
    .connections-footer-note { color: var(--fg-muted); font-size: var(--text-sm); }
    .connections-github-card { border-left: 3px solid var(--accent); }
    @media (max-width: 980px) {
      .connections-overview { grid-template-columns: 1fr; }
      .connections-provider-row { grid-template-columns: 1fr; }
      .connections-provider-state, .connections-provider-actions { align-items: flex-start; justify-content: flex-start; text-align: left; }
    }
    @media (max-width: 640px) {
      .connections-page { padding: var(--space-4); }
      .connections-header { grid-template-columns: 1fr; }
      .connections-header-actions, .connections-action-stack { align-items: stretch; }
      .connections-provider-head { flex-direction: column; }
      .connections-provider-row { padding: var(--space-4); }
      .connections-actions .btn, .connections-provider-actions .btn, .connections-key-form { width: 100%; }
      .connections-actions form, .connections-provider-actions form { width: 100%; }
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
    return "not available";
  }

  if (diffMs < 60_000) {
    return "now";
  }

  if (diffMs < 3_600_000) {
    return `${Math.floor(diffMs / 60_000)}m ago`;
  }

  return `${Math.floor(diffMs / 3_600_000)}h ago`;
}

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

  return null;
}

function providerSortRank(provider: ProviderRow): number {
  if (provider.status === "connected") {
    return 0;
  }

  if (provider.status === "pending") {
    return 1;
  }

  if (provider.status === "needs_attention") {
    return 2;
  }

  return 3;
}

function providerAuthLabel(provider: ProviderRow): string {
  const hasDeviceFlow = provider.deviceFlowChoices.length > 0;
  const hasApiKey = provider.apiKeyChoices.length > 0;

  if (hasDeviceFlow && hasApiKey) {
    return "OAuth device-flow + API key";
  }

  if (hasDeviceFlow) {
    return "OAuth device-flow";
  }

  if (hasApiKey) {
    return "API key";
  }

  return "No live auth method";
}

function providerStatusBadgeClassName(status: ProviderRow["status"]): string {
  if (status === "connected") {
    return "badge badge-success";
  }

  if (status === "pending" || status === "needs_attention") {
    return "badge badge-warning";
  }

  return "badge";
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

function modelProviderCountLabel(data: ConnectionsPageData): string {
  return `${data.providerSummary.connected} connected / ${data.providerSummary.available} available`;
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

function PageNotice({
  notice,
  refreshedAt,
}: {
  readonly notice: ConnectionsNotice | null;
  readonly refreshedAt: string;
}) {
  if (notice === null || notice.kind === "operator-admin-required") {
    return null;
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

function ProviderAdminNotice({
  provider,
  notice,
}: {
  readonly provider: ProviderRow;
  readonly notice: ConnectionsNotice | null;
}) {
  const matchesProvider =
    notice?.kind === "operator-admin-required" &&
    (notice.providerId === undefined || notice.providerId === provider.id);

  if (!matchesProvider) {
    return null;
  }

  return (
    <div className="connections-inline-alert" role="alert">
      Admin device required. Pair or upgrade the worker device with{" "}
      <span className="u-mono">operator.admin</span> to change this provider.
    </div>
  );
}

function ProviderActions({ provider }: { readonly provider: ProviderRow }) {
  const connected = provider.status === "connected";

  if (provider.deviceFlowChoices.length === 0 && provider.apiKeyChoices.length === 0) {
    return (
      <button type="button" className="btn btn-sm" disabled>
        Connect
      </button>
    );
  }

  return (
    <div className="connections-actions">
      {provider.deviceFlowChoices.map((choice) => (
        <form action={startModelProviderDeviceFlowAction} key={choice.id}>
          <input type="hidden" name="providerId" value={provider.id} />
          <input type="hidden" name="authChoiceId" value={choice.id} />
          <button
            type="submit"
            className="btn btn-sm"
            aria-label={`${connected ? "Reconnect" : "Connect"} ${provider.label} with ${choice.label}`}
          >
            {connected ? "Reconnect OAuth" : "Connect OAuth"}
          </button>
        </form>
      ))}
      {provider.apiKeyChoices.map((choice) => (
        <details className="connections-key-form" key={choice.id}>
          <summary
            className="btn btn-sm"
            aria-label={`${connected ? "Rotate key for" : "Connect"} ${provider.label} with ${choice.label}`}
          >
            {connected ? "Rotate key" : "Connect API key"}
          </summary>
          <form action={connectModelProviderApiKeyAction}>
            <input type="hidden" name="providerId" value={provider.id} />
            <input type="hidden" name="authChoiceId" value={choice.id} />
            <label className="label" htmlFor={`${provider.id}-${choice.id}-key`}>
              Paste API key once
            </label>
            <input
              className="input"
              id={`${provider.id}-${choice.id}-key`}
              name="apiKey"
              type="password"
              autoComplete="off"
              required
            />
            <p className="hint">The key is sent only to the provisioning worker.</p>
            <button type="submit" className="btn btn-sm">
              Store in Gateway profile
            </button>
          </form>
        </details>
      ))}
      {connected ? (
        <form action={disconnectModelProviderAction}>
          <input type="hidden" name="providerId" value={provider.id} />
          <button type="submit" className="btn btn-ghost btn-sm">
            Disconnect
          </button>
        </form>
      ) : null}
    </div>
  );
}

function ProviderRowView({
  provider,
  notice,
}: {
  readonly provider: ProviderRow;
  readonly notice: ConnectionsNotice | null;
}) {
  return (
    <li className="connections-provider-row">
      <div>
        <div className="connections-provider-name">{provider.label}</div>
        <div className="connections-provider-sub">
          {provider.vendor} · <span className="u-mono">{provider.model}</span>
        </div>
      </div>
      <div className="connections-provider-meta">
        <div className="connections-provider-meta-row">
          <span className={providerStatusBadgeClassName(provider.status)}>
            <span className={provider.statusClassName} aria-hidden="true" />
            {provider.statusLabel}
          </span>
          <span className="badge">{providerAuthLabel(provider)}</span>
        </div>
        <ProviderBacks provider={provider} />
        {provider.accountLabel === null ? null : (
          <span className="u-subtle">{provider.accountLabel}</span>
        )}
        {provider.usageLabel === null ? null : <span>{provider.usageLabel}</span>}
        {provider.message === null ? null : <span className="hint">{provider.message}</span>}
      </div>
      <div className="connections-provider-state">
        <ProviderActions provider={provider} />
        <ProviderAdminNotice provider={provider} notice={notice} />
        {provider.pendingFlow === null ? null : (
          <DeviceFlowPoller
            flowId={provider.pendingFlow.flowId}
            verificationUri={provider.pendingFlow.verificationUri}
            userCode={provider.pendingFlow.userCode}
            intervalSeconds={provider.pendingFlow.intervalSeconds}
            expiresAt={provider.pendingFlow.expiresAt}
          />
        )}
      </div>
    </li>
  );
}

export default async function ConnectionsPage({ searchParams }: ConnectionsPageProps = {}) {
  const context = await getAppSessionContext();
  if (context === null) {
    redirect("/login");
  }

  const [params, result] = await Promise.all([searchParams, loadConnectionsPageData(context)]);
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
  const notice = noticeFromSearchParams(params);
  const githubPendingFlow =
    data.snapshot.pendingDeviceFlows.find((flow) => flow.kind === "github") ?? null;
  const connectedSubagentProviders = data.providers.filter(
    (provider) => provider.id !== "openai" && provider.status === "connected",
  );
  const sortedProviders = [...data.providers].sort((left, right) => {
    const statusRank = providerSortRank(left) - providerSortRank(right);
    return statusRank === 0 ? left.label.localeCompare(right.label) : statusRank;
  });
  const gatewayActive = data.snapshot.gateway.status === "active";
  const gatewayHeartbeat = relativeTime(data.snapshot.gateway.lastHeartbeatAt);
  const refreshedAt = relativeTime(data.snapshot.refreshedAt);

  return (
    <div className="page connections-page">
      <ConnectionsPageStyles />
      <div className="page-stack">
        <div className="page-header connections-header">
          <div>
            <h1>Connections</h1>
            <p className="page-sub">
              Live provider credentials and GitHub access. Keys never return to the browser.
            </p>
          </div>
          <div className="u-row connections-header-actions">
            <div className="connections-action-stack">
              <form action={refreshConnectionsAction}>
                <HealthCheckSubmitButton describedBy="connections-refresh-status" />
              </form>
              <p className="connections-refresh-status" id="connections-refresh-status">
                Snapshot updated {refreshedAt}
              </p>
            </div>
            <a href="#providers-lbl" className="btn btn-primary">
              Connect provider
            </a>
          </div>
        </div>

        <PageNotice notice={notice} refreshedAt={data.snapshot.refreshedAt} />

        <section className="connections-overview" aria-label="Gateway health summary">
          <div className="stat">
            <div className="stat-label">Model providers</div>
            <div className="stat-value u-tnum">{modelProviderCountLabel(data)}</div>
            <p className="stat-delta u-subtle">
              Counts only model providers from the live gateway catalog; GitHub and gateway health
              are separate.
            </p>
          </div>

          <div className="stat">
            <div className="stat-label">Opzava Gateway</div>
            <div className="u-row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
              <span className="stat-value">{gatewayActive ? "Active" : "Unavailable"}</span>
              <span
                className={gatewayActive ? "dot dot-success dot-beat" : "dot dot-warning"}
                aria-hidden="true"
              />
            </div>
            <p className="stat-delta u-subtle">
              Heartbeat {gatewayHeartbeat} · {data.providerSummary.total} providers in catalog
            </p>
          </div>
        </section>

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
                    <span className="badge">
                      <span className="u-sr-only">AI lead — </span>
                      <span className="u-accent" aria-hidden="true">
                        ✦
                      </span>
                      Lead orchestrator
                    </span>
                    {connectedSubagentProviders.length === 0 ? (
                      <span className="u-subtle">No connected subagent providers yet</span>
                    ) : (
                      connectedSubagentProviders.map((provider) => (
                        <span className="badge" key={provider.id}>
                          {provider.label}
                        </span>
                      ))
                    )}
                  </div>
                </dd>
              </dl>
            </div>
          </div>
        </section>

        <section aria-labelledby="providers-lbl">
          <div className="connections-provider-head">
            <div>
              <div className="section-label" id="providers-lbl" style={{ padding: 0 }}>
                Model providers
              </div>
              <h2>Provider connection status</h2>
              <p className="connections-provider-count">
                {modelProviderCountLabel(data)} · connected providers are shown first.
              </p>
            </div>
            <span className="badge">
              {data.providerSummary.needsAttention} need attention · {data.providerSummary.pending}{" "}
              pending
            </span>
          </div>

          {data.providers.length === 0 ? (
            <div className="empty connections-empty">
              <p className="empty-title">Provider catalog unavailable</p>
              <p className="empty-desc">
                Configure the provisioning worker to read the live Opzava Gateway auth-choice
                catalog.
              </p>
            </div>
          ) : (
            <ul className="connections-provider-list" aria-label="Model provider connections">
              {sortedProviders.map((provider) => (
                <ProviderRowView provider={provider} notice={notice} key={provider.id} />
              ))}
            </ul>
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
              <span
                className={
                  data.snapshot.github.status === "connected" ? "badge badge-success" : "badge"
                }
              >
                {data.snapshot.github.status === "connected" ? "Connected" : "Not connected"}
              </span>
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
                    ? "Connect GitHub to read granted scopes"
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
                  <button type="submit" className="btn btn-sm">
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

        <p className="connections-footer-note">
          Connection actions are provisioning/admin operations. The broker hot path cannot request
          provider secrets or operator.admin scopes.
        </p>
      </div>
    </div>
  );
}
