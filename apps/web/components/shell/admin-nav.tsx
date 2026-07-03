"use client";

import { usePathname } from "next/navigation";

const operateItems: readonly {
  readonly label: string;
  readonly href?: string;
  readonly active?: boolean;
  readonly count?: string;
}[] = [
  { label: "Overview", href: "/" },
  { label: "Agents", active: false, count: "0" },
  { label: "Tasks", href: "/tasks" },
  { label: "Issues", href: "/issues" },
  { label: "Activity", active: false },
  { label: "Messages", active: false }
] as const;

const observeItems = ["Monitoring", "Logs", "Costs"] as const;
const automateItems = ["Connections", "Automation"] as const;
const governItems = ["Security & Audit", "Memory & Skills", "Alerts", "Settings"] as const;

function RailItem({
  label,
  href,
  active,
  count
}: {
  readonly label: string;
  readonly href?: string;
  readonly active?: boolean;
  readonly count?: string;
}) {
  const className = active ? "rail-item active" : "rail-item";
  const content = (
    <>
      <span className="ico" aria-hidden="true">
        {label.slice(0, 1)}
      </span>
      <span>{label}</span>
      {count !== undefined ? <span className="count">{count}</span> : null}
    </>
  );

  if (href === undefined) {
    return (
      <span className={className} aria-disabled="true">
        {content}
      </span>
    );
  }

  return (
    <a className={className} href={href} aria-current={active ? "page" : undefined}>
      {content}
    </a>
  );
}

function RailSection({
  label,
  items
}: {
  readonly label: string;
  readonly items: readonly string[];
}) {
  return (
    <>
      <div className="section-label">{label}</div>
      {items.map((item) => (
        <RailItem key={item} label={item} />
      ))}
    </>
  );
}

export function AdminNav() {
  const pathname = usePathname();

  return (
    <aside className="rail" aria-label="Main navigation">
      <div className="rail-head">
        <span
          className="rail-logo"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--accent)",
            color: "var(--accent-fg)",
            fontWeight: "var(--fw-semibold)"
          }}
          aria-hidden="true"
        >
          ◆
        </span>
        <span style={{ fontWeight: "var(--fw-semibold)", fontSize: "var(--text-base)" }}>
          Opzava
        </span>
        <span className="u-subtle" style={{ marginLeft: "auto", fontSize: "var(--text-xs)" }}>
          admin
        </span>
      </div>

      <nav className="rail-nav" aria-label="Application sections">
        <RailItem
          label="Ask Opzava"
          href="/ask-opzava"
          active={pathname.startsWith("/ask-opzava")}
        />

        <div className="section-label">Operate</div>
        {operateItems.map((item) => (
          <RailItem
            key={item.label}
            {...item}
            active={
              item.href === "/"
                ? pathname === "/"
                : item.href !== undefined && pathname.startsWith(item.href)
            }
          />
        ))}

        <div className="section-label">Projects</div>
        <span className="rail-item u-subtle" aria-disabled="true">
          <span className="ico" aria-hidden="true">
            -
          </span>
          Admin workspace
        </span>

        <RailSection label="Observe" items={observeItems} />
        <RailSection label="Automate" items={automateItems} />
        <RailSection label="Govern" items={governItems} />
      </nav>

      <div className="rail-foot">
        <button type="button" className="search" style={{ width: "100%", maxWidth: "none" }} disabled>
          <span aria-hidden="true">/</span>
          <span className="u-subtle u-grow">Jump to...</span>
          <kbd className="kbd">Ctrl K</kbd>
        </button>
      </div>
    </aside>
  );
}
