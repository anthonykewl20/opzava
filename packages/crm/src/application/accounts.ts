import { sql, withTenant, type TenantTransaction } from "@opzava/adapters";
import { err, ok, type Result } from "@opzava/shared-kernel";

import {
  assertKnownIds,
  assertKnownUuid,
  authorizeCrm,
  crmError,
  databaseError,
  insertCrmActivity,
  normalizeIdempotencyKey,
  normalizeLongText,
  normalizeOptionalText,
  normalizeOptionalUserId,
  normalizeRequiredText,
  rowToAccountDto,
  rowsFromExecuteResult,
  stringOrNull,
  type CrmAccountDto,
  type CrmApplicationContext,
  type CrmApplicationDependencies,
} from "./shared.js";

export interface CreateAccountInput extends CrmApplicationContext {
  readonly name: string;
  readonly domain?: string | null;
  readonly industry?: string | null;
  readonly website?: string | null;
  readonly description?: string | null;
  readonly ownerUserId?: string | null;
  readonly parentAccountId?: string | null;
  readonly idempotencyKey?: string;
}

export interface UpdateAccountInput extends CrmApplicationContext {
  readonly accountId: string;
  readonly name?: string;
  readonly domain?: string | null;
  readonly industry?: string | null;
  readonly website?: string | null;
  readonly description?: string | null;
  readonly ownerUserId?: string | null;
  readonly parentAccountId?: string | null;
}

export interface GetAccountInput extends CrmApplicationContext {
  readonly accountId: string;
}

export type ListAccountsInput = CrmApplicationContext;

interface PreparedAccountFields {
  readonly name: string;
  readonly domain: string | null;
  readonly industry: string | null;
  readonly website: string | null;
  readonly description: string;
  readonly ownerUserId: string | null;
  readonly parentAccountId: string | null;
}

function normalizeParentAccountId(value: string | null | undefined): Result<string | null> {
  if (value === null || value === undefined || value.trim() === "") {
    return ok(null);
  }

  const normalized = value.trim();
  const known = assertKnownUuid(normalized, "Parent account id");
  return known.ok ? ok(normalized) : err(known.error);
}

function prepareCreateAccountFields(input: CreateAccountInput): Result<PreparedAccountFields> {
  const name = normalizeRequiredText(input.name, "Account name", 240);
  const domain = normalizeOptionalText(input.domain, "Account domain", 240);
  const industry = normalizeOptionalText(input.industry, "Account industry", 240);
  const website = normalizeOptionalText(input.website, "Account website", 500);
  const description = normalizeLongText(input.description, "Account description", 4000);
  const ownerUserId = normalizeOptionalUserId(input.ownerUserId, "Account owner");
  const parentAccountId = normalizeParentAccountId(input.parentAccountId);

  if (!name.ok) {
    return err(name.error);
  }
  if (!domain.ok) {
    return err(domain.error);
  }
  if (!industry.ok) {
    return err(industry.error);
  }
  if (!website.ok) {
    return err(website.error);
  }
  if (!description.ok) {
    return err(description.error);
  }
  if (!ownerUserId.ok) {
    return err(ownerUserId.error);
  }
  if (!parentAccountId.ok) {
    return err(parentAccountId.error);
  }

  return ok({
    name: name.value,
    domain: domain.value,
    industry: industry.value,
    website: website.value,
    description: description.value,
    ownerUserId: ownerUserId.value,
    parentAccountId: parentAccountId.value,
  });
}

async function selectAccountById(
  tx: TenantTransaction,
  accountId: string,
  workspaceId: string,
): Promise<CrmAccountDto | null> {
  const result = await tx.execute(sql`
    select
      a.id,
      a.organization_id,
      a.workspace_id,
      a.name,
      a.domain,
      a.industry,
      a.website,
      a.description,
      a.owner_user_id,
      a.parent_account_id,
      a.created_at,
      a.updated_at,
      (
        select count(*)::integer
        from public.crm_contacts c
        where c.organization_id = a.organization_id
          and c.workspace_id = a.workspace_id
          and c.account_id = a.id
      ) as contact_count,
      (
        select count(*)::integer
        from public.crm_deals d
        where d.organization_id = a.organization_id
          and d.workspace_id = a.workspace_id
          and d.account_id = a.id
      ) as deal_count,
      (
        select count(*)::integer
        from public.crm_tickets t
        where t.organization_id = a.organization_id
          and t.workspace_id = a.workspace_id
          and t.account_id = a.id
      ) as ticket_count
    from public.crm_accounts a
    where a.id = ${accountId}
      and a.workspace_id = ${workspaceId}
    limit 1
  `);

  const row = rowsFromExecuteResult(result)[0];
  return row === undefined ? null : rowToAccountDto(row);
}

async function selectAccountByIdempotencyKey(
  tx: TenantTransaction,
  orgId: string,
  idempotencyKey: string,
): Promise<CrmAccountDto | null> {
  const result = await tx.execute(sql`
    select
      a.id,
      a.organization_id,
      a.workspace_id,
      a.name,
      a.domain,
      a.industry,
      a.website,
      a.description,
      a.owner_user_id,
      a.parent_account_id,
      a.created_at,
      a.updated_at,
      (
        select count(*)::integer
        from public.crm_contacts c
        where c.organization_id = a.organization_id
          and c.workspace_id = a.workspace_id
          and c.account_id = a.id
      ) as contact_count,
      (
        select count(*)::integer
        from public.crm_deals d
        where d.organization_id = a.organization_id
          and d.workspace_id = a.workspace_id
          and d.account_id = a.id
      ) as deal_count,
      (
        select count(*)::integer
        from public.crm_tickets t
        where t.organization_id = a.organization_id
          and t.workspace_id = a.workspace_id
          and t.account_id = a.id
      ) as ticket_count
    from public.crm_accounts a
    where a.organization_id = ${orgId}
      and a.idempotency_key = ${idempotencyKey}
    limit 1
  `);

  const row = rowsFromExecuteResult(result)[0];
  return row === undefined ? null : rowToAccountDto(row);
}

async function validateParentAccount(
  tx: TenantTransaction,
  input: CrmApplicationContext,
  accountId: string | null,
  parentAccountId: string | null,
): Promise<Result<void>> {
  if (parentAccountId === null) {
    return ok(undefined);
  }

  if (accountId !== null && parentAccountId === accountId) {
    return err(crmError("crm.validation", "An account cannot be its own parent."));
  }

  const parentResult = await tx.execute(sql`
    select parent_account_id
    from public.crm_accounts
    where id = ${parentAccountId}
      and workspace_id = ${input.workspaceId}
    limit 1
  `);
  const parentRow = rowsFromExecuteResult(parentResult)[0];
  if (parentRow === undefined) {
    return err(crmError("crm.notFound", "Parent account was not found."));
  }

  let currentParentId = stringOrNull(parentRow["parent_account_id"]);
  for (let hop = 0; hop < 10 && currentParentId !== null; hop += 1) {
    if (accountId !== null && currentParentId === accountId) {
      return err(crmError("crm.validation", "Account parent hierarchy cannot contain a cycle."));
    }

    const currentResult = await tx.execute(sql`
      select parent_account_id
      from public.crm_accounts
      where id = ${currentParentId}
        and workspace_id = ${input.workspaceId}
      limit 1
    `);
    const currentRow = rowsFromExecuteResult(currentResult)[0];
    currentParentId =
      currentRow === undefined ? null : stringOrNull(currentRow["parent_account_id"]);
  }

  if (currentParentId !== null) {
    return err(crmError("crm.validation", "Account parent hierarchy is too deep."));
  }

  return ok(undefined);
}

export async function createAccount(
  input: CreateAccountInput,
  dependencies: CrmApplicationDependencies = {},
): Promise<Result<CrmAccountDto>> {
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
        const replay = await selectAccountByIdempotencyKey(tx, input.orgId, idempotencyKey.value);
        if (replay !== null) {
          return ok(replay);
        }
      }

      const fields = prepareCreateAccountFields(input);
      if (!fields.ok) {
        return err(fields.error);
      }

      const validParent = await validateParentAccount(
        tx,
        input,
        null,
        fields.value.parentAccountId,
      );
      if (!validParent.ok) {
        return err(validParent.error);
      }

      const inserted = await tx.execute(sql`
        insert into public.crm_accounts (
          organization_id,
          workspace_id,
          name,
          domain,
          industry,
          website,
          description,
          owner_user_id,
          parent_account_id,
          idempotency_key
        )
        values (
          ${input.orgId},
          ${input.workspaceId},
          ${fields.value.name},
          ${fields.value.domain},
          ${fields.value.industry},
          ${fields.value.website},
          ${fields.value.description},
          ${fields.value.ownerUserId},
          ${fields.value.parentAccountId},
          ${idempotencyKey.value}
        )
        on conflict (organization_id, idempotency_key) do nothing
        returning id
      `);

      const insertedId = stringOrNull(rowsFromExecuteResult(inserted)[0]?.["id"]);
      if (insertedId === null) {
        if (idempotencyKey.value !== null) {
          const replay = await selectAccountByIdempotencyKey(tx, input.orgId, idempotencyKey.value);
          if (replay !== null) {
            return ok(replay);
          }
        }

        return err(crmError("crm.databaseError", "Account could not be created."));
      }

      await insertCrmActivity(tx, input, {
        kind: "account_created",
        accountId: insertedId,
      });

      const account = await selectAccountById(tx, insertedId, input.workspaceId);
      return account === null
        ? err(crmError("crm.databaseError", "Account could not be loaded after create."))
        : ok(account);
    });
  } catch (error) {
    return err(databaseError(error));
  }
}

export async function updateAccount(
  input: UpdateAccountInput,
  dependencies: CrmApplicationDependencies = {},
): Promise<Result<CrmAccountDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownAccountId = assertKnownUuid(input.accountId, "Account id");
  if (!knownAccountId.ok) {
    return err(knownAccountId.error);
  }

  const name =
    input.name === undefined
      ? undefined
      : normalizeRequiredText(input.name, "Account name", 240);
  const domain =
    input.domain === undefined
      ? undefined
      : normalizeOptionalText(input.domain, "Account domain", 240);
  const industry =
    input.industry === undefined
      ? undefined
      : normalizeOptionalText(input.industry, "Account industry", 240);
  const website =
    input.website === undefined
      ? undefined
      : normalizeOptionalText(input.website, "Account website", 500);
  const description =
    input.description === undefined
      ? undefined
      : normalizeLongText(input.description, "Account description", 4000);
  const ownerUserId =
    input.ownerUserId === undefined
      ? undefined
      : normalizeOptionalUserId(input.ownerUserId, "Account owner");
  const parentAccountId =
    input.parentAccountId === undefined
      ? undefined
      : normalizeParentAccountId(input.parentAccountId);

  if (name !== undefined && !name.ok) {
    return err(name.error);
  }
  if (domain !== undefined && !domain.ok) {
    return err(domain.error);
  }
  if (industry !== undefined && !industry.ok) {
    return err(industry.error);
  }
  if (website !== undefined && !website.ok) {
    return err(website.error);
  }
  if (description !== undefined && !description.ok) {
    return err(description.error);
  }
  if (ownerUserId !== undefined && !ownerUserId.ok) {
    return err(ownerUserId.error);
  }
  if (parentAccountId !== undefined && !parentAccountId.ok) {
    return err(parentAccountId.error);
  }
  const nameValue = name === undefined ? undefined : name.value;
  const domainValue = domain === undefined ? undefined : domain.value;
  const industryValue = industry === undefined ? undefined : industry.value;
  const websiteValue = website === undefined ? undefined : website.value;
  const descriptionValue = description === undefined ? undefined : description.value;
  const ownerUserIdValue = ownerUserId === undefined ? undefined : ownerUserId.value;
  const parentAccountIdValue =
    parentAccountId === undefined ? undefined : parentAccountId.value;

  const authorized = await authorizeCrm(input, "update", dependencies.authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const existing = await selectAccountById(tx, input.accountId, input.workspaceId);
      if (existing === null) {
        return err(crmError("crm.notFound", "Account was not found."));
      }

      const nextParentAccountId =
        parentAccountIdValue === undefined ? existing.parentAccountId : parentAccountIdValue;
      if (parentAccountIdValue !== undefined) {
        await tx.execute(sql`
          select pg_advisory_xact_lock(hashtext('crm_account_graph:' || ${input.orgId}))
        `);

        const validParent = await validateParentAccount(
          tx,
          input,
          input.accountId,
          nextParentAccountId,
        );
        if (!validParent.ok) {
          return err(validParent.error);
        }
      }

      const updated = await tx.execute(sql`
        update public.crm_accounts
        set
          name = ${nameValue === undefined ? existing.name : nameValue},
          domain = ${domainValue === undefined ? existing.domain : domainValue},
          industry = ${industryValue === undefined ? existing.industry : industryValue},
          website = ${websiteValue === undefined ? existing.website : websiteValue},
          description = ${descriptionValue === undefined ? existing.description : descriptionValue},
          owner_user_id = ${
            ownerUserIdValue === undefined ? existing.ownerUserId : ownerUserIdValue
          },
          parent_account_id = ${nextParentAccountId},
          updated_at = now()
        where id = ${input.accountId}
          and workspace_id = ${input.workspaceId}
        returning id
      `);

      if (rowsFromExecuteResult(updated)[0] === undefined) {
        return err(crmError("crm.notFound", "Account was not found."));
      }

      const account = await selectAccountById(tx, input.accountId, input.workspaceId);
      return account === null
        ? err(crmError("crm.notFound", "Account was not found."))
        : ok(account);
    });
  } catch (error) {
    return err(databaseError(error));
  }
}

export async function getAccount(
  input: GetAccountInput,
  dependencies: CrmApplicationDependencies = {},
): Promise<Result<CrmAccountDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownAccountId = assertKnownUuid(input.accountId, "Account id");
  if (!knownAccountId.ok) {
    return err(knownAccountId.error);
  }

  const authorized = await authorizeCrm(input, "read", dependencies.authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const account = await selectAccountById(tx, input.accountId, input.workspaceId);
      return account === null
        ? err(crmError("crm.notFound", "Account was not found."))
        : ok(account);
    });
  } catch (error) {
    return err(databaseError(error));
  }
}

export async function listAccounts(
  input: ListAccountsInput,
  dependencies: CrmApplicationDependencies = {},
): Promise<Result<readonly CrmAccountDto[]>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const authorized = await authorizeCrm(input, "read", dependencies.authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const result = await tx.execute(sql`
        select
          a.id,
          a.organization_id,
          a.workspace_id,
          a.name,
          a.domain,
          a.industry,
          a.website,
          a.description,
          a.owner_user_id,
          a.parent_account_id,
          a.created_at,
          a.updated_at,
          (
            select count(*)::integer
            from public.crm_contacts c
            where c.organization_id = a.organization_id
              and c.workspace_id = a.workspace_id
              and c.account_id = a.id
          ) as contact_count,
          (
            select count(*)::integer
            from public.crm_deals d
            where d.organization_id = a.organization_id
              and d.workspace_id = a.workspace_id
              and d.account_id = a.id
          ) as deal_count,
          (
            select count(*)::integer
            from public.crm_tickets t
            where t.organization_id = a.organization_id
              and t.workspace_id = a.workspace_id
              and t.account_id = a.id
          ) as ticket_count
        from public.crm_accounts a
        where a.workspace_id = ${input.workspaceId}
        order by lower(a.name) asc, a.created_at asc, a.id asc
      `);

      return ok(rowsFromExecuteResult(result).map(rowToAccountDto));
    });
  } catch (error) {
    return err(databaseError(error));
  }
}

export const accountInternal = {
  selectAccountById,
};
