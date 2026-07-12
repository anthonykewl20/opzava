-- S1c typed evidence and quality review extensions.
-- evidence_type is orthogonal to task_evidence.kind storage shape.

set lock_timeout = '3s';
set statement_timeout = '30s';

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'task_evidence_type'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.task_evidence_type as enum (
      'screenshot',
      'e2e',
      'smoke',
      'real_world',
      'mutation',
      'verify_deep',
      'pr'
    );
  end if;
end
$$;

alter table public.task_evidence
  add column if not exists evidence_type public.task_evidence_type;

alter table public.task_quality_review
  add column if not exists reviewer_orchestrator_identity_id uuid,
  add column if not exists required_note text,
  add column if not exists rerun_refs text[] not null default '{}'::text[],
  add column if not exists screenshot_verification_refs text[] not null default '{}'::text[];
