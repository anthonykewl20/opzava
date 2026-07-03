import { randomUUID } from "node:crypto";

import { listAccounts, listDeals, listTickets } from "@opzava/crm";
import { forbidden, redirect } from "next/navigation";

import { CrmPageStyles, CrmPlusIcon } from "@/app/(app)/crm/_components/crm-page-styles";
import { createAccountAction } from "@/app/(app)/crm/accounts/actions";
import { ActionStateForm } from "@/components/forms/action-state-form";
import {
  accountOpenDealCount,
  accountOpenTicketCount,
  crmContextInput,
  isCrmForbidden,
  openDealsFromColumns,
  ownerLabel,
} from "@/lib/crm-pages";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const context = await getAppSessionContext();
  if (context === null) {
    redirect("/login");
  }

  const createAccountIdempotencyKey = `web.crm.account.create:${randomUUID()}`;
  const crmContext = crmContextInput(context);
  const [accountsResult, dealsResult, ticketsResult] = await Promise.all([
    listAccounts(crmContext),
    listDeals(crmContext),
    listTickets(crmContext),
  ]);

  if (!accountsResult.ok) {
    if (isCrmForbidden(accountsResult.error)) {
      forbidden();
    }

    throw accountsResult.error;
  }

  if (!dealsResult.ok) {
    if (isCrmForbidden(dealsResult.error)) {
      forbidden();
    }

    throw dealsResult.error;
  }

  if (!ticketsResult.ok) {
    if (isCrmForbidden(ticketsResult.error)) {
      forbidden();
    }

    throw ticketsResult.error;
  }

  const accounts = accountsResult.value;
  const openDeals = openDealsFromColumns(dealsResult.value);
  const tickets = ticketsResult.value;

  return (
    <>
      <CrmPageStyles />
      <div className="page crm-page">
        <div className="crm-page-stack page-stack">
          <div className="page-header">
            <div>
              <h1>Accounts</h1>
              <p className="page-sub">Companies, ownership, and linked customer work</p>
            </div>
            <details className="issues-new-menu crm-new-menu">
              <summary className="btn btn-primary">
                <CrmPlusIcon />
                New account
              </summary>
              <ActionStateForm
                action={createAccountAction}
                className="issues-new-form crm-new-form"
                errorTitle="Could not create account"
              >
                <input type="hidden" name="idempotencyKey" value={createAccountIdempotencyKey} />
                <div className="field">
                  <label className="label" htmlFor="new-account-name">
                    Name
                  </label>
                  <input
                    className="input"
                    id="new-account-name"
                    name="name"
                    type="text"
                    required
                    maxLength={240}
                  />
                </div>
                <div className="crm-form-grid">
                  <div className="field">
                    <label className="label" htmlFor="new-account-domain">
                      Domain
                    </label>
                    <input
                      className="input"
                      id="new-account-domain"
                      name="domain"
                      type="text"
                      maxLength={240}
                    />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="new-account-industry">
                      Industry
                    </label>
                    <input
                      className="input"
                      id="new-account-industry"
                      name="industry"
                      type="text"
                      maxLength={240}
                    />
                  </div>
                </div>
                <div className="field">
                  <label className="label" htmlFor="new-account-website">
                    Website
                  </label>
                  <input
                    className="input"
                    id="new-account-website"
                    name="website"
                    type="url"
                    maxLength={500}
                  />
                </div>
                <div className="crm-form-grid">
                  <div className="field">
                    <label className="label" htmlFor="new-account-owner">
                      Owner
                    </label>
                    <select className="select" id="new-account-owner" name="owner">
                      <option value="">Unassigned</option>
                      <option value="me">{context.user.name}</option>
                    </select>
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="new-account-parent">
                      Parent account
                    </label>
                    <select className="select" id="new-account-parent" name="parentAccountId">
                      <option value="">No parent</option>
                      {accounts.map((account) => (
                        <option value={account.id} key={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label className="label" htmlFor="new-account-description">
                    Description
                  </label>
                  <textarea
                    className="textarea"
                    id="new-account-description"
                    name="description"
                    rows={4}
                    maxLength={4000}
                  />
                </div>
                <button className="btn btn-primary" type="submit">
                  Create account
                </button>
              </ActionStateForm>
            </details>
          </div>

          <section aria-label="CRM accounts">
            <div className="card crm-table-card">
              {accounts.length === 0 ? (
                <div className="empty">
                  <p className="empty-title">No accounts yet</p>
                  <p className="empty-desc">
                    Create an account to group contacts, deals, and tickets.
                  </p>
                </div>
              ) : (
                <table className="table table-compact table-cards crm-table">
                  <caption className="u-sr-only">
                    CRM accounts by name, domain, industry, owner, contacts, open deals, and open
                    tickets.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Domain</th>
                      <th scope="col">Industry</th>
                      <th scope="col">Owner</th>
                      <th scope="col">Contacts</th>
                      <th scope="col">Deals</th>
                      <th scope="col">Tickets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((account) => (
                      <tr key={account.id}>
                        <td data-label="Name">
                          <a
                            className="issues-title-link crm-title-link"
                            href={`/crm/accounts/${account.id}`}
                          >
                            {account.name}
                          </a>
                        </td>
                        <td data-label="Domain">
                          {account.domain === null ? (
                            <span className="u-subtle">None</span>
                          ) : (
                            account.domain
                          )}
                        </td>
                        <td data-label="Industry">
                          {account.industry === null ? (
                            <span className="u-subtle">None</span>
                          ) : (
                            account.industry
                          )}
                        </td>
                        <td data-label="Owner">{ownerLabel(account.ownerUserId, context)}</td>
                        <td data-label="Contacts" className="u-tnum">
                          {account.contactCount}
                        </td>
                        <td data-label="Deals" className="u-tnum">
                          {accountOpenDealCount(account, openDeals)}
                        </td>
                        <td data-label="Tickets" className="u-tnum">
                          {accountOpenTicketCount(account, tickets)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
