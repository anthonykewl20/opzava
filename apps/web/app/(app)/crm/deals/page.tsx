import { randomUUID } from "node:crypto";

import { ensureDefaultPipeline, listAccounts, listContacts, listDeals } from "@opzava/crm";
import { forbidden, redirect } from "next/navigation";
import type { CSSProperties } from "react";

import { CrmPageStyles } from "@/app/(app)/crm/_components/crm-page-styles";
import {
  closeDealAction,
  moveDealStageAction,
  reopenDealAction,
} from "@/app/(app)/crm/deals/actions";
import { DealCreateDialog } from "@/app/(app)/crm/deals/_components/deal-create-dialog";
import { ActionStateForm } from "@/components/forms/action-state-form";
import {
  crmContextInput,
  dealStatusBadgeClassName,
  dealStatusLabel,
  formatMoney,
  isCrmForbidden,
  ownerLabel,
  relativeTime,
} from "@/lib/crm-pages";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

function dealStageCardStyle(position: number): CSSProperties {
  const colors = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-4)",
    "var(--chart-5)",
    "var(--chart-6)",
  ] as const;

  return {
    "--card-color": colors[position % colors.length],
  } as CSSProperties;
}

export default async function DealsPage() {
  const context = await getAppSessionContext();
  if (context === null) {
    redirect("/login");
  }

  const crmContext = crmContextInput(context);
  const createDealIdempotencyKey = `web.crm.deal.create:${randomUUID()}`;
  const [pipelineResult, dealsResult, accountsResult, contactsResult] = await Promise.all([
    ensureDefaultPipeline(crmContext),
    listDeals({ ...crmContext, limit: 200 }),
    listAccounts({ ...crmContext, limit: 200 }),
    listContacts({ ...crmContext, limit: 200 }),
  ]);

  if (!pipelineResult.ok) {
    if (isCrmForbidden(pipelineResult.error)) {
      forbidden();
    }

    throw pipelineResult.error;
  }

  if (!dealsResult.ok) {
    if (isCrmForbidden(dealsResult.error)) {
      forbidden();
    }

    throw dealsResult.error;
  }

  if (!accountsResult.ok) {
    if (isCrmForbidden(accountsResult.error)) {
      forbidden();
    }

    throw accountsResult.error;
  }

  if (!contactsResult.ok) {
    if (isCrmForbidden(contactsResult.error)) {
      forbidden();
    }

    throw contactsResult.error;
  }

  const accounts = accountsResult.value.rows;
  const contacts = contactsResult.value.rows;
  const stageColumns = pipelineResult.value.stages.map((stage) => ({
    stage,
    deals:
      dealsResult.value.rows
        .find((column) => column.stage.id === stage.id)
        ?.deals.filter((deal) => deal.status === "open") ?? [],
  }));
  const closedDeals = dealsResult.value.rows
    .flatMap((column) => column.deals)
    .filter((deal) => deal.status !== "open");
  const openDealCount = stageColumns.reduce((total, column) => total + column.deals.length, 0);

  return (
    <>
      <CrmPageStyles />
      <div className="page crm-page">
        <div className="crm-page-stack page-stack">
          <div className="page-header">
            <div>
              <h1>Deals</h1>
              <p className="page-sub">
                {pipelineResult.value.pipeline.name} · {openDealCount} open · {closedDeals.length}{" "}
                closed
                {dealsResult.value.hasMore
                  ? ` · first ${openDealCount + closedDeals.length} of ${dealsResult.value.totalCount} deals shown`
                  : ""}
              </p>
            </div>
            <DealCreateDialog
              accounts={accounts}
              contacts={contacts}
              accountsTruncated={accountsResult.value.hasMore}
              contactsTruncated={contactsResult.value.hasMore}
              currentUserName={context.user.name}
              idempotencyKey={createDealIdempotencyKey}
            />
          </div>

          <div className="crm-deals-layout">
            <section aria-label="Open deal pipeline">
              <div className="board-columns crm-deals-board" role="region" aria-label="Deal board">
                {stageColumns.map((column) => (
                  <section
                    className="board-col"
                    aria-labelledby={`deal-stage-${column.stage.id}`}
                    key={column.stage.id}
                  >
                    <div className="board-col-header">
                      <h2 className="board-col-title" id={`deal-stage-${column.stage.id}`}>
                        {column.stage.name}
                      </h2>
                      <span
                        className={
                          column.deals.length === 0 ? "count-pill" : "count-pill count-pill-accent"
                        }
                        aria-label={`${column.deals.length} open deals in ${column.stage.name}`}
                      >
                        {column.deals.length}
                      </span>
                    </div>
                    <div className="board-col-cards">
                      {column.deals.length === 0 ? (
                        <div className="card">
                          <div className="empty">
                            <div className="empty-icon" aria-hidden="true">
                              ✓
                            </div>
                            <p className="empty-title">No deals here</p>
                            <p className="empty-desc">
                              Deals will appear here when they move into {column.stage.name}.
                            </p>
                          </div>
                        </div>
                      ) : (
                        column.deals.map((deal) => (
                          <article
                            className="ct-card crm-deal-card"
                            key={deal.id}
                            style={dealStageCardStyle(column.stage.position)}
                            aria-label={`Deal: ${deal.title}`}
                          >
                            <div className="ct-card-top">
                              <span className="ct-card-id">Deal</span>
                              <span className="ct-card-age">· {relativeTime(deal.updatedAt)}</span>
                              <span className="u-grow" />
                              <span className="badge badge-accent">
                                {formatMoney(deal.valueCents, deal.currency)}
                              </span>
                            </div>
                            <div className="ct-card-labels">
                              <a className="ct-label" href={`/crm/accounts/${deal.accountId}`}>
                                {deal.accountName}
                              </a>
                              {deal.primaryContactId === null ||
                              deal.primaryContactName === null ? (
                                <span className="ct-label">No primary contact</span>
                              ) : (
                                <a
                                  className="ct-label"
                                  href={`/crm/contacts/${deal.primaryContactId}`}
                                >
                                  {deal.primaryContactName}
                                </a>
                              )}
                            </div>
                            <p className="ct-card-title">{deal.title}</p>
                            <div className="ct-card-foot">
                              <span className="task-avatar" aria-hidden="true">
                                {ownerLabel(deal.ownerUserId, context).slice(0, 2).toUpperCase()}
                              </span>
                              <span
                                className="u-subtle u-truncate"
                                style={{ fontSize: "var(--text-xs)", flex: 1, minWidth: 0 }}
                              >
                                {ownerLabel(deal.ownerUserId, context)}
                              </span>
                              {deal.expectedCloseDate === null ? null : (
                                <span className="ct-mini">
                                  <span aria-hidden="true">↳</span>
                                  {deal.expectedCloseDate}
                                </span>
                              )}
                            </div>

                            <ActionStateForm
                              action={moveDealStageAction}
                              className="crm-deal-move-form"
                              errorTitle="Could not move deal"
                            >
                              <input type="hidden" name="dealId" value={deal.id} />
                              <label className="u-sr-only" htmlFor={`deal-${deal.id}-stage`}>
                                Move {deal.title} to stage
                              </label>
                              <select
                                className="select"
                                id={`deal-${deal.id}-stage`}
                                name="stageId"
                                defaultValue={deal.stageId}
                              >
                                {pipelineResult.value.stages.map((stage) => (
                                  <option value={stage.id} key={stage.id}>
                                    {stage.name}
                                  </option>
                                ))}
                              </select>
                              <button className="btn btn-sm" type="submit">
                                Move
                              </button>
                            </ActionStateForm>

                            <div className="crm-deal-close-actions">
                              {(["won", "lost"] as const).map((outcome) => (
                                <details className="issues-new-menu crm-new-menu" key={outcome}>
                                  <summary className="btn btn-sm">
                                    Mark {dealStatusLabel(outcome)}
                                  </summary>
                                  <ActionStateForm
                                    action={closeDealAction}
                                    className="issues-new-form crm-new-form"
                                    errorTitle={`Could not mark deal ${dealStatusLabel(outcome).toLowerCase()}`}
                                  >
                                    <input type="hidden" name="dealId" value={deal.id} />
                                    <input type="hidden" name="outcome" value={outcome} />
                                    <div className="field">
                                      <label
                                        className="label"
                                        htmlFor={`deal-${deal.id}-${outcome}-reason`}
                                      >
                                        Reason
                                      </label>
                                      <textarea
                                        className="textarea"
                                        id={`deal-${deal.id}-${outcome}-reason`}
                                        name="closeReason"
                                        rows={3}
                                        maxLength={1000}
                                      />
                                    </div>
                                    <button className="btn btn-primary btn-sm" type="submit">
                                      Mark {dealStatusLabel(outcome)}
                                    </button>
                                  </ActionStateForm>
                                </details>
                              ))}
                            </div>
                          </article>
                        ))
                      )}
                    </div>
                  </section>
                ))}
              </div>
            </section>

            <aside className="card" aria-labelledby="closed-deals-heading">
              <div className="card-header">
                <h2 className="card-title" id="closed-deals-heading">
                  Closed
                </h2>
                <span className="count-pill">{closedDeals.length}</span>
              </div>
              <div className="card-body">
                {closedDeals.length === 0 ? (
                  <p className="u-subtle">No closed deals yet.</p>
                ) : (
                  <div className="crm-list-stack crm-closed-list">
                    {closedDeals.map((deal) => (
                      <article key={deal.id}>
                        <div className="u-row" style={{ justifyContent: "space-between", gap: 8 }}>
                          <strong>{deal.title}</strong>
                          <span className={dealStatusBadgeClassName(deal.status)}>
                            {dealStatusLabel(deal.status)}
                          </span>
                        </div>
                        <p className="u-subtle">
                          {deal.accountName} · {formatMoney(deal.valueCents, deal.currency)}
                        </p>
                        {deal.closeReason === null ? null : (
                          <p className="u-subtle">{deal.closeReason}</p>
                        )}
                        <ActionStateForm
                          action={reopenDealAction}
                          errorTitle="Could not reopen deal"
                          style={{ marginTop: "var(--space-2)" }}
                        >
                          <input type="hidden" name="dealId" value={deal.id} />
                          <button className="btn btn-sm" type="submit">
                            Reopen
                          </button>
                        </ActionStateForm>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}
