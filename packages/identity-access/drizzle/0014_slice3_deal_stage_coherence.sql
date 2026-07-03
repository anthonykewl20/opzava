-- Slice 3 CRM deal-stage coherence guard.
-- Deals must reference a stage in their own pipeline, not just their organization.

set lock_timeout = '3s';
set statement_timeout = '30s';

do $$
begin
  if to_regclass('public.crm_deals') is not null
    and to_regclass('public.crm_pipeline_stages') is not null
    and exists (
      select 1
      from public.crm_deals d
      left join public.crm_pipeline_stages s
        on s.id = d.stage_id
        and s.pipeline_id = d.pipeline_id
        and s.organization_id = d.organization_id
      where s.id is null
    )
  then
    raise exception 'crm_deals contains stage_id values outside the deal pipeline';
  end if;
end
$$;

create unique index if not exists crm_pipeline_stages_id_pipeline_organization_unique
  on public.crm_pipeline_stages (id, pipeline_id, organization_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'crm_deals_stage_pipeline_organization_fk'
      and conrelid = 'public.crm_deals'::regclass
  ) then
    alter table public.crm_deals
      add constraint crm_deals_stage_pipeline_organization_fk
      foreign key (stage_id, pipeline_id, organization_id)
      references public.crm_pipeline_stages (id, pipeline_id, organization_id);
  end if;
end
$$;
