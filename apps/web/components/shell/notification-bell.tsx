"use client";

import { useEffect, useRef, useState } from "react";

const notifyPopoverCss = `
#notify-pop{position:fixed;z-index:9999;width:380px;max-width:calc(100vw - 24px);max-height:min(72vh,580px);overflow:auto;display:none;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);padding:0}
#notify-pop[data-open="true"]{display:block}
#notify-pop .np-hd{display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);padding:var(--space-4) var(--space-4) var(--space-3);border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--surface)}
#notify-pop .np-hd strong{font-size:var(--text-sm);color:var(--fg);font-weight:var(--fw-semibold)}
#notify-pop .np-hd a{font-size:var(--text-xs);color:var(--fg-muted);text-decoration:none}
#notify-pop .np-hd a:hover{color:var(--accent)}
#notify-pop .np-ft{padding:var(--space-3) var(--space-4);border-top:1px solid var(--border);text-align:center;position:sticky;bottom:0;background:var(--surface)}
#notify-pop .np-ft a{font-size:var(--text-sm);color:var(--fg-muted);text-decoration:none;font-weight:var(--fw-medium)}
#notify-pop .np-ft a:hover{color:var(--accent)}
#notify-pop .np-arrow,#notify-arrow.np-arrow{position:fixed;width:12px;height:12px;background:var(--surface);border-left:1px solid var(--border);border-top:1px solid var(--border);transform:rotate(45deg);z-index:10000;display:none}
#notify-pop[data-open="true"] ~ #notify-arrow{display:block}
`;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const bellRef = useRef<HTMLAnchorElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (document.getElementById("notify-popover-style")) return;

    const style = document.createElement("style");
    style.id = "notify-popover-style";
    style.textContent = notifyPopoverCss;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    if (!open) return;

    function place() {
      const bell = bellRef.current;
      const popover = popoverRef.current;
      const arrow = arrowRef.current;
      if (!bell || !popover || !arrow) return;

      const rect = bell.getBoundingClientRect();
      const width = Math.min(380, window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
      popover.style.left = `${left}px`;
      popover.style.top = `${rect.bottom + 11}px`;
      popover.style.width = `${width}px`;
      arrow.style.top = `${rect.bottom + 5}px`;
      arrow.style.left = `${Math.max(
        left + 12,
        Math.min(rect.left + rect.width / 2 - 6, left + width - 24),
      )}px`;
    }

    function closeOnOutsideClick(event: MouseEvent) {
      const target = event.target;
      const bell = bellRef.current;
      const popover = popoverRef.current;
      if (!(target instanceof Node) || !bell || !popover) return;
      if (!popover.contains(target) && target !== bell && !bell.contains(target)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        bellRef.current?.focus();
      }
    }

    place();
    document.addEventListener("click", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", place);

    return () => {
      document.removeEventListener("click", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  return (
    <div className="notif-btn-wrap">
      <a
        ref={bellRef}
        href="/notifications"
        className="btn btn-ghost btn-icon"
        aria-label="Notifications, 0 unread"
        aria-haspopup="dialog"
        aria-expanded={open ? "true" : "false"}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path
            d="M9 2a5 5 0 0 1 5 5v3l1.5 2H2.5L4 10V7a5 5 0 0 1 5-5z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M7 14.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </a>
      <span className="u-sr-only">0 unread notifications</span>

      <div
        ref={popoverRef}
        className="sb-popover"
        id="notify-pop"
        role="dialog"
        aria-label="Notifications"
        data-open={open ? "true" : "false"}
        style={open ? undefined : { display: "none" }}
      >
        <div className="np-hd">
          <strong>Notifications</strong>
          <a href="/tasks">See tasks</a>
        </div>
        {/* DESCOPE(notify-bell): backing feed arrives with P2 hub. */}
        <div className="empty" role="status" aria-live="polite">
          <div className="empty-icon" aria-hidden="true">
            ✓
          </div>
          <p className="empty-title">All caught up</p>
          <p className="empty-desc">
            No notifications to show. New alerts and events will appear here as they occur.
          </p>
        </div>
        <div className="np-ft">
          <a href="/tasks">See all notifications →</a>
        </div>
      </div>
      <span ref={arrowRef} id="notify-arrow" className="np-arrow" aria-hidden="true" />
    </div>
  );
}
