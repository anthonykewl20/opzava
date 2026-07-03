import { crmTicketPriorities, getTicket } from "@opzava/crm";
import { forbidden, notFound, redirect } from "next/navigation";

import { CrmPageStyles } from "@/app/(app)/crm/_components/crm-page-styles";
import { updateTicketAction } from "@/app/(app)/crm/tickets/actions";
import {
  crmContextInput,
  isCrmForbidden,
  isCrmNotFound,
  ownerLabel,
  ticketPriorityLabel,
  ticketStatusBadgeClassName,
  ticketStatusLabel,
} from "@/lib/crm-pages";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

interface TicketDetailPageProps {
  readonly params: Promise<{
    readonly id: string;
  }>;
}

export default async function TicketDetailPage({ params }: TicketDetailPageProps) {
  const { id } = await params;
  const context = await getAppSessionContext();
  if (context === null) {
    redirect("/login");
  }

  const result = await getTicket({ ...crmContextInput(context), ticketId: id });
  if (!result.ok) {
    if (isCrmNotFound(result.error)) {
      notFound();
    }

    if (isCrmForbidden(result.error)) {
      forbidden();
    }

    throw result.error;
  }

  const ticket = result.value;

  return (
    <>
      <CrmPageStyles />
      <div className="page crm-page">
        <div className="crm-page-stack page-stack">
          <div className="page-header">
            <div>
              <p className="page-sub">
                <a href="/crm/tickets">Tickets</a>
                {" / "}
                <span>{ticket.subject}</span>
              </p>
              <h1>{ticket.subject}</h1>
            </div>
            <span className={ticketStatusBadgeClassName(ticket.status)}>
              {ticketStatusLabel(ticket.status)}
            </span>
          </div>

          {/* DESCOPE(external-channel-transcript): PRD-010 live customer transcript and reply-send authority arrive through the Gateway ACL in the P4 CRM remainder; this detail page only renders backed ticket fields. */}
          <div className="crm-detail-grid">
            <section aria-labelledby="ticket-detail-heading">
              <div className="card">
                <div className="card-header">
                  <h2 className="card-title" id="ticket-detail-heading">
                    Ticket
                  </h2>
                  <span className="badge">{ticket.queue}</span>
                </div>
                <div className="card-body">
                  <dl className="crm-profile-list">
                    <dt className="u-subtle">Contact</dt>
                    <dd>
                      <a href={`/crm/contacts/${ticket.contactId}`}>{ticket.contactName}</a>
                    </dd>
                    <dt className="u-subtle">Account</dt>
                    <dd>
                      {ticket.accountId === null || ticket.accountName === null ? (
                        "No account"
                      ) : (
                        <a href={`/crm/accounts/${ticket.accountId}`}>{ticket.accountName}</a>
                      )}
                    </dd>
                    <dt className="u-subtle">Priority</dt>
                    <dd>{ticketPriorityLabel(ticket.priority)}</dd>
                    <dt className="u-subtle">Assignee</dt>
                    <dd>{ownerLabel(ticket.assigneeUserId, context)}</dd>
                    <dt className="u-subtle">Body</dt>
                    <dd>{ticket.body === "" ? "No body" : ticket.body}</dd>
                  </dl>
                </div>
              </div>
            </section>

            <section aria-labelledby="ticket-edit-heading">
              <div className="card">
                <div className="card-header">
                  <h2 className="card-title" id="ticket-edit-heading">
                    Edit
                  </h2>
                </div>
                <div className="card-body">
                  <form action={updateTicketAction} className="crm-panel-form">
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <div className="field">
                      <label className="label" htmlFor="ticket-subject">
                        Subject
                      </label>
                      <input
                        className="input"
                        id="ticket-subject"
                        name="subject"
                        type="text"
                        required
                        maxLength={240}
                        defaultValue={ticket.subject}
                      />
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="ticket-body">
                        Body
                      </label>
                      <textarea
                        className="textarea"
                        id="ticket-body"
                        name="body"
                        rows={6}
                        maxLength={8000}
                        defaultValue={ticket.body}
                      />
                    </div>
                    <div className="crm-form-grid-sm">
                      <div className="field">
                        <label className="label" htmlFor="ticket-priority">
                          Priority
                        </label>
                        <select
                          className="select"
                          id="ticket-priority"
                          name="priority"
                          defaultValue={ticket.priority}
                        >
                          {crmTicketPriorities.map((priority) => (
                            <option value={priority} key={priority}>
                              {ticketPriorityLabel(priority)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label className="label" htmlFor="ticket-queue">
                          Queue
                        </label>
                        <input
                          className="input"
                          id="ticket-queue"
                          name="queue"
                          type="text"
                          required
                          maxLength={120}
                          defaultValue={ticket.queue}
                        />
                      </div>
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="ticket-assignee">
                        Assignee
                      </label>
                      <select
                        className="select"
                        id="ticket-assignee"
                        name="assignee"
                        defaultValue={
                          ticket.assigneeUserId === null
                            ? ""
                            : ticket.assigneeUserId === context.user.id
                              ? "me"
                              : "keep"
                        }
                      >
                        <option value="">Unassigned</option>
                        <option value="me">{context.user.name}</option>
                        {ticket.assigneeUserId !== null &&
                        ticket.assigneeUserId !== context.user.id ? (
                          <option value="keep">{ticket.assigneeUserId}</option>
                        ) : null}
                      </select>
                    </div>
                    <button className="btn btn-primary" type="submit">
                      Save ticket
                    </button>
                  </form>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
