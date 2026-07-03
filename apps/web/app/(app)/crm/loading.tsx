export default function CrmLoading() {
  return (
    <div className="page">
      <div className="page-stack">
        <div className="card">
          <div className="empty" role="status">
            <p className="empty-title">Loading CRM workspace</p>
            <p className="empty-desc">Fetching the latest records for this workspace.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
