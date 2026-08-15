-- #93 guest-client access is project-scoped. The current project aggregate is
-- public.workspaces; project_id intentionally FKs it until project-management
-- lands a distinct projects relation.
create table public.auth_external_identities (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  email text not null,
  email_hash text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint auth_external_identities_org_project_email_unique unique (organization_id, project_id, email_hash),
  -- This key supports the guest-session FK below, binding all three identity dimensions.
  constraint auth_external_identities_id_org_project_unique unique (id, organization_id, project_id),
  constraint auth_external_identities_project_organization_fk
    foreign key (project_id, organization_id)
    references public.workspaces(id, organization_id)
    on delete cascade
);
create table public.auth_guest_magic_links (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  email text not null,
  salt text not null,
  token_hash text not null,
  token_lookup_digest text not null,
  created_by_user_id text not null references public.auth_users(id) on delete restrict,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint auth_guest_magic_links_max_ttl_check check (expires_at <= created_at + interval '24 hours'),
  constraint auth_guest_magic_links_project_organization_fk
    foreign key (project_id, organization_id)
    references public.workspaces(id, organization_id)
    on delete cascade
);
create table public.auth_guest_sessions (
  id uuid primary key,
  external_identity_id uuid not null,
  project_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  salt text not null,
  token_hash text not null,
  token_lookup_digest text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint auth_guest_sessions_project_organization_fk
    foreign key (project_id, organization_id)
    references public.workspaces(id, organization_id)
    on delete cascade,
  constraint auth_guest_sessions_external_identity_organization_project_fk
    foreign key (external_identity_id, organization_id, project_id)
    references public.auth_external_identities(id, organization_id, project_id)
    on delete cascade
);
create index auth_guest_magic_links_org_project_idx on public.auth_guest_magic_links (organization_id, project_id);
create index auth_guest_sessions_expires_at_idx on public.auth_guest_sessions (expires_at);
create unique index auth_guest_magic_links_token_lookup_digest_unique on public.auth_guest_magic_links (token_lookup_digest);
create unique index auth_guest_sessions_token_lookup_digest_unique on public.auth_guest_sessions (token_lookup_digest);
alter table public.auth_external_identities owner to opzava_owner;
alter table public.auth_guest_magic_links owner to opzava_owner;
alter table public.auth_guest_sessions owner to opzava_owner;
grant select, insert, update, delete on table public.auth_external_identities, public.auth_guest_magic_links, public.auth_guest_sessions to opzava_app;
alter table public.auth_external_identities enable row level security;
alter table public.auth_external_identities force row level security;
alter table public.auth_guest_magic_links enable row level security;
alter table public.auth_guest_magic_links force row level security;
alter table public.auth_guest_sessions enable row level security;
alter table public.auth_guest_sessions force row level security;
do $policies$
declare table_name text;
begin
  foreach table_name in array array['auth_external_identities', 'auth_guest_magic_links', 'auth_guest_sessions'] loop
    execute format('create policy %I on public.%I as permissive for all to opzava_app using (organization_id = app.current_org_id()) with check (organization_id = app.current_org_id())', table_name || '_tenant_isolation', table_name);
    execute format('create policy %I on public.%I as restrictive for all to opzava_app using (app.current_org_id() is not null) with check (app.current_org_id() is not null)', table_name || '_tenant_context_required', table_name);
    execute format('create policy %I on public.%I as permissive for all to opzava_owner using (true) with check (true)', table_name || '_owner_admin', table_name);
  end loop;
end $policies$;

-- These SECURITY DEFINER directory functions expose only the fields needed to
-- verify the salted HMAC and re-open the row under its tenant RLS context.
create or replace function app.find_guest_magic_link(p_lookup_digest text)
returns table (id uuid, organization_id uuid, project_id uuid, email text, salt text, token_hash text)
language sql security definer strict set search_path = public as $fn$
  select l.id, l.organization_id, l.project_id, l.email, l.salt, l.token_hash
  from public.auth_guest_magic_links l where l.token_lookup_digest = p_lookup_digest limit 1
$fn$;
alter function app.find_guest_magic_link(text) owner to opzava_owner;
revoke all on function app.find_guest_magic_link(text) from public;
grant execute on function app.find_guest_magic_link(text) to opzava_app;

create or replace function app.find_guest_session(p_lookup_digest text)
returns table (external_identity_id uuid, project_id uuid, organization_id uuid, salt text, token_hash text)
language sql security definer strict set search_path = public as $fn$
  select s.external_identity_id, s.project_id, s.organization_id, s.salt, s.token_hash
  from public.auth_guest_sessions s where s.token_lookup_digest = p_lookup_digest limit 1
$fn$;
alter function app.find_guest_session(text) owner to opzava_owner;
revoke all on function app.find_guest_session(text) from public;
grant execute on function app.find_guest_session(text) to opzava_app;

-- Guest credentials are never memberships. This narrowly scoped directory
-- check is the lifecycle backstop for unauthenticated consume/resolve paths.
create or replace function app.is_active_organization(p_organization_id uuid)
returns boolean
language sql security definer strict set search_path = public as $fn$
  select app.current_org_id() = p_organization_id
     and exists (
       select 1 from public.organizations o
       where o.id = p_organization_id and o.lifecycle_state = 'active'
     )
$fn$;
alter function app.is_active_organization(uuid) owner to opzava_owner;
revoke all on function app.is_active_organization(uuid) from public;
grant execute on function app.is_active_organization(uuid) to opzava_app;

-- Acceptance must distinguish a missing membership (safe to create) from a
-- removed/suspended one (never reactivate). The function is tenant-bound and
-- owns the RLS-protected upsert, so an invitee does not need visibility of a
-- different member row for the check-and-grant to remain race-safe.
create or replace function app.accept_invitation_membership(p_organization_id uuid, p_user_id text)
returns text
language plpgsql security definer strict set search_path = public as $fn$
declare member_status text;
begin
  if app.current_org_id() is distinct from p_organization_id then
    return 'invalid-tenant';
  end if;
  begin
    insert into public.memberships (organization_id, user_id, status, membership_version)
    values (p_organization_id, p_user_id, 'active', 1);
    return 'created';
  exception when unique_violation then
    select m.status into member_status
    from public.memberships m
    where m.organization_id = p_organization_id and m.user_id = p_user_id
    for update;
  end;
  if member_status = 'active' then
    update public.memberships set updated_at = now()
    where organization_id = p_organization_id and user_id = p_user_id;
    return 'active';
  end if;
  return 'membership-conflict';
end;
$fn$;
alter function app.accept_invitation_membership(uuid, text) owner to opzava_owner;
revoke all on function app.accept_invitation_membership(uuid, text) from public;
grant execute on function app.accept_invitation_membership(uuid, text) to opzava_app;
