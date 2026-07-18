-- Issue #192: append-only compliance audit for connections/provider model governance.
-- Two tables: an immutable secret-free config-version history, and the append-only audit
-- event log that points at it. Audit rows model state-transition events (intent x transition);
-- there is no idempotency key and no inline diff. Append-only is enforced at the table
-- privilege level (select, insert only) in addition to RLS, so upsert is impossible (#192 3a).

set lock_timeout = '3s';
set statement_timeout = '30s';

create table if not exists public.governance_config_version (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  target_kind text not null,
  target_ref text not null,
  version_hash text,
  content jsonb not null,
  created_at timestamptz not null default now(),
  constraint governance_config_version_target_kind_check
    check (target_kind = any (array['model_provider','orchestrator','github_connection','gateway_config']::text[])),
  constraint governance_config_version_version_hash_check
    check (version_hash is null or version_hash ~ '^[a-f0-9]{64}$'),
  constraint governance_config_version_target_ref_nonempty_check
    check (char_length(btrim(target_ref)) > 0)
);

create index if not exists governance_config_version_org_target_idx
  on public.governance_config_version (organization_id, target_kind, target_ref, created_at);

create table if not exists public.governance_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid references public.workspaces(id) on delete restrict,
  intent text not null,
  transition text not null,
  target_kind text not null,
  target_ref text not null,
  actor_id text not null,
  actor_type text not null,
  triggered_by_actor_id text,
  triggered_by_action text,
  correlation_id text,
  config_version_id uuid references public.governance_config_version(id) on delete set null,
  authorization_decision text,
  policy_decision text,
  entitlement_decision text,
  result text not null,
  result_code text,
  result_message text,
  recorded_at timestamptz not null default now(),
  constraint governance_audit_intent_check
    check (intent = any (array['provider_connected','provider_disconnected','provider_model_toggled','orchestrator_set','orchestrator_delegation_applied','orchestrator_reconciled','github_connected','github_disconnected','gateway_config_pruned']::text[])),
  constraint governance_audit_transition_check
    check (transition = any (array['requested','completed','failed','cancelled']::text[])),
  constraint governance_audit_target_kind_check
    check (target_kind = any (array['model_provider','orchestrator','github_connection','gateway_config']::text[])),
  constraint governance_audit_actor_type_check
    check (actor_type = any (array['user','system','service']::text[])),
  constraint governance_audit_result_check
    check (result = any (array['success','failure','pending','unknown']::text[])),
  constraint governance_audit_actor_nonempty_check
    check (char_length(btrim(actor_id)) > 0),
  constraint governance_audit_target_ref_nonempty_check
    check (char_length(btrim(target_ref)) > 0),
  constraint governance_audit_trigger_shape_check
    check (
      (triggered_by_actor_id is null and triggered_by_action is null)
      or
      (triggered_by_actor_id is not null and triggered_by_action is not null)
    )
);

create index if not exists governance_audit_org_recorded_idx
  on public.governance_audit (organization_id, recorded_at);

create index if not exists governance_audit_org_intent_target_idx
  on public.governance_audit (organization_id, intent, target_kind, target_ref);

alter table public.governance_config_version owner to opzava_owner;
alter table public.governance_audit owner to opzava_owner;

-- Append-only: the app role may read and insert audit rows but never update or delete them.
grant select, insert on table public.governance_config_version to opzava_app;
grant select, insert on table public.governance_audit to opzava_app;

alter table public.governance_config_version enable row level security;
alter table public.governance_config_version force row level security;
alter table public.governance_audit enable row level security;
alter table public.governance_audit force row level security;

drop policy if exists governance_config_version_tenant_isolation
  on public.governance_config_version;
create policy governance_config_version_tenant_isolation
  on public.governance_config_version
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists governance_config_version_tenant_context_required
  on public.governance_config_version;
create policy governance_config_version_tenant_context_required
  on public.governance_config_version
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists governance_config_version_owner_admin
  on public.governance_config_version;
create policy governance_config_version_owner_admin
  on public.governance_config_version
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);

drop policy if exists governance_audit_tenant_isolation
  on public.governance_audit;
create policy governance_audit_tenant_isolation
  on public.governance_audit
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists governance_audit_tenant_context_required
  on public.governance_audit;
create policy governance_audit_tenant_context_required
  on public.governance_audit
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists governance_audit_owner_admin
  on public.governance_audit;
create policy governance_audit_owner_admin
  on public.governance_audit
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);
