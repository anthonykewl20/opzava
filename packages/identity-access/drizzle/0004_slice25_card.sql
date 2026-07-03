-- Slice 2.5a Project Management live card data layer.
-- This migration stays in the identity-access migration stream so the one-shot
-- migrate runner and manifest gate continue to apply all current schema changes
-- in order.

set lock_timeout = '3s';
set statement_timeout = '30s';

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'task_comment_author_kind'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.task_comment_author_kind as enum (
      'human',
      'assistant'
    );
  end if;
end
$$;

create sequence if not exists public.tasks_card_number_seq
  as bigint
  increment by 1
  minvalue 1
  no maxvalue
  start with 1
  cache 1;

alter sequence public.tasks_card_number_seq owner to opzava_owner;

alter table public.tasks
  add column if not exists card_number bigint,
  add column if not exists due_at timestamptz,
  add column if not exists provenance_source text not null default 'manual',
  add column if not exists provenance_external_ref text;

alter table public.tasks
  alter column card_number set default nextval('public.tasks_card_number_seq'::regclass);

update public.tasks
set card_number = nextval('public.tasks_card_number_seq'::regclass)
where card_number is null;

alter table public.tasks
  alter column card_number set not null;

alter sequence public.tasks_card_number_seq owned by public.tasks.card_number;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_card_number_positive_check'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_card_number_positive_check check (card_number > 0);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_provenance_source_nonempty_check'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_provenance_source_nonempty_check
      check (char_length(btrim(provenance_source)) > 0);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_provenance_source_length_check'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_provenance_source_length_check
      check (char_length(provenance_source) <= 240);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_provenance_external_ref_length_check'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_provenance_external_ref_length_check
      check (provenance_external_ref is null or char_length(provenance_external_ref) <= 500);
  end if;
end
$$;

create unique index if not exists tasks_id_organization_id_unique
  on public.tasks (id, organization_id);

create unique index if not exists tasks_workspace_card_number_unique
  on public.tasks (workspace_id, card_number);

create table if not exists public.task_steps (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  text text not null,
  assignee_user_id text references public.auth_users(id) on delete set null,
  done boolean not null default false,
  position integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_steps_task_organization_fk
    foreign key (task_id, organization_id)
    references public.tasks (id, organization_id)
    on delete restrict,
  constraint task_steps_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict,
  constraint task_steps_text_nonempty_check check (char_length(btrim(text)) > 0),
  constraint task_steps_text_length_check check (char_length(text) <= 500),
  constraint task_steps_position_positive_check check (position > 0)
);

create unique index if not exists task_steps_id_organization_id_unique
  on public.task_steps (id, organization_id);

create index if not exists task_steps_organization_task_position_idx
  on public.task_steps (organization_id, task_id, position);

create table if not exists public.task_watchers (
  task_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  user_id text not null references public.auth_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint task_watchers_task_organization_fk
    foreign key (task_id, organization_id)
    references public.tasks (id, organization_id)
    on delete restrict,
  constraint task_watchers_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict
);

create unique index if not exists task_watchers_task_user_unique
  on public.task_watchers (task_id, user_id);

create index if not exists task_watchers_organization_task_idx
  on public.task_watchers (organization_id, task_id);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  author_kind public.task_comment_author_kind not null,
  author_user_id text references public.auth_users(id) on delete restrict,
  assistant_key text,
  body text not null,
  created_at timestamptz not null default now(),
  constraint task_comments_task_organization_fk
    foreign key (task_id, organization_id)
    references public.tasks (id, organization_id)
    on delete restrict,
  constraint task_comments_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict,
  constraint task_comments_author_kind_check check (
    (author_kind = 'human' and author_user_id is not null and assistant_key is null)
    or (author_kind = 'assistant' and author_user_id is null and assistant_key is not null)
  ),
  constraint task_comments_assistant_key_length_check
    check (assistant_key is null or char_length(assistant_key) <= 180),
  constraint task_comments_body_nonempty_check check (char_length(btrim(body)) > 0),
  constraint task_comments_body_length_check check (char_length(body) <= 4000)
);

create unique index if not exists task_comments_id_organization_id_unique
  on public.task_comments (id, organization_id);

create index if not exists task_comments_organization_task_created_idx
  on public.task_comments (organization_id, task_id, created_at);

create table if not exists public.task_comment_read_markers (
  task_id uuid not null,
  comment_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  user_id text not null references public.auth_users(id) on delete restrict,
  read_at timestamptz not null default now(),
  constraint task_comment_read_markers_task_organization_fk
    foreign key (task_id, organization_id)
    references public.tasks (id, organization_id)
    on delete restrict,
  constraint task_comment_read_markers_comment_organization_fk
    foreign key (comment_id, organization_id)
    references public.task_comments (id, organization_id)
    on delete restrict,
  constraint task_comment_read_markers_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict
);

create unique index if not exists task_comment_read_markers_comment_user_unique
  on public.task_comment_read_markers (comment_id, user_id);

create index if not exists task_comment_read_markers_organization_task_idx
  on public.task_comment_read_markers (organization_id, task_id);

alter table public.task_steps owner to opzava_owner;
alter table public.task_watchers owner to opzava_owner;
alter table public.task_comments owner to opzava_owner;
alter table public.task_comment_read_markers owner to opzava_owner;

grant usage, select on sequence public.tasks_card_number_seq to opzava_app;

grant select, insert, update, delete on table
  public.task_steps,
  public.task_watchers,
  public.task_comments,
  public.task_comment_read_markers
to opzava_app;

drop policy if exists tasks_tenant_context_required on public.tasks;
create policy tasks_tenant_context_required on public.tasks
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

alter table public.task_steps enable row level security;
alter table public.task_steps force row level security;

drop policy if exists task_steps_tenant_isolation on public.task_steps;
create policy task_steps_tenant_isolation on public.task_steps
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists task_steps_tenant_context_required on public.task_steps;
create policy task_steps_tenant_context_required on public.task_steps
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists task_steps_owner_admin on public.task_steps;
create policy task_steps_owner_admin on public.task_steps
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);

alter table public.task_watchers enable row level security;
alter table public.task_watchers force row level security;

drop policy if exists task_watchers_tenant_isolation on public.task_watchers;
create policy task_watchers_tenant_isolation on public.task_watchers
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists task_watchers_tenant_context_required on public.task_watchers;
create policy task_watchers_tenant_context_required on public.task_watchers
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists task_watchers_owner_admin on public.task_watchers;
create policy task_watchers_owner_admin on public.task_watchers
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);

alter table public.task_comments enable row level security;
alter table public.task_comments force row level security;

drop policy if exists task_comments_tenant_isolation on public.task_comments;
create policy task_comments_tenant_isolation on public.task_comments
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists task_comments_tenant_context_required on public.task_comments;
create policy task_comments_tenant_context_required on public.task_comments
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists task_comments_owner_admin on public.task_comments;
create policy task_comments_owner_admin on public.task_comments
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);

alter table public.task_comment_read_markers enable row level security;
alter table public.task_comment_read_markers force row level security;

drop policy if exists task_comment_read_markers_tenant_isolation on public.task_comment_read_markers;
create policy task_comment_read_markers_tenant_isolation on public.task_comment_read_markers
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists task_comment_read_markers_tenant_context_required on public.task_comment_read_markers;
create policy task_comment_read_markers_tenant_context_required on public.task_comment_read_markers
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists task_comment_read_markers_owner_admin on public.task_comment_read_markers;
create policy task_comment_read_markers_owner_admin on public.task_comment_read_markers
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);
