-- Password-reset tokens are opaque, single-use, and salted-HMAC hashed at rest.
-- Identity tables follow the 0001 owner/grant convention.
create table public.auth_password_reset_tokens (
  id uuid primary key,
  user_id text not null references public.auth_users(id) on delete cascade,
  salt text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  failed_attempts integer not null default 0,
  created_at timestamptz not null default now()
);

create index auth_password_reset_tokens_user_id_idx on public.auth_password_reset_tokens (user_id);
create index auth_password_reset_tokens_expires_at_idx on public.auth_password_reset_tokens (expires_at);

alter table public.auth_password_reset_tokens owner to opzava_owner;
grant select, insert, update, delete on table public.auth_password_reset_tokens to opzava_app;
