-- TB-01b-7: reversible Dev Board archive provenance.  Archive is an overlay;
-- the live lane rests at Backlog and the prior lane is retained separately.
set lock_timeout = '3s';
set statement_timeout = '30s';

alter table public.dev_board_dev_ticket
  add column last_active_lane text check (last_active_lane is null or last_active_lane in ('backlog', 'todo', 'blocked', 'in_progress', 'review', 'done')),
  -- Deliberately no membership FK: immutable archive provenance must survive a later departure.
  add column archived_by_user_id text,
  add column archived_reason text check (archived_reason is null or (length(btrim(archived_reason)) between 1 and 4000));

alter table public.dev_board_proposal
  -- Deliberately no membership FK: immutable archive provenance must survive a later departure.
  add column archived_by_user_id text,
  add column archived_reason text check (archived_reason is null or (length(btrim(archived_reason)) between 1 and 4000));
