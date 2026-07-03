"use client";

import { useEffect, useRef, useState } from "react";

interface AccountMenuUser {
  readonly name: string;
  readonly email: string;
}

interface MenuPosition {
  readonly left: number;
  readonly top: number;
}

const accountMenuCss = `
#acct-menu{position:fixed;z-index:9997;min-width:248px;max-width:calc(100vw - 24px);display:none;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);padding:6px}
#acct-menu[data-open="true"]{display:block}
#acct-menu .am-hd{display:flex;align-items:center;gap:10px;padding:8px 8px 10px;margin-bottom:4px;border-bottom:1px solid var(--border)}
#acct-menu .am-av{width:38px;height:38px;flex:none;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:var(--fw-semibold);font-size:var(--text-sm)}
#acct-menu .am-nm{font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--fg);line-height:1.25}
#acct-menu .am-em{font-size:var(--text-xs);color:var(--fg-subtle);line-height:1.25}
#acct-menu .am-item{display:flex;align-items:center;gap:10px;padding:8px;border-radius:var(--radius-sm);text-decoration:none;color:var(--fg);font-size:var(--text-sm)}
#acct-menu .am-item:hover{background:var(--surface-2);text-decoration:none}
#acct-menu .am-g{width:18px;text-align:center;flex:none;color:var(--fg-muted)}
#acct-menu .am-note{margin-left:auto;font-size:var(--text-xs);color:var(--fg-subtle)}
#acct-menu .am-sep{height:1px;background:var(--border);margin:5px 2px}
#acct-menu .am-form{margin:0}
#acct-menu button.am-item{width:100%;border:0;background:none;font:inherit;cursor:pointer;text-align:left}
`;

function initials(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "O";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function shortName(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const first = parts[0] ?? "Account";
    const secondInitial = parts[1]?.slice(0, 1) ?? "";
    return `${first} ${secondInitial}.`;
  }

  return parts[0] ?? "Account";
}

export function AccountMenu({
  user,
  signOutAction,
}: {
  readonly user: AccountMenuUser;
  readonly signOutAction: (formData: FormData) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const userInitials = initials(user.name);

  useEffect(() => {
    if (document.getElementById("acct-menu-style")) return;

    const style = document.createElement("style");
    style.id = "acct-menu-style";
    style.textContent = accountMenuCss;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    if (!open) return;

    function place() {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const width = menu?.offsetWidth || 248;
      const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
      setPosition({ left, top: rect.bottom + 8 });
    }

    function closeOnOutsideClick(event: MouseEvent) {
      const target = event.target;
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!(target instanceof Node) || !trigger || !menu) return;
      if (!menu.contains(target) && target !== trigger && !trigger.contains(target)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    place();
    document.addEventListener("click", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);

    return () => {
      document.removeEventListener("click", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  function toggleMenu() {
    setOpen((current) => !current);
  }

  return (
    <>
      <div
        id="acctBtn"
        ref={triggerRef}
        className="header-avatar"
        role="button"
        tabIndex={0}
        aria-label={`Account menu — ${shortName(user.name)}`}
        aria-haspopup="menu"
        aria-expanded={open ? "true" : "false"}
        data-account-trigger=""
        style={{ cursor: "pointer" }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleMenu();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleMenu();
          }
        }}
      >
        {userInitials}
      </div>

      <div
        id="acct-menu"
        ref={menuRef}
        className="sb-menu"
        role="menu"
        aria-label="Account"
        data-open={open ? "true" : "false"}
        style={
          open && position !== null
            ? { left: position.left, top: position.top }
            : { display: "none" }
        }
      >
        <div className="am-hd">
          <span className="am-av" style={{ background: "var(--chart-2)" }} aria-hidden="true">
            {userInitials}
          </span>
          <div>
            <div className="am-nm">{user.name}</div>
            <div className="am-em">{user.email}</div>
          </div>
        </div>
        <a className="am-item" role="menuitem" href="/crm/contacts">
          <span className="am-g" aria-hidden="true">
            👤
          </span>
          View profile
        </a>
        <a className="am-item" role="menuitem" href="/connections">
          <span className="am-g" aria-hidden="true">
            🔗
          </span>
          Your tools
          <span className="am-note">5 / 7</span>
        </a>
        <a className="am-item" role="menuitem" href="/crm/accounts">
          <span className="am-g" aria-hidden="true">
            ⚙
          </span>
          Settings
        </a>
        <button className="am-item" role="menuitem" type="button" onClick={() => setOpen(false)}>
          <span className="am-g" aria-hidden="true">
            ◐
          </span>
          Appearance
        </button>
        <a className="am-item" role="menuitem" href="/ask-opzava">
          <span className="am-g" aria-hidden="true">
            ❔
          </span>
          Help & support
        </a>
        <div className="am-sep" role="separator" />
        <form action={signOutAction} className="am-form">
          <button className="am-item" role="menuitem" type="submit">
            <span className="am-g" aria-hidden="true">
              ↪
            </span>
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}
