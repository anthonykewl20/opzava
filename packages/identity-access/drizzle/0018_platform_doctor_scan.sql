-- Issue #280 / ADR-021 PR A: durable, redacted platform doctor scan evidence and fencing.
set lock_timeout = '3s';
set statement_timeout = '30s';

create table if not exists public.platform_doctor_scan_run (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  scope text not null,
  status text not null,
  started_at timestamptz not null,
  completed_at timestamptz not null default now(),
  checks_run integer not null,
  checks_skipped integer not null,
  failure_code text,
  schema_version integer not null default 1,
  constraint platform_doctor_scan_run_scope_check
    check (scope ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'),
  constraint platform_doctor_scan_run_status_check
    check (status = any (array['succeeded','unavailable']::text[])),
  constraint platform_doctor_scan_run_time_check check (completed_at >= started_at),
  constraint platform_doctor_scan_run_counts_check
    check (checks_run between 0 and 10000 and checks_skipped between 0 and 10000),
  constraint platform_doctor_scan_run_failure_check check (
    (status = 'succeeded' and failure_code is null)
    or (status = 'unavailable' and failure_code ~ '^[a-z0-9][a-z0-9_]{0,63}$')
  ),
  constraint platform_doctor_scan_run_schema_check check (schema_version = 1)
);

alter table public.platform_doctor_scan_run
  add constraint platform_doctor_scan_run_id_org_unique unique (id, organization_id);

create index if not exists platform_doctor_scan_run_scope_completed_idx
  on public.platform_doctor_scan_run (organization_id, scope, completed_at desc, id desc);
create index if not exists platform_doctor_scan_run_retention_idx
  on public.platform_doctor_scan_run (organization_id, status, completed_at);

create table if not exists public.platform_doctor_scan_finding (
  scan_run_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  ordinal integer not null,
  check_id text not null,
  severity text not null,
  display_group text not null,
  summary text not null,
  detail_state text not null,
  location_label text,
  target_label text,
  suppressed boolean not null default false,
  suppression_reason text,
  primary key (scan_run_id, ordinal),
  constraint platform_doctor_scan_finding_run_org_fk
    foreign key (scan_run_id, organization_id)
    references public.platform_doctor_scan_run(id, organization_id) on delete cascade,
  constraint platform_doctor_scan_finding_ordinal_check check (ordinal between 0 and 499),
  constraint platform_doctor_scan_finding_check_id_check
    check (check_id = 'unknown' or check_id ~ '^[a-z0-9][a-z0-9._/-]{0,127}$'),
  constraint platform_doctor_scan_finding_severity_check
    check (severity = any (array['info','warning','error']::text[])),
  constraint platform_doctor_scan_finding_group_check check (char_length(display_group) between 1 and 64),
  constraint platform_doctor_scan_finding_summary_check check (char_length(summary) between 1 and 256),
  constraint platform_doctor_scan_finding_detail_check
    check (detail_state = any (array['available','redacted_unavailable']::text[])),
  constraint platform_doctor_scan_finding_labels_check check (
    (location_label is null or char_length(location_label) between 1 and 64)
    and (target_label is null or char_length(target_label) between 1 and 64)
  ),
  constraint platform_doctor_scan_finding_suppression_check check (
    (suppressed and suppression_reason is not null and char_length(suppression_reason) between 1 and 64)
    or (not suppressed and suppression_reason is null)
  )
);

create index if not exists platform_doctor_scan_finding_org_run_idx
  on public.platform_doctor_scan_finding (organization_id, scan_run_id, ordinal);

create table if not exists public.platform_doctor_scan_lease (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  scope text not null,
  lease_token uuid not null,
  lease_acquired_at timestamptz not null,
  lease_expires_at timestamptz not null,
  last_force_requested_at timestamptz,
  primary key (organization_id, scope),
  constraint platform_doctor_scan_lease_scope_check
    check (scope ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'),
  constraint platform_doctor_scan_lease_time_check check (lease_expires_at > lease_acquired_at)
);

create index if not exists platform_doctor_scan_lease_expiry_idx
  on public.platform_doctor_scan_lease (lease_expires_at);

alter table public.platform_doctor_scan_run owner to opzava_owner;
alter table public.platform_doctor_scan_finding owner to opzava_owner;
alter table public.platform_doctor_scan_lease owner to opzava_owner;

grant select, insert on table public.platform_doctor_scan_run to opzava_app;
grant select, insert on table public.platform_doctor_scan_finding to opzava_app;
grant select, insert, update on table public.platform_doctor_scan_lease to opzava_app;

alter table public.platform_doctor_scan_run enable row level security;
alter table public.platform_doctor_scan_run force row level security;
alter table public.platform_doctor_scan_finding enable row level security;
alter table public.platform_doctor_scan_finding force row level security;
alter table public.platform_doctor_scan_lease enable row level security;
alter table public.platform_doctor_scan_lease force row level security;

do $policies$
declare table_name text;
begin
  foreach table_name in array array[
    'platform_doctor_scan_run', 'platform_doctor_scan_finding', 'platform_doctor_scan_lease'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_isolation', table_name);
    execute format(
      'create policy %I on public.%I as permissive for all to opzava_app using (organization_id = app.current_org_id()) with check (organization_id = app.current_org_id())',
      table_name || '_tenant_isolation', table_name
    );
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_context_required', table_name);
    execute format(
      'create policy %I on public.%I as restrictive for all to opzava_app using (app.current_org_id() is not null) with check (app.current_org_id() is not null)',
      table_name || '_tenant_context_required', table_name
    );
    execute format('drop policy if exists %I on public.%I', table_name || '_owner_admin', table_name);
    execute format(
      'create policy %I on public.%I as permissive for all to opzava_owner using (true) with check (true)',
      table_name || '_owner_admin', table_name
    );
  end loop;
end
$policies$;

-- Retention needs deletion without granting general mutation of append-only evidence.
create or replace function app.prune_platform_doctor_scan_runs(p_organization_id uuid, p_scope text)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app
as $function$
declare deleted_count integer;
begin
  if app.current_org_id() is null or app.current_org_id() <> p_organization_id then
    raise insufficient_privilege using message = 'tenant context required';
  end if;

  with latest as (
    select id from public.platform_doctor_scan_run
    where organization_id = p_organization_id and scope = p_scope
    order by completed_at desc, id desc limit 1
  ), deleted as (
    delete from public.platform_doctor_scan_run r
    where r.organization_id = p_organization_id and r.scope = p_scope
      and r.id not in (select id from latest)
      and (
        (r.status = 'succeeded' and r.completed_at < now() - interval '30 days')
        or (r.status = 'unavailable' and r.completed_at < now() - interval '90 days')
      )
    returning 1
  ) select count(*)::integer into deleted_count from deleted;
  return deleted_count;
end
$function$;

alter function app.prune_platform_doctor_scan_runs(uuid, text) owner to opzava_owner;
revoke all on function app.prune_platform_doctor_scan_runs(uuid, text) from public;
grant execute on function app.prune_platform_doctor_scan_runs(uuid, text) to opzava_app;
