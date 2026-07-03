import { getAccount, listAccounts, listContacts, listDeals, listTickets } from "@opzava/crm";
import { forbidden, notFound, redirect } from "next/navigation";

import { CrmPageStyles } from "@/app/(app)/crm/_components/crm-page-styles";
import { updateAccountAction } from "@/app/(app)/crm/accounts/actions";
import { ActionStateForm } from "@/components/forms/action-state-form";
import {
  accountWebsiteHref,
  crmContextInput,
  formatMoney,
  isCrmForbidden,
  isCrmNotFound,
  ownerLabel,
} from "@/lib/crm-pages";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

interface AccountDetailPageProps {
  readonly params: Promise<{
    readonly id: string;
  }>;
}

export default async function AccountDetailPage({ params }: AccountDetailPageProps) {
  const { id } = await params;
  const context = await getAppSessionContext();
  if (context === null) {
    redirect("/login");
  }

  const crmContext = crmContextInput(context);
  const [accountResult, accountsResult, contactsResult, dealsResult, ticketsResult] =
    await Promise.all([
      getAccount({ ...crmContext, accountId: id }),
      listAccounts({ ...crmContext, limit: 200 }),
      listContacts({ ...crmContext, limit: 200 }),
      listDeals({ ...crmContext, limit: 200 }),
      listTickets({ ...crmContext, limit: 200 }),
    ]);

  if (!accountResult.ok) {
    if (isCrmNotFound(accountResult.error)) {
      notFound();
    }

    if (isCrmForbidden(accountResult.error)) {
      forbidden();
    }

    throw accountResult.error;
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

  const account = accountResult.value;
  const accounts = accountsResult.value.rows;
  const parentAccount = accounts.find((item) => item.id === account.parentAccountId) ?? null;
  const childAccounts = accounts.filter((item) => item.parentAccountId === account.id);
  const contacts = contactsResult.value.rows.filter((contact) => contact.accountId === account.id);
  const deals = dealsResult.value.rows
    .flatMap((column) => column.deals)
    .filter((deal) => deal.accountId === account.id);
  const tickets = ticketsResult.value.rows.filter((ticket) => ticket.accountId === account.id);
  const websiteHref = accountWebsiteHref(account.website);

  return (
    <>
      <CrmPageStyles />
      <div className="page crm-page">
        <div className="crm-page-stack page-stack">
          <div className="page-header">
            <div>
              <p className="page-sub">
                <a href="/crm/accounts">Accounts</a>
                {" / "}
                <span>{account.name}</span>
              </p>
              <h1>{account.name}</h1>
            </div>
            <span className="badge">{ownerLabel(account.ownerUserId, context)}</span>
          </div>

          {/* DESCOPE(crm-account-health): PRD-010 consent, activity summaries, and external-channel health arrive with the P4 CRM remainder; this page only renders backed account relationships. */}
          <div className="crm-detail-grid">
            <div className="crm-detail-main page-stack">
              <section aria-labelledby="account-profile-heading">
                <div className="card">
                  <div className="card-header">
                    <h2 className="card-title" id="account-profile-heading">
                      Profile
                    </h2>
                  </div>
                  <div className="card-body">
                    <dl className="crm-profile-list">
                      <dt className="u-subtle">Domain</dt>
                      <dd>{account.domain ?? "None"}</dd>
                      <dt className="u-subtle">Industry</dt>
                      <dd>{account.industry ?? "None"}</dd>
                      <dt className="u-subtle">Website</dt>
                      <dd>
                        {account.website === null ? (
                          "None"
                        ) : websiteHref === null ? (
                          account.website
                        ) : (
                          <a href={websiteHref} target="_blank" rel="noopener noreferrer">
                            {account.website}
                          </a>
                        )}
                      </dd>
                      <dt className="u-subtle">Parent</dt>
                      <dd>
                        {parentAccount === null ? (
                          "No parent"
                        ) : (
                          <a href={`/crm/accounts/${parentAccount.id}`}>{parentAccount.name}</a>
                        )}
                      </dd>
                      <dt className="u-subtle">Description</dt>
                      <dd>{account.description === "" ? "None" : account.description}</dd>
                    </dl>

                    <details style={{ marginTop: "var(--space-5)" }}>
                      <summary className="btn">Edit profile</summary>
                      <ActionStateForm
                        action={updateAccountAction}
                        className="crm-panel-form"
                        errorTitle="Could not save account"
                      >
                        <input type="hidden" name="accountId" value={account.id} />
                        <div className="field">
                          <label className="label" htmlFor="account-name">
                            Name
                          </label>
                          <input
                            className="input"
                            id="account-name"
                            name="name"
                            type="text"
                            required
                            maxLength={240}
                            defaultValue={account.name}
                          />
                        </div>
                        <div className="crm-form-grid">
                          <div className="field">
                            <label className="label" htmlFor="account-domain">
                              Domain
                            </label>
                            <input
                              className="input"
                              id="account-domain"
                              name="domain"
                              type="text"
                              maxLength={240}
                              defaultValue={account.domain ?? ""}
                            />
                          </div>
                          <div className="field">
                            <label className="label" htmlFor="account-industry">
                              Industry
                            </label>
                            <input
                              className="input"
                              id="account-industry"
                              name="industry"
                              type="text"
                              maxLength={240}
                              defaultValue={account.industry ?? ""}
                            />
                          </div>
                        </div>
                        <div className="field">
                          <label className="label" htmlFor="account-website">
                            Website
                          </label>
                          <input
                            className="input"
                            id="account-website"
                            name="website"
                            type="url"
                            maxLength={500}
                            defaultValue={account.website ?? ""}
                          />
                        </div>
                        <div className="crm-form-grid">
                          <div className="field">
                            <label className="label" htmlFor="account-owner">
                              Owner
                            </label>
                            <select
                              className="select"
                              id="account-owner"
                              name="owner"
                              defaultValue={
                                account.ownerUserId === null
                                  ? ""
                                  : account.ownerUserId === context.user.id
                                    ? "me"
                                    : "keep"
                              }
                            >
                              <option value="">Unassigned</option>
                              <option value="me">{context.user.name}</option>
                              {account.ownerUserId !== null &&
                              account.ownerUserId !== context.user.id ? (
                                <option value="keep">{account.ownerUserId}</option>
                              ) : null}
                            </select>
                          </div>
                          <div className="field">
                            <label className="label" htmlFor="account-parent">
                              Parent account
                            </label>
                            <select
                              className="select"
                              id="account-parent"
                              name="parentAccountId"
                              defaultValue={account.parentAccountId ?? ""}
                            >
                              <option value="">No parent</option>
                              {accounts
                                .filter((item) => item.id !== account.id)
                                .map((item) => (
                                  <option value={item.id} key={item.id}>
                                    {item.name}
                                  </option>
                                ))}
                            </select>
                          </div>
                        </div>
                        <div className="field">
                          <label className="label" htmlFor="account-description">
                            Description
                          </label>
                          <textarea
                            className="textarea"
                            id="account-description"
                            name="description"
                            rows={5}
                            maxLength={4000}
                            defaultValue={account.description}
                          />
                        </div>
                        <button className="btn btn-primary" type="submit">
                          Save account
                        </button>
                      </ActionStateForm>
                    </details>
                  </div>
                </div>
              </section>

              <section aria-labelledby="account-contacts-heading">
                <div className="card">
                  <div className="card-header">
                    <h2 className="card-title" id="account-contacts-heading">
                      Contacts
                    </h2>
                    <span className="count-pill">{contacts.length}</span>
                  </div>
                  {contacts.length === 0 ? (
                    <div className="empty">
                      <p className="empty-title">No contacts at this account</p>
                      <p className="empty-desc">
                        Assign contacts to this account from the contact profile.
                      </p>
                    </div>
                  ) : (
                    <table className="table table-compact table-cards crm-table">
                      <thead>
                        <tr>
                          <th scope="col">Name</th>
                          <th scope="col">Title</th>
                          <th scope="col">Email</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contacts.map((contact) => (
                          <tr key={contact.id}>
                            <td data-label="Name">
                              <a
                                className="issues-title-link crm-title-link"
                                href={`/crm/contacts/${contact.id}`}
                              >
                                {contact.displayName}
                              </a>
                            </td>
                            <td data-label="Title">{contact.title ?? "None"}</td>
                            <td data-label="Email">
                              {contact.email === null ? (
                                "None"
                              ) : (
                                <a href={`mailto:${contact.email}`}>{contact.email}</a>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>
            </div>

            <aside
              className="crm-detail-side page-stack"
              aria-label="Account relationships and work"
            >
              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">Child accounts</h2>
                  <span className="count-pill">{childAccounts.length}</span>
                </div>
                <div className="card-body">
                  {childAccounts.length === 0 ? (
                    <p className="u-subtle">No child accounts.</p>
                  ) : (
                    <div className="crm-list-stack">
                      {childAccounts.map((child) => (
                        <div className="crm-linked-item" key={child.id}>
                          <a href={`/crm/accounts/${child.id}`}>
                            <strong>{child.name}</strong>
                          </a>
                          <p className="u-subtle">{child.domain ?? "No domain"}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">Deals</h2>
                  <span className="count-pill">{deals.length}</span>
                </div>
                <div className="card-body">
                  {deals.length === 0 ? (
                    <p className="u-subtle">No deals linked to this account.</p>
                  ) : (
                    <div className="crm-list-stack">
                      {deals.map((deal) => (
                        <div className="crm-linked-item" key={deal.id}>
                          <strong>{deal.title}</strong>
                          <p className="u-subtle">
                            {deal.status} · {deal.stageName} ·{" "}
                            {formatMoney(deal.valueCents, deal.currency)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">Tickets</h2>
                  <span className="count-pill">{tickets.length}</span>
                </div>
                <div className="card-body">
                  {tickets.length === 0 ? (
                    <p className="u-subtle">No tickets linked to this account.</p>
                  ) : (
                    <div className="crm-list-stack">
                      {tickets.map((ticket) => (
                        <div className="crm-linked-item" key={ticket.id}>
                          <strong>{ticket.subject}</strong>
                          <p className="u-subtle">
                            {ticket.status} · {ticket.priority} · {ticket.queue}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}
