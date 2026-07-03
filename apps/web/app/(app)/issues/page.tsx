import { randomUUID } from "node:crypto";

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

function lastSyncLabel(value: string | null): string {
  return value === null ? "not synced yet" : `updated ${relativeIssueTime(value)} ago`;
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
      <span className="u-row issue-assignee">
        <span className="u-sr-only">AI agent:</span>
        <span className="u-accent" aria-hidden="true">
          ✦
        </span>
        <span>{view.label}</span>
      </span>
    );
  }

  return (
    <span className="u-row issue-assignee">
      <span className="task-avatar" aria-hidden="true">
        {view.label === "You" ? "You" : view.label.slice(0, 2).toUpperCase()}
      </span>
      <span>{view.label}</span>
    </span>
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
    <div className="page issues-page">
      <div className="page-stack">
        <div className="page-header issues-page-header">
          <div>
            <h1>Issues</h1>
            <p className="page-sub">
              Synced with GitHub ·{" "}
              <a href={data.repositoryUrl} target="_blank" rel="noopener noreferrer">
                github.com/{data.repository}
              </a>{" "}
              · {lastSyncLabel(data.lastSyncedAt)}
            </p>
          </div>
          <div className="u-row issues-header-actions">
            <form action={syncIssuesAction}>
              <button type="submit" className="btn">
                <span aria-hidden="true">↻</span>
                Sync now
              </button>
            </form>
            <details className="issues-new-menu">
              <summary className="btn btn-primary">
                <span aria-hidden="true">+</span>
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
          <div className="section-label issues-section-label" id="pipeline-lbl">
            Triage pipeline
          </div>
          <div className="issues-pipeline">
            {data.pipeline.map((stage, index) => (
              <div className="issues-pipeline-stage" key={stage.id}>
                <div className={stage.needsAttention ? "stat issues-stat-attention" : "stat"}>
                  <div className="stat-label">{stage.label}</div>
                  <div className="stat-value u-tnum">{stage.count}</div>
                  <div className="u-subtle issues-stat-desc">{stage.description}</div>
                </div>
                {index === data.pipeline.length - 1 ? null : (
                  <span className="u-subtle issues-pipeline-arrow" aria-hidden="true">
                    →
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        <section aria-label="Synced GitHub issues">
          <div className="card issues-card">
            <div className="tabs issues-tabs" role="tablist" aria-label="Filter issues">
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
              <table className="table table-cards issues-table">
                <caption className="u-sr-only">
                  Synced GitHub issues: issue number, title with labels, assignee, last updated, and
                  status.
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
                            className="issues-title-link"
                            href={issue.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {issue.title}
                          </a>
                          <div className="u-row u-wrap issues-labels">
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
                          <Assignee assignee={issue.assignee} currentUserName={context.user.name} />
                        </td>
                        <td data-label="Updated" className="u-mono u-subtle">
                          {relativeIssueTime(issue.updatedAt)}
                        </td>
                        <td data-label="Status">
                          <span className="u-row">
                            <span className={status.dotClassName} aria-hidden="true" />
                            {status.label}
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
                {lastSyncLabel(data.lastSyncedAt)}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
