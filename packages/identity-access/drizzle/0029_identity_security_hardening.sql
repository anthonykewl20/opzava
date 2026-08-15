-- #93: browser reset links carry only a short-lived one-time handoff handle.
-- token_hash was never needed after the handle-only contract and is removed so
-- no future caller can accidentally revive the raw-token delivery path.
alter table public.auth_password_reset_tokens
  add column handle_hash text,
  add column handle_lookup_digest text,
  add column handle_expires_at timestamptz,
  add column handle_used_at timestamptz;

-- Existing reset rows predate browser handles and are safely unusable after this migration.
update public.auth_password_reset_tokens
set handle_hash = '', handle_lookup_digest = 'legacy:' || id::text, handle_expires_at = created_at, handle_used_at = coalesce(used_at, now())
where handle_hash is null;

alter table public.auth_password_reset_tokens
  alter column handle_hash set not null,
  alter column handle_lookup_digest set not null,
  alter column handle_expires_at set not null,
  drop column token_hash,
  -- Handle forgery is bounded by 256-bit entropy plus the public limiter; a
  -- per-token failed-attempt counter was unreachable after directory lookup.
  drop column failed_attempts;

create index auth_password_reset_tokens_handle_expires_at_idx
  on public.auth_password_reset_tokens (handle_expires_at);
create unique index auth_password_reset_tokens_handle_lookup_digest_unique
  on public.auth_password_reset_tokens (handle_lookup_digest);

-- Password-reset rows are global identity state under the 0001 convention, not
-- organization-scoped. Do not add tenant RLS here. This directory lookup is the
-- sole unauthenticated handle exchange seam and avoids a full-table digest scan.
create or replace function app.find_reset_handoff(p_lookup_digest text)
returns table (id uuid, user_id text, salt text, handle_hash text, expires_at timestamptz, used_at timestamptz, handle_expires_at timestamptz, handle_used_at timestamptz)
language sql security definer strict set search_path = public as $fn$
  select t.id, t.user_id, t.salt, t.handle_hash, t.expires_at, t.used_at, t.handle_expires_at, t.handle_used_at
  from public.auth_password_reset_tokens t
  where t.handle_lookup_digest = p_lookup_digest
  limit 1
$fn$;
alter function app.find_reset_handoff(text) owner to opzava_owner;
revoke all on function app.find_reset_handoff(text) from public;
grant execute on function app.find_reset_handoff(text) to opzava_app;
