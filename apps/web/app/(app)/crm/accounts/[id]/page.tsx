import { getAccount, listAccounts, listContacts, listDeals, listTickets } from "@opzava/crm";
import { forbidden, notFound, redirect } from "next/navigation";

import { updateAccountAction } from "@/app/(app)/crm/accounts/actions";
import {
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
      listAccounts(crmContext),
      listContacts(crmContext),
      listDeals(crmContext),
      listTickets(crmContext),
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
  const accounts = accountsResult.value;
  const parentAccount = accounts.find((item) => item.id === account.parentAccountId) ?? null;
  const childAccounts = accounts.filter((item) => item.parentAccountId === account.id);
  const contacts = contactsResult.value.filter((contact) => contact.accountId === account.id);
  const deals = dealsResult.value
    .flatMap((column) => column.deals)
    .filter((deal) => deal.accountId === account.id);
  const tickets = ticketsResult.value.filter((ticket) => ticket.accountId === account.id);

  return (
    <div className="page">
      <div className="page-stack">
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

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
            gap: "var(--space-4)",
          }}
        >
          <div className="page-stack">
            <section aria-labelledby="account-profile-heading">
              <div className="card">
                <div className="card-header">
                  <h2 className="card-title" id="account-profile-heading">
                    Profile
                  </h2>
                </div>
                <div className="card-body">
                  <dl
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                      gap: "var(--space-3)",
                    }}
                  >
                    <dt className="u-subtle">Domain</dt>
                    <dd>{account.domain ?? "None"}</dd>
                    <dt className="u-subtle">Industry</dt>
                    <dd>{account.industry ?? "None"}</dd>
                    <dt className="u-subtle">Website</dt>
                    <dd>
                      {account.website === null ? (
                        "None"
                      ) : (
                        <a href={account.website} target="_blank" rel="noopener noreferrer">
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
                    <form
                      action={updateAccountAction}
                      style={{
                        display: "grid",
                        gap: "var(--space-3)",
                        marginTop: "var(--space-4)",
                      }}
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
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                          gap: "var(--space-3)",
                        }}
                      >
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
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                          gap: "var(--space-3)",
                        }}
                      >
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
                    </form>
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
                  <span className="badge">{contacts.length}</span>
                </div>
                {contacts.length === 0 ? (
                  <div className="empty">
                    <p className="empty-title">No contacts at this account</p>
                    <p className="empty-desc">
                      Assign contacts to this account from the contact profile.
                    </p>
                  </div>
                ) : (
                  <table className="table table-cards">
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
                            <a href={`/crm/contacts/${contact.id}`}>{contact.displayName}</a>
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

          <aside className="page-stack" aria-label="Account relationships and work">
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Child accounts</h2>
                <span className="badge">{childAccounts.length}</span>
              </div>
              <div className="card-body">
                {childAccounts.length === 0 ? (
                  <p className="u-subtle">No child accounts.</p>
                ) : (
                  <div style={{ display: "grid", gap: "var(--space-3)" }}>
                    {childAccounts.map((child) => (
                      <div key={child.id}>
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
                <span className="badge">{deals.length}</span>
              </div>
              <div className="card-body">
                {deals.length === 0 ? (
                  <p className="u-subtle">No deals linked to this account.</p>
                ) : (
                  <div style={{ display: "grid", gap: "var(--space-3)" }}>
                    {deals.map((deal) => (
                      <div key={deal.id}>
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
                <span className="badge">{tickets.length}</span>
              </div>
              <div className="card-body">
                {tickets.length === 0 ? (
                  <p className="u-subtle">No tickets linked to this account.</p>
                ) : (
                  <div style={{ display: "grid", gap: "var(--space-3)" }}>
                    {tickets.map((ticket) => (
                      <div key={ticket.id}>
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
  );
}
