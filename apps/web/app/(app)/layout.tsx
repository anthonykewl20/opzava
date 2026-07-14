import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminNav } from "@/components/shell/admin-nav";
import {
  AskOpzavaAgentStatus,
  CommandPalette,
  TopbarRouteSearchOrBreadcrumb,
} from "@/components/shell/command-palette";
import { NotificationBell } from "@/components/shell/notification-bell";
import { SidebarToggle } from "@/components/shell/sidebar-toggle";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { UserMenu } from "@/components/shell/user-menu";
import { getAppSessionContext, isFirstOwnerSetupComplete } from "@/lib/session";
import { loadAdminShellState, type ShellHealthState } from "@/lib/shell-state";

export const dynamic = "force-dynamic";

function HealthPill({ state }: { readonly state: ShellHealthState }) {
  return (
    <Link
      href="/connections"
      className="health-pill"
      aria-label={state.ariaLabel}
      title={state.ariaLabel}
      data-health-status={state.status}
      data-health-attention-count={state.attentionCount}
      data-health-checked-at={state.checkedAt ?? ""}
    >
      <span className={state.dotClassName} aria-hidden="true" />
      {state.text}
    </Link>
  );
}

export default async function AppLayout({ children }: { readonly children: ReactNode }) {
  if (!(await isFirstOwnerSetupComplete())) {
    redirect("/setup");
  }

  const context = await getAppSessionContext();
  if (context === null) {
    redirect("/login");
  }

  const shellState = await loadAdminShellState(context);

  return (
    <div className="app">
      <AdminNav state={shellState.nav} />
      <CommandPalette items={shellState.commandItems} />
      <div className="main-col">
        <header className="header">
          <SidebarToggle />

          <TopbarRouteSearchOrBreadcrumb />

          <div className="u-grow" />

          <AskOpzavaAgentStatus gatewayReachable={shellState.health.gatewayReachable} />

          <ThemeToggle />

          <HealthPill state={shellState.health} />

          <NotificationBell />
          <UserMenu context={context} />
        </header>

        <main className="main">{children}</main>
      </div>
    </div>
  );
}
