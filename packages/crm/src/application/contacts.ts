import { sql, withTenant, type TenantTransaction } from "@opzava/adapters";
import { err, ok, type Result } from "@opzava/shared-kernel";

import { accountInternal } from "./accounts.js";
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
  normalizeOffset,
  normalizeOptionalText,
  normalizeOptionalUserId,
  normalizeRequiredText,
  rowToActivityDto,
  rowToContactDto,
  rowsFromExecuteResult,
  stringOrNull,
  type CrmActivityDto,
  type CrmApplicationContext,
  type CrmApplicationDependencies,
  type CrmContactDto,
  type CrmListPageDto,
} from "./shared.js";
import { parseCrmContactLifecycle, type CrmContactLifecycle } from "../domain/index.js";

export interface CreateContactInput extends CrmApplicationContext {
  readonly displayName: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly title?: string | null;
  readonly lifecycleStage?: CrmContactLifecycle;
  readonly accountId?: string | null;
  readonly ownerUserId?: string | null;
  readonly notes?: string | null;
  readonly idempotencyKey?: string;
}

export interface UpdateContactInput extends CrmApplicationContext {
  readonly contactId: string;
  readonly displayName?: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly title?: string | null;
  readonly lifecycleStage?: CrmContactLifecycle;
  readonly accountId?: string | null;
  readonly ownerUserId?: string | null;
  readonly notes?: string | null;
}

export interface GetContactInput extends CrmApplicationContext {
  readonly contactId: string;
}

export interface ListContactsInput extends CrmApplicationContext {
  readonly limit?: number;
}

export interface ListContactTimelineInput extends CrmApplicationContext {
  readonly contactId: string;
  readonly limit?: number;
  readonly offset?: number;
}

interface PreparedContactFields {
  readonly displayName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly title: string | null;
  readonly lifecycleStage: CrmContactLifecycle;
  readonly accountId: string | null;
  readonly ownerUserId: string | null;
  readonly notes: string;
}

function normalizeContactAccountId(value: string | null | undefined): Result<string | null> {
  if (value === null || value === undefined || value.trim() === "") {
    return ok(null);
  }

  const normalized = value.trim();
  const known = assertKnownUuid(normalized, "Account id");
  return known.ok ? ok(normalized) : err(known.error);
}

function prepareCreateContactFields(input: CreateContactInput): Result<PreparedContactFields> {
  const displayName = normalizeRequiredText(input.displayName, "Contact display name", 240);
  const email = normalizeOptionalText(input.email, "Contact email", 320);
  const phone = normalizeOptionalText(input.phone, "Contact phone", 80);
  const title = normalizeOptionalText(input.title, "Contact title", 240);
  const lifecycleStage = parseCrmContactLifecycle(input.lifecycleStage ?? "lead");
  const accountId = normalizeContactAccountId(input.accountId);
  const ownerUserId = normalizeOptionalUserId(input.ownerUserId, "Contact owner");
  const notes = normalizeLongText(input.notes, "Contact notes", 4000);

  if (!displayName.ok) {
    return err(displayName.error);
  }
  if (!email.ok) {
    return err(email.error);
  }
  if (!phone.ok) {
    return err(phone.error);
  }
  if (!title.ok) {
    return err(title.error);
  }
  if (!lifecycleStage.ok) {
    return err(lifecycleStage.error);
  }
  if (!accountId.ok) {
    return err(accountId.error);
  }
  if (!ownerUserId.ok) {
    return err(ownerUserId.error);
  }
  if (!notes.ok) {
    return err(notes.error);
  }

  return ok({
    displayName: displayName.value,
    email: email.value,
    phone: phone.value,
    title: title.value,
    lifecycleStage: lifecycleStage.value,
    accountId: accountId.value,
    ownerUserId: ownerUserId.value,
    notes: notes.value,
  });
}

async function selectContactById(
  tx: TenantTransaction,
  contactId: string,
  workspaceId: string,
): Promise<CrmContactDto | null> {
  const result = await tx.execute(sql`
    select
      c.id,
      c.organization_id,
      c.workspace_id,
      c.display_name,
      c.email,
      c.phone,
      c.title,
      c.lifecycle_stage,
      c.account_id,
      a.name as account_name,
      c.owner_user_id,
      c.notes,
      c.created_at,
      c.updated_at,
      (
        select count(*)::integer
        from public.crm_tickets t
        where t.organization_id = c.organization_id
          and t.workspace_id = c.workspace_id
          and t.contact_id = c.id
          and t.status not in (
            'resolved'::public.crm_ticket_status,
            'closed'::public.crm_ticket_status
          )
      ) as open_ticket_count,
      (
        select count(*)::integer
        from public.crm_deals d
        where d.organization_id = c.organization_id
          and d.workspace_id = c.workspace_id
          and d.primary_contact_id = c.id
          and d.status = 'open'::public.crm_deal_status
      ) as open_deal_count
    from public.crm_contacts c
    left join public.crm_accounts a
      on a.id = c.account_id
      and a.organization_id = c.organization_id
    where c.id = ${contactId}
      and c.workspace_id = ${workspaceId}
    limit 1
  `);

  const row = rowsFromExecuteResult(result)[0];
  return row === undefined ? null : rowToContactDto(row);
}

async function selectContactByIdempotencyKey(
  tx: TenantTransaction,
  orgId: string,
  idempotencyKey: string,
): Promise<CrmContactDto | null> {
  const result = await tx.execute(sql`
    select
      c.id,
      c.organization_id,
      c.workspace_id,
      c.display_name,
      c.email,
      c.phone,
      c.title,
      c.lifecycle_stage,
      c.account_id,
      a.name as account_name,
      c.owner_user_id,
      c.notes,
      c.created_at,
      c.updated_at,
      0::integer as open_ticket_count,
      0::integer as open_deal_count
    from public.crm_contacts c
    left join public.crm_accounts a
      on a.id = c.account_id
      and a.organization_id = c.organization_id
    where c.organization_id = ${orgId}
      and c.idempotency_key = ${idempotencyKey}
    limit 1
  `);

  const row = rowsFromExecuteResult(result)[0];
  return row === undefined ? null : rowToContactDto(row);
}

async function validateAccount(
  tx: TenantTransaction,
  input: CrmApplicationContext,
  accountId: string | null,
): Promise<Result<void>> {
  if (accountId === null) {
    return ok(undefined);
  }

  const account = await accountInternal.selectAccountById(tx, accountId, input.workspaceId);
  return account === null ? err(crmError("crm.notFound", "Account was not found.")) : ok(undefined);
}

export async function createContact(
  input: CreateContactInput,
  dependencies: CrmApplicationDependencies = {},
): Promise<Result<CrmContactDto>> {
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
        const replay = await selectContactByIdempotencyKey(tx, input.orgId, idempotencyKey.value);
        if (replay !== null) {
          return ok(replay);
        }
      }

      const fields = prepareCreateContactFields(input);
      if (!fields.ok) {
        return err(fields.error);
      }

      const validAccount = await validateAccount(tx, input, fields.value.accountId);
      if (!validAccount.ok) {
        return err(validAccount.error);
      }

      const inserted = await tx.execute(sql`
        insert into public.crm_contacts (
          organization_id,
          workspace_id,
          display_name,
          email,
          phone,
          title,
          lifecycle_stage,
          account_id,
          owner_user_id,
          notes,
          idempotency_key
        )
        values (
          ${input.orgId},
          ${input.workspaceId},
          ${fields.value.displayName},
          ${fields.value.email},
          ${fields.value.phone},
          ${fields.value.title},
          ${fields.value.lifecycleStage}::public.crm_contact_lifecycle,
          ${fields.value.accountId},
          ${fields.value.ownerUserId},
          ${fields.value.notes},
          ${idempotencyKey.value}
        )
        on conflict (organization_id, idempotency_key) do nothing
        returning id
      `);

      const insertedId = stringOrNull(rowsFromExecuteResult(inserted)[0]?.["id"]);
      if (insertedId === null) {
        if (idempotencyKey.value !== null) {
          const replay = await selectContactByIdempotencyKey(tx, input.orgId, idempotencyKey.value);
          if (replay !== null) {
            return ok(replay);
          }
        }

        return err(crmError("crm.databaseError", "Contact could not be created."));
      }

      await insertCrmActivity(tx, input, {
        kind: "contact_created",
        contactId: insertedId,
        accountId: fields.value.accountId,
      });

      const contact = await selectContactById(tx, insertedId, input.workspaceId);
      return contact === null
        ? err(crmError("crm.databaseError", "Contact could not be loaded after create."))
        : ok(contact);
    });
  } catch (error) {
    return err(databaseError(error));
  }
}

export async function updateContact(
  input: UpdateContactInput,
  dependencies: CrmApplicationDependencies = {},
): Promise<Result<CrmContactDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownContactId = assertKnownUuid(input.contactId, "Contact id");
  if (!knownContactId.ok) {
    return err(knownContactId.error);
  }

  const displayName =
    input.displayName === undefined
      ? undefined
      : normalizeRequiredText(input.displayName, "Contact display name", 240);
  const email =
    input.email === undefined
      ? undefined
      : normalizeOptionalText(input.email, "Contact email", 320);
  const phone =
    input.phone === undefined ? undefined : normalizeOptionalText(input.phone, "Contact phone", 80);
  const title =
    input.title === undefined
      ? undefined
      : normalizeOptionalText(input.title, "Contact title", 240);
  const lifecycleStage =
    input.lifecycleStage === undefined ? undefined : parseCrmContactLifecycle(input.lifecycleStage);
  const accountId =
    input.accountId === undefined ? undefined : normalizeContactAccountId(input.accountId);
  const ownerUserId =
    input.ownerUserId === undefined
      ? undefined
      : normalizeOptionalUserId(input.ownerUserId, "Contact owner");
  const notes =
    input.notes === undefined ? undefined : normalizeLongText(input.notes, "Contact notes", 4000);

  if (displayName !== undefined && !displayName.ok) {
    return err(displayName.error);
  }
  if (email !== undefined && !email.ok) {
    return err(email.error);
  }
  if (phone !== undefined && !phone.ok) {
    return err(phone.error);
  }
  if (title !== undefined && !title.ok) {
    return err(title.error);
  }
  if (lifecycleStage !== undefined && !lifecycleStage.ok) {
    return err(lifecycleStage.error);
  }
  if (accountId !== undefined && !accountId.ok) {
    return err(accountId.error);
  }
  if (ownerUserId !== undefined && !ownerUserId.ok) {
    return err(ownerUserId.error);
  }
  if (notes !== undefined && !notes.ok) {
    return err(notes.error);
  }
  const displayNameValue = displayName === undefined ? undefined : displayName.value;
  const emailValue = email === undefined ? undefined : email.value;
  const phoneValue = phone === undefined ? undefined : phone.value;
  const titleValue = title === undefined ? undefined : title.value;
  const lifecycleStageValue = lifecycleStage === undefined ? undefined : lifecycleStage.value;
  const accountIdValue = accountId === undefined ? undefined : accountId.value;
  const ownerUserIdValue = ownerUserId === undefined ? undefined : ownerUserId.value;
  const notesValue = notes === undefined ? undefined : notes.value;

  const authorized = await authorizeCrm(input, "update", dependencies.authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const existing = await selectContactById(tx, input.contactId, input.workspaceId);
      if (existing === null) {
        return err(crmError("crm.notFound", "Contact was not found."));
      }

      const nextAccountId = accountIdValue === undefined ? existing.accountId : accountIdValue;
      const validAccount = await validateAccount(tx, input, nextAccountId);
      if (!validAccount.ok) {
        return err(validAccount.error);
      }

      const updated = await tx.execute(sql`
        update public.crm_contacts
        set
          display_name = ${
            displayNameValue === undefined ? existing.displayName : displayNameValue
          },
          email = ${emailValue === undefined ? existing.email : emailValue},
          phone = ${phoneValue === undefined ? existing.phone : phoneValue},
          title = ${titleValue === undefined ? existing.title : titleValue},
          lifecycle_stage = ${
            lifecycleStageValue === undefined ? existing.lifecycleStage : lifecycleStageValue
          }::public.crm_contact_lifecycle,
          account_id = ${nextAccountId},
          owner_user_id = ${
            ownerUserIdValue === undefined ? existing.ownerUserId : ownerUserIdValue
          },
          notes = ${notesValue === undefined ? existing.notes : notesValue},
          updated_at = now()
        where id = ${input.contactId}
          and workspace_id = ${input.workspaceId}
        returning id
      `);

      if (rowsFromExecuteResult(updated)[0] === undefined) {
        return err(crmError("crm.notFound", "Contact was not found."));
      }

      const contact = await selectContactById(tx, input.contactId, input.workspaceId);
      return contact === null
        ? err(crmError("crm.notFound", "Contact was not found."))
        : ok(contact);
    });
  } catch (error) {
    return err(databaseError(error));
  }
}

export async function getContact(
  input: GetContactInput,
  dependencies: CrmApplicationDependencies = {},
): Promise<Result<CrmContactDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownContactId = assertKnownUuid(input.contactId, "Contact id");
  if (!knownContactId.ok) {
    return err(knownContactId.error);
  }

  const authorized = await authorizeCrm(input, "read", dependencies.authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const contact = await selectContactById(tx, input.contactId, input.workspaceId);
      return contact === null
        ? err(crmError("crm.notFound", "Contact was not found."))
        : ok(contact);
    });
  } catch (error) {
    return err(databaseError(error));
  }
}

export async function listContacts(
  input: ListContactsInput,
  dependencies: CrmApplicationDependencies = {},
): Promise<Result<CrmListPageDto<CrmContactDto>>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const limit = normalizeLimit(input.limit, 50, 200);
  if (!limit.ok) {
    return err(limit.error);
  }

  const authorized = await authorizeCrm(input, "read", dependencies.authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const totalResult = await tx.execute(sql`
        select count(*)::integer as total_count
        from public.crm_contacts
        where workspace_id = ${input.workspaceId}
      `);
      const totalCount = Number(rowsFromExecuteResult(totalResult)[0]?.["total_count"] ?? 0);

      const result = await tx.execute(sql`
        select
          c.id,
          c.organization_id,
          c.workspace_id,
          c.display_name,
          c.email,
          c.phone,
          c.title,
          c.lifecycle_stage,
          c.account_id,
          a.name as account_name,
          c.owner_user_id,
          c.notes,
          c.created_at,
          c.updated_at,
          (
            select count(*)::integer
            from public.crm_tickets t
            where t.organization_id = c.organization_id
              and t.workspace_id = c.workspace_id
              and t.contact_id = c.id
              and t.status not in (
                'resolved'::public.crm_ticket_status,
                'closed'::public.crm_ticket_status
              )
          ) as open_ticket_count,
          (
            select count(*)::integer
            from public.crm_deals d
            where d.organization_id = c.organization_id
              and d.workspace_id = c.workspace_id
              and d.primary_contact_id = c.id
              and d.status = 'open'::public.crm_deal_status
          ) as open_deal_count
        from public.crm_contacts c
        left join public.crm_accounts a
          on a.id = c.account_id
          and a.organization_id = c.organization_id
        where c.workspace_id = ${input.workspaceId}
        order by lower(c.display_name) asc, c.created_at asc, c.id asc
        limit ${limit.value + 1}
      `);

      const rows = rowsFromExecuteResult(result);
      return ok({
        rows: rows.slice(0, limit.value).map(rowToContactDto),
        hasMore: rows.length > limit.value,
        totalCount,
      });
    });
  } catch (error) {
    return err(databaseError(error));
  }
}

export async function listContactTimeline(
  input: ListContactTimelineInput,
  dependencies: CrmApplicationDependencies = {},
): Promise<Result<readonly CrmActivityDto[]>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownContactId = assertKnownUuid(input.contactId, "Contact id");
  if (!knownContactId.ok) {
    return err(knownContactId.error);
  }

  const limit = normalizeLimit(input.limit);
  const offset = normalizeOffset(input.offset);
  if (!limit.ok) {
    return err(limit.error);
  }
  if (!offset.ok) {
    return err(offset.error);
  }

  const authorized = await authorizeCrm(input, "read", dependencies.authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const contact = await selectContactById(tx, input.contactId, input.workspaceId);
      if (contact === null) {
        return err(crmError("crm.notFound", "Contact was not found."));
      }

      const result = await tx.execute(sql`
        select
          id,
          organization_id,
          workspace_id,
          kind,
          body,
          actor_kind,
          actor_user_id,
          contact_id,
          account_id,
          deal_id,
          ticket_id,
          occurred_at,
          created_at
        from public.crm_activities
        where workspace_id = ${input.workspaceId}
          and contact_id = ${input.contactId}
        order by occurred_at desc, id desc
        limit ${limit.value}
        offset ${offset.value}
      `);

      return ok(rowsFromExecuteResult(result).map(rowToActivityDto));
    });
  } catch (error) {
    return err(databaseError(error));
  }
}

export const contactInternal = {
  selectContactById,
};
