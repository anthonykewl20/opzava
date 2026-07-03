-- Slice 2.5f Task card evidence/files and quality review.
-- Evidence rows are Opzava truth; object blobs live behind ObjectStorePort.

set lock_timeout = '3s';
set statement_timeout = '30s';

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'task_evidence_kind'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.task_evidence_kind as enum ('file', 'link');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'task_quality_review_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.task_quality_review_status as enum (
      'open',
      'approved',
      'changes_requested'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'task_quality_check_kind'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.task_quality_check_kind as enum ('ai_precheck', 'human');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'task_quality_check_state'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.task_quality_check_state as enum ('pass', 'fail', 'pending');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'task_quality_reviewer_state'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.task_quality_reviewer_state as enum (
      'pending',
      'approved',
      'changes_requested'
    );
  end if;
end
$$;

create table if not exists public.task_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  task_id uuid not null,
  kind public.task_evidence_kind not null,
  object_ref text,
  url text,
  filename text not null,
  content_type text,
  size bigint,
  provenance text not null,
  created_by_user_id text references public.auth_users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint task_evidence_task_organization_fk
    foreign key (task_id, organization_id)
    references public.tasks (id, organization_id)
    on delete cascade,
  constraint task_evidence_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict,
  constraint task_evidence_shape_check check (
    (kind = 'file' and object_ref is not null and url is null)
    or (kind = 'link' and object_ref is null and url is not null)
  ),
  constraint task_evidence_filename_nonempty_check check (char_length(btrim(filename)) > 0),
  constraint task_evidence_filename_length_check check (char_length(filename) <= 500),
  constraint task_evidence_content_type_length_check
    check (content_type is null or char_length(content_type) <= 200),
  constraint task_evidence_size_nonnegative_check check (size is null or size >= 0),
  constraint task_evidence_provenance_nonempty_check check (char_length(btrim(provenance)) > 0),
  constraint task_evidence_provenance_length_check check (char_length(provenance) <= 500)
);

create unique index if not exists task_evidence_id_organization_id_unique
  on public.task_evidence (id, organization_id);

create index if not exists task_evidence_organization_task_created_idx
  on public.task_evidence (organization_id, task_id, created_at);

create table if not exists public.task_quality_review (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  task_id uuid not null,
  status public.task_quality_review_status not null default 'open',
  approved_by_user_id text references public.auth_users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_quality_review_task_organization_fk
    foreign key (task_id, organization_id)
    references public.tasks (id, organization_id)
    on delete cascade,
  constraint task_quality_review_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict,
  constraint task_quality_review_approved_shape_check check (
    (status = 'approved' and approved_by_user_id is not null and approved_at is not null)
    or (status <> 'approved' and approved_at is null)
  )
);

create unique index if not exists task_quality_review_task_unique
  on public.task_quality_review (task_id);

create unique index if not exists task_quality_review_id_organization_id_unique
  on public.task_quality_review (id, organization_id);

create table if not exists public.task_quality_check (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  task_id uuid not null,
  label text not null,
  kind public.task_quality_check_kind not null,
  state public.task_quality_check_state not null default 'pending',
  actor text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_quality_check_review_organization_fk
    foreign key (review_id, organization_id)
    references public.task_quality_review (id, organization_id)
    on delete cascade,
  constraint task_quality_check_task_organization_fk
    foreign key (task_id, organization_id)
    references public.tasks (id, organization_id)
    on delete cascade,
  constraint task_quality_check_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict,
  constraint task_quality_check_label_nonempty_check check (char_length(btrim(label)) > 0),
  constraint task_quality_check_label_length_check check (char_length(label) <= 240),
  constraint task_quality_check_actor_nonempty_check check (char_length(btrim(actor)) > 0),
  constraint task_quality_check_actor_length_check check (char_length(actor) <= 240)
);

create unique index if not exists task_quality_check_id_organization_id_unique
  on public.task_quality_check (id, organization_id);

create index if not exists task_quality_check_organization_review_idx
  on public.task_quality_check (organization_id, review_id);

create table if not exists public.task_quality_reviewer (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  task_id uuid not null,
  reviewer_user_id text not null references public.auth_users(id) on delete restrict,
  state public.task_quality_reviewer_state not null default 'pending',
  updated_at timestamptz not null default now(),
  constraint task_quality_reviewer_review_organization_fk
    foreign key (review_id, organization_id)
    references public.task_quality_review (id, organization_id)
    on delete cascade,
  constraint task_quality_reviewer_task_organization_fk
    foreign key (task_id, organization_id)
    references public.tasks (id, organization_id)
    on delete cascade,
  constraint task_quality_reviewer_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict
);

create unique index if not exists task_quality_reviewer_review_user_unique
  on public.task_quality_reviewer (review_id, reviewer_user_id);

create unique index if not exists task_quality_reviewer_id_organization_id_unique
  on public.task_quality_reviewer (id, organization_id);

alter table public.task_evidence owner to opzava_owner;
alter table public.task_quality_review owner to opzava_owner;
alter table public.task_quality_check owner to opzava_owner;
alter table public.task_quality_reviewer owner to opzava_owner;

grant select, insert, update, delete on table
  public.task_evidence,
  public.task_quality_review,
  public.task_quality_check,
  public.task_quality_reviewer
to opzava_app;

alter table public.task_evidence enable row level security;
alter table public.task_evidence force row level security;

drop policy if exists task_evidence_tenant_isolation on public.task_evidence;
create policy task_evidence_tenant_isolation on public.task_evidence
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists task_evidence_tenant_context_required on public.task_evidence;
create policy task_evidence_tenant_context_required on public.task_evidence
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists task_evidence_owner_admin on public.task_evidence;
create policy task_evidence_owner_admin on public.task_evidence
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);

alter table public.task_quality_review enable row level security;
alter table public.task_quality_review force row level security;

drop policy if exists task_quality_review_tenant_isolation on public.task_quality_review;
create policy task_quality_review_tenant_isolation on public.task_quality_review
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists task_quality_review_tenant_context_required on public.task_quality_review;
create policy task_quality_review_tenant_context_required on public.task_quality_review
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists task_quality_review_owner_admin on public.task_quality_review;
create policy task_quality_review_owner_admin on public.task_quality_review
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);

alter table public.task_quality_check enable row level security;
alter table public.task_quality_check force row level security;

drop policy if exists task_quality_check_tenant_isolation on public.task_quality_check;
create policy task_quality_check_tenant_isolation on public.task_quality_check
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists task_quality_check_tenant_context_required on public.task_quality_check;
create policy task_quality_check_tenant_context_required on public.task_quality_check
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists task_quality_check_owner_admin on public.task_quality_check;
create policy task_quality_check_owner_admin on public.task_quality_check
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);

alter table public.task_quality_reviewer enable row level security;
alter table public.task_quality_reviewer force row level security;

drop policy if exists task_quality_reviewer_tenant_isolation on public.task_quality_reviewer;
create policy task_quality_reviewer_tenant_isolation on public.task_quality_reviewer
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists task_quality_reviewer_tenant_context_required on public.task_quality_reviewer;
create policy task_quality_reviewer_tenant_context_required on public.task_quality_reviewer
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists task_quality_reviewer_owner_admin on public.task_quality_reviewer;
create policy task_quality_reviewer_owner_admin on public.task_quality_reviewer
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);
