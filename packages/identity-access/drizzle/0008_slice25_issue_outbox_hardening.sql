-- Slice 2.5 deep-verification issue hardening.
-- Adds active-close claim leases/dead-lettering and an issue-create idempotency guard.

set lock_timeout = '3s';
set statement_timeout = '30s';

alter table public.issue_close_outbox
  add column if not exists claimed_at timestamptz;

alter table public.issue_close_outbox
  drop constraint if exists issue_close_outbox_state_check;

alter table public.issue_close_outbox
  add constraint issue_close_outbox_state_check
  check (state in ('pending', 'processing', 'closed', 'failed', 'dead'));

drop index if exists issue_close_outbox_pending_idx;
create index if not exists issue_close_outbox_pending_idx
  on public.issue_close_outbox (organization_id, workspace_id, next_attempt_at)
  where state in ('pending', 'failed', 'processing');

create index if not exists issue_close_outbox_processing_claimed_idx
  on public.issue_close_outbox (organization_id, workspace_id, claimed_at)
  where state = 'processing';

create table if not exists public.issue_create_intent (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  actor_user_id text not null references public.auth_users(id) on delete restrict,
  repository text not null,
  idempotency_key text not null,
  state text not null default 'processing',
  issue_projection_id uuid,
  issue_number integer,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint issue_create_intent_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict,
  constraint issue_create_intent_projection_organization_fk
    foreign key (issue_projection_id, organization_id)
    references public.issue_projection (id, organization_id)
    on delete restrict,
  constraint issue_create_intent_repository_check check (char_length(btrim(repository)) > 0),
  constraint issue_create_intent_idempotency_key_check
    check (
      char_length(btrim(idempotency_key)) > 0
      and char_length(btrim(idempotency_key)) <= 160
    ),
  constraint issue_create_intent_state_check check (state in ('processing', 'succeeded', 'failed')),
  constraint issue_create_intent_issue_number_positive_check
    check (issue_number is null or issue_number > 0)
);

create unique index if not exists issue_create_intent_workspace_key_unique
  on public.issue_create_intent (workspace_id, idempotency_key);

create unique index if not exists issue_create_intent_id_organization_id_unique
  on public.issue_create_intent (id, organization_id);

create index if not exists issue_create_intent_workspace_state_idx
  on public.issue_create_intent (organization_id, workspace_id, state, updated_at desc);

alter table public.issue_create_intent owner to opzava_owner;

grant select, insert, update, delete on table
  public.issue_create_intent
to opzava_app;

alter table public.issue_create_intent enable row level security;
alter table public.issue_create_intent force row level security;

drop policy if exists issue_create_intent_tenant_isolation on public.issue_create_intent;
create policy issue_create_intent_tenant_isolation on public.issue_create_intent
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists issue_create_intent_tenant_context_required on public.issue_create_intent;
create policy issue_create_intent_tenant_context_required on public.issue_create_intent
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists issue_create_intent_owner_admin on public.issue_create_intent;
create policy issue_create_intent_owner_admin on public.issue_create_intent
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);
