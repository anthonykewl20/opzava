import { randomUUID } from "node:crypto";

import { ensureDefaultPipeline, listAccounts, listContacts, listDeals } from "@opzava/crm";
import { forbidden, redirect } from "next/navigation";

import {
  closeDealAction,
  createDealAction,
  moveDealStageAction,
  reopenDealAction,
} from "@/app/(app)/crm/deals/actions";
import {
  crmContextInput,
  dealStatusBadgeClassName,
  dealStatusLabel,
  formatMoney,
  isCrmForbidden,
  ownerLabel,
} from "@/lib/crm-pages";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DealsPage() {
  const context = await getAppSessionContext();
  if (context === null) {
    redirect("/login");
  }

  const crmContext = crmContextInput(context);
  const createDealIdempotencyKey = `web.crm.deal.create:${randomUUID()}`;
  const [pipelineResult, dealsResult, accountsResult, contactsResult] = await Promise.all([
    ensureDefaultPipeline(crmContext),
    listDeals(crmContext),
    listAccounts(crmContext),
    listContacts(crmContext),
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

  const accounts = accountsResult.value;
  const contacts = contactsResult.value;
  const stageColumns = pipelineResult.value.stages.map((stage) => ({
    stage,
    deals:
      dealsResult.value
        .find((column) => column.stage.id === stage.id)
        ?.deals.filter((deal) => deal.status === "open") ?? [],
  }));
  const closedDeals = dealsResult.value
    .flatMap((column) => column.deals)
    .filter((deal) => deal.status !== "open");
  const openDealCount = stageColumns.reduce((total, column) => total + column.deals.length, 0);

  return (
    <div className="page">
      <div className="page-stack">
        <div className="page-header">
          <div>
            <h1>Deals</h1>
            <p className="page-sub">
              {pipelineResult.value.pipeline.name} · {openDealCount} open · {closedDeals.length}{" "}
              closed
            </p>
          </div>
          {accounts.length === 0 ? (
            <a className="btn btn-primary" href="/crm/accounts">
              <span aria-hidden="true">+</span>
              Add account
            </a>
          ) : (
            <details className="issues-new-menu">
              <summary className="btn btn-primary">
                <span aria-hidden="true">+</span>
                New deal
              </summary>
              <form className="issues-new-form" action={createDealAction}>
                <input type="hidden" name="idempotencyKey" value={createDealIdempotencyKey} />
                <div className="field">
                  <label className="label" htmlFor="new-deal-title">
                    Title
                  </label>
                  <input
                    className="input"
                    id="new-deal-title"
                    name="title"
                    type="text"
                    required
                    maxLength={240}
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor="new-deal-account">
                    Account
                  </label>
                  <select className="select" id="new-deal-account" name="accountId" required>
                    {accounts.map((account) => (
                      <option value={account.id} key={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="label" htmlFor="new-deal-contact">
                    Primary contact
                  </label>
                  <select className="select" id="new-deal-contact" name="primaryContactId">
                    <option value="">No primary contact</option>
                    {contacts.map((contact) => (
                      <option value={contact.id} key={contact.id}>
                        {contact.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                    gap: "var(--space-3)",
                  }}
                >
                  <div className="field">
                    <label className="label" htmlFor="new-deal-value">
                      Value
                    </label>
                    <input
                      className="input"
                      id="new-deal-value"
                      name="value"
                      type="number"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="new-deal-currency">
                      Currency
                    </label>
                    <input
                      className="input"
                      id="new-deal-currency"
                      name="currency"
                      type="text"
                      maxLength={3}
                      placeholder="USD"
                    />
                  </div>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                    gap: "var(--space-3)",
                  }}
                >
                  <div className="field">
                    <label className="label" htmlFor="new-deal-close">
                      Expected close
                    </label>
                    <input
                      className="input"
                      id="new-deal-close"
                      name="expectedCloseDate"
                      type="date"
                    />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="new-deal-owner">
                      Owner
                    </label>
                    <select className="select" id="new-deal-owner" name="owner">
                      <option value="">Unassigned</option>
                      <option value="me">{context.user.name}</option>
                    </select>
                  </div>
                </div>
                <button className="btn btn-primary" type="submit">
                  Create deal
                </button>
              </form>
            </details>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
            gap: "var(--space-4)",
          }}
        >
          <section aria-label="Open deal pipeline">
            {openDealCount === 0 ? (
              <div className="card">
                <div className="empty">
                  <p className="empty-title">No open deals</p>
                  <p className="empty-desc">Create a deal to start tracking pipeline movement.</p>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: "var(--space-3)",
                }}
              >
                {stageColumns.map((column) => (
                  <div className="card" key={column.stage.id}>
                    <div className="card-header">
                      <h2 className="card-title">{column.stage.name}</h2>
                      <span className="badge">{column.deals.length}</span>
                    </div>
                    <div className="card-body">
                      {column.deals.length === 0 ? (
                        <p className="u-subtle">No open deals in this stage.</p>
                      ) : (
                        <div style={{ display: "grid", gap: "var(--space-3)" }}>
                          {column.deals.map((deal) => (
                            <article
                              key={deal.id}
                              style={{
                                padding: "var(--space-3)",
                                border: "1px solid var(--border)",
                                borderRadius: "var(--radius-lg)",
                                background: "var(--surface-2)",
                              }}
                            >
                              <div>
                                <div className="u-row" style={{ justifyContent: "space-between" }}>
                                  <strong>{deal.title}</strong>
                                  <span className="badge badge-accent">
                                    {formatMoney(deal.valueCents, deal.currency)}
                                  </span>
                                </div>
                                <p className="u-subtle">
                                  <a href={`/crm/accounts/${deal.accountId}`}>{deal.accountName}</a>
                                </p>
                                <p className="u-subtle">
                                  {deal.primaryContactId === null ||
                                  deal.primaryContactName === null ? (
                                    "No primary contact"
                                  ) : (
                                    <a href={`/crm/contacts/${deal.primaryContactId}`}>
                                      {deal.primaryContactName}
                                    </a>
                                  )}
                                </p>
                                <p className="u-subtle">{ownerLabel(deal.ownerUserId, context)}</p>

                                <form
                                  action={moveDealStageAction}
                                  style={{
                                    display: "flex",
                                    gap: "var(--space-2)",
                                    marginTop: "var(--space-3)",
                                  }}
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
                                </form>

                                <div
                                  style={{
                                    display: "grid",
                                    gap: "var(--space-2)",
                                    marginTop: "var(--space-3)",
                                  }}
                                >
                                  {(["won", "lost"] as const).map((outcome) => (
                                    <details className="issues-new-menu" key={outcome}>
                                      <summary className="btn btn-sm">
                                        Mark {dealStatusLabel(outcome)}
                                      </summary>
                                      <form className="issues-new-form" action={closeDealAction}>
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
                                      </form>
                                    </details>
                                  ))}
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <aside className="card" aria-labelledby="closed-deals-heading">
            <div className="card-header">
              <h2 className="card-title" id="closed-deals-heading">
                Closed
              </h2>
              <span className="badge">{closedDeals.length}</span>
            </div>
            <div className="card-body">
              {closedDeals.length === 0 ? (
                <p className="u-subtle">No closed deals yet.</p>
              ) : (
                <div style={{ display: "grid", gap: "var(--space-3)" }}>
                  {closedDeals.map((deal) => (
                    <article key={deal.id}>
                      <div className="u-row" style={{ justifyContent: "space-between" }}>
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
                      <form action={reopenDealAction} style={{ marginTop: "var(--space-2)" }}>
                        <input type="hidden" name="dealId" value={deal.id} />
                        <button className="btn btn-sm" type="submit">
                          Reopen
                        </button>
                      </form>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
