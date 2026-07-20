"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { usePathname, useRouter } from "next/navigation";

import type { LegacyAdminNavModel } from "@/lib/admin-registry";
import type { CommandPaletteItem } from "@/lib/shell-state";

const commandPaletteOpenEvent = "opzava:command-palette-open";

function SearchIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{ flex: "none", color: "var(--fg-subtle)" }}
    >
      <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function openCommandPalette() {
  window.dispatchEvent(new Event(commandPaletteOpenEvent));
}

export function TopbarCommandSearch() {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    openCommandPalette();
  };

  return (
    <div
      className="search command-trigger"
      role="search"
      tabIndex={0}
      aria-label="Open command palette (⌘K)"
      onClick={openCommandPalette}
      onKeyDown={handleKeyDown}
    >
      <SearchIcon />
      <span className="u-grow u-subtle">Search agents, tasks, runs…</span>
      <kbd className="kbd">⌘K</kbd>
    </div>
  );
}

export function TopbarRouteSearchOrBreadcrumb({ model }: { readonly model: LegacyAdminNavModel }) {
  const pathname = usePathname();
  const askAdmin = model.pinned.find(
    (destination) => destination.sourceDestinationId === "ask-admin-opzava",
  );

  if (askAdmin !== undefined && pathname.startsWith(askAdmin.href)) {
    return (
      <nav className="sb-breadcrumb" aria-label="Breadcrumb">
        <a href="/">Opzava</a>
        <span className="sep">›</span>
        <span className="current">{askAdmin.label}</span>
      </nav>
    );
  }

  return <TopbarCommandSearch />;
}

export function AskOpzavaAgentStatus({
  gatewayReachable,
}: {
  readonly gatewayReachable: boolean | null;
}) {
  const pathname = usePathname();
  if (!pathname.startsWith("/ask-opzava")) {
    return null;
  }

  const online = gatewayReachable === true;
  const label = online ? "online" : "offline";

  return (
    <div
      className="u-row"
      style={{ gap: "var(--space-2)", fontSize: "var(--text-xs)" }}
      aria-label={`Ask Admin Opzava stream: ${label}`}
      title={`Ask Admin Opzava stream: ${label}`}
    >
      <span className={online ? "dot dot-success live" : "dot dot-warning"} aria-hidden="true" />
      <span className="u-muted">
        <span style={{ color: "var(--accent)", fontWeight: "var(--fw-semibold)" }}>✦</span> {label}
      </span>
    </div>
  );
}

export function RailCommandSearch() {
  return (
    <button
      type="button"
      className="search command-trigger"
      style={{ width: "100%", maxWidth: "none" }}
      aria-label="Open command palette (⌘K)"
      onClick={openCommandPalette}
    >
      <SearchIcon />
      <span className="u-subtle u-grow">Jump to…</span>
      <kbd className="kbd">⌘K</kbd>
    </button>
  );
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function fuzzyScore(query: string, item: CommandPaletteItem): number | null {
  const normalizedQuery = normalize(query);
  if (normalizedQuery === "") {
    return 1;
  }

  const haystack = normalize(`${item.label} ${item.meta} ${item.kind}`);
  const index = haystack.indexOf(normalizedQuery);
  if (index >= 0) {
    return 100 - index;
  }

  let queryIndex = 0;
  let gapPenalty = 0;
  for (let index = 0; index < haystack.length && queryIndex < normalizedQuery.length; index += 1) {
    if (haystack[index] === normalizedQuery[queryIndex]) {
      queryIndex += 1;
    } else {
      gapPenalty += 1;
    }
  }

  return queryIndex === normalizedQuery.length ? 50 - gapPenalty : null;
}

function itemGlyph(kind: CommandPaletteItem["kind"]): string {
  if (kind === "task") {
    return "T";
  }

  if (kind === "issue") {
    return "#";
  }

  return "→";
}

function groupLabel(kind: CommandPaletteItem["kind"]): string {
  if (kind === "task") {
    return "Tasks";
  }

  if (kind === "issue") {
    return "Issues";
  }

  return "Destinations";
}

export function CommandPalette({ items }: { readonly items: readonly CommandPaletteItem[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const matches = useMemo(() => {
    return items
      .map((item) => ({ item, score: fuzzyScore(query, item) }))
      .filter(
        (entry): entry is { readonly item: CommandPaletteItem; readonly score: number } =>
          entry.score !== null,
      )
      .sort(
        (left, right) =>
          right.score - left.score || left.item.label.localeCompare(right.item.label),
      )
      .slice(0, 12)
      .map((entry) => entry.item);
  }, [items, query]);

  useEffect(() => {
    const openHandler = () => setOpen(true);
    const keyHandler = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };

    window.addEventListener(commandPaletteOpenEvent, openHandler);
    window.addEventListener("keydown", keyHandler);
    return () => {
      window.removeEventListener(commandPaletteOpenEvent, openHandler);
      window.removeEventListener("keydown", keyHandler);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    setQuery("");
    setSelectedIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const close = () => setOpen(false);

  const navigate = (item: CommandPaletteItem | undefined) => {
    if (item === undefined) {
      return;
    }

    close();
    if (item.external === true) {
      window.location.assign(item.href);
      return;
    }

    router.push(item.href);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((current) => (matches.length === 0 ? 0 : (current + 1) % matches.length));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((current) =>
        matches.length === 0 ? 0 : (current - 1 + matches.length) % matches.length,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      navigate(matches[selectedIndex]);
    }
  };

  if (!open) {
    return null;
  }

  let previousKind: CommandPaletteItem["kind"] | null = null;

  return (
    <div className="cmdk-overlay" role="presentation" onMouseDown={close}>
      <section
        className="cmdk-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="cmdk-input-row">
          <SearchIcon />
          <input
            ref={inputRef}
            className="cmdk-input"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search agents, tasks, runs…"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-results"
            aria-activedescendant={matches[selectedIndex]?.id}
          />
          <span className="cmdk-shortcut-badge">⌘K</span>
        </div>

        <div className="cmdk-results" id="command-palette-results" role="listbox">
          {matches.length === 0 ? (
            <div className="cmdk-group-label">No matches</div>
          ) : (
            matches.map((item, index) => {
              const showGroup = previousKind !== item.kind;
              previousKind = item.kind;
              return (
                <div key={item.id}>
                  {showGroup ? (
                    <div className="cmdk-group-label">{groupLabel(item.kind)}</div>
                  ) : null}
                  <button
                    className={index === selectedIndex ? "cmdk-item focused" : "cmdk-item"}
                    id={item.id}
                    role="option"
                    aria-selected={index === selectedIndex}
                    type="button"
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => navigate(item)}
                  >
                    <span className="cmdk-icon" aria-hidden="true">
                      {itemGlyph(item.kind)}
                    </span>
                    <span className="cmdk-label">{item.label}</span>
                    <span className="cmdk-meta">{item.meta}</span>
                    {index === selectedIndex ? <span className="cmdk-enter">↵</span> : null}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="cmdk-footer">
          <span className="cmdk-hint">
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            navigate
          </span>
          <span className="cmdk-hint">
            <kbd>↵</kbd>
            open
          </span>
          <span className="cmdk-hint">
            <kbd>esc</kbd>
            close
          </span>
        </div>
      </section>
    </div>
  );
}
