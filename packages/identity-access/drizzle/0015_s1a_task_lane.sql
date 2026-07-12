-- S1a Tasks lane model and AI workforce card fields.
-- Lane is the board-placement source of truth; status remains for legacy compatibility.

set lock_timeout = '3s';
set statement_timeout = '30s';

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'task_lane'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.task_lane as enum (
      'backlog',
      'todo',
      'in_progress',
      'review',
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
    where typname = 'task_change_type'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.task_change_type as enum ('visual', 'non_visual');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'task_review_state'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.task_review_state as enum (
      'not_requested',
      'requested',
      'verifying',
      'passed',
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
    where typname = 'task_merge_state'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.task_merge_state as enum (
      'none',
      'pending_ci',
      'merging',
      'merged',
      'blocked_ci_red',
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
    where typname = 'task_ci_state'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.task_ci_state as enum ('unknown', 'pending', 'green', 'red');
  end if;
end
$$;

alter table public.tasks
  add column if not exists lane public.task_lane,
  add column if not exists blocked boolean not null default false,
  add column if not exists blocked_reason text,
  add column if not exists overview text,
  add column if not exists assigned_agent_identity_id uuid,
  add column if not exists primary_issue_ref text,
  add column if not exists primary_pr_ref text,
  add column if not exists branch_name text,
  add column if not exists change_type public.task_change_type,
  add column if not exists review_state public.task_review_state not null default 'not_requested',
  add column if not exists review_requested_at timestamptz,
  add column if not exists review_requested_by_agent_identity_id uuid,
  add column if not exists review_passed_at timestamptz,
  add column if not exists review_passed_by_orchestrator_identity_id uuid,
  add column if not exists done_requested_at timestamptz,
  add column if not exists done_by_user_id text,
  add column if not exists merge_state public.task_merge_state not null default 'none',
  add column if not exists ci_state public.task_ci_state not null default 'unknown';

update public.tasks
set lane = 'todo'::public.task_lane,
    blocked = false
where lane is null
  and status = 'todo';

update public.tasks
set lane = 'in_progress'::public.task_lane,
    blocked = false
where lane is null
  and status = 'in_progress';

update public.tasks
set lane = 'done'::public.task_lane,
    blocked = false
where lane is null
  and status = 'done';

update public.tasks
set blocked = true,
    lane = case
      when assignee_user_id is not null then 'in_progress'::public.task_lane
      else 'todo'::public.task_lane
    end
where lane is null
  and status = 'blocked';

do $$
begin
  if exists (select 1 from public.tasks where lane is null) then
    raise exception 'S1a: task.lane backfill incomplete';
  end if;
end
$$;

alter table public.tasks
  alter column lane set default 'todo'::public.task_lane,
  alter column lane set not null;

create index if not exists tasks_org_ws_lane_position_idx
  on public.tasks (organization_id, workspace_id, lane, position);
