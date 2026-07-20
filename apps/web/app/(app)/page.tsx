import Link from "next/link";
import { redirect } from "next/navigation";

import type { AvailabilityState, EvidenceEnvelope } from "@/lib/admin-evidence";
import {
  composeAdminOverview,
  type AdminOverview,
  type AdminOverviewReadinessRow,
} from "@/lib/admin-overview/overview-composition";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

const overviewStyles = `
  .admin-overview-page {
    max-width: 1540px;
  }
  .admin-overview-header {
    align-items: flex-start;
  }
  .admin-overview-eyebrow {
    color: var(--fg-subtle);
    font-size: var(--text-xs);
    font-weight: var(--fw-semibold);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
  }
  .admin-overview-description {
    max-width: 76ch;
  }
  .admin-overview-evaluated {
    color: var(--fg-subtle);
    font-size: var(--text-xs);
    white-space: nowrap;
  }
  .admin-overview-sections {
    display: grid;
    gap: var(--space-4);
  }
  .overview-section-card {
    min-width: 0;
    overflow: hidden;
    box-shadow: var(--shadow-sm);
  }
  .overview-section-head {
    align-items: flex-start;
    padding: var(--space-4) var(--space-5);
  }
  .overview-section-title {
    font-size: var(--text-base);
  }
  .overview-section-note {
    max-width: 76ch;
    margin: var(--space-1) 0 0;
    color: var(--fg-muted);
    font-size: var(--text-xs);
    line-height: 1.45;
  }
  .overview-section-meta,
  .overview-chip-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  .overview-state-chip {
    display: inline-flex;
    min-height: 24px;
    align-items: center;
    gap: 6px;
    padding: 0 var(--space-2);
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--fg-muted);
    font-size: var(--text-xs);
    font-weight: var(--fw-semibold);
    white-space: nowrap;
  }
  .overview-state-chip[data-state="live"] {
    border-color: color-mix(in srgb, var(--success) 35%, var(--border));
    background: var(--success-soft);
    color: var(--success);
  }
  .overview-state-chip[data-state="stale"],
  .overview-state-chip[data-state="unknown"],
  .overview-state-chip[data-state="not-configured"] {
    border-color: color-mix(in srgb, var(--warning) 35%, var(--border));
    background: var(--warning-soft);
    color: var(--warning);
  }
  .overview-state-chip[data-state="unavailable"] {
    border-color: color-mix(in srgb, var(--danger) 35%, var(--border));
    background: var(--danger-soft);
    color: var(--danger);
  }
  .overview-count-pill {
    display: inline-flex;
    min-height: 24px;
    align-items: center;
    padding: 0 var(--space-2);
    border-radius: 999px;
    background: var(--surface-3);
    color: var(--fg-muted);
    font-size: var(--text-xs);
    font-weight: var(--fw-semibold);
    white-space: nowrap;
  }
  .overview-attention-list,
  .overview-activity-list {
    padding: 0;
    margin: 0;
    list-style: none;
  }
  .overview-attention-row {
    display: grid;
    min-height: 72px;
    grid-template-columns: 36px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border);
  }
  .overview-attention-row:last-child,
  .overview-activity-row:last-child {
    border-bottom: 0;
  }
  .overview-attention-icon,
  .overview-activity-icon {
    display: grid;
    flex: none;
    place-items: center;
    border-radius: var(--radius-md);
    background: var(--warning-soft);
    color: var(--warning);
    font-weight: var(--fw-semibold);
  }
  .overview-attention-icon {
    width: 34px;
    height: 34px;
  }
  .overview-row-copy {
    min-width: 0;
  }
  .overview-row-copy strong {
    display: block;
    font-size: var(--text-sm);
  }
  .overview-row-copy p {
    margin: var(--space-1) 0 0;
    color: var(--fg-muted);
    font-size: var(--text-xs);
    line-height: 1.45;
  }
  .overview-row-source {
    color: var(--fg-subtle);
    font-size: var(--text-xs);
    white-space: nowrap;
  }
  .overview-section-state {
    display: flex;
    min-height: 82px;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-5);
  }
  .overview-section-state-icon {
    display: grid;
    width: 34px;
    height: 34px;
    flex: none;
    place-items: center;
    border-radius: var(--radius-md);
    background: var(--surface-3);
    color: var(--fg-muted);
    font-weight: var(--fw-semibold);
  }
  .overview-section-state[data-state="live"] .overview-section-state-icon {
    background: var(--success-soft);
    color: var(--success);
  }
  .overview-section-state[data-state="unavailable"] .overview-section-state-icon {
    background: var(--danger-soft);
    color: var(--danger);
  }
  .overview-section-state p {
    margin: var(--space-1) 0 0;
    color: var(--fg-muted);
    font-size: var(--text-xs);
  }
  .overview-readiness-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .overview-readiness-item {
    min-width: 0;
    min-height: 116px;
    padding: var(--space-4);
    border-right: 1px solid var(--border);
  }
  .overview-readiness-item:last-child {
    border-right: 0;
  }
  .overview-readiness-name {
    color: var(--fg-muted);
    font-size: var(--text-xs);
  }
  .overview-readiness-summary {
    min-height: 38px;
    margin: var(--space-2) 0;
    color: var(--fg);
    font-size: var(--text-sm);
    font-weight: var(--fw-semibold);
    line-height: 1.4;
  }
  .overview-readiness-link {
    display: inline-flex;
    margin-top: var(--space-2);
    color: var(--accent);
    font-size: var(--text-xs);
    font-weight: var(--fw-semibold);
  }
  .overview-activity-row {
    display: grid;
    min-height: 56px;
    grid-template-columns: 86px 30px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--border);
  }
  .overview-activity-time {
    color: var(--fg-subtle);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }
  .overview-activity-icon {
    width: 28px;
    height: 28px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: var(--text-xs);
  }
  @media (max-width: 980px) {
    .overview-readiness-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .overview-readiness-item:nth-child(2) {
      border-right: 0;
    }
    .overview-readiness-item:nth-child(-n + 2) {
      border-bottom: 1px solid var(--border);
    }
  }
  @media (max-width: 700px) {
    .admin-overview-header,
    .overview-section-head {
      flex-direction: column;
    }
    .admin-overview-evaluated {
      white-space: normal;
    }
    .overview-section-meta,
    .overview-chip-row {
      justify-content: flex-start;
    }
    .overview-attention-row {
      grid-template-columns: 34px minmax(0, 1fr);
    }
    .overview-attention-row .overview-chip-row,
    .overview-attention-row .btn {
      grid-column: 2;
      justify-self: start;
    }
    .overview-readiness-grid {
      grid-template-columns: 1fr;
    }
    .overview-readiness-item,
    .overview-readiness-item:nth-child(2) {
      border-right: 0;
      border-bottom: 1px solid var(--border);
    }
    .overview-readiness-item:last-child {
      border-bottom: 0;
    }
    .overview-activity-row {
      grid-template-columns: 72px 28px minmax(0, 1fr);
    }
    .overview-activity-row .overview-state-chip,
    .overview-activity-row .overview-row-source {
      grid-column: 3;
      justify-self: start;
    }
  }
`;

function stateLabel(state: AvailabilityState): string {
  return state === "not-configured" ? "not configured" : state;
}

function freshnessLabel(freshness: EvidenceEnvelope<unknown>["freshnessState"]): string {
  if (freshness === "within-budget") return "within budget";
  return freshness;
}

function StateChip({
  state,
  freshness,
  partial = false,
}: {
  readonly state: AvailabilityState;
  readonly freshness: EvidenceEnvelope<unknown>["freshnessState"];
  readonly partial?: boolean;
}) {
  return (
    <span className="overview-state-chip" data-state={state}>
      <span className="status-dot" aria-hidden="true" />
      {stateLabel(state)} · {freshnessLabel(freshness)}
      {partial ? " · partial" : ""}
    </span>
  );
}

function SectionState({
  state,
  title,
  message,
}: {
  readonly state: AvailabilityState;
  readonly title: string;
  readonly message: string;
}) {
  const symbol = state === "live" ? "✓" : state === "unavailable" ? "!" : "–";
  return (
    <div className="overview-section-state" data-state={state} role="status">
      <span className="overview-section-state-icon" aria-hidden="true">
        {symbol}
      </span>
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
    </div>
  );
}

function formatEvaluatedAt(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function formatActivityTime(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function readinessSummary(row: AdminOverviewReadinessRow): string {
  const value = row.envelope.value;
  if (value === null) {
    if (row.envelope.state === "not-configured") return "Not configured";
    if (row.envelope.state === "unavailable") return "Current evidence unavailable";
    return "Current evidence unknown";
  }

  if (row.id === "health" && "overall" in value) {
    return `${value.overall} · ${value.healthy}/${value.componentsTotal} healthy · ${value.attention} attention`;
  }
  if (row.id === "gateway" && "authLabel" in value) {
    return `${value.status} · ${value.region ?? "region unknown"} · ${value.authLabel}`;
  }
  if (row.id === "models" && "providersTotal" in value) {
    return `${value.connected}/${value.providersTotal} connected · ${value.needsAttention} attention · ${value.pending} pending`;
  }
  if ("github" in value) {
    return value.github.connected
      ? `Connected${value.github.repository === undefined ? "" : ` · ${value.github.repository}`}`
      : "Not connected";
  }
  return "Current evidence unknown";
}

function SectionHeader({
  id,
  title,
  note,
  state,
  freshness,
  partial,
  countLabel,
}: {
  readonly id: string;
  readonly title: string;
  readonly note: string;
  readonly state: AvailabilityState;
  readonly freshness: EvidenceEnvelope<unknown>["freshnessState"];
  readonly partial: boolean;
  readonly countLabel?: string;
}) {
  return (
    <header className="card-header overview-section-head">
      <div>
        <h2 className="card-title overview-section-title" id={id}>
          {title}
        </h2>
        <p className="overview-section-note">{note}</p>
      </div>
      <div className="overview-section-meta">
        {countLabel === undefined ? null : (
          <span className="overview-count-pill">{countLabel}</span>
        )}
        <StateChip state={state} freshness={freshness} partial={partial} />
      </div>
    </header>
  );
}

export function AdminOverviewContent({ overview }: { readonly overview: AdminOverview }) {
  const attentionFreshness = overview.needsYourAttention.envelopes.some(
    (envelope) => envelope.freshnessState === "stale",
  )
    ? "stale"
    : overview.needsYourAttention.envelopes.every(
          (envelope) => envelope.freshnessState === "within-budget",
        )
      ? "within-budget"
      : "unknown";
  const readinessFreshness = overview.developmentReadiness.envelopes.some(
    (envelope) => envelope.freshnessState === "stale",
  )
    ? "stale"
    : overview.developmentReadiness.envelopes.every(
          (envelope) => envelope.freshnessState === "within-budget",
        )
      ? "within-budget"
      : "unknown";
  const attentionCountLabel =
    overview.needsYourAttention.status.state === "live"
      ? `${overview.needsYourAttention.rows.length} actionable`
      : overview.needsYourAttention.status.partial
        ? `${overview.needsYourAttention.rows.length} observed`
        : null;

  return (
    <div className="page admin-overview-page">
      <style>{overviewStyles}</style>
      <header className="page-header admin-overview-header">
        <div>
          <div className="admin-overview-eyebrow">Admin Overview</div>
          <h1>Overview</h1>
          <p className="page-sub admin-overview-description">
            Request-scoped evidence for attention, delivery availability, development readiness, and
            recent runtime activity.
          </p>
        </div>
        <time className="admin-overview-evaluated" dateTime={overview.evaluatedAt}>
          Evaluated {formatEvaluatedAt(overview.evaluatedAt)} PHT
        </time>
      </header>

      <div className="admin-overview-sections" aria-label="Admin Overview Variant A">
        <section
          className="card overview-section-card"
          aria-labelledby="overview-attention-heading"
        >
          <SectionHeader
            id="overview-attention-heading"
            title={overview.needsYourAttention.title}
            note={overview.needsYourAttention.note}
            state={overview.needsYourAttention.status.state}
            freshness={attentionFreshness}
            partial={overview.needsYourAttention.status.partial}
            {...(attentionCountLabel === null ? {} : { countLabel: attentionCountLabel })}
          />
          {overview.needsYourAttention.empty ? (
            <SectionState
              state="live"
              title="No action required"
              message="No provider approvals or health attention signals were observed in the current evidence."
            />
          ) : overview.needsYourAttention.rows.length === 0 ? (
            <SectionState
              state={overview.needsYourAttention.status.state}
              title="Attention evidence could not be verified"
              message="No zero count is inferred while a required attention source is unavailable, stale, or unknown."
            />
          ) : (
            <ul className="overview-attention-list">
              {overview.needsYourAttention.rows.map((row) => (
                <li className="overview-attention-row" key={row.id}>
                  <span className="overview-attention-icon" aria-hidden="true">
                    !
                  </span>
                  <div className="overview-row-copy">
                    <strong>{row.title}</strong>
                    <p>{row.detail}</p>
                  </div>
                  <div className="overview-chip-row">
                    <StateChip state={row.state} freshness={row.freshnessState} />
                    <span className="overview-row-source">{row.sourceOwner}</span>
                  </div>
                  <Link className="btn btn-sm" href={row.href}>
                    {row.actionLabel}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card overview-section-card" aria-labelledby="overview-delivery-heading">
          <SectionHeader
            id="overview-delivery-heading"
            title={overview.activeDelivery.title}
            note={overview.activeDelivery.note}
            state={overview.activeDelivery.status.state}
            freshness={overview.activeDelivery.envelope.freshnessState}
            partial={overview.activeDelivery.status.partial}
          />
          <SectionState
            state={overview.activeDelivery.status.state}
            title="Delivery source not configured"
            message={overview.activeDelivery.message}
          />
        </section>

        <section
          className="card overview-section-card"
          aria-labelledby="overview-readiness-heading"
        >
          <SectionHeader
            id="overview-readiness-heading"
            title={overview.developmentReadiness.title}
            note={overview.developmentReadiness.note}
            state={overview.developmentReadiness.status.state}
            freshness={readinessFreshness}
            partial={overview.developmentReadiness.status.partial}
          />
          <div className="overview-readiness-grid" role="list">
            {overview.developmentReadiness.rows.map((row) => (
              <article className="overview-readiness-item" key={row.id} role="listitem">
                <div className="overview-readiness-name">{row.label}</div>
                <div className="overview-readiness-summary">{readinessSummary(row)}</div>
                <StateChip state={row.envelope.state} freshness={row.envelope.freshnessState} />
                <br />
                <Link className="overview-readiness-link" href={row.href}>
                  Open owner surface →
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="card overview-section-card" aria-labelledby="overview-activity-heading">
          <SectionHeader
            id="overview-activity-heading"
            title={overview.recentActivity.title}
            note={overview.recentActivity.note}
            state={overview.recentActivity.status.state}
            freshness={overview.recentActivity.envelope.freshnessState}
            partial={overview.recentActivity.status.partial}
          />
          {overview.recentActivity.empty ? (
            <SectionState
              state="live"
              title="No recent activity"
              message="The audit source returned a lawful empty result for the current request."
            />
          ) : overview.recentActivity.rows.length === 0 ? (
            <SectionState
              state={overview.recentActivity.status.state}
              title={
                overview.recentActivity.status.state === "not-configured"
                  ? "Audit activity is not configured"
                  : "Recent activity could not be verified"
              }
              message="No activity rows or zero count are inferred without current audit evidence."
            />
          ) : (
            <ol className="overview-activity-list">
              {overview.recentActivity.rows.map((row) => (
                <li className="overview-activity-row" key={row.id}>
                  <time className="overview-activity-time" dateTime={row.occurredAt}>
                    {formatActivityTime(row.occurredAt)}
                  </time>
                  <span className="overview-activity-icon" aria-hidden="true">
                    {row.actorLabel
                      .split(" ")
                      .map((part) => part[0])
                      .join("")}
                  </span>
                  <div className="overview-row-copy">
                    <strong>{row.actorLabel}</strong>
                    <p>{row.summary}</p>
                  </div>
                  <StateChip state={row.state} freshness={row.freshnessState} />
                  <Link className="overview-row-source" href={row.href}>
                    {row.sourceLabel}
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

export default async function AdminHomePage() {
  const context = await getAppSessionContext();
  if (context === null) redirect("/login");

  const overview = await composeAdminOverview(context);
  return <AdminOverviewContent overview={overview} />;
}
