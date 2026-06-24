import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * DOC-1 governance gate: P3-6 (PTY session affinity in-process) and P3-7
 * (gateway passive-heartbeat hole) are intentionally deferred production-review
 * findings — NOT code defects to fix now. They stay recorded as deferred with
 * their calibration until an escalation precondition materializes:
 *   - P3-6: multi-instance deploy (horizontal scale)
 *   - P3-7: gateway `ping` method removal
 *
 * Acceptance (per docs/architecture/production-completion-spec.md:171):
 *   "Intentionally deferred; DOC-1 verifies they stay recorded. Escalate only on
 *    multi-instance deploy (P3-6) or gateway ping removal (P3-7)."
 *
 * This gate prevents regression in both directions: silently deleting the
 * deferred entries (losing the rationale + escalation trigger), or inflating
 * them into duplicate remediation tasks (re-doing deferred work).
 */

const reviewPath = fileURLToPath(
  new URL('../docs/architecture/realtime-chat-production-review.md', import.meta.url),
);

test('DOC-1: P3-6 PTY session-affinity finding stays recorded as deferred with rationale', async () => {
  const review = await readFile(reviewPath, 'utf8');

  // The entry must exist and retain its core calibration: it is a documented
  // unsatisfied prerequisite (not a code bug), escalated only on multi-instance.
  assert.match(
    review,
    /P3-6\.[^\n]*PTY session affinity[^\n]*in-process/,
    'P3-6 PTY session-affinity entry is missing from the production review (DOC-1).',
  );
  assert.match(
    review,
    /P3-6\.[^\n]*Documented as an unsatisfied prerequisite[^\n]*not a code bug/,
    'P3-6 must retain its "documented prerequisite, not a code bug" calibration (DOC-1).',
  );
  assert.match(
    review,
    /P3-6\.[^\n]*multi-instance/,
    'P3-6 must state the multi-instance escalation precondition (DOC-1).',
  );
});

test('DOC-1: P3-7 gateway passive-heartbeat finding stays recorded as deferred with rationale', async () => {
  const review = await readFile(reviewPath, 'utf8');

  assert.match(
    review,
    /P3-7\.[^\n]*[Gg]ateway[^\n]*passive-heartbeat/,
    'P3-7 gateway passive-heartbeat entry is missing from the production review (DOC-1).',
  );
  assert.match(
    review,
    /P3-7\.[^\n]*degraded liveness detection/,
    'P3-7 must retain its "degraded liveness detection" calibration (DOC-1).',
  );
  assert.match(
    review,
    /P3-7\.[^\n]*[Ii]nternal to the gateway control socket[^\n]*not chat delivery/,
    'P3-7 must retain its scope calibration — gateway control socket, not chat delivery (DOC-1).',
  );
});

test('DOC-1: P3-6/P3-7 appear exactly once (no duplicate deferred entries)', async () => {
  const review = await readFile(reviewPath, 'utf8');

  const p36 = (review.match(/P3-6/g) ?? []).length;
  const p37 = (review.match(/P3-7/g) ?? []).length;
  assert.equal(
    p36,
    1,
    `P3-6 appears ${p36}x in the review — expected exactly 1 (no duplication).`,
  );
  assert.equal(
    p37,
    1,
    `P3-7 appears ${p37}x in the review — expected exactly 1 (no duplication).`,
  );
});
