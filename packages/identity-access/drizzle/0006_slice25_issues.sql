-- Slice 2.5e GitHub issues projection and active-close outbox.
-- GitHub remains the issue source of truth; projection rows are rebuildable.

set lock_timeout = '3s';
set statement_timeout = '30s';

create table if not exists public.issue_projection (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  repository text not null,
  number integer not null,
  title text not null,
  state text not null,
  labels text[] not null default '{}'::text[],
  assignee text,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  url text not null,
  constraint issue_projection_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict,
  constraint issue_projection_repository_check check (char_length(btrim(repository)) > 0),
  constraint issue_projection_number_positive_check check (number > 0),
  constraint issue_projection_title_check check (char_length(btrim(title)) > 0),
  constraint issue_projection_state_check check (state in ('open', 'closed')),
  constraint issue_projection_url_check check (char_length(btrim(url)) > 0)
);

create unique index if not exists issue_projection_workspace_repo_number_unique
  on public.issue_projection (workspace_id, repository, number);

create unique index if not exists issue_projection_id_organization_id_unique
  on public.issue_projection (id, organization_id);

create index if not exists issue_projection_organization_workspace_state_idx
  on public.issue_projection (organization_id, workspace_id, state, updated_at desc);

alter table public.issue_projection owner to opzava_owner;

grant select, insert, update, delete on table
  public.issue_projection
to opzava_app;

alter table public.issue_projection enable row level security;
alter table public.issue_projection force row level security;

drop policy if exists issue_projection_tenant_isolation on public.issue_projection;
create policy issue_projection_tenant_isolation on public.issue_projection
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists issue_projection_tenant_context_required on public.issue_projection;
create policy issue_projection_tenant_context_required on public.issue_projection
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists issue_projection_owner_admin on public.issue_projection;
create policy issue_projection_owner_admin on public.issue_projection
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);

create table if not exists public.issue_close_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  task_id uuid not null,
  repository text not null,
  issue_number integer not null,
  issue_url text not null,
  dedupe_key text not null,
  state text not null default 'pending',
  close_reason text not null default 'completed',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint issue_close_outbox_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict,
  constraint issue_close_outbox_task_organization_fk
    foreign key (task_id, organization_id)
    references public.tasks (id, organization_id)
    on delete cascade,
  constraint issue_close_outbox_repository_check check (char_length(btrim(repository)) > 0),
  constraint issue_close_outbox_issue_number_positive_check check (issue_number > 0),
  constraint issue_close_outbox_issue_url_check check (char_length(btrim(issue_url)) > 0),
  constraint issue_close_outbox_dedupe_key_check check (char_length(btrim(dedupe_key)) > 0),
  constraint issue_close_outbox_state_check check (state in ('pending', 'processing', 'closed', 'failed')),
  constraint issue_close_outbox_close_reason_check check (close_reason in ('completed', 'not_planned')),
  constraint issue_close_outbox_attempts_nonnegative_check check (attempts >= 0)
);

create unique index if not exists issue_close_outbox_dedupe_key_unique
  on public.issue_close_outbox (dedupe_key);

create unique index if not exists issue_close_outbox_id_organization_id_unique
  on public.issue_close_outbox (id, organization_id);

create index if not exists issue_close_outbox_pending_idx
  on public.issue_close_outbox (organization_id, workspace_id, next_attempt_at)
  where state in ('pending', 'failed');

alter table public.issue_close_outbox owner to opzava_owner;

grant select, insert, update, delete on table
  public.issue_close_outbox
to opzava_app;

alter table public.issue_close_outbox enable row level security;
alter table public.issue_close_outbox force row level security;

drop policy if exists issue_close_outbox_tenant_isolation on public.issue_close_outbox;
create policy issue_close_outbox_tenant_isolation on public.issue_close_outbox
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists issue_close_outbox_tenant_context_required on public.issue_close_outbox;
create policy issue_close_outbox_tenant_context_required on public.issue_close_outbox
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists issue_close_outbox_owner_admin on public.issue_close_outbox;
create policy issue_close_outbox_owner_admin on public.issue_close_outbox
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);
