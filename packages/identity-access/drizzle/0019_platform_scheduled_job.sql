-- Issue #280 / ADR-022: durable, tenant-protected worker schedules and dispatch fencing.
set lock_timeout = '3s';
set statement_timeout = '30s';

create table if not exists public.platform_scheduled_job (
  job_key text not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  scope text not null,
  cadence_seconds integer not null,
  next_run_at timestamptz not null,
  dispatch_lease_token uuid,
  dispatch_lease_expires_at timestamptz,
  consecutive_failures integer not null default 0,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_failure_code text,
  updated_at timestamptz not null default now(),
  primary key (job_key, organization_id, scope),
  constraint platform_scheduled_job_key_check
    check (job_key ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'),
  constraint platform_scheduled_job_scope_check
    check (scope ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'),
  constraint platform_scheduled_job_cadence_check
    check (cadence_seconds between 1 and 31536000),
  constraint platform_scheduled_job_lease_check check (
    (dispatch_lease_token is null and dispatch_lease_expires_at is null)
    or (dispatch_lease_token is not null and dispatch_lease_expires_at is not null)
  ),
  constraint platform_scheduled_job_failures_check
    check (consecutive_failures between 0 and 2147483647),
  constraint platform_scheduled_job_failure_code_check
    check (last_failure_code is null or last_failure_code ~ '^[a-z0-9][a-z0-9_]{0,63}$')
);

create index if not exists platform_scheduled_job_due_idx
  on public.platform_scheduled_job (next_run_at, dispatch_lease_expires_at);

alter table public.platform_scheduled_job owner to opzava_owner;

grant select, insert, update on table public.platform_scheduled_job to opzava_app;

alter table public.platform_scheduled_job enable row level security;
alter table public.platform_scheduled_job force row level security;

do $policies$
declare table_name text;
begin
  foreach table_name in array array['platform_scheduled_job'] loop
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
