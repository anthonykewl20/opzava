"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";

import { RailCommandSearch } from "@/components/shell/command-palette";

interface AdminNavState {
  readonly openTasksCount: number | null;
  readonly openIssuesCount: number | null;
  readonly askOpzavaActive: boolean;
  readonly connectionsConnected: boolean;
  readonly connections: {
    readonly gatewayActive: boolean;
    readonly providersConnected: number;
    readonly providersTotal: number;
    readonly githubConnected: boolean;
  };
}

interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly icon: IconName;
  readonly count?: string;
  readonly status?: "warning" | "success";
  readonly itemStyle?: CSSProperties;
  readonly statusLabel?: string;
}

type IconName =
  | "ask"
  | "overview"
  | "tasks"
  | "issues"
  | "contacts"
  | "accounts"
  | "deals"
  | "tickets"
  | "connections";

const operateItems: readonly NavItem[] = [
  { label: "Overview", href: "/", icon: "overview" },
  { label: "Tasks", href: "/tasks", icon: "tasks" },
  { label: "Issues", href: "/issues", icon: "issues" },
] as const;

const crmItems: readonly NavItem[] = [
  { label: "Contacts", href: "/crm/contacts", icon: "contacts" },
  { label: "Accounts", href: "/crm/accounts", icon: "accounts" },
  { label: "Deals", href: "/crm/deals", icon: "deals" },
  { label: "Tickets", href: "/crm/tickets", icon: "tickets" },
] as const;

function countBadge(count: number | null): string | undefined {
  return count !== null && count > 0 ? String(count) : undefined;
}

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavIcon({ icon }: { readonly icon: IconName }) {
  if (icon === "ask") {
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

  if (icon === "overview") {
    return (
      <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect x="2" y="2" width="6" height="6" rx="1.5" fill="currentColor" opacity=".9" />
        <rect x="10" y="2" width="6" height="6" rx="1.5" fill="currentColor" opacity=".5" />
        <rect x="2" y="10" width="6" height="6" rx="1.5" fill="currentColor" opacity=".5" />
        <rect x="10" y="10" width="6" height="6" rx="1.5" fill="currentColor" opacity=".5" />
      </svg>
    );
  }

  if (icon === "tasks") {
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

  if (icon === "issues" || icon === "tickets") {
    return (
      <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="9" cy="9" r="1.75" fill="currentColor" />
      </svg>
    );
  }

  if (icon === "contacts") {
    return (
      <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M3 16c0-3.314 2.686-6 6-6s6 2.686 6 6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (icon === "accounts") {
    return (
      <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect x="3" y="4" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M6 7h6M6 10h6M6 13h3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (icon === "deals") {
    return (
      <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 5.5v5l3 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

function RailItem({ item, pathname }: { readonly item: NavItem; readonly pathname: string }) {
  const active = isActive(pathname, item.href);

  return (
    <a
      href={item.href}
      className="rail-item"
      style={item.itemStyle}
      aria-current={active ? "page" : undefined}
    >
      <NavIcon icon={item.icon} /> {item.label}
      {item.count !== undefined ? <span className="count">{item.count}</span> : null}
      {item.status !== undefined ? (
        <span
          className={`dot dot-${item.status} dot-beat`}
          style={{ marginLeft: "auto" }}
          aria-label={item.statusLabel}
        />
      ) : null}
    </a>
  );
}

function RailSection({
  label,
  items,
  pathname,
}: {
  readonly label: string;
  readonly items: readonly NavItem[];
  readonly pathname: string;
}) {
  return (
    <>
      <div className="section-label nav-section-gap">{label}</div>
      {items.map((item) => (
        <RailItem key={item.href} item={item} pathname={pathname} />
      ))}
    </>
  );
}

function ConnectionsRailGroup({
  connectionsConnected,
  connections,
  pathname,
}: {
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

  const subItems: readonly (NavItem & { readonly statusLabel?: string })[] = [
    { label: "Overview", href: "/connections", icon: "connections" },
    {
      label: "Gateway",
      href: "/connections/gateway",
      icon: "connections",
      status: connections.gatewayActive ? "success" : "warning",
      statusLabel: connections.gatewayActive ? "Gateway active" : "Gateway unavailable",
    },
    {
      label: "Model Providers",
      href: "/connections/providers",
      icon: "connections",
      count: `${connections.providersConnected}/${connections.providersTotal}`,
    },
    ...(connections.githubConnected
      ? [
          {
            label: "GitHub",
            href: "/connections/github",
            icon: "connections" as const,
            status: "success" as const,
            statusLabel: "GitHub connected",
          },
        ]
      : []),
    { label: "+ Add integration", href: "/connections/add", icon: "connections" },
  ];

  return (
    <div className="rail-disclosure">
      <button
        type="button"
        className={`rail-item${inConnections ? " active" : ""}`}
        aria-expanded={expanded}
        aria-controls="connections-rail-subtree"
        onClick={() => setExpanded((current) => !current)}
      >
        <NavIcon icon="connections" /> Connections
        {connectionsConnected ? (
          <span
            className="dot dot-success dot-beat"
            style={{ marginLeft: "auto" }}
            aria-label="Connected provider or GitHub account available"
          />
        ) : null}
      </button>
      {expanded ? (
        <div id="connections-rail-subtree" className="rail-subitems">
          {subItems.map((item) => {
            const active = pathname === item.href;
            return (
              <a
                key={item.href}
                href={item.href}
                className="rail-item rail-subitem"
                aria-current={active ? "page" : undefined}
              >
                {item.label}
                {item.count !== undefined ? <span className="count">{item.count}</span> : null}
                {item.status !== undefined ? (
                  <span
                    className={`dot dot-${item.status} dot-beat`}
                    style={{ marginLeft: "auto" }}
                    aria-label={item.statusLabel}
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
  const liveOperateItems = operateItems.map((item) => {
    if (item.href === "/tasks") {
      const count = countBadge(state.openTasksCount);
      return count === undefined ? item : { ...item, count };
    }

    if (item.href === "/issues") {
      const count = countBadge(state.openIssuesCount);
      return count === undefined ? item : { ...item, count };
    }

    return item;
  });
  const askOpzavaItem: NavItem = {
    label: "Ask Admin Opzava",
    href: "/ask-opzava",
    icon: "ask",
    ...(state.askOpzavaActive
      ? {
          status: "warning" as const,
          statusLabel: "Assistant turn in progress",
        }
      : {}),
    itemStyle: { marginBottom: 4 },
  };

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
        <RailItem item={askOpzavaItem} pathname={pathname} />

        <div className="section-label">Operate</div>
        {liveOperateItems.map((item) => (
          <RailItem key={item.href} item={item} pathname={pathname} />
        ))}

        <RailSection label="CRM" items={crmItems} pathname={pathname} />
        <div className="section-label nav-section-gap">Automate</div>
        <ConnectionsRailGroup
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
