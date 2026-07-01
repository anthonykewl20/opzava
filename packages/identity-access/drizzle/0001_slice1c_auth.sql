-- Slice 1c Better Auth core authentication and Opzava access seed.
-- Auth tables are global identity state with explicit opzava_app grants and no
-- tenant RLS. Membership and role tables are tenant-scoped and FORCE RLS.

create table public.auth_users (
  id text primary key,
  name text not null,
  email text not null,
  email_verified boolean not null default false,
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index auth_users_email_unique
  on public.auth_users (lower(email));

create table public.auth_sessions (
  id text primary key,
  user_id text not null references public.auth_users(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  active_organization_id uuid references public.organizations(id) on delete set null,
  membership_version integer not null default 0,
  mfa_satisfied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index auth_sessions_user_id_idx
  on public.auth_sessions (user_id);

create index auth_sessions_active_organization_id_idx
  on public.auth_sessions (active_organization_id);

create table public.auth_accounts (
  id text primary key,
  user_id text not null references public.auth_users(id) on delete cascade,
  account_id text not null,
  provider_id text not null,
  access_token text,
  refresh_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  id_token text,
  password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auth_accounts_provider_account_unique unique (provider_id, account_id)
);

create index auth_accounts_user_id_idx
  on public.auth_accounts (user_id);

create table public.auth_verifications (
  id text primary key,
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index auth_verifications_identifier_idx
  on public.auth_verifications (identifier);

create table public.first_owner_setup (
  singleton_id boolean primary key default true,
  setup_attempt_id text not null unique,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  owner_user_id text not null references public.auth_users(id) on delete restrict,
  completed_at timestamptz not null default now(),
  constraint first_owner_setup_singleton_true check (singleton_id is true)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id text not null references public.auth_users(id) on delete restrict,
  status text not null default 'active'
    constraint memberships_status_check check (status in ('active', 'invited', 'suspended', 'removed')),
  membership_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memberships_organization_id_user_id_unique unique (organization_id, user_id)
);

create index memberships_user_id_idx
  on public.memberships (user_id);

create index memberships_organization_id_status_idx
  on public.memberships (organization_id, status);

create table public.role_catalog (
  role_key text primary key,
  scope_type text not null constraint role_catalog_scope_type_check check (scope_type in ('organization', 'project')),
  display_name text not null,
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.role_catalog (role_key, scope_type, display_name) values
  ('owner', 'organization', 'Owner'),
  ('admin', 'organization', 'Admin'),
  ('member', 'organization', 'Member')
on conflict (role_key) do nothing;

create table public.role_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  subject_type text not null default 'user' constraint role_grants_subject_type_check check (subject_type in ('user')),
  subject_id text not null references public.auth_users(id) on delete restrict,
  role_key text not null references public.role_catalog(role_key) on delete restrict,
  scope_type text not null constraint role_grants_scope_type_check check (scope_type in ('organization', 'project')),
  scope_id uuid not null,
  granted_by_user_id text references public.auth_users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint role_grants_unique unique (organization_id, subject_type, subject_id, role_key, scope_type, scope_id)
);

create index role_grants_subject_idx
  on public.role_grants (subject_type, subject_id);

create index role_grants_organization_scope_idx
  on public.role_grants (organization_id, scope_type, scope_id);

alter table public.auth_users owner to opzava_owner;
alter table public.auth_sessions owner to opzava_owner;
alter table public.auth_accounts owner to opzava_owner;
alter table public.auth_verifications owner to opzava_owner;
alter table public.first_owner_setup owner to opzava_owner;
alter table public.memberships owner to opzava_owner;
alter table public.role_catalog owner to opzava_owner;
alter table public.role_grants owner to opzava_owner;

create or replace function app.current_user_id()
returns text
language sql
stable
as $$
  select nullif(current_setting('app.current_user', true), '')
$$;

alter function app.current_user_id() owner to opzava_owner;

comment on function app.current_user_id() is
  'Returns the current transaction-local authenticated Opzava user id, or null when missing.';

grant execute on function app.current_user_id() to opzava_app;

grant select, insert, update, delete on table
  public.auth_users,
  public.auth_sessions,
  public.auth_accounts,
  public.auth_verifications,
  public.memberships,
  public.role_grants
to opzava_app;

grant select, insert on table public.first_owner_setup to opzava_app;
grant select on table public.role_catalog to opzava_app;

drop policy if exists organizations_tenant_isolation on public.organizations;
drop policy if exists organizations_tenant_context_required on public.organizations;

create policy organizations_identity_membership_select on public.organizations
  as permissive
  for select
  to opzava_app
  using (
    exists (
      select 1
      from public.memberships m
      where m.organization_id = public.organizations.id
        and m.user_id = app.current_user_id()
        and m.status = 'active'
    )
  );

create policy organizations_select_identity_context_required on public.organizations
  as restrictive
  for select
  to opzava_app
  using (app.current_user_id() is not null);

create policy organizations_insert_tenant_isolation on public.organizations
  as permissive
  for insert
  to opzava_app
  with check (id = app.current_org_id());

create policy organizations_update_tenant_isolation on public.organizations
  as permissive
  for update
  to opzava_app
  using (id = app.current_org_id())
  with check (id = app.current_org_id());

create policy organizations_delete_tenant_isolation on public.organizations
  as permissive
  for delete
  to opzava_app
  using (id = app.current_org_id());

create policy organizations_insert_tenant_context_required on public.organizations
  as restrictive
  for insert
  to opzava_app
  with check (app.current_org_id() is not null);

create policy organizations_update_tenant_context_required on public.organizations
  as restrictive
  for update
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

create policy organizations_delete_tenant_context_required on public.organizations
  as restrictive
  for delete
  to opzava_app
  using (app.current_org_id() is not null);

alter table public.memberships enable row level security;
alter table public.memberships force row level security;

create policy memberships_identity_self_select on public.memberships
  as permissive
  for select
  to opzava_app
  using (user_id = app.current_user_id() and status = 'active');

create policy memberships_insert_tenant_isolation on public.memberships
  as permissive
  for insert
  to opzava_app
  with check (organization_id = app.current_org_id());

create policy memberships_update_tenant_isolation on public.memberships
  as permissive
  for update
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

create policy memberships_delete_tenant_isolation on public.memberships
  as permissive
  for delete
  to opzava_app
  using (organization_id = app.current_org_id());

create policy memberships_insert_tenant_context_required on public.memberships
  as restrictive
  for insert
  to opzava_app
  with check (app.current_org_id() is not null);

create policy memberships_update_tenant_context_required on public.memberships
  as restrictive
  for update
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

create policy memberships_delete_tenant_context_required on public.memberships
  as restrictive
  for delete
  to opzava_app
  using (app.current_org_id() is not null);

create policy memberships_owner_admin on public.memberships
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);

alter table public.role_grants enable row level security;
alter table public.role_grants force row level security;

create policy role_grants_subject_select on public.role_grants
  as permissive
  for select
  to opzava_app
  using (subject_id = app.current_user_id());

create policy role_grants_insert_tenant_isolation on public.role_grants
  as permissive
  for insert
  to opzava_app
  with check (organization_id = app.current_org_id());

create policy role_grants_update_tenant_isolation on public.role_grants
  as permissive
  for update
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

create policy role_grants_delete_tenant_isolation on public.role_grants
  as permissive
  for delete
  to opzava_app
  using (organization_id = app.current_org_id());

create policy role_grants_insert_tenant_context_required on public.role_grants
  as restrictive
  for insert
  to opzava_app
  with check (app.current_org_id() is not null);

create policy role_grants_update_tenant_context_required on public.role_grants
  as restrictive
  for update
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

create policy role_grants_delete_tenant_context_required on public.role_grants
  as restrictive
  for delete
  to opzava_app
  using (app.current_org_id() is not null);

create policy role_grants_owner_admin on public.role_grants
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);

-- Future member-invite and role-grant writers must gate writes through
-- AuthorizationPort. RLS gates the organization boundary, not who/which-role.
-- This slice's only runtime membership/role writer is FirstOwnerSetupService.
