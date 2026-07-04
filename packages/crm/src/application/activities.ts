import { withTenant } from "@opzava/adapters";
import { err, ok, type Result } from "@opzava/shared-kernel";

import { accountInternal } from "./accounts.js";
import { contactInternal } from "./contacts.js";
import { dealInternal } from "./deals.js";
import { ticketInternal } from "./tickets.js";
import {
  assertKnownIds,
  assertKnownUuid,
  authorizeCrm,
  crmError,
  databaseError,
  insertCrmActivity,
  normalizeRequiredText,
  type CrmActivityDto,
  type CrmApplicationContext,
  type CrmApplicationDependencies,
} from "./shared.js";
import type { CrmActivityKind } from "../domain/index.js";

export interface AddNoteInput extends CrmApplicationContext {
  readonly contactId?: string;
  readonly accountId?: string;
  readonly dealId?: string;
  readonly ticketId?: string;
  readonly body: string;
  readonly kind?: Extract<CrmActivityKind, "note" | "call">;
}

interface ActivityRefs {
  readonly contactId: string | null;
  readonly accountId: string | null;
  readonly dealId: string | null;
  readonly ticketId: string | null;
}

function providedSubjectCount(input: AddNoteInput): number {
  return [input.contactId, input.accountId, input.dealId, input.ticketId].filter(
    (value) => value !== undefined && value.trim() !== "",
  ).length;
}

function validateOptionalSubjectIds(input: AddNoteInput): Result<void> {
  const subjectIds = [
    ["Contact id", input.contactId],
    ["Account id", input.accountId],
    ["Deal id", input.dealId],
    ["Ticket id", input.ticketId],
  ] as const;

  for (const [field, value] of subjectIds) {
    if (value === undefined || value.trim() === "") {
      continue;
    }

    const known = assertKnownUuid(value.trim(), field);
    if (!known.ok) {
      return err(known.error);
    }
  }

  return ok(undefined);
}

export async function addNote(
  input: AddNoteInput,
  dependencies: CrmApplicationDependencies = {},
): Promise<Result<CrmActivityDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const subjectCount = providedSubjectCount(input);
  if (subjectCount !== 1) {
    return err(crmError("crm.validation", "Exactly one CRM activity subject is required."));
  }

  const knownSubjectIds = validateOptionalSubjectIds(input);
  if (!knownSubjectIds.ok) {
    return err(knownSubjectIds.error);
  }

  const body = normalizeRequiredText(input.body, "Activity body", 4000);
  if (!body.ok) {
    return err(body.error);
  }

  const kind = input.kind ?? "note";
  if (kind !== "note" && kind !== "call") {
    return err(crmError("crm.validation", "Activity kind must be note or call."));
  }

  const authorized = await authorizeCrm(input, "update", dependencies.authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      let refs: ActivityRefs | null = null;

      if (input.contactId !== undefined && input.contactId.trim() !== "") {
        const contact = await contactInternal.selectContactById(
          tx,
          input.contactId.trim(),
          input.workspaceId,
        );
        if (contact === null) {
          return err(crmError("crm.notFound", "Contact was not found."));
        }
        refs = {
          contactId: contact.id,
          accountId: contact.accountId,
          dealId: null,
          ticketId: null,
        };
      }

      if (input.accountId !== undefined && input.accountId.trim() !== "") {
        const account = await accountInternal.selectAccountById(
          tx,
          input.accountId.trim(),
          input.workspaceId,
        );
        if (account === null) {
          return err(crmError("crm.notFound", "Account was not found."));
        }
        refs = {
          contactId: null,
          accountId: account.id,
          dealId: null,
          ticketId: null,
        };
      }

      if (input.dealId !== undefined && input.dealId.trim() !== "") {
        const deal = await dealInternal.selectDealById(tx, input.dealId.trim(), input.workspaceId);
        if (deal === null) {
          return err(crmError("crm.notFound", "Deal was not found."));
        }
        refs = {
          contactId: deal.primaryContactId,
          accountId: deal.accountId,
          dealId: deal.id,
          ticketId: null,
        };
      }

      if (input.ticketId !== undefined && input.ticketId.trim() !== "") {
        const ticket = await ticketInternal.selectTicketById(
          tx,
          input.ticketId.trim(),
          input.workspaceId,
        );
        if (ticket === null) {
          return err(crmError("crm.notFound", "Ticket was not found."));
        }
        refs = {
          contactId: ticket.contactId,
          accountId: ticket.accountId,
          dealId: null,
          ticketId: ticket.id,
        };
      }

      if (refs === null) {
        return err(crmError("crm.validation", "A CRM activity subject is required."));
      }

      return ok(
        await insertCrmActivity(tx, input, {
          kind,
          body: body.value,
          contactId: refs.contactId,
          accountId: refs.accountId,
          dealId: refs.dealId,
          ticketId: refs.ticketId,
        }),
      );
    });
  } catch (error) {
    return err(databaseError(error));
  }
}
