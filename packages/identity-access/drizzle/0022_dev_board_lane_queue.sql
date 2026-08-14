-- TB-01b-5: authoritative Todo lane queue and versioned rank membership.
-- Deliberate deviation from the original DDL sketch: no workspace INSERT trigger creates queue
-- headers. The store race-safely creates and locks the Todo header with INSERT .. ON CONFLICT DO
-- NOTHING followed by SELECT .. FOR UPDATE; the membership FK prevents a member without a header.
set lock_timeout = '3s';
set statement_timeout = '30s';

create table public.dev_board_lane_queue_version (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null,
  lane text not null check (lane in ('backlog', 'todo', 'blocked', 'in_progress', 'review', 'done')),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  primary key (organization_id, workspace_id, lane),
  constraint dev_board_lane_queue_version_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces(id, organization_id) on delete restrict
);

alter table public.dev_board_dev_ticket
  add constraint dev_board_dev_ticket_id_org_workspace_lane_unique
  unique (id, organization_id, workspace_id, lane);

create table public.dev_board_lane_queue (
  organization_id uuid not null,
  workspace_id uuid not null,
  lane text not null check (lane in ('backlog', 'todo', 'blocked', 'in_progress', 'review', 'done')),
  dev_ticket_id uuid not null,
  rank bigint not null check (rank > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, workspace_id, lane, dev_ticket_id),
  constraint dev_board_lane_queue_one_active_membership_unique
    unique (organization_id, workspace_id, dev_ticket_id),
  constraint dev_board_lane_queue_version_fk
    foreign key (organization_id, workspace_id, lane)
    references public.dev_board_lane_queue_version(organization_id, workspace_id, lane)
    on delete restrict,
  constraint dev_board_lane_queue_ticket_lane_fk
    foreign key (dev_ticket_id, organization_id, workspace_id, lane)
    references public.dev_board_dev_ticket(id, organization_id, workspace_id, lane)
    on delete restrict
);

create index dev_board_lane_queue_order_idx
  on public.dev_board_lane_queue (organization_id, workspace_id, lane, rank, dev_ticket_id);

insert into public.dev_board_lane_queue_version (organization_id, workspace_id, lane, version)
select distinct organization_id, workspace_id, 'todo', 1
from public.dev_board_dev_ticket;

insert into public.dev_board_lane_queue (organization_id, workspace_id, lane, dev_ticket_id, rank)
select organization_id, workspace_id, 'todo', id,
  (row_number() over (partition by organization_id, workspace_id order by todo_rank asc nulls last, created_at asc, id asc) + 1) * 1000000
from public.dev_board_dev_ticket
where lane = 'todo';

do $backfill$
declare ticket_count bigint;
declare member_count bigint;
begin
  select count(*) into ticket_count from public.dev_board_dev_ticket where lane = 'todo';
  select count(*) into member_count from public.dev_board_lane_queue where lane = 'todo';
  if ticket_count <> member_count then
    raise exception 'dev_board lane queue backfill count mismatch: tickets %, members %', ticket_count, member_count;
  end if;
end
$backfill$;

create or replace function public.dev_board_assert_todo_queue_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare org_id uuid;
declare ws_id uuid;
declare ticket_id uuid;
declare ticket_is_todo boolean;
declare membership_count bigint;
begin
  -- Constraint triggers must not become silent no-ops when invoked by the app role
  -- outside tenant context: SECURITY DEFINER defeats RLS blindness, and this guard
  -- keeps an absent context fail-closed rather than inspecting every tenant.
  if app.current_org_id() is null then
    raise exception 'dev_board todo queue membership check requires tenant context';
  end if;
  -- The one function services two differently-shaped trigger relations; JSON access avoids
  -- referencing a column absent from one of their NEW/OLD records.
  org_id := coalesce((to_jsonb(new)->>'organization_id')::uuid, (to_jsonb(old)->>'organization_id')::uuid);
  ws_id := coalesce((to_jsonb(new)->>'workspace_id')::uuid, (to_jsonb(old)->>'workspace_id')::uuid);
  ticket_id := coalesce(
    (to_jsonb(new)->>'id')::uuid,
    (to_jsonb(new)->>'dev_ticket_id')::uuid,
    (to_jsonb(old)->>'id')::uuid,
    (to_jsonb(old)->>'dev_ticket_id')::uuid
  );
  select lane = 'todo' into ticket_is_todo
  from public.dev_board_dev_ticket
  where organization_id = org_id and workspace_id = ws_id and id = ticket_id;
  select count(*) into membership_count
  from public.dev_board_lane_queue
  where organization_id = org_id and workspace_id = ws_id and dev_ticket_id = ticket_id and lane = 'todo';
  if coalesce(ticket_is_todo, false) <> (membership_count = 1) then
    raise exception 'Todo DevTicket and Todo queue membership must be exactly one-to-one';
  end if;
  return null;
end
$fn$;

alter function public.dev_board_assert_todo_queue_membership() owner to opzava_owner;

create constraint trigger dev_board_dev_ticket_todo_queue_membership_check
after insert or update of lane or delete on public.dev_board_dev_ticket
deferrable initially deferred
for each row execute function public.dev_board_assert_todo_queue_membership();

create constraint trigger dev_board_lane_queue_todo_membership_check
after insert or update of lane, dev_ticket_id or delete on public.dev_board_lane_queue
deferrable initially deferred
for each row execute function public.dev_board_assert_todo_queue_membership();

alter table public.dev_board_dev_ticket drop column todo_rank;
drop index if exists public.dev_board_dev_ticket_org_workspace_lane_rank_idx;

alter table public.dev_board_lane_queue_version owner to opzava_owner;
alter table public.dev_board_lane_queue owner to opzava_owner;

grant select, insert, update on table public.dev_board_lane_queue_version to opzava_app;
grant select, insert, update, delete on table public.dev_board_lane_queue to opzava_app;

alter table public.dev_board_lane_queue_version enable row level security;
alter table public.dev_board_lane_queue_version force row level security;
alter table public.dev_board_lane_queue enable row level security;
alter table public.dev_board_lane_queue force row level security;

do $policies$
declare table_name text;
begin
  foreach table_name in array array[
    'dev_board_lane_queue_version',
    'dev_board_lane_queue'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_isolation', table_name);
    execute format(
      'create policy %I on public.%I as permissive for all to opzava_app using (organization_id = app.current_org_id()) with check (organization_id = app.current_org_id())',
      table_name || '_tenant_isolation', table_name
    );
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_context_required', table_name);
    execute format(
      'create policy %I on public.%I as restrictive for all to opzava_app using (app.current_org_id() is not null) with check (app.current_org_id() is not null)',
      table_name || '_tenant_context_required', table_name
    );
    execute format('drop policy if exists %I on public.%I', table_name || '_owner_admin', table_name);
    execute format(
      'create policy %I on public.%I as permissive for all to opzava_owner using (true) with check (true)',
      table_name || '_owner_admin', table_name
    );
  end loop;
end
$policies$;
