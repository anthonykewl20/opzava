-- #93 invitations. Membership grants occur only through AuthPort.acceptInvitation.
create table public.auth_invitations (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null constraint auth_invitations_role_check check (role in ('admin', 'member')),
  salt text not null,
  token_hash text not null,
  token_lookup_digest text not null,
  invited_by_user_id text not null references public.auth_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  constraint auth_invitations_max_ttl_check check (expires_at <= created_at + interval '24 hours')
);
create index auth_invitations_org_idx on public.auth_invitations (organization_id);
create index auth_invitations_org_email_idx on public.auth_invitations (organization_id, lower(email));
create unique index auth_invitations_token_lookup_digest_unique on public.auth_invitations (token_lookup_digest);
alter table public.auth_invitations owner to opzava_owner;
grant select, insert, update, delete on table public.auth_invitations to opzava_app;
alter table public.auth_invitations enable row level security;
alter table public.auth_invitations force row level security;
create policy auth_invitations_tenant_isolation on public.auth_invitations as permissive for all to opzava_app using (organization_id = app.current_org_id()) with check (organization_id = app.current_org_id());
create policy auth_invitations_tenant_context_required on public.auth_invitations as restrictive for all to opzava_app using (app.current_org_id() is not null) with check (app.current_org_id() is not null);
create policy auth_invitations_owner_admin on public.auth_invitations as permissive for all to opzava_owner using (true) with check (true);

-- Indexed, deterministic HMAC directory lookup. Callers must verify the returned
-- salted digest, set the returned tenant context, then re-read/consume under RLS.
create or replace function app.find_pending_invitation(p_lookup_digest text)
returns table (id uuid, organization_id uuid, email text, role text, salt text, token_hash text, invited_by_user_id text, expires_at timestamptz, accepted_at timestamptz, revoked_at timestamptz)
language sql security definer strict set search_path = public as $fn$
  select i.id, i.organization_id, i.email, i.role, i.salt, i.token_hash, i.invited_by_user_id, i.expires_at, i.accepted_at, i.revoked_at
  from public.auth_invitations i where i.token_lookup_digest = p_lookup_digest limit 1
$fn$;
alter function app.find_pending_invitation(text) owner to opzava_owner;
revoke all on function app.find_pending_invitation(text) from public;
grant execute on function app.find_pending_invitation(text) to opzava_app;
