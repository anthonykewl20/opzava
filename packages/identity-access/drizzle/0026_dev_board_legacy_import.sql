-- TB-01b-8: immutable legacy Task import aliases and historical records.
set lock_timeout = '3s';
set statement_timeout = '30s';

create table public.dev_board_historical_record (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null,
  record_class text not null check (record_class = 'legacy_historical'),
  source_kind text not null check (source_kind = 'legacy_task'),
  source_table_row_identity uuid not null,
  completion_gate text check (completion_gate is null or completion_gate in ('legacy_unverified', 'reconciled_historical')),
  source_disposition text not null check (source_disposition in ('promoted_backlog', 'quarantined_no_owner', 'historical_candidate')),
  source_epoch text,
  source_recorded_at timestamptz not null,
  source_updated_at timestamptz not null,
  imported_at timestamptz not null default now(),
  preserved_payload_digest text not null check (preserved_payload_digest ~ '^[a-f0-9]{64}$'),
  evidence_refs jsonb not null default '[]'::jsonb,
  promotion_command_id uuid,
  -- Required by dev_board_activity_event.aggregate_version.
  version integer not null default 1 check (version > 0),
  constraint dev_board_historical_record_workspace_organization_fk foreign key (workspace_id, organization_id) references public.workspaces(id, organization_id) on delete restrict,
  constraint dev_board_historical_record_id_organization_id_unique unique (id, organization_id),
  constraint dev_board_historical_record_promotion_command_organization_fk foreign key (promotion_command_id, organization_id) references public.dev_board_command_receipt(command_id, organization_id) on delete restrict
);
create index dev_board_historical_record_org_workspace_imported_idx on public.dev_board_historical_record (organization_id, workspace_id, imported_at desc, id);

create table public.dev_board_legacy_task_alias (
  organization_id uuid not null,
  workspace_id uuid not null,
  legacy_task_id uuid not null,
  legacy_card_number bigint not null,
  dev_ticket_id uuid,
  historical_record_id uuid not null,
  created_command_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, legacy_task_id),
  constraint dev_board_legacy_task_alias_workspace_organization_fk foreign key (workspace_id, organization_id) references public.workspaces(id, organization_id) on delete restrict,
  constraint dev_board_legacy_task_alias_ticket_organization_fk foreign key (dev_ticket_id, organization_id) references public.dev_board_dev_ticket(id, organization_id) on delete restrict,
  constraint dev_board_legacy_task_alias_historical_organization_fk foreign key (historical_record_id, organization_id) references public.dev_board_historical_record(id, organization_id) on delete restrict,
  constraint dev_board_legacy_task_alias_created_command_organization_fk foreign key (created_command_id, organization_id) references public.dev_board_command_receipt(command_id, organization_id) on delete restrict
);
create index dev_board_legacy_task_alias_org_historical_idx on public.dev_board_legacy_task_alias (organization_id, historical_record_id);

alter table public.dev_board_historical_record owner to opzava_owner;
alter table public.dev_board_legacy_task_alias owner to opzava_owner;
grant select, insert, update on table public.dev_board_historical_record to opzava_app;
grant select, insert, update on table public.dev_board_legacy_task_alias to opzava_app;
alter table public.dev_board_historical_record enable row level security;
alter table public.dev_board_historical_record force row level security;
alter table public.dev_board_legacy_task_alias enable row level security;
alter table public.dev_board_legacy_task_alias force row level security;
do $policies$
declare table_name text;
begin
  foreach table_name in array array['dev_board_historical_record', 'dev_board_legacy_task_alias'] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_isolation', table_name);
    execute format('create policy %I on public.%I as permissive for all to opzava_app using (organization_id = app.current_org_id()) with check (organization_id = app.current_org_id())', table_name || '_tenant_isolation', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_context_required', table_name);
    execute format('create policy %I on public.%I as restrictive for all to opzava_app using (app.current_org_id() is not null) with check (app.current_org_id() is not null)', table_name || '_tenant_context_required', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_owner_admin', table_name);
    execute format('create policy %I on public.%I as permissive for all to opzava_owner using (true) with check (true)', table_name || '_owner_admin', table_name);
  end loop;
end
$policies$;
