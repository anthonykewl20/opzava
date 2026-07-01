import { signOutAction } from "@/app/(auth)/signout/actions";
import type { AppSessionContext } from "@/lib/session";

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

export function UserMenu({ context }: { readonly context: AppSessionContext }) {
  return (
    <form action={signOutAction} className="u-row-3">
      <div className="u-col-2" style={{ gap: 0, textAlign: "right" }}>
        <strong style={{ color: "var(--fg)", fontSize: "var(--text-sm)" }}>
          {context.user.name}
        </strong>
        <span className="u-subtle" style={{ fontSize: "var(--text-xs)" }}>
          {context.user.email}
        </span>
      </div>
      <span className="header-avatar" aria-hidden="true">
        {initials(context.user.name)}
      </span>
      <button className="btn btn-ghost btn-sm" type="submit">
        Sign out
      </button>
    </form>
  );
}
