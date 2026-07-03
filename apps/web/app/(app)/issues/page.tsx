import { randomUUID } from "node:crypto";

import { Fragment } from "react";
import { redirect } from "next/navigation";

import { createIssueAction, syncIssuesAction } from "@/app/(app)/issues/actions";
import {
  issueAssigneeView,
  issueDivergenceLabel,
  issueFilterTabs,
  issueStatusView,
  relativeIssueTime,
} from "@/lib/issues-state";
import { loadIssuesPageData } from "@/lib/issues";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

interface IssuesPageProps {
  readonly searchParams?: Promise<{
    readonly filter?: string;
  }>;
}

const issuesMockupPageStyles = `
    /* Page-specific layout only — no color, font-size, shadow, or radius overrides */
    .two-col-grid {
      display: grid;
      grid-template-columns: 1fr 1.8fr;
      gap: var(--space-4);
      align-items: start;
    }
    .spend-chart {
      display: flex;
      align-items: flex-end;
      gap: var(--space-2);
      height: 72px;
      padding: 0 var(--space-2);
    }
    .spend-chart-bar {
      flex: 1;
      border-radius: var(--radius-sm) var(--radius-sm) 0 0;
      min-width: 0;
    }
    .spend-chart-labels {
      display: flex;
      gap: var(--space-2);
      padding: var(--space-1) var(--space-2) 0;
    }
    .spend-chart-labels span {
      flex: 1;
      text-align: center;
    }
    .activity-row {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      min-height: 40px;
      padding: 0 var(--space-5);
      border-bottom: 1px solid var(--border);
    }
    .activity-row:last-child {
      border-bottom: 0;
    }
    .activity-time {
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      color: var(--fg-subtle);
      min-width: 68px;
      flex: none;
    }
    .activity-text {
      flex: 1;
      min-width: 0;
    }
    .nav-section-gap {
      margin-top: var(--space-2);
    }
    .header-avatar {
      width: 32px;
      height: 32px;
      border-radius: var(--radius-full);
      background: var(--surface-3);
      border: 1px solid var(--border-strong);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--text-xs);
      color: var(--fg-muted);
      flex: none;
      cursor: pointer;
      font-weight: var(--fw-semibold);
    }
    .notif-btn-wrap {
      position: relative;
    }
    .notif-badge {
      position: absolute;
      top: 4px;
      right: 4px;
      width: 16px;
      height: 16px;
      border-radius: var(--radius-full);
      background: var(--danger);
      color: #fff;
      font-size: 10px;
      font-weight: var(--fw-semibold);
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }
    .live-indicator {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--text-xs);
      color: var(--fg-muted);
    }
    .spend-row {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      flex-wrap: wrap;
    }
    .spend-row-sep {
      color: var(--border-strong);
    }
    .page-stack {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }
    .fleet-table-wrap {
      overflow: hidden;
    }
    .activity-live-header {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
`;

const issuesLiveWiringStyles = `
    .tabs {
      display: flex;
      gap: 2px;
      overflow-x: auto;
      padding: 0;
      border-bottom: 1px solid var(--border);
    }
    .tab {
      appearance: none;
      min-height: auto;
      margin-bottom: -1px;
      padding: 10px var(--space-4);
      border: 0;
      border-bottom: 2px solid transparent;
      border-radius: 0;
      background: none;
      color: var(--fg-muted);
      cursor: pointer;
      font: inherit;
      font-size: var(--text-sm);
      font-weight: inherit;
      text-decoration: none;
      white-space: nowrap;
    }
    .tab:hover {
      color: var(--fg);
      text-decoration: none;
    }
    .tab.active,
    .tab[aria-selected="true"] {
      color: var(--fg);
      font-weight: var(--fw-medium);
      border-bottom-color: var(--accent);
    }
    .card-footer {
      padding: var(--space-4) var(--space-5);
      border-top: 1px solid var(--border);
      background: transparent;
    }
    .issues-new-menu {
      position: relative;
    }
    .issues-new-menu summary {
      list-style: none;
    }
    .issues-new-menu summary::-webkit-details-marker {
      display: none;
    }
    .issues-new-form {
      position: absolute;
      z-index: var(--z-dropdown);
      right: 0;
      display: flex;
      width: min(420px, 86vw);
      flex-direction: column;
      gap: var(--space-3);
      margin-top: var(--space-2);
      padding: var(--space-4);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface);
      box-shadow: var(--shadow-md);
    }
    .issues-new-menu summary:focus-visible,
    .tab:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
`;

function errorStatus(error: unknown, depth = 0): number | undefined {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return undefined;
  }

  const status = (error as { readonly status?: unknown }).status;
  return typeof status === "number"
    ? status
    : errorStatus((error as { readonly cause?: unknown }).cause, depth + 1);
}

function errorCode(error: unknown, depth = 0): string | undefined {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return undefined;
  }

  const code = (error as { readonly code?: unknown }).code;
  return typeof code === "string"
    ? code
    : errorCode((error as { readonly cause?: unknown }).cause, depth + 1);
}

function issueAgeLabel(value: string): string {
  const relative = relativeIssueTime(value);
  return relative === "now" ? "now" : `${relative} ago`;
}

function LastSyncText({
  value,
  variant,
}: {
  readonly value: string | null;
  readonly variant: "header" | "footer";
}) {
  if (value === null) {
    return <>not synced yet</>;
  }

  const label = issueAgeLabel(value);
  return <time dateTime={value}>{variant === "header" ? `updated ${label}` : label}</time>;
}

function initials(name: string): string {
  const value = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return value === "" ? "--" : value;
}

function Assignee({
  assignee,
  currentUserName,
}: {
  readonly assignee: string | null;
  readonly currentUserName: string;
}) {
  const view = issueAssigneeView(assignee, currentUserName);

  if (view.kind === "unassigned") {
    return <span className="u-subtle">Unassigned</span>;
  }

  if (view.kind === "ai-agent") {
    return (
      <span className="u-row" style={{ gap: "6px" }}>
        <span className="u-sr-only">AI agent: </span>
        <span
          className="u-accent"
          aria-hidden="true"
          style={{ fontSize: "var(--text-base)", lineHeight: 1 }}
        >
          ✦
        </span>
        <span>{view.label}</span>
      </span>
    );
  }

  return (
    <span className="u-row" style={{ gap: "6px" }}>
      <span
        aria-hidden="true"
        style={{
          width: "22px",
          height: "22px",
          borderRadius: "var(--radius-full)",
          background: "var(--surface-3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "10px",
          color: "var(--fg-muted)",
          fontWeight: "var(--fw-semibold)",
          flex: "none",
        }}
      >
        {initials(view.label === "You" ? currentUserName : view.label)}
      </span>
      <span>{view.label}</span>
    </span>
  );
}

function IssuesPageStyles() {
  return (
    <>
      <style>{issuesMockupPageStyles}</style>
      <style>{issuesLiveWiringStyles}</style>
    </>
  );
}

export default async function IssuesPage({ searchParams }: IssuesPageProps) {
  const createIssueIdempotencyKey = `web.issue.create:${randomUUID()}`;
  const context = await getAppSessionContext();
  if (context === null) {
    redirect("/login");
  }

  const params = await searchParams;
  const result = await loadIssuesPageData({
    context,
    ...(params?.filter === undefined ? {} : { filter: params.filter }),
  });

  if (!result.ok) {
    if (
      errorCode(result.error) === "projectManagement.forbidden" ||
      errorStatus(result.error) === 403
    ) {
      redirect("/");
    }

    throw result.error;
  }

  const data = result.value;
  const openTotal = data.issues.filter((issue) => issue.state === "open").length;
  const filteredOpenTotal = data.filteredIssues.filter((issue) => issue.state === "open").length;

  return (
    <>
      <IssuesPageStyles />
      <div className="page">
        <div className="page-stack">
          <div className="page-header">
            <div>
              <h1>Issues</h1>
              <p className="page-sub">
                Synced with GitHub ·{" "}
                <a href={data.repositoryUrl} target="_blank" rel="noopener noreferrer">
                  github.com/{data.repository}
                </a>{" "}
                · <LastSyncText value={data.lastSyncedAt} variant="header" />
              </p>
            </div>
            <div className="u-row" style={{ gap: "var(--space-2)" }}>
              <form action={syncIssuesAction}>
                <button type="submit" className="btn">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M13 8a5 5 0 1 1-1.46-3.54M13 2.5v3h-3"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Sync now
                </button>
              </form>
              <details className="issues-new-menu">
                <summary className="btn btn-primary">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M8 3v10M3 8h10"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                  New issue
                </summary>
                <form className="issues-new-form" action={createIssueAction}>
                  <input type="hidden" name="idempotencyKey" value={createIssueIdempotencyKey} />
                  <div className="field">
                    <label className="label" htmlFor="new-issue-title">
                      Title
                    </label>
                    <input
                      className="input"
                      id="new-issue-title"
                      name="title"
                      type="text"
                      required
                      maxLength={256}
                    />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="new-issue-body">
                      Body
                    </label>
                    <textarea className="textarea" id="new-issue-body" name="body" rows={4} />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="new-issue-labels">
                      Labels
                    </label>
                    <input
                      className="input"
                      id="new-issue-labels"
                      name="labels"
                      type="text"
                      placeholder="needs-triage, ux-redesign"
                    />
                    <p className="hint">Comma-separated GitHub labels.</p>
                  </div>
                  <button className="btn btn-primary" type="submit">
                    Create issue
                  </button>
                </form>
              </details>
            </div>
          </div>

          <section aria-labelledby="pipeline-lbl">
            <div className="section-label" id="pipeline-lbl" style={{ paddingLeft: 0 }}>
              Triage pipeline
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "stretch",
                gap: "var(--space-2)",
                overflowX: "auto",
              }}
            >
              {data.pipeline.map((stage, index) => (
                <Fragment key={stage.id}>
                  <div
                    className="stat"
                    style={{
                      flex: "1 1 0",
                      minWidth: "150px",
                      ...(stage.needsAttention ? { borderLeft: "3px solid var(--accent)" } : {}),
                    }}
                  >
                    <div className="stat-label">{stage.label}</div>
                    <div className="stat-value u-tnum">{stage.count}</div>
                    <div
                      className="u-subtle"
                      style={{ fontSize: "var(--text-xs)", marginTop: "4px" }}
                    >
                      {stage.description}
                    </div>
                  </div>
                  {index === data.pipeline.length - 1 ? null : (
                    <span
                      className="u-subtle"
                      aria-hidden="true"
                      style={{
                        flex: "none",
                        alignSelf: "center",
                        fontSize: "var(--text-base)",
                      }}
                    >
                      →
                    </span>
                  )}
                </Fragment>
              ))}
            </div>
          </section>

          <section aria-label="Synced GitHub issues">
            <div className="card">
              <div className="tabs" role="tablist" aria-label="Filter issues">
                {issueFilterTabs.map((tab) => {
                  const href = tab.id === "all" ? "/issues" : `/issues?filter=${tab.id}`;
                  return (
                    <a
                      className="tab"
                      role="tab"
                      aria-selected={data.filter === tab.id}
                      aria-current={data.filter === tab.id ? "page" : undefined}
                      href={href}
                      key={tab.id}
                    >
                      {tab.label}
                    </a>
                  );
                })}
              </div>

              {data.filteredIssues.length === 0 ? (
                <div className="empty">
                  <p className="empty-title">No synced issues match this filter</p>
                  <p className="empty-desc">Run Sync now or choose another filter.</p>
                </div>
              ) : (
                <table className="table table-compact table-cards">
                  <caption className="u-sr-only">
                    Synced GitHub issues — issue number, title with triage labels, assignee, last
                    updated, and status. Showing {filteredOpenTotal} of {openTotal} open issues.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Issue</th>
                      <th scope="col">Assignee</th>
                      <th scope="col">Updated</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.filteredIssues.map((issue) => {
                      const status = issueStatusView(issue);
                      const divergence = issueDivergenceLabel(issue);
                      return (
                        <tr key={`${issue.repository}#${issue.number}`}>
                          <td data-label="#" className="u-mono u-muted">
                            #{issue.number}
                          </td>
                          <td data-label="Issue">
                            <a
                              href={issue.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: "var(--fg)",
                                fontWeight: "var(--fw-medium)",
                                lineHeight: "var(--lh-snug)",
                                textDecoration: "none",
                              }}
                            >
                              {issue.title}
                            </a>
                            <div className="u-row u-wrap" style={{ gap: "6px", marginTop: "6px" }}>
                              {issue.labels.length === 0 ? (
                                <span className="badge">needs-triage</span>
                              ) : (
                                issue.labels.map((label) => (
                                  <span className="badge" key={label}>
                                    {label}
                                  </span>
                                ))
                              )}
                              {divergence === null ? null : (
                                <span className="badge badge-warning">{divergence}</span>
                              )}
                            </div>
                          </td>
                          <td data-label="Assignee">
                            <Assignee
                              assignee={issue.assignee}
                              currentUserName={context.user.name}
                            />
                          </td>
                          <td data-label="Updated" className="u-mono u-subtle">
                            {relativeIssueTime(issue.updatedAt)}
                          </td>
                          <td data-label="Status">
                            <span className="u-row">
                              <span className={status.dotClassName} aria-hidden="true" />
                              {issue.state === "closed" ? (
                                <span className="u-muted">{status.label}</span>
                              ) : (
                                status.label
                              )}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              <div className="card-footer">
                <p className="hint">
                  Showing {filteredOpenTotal} of {openTotal} open · last sync{" "}
                  <LastSyncText value={data.lastSyncedAt} variant="footer" />
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
