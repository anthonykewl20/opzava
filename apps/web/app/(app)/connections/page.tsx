import { redirect } from "next/navigation";

import {
  applyOrchestratorRolesAction,
  connectModelProviderApiKeyAction,
  disconnectGitHubAction,
  disconnectModelProviderAction,
  refreshConnectionsAction,
  startGitHubDeviceFlowAction,
  startModelProviderDeviceFlowAction,
} from "@/app/(app)/connections/actions";
import { DeviceFlowPoller } from "@/components/connections/device-flow-poller";
import { loadConnectionsPageData } from "@/lib/connections";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

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

  return (
    <div className="page connections-page">
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
                <span aria-hidden="true">↻</span>
                Run health check
              </button>
            </form>
            <a href="#model-providers" className="btn btn-primary">
              <span aria-hidden="true">+</span>
              Add connection
            </a>
          </div>
        </div>

        <section aria-label="Connection health summary">
          <div className="stat-grid connections-health">
            <div className="stat">
              <div className="stat-label">Connected</div>
              <div className="u-row connections-stat-row">
                <span className="stat-value u-tnum">{data.health.connected}</span>
                <span className="dot dot-success dot-beat" aria-hidden="true" />
              </div>
              <div className="stat-delta u-subtle">of {data.health.total} total</div>
            </div>
            <div className="stat">
              <div className="stat-label">Needs attention</div>
              <div className="u-row connections-stat-row">
                <span className="stat-value u-tnum">{data.health.needsAttention}</span>
                <span className="dot dot-warning" aria-hidden="true" />
              </div>
              <div className="stat-delta u-subtle">{data.health.pending} pending flows</div>
            </div>
            <div className="stat">
              <div className="stat-label">Gateway</div>
              <div className="u-row connections-stat-row">
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
                />
              </div>
              <div className="stat-delta u-subtle">
                {data.snapshot.gateway.region ?? "region unknown"}
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="gateway-heading">
          <div className="card connections-gateway-card">
            <div className="card-header">
              <h2 className="card-title" id="gateway-heading">
                OpenClaw gateway
              </h2>
              <span className="badge badge-accent">provisioning/admin path only</span>
            </div>
            <div className="card-body">
              <dl className="connections-dl">
                <dt>Status</dt>
                <dd>
                  <span className="u-row">
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
                <dt>Auth</dt>
                <dd>{data.snapshot.gateway.authLabel}</dd>
                <dt>Hosts</dt>
                <dd className="connections-badge-row">
                  <span className="badge">
                    <span className="u-accent" aria-hidden="true">
                      ✦
                    </span>{" "}
                    Lead orchestrator
                  </span>
                  {connectedSubagentProviders.map((provider) => (
                    <span className="badge" key={provider.id}>
                      {provider.label}
                    </span>
                  ))}
                </dd>
                <dt>Last heartbeat</dt>
                <dd className="u-mono">{relativeTime(data.snapshot.gateway.lastHeartbeatAt)}</dd>
                <dt>Message</dt>
                <dd>{data.snapshot.gateway.message ?? "Gateway reported healthy."}</dd>
              </dl>
            </div>
          </div>
        </section>

        <section aria-labelledby="model-providers" id="model-provider-section">
          <div className="connections-section-head">
            <div>
              <span className="conn-group-eyebrow">OpenClaw gateway</span>
              <h2 id="model-providers">Model providers</h2>
              <p>
                Catalog rows come from the provisioning worker's Gateway catalog query. API keys
                are paste-once; OAuth/device flows show code and poll status.
              </p>
            </div>
          </div>

          {data.providers.length === 0 ? (
            <div className="empty">
              <p className="empty-title">Gateway catalog unavailable</p>
              <p className="empty-desc">
                Configure the provisioning worker to read the live Gateway auth-choice catalog.
              </p>
            </div>
          ) : (
            <div className="connections-provider-grid">
              {data.providers.map((provider) => (
                <article className="card connections-provider-card" key={provider.id}>
                  <div className="card-header">
                    <div>
                      <h3 className="card-title">{provider.label}</h3>
                      <p className="hint">{provider.vendor}</p>
                    </div>
                    <span className="badge">{provider.roleLabel}</span>
                  </div>
                  <div className="card-body connections-provider-body">
                    <dl className="connections-dl">
                      <dt>Auth</dt>
                      <dd>{provider.authSummary}</dd>
                      <dt>Model</dt>
                      <dd className="u-mono">{provider.model}</dd>
                      <dt>Strength</dt>
                      <dd>{provider.strength}</dd>
                      <dt>When to use</dt>
                      <dd>{provider.whenToUse}</dd>
                      <dt>Status</dt>
                      <dd>
                        <span className="u-row">
                          <span className={provider.statusClassName} aria-hidden="true" />
                          {provider.statusLabel}
                        </span>
                      </dd>
                      <dt>Account</dt>
                      <dd>{provider.accountLabel ?? "not connected"}</dd>
                      <dt>Usage</dt>
                      <dd>{provider.usageLabel ?? "unknown until connected"}</dd>
                    </dl>

                    {provider.pendingFlow === null ? null : (
                      <DeviceFlowPoller
                        flowId={provider.pendingFlow.flowId}
                        verificationUri={provider.pendingFlow.verificationUri}
                        userCode={provider.pendingFlow.userCode}
                        intervalSeconds={provider.pendingFlow.intervalSeconds}
                        expiresAt={provider.pendingFlow.expiresAt}
                      />
                    )}

                    <ProviderActions
                      providerId={provider.id}
                      apiKeyChoices={provider.apiKeyChoices}
                      deviceFlowChoices={provider.deviceFlowChoices}
                      connected={provider.status === "connected"}
                    />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="roles-heading">
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title" id="roles-heading">
                  Orchestrator and subagents
                </h2>
                <p className="hint">
                  This writes delegation config only; task routing/run traces remain P1.
                </p>
              </div>
              <form action={applyOrchestratorRolesAction}>
                <button type="submit" className="btn btn-primary btn-sm">
                  Apply role config
                </button>
              </form>
            </div>
            <div className="card-body">
              <dl className="connections-dl connections-dl-wide">
                <dt>Delegation mode</dt>
                <dd>{data.orchestratorPlan.receipt.delegationMode}</dd>
                <dt>Allowed subagents</dt>
                <dd>
                  {data.orchestratorPlan.receipt.allowAgents.length === 0
                    ? "none connected"
                    : data.orchestratorPlan.receipt.allowAgents.join(", ")}
                </dd>
                <dt>Tool policy expansion</dt>
                <dd>{data.orchestratorPlan.receipt.toolPolicyExpansion.join(", ")}</dd>
              </dl>
              <table className="table table-compact table-cards connections-role-table">
                <caption className="u-sr-only">
                  Connected model provider roles for the Ask Opzava orchestrator.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Role</th>
                    <th scope="col">Model</th>
                    <th scope="col">Strength</th>
                    <th scope="col">When to use</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td data-label="Role">Lead orchestrator</td>
                    <td data-label="Model" className="u-mono">
                      {data.orchestratorPlan.agents.list[0]?.model ?? "openai/gpt-5.5"}
                    </td>
                    <td data-label="Strength">responsive coordination</td>
                    <td data-label="When to use">Ask Opzava front-door chat</td>
                  </tr>
                  {connectedSubagentProviders.map((provider) => (
                    <tr key={provider.id}>
                      <td data-label="Role">{provider.label} subagent</td>
                      <td data-label="Model" className="u-mono">
                        {provider.model}
                      </td>
                      <td data-label="Strength">{provider.strength}</td>
                      <td data-label="When to use">{provider.whenToUse}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section aria-labelledby="github-heading">
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
                      className={
                        data.snapshot.github.status === "connected"
                          ? "dot dot-success dot-beat"
                          : data.snapshot.github.status === "pending"
                            ? "dot dot-warning"
                            : "dot"
                      }
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

        <p className="hint">
          Connection actions are provisioning/admin operations. The broker hot path cannot request
          provider secrets or operator.admin scopes.
        </p>
      </div>
    </div>
  );
}
