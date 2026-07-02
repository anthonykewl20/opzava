import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AdminNav } from "@/components/shell/admin-nav";
import { UserMenu } from "@/components/shell/user-menu";
import { getAppSessionContext, isFirstOwnerSetupComplete } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { readonly children: ReactNode }) {
  if (!(await isFirstOwnerSetupComplete())) {
    redirect("/setup");
  }

  const context = await getAppSessionContext();
  if (context === null) {
    redirect("/login");
  }

  return (
    <div className="app" data-theme="dark">
      <AdminNav />
      <div className="main-col">
        <header className="header">
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Collapse sidebar" disabled>
            <span aria-hidden="true">=</span>
          </button>

          <div className="search" role="search" aria-label="Global search">
            <span aria-hidden="true">/</span>
            <span className="u-subtle u-grow">Search admin work...</span>
            <kbd className="kbd">Ctrl K</kbd>
          </div>

          <div className="u-grow" />

          <div className="health-pill" aria-label="Active organization and workspace">
            <span className="dot dot-success" aria-hidden="true" />
            <span>{context.organizationName}</span>
            <span className="u-subtle" aria-hidden="true">
              /
            </span>
            <span>{context.workspaceName}</span>
          </div>

          <div className="health-pill" aria-label={`Tenant state: ${context.organizationLifecycleState}`}>
            <span className="dot dot-accent live" aria-hidden="true" />
            <span>{context.organizationLifecycleState}</span>
          </div>

          <UserMenu context={context} />
        </header>

        <main className="main">{children}</main>
      </div>
    </div>
  );
}
