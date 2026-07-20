import Link from "next/link";

import type { ShellAttentionState, ShellHealthState } from "@/lib/shell-state";

export function HealthPill({ state }: { readonly state: ShellHealthState }) {
  return (
    <Link
      href="/connections"
      className="health-pill"
      aria-label={state.ariaLabel}
      title={state.ariaLabel}
      data-health-status={state.status}
      data-health-checked-at={state.checkedAt ?? ""}
      data-health-freshness={state.freshnessState}
    >
      <span className={state.dotClassName} aria-hidden="true" />
      {state.text}
    </Link>
  );
}

export function AttentionInbox({ state }: { readonly state: ShellAttentionState }) {
  const countLabel =
    state.count === null ? "—" : state.state === "partial" ? `${state.count}+` : state.count;

  return (
    <Link
      href="/#overview-attention-heading"
      className="health-pill attention-inbox"
      aria-label={state.ariaLabel}
      title={state.ariaLabel}
      data-attention-state={state.state}
      data-attention-count={state.count ?? ""}
      data-attention-has-items={state.hasItems === null ? "unknown" : state.hasItems}
    >
      Attention {countLabel}
    </Link>
  );
}
