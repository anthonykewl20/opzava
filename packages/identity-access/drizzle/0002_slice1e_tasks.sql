-- Slice 1e Project Management admin Tasks aggregate.
-- This migration deliberately stays in the existing identity-access migration
-- stream so the one-shot migrate runner and manifest gate continue to apply all
-- current schema changes in order.

set lock_timeout = '3s';
set statement_timeout = '30s';

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'task_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.task_status as enum (
      'todo',
      'in_progress',
      'blocked',
      'done'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'task_priority'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.task_priority as enum (
      'low',
      'normal',
      'high',
      'urgent'
    );
  end if;
end
$$;

create unique index if not exists workspaces_id_organization_id_unique
  on public.workspaces (id, organization_id);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  title text not null,
  description text not null default '',
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'normal',
  assignee_user_id text references public.auth_users(id) on delete set null,
  labels text[] not null default '{}'::text[],
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict,
  constraint tasks_title_nonempty_check check (char_length(btrim(title)) > 0),
  constraint tasks_title_length_check check (char_length(title) <= 180),
  constraint tasks_description_length_check check (char_length(description) <= 4000),
  constraint tasks_labels_limit_check check (cardinality(labels) <= 8),
  constraint tasks_position_nonnegative_check check (position >= 0)
);

create index if not exists tasks_organization_workspace_status_position_idx
  on public.tasks (organization_id, workspace_id, status, position);

alter table public.tasks owner to opzava_owner;

grant select, insert, update, delete on table public.tasks to opzava_app;

alter table public.tasks enable row level security;
alter table public.tasks force row level security;

drop policy if exists tasks_tenant_isolation on public.tasks;
create policy tasks_tenant_isolation on public.tasks
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists tasks_tenant_context_required on public.tasks;
create policy tasks_tenant_context_required on public.tasks
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null);

drop policy if exists tasks_owner_admin on public.tasks;
create policy tasks_owner_admin on public.tasks
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);
