-- Slice 2a Runtime-Control assistant conversation persistence.
-- This migration stays in the existing identity-access migration stream so the
-- one-shot migrate runner and manifest gate continue to apply all current
-- schema changes in order.

set lock_timeout = '3s';
set statement_timeout = '30s';

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'assistant_conversation_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.assistant_conversation_status as enum (
      'open',
      'archived'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'assistant_turn_role'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.assistant_turn_role as enum (
      'user',
      'assistant',
      'tool',
      'system'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'assistant_turn_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.assistant_turn_status as enum (
      'queued',
      'streaming',
      'finalizing',
      'final',
      'failed'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'assistant_tool_outcome_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.assistant_tool_outcome_status as enum (
      'started',
      'succeeded',
      'failed'
    );
  end if;
end
$$;

create unique index if not exists workspaces_id_organization_id_unique
  on public.workspaces (id, organization_id);

create table if not exists public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  surface text not null,
  assistant_key text not null,
  status public.assistant_conversation_status not null default 'open',
  created_by_user_id text not null references public.auth_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_conversations_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict,
  constraint assistant_conversations_surface_nonempty_check check (char_length(btrim(surface)) > 0),
  constraint assistant_conversations_surface_length_check check (char_length(surface) <= 180),
  constraint assistant_conversations_assistant_key_nonempty_check check (char_length(btrim(assistant_key)) > 0),
  constraint assistant_conversations_assistant_key_length_check check (char_length(assistant_key) <= 180)
);

create unique index if not exists assistant_conversations_id_organization_id_unique
  on public.assistant_conversations (id, organization_id);

create index if not exists assistant_conversations_organization_workspace_idx
  on public.assistant_conversations (organization_id, workspace_id);

create table if not exists public.assistant_turns (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  role public.assistant_turn_role not null,
  status public.assistant_turn_status not null,
  actor_user_id text references public.auth_users(id) on delete restrict,
  assistant_key text,
  content jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  openclaw_session_ref text,
  openclaw_run_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz,
  constraint assistant_turns_conversation_organization_fk
    foreign key (conversation_id, organization_id)
    references public.assistant_conversations (id, organization_id)
    on delete restrict,
  constraint assistant_turns_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict,
  constraint assistant_turns_content_object_check check (jsonb_typeof(content) = 'object'),
  constraint assistant_turns_idempotency_key_nonempty_check check (char_length(btrim(idempotency_key)) > 0),
  constraint assistant_turns_idempotency_key_length_check check (char_length(idempotency_key) <= 180),
  constraint assistant_turns_actor_role_check check (
    (role = 'user' and actor_user_id is not null and assistant_key is null)
    or (role = 'assistant' and actor_user_id is null and assistant_key is not null)
    or (role in ('tool', 'system'))
  ),
  constraint assistant_turns_finalized_status_check check (
    (status in ('final', 'failed') and finalized_at is not null)
    or (status not in ('final', 'failed') and finalized_at is null)
  )
);

create unique index if not exists assistant_turns_id_organization_id_unique
  on public.assistant_turns (id, organization_id);

create unique index if not exists assistant_turns_org_conversation_idempotency_unique
  on public.assistant_turns (organization_id, conversation_id, idempotency_key);

create index if not exists assistant_turns_organization_conversation_created_idx
  on public.assistant_turns (organization_id, conversation_id, created_at);

create table if not exists public.assistant_tool_outcomes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  turn_id uuid not null,
  tool_name text not null,
  tool_call_id text not null,
  idempotency_key text not null,
  status public.assistant_tool_outcome_status not null,
  request_summary jsonb not null default '{}'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  target_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint assistant_tool_outcomes_turn_organization_fk
    foreign key (turn_id, organization_id)
    references public.assistant_turns (id, organization_id)
    on delete restrict,
  constraint assistant_tool_outcomes_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict,
  constraint assistant_tool_outcomes_tool_name_nonempty_check check (char_length(btrim(tool_name)) > 0),
  constraint assistant_tool_outcomes_tool_name_length_check check (char_length(tool_name) <= 180),
  constraint assistant_tool_outcomes_tool_call_id_nonempty_check check (char_length(btrim(tool_call_id)) > 0),
  constraint assistant_tool_outcomes_tool_call_id_length_check check (char_length(tool_call_id) <= 180),
  constraint assistant_tool_outcomes_idempotency_key_nonempty_check check (char_length(btrim(idempotency_key)) > 0),
  constraint assistant_tool_outcomes_idempotency_key_length_check check (char_length(idempotency_key) <= 180),
  constraint assistant_tool_outcomes_request_summary_object_check check (jsonb_typeof(request_summary) = 'object'),
  constraint assistant_tool_outcomes_result_summary_object_check check (jsonb_typeof(result_summary) = 'object'),
  constraint assistant_tool_outcomes_completed_status_check check (
    (status in ('succeeded', 'failed') and completed_at is not null)
    or (status = 'started' and completed_at is null)
  )
);

create unique index if not exists assistant_tool_outcomes_turn_tool_call_unique
  on public.assistant_tool_outcomes (turn_id, tool_call_id);

create index if not exists assistant_tool_outcomes_organization_turn_idx
  on public.assistant_tool_outcomes (organization_id, turn_id);

alter table public.assistant_conversations owner to opzava_owner;
alter table public.assistant_turns owner to opzava_owner;
alter table public.assistant_tool_outcomes owner to opzava_owner;

grant select, insert, update, delete on table
  public.assistant_conversations,
  public.assistant_turns,
  public.assistant_tool_outcomes
to opzava_app;

alter table public.assistant_conversations enable row level security;
alter table public.assistant_conversations force row level security;

drop policy if exists assistant_conversations_tenant_isolation on public.assistant_conversations;
create policy assistant_conversations_tenant_isolation on public.assistant_conversations
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists assistant_conversations_tenant_context_required on public.assistant_conversations;
create policy assistant_conversations_tenant_context_required on public.assistant_conversations
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null);

drop policy if exists assistant_conversations_owner_admin on public.assistant_conversations;
create policy assistant_conversations_owner_admin on public.assistant_conversations
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);

alter table public.assistant_turns enable row level security;
alter table public.assistant_turns force row level security;

drop policy if exists assistant_turns_tenant_isolation on public.assistant_turns;
create policy assistant_turns_tenant_isolation on public.assistant_turns
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists assistant_turns_tenant_context_required on public.assistant_turns;
create policy assistant_turns_tenant_context_required on public.assistant_turns
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null);

drop policy if exists assistant_turns_owner_admin on public.assistant_turns;
create policy assistant_turns_owner_admin on public.assistant_turns
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);

alter table public.assistant_tool_outcomes enable row level security;
alter table public.assistant_tool_outcomes force row level security;

drop policy if exists assistant_tool_outcomes_tenant_isolation on public.assistant_tool_outcomes;
create policy assistant_tool_outcomes_tenant_isolation on public.assistant_tool_outcomes
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists assistant_tool_outcomes_tenant_context_required on public.assistant_tool_outcomes;
create policy assistant_tool_outcomes_tenant_context_required on public.assistant_tool_outcomes
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null);

drop policy if exists assistant_tool_outcomes_owner_admin on public.assistant_tool_outcomes;
create policy assistant_tool_outcomes_owner_admin on public.assistant_tool_outcomes
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);
