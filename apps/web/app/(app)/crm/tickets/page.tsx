import { randomUUID } from "node:crypto";

import {
  crmTicketPriorities,
  crmTicketStatuses,
  listAccounts,
  listContacts,
  listTickets,
  type CrmTicketStatus,
} from "@opzava/crm";
import { forbidden, redirect } from "next/navigation";

import { CrmPageStyles, CrmPlusIcon } from "@/app/(app)/crm/_components/crm-page-styles";
import { createTicketAction, updateTicketStatusAction } from "@/app/(app)/crm/tickets/actions";
import { ActionStateForm } from "@/components/forms/action-state-form";
import {
  crmContextInput,
  isCrmForbidden,
  ownerLabel,
  relativeTime,
  ticketPriorityBadgeClassName,
  ticketPriorityLabel,
  ticketStatusLabel,
} from "@/lib/crm-pages";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

interface TicketsPageProps {
  readonly searchParams?: Promise<{
    readonly status?: string;
  }>;
}

function normalizedStatus(value: string | undefined): CrmTicketStatus | undefined {
  return crmTicketStatuses.includes(value as CrmTicketStatus)
    ? (value as CrmTicketStatus)
    : undefined;
}

export default async function TicketsPage({ searchParams }: TicketsPageProps) {
  const context = await getAppSessionContext();
  if (context === null) {
    redirect("/login");
  }

  const params = await searchParams;
  const filter = normalizedStatus(params?.status);
  const activeFilter = filter ?? "all";
  const crmContext = crmContextInput(context);
  const createTicketIdempotencyKey = `web.crm.ticket.create:${randomUUID()}`;
  const [ticketsResult, accountsResult, contactsResult] = await Promise.all([
    listTickets({
      ...crmContext,
      ...(filter === undefined ? {} : { status: filter }),
      limit: 200,
    }),
    listAccounts({ ...crmContext, limit: 200 }),
    listContacts({ ...crmContext, limit: 200 }),
  ]);

  if (!ticketsResult.ok) {
    if (isCrmForbidden(ticketsResult.error)) {
      forbidden();
    }

    throw ticketsResult.error;
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

  const tickets = ticketsResult.value.rows;
  const accounts = accountsResult.value.rows;
  const contacts = contactsResult.value.rows;

  return (
    <>
      <CrmPageStyles />
      <div className="page crm-page">
        <div className="crm-page-stack page-stack">
          <div className="page-header">
            <div>
              <h1>Tickets</h1>
              <p className="page-sub">Customer queue ordered by priority and age</p>
            </div>
            {contacts.length === 0 ? (
              <a className="btn btn-primary" href="/crm/contacts">
                <CrmPlusIcon />
                Add contact
              </a>
            ) : (
              <details className="issues-new-menu crm-new-menu">
                <summary className="btn btn-primary">
                  <CrmPlusIcon />
                  New ticket
                </summary>
                <ActionStateForm
                  action={createTicketAction}
                  className="issues-new-form crm-new-form"
                  errorTitle="Could not create ticket"
                >
                  <input type="hidden" name="idempotencyKey" value={createTicketIdempotencyKey} />
                  <div className="field">
                    <label className="label" htmlFor="new-ticket-subject">
                      Subject
                    </label>
                    <input
                      className="input"
                      id="new-ticket-subject"
                      name="subject"
                      type="text"
                      required
                      maxLength={240}
                    />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="new-ticket-contact">
                      Contact
                    </label>
                    <select className="select" id="new-ticket-contact" name="contactId" required>
                      {contacts.map((contact) => (
                        <option value={contact.id} key={contact.id}>
                          {contact.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="new-ticket-body">
                      Body
                    </label>
                    <textarea
                      className="textarea"
                      id="new-ticket-body"
                      name="body"
                      rows={4}
                      maxLength={8000}
                    />
                  </div>
                  <div className="crm-form-grid-sm">
                    <div className="field">
                      <label className="label" htmlFor="new-ticket-priority">
                        Priority
                      </label>
                      <select className="select" id="new-ticket-priority" name="priority">
                        {crmTicketPriorities.map((priority) => (
                          <option value={priority} key={priority}>
                            {ticketPriorityLabel(priority)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="new-ticket-queue">
                        Queue
                      </label>
                      <input
                        className="input"
                        id="new-ticket-queue"
                        name="queue"
                        type="text"
                        maxLength={120}
                        defaultValue="support"
                      />
                    </div>
                  </div>
                  <div className="crm-form-grid-sm">
                    <div className="field">
                      <label className="label" htmlFor="new-ticket-account">
                        Account
                      </label>
                      <select className="select" id="new-ticket-account" name="accountId">
                        <option value="">No account</option>
                        {accounts.map((account) => (
                          <option value={account.id} key={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="new-ticket-assignee">
                        Assignee
                      </label>
                      <select className="select" id="new-ticket-assignee" name="assignee">
                        <option value="">Unassigned</option>
                        <option value="me">{context.user.name}</option>
                      </select>
                    </div>
                  </div>
                  <button className="btn btn-primary" type="submit">
                    Create ticket
                  </button>
                </ActionStateForm>
              </details>
            )}
          </div>

          <section aria-label="Ticket queue">
            <div className="card crm-table-card">
              <div className="tabs" role="tablist" aria-label="Filter tickets">
                <a
                  className="tab"
                  role="tab"
                  aria-selected={activeFilter === "all"}
                  aria-current={activeFilter === "all" ? "page" : undefined}
                  href="/crm/tickets"
                >
                  All
                </a>
                {crmTicketStatuses.map((status) => (
                  <a
                    className="tab"
                    role="tab"
                    aria-selected={activeFilter === status}
                    aria-current={activeFilter === status ? "page" : undefined}
                    href={`/crm/tickets?status=${status}`}
                    key={status}
                  >
                    {ticketStatusLabel(status)}
                  </a>
                ))}
              </div>

              {tickets.length === 0 ? (
                <div className="empty">
                  <p className="empty-title">No tickets match this view</p>
                  <p className="empty-desc">Create a ticket or choose another status filter.</p>
                </div>
              ) : (
                <table className="table table-compact table-cards crm-table">
                  <caption className="u-sr-only">
                    CRM tickets by subject, contact, account, status, priority, queue, assignee, and
                    created time.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Subject</th>
                      <th scope="col">Contact</th>
                      <th scope="col">Account</th>
                      <th scope="col">Status</th>
                      <th scope="col">Priority</th>
                      <th scope="col">Queue</th>
                      <th scope="col">Assignee</th>
                      <th scope="col">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((ticket) => (
                      <tr key={ticket.id}>
                        <td data-label="Subject">
                          <a
                            className="issues-title-link crm-title-link"
                            href={`/crm/tickets/${ticket.id}`}
                          >
                            {ticket.subject}
                          </a>
                          {ticket.body === "" ? null : (
                            <p className="u-subtle crm-cell-note">{ticket.body}</p>
                          )}
                        </td>
                        <td data-label="Contact">
                          <a href={`/crm/contacts/${ticket.contactId}`}>{ticket.contactName}</a>
                        </td>
                        <td data-label="Account">
                          {ticket.accountId === null || ticket.accountName === null ? (
                            <span className="u-subtle">No account</span>
                          ) : (
                            <a href={`/crm/accounts/${ticket.accountId}`}>{ticket.accountName}</a>
                          )}
                        </td>
                        <td data-label="Status">
                          <ActionStateForm
                            action={updateTicketStatusAction}
                            className="crm-ticket-status-form"
                            errorTitle="Could not save status"
                          >
                            <input type="hidden" name="ticketId" value={ticket.id} />
                            <input type="hidden" name="filter" value={activeFilter} />
                            <label className="u-sr-only" htmlFor={`ticket-${ticket.id}-status`}>
                              Change status for {ticket.subject}
                            </label>
                            <select
                              className="select"
                              id={`ticket-${ticket.id}-status`}
                              name="status"
                              defaultValue={ticket.status}
                            >
                              {crmTicketStatuses.map((status) => (
                                <option value={status} key={status}>
                                  {ticketStatusLabel(status)}
                                </option>
                              ))}
                            </select>
                            <button className="btn btn-sm" type="submit">
                              Save
                            </button>
                          </ActionStateForm>
                        </td>
                        <td data-label="Priority">
                          <span className={ticketPriorityBadgeClassName(ticket.priority)}>
                            {ticketPriorityLabel(ticket.priority)}
                          </span>
                        </td>
                        <td data-label="Queue">{ticket.queue}</td>
                        <td data-label="Assignee">{ownerLabel(ticket.assigneeUserId, context)}</td>
                        <td data-label="Created" className="u-subtle">
                          {relativeTime(ticket.createdAt)}
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
