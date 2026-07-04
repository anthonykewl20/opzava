import { randomUUID } from "node:crypto";

import type { IssueProjectionDto, IssueTriageFilter } from "@opzava/project-management";
import { redirect } from "next/navigation";

import { createIssueAction, syncIssuesAction } from "@/app/(app)/issues/actions";
import { ActionStateForm } from "@/components/forms/action-state-form";
import {
  issueAssigneeView,
  issueDivergenceLabel,
  issueFilterTabs,
  issueLabelView,
  issuePageWindow,
  issueSectionGroups,
  issueStatusView,
  parseIssuePage,
  relativeIssueTime,
} from "@/lib/issues-state";
import { loadIssuesPageData } from "@/lib/issues";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

interface IssuesPageProps {
  readonly searchParams?: Promise<{
    readonly filter?: string;
    readonly page?: string;
  }>;
}

const issuesMockupPageStyles = `
    /* Page-specific composition only; values come from existing tokens and primitives. */
    /* UX laws: Hick's/Miller's chunking, Prägnanz/aesthetic minimalism,
       Von Restorff single primary action, Serial Position, progressive disclosure. */
    .issues-page {
      max-width: 1320px;
    }
    .issues-page .page-header {
      align-items: center;
      margin-bottom: 0;
    }
    .page-stack {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }
    .issues-header-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: var(--space-2);
      flex-wrap: wrap;
    }
    .issues-pipeline-strip {
      display: flex;
      align-items: stretch;
      gap: var(--space-1);
      padding: var(--space-2);
      overflow: hidden;
      overflow-x: auto;
    }
    .issues-pipeline-segment {
      display: flex;
      align-items: center;
      min-width: 148px;
      min-height: 44px;
      padding: 0 var(--space-3);
      border: 1px solid transparent;
      border-radius: var(--radius-md);
      gap: var(--space-2);
      color: inherit;
      text-decoration: none;
    }
    .issues-pipeline-segment:hover {
      background: var(--surface-2);
      text-decoration: none;
    }
    .issues-pipeline-segment[aria-current="page"] {
      background: var(--surface-2);
      border-color: var(--border);
    }
    .issues-pipeline-segment.is-primary {
      background: var(--accent-soft);
      border-color: var(--accent-border);
    }
    .issues-pipeline-segment.is-zero {
      opacity: 0.48;
    }
    .issues-pipeline-count {
      min-width: 2ch;
      font-size: var(--text-lg);
      font-weight: var(--fw-semibold);
      line-height: var(--lh-tight);
      text-align: right;
    }
    .issues-pipeline-label {
      min-width: 0;
      line-height: var(--lh-snug);
    }
    .issues-list-card {
      overflow: hidden;
    }
    .issues-list-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      padding: var(--space-4) var(--space-5);
      border-bottom: 1px solid var(--border);
    }
    .issues-list-meta {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
      margin-top: 4px;
    }
    .issues-list-table td {
      height: auto;
      padding-top: var(--space-3);
      padding-bottom: var(--space-3);
    }
    .issues-list-table th:first-child,
    .issues-list-table td:first-child {
      width: 78px;
    }
    .issues-number-link {
      color: var(--fg-muted);
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
      font-weight: var(--fw-medium);
      text-decoration: none;
    }
    .issues-number-link:hover,
    .issues-title-link:hover {
      color: var(--accent);
      text-decoration: none;
    }
    .issues-title-link {
      color: var(--fg);
      font-weight: var(--fw-medium);
      line-height: var(--lh-snug);
      text-decoration: none;
      overflow-wrap: anywhere;
    }
    .issues-label-row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: var(--space-2);
    }
    .issues-more-labels {
      position: relative;
      display: inline-flex;
    }
    .issues-more-labels summary {
      min-height: 24px;
      cursor: pointer;
      list-style: none;
    }
    .issues-more-labels summary::-webkit-details-marker {
      display: none;
    }
    .issues-hidden-labels {
      position: absolute;
      z-index: var(--z-dropdown);
      top: calc(100% + 6px);
      left: 0;
      display: grid;
      min-width: 180px;
      gap: 6px;
      padding: var(--space-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--surface);
      box-shadow: var(--shadow-md);
    }
    .issues-group-row th {
      height: auto;
      padding: var(--space-4) var(--space-4) var(--space-2);
      border-bottom: 1px solid var(--border);
      background: var(--surface);
      text-align: left;
      text-transform: none;
      letter-spacing: 0;
    }
    .issues-group-heading {
      display: flex;
      align-items: baseline;
      gap: var(--space-2);
      flex-wrap: wrap;
    }
    .issues-dimmed-cell {
      color: var(--fg-subtle);
    }
    .issues-dimmed-cell .dot {
      opacity: 0.45;
    }
    .issues-status {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
    }
    .issues-pagination {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: var(--space-2);
      flex-wrap: wrap;
    }
    .issues-page-indicator {
      min-width: 8ch;
      text-align: center;
    }
    .issues-pagination-disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .issues-footer-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      flex-wrap: wrap;
    }
    @media (max-width: 720px) {
      .issues-page .page-header,
      .issues-list-head,
      .issues-footer-row {
        align-items: stretch;
        flex-direction: column;
      }
      .issues-header-actions,
      .issues-pagination {
        justify-content: flex-start;
      }
      .issues-new-form {
        position: static;
        width: 100%;
      }
    }
    @media (max-width: 640px) {
      .table.table-cards.issues-list-table tbody .issues-group-row {
        display: block;
        border: 0;
        margin: var(--space-2) 0;
        padding: 0;
      }
      .table.table-cards.issues-list-table tbody .issues-group-row th {
        display: block;
        border: 0;
        padding: var(--space-2) 0;
      }
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
    .issues-more-labels summary:focus-visible,
    .issues-pipeline-segment:focus-visible,
    .issues-number-link:focus-visible,
    .issues-title-link:focus-visible,
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

function issuesHref(filter: IssueTriageFilter, page = 1): string {
  const params = new URLSearchParams();
  if (filter !== "all") {
    params.set("filter", filter);
  }
  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();
  return query === "" ? "/issues" : `/issues?${query}`;
}

function issueFilterLabel(filter: IssueTriageFilter): string {
  return issueFilterTabs.find((tab) => tab.id === filter)?.label ?? "All";
}

function pluralizedIssue(count: number): string {
  return `${count} ${count === 1 ? "issue" : "issues"}`;
}

function issueViewTitle(filter: IssueTriageFilter): string {
  return filter === "all" ? "All synced issues" : `${issueFilterLabel(filter)} focus`;
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

function IssueLabelChips({
  issue,
  divergence,
}: {
  readonly issue: IssueProjectionDto;
  readonly divergence: string | null;
}) {
  const labels = issueLabelView(issue);

  return (
    <div className="issues-label-row">
      <span className="badge">{labels.primaryLabel}</span>
      {labels.hiddenLabels.length === 0 ? null : (
        <details className="issues-more-labels">
          <summary
            className="badge"
            aria-label={`Show ${labels.hiddenLabels.length} more labels for issue #${issue.number}`}
          >
            +{labels.hiddenLabels.length}
          </summary>
          <div className="issues-hidden-labels">
            {labels.hiddenLabels.map((label) => (
              <span className="badge" key={label}>
                {label}
              </span>
            ))}
          </div>
        </details>
      )}
      {divergence === null ? null : <span className="badge badge-warning">{divergence}</span>}
    </div>
  );
}

function IssuesPagination({
  filter,
  page,
  pageCount,
}: {
  readonly filter: IssueTriageFilter;
  readonly page: number;
  readonly pageCount: number;
}) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <nav className="issues-pagination" aria-label="Issue pages">
      {page <= 1 ? (
        <span className="btn btn-sm issues-pagination-disabled" aria-disabled="true">
          Previous
        </span>
      ) : (
        <a className="btn btn-sm" href={issuesHref(filter, page - 1)}>
          Previous
        </a>
      )}
      <span className="hint issues-page-indicator">
        Page {page} of {pageCount}
      </span>
      {page >= pageCount ? (
        <span className="btn btn-sm issues-pagination-disabled" aria-disabled="true">
          Next
        </span>
      ) : (
        <a className="btn btn-sm" href={issuesHref(filter, page + 1)}>
          Next
        </a>
      )}
    </nav>
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
  const issueWindow = issuePageWindow(
    data.filteredIssues,
    parseIssuePage(params?.page, data.filteredIssues.length),
  );
  const issueGroups = issueSectionGroups(issueWindow.issues);
  const primaryPipelineStage =
    data.pipeline.find((stage) => stage.id === "needs-triage" && stage.count > 0) ??
    data.pipeline.find((stage) => stage.needsAttention && stage.count > 0);
  const allFilteredUnassigned =
    data.filteredIssues.length > 0 &&
    data.filteredIssues.every(
      (issue) => issueAssigneeView(issue.assignee, context.user.name).kind === "unassigned",
    );
  const filteredStatusLabels = [
    ...new Set(data.filteredIssues.map((issue) => issueStatusView(issue).label)),
  ];
  const uniformStatusLabel =
    filteredStatusLabels.length === 1 ? (filteredStatusLabels[0] ?? null) : null;
  const listMeta = [
    `${pluralizedIssue(issueWindow.totalCount)} in this view`,
    allFilteredUnassigned ? "all unassigned" : null,
    uniformStatusLabel === null ? null : `all ${uniformStatusLabel.toLowerCase()}`,
  ].filter((item): item is string => item !== null);

  return (
    <>
      <IssuesPageStyles />
      <div className="page issues-page">
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
            <div className="issues-header-actions">
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
                <ActionStateForm
                  action={createIssueAction}
                  className="issues-new-form"
                  errorTitle="Could not create issue"
                >
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
                  <button className="btn" type="submit">
                    Create issue
                  </button>
                </ActionStateForm>
              </details>
            </div>
          </div>

          <section aria-labelledby="pipeline-lbl">
            <div className="section-label" id="pipeline-lbl" style={{ paddingLeft: 0 }}>
              Triage pipeline
            </div>
            <div className="card issues-pipeline-strip">
              {data.pipeline.map((stage) => (
                <a
                  className={[
                    "issues-pipeline-segment",
                    stage.count === 0 ? "is-zero" : "",
                    primaryPipelineStage?.id === stage.id ? "is-primary" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  href={issuesHref(stage.id)}
                  aria-current={data.filter === stage.id ? "page" : undefined}
                  aria-label={`${stage.label}: ${pluralizedIssue(stage.count)} (${stage.description})`}
                  key={stage.id}
                >
                  <span className="issues-pipeline-count u-tnum">{stage.count}</span>
                  <span className="issues-pipeline-label">
                    <span className="u-row" style={{ gap: "6px" }}>
                      {stage.needsAttention && stage.count > 0 ? (
                        <span className="dot dot-accent" aria-hidden="true" />
                      ) : null}
                      <span>{stage.label}</span>
                    </span>
                    <span className="u-subtle" style={{ display: "block" }}>
                      {stage.description}
                    </span>
                  </span>
                </a>
              ))}
            </div>
          </section>

          <section aria-label="Synced GitHub issues">
            <div className="card issues-list-card">
              <div className="issues-list-head">
                <div>
                  <h2 className="card-title">{issueViewTitle(data.filter)}</h2>
                  <p className="hint issues-list-meta">
                    {listMeta.map((item, index) => (
                      <span key={item}>
                        {index === 0 ? null : "· "}
                        {item}
                      </span>
                    ))}
                  </p>
                </div>
                <IssuesPagination
                  filter={data.filter}
                  page={issueWindow.page}
                  pageCount={issueWindow.pageCount}
                />
              </div>

              <div className="tabs" role="tablist" aria-label="Filter issues">
                {issueFilterTabs.map((tab) => {
                  return (
                    <a
                      className="tab"
                      role="tab"
                      aria-selected={data.filter === tab.id}
                      aria-current={data.filter === tab.id ? "page" : undefined}
                      href={issuesHref(tab.id)}
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
                <table className="table table-compact table-cards issues-list-table">
                  <caption className="u-sr-only">
                    Synced GitHub issues — issue number, title with triage labels, assignee, last
                    updated, and status. Showing {issueWindow.startItem} to {issueWindow.endItem} of{" "}
                    {issueWindow.totalCount} issues in this view, with {filteredOpenTotal} of{" "}
                    {openTotal} open issues.
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
                  {issueGroups.map((group) => (
                    <tbody
                      aria-label={`${group.label}: ${pluralizedIssue(group.count)}`}
                      key={group.id}
                    >
                      <tr className="issues-group-row">
                        <th scope="rowgroup" colSpan={5}>
                          <span className="issues-group-heading">
                            <span>{group.label}</span>
                            <span className="badge">{group.count}</span>
                            <span className="u-subtle">{group.description}</span>
                          </span>
                        </th>
                      </tr>
                      {group.issues.map((issue) => {
                        const status = issueStatusView(issue);
                        const divergence = issueDivergenceLabel(issue);
                        return (
                          <tr key={`${issue.repository}#${issue.number}`}>
                            <td data-label="#">
                              <a
                                className="issues-number-link"
                                href={issue.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Open GitHub issue #${issue.number}`}
                              >
                                #{issue.number}
                              </a>
                            </td>
                            <td data-label="Issue">
                              <a
                                className="issues-title-link"
                                href={issue.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {issue.title}
                              </a>
                              <IssueLabelChips issue={issue} divergence={divergence} />
                            </td>
                            <td
                              data-label="Assignee"
                              className={allFilteredUnassigned ? "issues-dimmed-cell" : undefined}
                            >
                              <Assignee
                                assignee={issue.assignee}
                                currentUserName={context.user.name}
                              />
                            </td>
                            <td data-label="Updated" className="u-mono u-subtle">
                              <time dateTime={issue.updatedAt}>
                                {relativeIssueTime(issue.updatedAt)}
                              </time>
                            </td>
                            <td
                              data-label="Status"
                              className={
                                uniformStatusLabel === null ? undefined : "issues-dimmed-cell"
                              }
                            >
                              <span className="issues-status">
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
                  ))}
                </table>
              )}

              <div className="card-footer">
                <div className="issues-footer-row">
                  <p className="hint">
                    Showing {issueWindow.startItem}-{issueWindow.endItem} of{" "}
                    {issueWindow.totalCount} · {filteredOpenTotal} of {openTotal} open · last sync{" "}
                    <LastSyncText value={data.lastSyncedAt} variant="footer" />
                  </p>
                  <IssuesPagination
                    filter={data.filter}
                    page={issueWindow.page}
                    pageCount={issueWindow.pageCount}
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
