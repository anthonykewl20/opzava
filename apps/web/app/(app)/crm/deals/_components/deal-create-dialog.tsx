"use client";

import type { CrmAccountDto, CrmContactDto } from "@opzava/crm";
import { useState } from "react";

import { createDealAction } from "@/app/(app)/crm/deals/actions";
import { ActionStateForm } from "@/components/forms/action-state-form";

interface DealCreateDialogProps {
  readonly accounts: readonly CrmAccountDto[];
  readonly contacts: readonly CrmContactDto[];
  readonly accountsTruncated?: boolean;
  readonly contactsTruncated?: boolean;
  readonly currentUserName: string;
  readonly idempotencyKey: string;
}

function DealPlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function DealCreateDialog({
  accounts,
  contacts,
  currentUserName,
  idempotencyKey,
  accountsTruncated = false,
  contactsTruncated = false,
}: DealCreateDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? "");
  const hasAccounts = accounts.length > 0;

  const openDialog = () => {
    setSelectedAccountId(accounts[0]?.id ?? "");
    setIsOpen(true);
  };

  const closeDialog = () => {
    setIsOpen(false);
  };

  return (
    <>
      <button className="btn btn-primary" type="button" onClick={openDialog}>
        <DealPlusIcon />
        New deal
      </button>

      {isOpen ? (
        <div className="task-modal-backdrop" role="presentation">
          <section
            className="task-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-deal-title"
          >
            <div className="task-modal-head">
              <h2 className="task-modal-title" id="new-deal-title">
                New deal
              </h2>
              <button
                className="btn btn-ghost btn-icon"
                type="button"
                aria-label="Close deal form"
                onClick={closeDialog}
              >
                <span aria-hidden="true">x</span>
              </button>
            </div>

            <ActionStateForm
              action={createDealAction}
              className="task-form"
              errorTitle="Could not create deal"
            >
              <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
              <div className="field">
                <label className="label" htmlFor="new-deal-title-input">
                  Title
                </label>
                <input
                  className="input"
                  id="new-deal-title-input"
                  name="title"
                  type="text"
                  required
                  maxLength={240}
                  autoFocus
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="new-deal-account">
                  Account
                </label>
                <select
                  className="select"
                  id="new-deal-account"
                  name="accountId"
                  required
                  value={selectedAccountId}
                  onChange={(event) => setSelectedAccountId(event.currentTarget.value)}
                  disabled={!hasAccounts}
                  aria-describedby={hasAccounts ? undefined : "new-deal-account-hint"}
                >
                  {hasAccounts ? (
                    accounts.map((account) => (
                      <option value={account.id} key={account.id}>
                        {account.name}
                      </option>
                    ))
                  ) : (
                    <option value="">No accounts available</option>
                  )}
                </select>
                {accountsTruncated ? (
                  <p className="hint">First page of accounts shown — search arrives with P4.</p>
                ) : null}
                {hasAccounts ? null : (
                  <p className="hint" id="new-deal-account-hint">
                    <a href="/crm/accounts">Create an account first</a> — deals belong to an account
                  </p>
                )}
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
                  {contactsTruncated ? (
                    <p className="hint">First page of contacts shown — search arrives with P4.</p>
                  ) : null}
              </div>

              <div className="crm-form-grid-sm">
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

              <div className="crm-form-grid-sm">
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
                    <option value="me">{currentUserName}</option>
                  </select>
                </div>
              </div>

              <div className="task-modal-foot">
                <button className="btn btn-ghost" type="button" onClick={closeDialog}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={selectedAccountId === ""}
                >
                  Create deal
                </button>
              </div>
            </ActionStateForm>
          </section>
        </div>
      ) : null}
    </>
  );
}
