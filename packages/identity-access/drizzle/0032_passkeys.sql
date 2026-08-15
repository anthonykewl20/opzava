-- #93 WebAuthn credentials are global user identity state (the 0001 convention),
-- not tenant data: one passkey can authenticate a member across their orgs.
alter table public.auth_users add column webauthn_user_id bytea
  default decode(md5(clock_timestamp()::text || random()::text) || md5(random()::text), 'hex');
-- Do not require pgcrypto solely for this opaque 32-byte user handle; the
-- existing schema deliberately does not install that extension.
update public.auth_users
set webauthn_user_id = decode(md5(id || clock_timestamp()::text) || md5(random()::text), 'hex')
where webauthn_user_id is null;
alter table public.auth_users alter column webauthn_user_id set not null;
create unique index auth_users_webauthn_user_id_unique on public.auth_users (webauthn_user_id);

create table public.auth_passkeys (
  id uuid primary key,
  user_id text not null references public.auth_users(id) on delete cascade,
  credential_id text not null,
  public_key text not null,
  counter bigint not null default 0 check (counter >= 0),
  transports jsonb not null default '[]'::jsonb,
  device_type text not null check (device_type in ('singleDevice', 'multiDevice')),
  backed_up boolean not null default false,
  name text not null,
  aaguid text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create unique index auth_passkeys_credential_id_unique on public.auth_passkeys (credential_id);
create index auth_passkeys_user_id_idx on public.auth_passkeys (user_id);

-- A deterministic lookup digest is only a directory key. The random per-row
-- salt plus HMAC is the verifier, so a database disclosure cannot validate a
-- browser-held challenge. Challenges are consumed exactly once in the finish tx.
create table public.auth_passkey_challenges (
  id uuid primary key,
  purpose text not null check (purpose in ('registration', 'authentication', 'step-up')),
  salt text not null,
  challenge_hash text not null,
  challenge_lookup_digest text not null,
  user_id text references public.auth_users(id) on delete cascade,
  session_id text references public.auth_sessions(id) on delete cascade,
  active_organization_id uuid references public.organizations(id) on delete cascade,
  membership_version integer,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint auth_passkey_challenges_bound_purpose check (
    (purpose = 'authentication' and user_id is null and session_id is null)
    or (purpose in ('registration', 'step-up') and user_id is not null and session_id is not null and active_organization_id is not null and membership_version is not null)
  )
);
create unique index auth_passkey_challenges_lookup_digest_unique on public.auth_passkey_challenges (challenge_lookup_digest);
create index auth_passkey_challenges_expires_at_idx on public.auth_passkey_challenges (expires_at);

alter table public.auth_passkeys owner to opzava_owner;
alter table public.auth_passkey_challenges owner to opzava_owner;
grant select, insert, update, delete on table public.auth_passkeys, public.auth_passkey_challenges to opzava_app;
