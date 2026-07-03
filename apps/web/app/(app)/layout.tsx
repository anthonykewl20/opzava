import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AdminNav } from "@/components/shell/admin-nav";
import { NotificationBell } from "@/components/shell/notification-bell";
import { SidebarToggle } from "@/components/shell/sidebar-toggle";
import { ThemeToggle } from "@/components/shell/theme-toggle";
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
    <div className="app">
      <AdminNav />
      <div className="main-col">
        <header className="header">
          <SidebarToggle />

          <div className="search" role="search">
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              style={{ flex: "none" }}
            >
              <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="u-grow u-subtle">Search agents, tasks, runs…</span>
            <kbd className="kbd">⌘K</kbd>
          </div>

          <div className="u-grow" />

          <ThemeToggle />

          <div className="health-pill" aria-label="System health: All systems healthy">
            <span className="dot dot-success" aria-hidden="true" />
            All systems healthy
          </div>

          <NotificationBell />
          <UserMenu context={context} />
        </header>

        <main className="main">{children}</main>
      </div>
    </div>
  );
}
