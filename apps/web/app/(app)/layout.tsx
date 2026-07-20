import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { forbidden, redirect } from "next/navigation";

import { AppSidebar } from "@/components/shell/app-sidebar";
import {
  AskOpzavaAgentStatus,
  CommandPalette,
  TopbarRouteSearchOrBreadcrumb,
} from "@/components/shell/command-palette";
import { NotificationBell } from "@/components/shell/notification-bell";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { UserMenu } from "@/components/shell/user-menu";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { admitsAdminControlCenter, buildAdminNavModel } from "@/lib/admin-registry";
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

  if (!admitsAdminControlCenter(context.roleKeys)) {
    forbidden();
  }

  const navModel = buildAdminNavModel(context);
  const shellState = await loadAdminShellState(context);
  const sidebarCookie = (await cookies()).get("sidebar_state")?.value;

  return (
    <SidebarProvider
      defaultOpen={sidebarCookie !== "false"}
      style={
        {
          "--sidebar-width": "15.5rem",
          "--sidebar-width-icon": "4.25rem",
        } as CSSProperties
      }
    >
      <AppSidebar model={navModel} />
      <CommandPalette items={shellState.commandItems} />
      <SidebarInset id="main-content" tabIndex={-1} className="admin-shell-inset">
        <header className="header admin-shell-topbar">
          <SidebarTrigger
            className="admin-shell-trigger size-11 md:size-7"
            aria-label="Toggle Admin navigation"
          />

          <TopbarRouteSearchOrBreadcrumb model={navModel} />

          <div className="u-grow" />

          <AskOpzavaAgentStatus gatewayReachable={shellState.health.gatewayReachable} />

          <HealthPill state={shellState.health} />

          <NotificationBell />
          <ThemeToggle />
          <UserMenu context={context} />
        </header>

        <div className="main admin-shell-content">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
