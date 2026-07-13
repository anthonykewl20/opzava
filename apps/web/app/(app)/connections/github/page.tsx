import {
  disconnectGitHubAction,
  startGitHubDeviceFlowAction,
} from "@/app/(app)/connections/actions";
import {
  PageNotice,
  noticeFromSearchParams,
} from "@/app/(app)/connections/_components/page-notice";
import {
  gatewayUnavailableCopy,
  githubStatusDotClass,
  requireConnectionsPageData,
} from "@/app/(app)/connections/_lib/page-data";
import { DeviceFlowPoller } from "@/components/connections/device-flow-poller";

interface GitHubConnectionsPageProps {
  readonly searchParams?: Promise<{
    readonly notice?: string;
    readonly provider?: string;
  }>;
}

export default async function GitHubConnectionsPage({ searchParams }: GitHubConnectionsPageProps) {
  const [params, data] = await Promise.all([searchParams, requireConnectionsPageData()]);
  const notice = noticeFromSearchParams(params);
  const startGitHubFromDetailAction = startGitHubDeviceFlowAction.bind(null, "/connections/github");
  const disconnectGitHubFromDetailAction = disconnectGitHubAction.bind(null, "/connections/github");
  const gatewayUnavailable =
    data.snapshot.gateway.status !== "active" || data.provisioningAvailable === false;
  const githubPendingFlow =
    data.snapshot.pendingDeviceFlows.find((flow) => flow.kind === "github") ?? null;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>GitHub</h1>
          <p className="page-sub">{data.githubSummary}</p>
        </div>
      </div>

      <PageNotice notice={notice} refreshedAt={data.snapshot.refreshedAt} />

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
            {gatewayUnavailable ? (
              <div className="connections-notice connections-notice-warning" role="status">
                <span className="dot dot-warning" aria-hidden="true" />
                <div>
                  <strong>{gatewayUnavailableCopy(data.snapshot.gateway)}</strong>
                  <p className="hint">
                    GitHub connection changes may be delayed until provisioning is available.
                  </p>
                </div>
              </div>
            ) : null}
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
              <form action={startGitHubFromDetailAction}>
                <button type="submit" className="btn btn-sm">
                  {data.snapshot.github.status === "connected" ? "Reconnect" : "Connect"} GitHub
                </button>
              </form>
              {data.snapshot.github.status === "connected" ? (
                <form action={disconnectGitHubFromDetailAction}>
                  <button type="submit" className="btn btn-ghost btn-sm">
                    Disconnect
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
