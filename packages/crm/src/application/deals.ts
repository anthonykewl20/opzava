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
  normalizeCurrency,
  normalizeDate,
  normalizeIdempotencyKey,
  normalizeLimit,
  normalizeLongText,
  normalizeOptionalUserId,
  normalizeRequiredText,
  normalizeValueCents,
  rowToDealDto,
  rowToPipelineDto,
  rowToPipelineStageDto,
  rowsFromExecuteResult,
  stringOrNull,
  type CrmApplicationContext,
  type CrmApplicationDependencies,
  type CrmDealDto,
  type CrmDealStageColumnDto,
  type CrmListPageDto,
  type CrmPipelineStageDto,
  type CrmPipelineWithStagesDto,
} from "./shared.js";

export type EnsureDefaultPipelineInput = CrmApplicationContext;

export interface CreateDealInput extends CrmApplicationContext {
  readonly title: string;
  readonly accountId: string;
  readonly primaryContactId?: string | null;
  readonly stageId?: string | null;
  readonly valueCents?: number | null;
  readonly currency?: string;
  readonly ownerUserId?: string | null;
  readonly expectedCloseDate?: string | Date | null;
  readonly idempotencyKey?: string;
}

export interface MoveDealStageInput extends CrmApplicationContext {
  readonly dealId: string;
  readonly stageId: string;
}

export interface CloseDealInput extends CrmApplicationContext {
  readonly dealId: string;
  readonly outcome: "won" | "lost";
  readonly closeReason?: string | null;
}

export interface ReopenDealInput extends CrmApplicationContext {
  readonly dealId: string;
}

export interface UpdateDealInput extends CrmApplicationContext {
  readonly dealId: string;
  readonly title?: string;
  readonly valueCents?: number | null;
  readonly currency?: string;
  readonly ownerUserId?: string | null;
  readonly expectedCloseDate?: string | Date | null;
  readonly primaryContactId?: string | null;
}

export interface ListDealsInput extends CrmApplicationContext {
  readonly limit?: number;
}

interface PreparedDealFields {
  readonly title: string;
  readonly accountId: string;
  readonly primaryContactId: string | null;
  readonly stageId: string | null;
  readonly valueCents: number | null;
  readonly currency: string;
  readonly ownerUserId: string | null;
  readonly expectedCloseDate: string | null;
}

const defaultStageNames = ["Lead in", "Qualified", "Proposal", "Negotiation"] as const;

function normalizeDealAccountId(value: string): Result<string> {
  const normalized = value.trim();
  const known = assertKnownUuid(normalized, "Account id");
  return known.ok ? ok(normalized) : err(known.error);
}

function normalizeOptionalUuid(
  value: string | null | undefined,
  field: string,
): Result<string | null> {
  if (value === null || value === undefined || value.trim() === "") {
    return ok(null);
  }

  const normalized = value.trim();
  const known = assertKnownUuid(normalized, field);
  return known.ok ? ok(normalized) : err(known.error);
}

function prepareCreateDealFields(input: CreateDealInput): Result<PreparedDealFields> {
  const title = normalizeRequiredText(input.title, "Deal title", 240);
  const accountId = normalizeDealAccountId(input.accountId);
  const primaryContactId = normalizeOptionalUuid(input.primaryContactId, "Primary contact id");
  const stageId = normalizeOptionalUuid(input.stageId, "Stage id");
  const valueCents = normalizeValueCents(input.valueCents);
  const currency = normalizeCurrency(input.currency);
  const ownerUserId = normalizeOptionalUserId(input.ownerUserId, "Deal owner");
  const expectedCloseDate = normalizeDate(input.expectedCloseDate);

  if (!title.ok) {
    return err(title.error);
  }
  if (!accountId.ok) {
    return err(accountId.error);
  }
  if (!primaryContactId.ok) {
    return err(primaryContactId.error);
  }
  if (!stageId.ok) {
    return err(stageId.error);
  }
  if (!valueCents.ok) {
    return err(valueCents.error);
  }
  if (!currency.ok) {
    return err(currency.error);
  }
  if (!ownerUserId.ok) {
    return err(ownerUserId.error);
  }
  if (!expectedCloseDate.ok) {
    return err(expectedCloseDate.error);
  }

  return ok({
    title: title.value,
    accountId: accountId.value,
    primaryContactId: primaryContactId.value,
    stageId: stageId.value,
    valueCents: valueCents.value,
    currency: currency.value,
    ownerUserId: ownerUserId.value,
    expectedCloseDate: expectedCloseDate.value,
  });
}

async function selectDealById(
  tx: TenantTransaction,
  dealId: string,
  workspaceId: string,
): Promise<CrmDealDto | null> {
  const result = await tx.execute(sql`
    select
      d.id,
      d.organization_id,
      d.workspace_id,
      d.title,
      d.account_id,
      a.name as account_name,
      d.primary_contact_id,
      c.display_name as primary_contact_name,
      d.pipeline_id,
      d.stage_id,
      s.name as stage_name,
      d.status,
      d.value_cents,
      d.currency,
      d.owner_user_id,
      d.expected_close_date,
      d.closed_at,
      d.close_reason,
      d.position,
      d.created_at,
      d.updated_at
    from public.crm_deals d
    join public.crm_accounts a
      on a.id = d.account_id
      and a.organization_id = d.organization_id
    left join public.crm_contacts c
      on c.id = d.primary_contact_id
      and c.organization_id = d.organization_id
    join public.crm_pipeline_stages s
      on s.id = d.stage_id
      and s.organization_id = d.organization_id
    where d.id = ${dealId}
      and d.workspace_id = ${workspaceId}
    limit 1
  `);

  const row = rowsFromExecuteResult(result)[0];
  return row === undefined ? null : rowToDealDto(row);
}

async function selectDealByIdempotencyKey(
  tx: TenantTransaction,
  orgId: string,
  idempotencyKey: string,
): Promise<CrmDealDto | null> {
  const result = await tx.execute(sql`
    select
      d.id,
      d.organization_id,
      d.workspace_id,
      d.title,
      d.account_id,
      a.name as account_name,
      d.primary_contact_id,
      c.display_name as primary_contact_name,
      d.pipeline_id,
      d.stage_id,
      s.name as stage_name,
      d.status,
      d.value_cents,
      d.currency,
      d.owner_user_id,
      d.expected_close_date,
      d.closed_at,
      d.close_reason,
      d.position,
      d.created_at,
      d.updated_at
    from public.crm_deals d
    join public.crm_accounts a
      on a.id = d.account_id
      and a.organization_id = d.organization_id
    left join public.crm_contacts c
      on c.id = d.primary_contact_id
      and c.organization_id = d.organization_id
    join public.crm_pipeline_stages s
      on s.id = d.stage_id
      and s.organization_id = d.organization_id
    where d.organization_id = ${orgId}
      and d.idempotency_key = ${idempotencyKey}
    limit 1
  `);

  const row = rowsFromExecuteResult(result)[0];
  return row === undefined ? null : rowToDealDto(row);
}

async function selectStageById(
  tx: TenantTransaction,
  stageId: string,
  workspaceId: string,
): Promise<CrmPipelineStageDto | null> {
  const result = await tx.execute(sql`
    select
      id,
      pipeline_id,
      organization_id,
      workspace_id,
      name,
      position,
      created_at
    from public.crm_pipeline_stages
    where id = ${stageId}
      and workspace_id = ${workspaceId}
    limit 1
  `);

  const row = rowsFromExecuteResult(result)[0];
  return row === undefined ? null : rowToPipelineStageDto(row);
}

async function selectStageForPipeline(
  tx: TenantTransaction,
  stageId: string,
  pipelineId: string,
  workspaceId: string,
): Promise<CrmPipelineStageDto | null> {
  const stage = await selectStageById(tx, stageId, workspaceId);
  return stage !== null && stage.pipelineId === pipelineId ? stage : null;
}

async function validatePrimaryContact(
  tx: TenantTransaction,
  input: CrmApplicationContext,
  contactId: string | null,
): Promise<Result<void>> {
  if (contactId === null) {
    return ok(undefined);
  }

  const contact = await contactInternal.selectContactById(tx, contactId, input.workspaceId);
  return contact === null
    ? err(crmError("crm.notFound", "Primary contact was not found."))
    : ok(undefined);
}

async function selectDefaultPipelineInTx(
  tx: TenantTransaction,
  workspaceId: string,
): Promise<Result<CrmPipelineWithStagesDto | null>> {
  const pipelineResult = await tx.execute(sql`
    select
      id,
      organization_id,
      workspace_id,
      key,
      version,
      name,
      created_at,
      updated_at
    from public.crm_pipelines
    where workspace_id = ${workspaceId}
      and key = 'default'
      and version = 1
    limit 1
  `);
  const pipelineRow = rowsFromExecuteResult(pipelineResult)[0];
  if (pipelineRow === undefined) {
    return ok(null);
  }

  const pipeline = rowToPipelineDto(pipelineRow);
  const stagesResult = await tx.execute(sql`
    select
      id,
      pipeline_id,
      organization_id,
      workspace_id,
      name,
      position,
      created_at
    from public.crm_pipeline_stages
    where pipeline_id = ${pipeline.id}
      and workspace_id = ${workspaceId}
    order by position asc, created_at asc, id asc
  `);
  const stages = rowsFromExecuteResult(stagesResult).map(rowToPipelineStageDto);

  if (stages.length !== defaultStageNames.length) {
    return err(crmError("crm.databaseError", "Default CRM pipeline stages are incomplete."));
  }

  return ok({ pipeline, stages });
}

export async function ensureDefaultPipelineInTx(
  tx: TenantTransaction,
  orgId: string,
  workspaceId: string,
): Promise<Result<CrmPipelineWithStagesDto>> {
  const inserted = await tx.execute(sql`
    insert into public.crm_pipelines (
      organization_id,
      workspace_id,
      key,
      version,
      name
    )
    values (
      ${orgId},
      ${workspaceId},
      'default',
      1,
      'Sales pipeline'
    )
    on conflict (workspace_id, key, version) do nothing
    returning id
  `);

  const insertedPipelineId = stringOrNull(rowsFromExecuteResult(inserted)[0]?.["id"]);
  if (insertedPipelineId !== null) {
    await tx.execute(sql`
      insert into public.crm_pipeline_stages (
        pipeline_id,
        organization_id,
        workspace_id,
        name,
        position
      )
      select
        ${insertedPipelineId},
        ${orgId},
        ${workspaceId},
        incoming.name,
        incoming.position
      from unnest(
        ${sql.param([...defaultStageNames])}::text[],
        ${sql.param(defaultStageNames.map((_, index) => index))}::integer[]
      ) as incoming(name, position)
      on conflict (pipeline_id, position) do nothing
    `);
  }

  const selected = await selectDefaultPipelineInTx(tx, workspaceId);
  if (!selected.ok) {
    return err(selected.error);
  }

  if (selected.value === null) {
    return err(crmError("crm.databaseError", "Default CRM pipeline could not be loaded."));
  }

  return ok(selected.value);
}

export async function ensureDefaultPipeline(
  input: EnsureDefaultPipelineInput,
  dependencies: CrmApplicationDependencies = {},
): Promise<Result<CrmPipelineWithStagesDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const authorized = await authorizeCrm(input, "create", dependencies.authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) =>
      ensureDefaultPipelineInTx(tx, input.orgId, input.workspaceId),
    );
  } catch (error) {
    return err(databaseError(error));
  }
}

export async function createDeal(
  input: CreateDealInput,
  dependencies: CrmApplicationDependencies = {},
): Promise<Result<CrmDealDto>> {
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
        const replay = await selectDealByIdempotencyKey(tx, input.orgId, idempotencyKey.value);
        if (replay !== null) {
          return ok(replay);
        }
      }

      const fields = prepareCreateDealFields(input);
      if (!fields.ok) {
        return err(fields.error);
      }

      const account = await accountInternal.selectAccountById(
        tx,
        fields.value.accountId,
        input.workspaceId,
      );
      if (account === null) {
        return err(crmError("crm.notFound", "Account was not found."));
      }

      const validContact = await validatePrimaryContact(tx, input, fields.value.primaryContactId);
      if (!validContact.ok) {
        return err(validContact.error);
      }

      const pipeline = await ensureDefaultPipelineInTx(tx, input.orgId, input.workspaceId);
      if (!pipeline.ok) {
        return err(pipeline.error);
      }

      const selectedStage =
        fields.value.stageId === null
          ? pipeline.value.stages[0]
          : await selectStageForPipeline(
              tx,
              fields.value.stageId,
              pipeline.value.pipeline.id,
              input.workspaceId,
            );
      if (selectedStage === undefined || selectedStage === null) {
        return err(crmError("crm.validation", "Deal stage must belong to the selected pipeline."));
      }

      const inserted = await tx.execute(sql`
        with next_position as (
          select coalesce(max(position), -1) + 1 as value
          from public.crm_deals
          where workspace_id = ${input.workspaceId}
            and pipeline_id = ${pipeline.value.pipeline.id}
            and stage_id = ${selectedStage.id}
        )
        insert into public.crm_deals (
          organization_id,
          workspace_id,
          title,
          account_id,
          primary_contact_id,
          pipeline_id,
          stage_id,
          status,
          value_cents,
          currency,
          owner_user_id,
          expected_close_date,
          position,
          idempotency_key
        )
        select
          ${input.orgId},
          ${input.workspaceId},
          ${fields.value.title},
          ${fields.value.accountId},
          ${fields.value.primaryContactId},
          ${pipeline.value.pipeline.id},
          ${selectedStage.id},
          'open'::public.crm_deal_status,
          ${fields.value.valueCents},
          ${fields.value.currency},
          ${fields.value.ownerUserId},
          ${fields.value.expectedCloseDate},
          next_position.value,
          ${idempotencyKey.value}
        from next_position
        on conflict (organization_id, idempotency_key) do nothing
        returning id
      `);

      const insertedId = stringOrNull(rowsFromExecuteResult(inserted)[0]?.["id"]);
      if (insertedId === null) {
        if (idempotencyKey.value !== null) {
          const replay = await selectDealByIdempotencyKey(tx, input.orgId, idempotencyKey.value);
          if (replay !== null) {
            return ok(replay);
          }
        }

        return err(crmError("crm.databaseError", "Deal could not be created."));
      }

      await insertCrmActivity(tx, input, {
        kind: "deal_created",
        contactId: fields.value.primaryContactId,
        accountId: fields.value.accountId,
        dealId: insertedId,
      });

      const deal = await selectDealById(tx, insertedId, input.workspaceId);
      return deal === null
        ? err(crmError("crm.databaseError", "Deal could not be loaded after create."))
        : ok(deal);
    });
  } catch (error) {
    return err(databaseError(error));
  }
}

export async function moveDealStage(
  input: MoveDealStageInput,
  dependencies: CrmApplicationDependencies = {},
): Promise<Result<CrmDealDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownDealId = assertKnownUuid(input.dealId, "Deal id");
  const knownStageId = assertKnownUuid(input.stageId, "Stage id");
  if (!knownDealId.ok) {
    return err(knownDealId.error);
  }
  if (!knownStageId.ok) {
    return err(knownStageId.error);
  }

  const authorized = await authorizeCrm(input, "update", dependencies.authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const updated = await tx.execute(sql`
        with updated as (
          update public.crm_deals d
          set stage_id = s.id,
              updated_at = now()
          from public.crm_pipeline_stages s,
               public.crm_pipeline_stages previous_stage
          where d.id = ${input.dealId}
            and d.organization_id = ${input.orgId}
            and d.workspace_id = ${input.workspaceId}
            and s.id = ${input.stageId}
            and s.pipeline_id = d.pipeline_id
            and s.workspace_id = d.workspace_id
            and s.organization_id = d.organization_id
            and previous_stage.id = d.stage_id
            and previous_stage.organization_id = d.organization_id
            and d.stage_id <> s.id
          returning
            d.id,
            d.organization_id,
            d.workspace_id,
            d.title,
            d.account_id,
            d.primary_contact_id,
            d.pipeline_id,
            d.stage_id,
            s.name as stage_name,
            previous_stage.name as old_stage_name,
            d.status,
            d.value_cents,
            d.currency,
            d.owner_user_id,
            d.expected_close_date,
            d.closed_at,
            d.close_reason,
            d.position,
            d.created_at,
            d.updated_at
        )
        select
          u.id,
          u.organization_id,
          u.workspace_id,
          u.title,
          u.account_id,
          a.name as account_name,
          u.primary_contact_id,
          c.display_name as primary_contact_name,
          u.pipeline_id,
          u.stage_id,
          u.stage_name,
          u.old_stage_name,
          u.status,
          u.value_cents,
          u.currency,
          u.owner_user_id,
          u.expected_close_date,
          u.closed_at,
          u.close_reason,
          u.position,
          u.created_at,
          u.updated_at
        from updated u
        join public.crm_accounts a
          on a.id = u.account_id
          and a.organization_id = u.organization_id
        left join public.crm_contacts c
          on c.id = u.primary_contact_id
          and c.organization_id = u.organization_id
      `);
      const row = rowsFromExecuteResult(updated)[0];
      if (row === undefined) {
        const deal = await selectDealById(tx, input.dealId, input.workspaceId);
        if (deal === null) {
          return err(crmError("crm.notFound", "Deal was not found."));
        }

        return deal.stageId === input.stageId
          ? ok(deal)
          : err(crmError("crm.validation", "Deal stage must belong to the deal pipeline."));
      }

      const moved = rowToDealDto(row);
      const oldStageName = String(row["old_stage_name"] ?? "");
      await insertCrmActivity(tx, input, {
        kind: "deal_stage_changed",
        body: `Stage: ${oldStageName} -> ${moved.stageName}`,
        contactId: moved.primaryContactId,
        accountId: moved.accountId,
        dealId: moved.id,
      });

      return ok(moved);
    });
  } catch (error) {
    return err(databaseError(error));
  }
}

export async function closeDeal(
  input: CloseDealInput,
  dependencies: CrmApplicationDependencies = {},
): Promise<Result<CrmDealDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownDealId = assertKnownUuid(input.dealId, "Deal id");
  if (!knownDealId.ok) {
    return err(knownDealId.error);
  }

  if (input.outcome !== "won" && input.outcome !== "lost") {
    return err(crmError("crm.validation", "Deal outcome must be won or lost."));
  }

  const closeReason = normalizeLongText(input.closeReason, "Close reason", 1000);
  if (!closeReason.ok) {
    return err(closeReason.error);
  }

  const authorized = await authorizeCrm(input, "update", dependencies.authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const updated = await tx.execute(sql`
        with updated as (
          update public.crm_deals d
          set status = ${input.outcome}::public.crm_deal_status,
              closed_at = now(),
              close_reason = ${closeReason.value === "" ? null : closeReason.value},
              updated_at = now()
          where d.id = ${input.dealId}
            and d.organization_id = ${input.orgId}
            and d.workspace_id = ${input.workspaceId}
            and d.status = 'open'::public.crm_deal_status
          returning
            d.id,
            d.organization_id,
            d.workspace_id,
            d.title,
            d.account_id,
            d.primary_contact_id,
            d.pipeline_id,
            d.stage_id,
            d.status,
            d.value_cents,
            d.currency,
            d.owner_user_id,
            d.expected_close_date,
            d.closed_at,
            d.close_reason,
            d.position,
            d.created_at,
            d.updated_at
        )
        select
          u.id,
          u.organization_id,
          u.workspace_id,
          u.title,
          u.account_id,
          a.name as account_name,
          u.primary_contact_id,
          c.display_name as primary_contact_name,
          u.pipeline_id,
          u.stage_id,
          s.name as stage_name,
          u.status,
          u.value_cents,
          u.currency,
          u.owner_user_id,
          u.expected_close_date,
          u.closed_at,
          u.close_reason,
          u.position,
          u.created_at,
          u.updated_at
        from updated u
        join public.crm_accounts a
          on a.id = u.account_id
          and a.organization_id = u.organization_id
        left join public.crm_contacts c
          on c.id = u.primary_contact_id
          and c.organization_id = u.organization_id
        join public.crm_pipeline_stages s
          on s.id = u.stage_id
          and s.organization_id = u.organization_id
      `);
      const row = rowsFromExecuteResult(updated)[0];
      if (row === undefined) {
        const deal = await selectDealById(tx, input.dealId, input.workspaceId);
        return deal === null
          ? err(crmError("crm.notFound", "Deal was not found."))
          : err(crmError("crm.conflict", "Only open deals can be closed."));
      }

      const closed = rowToDealDto(row);
      await insertCrmActivity(tx, input, {
        kind: "deal_status_changed",
        body: `Status: open -> ${input.outcome}`,
        contactId: closed.primaryContactId,
        accountId: closed.accountId,
        dealId: closed.id,
      });

      return ok(closed);
    });
  } catch (error) {
    return err(databaseError(error));
  }
}

export async function reopenDeal(
  input: ReopenDealInput,
  dependencies: CrmApplicationDependencies = {},
): Promise<Result<CrmDealDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownDealId = assertKnownUuid(input.dealId, "Deal id");
  if (!knownDealId.ok) {
    return err(knownDealId.error);
  }

  const authorized = await authorizeCrm(input, "update", dependencies.authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const updated = await tx.execute(sql`
        with candidate as (
          select d.id, d.status as old_status
          from public.crm_deals d
          where d.id = ${input.dealId}
            and d.organization_id = ${input.orgId}
            and d.workspace_id = ${input.workspaceId}
            and d.status <> 'open'::public.crm_deal_status
          for update
        ),
        updated as (
          update public.crm_deals d
          set status = 'open'::public.crm_deal_status,
              closed_at = null,
              close_reason = null,
              updated_at = now()
          from candidate
          where d.id = candidate.id
            and d.organization_id = ${input.orgId}
            and d.workspace_id = ${input.workspaceId}
            and d.status = candidate.old_status
            and d.status <> 'open'::public.crm_deal_status
          returning
            d.id,
            d.organization_id,
            d.workspace_id,
            d.title,
            d.account_id,
            d.primary_contact_id,
            d.pipeline_id,
            d.stage_id,
            d.status,
            candidate.old_status,
            d.value_cents,
            d.currency,
            d.owner_user_id,
            d.expected_close_date,
            d.closed_at,
            d.close_reason,
            d.position,
            d.created_at,
            d.updated_at
        )
        select
          u.id,
          u.organization_id,
          u.workspace_id,
          u.title,
          u.account_id,
          a.name as account_name,
          u.primary_contact_id,
          c.display_name as primary_contact_name,
          u.pipeline_id,
          u.stage_id,
          s.name as stage_name,
          u.status,
          u.old_status,
          u.value_cents,
          u.currency,
          u.owner_user_id,
          u.expected_close_date,
          u.closed_at,
          u.close_reason,
          u.position,
          u.created_at,
          u.updated_at
        from updated u
        join public.crm_accounts a
          on a.id = u.account_id
          and a.organization_id = u.organization_id
        left join public.crm_contacts c
          on c.id = u.primary_contact_id
          and c.organization_id = u.organization_id
        join public.crm_pipeline_stages s
          on s.id = u.stage_id
          and s.organization_id = u.organization_id
      `);
      const row = rowsFromExecuteResult(updated)[0];
      if (row === undefined) {
        const deal = await selectDealById(tx, input.dealId, input.workspaceId);
        return deal === null
          ? err(crmError("crm.notFound", "Deal was not found."))
          : err(crmError("crm.conflict", "Only closed deals can be reopened."));
      }

      const reopened = rowToDealDto(row);
      const oldStatus = String(row["old_status"] ?? "");
      await insertCrmActivity(tx, input, {
        kind: "deal_status_changed",
        body: `Status: ${oldStatus} -> open`,
        contactId: reopened.primaryContactId,
        accountId: reopened.accountId,
        dealId: reopened.id,
      });

      return ok(reopened);
    });
  } catch (error) {
    return err(databaseError(error));
  }
}

export async function updateDeal(
  input: UpdateDealInput,
  dependencies: CrmApplicationDependencies = {},
): Promise<Result<CrmDealDto>> {
  const knownIds = assertKnownIds(input);
  if (!knownIds.ok) {
    return err(knownIds.error);
  }

  const knownDealId = assertKnownUuid(input.dealId, "Deal id");
  if (!knownDealId.ok) {
    return err(knownDealId.error);
  }

  const title =
    input.title === undefined ? undefined : normalizeRequiredText(input.title, "Deal title", 240);
  const valueCents =
    input.valueCents === undefined ? undefined : normalizeValueCents(input.valueCents);
  const currency = input.currency === undefined ? undefined : normalizeCurrency(input.currency);
  const ownerUserId =
    input.ownerUserId === undefined
      ? undefined
      : normalizeOptionalUserId(input.ownerUserId, "Deal owner");
  const expectedCloseDate =
    input.expectedCloseDate === undefined ? undefined : normalizeDate(input.expectedCloseDate);
  const primaryContactId =
    input.primaryContactId === undefined
      ? undefined
      : normalizeOptionalUuid(input.primaryContactId, "Primary contact id");

  if (title !== undefined && !title.ok) {
    return err(title.error);
  }
  if (valueCents !== undefined && !valueCents.ok) {
    return err(valueCents.error);
  }
  if (currency !== undefined && !currency.ok) {
    return err(currency.error);
  }
  if (ownerUserId !== undefined && !ownerUserId.ok) {
    return err(ownerUserId.error);
  }
  if (expectedCloseDate !== undefined && !expectedCloseDate.ok) {
    return err(expectedCloseDate.error);
  }
  if (primaryContactId !== undefined && !primaryContactId.ok) {
    return err(primaryContactId.error);
  }
  const titleValue = title === undefined ? undefined : title.value;
  const valueCentsValue = valueCents === undefined ? undefined : valueCents.value;
  const currencyValue = currency === undefined ? undefined : currency.value;
  const ownerUserIdValue = ownerUserId === undefined ? undefined : ownerUserId.value;
  const expectedCloseDateValue =
    expectedCloseDate === undefined ? undefined : expectedCloseDate.value;
  const primaryContactIdValue = primaryContactId === undefined ? undefined : primaryContactId.value;

  const authorized = await authorizeCrm(input, "update", dependencies.authorizationPort);
  if (!authorized.ok) {
    return err(authorized.error);
  }

  try {
    return await withTenant(input.orgId, async (tx) => {
      const existing = await selectDealById(tx, input.dealId, input.workspaceId);
      if (existing === null) {
        return err(crmError("crm.notFound", "Deal was not found."));
      }

      const nextPrimaryContactId =
        primaryContactIdValue === undefined ? existing.primaryContactId : primaryContactIdValue;
      const validContact = await validatePrimaryContact(tx, input, nextPrimaryContactId);
      if (!validContact.ok) {
        return err(validContact.error);
      }

      await tx.execute(sql`
        update public.crm_deals
        set
          title = ${titleValue === undefined ? existing.title : titleValue},
          value_cents = ${valueCentsValue === undefined ? existing.valueCents : valueCentsValue},
          currency = ${currencyValue === undefined ? existing.currency : currencyValue},
          owner_user_id = ${
            ownerUserIdValue === undefined ? existing.ownerUserId : ownerUserIdValue
          },
          expected_close_date = ${
            expectedCloseDateValue === undefined
              ? existing.expectedCloseDate
              : expectedCloseDateValue
          },
          primary_contact_id = ${nextPrimaryContactId},
          updated_at = now()
        where id = ${input.dealId}
          and workspace_id = ${input.workspaceId}
      `);

      const deal = await selectDealById(tx, input.dealId, input.workspaceId);
      return deal === null ? err(crmError("crm.notFound", "Deal was not found.")) : ok(deal);
    });
  } catch (error) {
    return err(databaseError(error));
  }
}

export async function listDeals(
  input: ListDealsInput,
  dependencies: CrmApplicationDependencies = {},
): Promise<Result<CrmListPageDto<CrmDealStageColumnDto>>> {
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
      const pipeline = await selectDefaultPipelineInTx(tx, input.workspaceId);
      if (!pipeline.ok) {
        return err(pipeline.error);
      }

      if (pipeline.value === null) {
        return ok({
          rows: [],
          hasMore: false,
          totalCount: 0,
        });
      }

      const totalResult = await tx.execute(sql`
        select count(*)::integer as total_count
        from public.crm_deals
        where workspace_id = ${input.workspaceId}
          and pipeline_id = ${pipeline.value.pipeline.id}
      `);
      const totalCount = Number(rowsFromExecuteResult(totalResult)[0]?.["total_count"] ?? 0);

      const stageCountsResult = await tx.execute(sql`
        select stage_id, count(*)::integer as deal_count
        from public.crm_deals
        where workspace_id = ${input.workspaceId}
          and pipeline_id = ${pipeline.value.pipeline.id}
        group by stage_id
      `);
      const stageCounts = new Map(
        rowsFromExecuteResult(stageCountsResult).map((row) => [
          String(row["stage_id"]),
          Number(row["deal_count"] ?? 0),
        ]),
      );

      const result = await tx.execute(sql`
        select
          d.id,
          d.organization_id,
          d.workspace_id,
          d.title,
          d.account_id,
          a.name as account_name,
          d.primary_contact_id,
          c.display_name as primary_contact_name,
          d.pipeline_id,
          d.stage_id,
          s.name as stage_name,
          d.status,
          d.value_cents,
          d.currency,
          d.owner_user_id,
          d.expected_close_date,
          d.closed_at,
          d.close_reason,
          d.position,
          d.created_at,
          d.updated_at
        from public.crm_deals d
        join public.crm_accounts a
          on a.id = d.account_id
          and a.organization_id = d.organization_id
        left join public.crm_contacts c
          on c.id = d.primary_contact_id
          and c.organization_id = d.organization_id
        join public.crm_pipeline_stages s
          on s.id = d.stage_id
          and s.organization_id = d.organization_id
        where d.workspace_id = ${input.workspaceId}
          and d.pipeline_id = ${pipeline.value.pipeline.id}
        order by s.position asc, d.position asc, d.created_at asc, d.id asc
        limit ${limit.value + 1}
      `);

      const dealRows = rowsFromExecuteResult(result);
      const deals = dealRows.slice(0, limit.value).map(rowToDealDto);
      return ok({
        rows: pipeline.value.stages.map((stage) => ({
          stage,
          dealCount: stageCounts.get(stage.id) ?? 0,
          deals: deals.filter((deal) => deal.stageId === stage.id),
        })),
        hasMore: dealRows.length > limit.value,
        totalCount,
      });
    });
  } catch (error) {
    return err(databaseError(error));
  }
}

export const dealInternal = {
  selectDealById,
};
