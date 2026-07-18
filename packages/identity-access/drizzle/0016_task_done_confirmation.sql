-- Issue #253: single-use human-command confirmation for terminal Done admission.

set lock_timeout = '3s';
set statement_timeout = '30s';

create table if not exists public.task_done_confirmation (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  issued_for_user_id text not null references public.auth_users(id) on delete restrict,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_user_id text references public.auth_users(id) on delete restrict,
  quality_review_id uuid,
  constraint task_done_confirmation_task_organization_fk
    foreign key (task_id, organization_id)
    references public.tasks (id, organization_id)
    on delete cascade,
  constraint task_done_confirmation_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict,
  constraint task_done_confirmation_review_organization_fk
    foreign key (quality_review_id, organization_id)
    references public.task_quality_review (id, organization_id)
    on delete restrict,
  constraint task_done_confirmation_expiry_check check (expires_at > issued_at),
  constraint task_done_confirmation_consumption_shape_check check (
    (
      consumed_at is null
      and consumed_by_user_id is null
      and quality_review_id is null
    )
    or (
      consumed_at is not null
      and consumed_by_user_id is not null
      and quality_review_id is not null
    )
  )
);

create index if not exists task_done_confirmation_unconsumed_idx
  on public.task_done_confirmation (
    organization_id,
    task_id,
    issued_for_user_id,
    expires_at
  )
  where consumed_at is null;

alter table public.task_done_confirmation owner to opzava_owner;

grant select, insert, update, delete on table public.task_done_confirmation to opzava_app;

alter table public.task_done_confirmation enable row level security;
alter table public.task_done_confirmation force row level security;

drop policy if exists task_done_confirmation_tenant_isolation
  on public.task_done_confirmation;
create policy task_done_confirmation_tenant_isolation
  on public.task_done_confirmation
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists task_done_confirmation_tenant_context_required
  on public.task_done_confirmation;
create policy task_done_confirmation_tenant_context_required
  on public.task_done_confirmation
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists task_done_confirmation_owner_admin
  on public.task_done_confirmation;
create policy task_done_confirmation_owner_admin
  on public.task_done_confirmation
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);
