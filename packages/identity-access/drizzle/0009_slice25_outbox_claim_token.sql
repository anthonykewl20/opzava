-- Slice 2.5 issue close outbox claim-token fencing.
-- The token fences stale finalizers after a processing row is reclaimed.

set lock_timeout = '3s';
set statement_timeout = '30s';

alter table public.issue_close_outbox
  add column if not exists claim_token uuid;
