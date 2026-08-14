-- Issue #335: append-only audit floor for rejected legacy Task terminal transitions.
-- This table deliberately stores only bounded classification fields: never task bodies,
-- confirmation nonce values, credentials, or other secret-bearing command content.

set lock_timeout = '3s';
set statement_timeout = '30s';

create table if not exists public.task_terminal_transition_attempt (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid references public.workspaces(id) on delete restrict,
  surface text not null,
  attempted_action text not null,
  target_task_id uuid,
  actor_user_id text references public.auth_users(id) on delete restrict,
  hard_reason text not null,
  nonce_confirmation_id uuid,
  detail jsonb,
  created_at timestamptz not null default now(),
  constraint task_terminal_transition_attempt_surface_check
    check (surface = any (array['web','runtime_control_tool','mcp','other']::text[])),
  constraint task_terminal_transition_attempt_action_check
    check (attempted_action = any (array['create','move','mark_done']::text[])),
  constraint task_terminal_transition_attempt_reason_check
    check (hard_reason = any (array[
      'create_with_terminal_status',
      'terminal_transition_requires_governed_admission',
      'attestation_invalid',
      'attestation_principal_mismatch',
      'nonce_not_found',
      'nonce_expired',
      'nonce_conflict',
      'nonce_bound_to_other_task',
      'nonce_scope_mismatch',
      'review_missing',
      'review_scope_mismatch',
      'review_not_approved'
    ]::text[]))
);

create index if not exists task_terminal_transition_attempt_org_created_idx
  on public.task_terminal_transition_attempt (organization_id, created_at desc);

alter table public.task_terminal_transition_attempt owner to opzava_owner;

-- Append-only: the app role can inspect and append its tenant's audit facts, but never alter them.
grant select, insert on table public.task_terminal_transition_attempt to opzava_app;
revoke update, delete on table public.task_terminal_transition_attempt from public, opzava_app;

alter table public.task_terminal_transition_attempt enable row level security;
alter table public.task_terminal_transition_attempt force row level security;

drop policy if exists task_terminal_transition_attempt_tenant_isolation
  on public.task_terminal_transition_attempt;
create policy task_terminal_transition_attempt_tenant_isolation
  on public.task_terminal_transition_attempt
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists task_terminal_transition_attempt_tenant_context_required
  on public.task_terminal_transition_attempt;
create policy task_terminal_transition_attempt_tenant_context_required
  on public.task_terminal_transition_attempt
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists task_terminal_transition_attempt_owner_admin
  on public.task_terminal_transition_attempt;
create policy task_terminal_transition_attempt_owner_admin
  on public.task_terminal_transition_attempt
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);
