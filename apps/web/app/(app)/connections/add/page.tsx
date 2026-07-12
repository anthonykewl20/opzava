import { requireConnectionsPageData } from "@/app/(app)/connections/_lib/page-data";

export default async function AddConnectionPage() {
  await requireConnectionsPageData();

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
              <p className="hint">
                The full catalog is moving here in the next Connections stage.
              </p>
            </div>
          </div>
          <div className="card-body">
            <p className="connections-card-copy">
              GitHub is available from its dedicated connection page while the catalog route is
              being introduced.
            </p>
          </div>
        </div>
      </section>

      {/* DESCOPE(agent-tools-mcp): P8 PRD-013 omits operator-owned tool and MCP inventory rows until those resources have a live backend seam. */}
      {/* DESCOPE(channels-services): P8 PRD-013 omits publishing and messaging channel rows until channel connection state is live. */}
    </>
  );
}
