-- Slice 2.5 tracked-follow-up mutation idempotency.
-- Per-table nullable idempotency keys keep each creator's return path native: a
-- retry can return the already-created task/step/comment/check without a
-- polymorphic lookup table, while omitted keys preserve current blind-insert
-- behavior. The board-position unique index lets createTask's existing retry
-- loop recompute max(position)+1 after a same-column race.

set lock_timeout = '3s';
set statement_timeout = '30s';

alter table public.tasks
  add column if not exists idempotency_key text;

alter table public.task_steps
  add column if not exists idempotency_key text;

alter table public.task_comments
  add column if not exists idempotency_key text;

alter table public.task_quality_check
  add column if not exists idempotency_key text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_idempotency_key_check'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_idempotency_key_check
      check (
        idempotency_key is null
        or (
          char_length(btrim(idempotency_key)) > 0
          and char_length(btrim(idempotency_key)) <= 160
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_steps_idempotency_key_check'
      and conrelid = 'public.task_steps'::regclass
  ) then
    alter table public.task_steps
      add constraint task_steps_idempotency_key_check
      check (
        idempotency_key is null
        or (
          char_length(btrim(idempotency_key)) > 0
          and char_length(btrim(idempotency_key)) <= 160
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_comments_idempotency_key_check'
      and conrelid = 'public.task_comments'::regclass
  ) then
    alter table public.task_comments
      add constraint task_comments_idempotency_key_check
      check (
        idempotency_key is null
        or (
          char_length(btrim(idempotency_key)) > 0
          and char_length(btrim(idempotency_key)) <= 160
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_quality_check_idempotency_key_check'
      and conrelid = 'public.task_quality_check'::regclass
  ) then
    alter table public.task_quality_check
      add constraint task_quality_check_idempotency_key_check
      check (
        idempotency_key is null
        or (
          char_length(btrim(idempotency_key)) > 0
          and char_length(btrim(idempotency_key)) <= 160
        )
      );
  end if;
end
$$;

create unique index if not exists tasks_organization_idempotency_key_unique
  on public.tasks (organization_id, idempotency_key);

create unique index if not exists task_steps_organization_idempotency_key_unique
  on public.task_steps (organization_id, idempotency_key);

create unique index if not exists task_comments_organization_idempotency_key_unique
  on public.task_comments (organization_id, idempotency_key);

create unique index if not exists task_quality_check_organization_idempotency_key_unique
  on public.task_quality_check (organization_id, idempotency_key);

with ordered_tasks as (
  select
    id,
    row_number() over (
      partition by workspace_id, status
      order by position asc, updated_at asc, id asc
    ) as next_position
  from public.tasks
)
update public.tasks t
set position = ordered_tasks.next_position
from ordered_tasks
where t.id = ordered_tasks.id
  and t.position <> ordered_tasks.next_position;

create unique index if not exists tasks_workspace_status_position_unique
  on public.tasks (workspace_id, status, position);

alter table public.tasks owner to opzava_owner;
alter table public.task_steps owner to opzava_owner;
alter table public.task_comments owner to opzava_owner;
alter table public.task_quality_check owner to opzava_owner;

grant select, insert, update, delete on table
  public.tasks,
  public.task_steps,
  public.task_comments,
  public.task_quality_check
to opzava_app;

alter table public.tasks enable row level security;
alter table public.tasks force row level security;
alter table public.task_steps enable row level security;
alter table public.task_steps force row level security;
alter table public.task_comments enable row level security;
alter table public.task_comments force row level security;
alter table public.task_quality_check enable row level security;
alter table public.task_quality_check force row level security;
