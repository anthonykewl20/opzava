import { getContact, listAccounts, listContactTimeline, listDeals, listTickets } from "@opzava/crm";
import { forbidden, notFound, redirect } from "next/navigation";

import { CrmPageStyles } from "@/app/(app)/crm/_components/crm-page-styles";
import { addContactActivityAction, updateContactAction } from "@/app/(app)/crm/contacts/actions";
import { ActionStateForm } from "@/components/forms/action-state-form";
import {
  activityKindIcon,
  activityKindLabel,
  actorLabel,
  crmContextInput,
  formatMoney,
  isCrmForbidden,
  isCrmNotFound,
  lifecycleBadgeClassName,
  lifecycleLabel,
  openDealsFromColumns,
  ownerLabel,
  relativeTime,
} from "@/lib/crm-pages";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

interface ContactDetailPageProps {
  readonly params: Promise<{
    readonly id: string;
  }>;
}

export default async function ContactDetailPage({ params }: ContactDetailPageProps) {
  const { id } = await params;
  const context = await getAppSessionContext();
  if (context === null) {
    redirect("/login");
  }

  const crmContext = crmContextInput(context);
  const [contactResult, accountsResult, timelineResult, dealsResult, ticketsResult] =
    await Promise.all([
      getContact({ ...crmContext, contactId: id }),
      listAccounts(crmContext),
      listContactTimeline({ ...crmContext, contactId: id, limit: 50 }),
      listDeals(crmContext),
      listTickets(crmContext),
    ]);

  if (!contactResult.ok) {
    if (isCrmNotFound(contactResult.error)) {
      notFound();
    }

    if (isCrmForbidden(contactResult.error)) {
      forbidden();
    }

    throw contactResult.error;
  }

  if (!accountsResult.ok) {
    if (isCrmForbidden(accountsResult.error)) {
      forbidden();
    }

    throw accountsResult.error;
  }

  if (!timelineResult.ok) {
    if (isCrmNotFound(timelineResult.error)) {
      notFound();
    }

    if (isCrmForbidden(timelineResult.error)) {
      forbidden();
    }

    throw timelineResult.error;
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

  const contact = contactResult.value;
  const accounts = accountsResult.value;
  const timeline = timelineResult.value;
  const openDeals = openDealsFromColumns(dealsResult.value).filter(
    (deal) => deal.primaryContactId === contact.id,
  );
  const openTickets = ticketsResult.value.filter(
    (ticket) =>
      ticket.contactId === contact.id && ticket.status !== "resolved" && ticket.status !== "closed",
  );

  return (
    <>
      <CrmPageStyles />
      <div className="page crm-page">
        <div className="crm-page-stack page-stack">
          <div className="page-header">
            <div>
              <p className="page-sub">
                <a href="/crm/contacts">Contacts</a>
                {" / "}
                <span>{contact.displayName}</span>
              </p>
              <h1>{contact.displayName}</h1>
            </div>
            <span className={lifecycleBadgeClassName(contact.lifecycleStage)}>
              {lifecycleLabel(contact.lifecycleStage)}
            </span>
          </div>

          {/* DESCOPE(crm-consent-erasure): PRD-010 consent, channel identity, and erasure workflow surfaces arrive with the P4 CRM remainder; this thin slice renders only live CRM core records. */}
          <div className="crm-detail-grid">
            <div className="crm-detail-main page-stack">
              <section aria-labelledby="contact-profile-heading">
                <div className="card">
                  <div className="card-header">
                    <h2 className="card-title" id="contact-profile-heading">
                      Profile
                    </h2>
                    <span className="badge">{ownerLabel(contact.ownerUserId, context)}</span>
                  </div>
                  <div className="card-body">
                    <dl className="crm-profile-list">
                      <dt className="u-subtle">Title</dt>
                      <dd>{contact.title ?? "None"}</dd>
                      <dt className="u-subtle">Account</dt>
                      <dd>
                        {contact.accountId === null || contact.accountName === null ? (
                          "No account"
                        ) : (
                          <a href={`/crm/accounts/${contact.accountId}`}>{contact.accountName}</a>
                        )}
                      </dd>
                      <dt className="u-subtle">Email</dt>
                      <dd>
                        {contact.email === null ? (
                          "None"
                        ) : (
                          <a href={`mailto:${contact.email}`}>{contact.email}</a>
                        )}
                      </dd>
                      <dt className="u-subtle">Phone</dt>
                      <dd>{contact.phone ?? "None"}</dd>
                      <dt className="u-subtle">Notes</dt>
                      <dd>{contact.notes === "" ? "None" : contact.notes}</dd>
                    </dl>

                    <details style={{ marginTop: "var(--space-5)" }}>
                      <summary className="btn">Edit profile</summary>
                      <ActionStateForm
                        action={updateContactAction}
                        className="crm-panel-form"
                        errorTitle="Could not save contact"
                      >
                        <input type="hidden" name="contactId" value={contact.id} />
                        <div className="field">
                          <label className="label" htmlFor="contact-display-name">
                            Display name
                          </label>
                          <input
                            className="input"
                            id="contact-display-name"
                            name="displayName"
                            type="text"
                            required
                            maxLength={240}
                            defaultValue={contact.displayName}
                          />
                        </div>
                        <div className="crm-form-grid">
                          <div className="field">
                            <label className="label" htmlFor="contact-email">
                              Email
                            </label>
                            <input
                              className="input"
                              id="contact-email"
                              name="email"
                              type="email"
                              maxLength={320}
                              defaultValue={contact.email ?? ""}
                            />
                          </div>
                          <div className="field">
                            <label className="label" htmlFor="contact-phone">
                              Phone
                            </label>
                            <input
                              className="input"
                              id="contact-phone"
                              name="phone"
                              type="tel"
                              maxLength={80}
                              defaultValue={contact.phone ?? ""}
                            />
                          </div>
                        </div>
                        <div className="field">
                          <label className="label" htmlFor="contact-title">
                            Title
                          </label>
                          <input
                            className="input"
                            id="contact-title"
                            name="title"
                            type="text"
                            maxLength={240}
                            defaultValue={contact.title ?? ""}
                          />
                        </div>
                        <div className="crm-form-grid">
                          <div className="field">
                            <label className="label" htmlFor="contact-lifecycle">
                              Lifecycle
                            </label>
                            <select
                              className="select"
                              id="contact-lifecycle"
                              name="lifecycleStage"
                              defaultValue={contact.lifecycleStage}
                            >
                              <option value="lead">Lead</option>
                              <option value="qualified">Qualified</option>
                              <option value="customer">Customer</option>
                              <option value="former">Former</option>
                            </select>
                          </div>
                          <div className="field">
                            <label className="label" htmlFor="contact-owner">
                              Owner
                            </label>
                            <select
                              className="select"
                              id="contact-owner"
                              name="owner"
                              defaultValue={
                                contact.ownerUserId === null
                                  ? ""
                                  : contact.ownerUserId === context.user.id
                                    ? "me"
                                    : "keep"
                              }
                            >
                              <option value="">Unassigned</option>
                              <option value="me">{context.user.name}</option>
                              {contact.ownerUserId !== null &&
                              contact.ownerUserId !== context.user.id ? (
                                <option value="keep">{contact.ownerUserId}</option>
                              ) : null}
                            </select>
                          </div>
                        </div>
                        <div className="field">
                          <label className="label" htmlFor="contact-account">
                            Account
                          </label>
                          <select
                            className="select"
                            id="contact-account"
                            name="accountId"
                            defaultValue={contact.accountId ?? ""}
                          >
                            <option value="">No account</option>
                            {accounts.map((account) => (
                              <option value={account.id} key={account.id}>
                                {account.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label className="label" htmlFor="contact-notes">
                            Notes
                          </label>
                          <textarea
                            className="textarea"
                            id="contact-notes"
                            name="notes"
                            rows={5}
                            maxLength={4000}
                            defaultValue={contact.notes}
                          />
                        </div>
                        <button className="btn btn-primary" type="submit">
                          Save contact
                        </button>
                      </ActionStateForm>
                    </details>
                  </div>
                </div>
              </section>

              <section aria-labelledby="contact-timeline-heading">
                <div className="card">
                  <div className="card-header">
                    <h2 className="card-title" id="contact-timeline-heading">
                      Timeline
                    </h2>
                    <span className="badge">{timeline.length}</span>
                  </div>
                  <div className="card-body">
                    <div className="crm-section-actions">
                      {(["note", "call"] as const).map((kind) => (
                        <details className="issues-new-menu crm-new-menu" key={kind}>
                          <summary className="btn btn-sm">
                            {kind === "note" ? "Add note" : "Log call"}
                          </summary>
                          <ActionStateForm
                            action={addContactActivityAction}
                            className="issues-new-form crm-new-form"
                            errorTitle={
                              kind === "note" ? "Could not add note" : "Could not log call"
                            }
                          >
                            <input type="hidden" name="contactId" value={contact.id} />
                            <input type="hidden" name="kind" value={kind} />
                            <div className="field">
                              <label className="label" htmlFor={`contact-${kind}-body`}>
                                {kind === "note" ? "Note" : "Call summary"}
                              </label>
                              <textarea
                                className="textarea"
                                id={`contact-${kind}-body`}
                                name="body"
                                rows={5}
                                required
                                maxLength={4000}
                              />
                            </div>
                            <button className="btn btn-primary btn-sm" type="submit">
                              {kind === "note" ? "Add note" : "Log call"}
                            </button>
                          </ActionStateForm>
                        </details>
                      ))}
                    </div>

                    {timeline.length === 0 ? (
                      <div className="empty">
                        <p className="empty-title">No timeline activity yet</p>
                        <p className="empty-desc">Add a note or log a call to start the history.</p>
                      </div>
                    ) : (
                      <div className="crm-timeline">
                        {timeline.map((activity) => (
                          <article className="crm-timeline-item" key={activity.id}>
                            <span className="task-avatar" aria-hidden="true">
                              {activityKindIcon(activity.kind)}
                            </span>
                            <div className="crm-timeline-body">
                              <div className="crm-timeline-head">
                                <strong>{activityKindLabel(activity.kind)}</strong>
                                <span className="u-subtle">
                                  {relativeTime(activity.occurredAt)}
                                </span>
                              </div>
                              <p className="crm-timeline-copy">{activity.body}</p>
                              <p className="u-subtle">{actorLabel(activity, context)}</p>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>

            <aside className="crm-detail-side page-stack" aria-label="Linked CRM work">
              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">Open deals</h2>
                  <span className="count-pill">{openDeals.length}</span>
                </div>
                <div className="card-body">
                  {openDeals.length === 0 ? (
                    <p className="u-subtle">No open deals linked to this contact.</p>
                  ) : (
                    <div className="crm-list-stack">
                      {openDeals.map((deal) => (
                        <div className="crm-linked-item" key={deal.id}>
                          <strong>{deal.title}</strong>
                          <p className="u-subtle">
                            {deal.stageName} · {formatMoney(deal.valueCents, deal.currency)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">Open tickets</h2>
                  <span className="count-pill">{openTickets.length}</span>
                </div>
                <div className="card-body">
                  {openTickets.length === 0 ? (
                    <p className="u-subtle">No open tickets linked to this contact.</p>
                  ) : (
                    <div className="crm-list-stack">
                      {openTickets.map((ticket) => (
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
