-- Slice 1b tenancy foundation.
-- Role separation is load-bearing: opzava_owner owns schema objects and is used
-- only by one-shot migration/test-admin jobs; application traffic connects as
-- opzava_app, which must remain non-owner, non-superuser, and NOBYPASSRLS.
-- PgBouncer parity note for app traffic: pool_mode=transaction,
-- server_reset_query=DISCARD ALL, and max_prepared_statements=0.

create schema if not exists app authorization opzava_owner;

comment on schema app is
  'Opzava application-local helper schema. Runtime tenant context is app.current_org and is set only through withTenant.';

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'organization_lifecycle_state'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.organization_lifecycle_state as enum (
      'provisioning',
      'active',
      'suspended',
      'deprovisioning',
      'deleted'
    );
  end if;
end
$$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  lifecycle_state public.organization_lifecycle_state not null default 'provisioning',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists organizations_slug_unique
  on public.organizations (slug);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  slug text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workspaces_organization_id_slug_unique
  on public.workspaces (organization_id, slug);

create table if not exists public.tenant_rls_probes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  marker text not null,
  created_at timestamptz not null default now()
);

alter table public.organizations owner to opzava_owner;
alter table public.workspaces owner to opzava_owner;
alter table public.tenant_rls_probes owner to opzava_owner;

create or replace function app.current_org_id()
returns uuid
language sql
stable
as $$
  select case
    when current_setting('app.current_org', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then current_setting('app.current_org', true)::uuid
    else null
  end
$$;

alter function app.current_org_id() owner to opzava_owner;

comment on function app.current_org_id() is
  'Returns the current transaction-local Opzava organization id, or null when missing, empty, or malformed.';

grant usage on schema app to opzava_app;
grant execute on function app.current_org_id() to opzava_app;

grant select, insert, update, delete on table
  public.organizations,
  public.workspaces,
  public.tenant_rls_probes
to opzava_app;

-- Least privilege: grants are explicit per table (above), deliberately NOT via
-- ALTER DEFAULT PRIVILEGES. Every future table must declare its own RLS policy
-- AND its own explicit opzava_app grant in its migration, so a new (or non-tenant)
-- table can never silently inherit app access without a tenant-policy review.

alter table public.organizations enable row level security;
alter table public.organizations force row level security;

drop policy if exists organizations_tenant_isolation on public.organizations;
create policy organizations_tenant_isolation on public.organizations
  as permissive
  for all
  to opzava_app
  using (id = app.current_org_id())
  with check (id = app.current_org_id());

drop policy if exists organizations_tenant_context_required on public.organizations;
create policy organizations_tenant_context_required on public.organizations
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null);

drop policy if exists organizations_owner_admin on public.organizations;
create policy organizations_owner_admin on public.organizations
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);

alter table public.workspaces enable row level security;
alter table public.workspaces force row level security;

drop policy if exists workspaces_tenant_isolation on public.workspaces;
create policy workspaces_tenant_isolation on public.workspaces
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists workspaces_tenant_context_required on public.workspaces;
create policy workspaces_tenant_context_required on public.workspaces
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null);

drop policy if exists workspaces_owner_admin on public.workspaces;
create policy workspaces_owner_admin on public.workspaces
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);

alter table public.tenant_rls_probes enable row level security;
alter table public.tenant_rls_probes force row level security;

drop policy if exists tenant_rls_probes_tenant_isolation on public.tenant_rls_probes;
create policy tenant_rls_probes_tenant_isolation on public.tenant_rls_probes
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists tenant_rls_probes_tenant_context_required on public.tenant_rls_probes;
create policy tenant_rls_probes_tenant_context_required on public.tenant_rls_probes
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null);

drop policy if exists tenant_rls_probes_owner_admin on public.tenant_rls_probes;
create policy tenant_rls_probes_owner_admin on public.tenant_rls_probes
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);
