import { sql, withTenant, type TenantTransaction } from "@opzava/adapters";
import { err, ok, type Result } from "@opzava/shared-kernel";

import { accountInternal } from "./accounts.js";
import { contactInternal } from "./contacts.js";
import {
  assertKnownIds,
  assertKnownUuid,
  authorizeCrm,
  crmError,
  databaseError,
  insertCrmActivity,
  normalizeIdempotencyKey,
  normalizeLimit,
  normalizeLongText,
  normalizeOptionalUserId,
  normalizeRequiredText,
  rowToTicketDto,
  rowsFromExecuteResult,
  stringOrNull,
  type CrmApplicationContext,
  type CrmApplicationDependencies,
  type CrmListPageDto,
  type CrmTicketDto,
} from "./shared.js";
import {
  parseCrmTicketPriority,
  parseCrmTicketStatus,
  type CrmTicketPriority,
  type CrmTicketStatus,
} from "../domain/index.js";

export interface CreateTicketInput extends CrmApplicationContext {
  readonly subject: string;
  readonly body?: string | null;
  readonly contactId: string;
  readonly accountId?: string | null;
  readonly status?: CrmTicketStatus;
  readonly priority?: CrmTicketPriority;
  readonly queue?: string;
  readonly assigneeUserId?: string | null;
  readonly idempotencyKey?: string;
}

export interface UpdateTicketStatusInput extends CrmApplicationContext {
  readonly ticketId: string;
  readonly status: CrmTicketStatus;
}

export interface UpdateTicketInput extends CrmApplicationContext {
  readonly ticketId: string;
  readonly subject?: string;
  readonly body?: string | null;
  readonly priority?: CrmTicketPriority;
  readonly queue?: string;
  readonly assigneeUserId?: string | null;
}

export interface ListTicketsInput extends CrmApplicationContext {
  readonly status?: CrmTicketStatus;
  readonly limit?: number;
}

export interface GetTicketInput extends CrmApplicationContext {
  readonly ticketId: string;
}

interface PreparedTicketFields {
  readonly subject: string;
  readonly body: string;
  readonly contactId: string;
  readonly accountId: string | null;
  readonly status: CrmTicketStatus;
  readonly priority: CrmTicketPriority;
  readonly queue: string;
  readonly assigneeUserId: string | null;
}

function normalizeTicketContactId(value: string): Result<string> {
  const normalized = value.trim();
  const known = assertKnownUuid(normalized, "Contact id");
  return known.ok ? ok(normalized) : err(known.error);
}

function normalizeTicketAccountId(value: string | null | undefined): Result<string | null> {
  if (value === null || value === undefined || value.trim() === "") {
    return ok(null);
  }

  const normalized = value.trim();
  const known = assertKnownUuid(normalized, "Account id");
  return known.ok ? ok(normalized) : err(known.error);
}

function prepareCreateTicketFields(input: CreateTicketInput): Result<PreparedTicketFields> {
  const subject = normalizeRequiredText(input.subject, "Ticket subject", 240);
  const body = normalizeLongText(input.body, "Ticket body", 8000);
  const contactId = normalizeTicketContactId(input.contactId);
  const accountId = normalizeTicketAccountId(input.accountId);
  const status = parseCrmTicketStatus(input.status ?? "new");
  const priority = parseCrmTicketPriority(input.priority ?? "normal");
  const queue = normalizeRequiredText(input.queue ?? "support", "Ticket queue", 120);
  const assigneeUserId = normalizeOptionalUserId(input.assigneeUserId, "Ticket assignee");

  if (!subject.ok) {
    return err(subject.error);
  }
  if (!body.ok) {
    return err(body.error);
  }
  if (!contactId.ok) {
    return err(contactId.error);
  }
  if (!accountId.ok) {
    return err(accountId.error);
  }
  if (!status.ok) {
    return err(status.error);
  }
  if (!priority.ok) {
    return err(priority.error);
  }
  if (!queue.ok) {
    return err(queue.error);
  }
  if (!assigneeUserId.ok) {
    return err(assigneeUserId.error);
  }

  return ok({
    subject: subject.value,
    body: body.value,
    contactId: contactId.value,
    accountId: accountId.value,
    status: status.value,
    priority: priority.value,
    queue: queue.value,
    assigneeUserId: assigneeUserId.value,
  });
}

async function selectTicketById(
  tx: TenantTransaction,
  ticketId: string,
  workspaceId: string,
): Promise<CrmTicketDto | null> {
  const result = await tx.execute(sql`
    select
      t.id,
      t.organization_id,
      t.workspace_id,
      t.subject,
      t.body,
      t.contact_id,
      c.display_name as contact_name,
      t.account_id,
      a.name as account_name,
      t.status,
      t.priority,
      t.queue,
      t.assignee_user_id,
      t.created_at,
      t.updated_at
    from public.crm_tickets t
    join public.crm_contacts c
      on c.id = t.contact_id
      and c.organization_id = t.organization_id
    left join public.crm_accounts a
      on a.id = t.account_id
      and a.organization_id = t.organization_id
    where t.id = ${ticketId}
      and t.workspace_id = ${workspaceId}
    limit 1
  `);

  const row = rowsFromExecuteResult(result)[0];
  return row === undefined ? null : rowToTicketDto(row);
}

async function selectTicketByIdempotencyKey(
  tx: TenantTransaction,
  orgId: string,
  idempotencyKey: string,
): Promise<CrmTicketDto | null> {
  const result = await tx.execute(sql`
    select
      t.id,
      t.organization_id,
      t.workspace_id,
      t.subject,
      t.body,
      t.contact_id,
      c.display_name as contact_name,
      t.account_id,
      a.name as account_name,
      t.status,
      t.priority,
      t.queue,
      t.assignee_user_id,
      t.created_at,
      t.updated_at
    from public.crm_tickets t
    join public.crm_contacts c
      on c.id = t.contact_id
      and c.organization_id = t.organization_id
    left join public.crm_accounts a
      on a.id = t.account_id
      and a.organization_id = t.organization_id
    where t.organization_id = ${orgId}
      and t.idempotency_key = ${idempotencyKey}
    limit 1
  `);

  const row = rowsFromExecuteResult(result)[0];
  return row === undefined ? null : rowToTicketDto(row);
}

async function validateTicketRefs(
  tx: TenantTransaction,
  input: CrmApplicationContext,
  contactId: string,
  accountId: string | null,
): Promise<Result<void>> {
  const contact = await contactInternal.selectContactById(tx, contactId, input.workspaceId);
  if (contact === null) {
    return err(crmError("crm.notFound", "Contact was not found."));
  }

  if (accountId !== null) {
    const account = await accountInternal.selectAccountById(tx, accountId, input.workspaceId);
    if (account === null) {
      return err(crmError("crm.notFound", "Account was not found."));
    }
  }

  return ok(undefined);
}

export async function createTicket(
  input: CreateTicketInput,
  dependencies: CrmApplicationDependencies = {},
): Promise<Result<CrmTicketDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  if (!idempotencyKey.ok) {
    return err(idempotencyKey.error);
  }

  const authorized = await authorizeCrm(input, "create", dependencies.authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      if (idempotencyKey.value !== null) {
        const replay = await selectTicketByIdempotencyKey(tx, input.orgId, idempotencyKey.value);
        if (replay !== null) {
          return ok(replay);
        }
      }

      const fields = prepareCreateTicketFields(input);
      if (!fields.ok) {
        return err(fields.error);
      }

      const validRefs = await validateTicketRefs(
        tx,
        input,
        fields.value.contactId,
        fields.value.accountId,
      );
      if (!validRefs.ok) {
        return err(validRefs.error);
      }

      const inserted = await tx.execute(sql`
        insert into public.crm_tickets (
          organization_id,
          workspace_id,
          subject,
          body,
          contact_id,
          account_id,
          status,
          priority,
          queue,
          assignee_user_id,
          idempotency_key
        )
        values (
          ${input.orgId},
          ${input.workspaceId},
          ${fields.value.subject},
          ${fields.value.body},
          ${fields.value.contactId},
          ${fields.value.accountId},
          ${fields.value.status}::public.crm_ticket_status,
          ${fields.value.priority}::public.crm_ticket_priority,
          ${fields.value.queue},
          ${fields.value.assigneeUserId},
          ${idempotencyKey.value}
        )
        on conflict (organization_id, idempotency_key) do nothing
        returning id
      `);

      const insertedId = stringOrNull(rowsFromExecuteResult(inserted)[0]?.["id"]);
      if (insertedId === null) {
        if (idempotencyKey.value !== null) {
          const replay = await selectTicketByIdempotencyKey(tx, input.orgId, idempotencyKey.value);
          if (replay !== null) {
            return ok(replay);
          }
        }

        return err(crmError("crm.databaseError", "Ticket could not be created."));
      }

      await insertCrmActivity(tx, input, {
        kind: "ticket_created",
        contactId: fields.value.contactId,
        accountId: fields.value.accountId,
        ticketId: insertedId,
      });

      const ticket = await selectTicketById(tx, insertedId, input.workspaceId);
      return ticket === null
        ? err(crmError("crm.databaseError", "Ticket could not be loaded after create."))
        : ok(ticket);
    });
  } catch (error) {
    return err(databaseError(error));
  }
}

export async function updateTicketStatus(
  input: UpdateTicketStatusInput,
  dependencies: CrmApplicationDependencies = {},
): Promise<Result<CrmTicketDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownTicketId = assertKnownUuid(input.ticketId, "Ticket id");
  if (!knownTicketId.ok) {
    return err(knownTicketId.error);
  }

  const status = parseCrmTicketStatus(input.status);
  if (!status.ok) {
    return err(status.error);
  }

  const authorized = await authorizeCrm(input, "update", dependencies.authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const changed = await tx.execute(sql`
        with candidate as (
          select t.id, t.status as old_status
          from public.crm_tickets t
          where t.id = ${input.ticketId}
            and t.organization_id = ${input.orgId}
            and t.workspace_id = ${input.workspaceId}
            and t.status <> ${status.value}::public.crm_ticket_status
          for update
        ),
        updated as (
          update public.crm_tickets t
          set status = ${status.value}::public.crm_ticket_status,
              updated_at = now()
          from candidate
          where t.id = candidate.id
            and t.organization_id = ${input.orgId}
            and t.workspace_id = ${input.workspaceId}
            and t.status = candidate.old_status
            and t.status <> ${status.value}::public.crm_ticket_status
          returning
            t.id,
            t.organization_id,
            t.workspace_id,
            t.subject,
            t.body,
            t.contact_id,
            t.account_id,
            t.status,
            candidate.old_status,
            t.priority,
            t.queue,
            t.assignee_user_id,
            t.created_at,
            t.updated_at
        )
        select
          u.id,
          u.organization_id,
          u.workspace_id,
          u.subject,
          u.body,
          u.contact_id,
          c.display_name as contact_name,
          u.account_id,
          a.name as account_name,
          u.status,
          u.old_status,
          u.priority,
          u.queue,
          u.assignee_user_id,
          u.created_at,
          u.updated_at
        from updated u
        join public.crm_contacts c
          on c.id = u.contact_id
          and c.organization_id = u.organization_id
        left join public.crm_accounts a
          on a.id = u.account_id
          and a.organization_id = u.organization_id
      `);
      const row = rowsFromExecuteResult(changed)[0];
      if (row === undefined) {
        const ticket = await selectTicketById(tx, input.ticketId, input.workspaceId);
        if (ticket === null) {
          return err(crmError("crm.notFound", "Ticket was not found."));
        }

        return ticket.status === status.value
          ? ok(ticket)
          : err(crmError("crm.conflict", "Ticket status changed before update."));
      }

      const ticket = rowToTicketDto(row);
      const oldStatus = String(row["old_status"] ?? "");
      await insertCrmActivity(tx, input, {
        kind: "ticket_status_changed",
        body: `Status: ${oldStatus} -> ${status.value}`,
        contactId: ticket.contactId,
        accountId: ticket.accountId,
        ticketId: ticket.id,
      });

      return ok(ticket);
    });
  } catch (error) {
    return err(databaseError(error));
  }
}

export async function updateTicket(
  input: UpdateTicketInput,
  dependencies: CrmApplicationDependencies = {},
): Promise<Result<CrmTicketDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownTicketId = assertKnownUuid(input.ticketId, "Ticket id");
  if (!knownTicketId.ok) {
    return err(knownTicketId.error);
  }

  const subject =
    input.subject === undefined
      ? undefined
      : normalizeRequiredText(input.subject, "Ticket subject", 240);
  const body =
    input.body === undefined ? undefined : normalizeLongText(input.body, "Ticket body", 8000);
  const priority =
    input.priority === undefined ? undefined : parseCrmTicketPriority(input.priority);
  const queue =
    input.queue === undefined ? undefined : normalizeRequiredText(input.queue, "Ticket queue", 120);
  const assigneeUserId =
    input.assigneeUserId === undefined
      ? undefined
      : normalizeOptionalUserId(input.assigneeUserId, "Ticket assignee");

  if (subject !== undefined && !subject.ok) {
    return err(subject.error);
  }
  if (body !== undefined && !body.ok) {
    return err(body.error);
  }
  if (priority !== undefined && !priority.ok) {
    return err(priority.error);
  }
  if (queue !== undefined && !queue.ok) {
    return err(queue.error);
  }
  if (assigneeUserId !== undefined && !assigneeUserId.ok) {
    return err(assigneeUserId.error);
  }
  const subjectValue = subject === undefined ? undefined : subject.value;
  const bodyValue = body === undefined ? undefined : body.value;
  const priorityValue = priority === undefined ? undefined : priority.value;
  const queueValue = queue === undefined ? undefined : queue.value;
  const assigneeUserIdValue = assigneeUserId === undefined ? undefined : assigneeUserId.value;

  const authorized = await authorizeCrm(input, "update", dependencies.authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const existing = await selectTicketById(tx, input.ticketId, input.workspaceId);
      if (existing === null) {
        return err(crmError("crm.notFound", "Ticket was not found."));
      }

      await tx.execute(sql`
        update public.crm_tickets
        set
          subject = ${subjectValue === undefined ? existing.subject : subjectValue},
          body = ${bodyValue === undefined ? existing.body : bodyValue},
          priority = ${
            priorityValue === undefined ? existing.priority : priorityValue
          }::public.crm_ticket_priority,
          queue = ${queueValue === undefined ? existing.queue : queueValue},
          assignee_user_id = ${
            assigneeUserIdValue === undefined ? existing.assigneeUserId : assigneeUserIdValue
          },
          updated_at = now()
        where id = ${input.ticketId}
          and workspace_id = ${input.workspaceId}
      `);

      const updated = await selectTicketById(tx, input.ticketId, input.workspaceId);
      return updated === null
        ? err(crmError("crm.notFound", "Ticket was not found."))
        : ok(updated);
    });
  } catch (error) {
    return err(databaseError(error));
  }
}

export async function listTickets(
  input: ListTicketsInput,
  dependencies: CrmApplicationDependencies = {},
): Promise<Result<CrmListPageDto<CrmTicketDto>>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const limit = normalizeLimit(input.limit, 50, 200);
  if (!limit.ok) {
    return err(limit.error);
  }

  const status = input.status === undefined ? undefined : parseCrmTicketStatus(input.status);
  if (status !== undefined && !status.ok) {
    return err(status.error);
  }

  const authorized = await authorizeCrm(input, "read", dependencies.authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const totalResult = await tx.execute(sql`
        select count(*)::integer as total_count
        from public.crm_tickets t
        where t.workspace_id = ${input.workspaceId}
          ${
            status === undefined
              ? sql``
              : sql`and t.status = ${status.value}::public.crm_ticket_status`
          }
      `);
      const totalCount = Number(rowsFromExecuteResult(totalResult)[0]?.["total_count"] ?? 0);

      const result = await tx.execute(sql`
        select
          t.id,
          t.organization_id,
          t.workspace_id,
          t.subject,
          t.body,
          t.contact_id,
          c.display_name as contact_name,
          t.account_id,
          a.name as account_name,
          t.status,
          t.priority,
          t.queue,
          t.assignee_user_id,
          t.created_at,
          t.updated_at
        from public.crm_tickets t
        join public.crm_contacts c
          on c.id = t.contact_id
          and c.organization_id = t.organization_id
        left join public.crm_accounts a
          on a.id = t.account_id
          and a.organization_id = t.organization_id
        where t.workspace_id = ${input.workspaceId}
          ${
            status === undefined
              ? sql``
              : sql`and t.status = ${status.value}::public.crm_ticket_status`
          }
        order by
          case t.priority
            when 'urgent'::public.crm_ticket_priority then 4
            when 'high'::public.crm_ticket_priority then 3
            when 'normal'::public.crm_ticket_priority then 2
            when 'low'::public.crm_ticket_priority then 1
            else 0
          end desc,
          t.created_at asc,
          t.id asc
        limit ${limit.value + 1}
      `);

      const rows = rowsFromExecuteResult(result);
      return ok({
        rows: rows.slice(0, limit.value).map(rowToTicketDto),
        hasMore: rows.length > limit.value,
        totalCount,
      });
    });
  } catch (error) {
    return err(databaseError(error));
  }
}

export async function getTicket(
  input: GetTicketInput,
  dependencies: CrmApplicationDependencies = {},
): Promise<Result<CrmTicketDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownTicketId = assertKnownUuid(input.ticketId, "Ticket id");
  if (!knownTicketId.ok) {
    return err(knownTicketId.error);
  }

  const authorized = await authorizeCrm(input, "read", dependencies.authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const ticket = await selectTicketById(tx, input.ticketId, input.workspaceId);
      return ticket === null ? err(crmError("crm.notFound", "Ticket was not found.")) : ok(ticket);
    });
  } catch (error) {
    return err(databaseError(error));
  }
}

export const ticketInternal = {
  selectTicketById,
};
