import Link from "next/link";

import { startGitHubDeviceFlowAction } from "@/app/(app)/connections/actions";
import { requireConnectionsPageData } from "@/app/(app)/connections/_lib/page-data";
import { DeviceFlowPoller } from "@/components/connections/device-flow-poller";

export default async function AddConnectionPage() {
  const data = await requireConnectionsPageData();
  const githubConnected = data.snapshot.github.status === "connected";
  const githubPendingFlow =
    data.snapshot.pendingDeviceFlows.find((flow) => flow.kind === "github") ?? null;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Add integration</h1>
          <p className="page-sub">Connect another supported integration to this workspace.</p>
        </div>
      </div>

      <section aria-labelledby="connections-add-heading">
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title" id="connections-add-heading">
                Integration catalog
              </h2>
              <p className="hint">Available integrations that can be connected now.</p>
            </div>
          </div>
          <div className="card-body">
            {githubConnected ? (
              <div className="empty">
                <h3 className="empty-title">All available integrations are connected</h3>
                <p className="empty-desc">
                  GitHub now lives in the connected integrations rail and detail page.
                </p>
                <div className="empty-cta">
                  <Link className="btn btn-sm" href="/connections/github">
                    Manage GitHub
                  </Link>
                </div>
              </div>
            ) : (
              <div
                className="connections-provider-card"
                role="list"
                aria-label="Available integrations"
              >
                <div className="connections-provider-body" role="listitem">
                  <div>
                    <div className="u-row">
                      <span className="dot" aria-hidden="true" />
                      <strong>GitHub</strong>
                      <span className="badge">Available</span>
                    </div>
                    <p className="hint">
                      Connect GitHub to sync issues from {data.snapshot.github.repository}.
                    </p>
                  </div>

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
                        Connect GitHub
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* DESCOPE(agent-tools-mcp): P8 PRD-013 omits operator-owned tool and MCP inventory rows until those resources have a live backend seam. */}
      {/* DESCOPE(channels-services): P8 PRD-013 omits publishing and messaging channel rows until channel connection state is live. */}
    </>
  );
}
