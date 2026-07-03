-- Slice 2.5 tracked-follow-up correction: drop the board-position unique index.
-- The unique index on (workspace_id, status, position) from 0010 broke reorder:
-- moveTask/reorderSteps set an ABSOLUTE position in a single UPDATE with no
-- make-room sibling shift, so moving an item to an already-occupied slot raises
-- a unique violation (23505). Position stays a best-effort display order (the
-- rare concurrent-create duplicate is a nondeterministic tie-break only, no data
-- loss, resolved on the next reorder). The idempotency-key indexes from 0010 are
-- kept. Append-only per the content-hash migration gate.

set lock_timeout = '3s';

drop index if exists public.tasks_workspace_status_position_unique;
