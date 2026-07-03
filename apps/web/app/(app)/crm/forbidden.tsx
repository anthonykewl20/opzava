import { CrmPageStyles } from "@/app/(app)/crm/_components/crm-page-styles";

export default function CrmForbidden() {
  return (
    <>
      <CrmPageStyles />
      <div className="page crm-page">
        <div className="crm-page-stack page-stack">
          <div className="card crm-state-card">
            <div className="error-state" role="alert">
              <p className="empty-title">403</p>
              <p className="empty-desc">You are not allowed to manage CRM records.</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
