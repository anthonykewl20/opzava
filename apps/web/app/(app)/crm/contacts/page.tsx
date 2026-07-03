import { randomUUID } from "node:crypto";

import { listAccounts, listContacts } from "@opzava/crm";
import { forbidden, redirect } from "next/navigation";

import { CrmPageStyles, CrmPlusIcon } from "@/app/(app)/crm/_components/crm-page-styles";
import { createContactAction } from "@/app/(app)/crm/contacts/actions";
import { ActionStateForm } from "@/components/forms/action-state-form";
import {
  crmContextInput,
  isCrmForbidden,
  lifecycleBadgeClassName,
  lifecycleLabel,
  ownerLabel,
} from "@/lib/crm-pages";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const context = await getAppSessionContext();
  if (context === null) {
    redirect("/login");
  }

  const createContactIdempotencyKey = `web.crm.contact.create:${randomUUID()}`;
  const crmContext = crmContextInput(context);
  const [contactsResult, accountsResult] = await Promise.all([
    listContacts({ ...crmContext, limit: 200 }),
    listAccounts({ ...crmContext, limit: 200 }),
  ]);

  if (!contactsResult.ok) {
    if (isCrmForbidden(contactsResult.error)) {
      forbidden();
    }

    throw contactsResult.error;
  }

  if (!accountsResult.ok) {
    if (isCrmForbidden(accountsResult.error)) {
      forbidden();
    }

    throw accountsResult.error;
  }

  const contacts = contactsResult.value.rows;
  const accounts = accountsResult.value.rows;

  return (
    <>
      <CrmPageStyles />
      <div className="page crm-page">
        <div className="crm-page-stack page-stack">
          <div className="page-header">
            <div>
              <h1>Contacts</h1>
              <p className="page-sub">People, lifecycle stage, and linked work in this workspace</p>
            </div>
            <details className="issues-new-menu crm-new-menu">
              <summary className="btn btn-primary">
                <CrmPlusIcon />
                New contact
              </summary>
              <ActionStateForm
                action={createContactAction}
                className="issues-new-form crm-new-form"
                errorTitle="Could not create contact"
              >
                <input type="hidden" name="idempotencyKey" value={createContactIdempotencyKey} />
                <div className="field">
                  <label className="label" htmlFor="new-contact-name">
                    Display name
                  </label>
                  <input
                    className="input"
                    id="new-contact-name"
                    name="displayName"
                    type="text"
                    required
                    maxLength={240}
                  />
                </div>
                <div className="crm-form-grid">
                  <div className="field">
                    <label className="label" htmlFor="new-contact-email">
                      Email
                    </label>
                    <input
                      className="input"
                      id="new-contact-email"
                      name="email"
                      type="email"
                      maxLength={320}
                    />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="new-contact-phone">
                      Phone
                    </label>
                    <input
                      className="input"
                      id="new-contact-phone"
                      name="phone"
                      type="tel"
                      maxLength={80}
                    />
                  </div>
                </div>
                <div className="field">
                  <label className="label" htmlFor="new-contact-title">
                    Title
                  </label>
                  <input
                    className="input"
                    id="new-contact-title"
                    name="title"
                    type="text"
                    maxLength={240}
                  />
                </div>
                <div className="crm-form-grid">
                  <div className="field">
                    <label className="label" htmlFor="new-contact-lifecycle">
                      Lifecycle
                    </label>
                    <select className="select" id="new-contact-lifecycle" name="lifecycleStage">
                      <option value="lead">Lead</option>
                      <option value="qualified">Qualified</option>
                      <option value="customer">Customer</option>
                      <option value="former">Former</option>
                    </select>
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="new-contact-owner">
                      Owner
                    </label>
                    <select className="select" id="new-contact-owner" name="owner">
                      <option value="">Unassigned</option>
                      <option value="me">{context.user.name}</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label className="label" htmlFor="new-contact-account">
                    Account
                  </label>
                  <select className="select" id="new-contact-account" name="accountId">
                    <option value="">No account</option>
                    {accounts.map((account) => (
                      <option value={account.id} key={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="label" htmlFor="new-contact-notes">
                    Notes
                  </label>
                  <textarea
                    className="textarea"
                    id="new-contact-notes"
                    name="notes"
                    rows={4}
                    maxLength={4000}
                  />
                </div>
                <button className="btn btn-primary" type="submit">
                  Create contact
                </button>
              </ActionStateForm>
            </details>
          </div>

          <section aria-label="CRM contacts">
            <div className="card crm-table-card">
              {contacts.length === 0 ? (
                <div className="empty">
                  <p className="empty-title">No contacts yet</p>
                  <p className="empty-desc">
                    Create the first contact to start tracking CRM activity.
                  </p>
                </div>
              ) : (
                <table className="table table-compact table-cards crm-table">
                  <caption className="u-sr-only">
                    CRM contacts by name, title, account, lifecycle, email, open deals, and open
                    tickets.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Title</th>
                      <th scope="col">Account</th>
                      <th scope="col">Lifecycle</th>
                      <th scope="col">Email</th>
                      <th scope="col">Deals</th>
                      <th scope="col">Tickets</th>
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
                          <p className="u-subtle crm-cell-note">
                            {ownerLabel(contact.ownerUserId, context)}
                          </p>
                        </td>
                        <td data-label="Title">
                          {contact.title ?? <span className="u-subtle">None</span>}
                        </td>
                        <td data-label="Account">
                          {contact.accountId === null || contact.accountName === null ? (
                            <span className="u-subtle">No account</span>
                          ) : (
                            <a href={`/crm/accounts/${contact.accountId}`}>{contact.accountName}</a>
                          )}
                        </td>
                        <td data-label="Lifecycle">
                          <span className={lifecycleBadgeClassName(contact.lifecycleStage)}>
                            {lifecycleLabel(contact.lifecycleStage)}
                          </span>
                        </td>
                        <td data-label="Email">
                          {contact.email === null ? (
                            <span className="u-subtle">None</span>
                          ) : (
                            <a href={`mailto:${contact.email}`}>{contact.email}</a>
                          )}
                        </td>
                        <td data-label="Deals" className="u-tnum">
                          {contact.openDealCount}
                        </td>
                        <td data-label="Tickets" className="u-tnum">
                          {contact.openTicketCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="card-footer">
                <p className="hint">
                  Showing {contacts.length} of {contactsResult.value.totalCount}
                  {contactsResult.value.hasMore
                    ? " \u00b7 first page only \u2014 load-more arrives with P4"
                    : ""}
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
