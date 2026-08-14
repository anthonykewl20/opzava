-- TB-01b-6: DevTicket classification, risk-policy stamps, and trusted role helpers.
set lock_timeout = '3s';
set statement_timeout = '30s';

alter table public.dev_board_dev_ticket
  add column dev_ticket_type text check (dev_ticket_type is null or dev_ticket_type in ('feature', 'bug', 'improvement', 'technical_task', 'research_spike', 'maintenance')),
  add column priority text check (priority is null or priority in ('p0', 'p1', 'p2', 'p3')),
  add column severity text check (severity is null or severity in ('s0', 's1', 's2', 's3')),
  add column declared_change_risk text check (declared_change_risk is null or declared_change_risk in ('low', 'medium', 'high', 'critical')),
  add column minimum_change_risk text check (minimum_change_risk is null or minimum_change_risk in ('low', 'medium', 'high', 'critical')),
  add column change_risk_policy_version text,
  add column change_risk_policy_hash text check (change_risk_policy_hash is null or change_risk_policy_hash ~ '^[a-f0-9]{64}$');

alter table public.dev_board_dev_ticket add constraint dev_board_dev_ticket_ready_classification_check check (
  ready_state = 'draft' or (
    dev_ticket_type is not null and priority is not null and declared_change_risk is not null
    and minimum_change_risk is not null and change_risk_policy_version is not null
    and change_risk_policy_hash is not null
    and array_position(array['low', 'medium', 'high', 'critical'], declared_change_risk)
      >= array_position(array['low', 'medium', 'high', 'critical'], minimum_change_risk)
  )
) not valid;

-- Older scratch/local databases can already contain an approved ticket from before
-- classifications existed.  Keep the new-write check enforced there, but validate
-- immediately on fresh and clean databases so the normal schema remains trusted.
do $ready_classification$
begin
  if not exists (
    select 1
    from public.dev_board_dev_ticket
    where ready_state = 'approved'
      and (
        dev_ticket_type is null
        or priority is null
        or declared_change_risk is null
        or minimum_change_risk is null
        or change_risk_policy_version is null
        or change_risk_policy_hash is null
        or array_position(array['low', 'medium', 'high', 'critical'], declared_change_risk)
          < array_position(array['low', 'medium', 'high', 'critical'], minimum_change_risk)
      )
  ) then
    alter table public.dev_board_dev_ticket
      validate constraint dev_board_dev_ticket_ready_classification_check;
  end if;
end
$ready_classification$;

create table public.dev_board_dev_ticket_work_area (
  organization_id uuid not null,
  workspace_id uuid not null,
  dev_ticket_id uuid not null,
  work_area text not null check (work_area in ('ui_ux', 'frontend', 'backend_api', 'data_database', 'infrastructure', 'github_integration', 'agent_runtime', 'security', 'documentation')),
  created_at timestamptz not null default now(),
  primary key (organization_id, workspace_id, dev_ticket_id, work_area),
  constraint dev_board_dev_ticket_work_area_ticket_fk foreign key (organization_id, workspace_id, dev_ticket_id)
    references public.dev_board_dev_ticket(organization_id, workspace_id, id) on delete cascade
);
create index dev_board_dev_ticket_work_area_org_workspace_area_ticket_idx on public.dev_board_dev_ticket_work_area (organization_id, workspace_id, work_area, dev_ticket_id);

create or replace function app.is_active_member(organization_id uuid, user_id text)
returns boolean language sql security definer set search_path = public as $fn$
  select app.current_org_id() is not null
    and app.current_org_id() = is_active_member.organization_id and exists (
    select 1 from public.memberships m
    where m.organization_id = is_active_member.organization_id
      and m.user_id = is_active_member.user_id and m.status = 'active' for update
  )
$fn$;
alter function app.is_active_member(uuid, text) owner to opzava_owner;
revoke all on function app.is_active_member(uuid, text) from public;
grant execute on function app.is_active_member(uuid, text) to opzava_app;

create or replace function app.has_organization_role(organization_id uuid, user_id text, role_key text)
returns boolean language sql security definer set search_path = public as $fn$
  select app.current_org_id() is not null
    and app.current_org_id() = has_organization_role.organization_id and exists (
    select 1 from public.role_grants g
    where g.organization_id = has_organization_role.organization_id
      and g.subject_type = 'user' and g.subject_id = has_organization_role.user_id
      and g.role_key = has_organization_role.role_key and g.scope_type = 'organization'
      and g.scope_id = has_organization_role.organization_id
  )
$fn$;
alter function app.has_organization_role(uuid, text, text) owner to opzava_owner;
revoke all on function app.has_organization_role(uuid, text, text) from public;
grant execute on function app.has_organization_role(uuid, text, text) to opzava_app;

alter table public.dev_board_dev_ticket_work_area owner to opzava_owner;
grant select, insert, update, delete on table public.dev_board_dev_ticket_work_area to opzava_app;
alter table public.dev_board_dev_ticket_work_area enable row level security;
alter table public.dev_board_dev_ticket_work_area force row level security;
do $policies$
declare table_name text;
begin
  foreach table_name in array array['dev_board_dev_ticket_work_area'] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_isolation', table_name);
    execute format('create policy %I on public.%I as permissive for all to opzava_app using (organization_id = app.current_org_id()) with check (organization_id = app.current_org_id())', table_name || '_tenant_isolation', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_context_required', table_name);
    execute format('create policy %I on public.%I as restrictive for all to opzava_app using (app.current_org_id() is not null) with check (app.current_org_id() is not null)', table_name || '_tenant_context_required', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_owner_admin', table_name);
    execute format('create policy %I on public.%I as permissive for all to opzava_owner using (true) with check (true)', table_name || '_owner_admin', table_name);
  end loop;
end
$policies$;
