-- Issue #305 / TB-01a: Dev Board command-spine four-ledger persistence skeleton.
-- Authoritative DDL: consensus-terra design review (ADR-017-conformant). RLS/grant/policy
-- pattern mirrors 0018_platform_doctor_scan.sql verbatim.
set lock_timeout = '3s';
set statement_timeout = '30s';

-- workspaces has only an `id` PK; add an idempotent composite (id, organization_id) unique index
-- so the workspace-bound composite foreign keys below are valid (defense-in-depth org binding).
create unique index if not exists workspaces_id_organization_id_unique
  on public.workspaces (id, organization_id);

create table if not exists public.dev_board_command_receipt (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null,
  command_id uuid not null default gen_random_uuid(),
  command_name text not null,
  idempotency_key text not null,
  request_hash text not null,
  target_aggregate_id uuid not null,
  actor_kind text not null,
  actor_stable_id text not null,
  actor_role text not null,
  source_kind text not null,
  source_ref text not null,
  authorization_version bigint not null,
  correlation_id uuid not null,
  causation_id uuid,
  expected_versions jsonb not null default '[]'::jsonb,
  state text not null default 'reserved',
  outcome_code text,
  result_ref uuid,
  result_summary jsonb not null default '{}'::jsonb,
  resulting_versions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint dev_board_command_receipt_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces(id, organization_id)
    on delete restrict,
  constraint dev_board_command_receipt_id_organization_id_unique
    unique (id, organization_id),
  constraint dev_board_command_receipt_command_id_organization_id_unique
    unique (command_id, organization_id),
  constraint dev_board_command_receipt_command_name_check
    check (char_length(btrim(command_name)) between 1 and 128),
  constraint dev_board_command_receipt_idempotency_key_check
    check (
      char_length(btrim(idempotency_key)) > 0
      and char_length(btrim(idempotency_key)) <= 160
    ),
  constraint dev_board_command_receipt_request_hash_check
    check (request_hash ~ '^[a-f0-9]{64}$'),
  constraint dev_board_command_receipt_actor_check
    check (
      char_length(btrim(actor_kind)) between 1 and 64
      and char_length(btrim(actor_stable_id)) between 1 and 256
      and char_length(btrim(actor_role)) between 1 and 128
    ),
  constraint dev_board_command_receipt_source_check
    check (
      char_length(btrim(source_kind)) between 1 and 64
      and char_length(btrim(source_ref)) between 1 and 256
    ),
  constraint dev_board_command_receipt_authorization_version_check
    check (authorization_version > 0),
  constraint dev_board_command_receipt_expected_versions_check
    check (jsonb_typeof(expected_versions) = 'array'),
  constraint dev_board_command_receipt_result_summary_check
    check (jsonb_typeof(result_summary) = 'object'),
  constraint dev_board_command_receipt_resulting_versions_check
    check (jsonb_typeof(resulting_versions) = 'array'),
  constraint dev_board_command_receipt_state_check
    check (state = any (array['reserved', 'accepted', 'rejected']::text[])),
  constraint dev_board_command_receipt_finalization_check
    check (
      (state = 'reserved' and finalized_at is null and outcome_code is null and result_ref is null)
      or
      (state in ('accepted', 'rejected') and finalized_at is not null)
    )
);

create unique index if not exists dev_board_command_receipt_idempotency_unique
  on public.dev_board_command_receipt
  (organization_id, workspace_id, command_name, idempotency_key);

create index if not exists dev_board_command_receipt_org_workspace_created_idx
  on public.dev_board_command_receipt
  (organization_id, workspace_id, created_at desc, id desc);

create index if not exists dev_board_command_receipt_org_command_idx
  on public.dev_board_command_receipt
  (organization_id, command_id);


create table if not exists public.dev_board_planning_decision_entry (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null,
  entry_sequence bigint not null,
  command_id uuid not null,
  aggregate_id uuid not null,
  entry_kind text not null,
  subject text not null,
  content_hash text not null,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint dev_board_planning_decision_entry_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces(id, organization_id)
    on delete restrict,
  constraint dev_board_planning_decision_entry_command_organization_fk
    foreign key (command_id, organization_id)
    references public.dev_board_command_receipt(command_id, organization_id)
    on delete restrict,
  constraint dev_board_planning_decision_entry_id_organization_id_unique
    unique (id, organization_id),
  constraint dev_board_planning_decision_entry_sequence_unique
    unique (organization_id, workspace_id, entry_sequence),
  constraint dev_board_planning_decision_entry_sequence_check
    check (entry_sequence > 0),
  constraint dev_board_planning_decision_entry_kind_check
    check (char_length(btrim(entry_kind)) between 1 and 128),
  constraint dev_board_planning_decision_entry_subject_check
    check (char_length(btrim(subject)) between 1 and 512),
  constraint dev_board_planning_decision_entry_content_hash_check
    check (content_hash ~ '^[a-f0-9]{64}$'),
  constraint dev_board_planning_decision_entry_content_check
    check (jsonb_typeof(content) = 'object')
);

create index if not exists dev_board_planning_decision_entry_org_workspace_aggregate_idx
  on public.dev_board_planning_decision_entry
  (organization_id, workspace_id, aggregate_id, created_at desc, id desc);

create index if not exists dev_board_planning_decision_entry_org_command_idx
  on public.dev_board_planning_decision_entry
  (organization_id, command_id);


create table if not exists public.dev_board_runner_execution_observation (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null,
  runner_id uuid not null,
  lease_id uuid not null,
  fence_token bigint not null,
  command_id uuid not null,
  command_nonce uuid not null,
  receipt_sequence bigint not null,
  observation_kind text not null,
  observed_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  envelope_hash text not null,
  signature_algorithm text not null,
  signing_key_ref text not null,
  signature bytea not null,
  normalized_observation jsonb not null default '{}'::jsonb,
  constraint dev_board_runner_execution_observation_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces(id, organization_id)
    on delete restrict,
  constraint dev_board_runner_execution_observation_command_organization_fk
    foreign key (command_id, organization_id)
    references public.dev_board_command_receipt(command_id, organization_id)
    on delete restrict,
  constraint dev_board_runner_execution_observation_id_organization_id_unique
    unique (id, organization_id),
  constraint dev_board_runner_execution_observation_receipt_unique
    unique (organization_id, workspace_id, runner_id, lease_id, receipt_sequence),
  constraint dev_board_runner_execution_observation_fence_token_check
    check (fence_token > 0),
  constraint dev_board_runner_execution_observation_receipt_sequence_check
    check (receipt_sequence > 0),
  constraint dev_board_runner_execution_observation_kind_check
    check (char_length(btrim(observation_kind)) between 1 and 128),
  constraint dev_board_runner_execution_observation_envelope_hash_check
    check (envelope_hash ~ '^[a-f0-9]{64}$'),
  constraint dev_board_runner_execution_observation_signature_algorithm_check
    check (char_length(btrim(signature_algorithm)) between 1 and 128),
  constraint dev_board_runner_execution_observation_signing_key_ref_check
    check (char_length(btrim(signing_key_ref)) between 1 and 256),
  constraint dev_board_runner_execution_observation_signature_check
    check (octet_length(signature) > 0),
  constraint dev_board_runner_execution_observation_payload_check
    check (jsonb_typeof(normalized_observation) = 'object')
);

create index if not exists dev_board_runner_execution_observation_org_workspace_lease_idx
  on public.dev_board_runner_execution_observation
  (organization_id, workspace_id, lease_id, receipt_sequence);

create index if not exists dev_board_runner_execution_observation_org_command_idx
  on public.dev_board_runner_execution_observation
  (organization_id, command_id);


create table if not exists public.dev_board_activity_event (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null,
  event_sequence bigint not null,
  aggregate_id uuid not null,
  aggregate_version bigint not null,
  event_name text not null,
  command_id uuid not null,
  idempotency_key text not null,
  planning_decision_entry_id uuid,
  runner_execution_observation_id uuid,
  actor_kind text not null,
  actor_stable_id text not null,
  actor_role text not null,
  source_kind text not null,
  source_ref text not null,
  authorization_version bigint not null,
  correlation_id uuid not null,
  causation_id uuid,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  constraint dev_board_activity_event_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces(id, organization_id)
    on delete restrict,
  constraint dev_board_activity_event_command_organization_fk
    foreign key (command_id, organization_id)
    references public.dev_board_command_receipt(command_id, organization_id)
    on delete restrict,
  constraint dev_board_activity_event_planning_entry_organization_fk
    foreign key (planning_decision_entry_id, organization_id)
    references public.dev_board_planning_decision_entry(id, organization_id)
    on delete restrict,
  constraint dev_board_activity_event_runner_observation_organization_fk
    foreign key (runner_execution_observation_id, organization_id)
    references public.dev_board_runner_execution_observation(id, organization_id)
    on delete restrict,
  constraint dev_board_activity_event_id_organization_id_unique
    unique (id, organization_id),
  constraint dev_board_activity_event_sequence_unique
    unique (organization_id, workspace_id, event_sequence),
  constraint dev_board_activity_event_aggregate_version_unique
    unique (organization_id, workspace_id, aggregate_id, aggregate_version),
  constraint dev_board_activity_event_sequence_check
    check (event_sequence > 0),
  constraint dev_board_activity_event_aggregate_version_check
    check (aggregate_version > 0),
  constraint dev_board_activity_event_name_check
    check (char_length(btrim(event_name)) between 1 and 128),
  constraint dev_board_activity_event_idempotency_key_check
    check (
      char_length(btrim(idempotency_key)) > 0
      and char_length(btrim(idempotency_key)) <= 160
    ),
  constraint dev_board_activity_event_actor_check
    check (
      char_length(btrim(actor_kind)) between 1 and 64
      and char_length(btrim(actor_stable_id)) between 1 and 256
      and char_length(btrim(actor_role)) between 1 and 128
    ),
  constraint dev_board_activity_event_source_check
    check (
      char_length(btrim(source_kind)) between 1 and 64
      and char_length(btrim(source_ref)) between 1 and 256
    ),
  constraint dev_board_activity_event_authorization_version_check
    check (authorization_version > 0),
  constraint dev_board_activity_event_payload_check
    check (jsonb_typeof(payload) = 'object')
);

create index if not exists dev_board_activity_event_org_workspace_aggregate_idx
  on public.dev_board_activity_event
  (organization_id, workspace_id, aggregate_id, aggregate_version);

create index if not exists dev_board_activity_event_org_workspace_recorded_idx
  on public.dev_board_activity_event
  (organization_id, workspace_id, recorded_at desc, id desc);

create index if not exists dev_board_activity_event_org_command_idx
  on public.dev_board_activity_event
  (organization_id, command_id);


create table if not exists public.dev_board_sync_outbox_intent (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null,
  intent_sequence bigint not null,
  activity_event_id uuid not null,
  provider_kind text not null,
  intent_kind text not null,
  target_aggregate_id uuid not null,
  target_aggregate_version bigint not null,
  correlation_id uuid not null,
  dedupe_key text not null,
  payload jsonb not null default '{}'::jsonb,
  state text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  claim_token uuid,
  event_id uuid,
  last_error_code text,
  last_error_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dev_board_sync_outbox_intent_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces(id, organization_id)
    on delete restrict,
  constraint dev_board_sync_outbox_intent_activity_event_organization_fk
    foreign key (activity_event_id, organization_id)
    references public.dev_board_activity_event(id, organization_id)
    on delete restrict,
  constraint dev_board_sync_outbox_intent_id_organization_id_unique
    unique (id, organization_id),
  constraint dev_board_sync_outbox_intent_sequence_unique
    unique (organization_id, workspace_id, intent_sequence),
  constraint dev_board_sync_outbox_intent_dedupe_unique
    unique (organization_id, workspace_id, provider_kind, dedupe_key),
  constraint dev_board_sync_outbox_intent_sequence_check
    check (intent_sequence > 0),
  constraint dev_board_sync_outbox_intent_provider_kind_check
    check (char_length(btrim(provider_kind)) between 1 and 64),
  constraint dev_board_sync_outbox_intent_kind_check
    check (char_length(btrim(intent_kind)) between 1 and 128),
  constraint dev_board_sync_outbox_intent_aggregate_version_check
    check (target_aggregate_version > 0),
  constraint dev_board_sync_outbox_intent_dedupe_key_check
    check (char_length(btrim(dedupe_key)) between 1 and 256),
  constraint dev_board_sync_outbox_intent_payload_check
    check (jsonb_typeof(payload) = 'object'),
  constraint dev_board_sync_outbox_intent_state_check
    check (state = any (array['pending', 'processing', 'sent', 'failed', 'dead']::text[])),
  constraint dev_board_sync_outbox_intent_attempts_check
    check (attempts >= 0),
  constraint dev_board_sync_outbox_intent_claim_check
    check (
      (state = 'processing' and claimed_at is not null and claim_token is not null and event_id is not null)
      or
      (state <> 'processing' and (claimed_at is null or claim_token is not null))
    ),
  constraint dev_board_sync_outbox_intent_sent_check
    check (
      (state = 'sent' and sent_at is not null)
      or
      (state <> 'sent')
    )
);

create index if not exists dev_board_sync_outbox_intent_pending_idx
  on public.dev_board_sync_outbox_intent
  (organization_id, workspace_id, next_attempt_at)
  where state in ('pending', 'failed', 'processing');

create index if not exists dev_board_sync_outbox_intent_processing_claimed_idx
  on public.dev_board_sync_outbox_intent
  (organization_id, workspace_id, claimed_at)
  where state = 'processing';

create index if not exists dev_board_sync_outbox_intent_org_activity_event_idx
  on public.dev_board_sync_outbox_intent
  (organization_id, activity_event_id);


create table if not exists public.dev_board_sync_provider_delivery (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null,
  delivery_sequence bigint not null,
  provider_kind text not null,
  provider_delivery_id text not null,
  event_name text not null,
  outbox_intent_id uuid,
  correlation_id uuid,
  payload_hash text not null,
  normalized_fact jsonb not null default '{}'::jsonb,
  disposition text not null,
  received_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint dev_board_sync_provider_delivery_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces(id, organization_id)
    on delete restrict,
  constraint dev_board_sync_provider_delivery_outbox_intent_organization_fk
    foreign key (outbox_intent_id, organization_id)
    references public.dev_board_sync_outbox_intent(id, organization_id)
    on delete restrict,
  constraint dev_board_sync_provider_delivery_id_organization_id_unique
    unique (id, organization_id),
  constraint dev_board_sync_provider_delivery_sequence_unique
    unique (organization_id, workspace_id, delivery_sequence),
  constraint dev_board_sync_provider_delivery_provider_dedupe_unique
    unique (organization_id, workspace_id, provider_kind, provider_delivery_id),
  constraint dev_board_sync_provider_delivery_sequence_check
    check (delivery_sequence > 0),
  constraint dev_board_sync_provider_delivery_provider_kind_check
    check (char_length(btrim(provider_kind)) between 1 and 64),
  constraint dev_board_sync_provider_delivery_provider_delivery_id_check
    check (char_length(btrim(provider_delivery_id)) between 1 and 256),
  constraint dev_board_sync_provider_delivery_event_name_check
    check (char_length(btrim(event_name)) between 1 and 128),
  constraint dev_board_sync_provider_delivery_payload_hash_check
    check (payload_hash ~ '^[a-f0-9]{64}$'),
  constraint dev_board_sync_provider_delivery_fact_check
    check (jsonb_typeof(normalized_fact) = 'object'),
  constraint dev_board_sync_provider_delivery_disposition_check
    check (char_length(btrim(disposition)) between 1 and 128)
);

create index if not exists dev_board_sync_provider_delivery_org_workspace_recorded_idx
  on public.dev_board_sync_provider_delivery
  (organization_id, workspace_id, recorded_at desc, id desc);

create index if not exists dev_board_sync_provider_delivery_org_outbox_intent_idx
  on public.dev_board_sync_provider_delivery
  (organization_id, outbox_intent_id);


create table if not exists public.dev_board_sync_conflict (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null,
  conflict_sequence bigint not null,
  conflict_id uuid not null,
  conflict_version bigint not null,
  conflict_kind text not null,
  target_aggregate_id uuid not null,
  target_aggregate_version bigint not null,
  field_key text not null,
  base_value_hash text,
  opzava_value_hash text not null,
  provider_value_hash text not null,
  selected_value_hash text,
  command_receipt_id uuid,
  activity_event_id uuid,
  provider_delivery_id uuid,
  outbox_intent_id uuid,
  detail jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now(),
  constraint dev_board_sync_conflict_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces(id, organization_id)
    on delete restrict,
  constraint dev_board_sync_conflict_command_receipt_organization_fk
    foreign key (command_receipt_id, organization_id)
    references public.dev_board_command_receipt(id, organization_id)
    on delete restrict,
  constraint dev_board_sync_conflict_activity_event_organization_fk
    foreign key (activity_event_id, organization_id)
    references public.dev_board_activity_event(id, organization_id)
    on delete restrict,
  constraint dev_board_sync_conflict_provider_delivery_organization_fk
    foreign key (provider_delivery_id, organization_id)
    references public.dev_board_sync_provider_delivery(id, organization_id)
    on delete restrict,
  constraint dev_board_sync_conflict_outbox_intent_organization_fk
    foreign key (outbox_intent_id, organization_id)
    references public.dev_board_sync_outbox_intent(id, organization_id)
    on delete restrict,
  constraint dev_board_sync_conflict_id_organization_id_unique
    unique (id, organization_id),
  constraint dev_board_sync_conflict_sequence_unique
    unique (organization_id, workspace_id, conflict_sequence),
  constraint dev_board_sync_conflict_version_unique
    unique (organization_id, workspace_id, conflict_id, conflict_version),
  constraint dev_board_sync_conflict_sequence_check
    check (conflict_sequence > 0),
  constraint dev_board_sync_conflict_version_check
    check (conflict_version > 0),
  constraint dev_board_sync_conflict_kind_check
    check (
      conflict_kind = any (
        array[
          'detected',
          'resolution_selected',
          'resolution_pending_mirror',
          'resolved',
          'reopened'
        ]::text[]
      )
    ),
  constraint dev_board_sync_conflict_aggregate_version_check
    check (target_aggregate_version > 0),
  constraint dev_board_sync_conflict_field_key_check
    check (char_length(btrim(field_key)) between 1 and 256),
  constraint dev_board_sync_conflict_hashes_check
    check (
      (base_value_hash is null or base_value_hash ~ '^[a-f0-9]{64}$')
      and opzava_value_hash ~ '^[a-f0-9]{64}$'
      and provider_value_hash ~ '^[a-f0-9]{64}$'
      and (selected_value_hash is null or selected_value_hash ~ '^[a-f0-9]{64}$')
    ),
  constraint dev_board_sync_conflict_detail_check
    check (jsonb_typeof(detail) = 'object')
);

create index if not exists dev_board_sync_conflict_org_workspace_aggregate_idx
  on public.dev_board_sync_conflict
  (organization_id, workspace_id, target_aggregate_id, target_aggregate_version);

create index if not exists dev_board_sync_conflict_org_workspace_open_idx
  on public.dev_board_sync_conflict
  (organization_id, workspace_id, recorded_at desc, id desc)
  where conflict_kind in ('detected', 'resolution_selected', 'resolution_pending_mirror');


alter table public.dev_board_command_receipt owner to opzava_owner;
alter table public.dev_board_planning_decision_entry owner to opzava_owner;
alter table public.dev_board_activity_event owner to opzava_owner;
alter table public.dev_board_runner_execution_observation owner to opzava_owner;
alter table public.dev_board_sync_outbox_intent owner to opzava_owner;
alter table public.dev_board_sync_provider_delivery owner to opzava_owner;
alter table public.dev_board_sync_conflict owner to opzava_owner;

grant select, insert, update on table public.dev_board_command_receipt to opzava_app;
grant select, insert on table public.dev_board_planning_decision_entry to opzava_app;
grant select, insert on table public.dev_board_activity_event to opzava_app;
grant select, insert on table public.dev_board_runner_execution_observation to opzava_app;
grant select, insert, update on table public.dev_board_sync_outbox_intent to opzava_app;
grant select, insert on table public.dev_board_sync_provider_delivery to opzava_app;
grant select, insert on table public.dev_board_sync_conflict to opzava_app;

alter table public.dev_board_command_receipt enable row level security;
alter table public.dev_board_command_receipt force row level security;
alter table public.dev_board_planning_decision_entry enable row level security;
alter table public.dev_board_planning_decision_entry force row level security;
alter table public.dev_board_activity_event enable row level security;
alter table public.dev_board_activity_event force row level security;
alter table public.dev_board_runner_execution_observation enable row level security;
alter table public.dev_board_runner_execution_observation force row level security;
alter table public.dev_board_sync_outbox_intent enable row level security;
alter table public.dev_board_sync_outbox_intent force row level security;
alter table public.dev_board_sync_provider_delivery enable row level security;
alter table public.dev_board_sync_provider_delivery force row level security;
alter table public.dev_board_sync_conflict enable row level security;
alter table public.dev_board_sync_conflict force row level security;

do $policies$
declare table_name text;
begin
  foreach table_name in array array[
    'dev_board_command_receipt',
    'dev_board_planning_decision_entry',
    'dev_board_activity_event',
    'dev_board_runner_execution_observation',
    'dev_board_sync_outbox_intent',
    'dev_board_sync_provider_delivery',
    'dev_board_sync_conflict'
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
