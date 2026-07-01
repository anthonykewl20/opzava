export const dynamic = "force-dynamic";

export default function AdminHomePage() {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Admin home</h1>
          <p className="page-sub">Authenticated admin workspace</p>
        </div>
      </div>

      <section className="card" aria-labelledby="admin-home-heading">
        <div className="card-header">
          <h2 className="card-title" id="admin-home-heading">
            Workspace context
          </h2>
          <span className="badge badge-accent">Slice 1d</span>
        </div>
        <div className="card-body">
          <p className="u-muted">
            Your active organization and workspace context are shown in the top bar.
          </p>
        </div>
      </section>
    </div>
  );
}
