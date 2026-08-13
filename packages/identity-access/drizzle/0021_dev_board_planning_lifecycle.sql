-- TB-01b-2: Dev Board planning lifecycle state tables.
-- The Todo lane has no queue table in this slice; ranks are allocated per workspace until the
-- ReorderTodo/full-anchor slice introduces the authoritative queue representation.
set lock_timeout = '3s';
set statement_timeout = '30s';

create table if not exists public.dev_board_proposal (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null,
  version bigint not null default 1 check (version > 0),
  lifecycle_state text not null check (lifecycle_state in ('draft', 'awaiting_decision', 'accepted', 'merged', 'rejected')),
  archived_at timestamptz,
  discovery_summary text not null check (char_length(btrim(discovery_summary)) between 1 and 4000),
  blocking_assessment text not null check (blocking_assessment in ('blocking', 'non_blocking')),
  suggested_contract jsonb not null default '{}'::jsonb check (jsonb_typeof(suggested_contract) = 'object'),
  created_command_id uuid not null,
  accepted_command_id uuid,
  accepted_dev_ticket_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dev_board_proposal_workspace_organization_fk foreign key (workspace_id, organization_id) references public.workspaces(id, organization_id) on delete restrict,
  constraint dev_board_proposal_id_organization_id_unique unique (id, organization_id),
  constraint dev_board_proposal_organization_workspace_id_unique unique (organization_id, workspace_id, id),
  constraint dev_board_proposal_created_command_organization_fk foreign key (created_command_id, organization_id) references public.dev_board_command_receipt(command_id, organization_id) on delete restrict,
  constraint dev_board_proposal_accepted_command_organization_fk foreign key (accepted_command_id, organization_id) references public.dev_board_command_receipt(command_id, organization_id) on delete restrict,
  constraint dev_board_proposal_accepted_ticket_check check ((lifecycle_state = 'accepted' and accepted_dev_ticket_id is not null) or (lifecycle_state <> 'accepted' and accepted_dev_ticket_id is null))
);

create index if not exists dev_board_proposal_org_workspace_updated_idx on public.dev_board_proposal (organization_id, workspace_id, updated_at desc, id desc);
create index if not exists dev_board_proposal_org_accepted_ticket_idx on public.dev_board_proposal (organization_id, accepted_dev_ticket_id);

create table if not exists public.dev_board_dev_ticket (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null,
  version bigint not null default 1 check (version > 0),
  origin_kind text not null check (origin_kind in ('proposal', 'direct', 'legacy')),
  source_proposal_id uuid,
  lane text not null default 'backlog' check (lane in ('backlog', 'todo', 'blocked', 'in_progress', 'review', 'done')),
  archived_at timestamptz,
  human_owner_user_id text not null,
  ready_contract_version bigint not null default 1 check (ready_contract_version > 0),
  ready_contract_content jsonb not null default '{}'::jsonb check (jsonb_typeof(ready_contract_content) = 'object'),
  ready_contract_content_hash text not null check (ready_contract_content_hash ~ '^[a-f0-9]{64}$'),
  ready_state text not null default 'draft' check (ready_state in ('draft', 'approved')),
  ready_approval_contract_version bigint,
  ready_approval_content_hash text check (ready_approval_content_hash is null or ready_approval_content_hash ~ '^[a-f0-9]{64}$'),
  ready_approved_by_user_id text,
  ready_approved_at timestamptz,
  ready_approval_command_id uuid,
  todo_rank bigint,
  created_command_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dev_board_dev_ticket_workspace_organization_fk foreign key (workspace_id, organization_id) references public.workspaces(id, organization_id) on delete restrict,
  constraint dev_board_dev_ticket_id_organization_id_unique unique (id, organization_id),
  constraint dev_board_dev_ticket_organization_workspace_id_unique unique (organization_id, workspace_id, id),
  constraint dev_board_dev_ticket_source_proposal_unique unique (organization_id, source_proposal_id),
  constraint dev_board_dev_ticket_source_proposal_workspace_fk foreign key (source_proposal_id, organization_id, workspace_id) references public.dev_board_proposal(id, organization_id, workspace_id) on delete restrict,
  constraint dev_board_dev_ticket_human_owner_membership_fk foreign key (organization_id, human_owner_user_id) references public.memberships(organization_id, user_id) on delete restrict,
  constraint dev_board_dev_ticket_created_command_organization_fk foreign key (created_command_id, organization_id) references public.dev_board_command_receipt(command_id, organization_id) on delete restrict,
  constraint dev_board_dev_ticket_ready_approval_command_organization_fk foreign key (ready_approval_command_id, organization_id) references public.dev_board_command_receipt(command_id, organization_id) on delete restrict,
  constraint dev_board_dev_ticket_origin_source_check check ((origin_kind = 'proposal' and source_proposal_id is not null) or origin_kind <> 'proposal'),
  constraint dev_board_dev_ticket_approval_binding_check check ((ready_state = 'draft' and ready_approval_contract_version is null and ready_approval_content_hash is null and ready_approval_command_id is null) or (ready_state = 'approved' and ready_approval_contract_version is not null and ready_approval_content_hash is not null and ready_approval_command_id is not null)),
  constraint dev_board_dev_ticket_lane_ready_check check (lane = 'backlog' or (lane in ('todo', 'blocked', 'in_progress', 'review', 'done') and ready_state = 'approved')),
  constraint dev_board_dev_ticket_approval_current_head_check check (ready_state = 'draft' or (ready_state = 'approved' and ready_approval_contract_version = ready_contract_version and ready_approval_content_hash = ready_contract_content_hash))
);

alter table public.dev_board_proposal add constraint dev_board_proposal_accepted_ticket_organization_fk foreign key (accepted_dev_ticket_id, organization_id) references public.dev_board_dev_ticket(id, organization_id) on delete no action deferrable initially deferred;

create index if not exists dev_board_dev_ticket_org_workspace_lane_rank_idx on public.dev_board_dev_ticket (organization_id, workspace_id, lane, todo_rank, created_at, id);
create index if not exists dev_board_dev_ticket_org_source_proposal_idx on public.dev_board_dev_ticket (organization_id, source_proposal_id);
create index if not exists dev_board_dev_ticket_org_human_owner_idx on public.dev_board_dev_ticket (organization_id, human_owner_user_id);

create table if not exists public.dev_board_dependency_edge (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null,
  version bigint not null default 1 check (version > 0),
  dependent_dev_ticket_id uuid not null,
  blocker_dev_ticket_id uuid not null,
  lifecycle_state text not null default 'active' check (lifecycle_state in ('active', 'retired')),
  created_command_id uuid not null,
  retired_command_id uuid,
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  constraint dev_board_dependency_edge_workspace_organization_fk foreign key (workspace_id, organization_id) references public.workspaces(id, organization_id) on delete restrict,
  constraint dev_board_dependency_edge_id_organization_id_unique unique (id, organization_id),
  constraint dev_board_dependency_edge_dependent_ticket_fk foreign key (dependent_dev_ticket_id, organization_id, workspace_id) references public.dev_board_dev_ticket(id, organization_id, workspace_id) on delete restrict,
  constraint dev_board_dependency_edge_blocker_ticket_fk foreign key (blocker_dev_ticket_id, organization_id, workspace_id) references public.dev_board_dev_ticket(id, organization_id, workspace_id) on delete restrict,
  constraint dev_board_dependency_edge_created_command_organization_fk foreign key (created_command_id, organization_id) references public.dev_board_command_receipt(command_id, organization_id) on delete restrict,
  constraint dev_board_dependency_edge_retired_command_organization_fk foreign key (retired_command_id, organization_id) references public.dev_board_command_receipt(command_id, organization_id) on delete restrict,
  constraint dev_board_dependency_edge_distinct_tickets_check check (dependent_dev_ticket_id <> blocker_dev_ticket_id)
);

create unique index if not exists dev_board_dependency_edge_active_pair_unique on public.dev_board_dependency_edge (organization_id, dependent_dev_ticket_id, blocker_dev_ticket_id) where lifecycle_state = 'active';
create index if not exists dev_board_dependency_edge_active_dependent_idx on public.dev_board_dependency_edge (organization_id, dependent_dev_ticket_id) where lifecycle_state = 'active';
create index if not exists dev_board_dependency_edge_active_blocker_idx on public.dev_board_dependency_edge (organization_id, blocker_dev_ticket_id) where lifecycle_state = 'active';

alter table public.dev_board_proposal owner to opzava_owner;
alter table public.dev_board_dev_ticket owner to opzava_owner;
alter table public.dev_board_dependency_edge owner to opzava_owner;

grant select, insert, update on table public.dev_board_proposal to opzava_app;
grant select, insert, update on table public.dev_board_dev_ticket to opzava_app;
grant select, insert, update on table public.dev_board_dependency_edge to opzava_app;

alter table public.dev_board_proposal enable row level security;
alter table public.dev_board_proposal force row level security;
alter table public.dev_board_dev_ticket enable row level security;
alter table public.dev_board_dev_ticket force row level security;
alter table public.dev_board_dependency_edge enable row level security;
alter table public.dev_board_dependency_edge force row level security;

do $policies$
declare table_name text;
begin
  foreach table_name in array array[
    'dev_board_proposal',
    'dev_board_dev_ticket',
    'dev_board_dependency_edge'
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
