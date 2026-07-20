"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";

import { RailCommandSearch } from "@/components/shell/command-palette";
import type { LegacyAdminNavItem, LegacyAdminNavModel } from "@/lib/admin-registry";

interface AdminNavState {
  readonly model: LegacyAdminNavModel;
  readonly openTasksCount: number | null;
  readonly openIssuesCount: number | null;
  readonly askOpzavaActive: boolean;
  readonly connectionsConnected: boolean;
  readonly connections: {
    readonly providersConnected: number;
    readonly providersTotal: number;
    readonly githubConnected: boolean;
  };
}

interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly icon: string;
  readonly count?: string;
  readonly status?: "warning" | "success";
  readonly itemStyle?: CSSProperties;
  readonly statusLabel?: string;
  /** Renders as the group's action row (accent) rather than another destination. */
  readonly action?: boolean;
}

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function countBadge(count: number | null): string | undefined {
  return count !== null && count > 0 ? String(count) : undefined;
}

function NavIcon({ icon }: { readonly icon: string }) {
  if (icon === "Sparkles") {
    return (
      <span
        className="ico"
        aria-hidden="true"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--accent)",
          fontSize: 15,
        }}
      >
        ✦
      </span>
    );
  }

  if (icon === "LayoutDashboard") {
    return (
      <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect x="2" y="2" width="6" height="6" rx="1.5" fill="currentColor" opacity=".9" />
        <rect x="10" y="2" width="6" height="6" rx="1.5" fill="currentColor" opacity=".5" />
        <rect x="2" y="10" width="6" height="6" rx="1.5" fill="currentColor" opacity=".5" />
        <rect x="10" y="10" width="6" height="6" rx="1.5" fill="currentColor" opacity=".5" />
      </svg>
    );
  }

  if (icon === "Kanban") {
    return (
      <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path
          d="M3 5h12M3 9h8M3 13h10"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="14" cy="13" r="2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }

  if (icon === "CircleDot") {
    return (
      <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="9" cy="9" r="1.75" fill="currentColor" />
      </svg>
    );
  }

  if (icon === "Cpu") {
    return (
      <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M7.5 2.5V5M10.5 2.5V5M7.5 13v2.5M10.5 13v2.5M2.5 7.5H5M2.5 10.5H5M13 7.5h2.5M13 10.5h2.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (icon === "Workflow" || icon === "GitBranch") {
    return (
      <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="5" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="5" cy="13.5" r="2" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="13" cy="6.5" r="2" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M5 6.5v5M13 8.5c0 2-1.7 3-4 3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (icon === "Plus") {
    return (
      <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path
          d="M9 3.5v11M3.5 9h11"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="5" cy="9" r="2.3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="13" cy="9" r="2.3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7.3 9h3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { readonly expanded: boolean }) {
  return (
    <svg
      className={`rail-chevron${expanded ? " is-expanded" : ""}`}
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4.5 2.5 8 6l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RailItem({ item, pathname }: { readonly item: NavItem; readonly pathname: string }) {
  const active = isActive(pathname, item.href);

  return (
    <a
      href={item.href}
      className="rail-item"
      style={item.itemStyle}
      aria-current={active ? "page" : undefined}
    >
      <NavIcon icon={item.icon} />
      <span className="rail-label">{item.label}</span>
      {item.count !== undefined ? <span className="count">{item.count}</span> : null}
      {item.status !== undefined ? (
        <span className={`dot dot-${item.status} dot-beat`} aria-label={item.statusLabel} />
      ) : null}
    </a>
  );
}

function navItem(destination: LegacyAdminNavItem): NavItem {
  return {
    label: destination.label,
    href: destination.href,
    icon: destination.icon,
  };
}

function ConnectionsRailGroup({
  item,
  connectionsConnected,
  connections,
  pathname,
}: {
  readonly item: LegacyAdminNavItem | undefined;
  readonly connectionsConnected: boolean;
  readonly connections: AdminNavState["connections"];
  readonly pathname: string;
}) {
  const inConnections = pathname.startsWith("/connections");
  const [expanded, setExpanded] = useState(inConnections);

  useEffect(() => {
    if (inConnections) {
      setExpanded(true);
    }
  }, [inConnections]);

  if (item === undefined) {
    return null;
  }

  const activeHref = connectionRailActiveHref(pathname);
  const subItems: readonly NavItem[] = [
    { label: "Overview", href: "/connections", icon: "LayoutDashboard" },
    {
      label: "Model Providers",
      href: "/connections/providers",
      icon: "Cpu",
      count: `${connections.providersConnected}/${connections.providersTotal}`,
    },
    ...(connections.githubConnected
      ? [
          {
            label: "GitHub",
            href: "/connections/github",
            icon: "GitBranch",
            status: "success" as const,
            statusLabel: "GitHub connected",
          },
        ]
      : []),
    { label: "Add integration", href: "/connections/add", icon: "Plus", action: true },
  ];

  return (
    <div className="rail-group">
      <button
        type="button"
        className={`rail-item rail-group-toggle${inConnections ? " is-current" : ""}`}
        aria-expanded={expanded}
        aria-controls="connections-rail-subtree"
        onClick={() => setExpanded((current) => !current)}
      >
        <NavIcon icon={item.icon} />
        <span className="rail-label">{item.label}</span>
        {connectionsConnected && !expanded ? (
          <span
            className="dot dot-success dot-beat"
            aria-label="Connected provider or GitHub account available"
          />
        ) : null}
        <ChevronIcon expanded={expanded} />
      </button>
      {expanded ? (
        <div id="connections-rail-subtree" className="rail-subitems">
          {subItems.map((subItem) => {
            const active = activeHref === subItem.href;
            return (
              <a
                key={subItem.href}
                href={subItem.href}
                className={`rail-item rail-subitem${subItem.action === true ? " rail-action" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <NavIcon icon={subItem.icon} />
                <span className="rail-label">{subItem.label}</span>
                {subItem.count !== undefined ? (
                  <span className="count">{subItem.count}</span>
                ) : null}
                {subItem.status !== undefined ? (
                  <span
                    className={`dot dot-${subItem.status} dot-beat`}
                    aria-label={subItem.statusLabel}
                  />
                ) : null}
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function AdminNav({ state }: { readonly state: AdminNavState }) {
  const pathname = usePathname();
  const pinnedItems = state.model.pinned.map((destination) => ({
    ...navItem(destination),
    ...(state.askOpzavaActive && destination.sourceDestinationId === "ask-admin-opzava"
      ? {
          status: "warning" as const,
          statusLabel: "Assistant turn in progress",
        }
      : {}),
    itemStyle: { marginBottom: 4 },
  }));
  const operateItems = state.model.operate.map((item) => {
    const base = navItem(item);
    if (item.id === "tasks") {
      const count = countBadge(state.openTasksCount);
      return count === undefined ? base : { ...base, count };
    }

    if (item.id === "issues") {
      const count = countBadge(state.openIssuesCount);
      return count === undefined ? base : { ...base, count };
    }

    return base;
  });

  return (
    <aside className="rail" aria-label="Main navigation">
      <div className="rail-head">
        <svg className="rail-logo" viewBox="0 0 26 26" fill="none" aria-hidden="true">
          <rect width="26" height="26" rx="6" fill="var(--accent)" />
          <path
            d="M7 13h5m0 0 3-4m-3 4 3 4"
            stroke="var(--accent-fg)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="19" cy="13" r="2" fill="var(--accent-fg)" />
        </svg>
        <span
          style={{
            fontWeight: "var(--fw-semibold)",
            fontSize: "var(--text-base)",
            letterSpacing: "-.01em",
          }}
        >
          Opzava
        </span>
        <span className="u-subtle" style={{ fontSize: "var(--text-xs)", marginLeft: "auto" }}>
          v2.1
        </span>
      </div>

      <nav className="rail-nav" aria-label="Application sections">
        {pinnedItems.map((item) => (
          <RailItem key={item.href} item={item} pathname={pathname} />
        ))}
        <div className="section-label">Operate</div>
        {operateItems.map((item) => (
          <RailItem key={item.href} item={item} pathname={pathname} />
        ))}

        <div className="section-label nav-section-gap">Automate</div>
        <ConnectionsRailGroup
          item={state.model.automate[0]}
          connectionsConnected={state.connectionsConnected}
          connections={state.connections}
          pathname={pathname}
        />
      </nav>

      <div className="rail-foot">
        <RailCommandSearch />
      </div>
    </aside>
  );
}

export function connectionRailActiveHref(pathname: string): string | null {
  if (
    pathname === "/connections" ||
    pathname === "/connections/system" ||
    pathname.startsWith("/connections/system/")
  ) {
    return "/connections";
  }

  for (const href of [
    "/connections/providers",
    "/connections/github",
    "/connections/add",
  ] as const) {
    if (pathname === href || pathname.startsWith(`${href}/`)) return href;
  }

  return null;
}
