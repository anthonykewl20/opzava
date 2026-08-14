-- MFA baseline: Better Auth two-factor schema plus Opzava's server-side sign-in challenge.
-- These are global identity tables, matching the auth-table grant/RLS convention in 0001.

alter table public.auth_users
  add column two_factor_enabled boolean not null default false,
  add column password_failed_count integer not null default 0,
  add column password_locked_until timestamptz;

create table public.auth_two_factor (
  id text primary key,
  secret text not null,
  backup_codes text not null,
  user_id text not null references public.auth_users(id) on delete cascade,
  verified boolean not null default false,
  failed_verification_count integer not null default 0,
  locked_until timestamptz,
  -- A pending enrollment is valid only for this secret and its re-authenticated session.
  enrollment_generation text,
  enrollment_session_id text references public.auth_sessions(id) on delete set null,
  constraint auth_two_factor_user_id_unique unique (user_id)
);

create table public.auth_mfa_challenges (
  id text primary key,
  user_id text not null references public.auth_users(id) on delete cascade,
  active_organization_id uuid not null references public.organizations(id) on delete cascade,
  membership_version integer not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  user_agent_hash text,
  ip_address_hash text,
  created_at timestamptz not null default now()
);

create index auth_mfa_challenges_user_id_idx on public.auth_mfa_challenges (user_id);
create index auth_mfa_challenges_expires_at_idx on public.auth_mfa_challenges (expires_at);

alter table public.auth_two_factor owner to opzava_owner;
alter table public.auth_mfa_challenges owner to opzava_owner;

grant select, insert, update, delete on table
  public.auth_two_factor,
  public.auth_mfa_challenges
to opzava_app;
