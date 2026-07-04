import { CrmPageStyles } from "@/app/(app)/crm/_components/crm-page-styles";

export default function CrmLoading() {
  return (
    <>
      <CrmPageStyles />
      <div className="page crm-page">
        <div className="crm-page-stack page-stack">
          <div className="card crm-state-card">
            <div className="empty" role="status">
              <p className="empty-title">Loading CRM workspace</p>
              <p className="empty-desc">Fetching the latest records for this workspace.</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
