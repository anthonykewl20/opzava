"use client";

import {
  Activity,
  Blocks,
  BookOpenCheck,
  Bot,
  Boxes,
  Cable,
  ChartNoAxesCombined,
  ChevronDown,
  Cpu,
  HeartPulse,
  Kanban,
  KeyRound,
  LayoutDashboard,
  Network,
  Plug,
  ScrollText,
  Settings,
  ShieldCheck,
  Siren,
  Sparkles,
  WandSparkles,
  Waypoints,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import type { AdminDestination, AdminNavModel } from "@/lib/admin-registry";
import {
  ADMIN_GROUP_STATE_STORAGE_KEY,
  repairAdminGroupOpenState,
  type AdminGroupOpenState,
} from "@/lib/admin-sidebar-state";

const NAVIGABLE = new Set(["/", "/ask-opzava", "/dev-board"]);

const destinationIcons: Readonly<Record<string, LucideIcon>> = {
  Activity,
  Blocks,
  BookOpenCheck,
  Bot,
  Boxes,
  Cable,
  ChartNoAxesCombined,
  Cpu,
  HeartPulse,
  Kanban,
  KeyRound,
  LayoutDashboard,
  Network,
  Plug,
  ScrollText,
  Settings,
  ShieldCheck,
  Siren,
  Sparkles,
  WandSparkles,
  Workflow,
};

function isActiveRoute(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function focusRouteTarget(): void {
  const target = document.querySelector(
    "#main-content h1, #main-content [data-route-focus-target], #main-content",
  );
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (!target.hasAttribute("tabindex")) {
    target.setAttribute("tabindex", "-1");
  }
  target.focus({ preventScroll: true });
}

function readPersistedGroupState(): string | null {
  try {
    return window.localStorage.getItem(ADMIN_GROUP_STATE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistGroupState(state: AdminGroupOpenState): void {
  try {
    window.localStorage.setItem(ADMIN_GROUP_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The shell remains usable when per-device storage is unavailable.
  }
}

function Brand() {
  return (
    <div className="flex h-[var(--header-h)] items-center gap-2 overflow-hidden px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
      <svg
        className="size-[30px] shrink-0 rounded-lg"
        viewBox="0 0 30 30"
        fill="none"
        aria-hidden="true"
      >
        <rect width="30" height="30" rx="8" fill="var(--accent)" />
        <path
          d="M8 15h6m0 0 3.5-4.5M14 15l3.5 4.5"
          stroke="var(--accent-fg)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="22" cy="15" r="2.2" fill="var(--accent-fg)" />
      </svg>
      <span className="truncate text-base font-semibold tracking-[-0.02em] group-data-[collapsible=icon]:hidden">
        Opzava
      </span>
    </div>
  );
}

function DestinationIcon({ destination }: { readonly destination: AdminDestination }) {
  const Icon = destinationIcons[destination.icon] ?? LayoutDashboard;
  return <Icon aria-hidden="true" />;
}

function DestinationItem({
  destination,
  pathname,
  onNavigate,
}: {
  readonly destination: AdminDestination;
  readonly pathname: string;
  readonly onNavigate: (destination: AdminDestination) => void;
}) {
  const navigable = NAVIGABLE.has(destination.href);
  const active = isActiveRoute(pathname, destination.href);

  return (
    <SidebarMenuItem>
      {navigable ? (
        <SidebarMenuButton
          asChild
          isActive={active}
          tooltip={destination.label}
          variant={destination.group === "pinned" ? "outline" : "default"}
          size={destination.group === "pinned" ? "lg" : "default"}
        >
          <Link
            href={destination.href}
            aria-label={destination.label}
            aria-current={active ? "page" : undefined}
            onClick={() => onNavigate(destination)}
          >
            <DestinationIcon destination={destination} />
            <span>{destination.label}</span>
          </Link>
        </SidebarMenuButton>
      ) : (
        <SidebarMenuButton
          asChild
          tooltip={`${destination.label} — Soon`}
          className="cursor-not-allowed aria-disabled:pointer-events-auto"
        >
          <span aria-label={`${destination.label}, coming soon`} aria-disabled="true">
            <DestinationIcon destination={destination} />
            <span>{destination.label}</span>
          </span>
        </SidebarMenuButton>
      )}
      {!navigable ? (
        <SidebarMenuBadge className="bg-sidebar-accent text-[0.6875rem] text-sidebar-foreground/75">
          Soon
        </SidebarMenuBadge>
      ) : null}
    </SidebarMenuItem>
  );
}

export function AppSidebar({ model }: { readonly model: AdminNavModel }) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile, state } = useSidebar();
  const routeFocusRequested = useRef(false);
  const [openGroups, setOpenGroups] = useState<AdminGroupOpenState>(() =>
    repairAdminGroupOpenState(null, model.groups),
  );

  useEffect(() => {
    const repaired = repairAdminGroupOpenState(readPersistedGroupState(), model.groups);
    setOpenGroups(repaired);
    persistGroupState(repaired);
  }, [model.groups]);

  useEffect(() => {
    if (!routeFocusRequested.current) {
      return;
    }

    routeFocusRequested.current = false;
    window.requestAnimationFrame(focusRouteTarget);
  }, [pathname]);

  const setGroupOpen = (group: string, open: boolean) => {
    setOpenGroups((current) => {
      const repaired = repairAdminGroupOpenState(
        JSON.stringify({ ...current, [group]: open }),
        model.groups,
      );
      persistGroupState(repaired);
      return repaired;
    });
  };

  const handleNavigate = (destination: AdminDestination) => {
    if (!isMobile) {
      return;
    }

    setOpenMobile(false);
    if (isActiveRoute(pathname, destination.href)) {
      window.requestAnimationFrame(focusRouteTarget);
    } else {
      routeFocusRequested.current = true;
    }
  };

  return (
    <Sidebar variant="sidebar" collapsible="icon" aria-label="Admin navigation">
      <SidebarHeader className="border-b border-sidebar-border p-1">
        <Brand />
      </SidebarHeader>

      <SidebarContent className="gap-0 px-1 py-2">
        <SidebarGroup className="pb-1 pt-0">
          <SidebarGroupContent>
            <SidebarMenu>
              {model.pinned.map((destination) => (
                <DestinationItem
                  key={destination.id}
                  destination={destination}
                  pathname={pathname}
                  onNavigate={handleNavigate}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <nav aria-label="Admin sections">
          {model.groups.map((group) => {
            const groupOpen =
              state === "collapsed" && !isMobile ? true : (openGroups[group.group] ?? true);

            return (
              <Collapsible
                key={group.group}
                open={groupOpen}
                onOpenChange={(open) => setGroupOpen(group.group, open)}
                className="group/collapsible"
              >
                <SidebarGroup className="py-1">
                  <SidebarGroupLabel asChild>
                    <CollapsibleTrigger
                      aria-label={`Toggle ${group.label} navigation group`}
                      className="w-full cursor-pointer uppercase tracking-[var(--tracking-caps)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden"
                    >
                      <span>{group.label}</span>
                      <ChevronDown
                        className="ml-auto transition-transform group-data-[state=closed]/collapsible:-rotate-90"
                        aria-hidden="true"
                      />
                    </CollapsibleTrigger>
                  </SidebarGroupLabel>
                  <CollapsibleContent>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {group.destinations.map((destination) => (
                          <DestinationItem
                            key={destination.id}
                            destination={destination}
                            pathname={pathname}
                            onNavigate={handleNavigate}
                          />
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </CollapsibleContent>
                </SidebarGroup>
              </Collapsible>
            );
          })}
        </nav>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="px-2 text-[0.6875rem] font-semibold uppercase tracking-[var(--tracking-caps)] text-sidebar-foreground/65 group-data-[collapsible=icon]:hidden">
          Migrating
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            {/* Temporary rollout bridge until Configure destinations replace legacy live ops. */}
            <SidebarMenuButton
              asChild
              isActive={pathname.startsWith("/connections")}
              tooltip="Connections (legacy)"
            >
              <Link
                href="/connections"
                aria-label="Connections (legacy)"
                aria-current={pathname.startsWith("/connections") ? "page" : undefined}
                onClick={() => {
                  if (isMobile) {
                    setOpenMobile(false);
                    if (pathname.startsWith("/connections")) {
                      window.requestAnimationFrame(focusRouteTarget);
                    } else {
                      routeFocusRequested.current = true;
                    }
                  }
                }}
              >
                <Waypoints aria-hidden="true" />
                <span>Connections</span>
              </Link>
            </SidebarMenuButton>
            <SidebarMenuBadge className="bg-sidebar-accent text-[0.6875rem] text-sidebar-foreground/75">
              Legacy
            </SidebarMenuBadge>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
