export default function CrmForbidden() {
  return (
    <div className="page">
      <div className="page-stack">
        <div className="card">
          <div className="error-state" role="alert">
            <p className="empty-title">403</p>
            <p className="empty-desc">You are not allowed to manage CRM records.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
