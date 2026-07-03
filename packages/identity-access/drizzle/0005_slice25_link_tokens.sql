-- Slice 2.5b scoped local MCP link tokens.
-- This migration stays in the identity-access migration stream so the one-shot
-- migrate runner and manifest gate continue to apply all current schema changes
-- in order.

set lock_timeout = '3s';
set statement_timeout = '30s';

create table if not exists public.link_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  user_id text not null references public.auth_users(id) on delete restrict,
  session_id text not null references public.auth_sessions(id) on delete cascade,
  client_id text not null default 'claude-code',
  scopes text[] not null,
  token_hash text not null,
  jti text not null,
  membership_version integer not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  constraint link_tokens_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict,
  constraint link_tokens_client_id_check check (client_id = 'claude-code'),
  constraint link_tokens_scopes_nonempty_check check (cardinality(scopes) between 1 and 2),
  constraint link_tokens_scopes_subset_check check (
    scopes <@ array['tasks:read', 'tasks:write']::text[]
  ),
  constraint link_tokens_scopes_unique_check check (
    cardinality(scopes) = 1 or scopes[1] <> scopes[2]
  ),
  constraint link_tokens_token_hash_check check (token_hash ~ '^[a-f0-9]{64}$'),
  constraint link_tokens_jti_nonempty_check check (char_length(btrim(jti)) > 0),
  constraint link_tokens_jti_length_check check (char_length(jti) <= 180),
  constraint link_tokens_membership_version_positive_check check (membership_version > 0),
  constraint link_tokens_expiry_check check (expires_at > created_at)
);

create unique index if not exists link_tokens_token_hash_unique
  on public.link_tokens (token_hash);

create unique index if not exists link_tokens_jti_unique
  on public.link_tokens (jti);

create index if not exists link_tokens_organization_workspace_user_idx
  on public.link_tokens (organization_id, workspace_id, user_id, created_at desc);

alter table public.link_tokens owner to opzava_owner;

grant select, insert, update, delete on table
  public.link_tokens
to opzava_app;

alter table public.link_tokens enable row level security;
alter table public.link_tokens force row level security;

drop policy if exists link_tokens_tenant_isolation on public.link_tokens;
create policy link_tokens_tenant_isolation on public.link_tokens
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists link_tokens_tenant_context_required on public.link_tokens;
create policy link_tokens_tenant_context_required on public.link_tokens
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists link_tokens_owner_admin on public.link_tokens;
create policy link_tokens_owner_admin on public.link_tokens
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);
