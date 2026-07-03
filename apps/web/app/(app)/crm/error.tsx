"use client";

import { CrmPageStyles } from "@/app/(app)/crm/_components/crm-page-styles";

export default function CrmError({
  error,
  reset,
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}) {
  return (
    <>
      <CrmPageStyles />
      <div className="page crm-page">
        <div className="crm-page-stack page-stack">
          <div className="card crm-state-card">
            <div className="error-state" role="alert">
              <p className="empty-title">CRM could not load</p>
              <p className="empty-desc">{error.message || "Refresh and try again."}</p>
              <button className="btn btn-primary" type="button" onClick={reset}>
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
