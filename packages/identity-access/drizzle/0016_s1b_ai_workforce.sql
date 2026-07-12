-- S1b AI workforce aggregate foundations.
-- These tables model agent identity, dispatch, run progress, local pulls, and PR linkage.

set lock_timeout = '3s';
set statement_timeout = '30s';

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'agent_identity_kind'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.agent_identity_kind as enum (
      'orchestrator',
      'gateway_subagent',
      'local_tool'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'agent_identity_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.agent_identity_status as enum ('active', 'revoked');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'agent_dispatch_channel'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.agent_dispatch_channel as enum ('gateway_push', 'local_poll');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'agent_dispatch_state'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.agent_dispatch_state as enum (
      'pending',
      'dispatched',
      'acked',
      'degraded',
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
    where typname = 'task_run_step_state'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.task_run_step_state as enum ('running', 'done', 'failed');
  end if;
end
$$;

create table if not exists public.agent_identity (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  name text not null,
  kind public.agent_identity_kind not null,
  provider text,
  via_client text,
  issued_to_user_id text,
  token_id text,
  openclaw_agent_ref text,
  status public.agent_identity_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_identity_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict
);

create unique index if not exists agent_identity_id_organization_id_unique
  on public.agent_identity (id, organization_id);

create unique index if not exists agent_identity_organization_workspace_name_unique
  on public.agent_identity (organization_id, workspace_id, name);

create table if not exists public.task_agent_assignment (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  task_id uuid not null,
  agent_identity_id uuid not null,
  run_policy text,
  assigned_by_user_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_agent_assignment_task_organization_fk
    foreign key (task_id, organization_id)
    references public.tasks (id, organization_id)
    on delete cascade,
  constraint task_agent_assignment_agent_organization_fk
    foreign key (agent_identity_id, organization_id)
    references public.agent_identity (id, organization_id)
    on delete restrict,
  constraint task_agent_assignment_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict
);

create unique index if not exists task_agent_assignment_id_organization_id_unique
  on public.task_agent_assignment (id, organization_id);

create unique index if not exists task_agent_assignment_active_task_unique
  on public.task_agent_assignment (organization_id, task_id)
  where active;

create table if not exists public.agent_dispatch (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  task_id uuid not null,
  outbox_id text not null,
  channel public.agent_dispatch_channel not null,
  state public.agent_dispatch_state not null default 'pending',
  degraded_reason text,
  openclaw_session_ref text,
  openclaw_task_ref text,
  ai_run_ref text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_dispatch_task_organization_fk
    foreign key (task_id, organization_id)
    references public.tasks (id, organization_id)
    on delete cascade,
  constraint agent_dispatch_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict
);

create unique index if not exists agent_dispatch_id_organization_id_unique
  on public.agent_dispatch (id, organization_id);

create unique index if not exists agent_dispatch_organization_outbox_unique
  on public.agent_dispatch (organization_id, outbox_id);

create table if not exists public.task_run_step (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  task_id uuid not null,
  agent_identity_id uuid,
  sequence integer not null,
  summary text not null,
  state public.task_run_step_state not null default 'running',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint task_run_step_task_organization_fk
    foreign key (task_id, organization_id)
    references public.tasks (id, organization_id)
    on delete cascade,
  constraint task_run_step_agent_organization_fk
    foreign key (agent_identity_id, organization_id)
    references public.agent_identity (id, organization_id)
    on delete set null,
  constraint task_run_step_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict
);

create unique index if not exists task_run_step_id_organization_id_unique
  on public.task_run_step (id, organization_id);

create index if not exists task_run_step_organization_task_sequence_idx
  on public.task_run_step (organization_id, task_id, sequence);

create table if not exists public.task_pull_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  task_id uuid not null,
  agent_identity_id uuid not null,
  reason text,
  claimed_at timestamptz,
  claimed_by_token_id text,
  created_at timestamptz not null default now(),
  constraint task_pull_queue_task_organization_fk
    foreign key (task_id, organization_id)
    references public.tasks (id, organization_id)
    on delete cascade,
  constraint task_pull_queue_agent_organization_fk
    foreign key (agent_identity_id, organization_id)
    references public.agent_identity (id, organization_id)
    on delete restrict,
  constraint task_pull_queue_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict
);

create unique index if not exists task_pull_queue_id_organization_id_unique
  on public.task_pull_queue (id, organization_id);

create index if not exists task_pull_queue_organization_agent_created_idx
  on public.task_pull_queue (organization_id, agent_identity_id, created_at);

create table if not exists public.task_pr_link (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  task_id uuid not null,
  pr_ref text not null,
  branch text,
  ci_state public.task_ci_state,
  mergeability text,
  checks_url text,
  merge_state public.task_merge_state,
  merged_by_user_id text,
  merged_at timestamptz,
  merge_audit text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_pr_link_task_organization_fk
    foreign key (task_id, organization_id)
    references public.tasks (id, organization_id)
    on delete cascade,
  constraint task_pr_link_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict
);

create unique index if not exists task_pr_link_id_organization_id_unique
  on public.task_pr_link (id, organization_id);

create unique index if not exists task_pr_link_organization_task_pr_ref_unique
  on public.task_pr_link (organization_id, task_id, pr_ref);

alter table public.agent_identity owner to opzava_owner;
alter table public.task_agent_assignment owner to opzava_owner;
alter table public.agent_dispatch owner to opzava_owner;
alter table public.task_run_step owner to opzava_owner;
alter table public.task_pull_queue owner to opzava_owner;
alter table public.task_pr_link owner to opzava_owner;

grant select, insert, update, delete on table public.agent_identity to opzava_app;
grant select, insert, update, delete on table public.task_agent_assignment to opzava_app;
grant select, insert, update, delete on table public.agent_dispatch to opzava_app;
grant select, insert, update, delete on table public.task_run_step to opzava_app;
grant select, insert, update, delete on table public.task_pull_queue to opzava_app;
grant select, insert, update, delete on table public.task_pr_link to opzava_app;

alter table public.agent_identity enable row level security;
alter table public.agent_identity force row level security;

drop policy if exists agent_identity_tenant_isolation on public.agent_identity;
create policy agent_identity_tenant_isolation on public.agent_identity
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists agent_identity_tenant_context_required on public.agent_identity;
create policy agent_identity_tenant_context_required on public.agent_identity
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists agent_identity_owner_admin on public.agent_identity;
create policy agent_identity_owner_admin on public.agent_identity
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);

alter table public.task_agent_assignment enable row level security;
alter table public.task_agent_assignment force row level security;

drop policy if exists task_agent_assignment_tenant_isolation on public.task_agent_assignment;
create policy task_agent_assignment_tenant_isolation on public.task_agent_assignment
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists task_agent_assignment_tenant_context_required on public.task_agent_assignment;
create policy task_agent_assignment_tenant_context_required on public.task_agent_assignment
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists task_agent_assignment_owner_admin on public.task_agent_assignment;
create policy task_agent_assignment_owner_admin on public.task_agent_assignment
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);

alter table public.agent_dispatch enable row level security;
alter table public.agent_dispatch force row level security;

drop policy if exists agent_dispatch_tenant_isolation on public.agent_dispatch;
create policy agent_dispatch_tenant_isolation on public.agent_dispatch
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists agent_dispatch_tenant_context_required on public.agent_dispatch;
create policy agent_dispatch_tenant_context_required on public.agent_dispatch
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists agent_dispatch_owner_admin on public.agent_dispatch;
create policy agent_dispatch_owner_admin on public.agent_dispatch
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);

alter table public.task_run_step enable row level security;
alter table public.task_run_step force row level security;

drop policy if exists task_run_step_tenant_isolation on public.task_run_step;
create policy task_run_step_tenant_isolation on public.task_run_step
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists task_run_step_tenant_context_required on public.task_run_step;
create policy task_run_step_tenant_context_required on public.task_run_step
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists task_run_step_owner_admin on public.task_run_step;
create policy task_run_step_owner_admin on public.task_run_step
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);

alter table public.task_pull_queue enable row level security;
alter table public.task_pull_queue force row level security;

drop policy if exists task_pull_queue_tenant_isolation on public.task_pull_queue;
create policy task_pull_queue_tenant_isolation on public.task_pull_queue
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists task_pull_queue_tenant_context_required on public.task_pull_queue;
create policy task_pull_queue_tenant_context_required on public.task_pull_queue
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists task_pull_queue_owner_admin on public.task_pull_queue;
create policy task_pull_queue_owner_admin on public.task_pull_queue
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);

alter table public.task_pr_link enable row level security;
alter table public.task_pr_link force row level security;

drop policy if exists task_pr_link_tenant_isolation on public.task_pr_link;
create policy task_pr_link_tenant_isolation on public.task_pr_link
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists task_pr_link_tenant_context_required on public.task_pr_link;
create policy task_pr_link_tenant_context_required on public.task_pr_link
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists task_pr_link_owner_admin on public.task_pr_link;
create policy task_pr_link_owner_admin on public.task_pr_link
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);
