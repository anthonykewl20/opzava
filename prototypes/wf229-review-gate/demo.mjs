#!/usr/bin/env node

const STACK_ID = 'local-shared-stack';
const PASS = 'Pass';
const CHANGES_REQUESTED = 'Changes Requested';
const AUTH_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MERGE_TARGET = Object.freeze({
  repo: 'local-repo',
  ref: 'main',
  mergeId: 'merge-main',
});

let clockMs = Date.parse('2026-07-18T08:00:00.000Z');
let harnessSeq = 1;
let leaseSeq = 1;
const stackLeases = new Map();

function now() {
  return new Date(clockMs).toISOString();
}

function nowMs() {
  return clockMs;
}

function tick() {
  const ts = now();
  clockMs += 1000;
  return ts;
}

function makeId(prefix, n) {
  return `${prefix}-${String(n).padStart(2, '0')}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeMergeTarget(mergeTarget) {
  return {
    repo: mergeTarget?.repo ?? DEFAULT_MERGE_TARGET.repo,
    ref: mergeTarget?.ref ?? DEFAULT_MERGE_TARGET.ref,
    mergeId: mergeTarget?.mergeId ?? DEFAULT_MERGE_TARGET.mergeId,
  };
}

function mergeTargetsMatch(a, b) {
  return a.repo === b.repo && a.ref === b.ref && a.mergeId === b.mergeId;
}

function acquireStackLease(stackId, harnessId, attemptId) {
  const current = stackLeases.get(stackId);
  if (current && current.active) {
    return {
      ok: false,
      hardReason: 'lease-busy',
      holderHarnessId: current.holderHarnessId,
      holderAttemptId: current.holderAttemptId,
    };
  }

  const leaseToken = `lease-${leaseSeq++}`;
  stackLeases.set(stackId, {
    stackId,
    holderHarnessId: harnessId,
    holderAttemptId: attemptId,
    leaseToken,
    active: true,
    acquiredAt: tick(),
  });

  return { ok: true, leaseToken };
}

function releaseStackLease(stackId, harnessId, attemptId, leaseToken) {
  const current = stackLeases.get(stackId);
  if (!current || !current.active) {
    return { ok: false, hardReason: 'lease-missing' };
  }
  if (current.holderHarnessId !== harnessId || current.holderAttemptId !== attemptId) {
    return { ok: false, hardReason: 'lease-not-owned' };
  }
  if (current.leaseToken !== leaseToken) {
    return { ok: false, hardReason: 'lease-token-mismatch' };
  }

  current.active = false;
  current.holderHarnessId = null;
  current.holderAttemptId = null;
  current.releasedAt = tick();
  return { ok: true };
}

function createHarness() {
  const harnessId = `harness-${harnessSeq++}`;
  const stackId = STACK_ID;
  const candidates = new Map();
  const attempts = new Map();
  const evidencePackages = new Map();
  const mergeAuths = new Map();
  const traces = [];
  let activeCandidateId = null;
  let candidateSeq = 1;
  let attemptSeq = 1;
  let evidenceSeq = 1;
  let authSeq = 1;

  function log(event, payload = {}) {
    traces.push({
      ts: tick(),
      event,
      ...payload,
    });
  }

  function freezeCandidate({ contractVersion, sha, executionAssigneeId }) {
    const generation = candidateSeq;
    const candidateId = makeId('candidate', candidateSeq++);
    const candidate = {
      id: candidateId,
      contractVersion,
      sha,
      executionAssigneeId,
      generation,
      cardStatus: 'todo',
      frozenAt: tick(),
    };
    candidates.set(candidateId, clone(candidate));
    activeCandidateId = candidateId;
    log('candidate-frozen', { candidateId, contractVersion, sha });
    return clone(candidate);
  }

  function promoteCurrentCandidate(candidateId) {
    const candidate = candidates.get(candidateId);
    if (!candidate) {
      return { ok: false, hardReason: 'candidate-not-found' };
    }
    const previous = activeCandidateId ? candidates.get(activeCandidateId) : null;
    if (previous && candidate.generation < previous.generation) {
      return { ok: false, hardReason: 'historical-rollback' };
    }
    const previousId = activeCandidateId;
    activeCandidateId = candidateId;
    log('candidate-promoted', { previousId, activeId: candidateId });
    return { ok: true };
  }

  function getCurrentCandidate() {
    return activeCandidateId ? clone(candidates.get(activeCandidateId) ?? null) : null;
  }

  function checkAttemptRunning(attempt) {
    if (!attempt) {
      return { ok: false, hardReason: 'attempt-not-found', decision: 'REJECTED' };
    }
    if (attempt.status !== 'running') {
      return { ok: false, hardReason: 'attempt-not-running', decision: 'REJECTED' };
    }
    return { ok: true };
  }

  function checkAttemptAvailability(attempt) {
    if (!attempt.reviewerAvailable) {
      return { ok: false, hardReason: 'reviewer-unavailable', decision: 'FAIL_CLOSED' };
    }
    if (!attempt.runnerAvailable) {
      return { ok: false, hardReason: 'runner-unavailable', decision: 'FAIL_CLOSED' };
    }
    return { ok: true };
  }

  function closeAttempt(attemptId, hardReason, decision = 'REJECTED') {
    const attempt = attempts.get(attemptId);
    if (!attempt || attempt.status !== 'running') {
      return;
    }
    attempt.status = 'closed';
    attempt.finalizedAt = tick();
    releaseLease(attempt.id);
    log('attempt-closed', { attemptId, hardReason, decision });
  }

  function submitReviewAttempt({ candidateId, reviewerId, reviewerAvailable = true, runnerAvailable = true }) {
    const candidate = candidates.get(candidateId);
    if (!candidate) {
      return { ok: false, hardReason: 'candidate-not-found' };
    }
    if (candidate.id !== activeCandidateId) {
      return { ok: false, decision: 'REJECTED', hardReason: 'candidate-superseded' };
    }
    if (!reviewerAvailable) {
      log('attempt-blocked', { candidateId, reviewerId, reason: 'reviewer-unavailable' });
      return { ok: false, decision: 'FAIL_CLOSED', hardReason: 'reviewer-unavailable' };
    }
    if (!runnerAvailable) {
      log('attempt-blocked', { candidateId, reviewerId, reason: 'runner-unavailable' });
      return { ok: false, decision: 'FAIL_CLOSED', hardReason: 'runner-unavailable' };
    }
    if (reviewerId === candidate.executionAssigneeId) {
      log('attempt-rejected', { candidateId, reviewerId, reason: 'self-review-forbidden' });
      return { ok: false, decision: 'REJECTED', hardReason: 'self-review-forbidden' };
    }

    const lease = acquireStackLease(stackId, harnessId, `pending-${nowMs()}`);
    if (!lease.ok) {
      log('attempt-queued', {
        candidateId,
        reviewerId,
        reason: 'lease-busy',
        holderAttemptId: stackLeases.get(stackId)?.holderAttemptId,
        stackId,
      });
      return {
        ok: false,
        decision: 'QUEUED',
        hardReason: 'lease-busy',
        holderAttemptId: stackLeases.get(stackId)?.holderAttemptId,
      };
    }

    const attempt = {
      id: `attempt-${makeId('a', attemptSeq++)}`,
      candidateId,
      reviewerId,
      status: 'running',
      decision: null,
      reviewerAvailable,
      runnerAvailable,
      attemptSnapshot: {
        candidateId,
        contractVersion: candidate.contractVersion,
        sha: candidate.sha,
      },
      evidenceId: null,
      exitContainmentProof: null,
      startedAt: tick(),
      leaseToken: lease.leaseToken,
    };
    attempts.set(attempt.id, attempt);
    const held = stackLeases.get(stackId);
    held.holderAttemptId = attempt.id;
    candidate.cardStatus = 'review';
    log('attempt-started', { attemptId: attempt.id, candidateId, reviewerId, stackId });
    return { ok: true, attempt: clone(attempt) };
  }

  function bindEvidence({ attemptId, contractVersion, sha }) {
    const attempt = attempts.get(attemptId);
    const running = checkAttemptRunning(attempt);
    if (!running.ok) {
      return running;
    }
    const availability = checkAttemptAvailability(attempt);
    if (!availability.ok) {
      return {
        ok: false,
        decision: availability.decision,
        hardReason: availability.hardReason,
      };
    }
    const candidate = candidates.get(attempt.candidateId);
    if (!candidate) {
      return { ok: false, hardReason: 'candidate-not-found' };
    }
    if (attempt.candidateId !== activeCandidateId) {
      closeAttempt(attempt.id, 'candidate-superseded');
      return { ok: false, hardReason: 'candidate-superseded', decision: 'REJECTED' };
    }
    if (attempt.evidenceId) {
      return {
        ok: false,
        decision: 'REJECTED',
        hardReason: 'evidence-already-bound',
      };
    }
    if (candidate.contractVersion !== contractVersion || candidate.sha !== sha) {
      return { ok: false, hardReason: 'evidence-mismatch', decision: 'REJECTED' };
    }
    const evidence = {
      id: `evidence-${makeId('e', evidenceSeq++)}`,
      attemptId,
      candidateId: attempt.candidateId,
      contractVersion,
      sha,
      boundAt: tick(),
    };
    evidencePackages.set(evidence.id, evidence);
    attempt.evidenceId = evidence.id;
    log('evidence-bound', { attemptId, evidenceId: evidence.id, contractVersion, sha });
    return { ok: true, evidence: clone(evidence) };
  }

  function evaluateReview(attemptId, decision) {
    const attempt = attempts.get(attemptId);
    const running = checkAttemptRunning(attempt);
    if (!running.ok) {
      return running;
    }
    const availability = checkAttemptAvailability(attempt);
    if (!availability.ok) {
      return {
        ok: false,
        decision: availability.decision,
        hardReason: availability.hardReason,
      };
    }
    const candidate = candidates.get(attempt.candidateId);
    if (!candidate) {
      return { ok: false, hardReason: 'candidate-not-found', decision: 'REJECTED' };
    }
    const current = candidates.get(activeCandidateId);
    const evidence = attempt.evidenceId ? evidencePackages.get(attempt.evidenceId) : null;

    if (attempt.candidateId !== activeCandidateId) {
      return { ok: false, hardReason: 'candidate-superseded', decision: 'REJECTED' };
    }

    if (decision === CHANGES_REQUESTED) {
      attempt.decision = CHANGES_REQUESTED;
      attempt.exitContainmentProof = {
        kind: 'review-exit-containment',
        kindVersion: 1,
        contractVersion: candidate.contractVersion,
        sha: candidate.sha,
        generatedAt: tick(),
      };
      candidate.cardStatus = 'todo';
      log('review-decision', {
        attemptId,
        decision: CHANGES_REQUESTED,
        candidateId: candidate.id,
      });
      return { ok: true, decision: CHANGES_REQUESTED, attempt: clone(attempt) };
    }

    if (decision === PASS) {
      if (!evidence) {
        return { ok: false, decision: 'REJECTED', hardReason: 'evidence-missing' };
      }
      if (evidence.attemptId !== attempt.id || evidence.candidateId !== attempt.candidateId) {
        return { ok: false, decision: 'REJECTED', hardReason: 'evidence-rebinding' };
      }
      if (!current || current.id !== attempt.candidateId) {
        return { ok: false, decision: 'REJECTED', hardReason: 'candidate-superseded' };
      }
      if (
        evidence.contractVersion !== current.contractVersion ||
        evidence.sha !== current.sha ||
        attempt.attemptSnapshot.contractVersion !== current.contractVersion ||
        attempt.attemptSnapshot.sha !== current.sha
      ) {
        log('review-decision', {
          attemptId,
          decision: PASS,
          hardReason: 'evidence-stale',
          evidenceContractVersion: evidence.contractVersion,
          evidenceSha: evidence.sha,
          currentContractVersion: current.contractVersion,
          currentSha: current.sha,
        });
        return { ok: false, decision: 'REJECTED', hardReason: 'evidence-stale' };
      }

      attempt.decision = PASS;
      attempt.exitContainmentProof = {
        kind: 'review-exit-containment',
        kindVersion: 1,
        contractVersion: current.contractVersion,
        sha: current.sha,
        generatedAt: tick(),
      };
      candidate.cardStatus = 'review';
      log('review-decision', { attemptId, decision: PASS });
      return { ok: true, decision: PASS, attempt: clone(attempt) };
    }

    return { ok: false, decision: 'REJECTED', hardReason: 'invalid-decision' };
  }

  function requestMergeAuth(attemptId, mergeTargetOverride) {
    const attempt = attempts.get(attemptId);
    const running = checkAttemptRunning(attempt);
    if (!running.ok) {
      return running;
    }
    const availability = checkAttemptAvailability(attempt);
    if (!availability.ok) {
      return {
        ok: false,
        decision: availability.decision,
        hardReason: availability.hardReason,
      };
    }
    const candidate = candidates.get(attempt.candidateId);
    if (!candidate) {
      return { ok: false, hardReason: 'candidate-not-found' };
    }
    if (attempt.candidateId !== activeCandidateId) {
      return { ok: false, hardReason: 'candidate-superseded', decision: 'REJECTED' };
    }
    if (attempt.decision !== PASS || !attempt.exitContainmentProof) {
      return { ok: false, hardReason: 'review-not-pass' };
    }

    const evidence = attempt.evidenceId ? evidencePackages.get(attempt.evidenceId) : null;
    if (!evidence) {
      return { ok: false, hardReason: 'evidence-missing' };
    }

    const mergeTarget = normalizeMergeTarget(mergeTargetOverride);
    const existing = [...mergeAuths.values()].find(
      (auth) => auth.attemptId === attempt.id && !auth.consumedAt && mergeTargetsMatch(auth.mergeTarget, mergeTarget),
    );
    if (existing) {
      if (existing.expiresAt <= nowMs()) {
        return { ok: false, hardReason: 'merge-auth-expired' };
      }
      log('merge-auth-reused', {
        attemptId: attempt.id,
        mergeAuthId: existing.id,
        contractVersion: existing.contractVersion,
        sha: existing.sha,
      });
      return { ok: true, reused: true, auth: clone(existing) };
    }

    const auth = {
      id: `merge-auth-${makeId('m', authSeq++)}`,
      attemptId,
      candidateId: attempt.candidateId,
      contractVersion: evidence.contractVersion,
      sha: evidence.sha,
      mergeTarget,
      issuedAt: nowMs(),
      expiresAt: nowMs() + AUTH_TTL_MS,
      consumedAt: null,
    };
    mergeAuths.set(auth.id, auth);
    log('merge-auth-issued', {
      attemptId,
      mergeAuthId: auth.id,
      contractVersion: auth.contractVersion,
      sha: auth.sha,
      mergeTarget: auth.mergeTarget,
    });
    return { ok: true, reused: false, auth: clone(auth) };
  }

  function consumeMergeAuth(authId) {
    const auth = mergeAuths.get(authId);
    if (!auth) {
      return { ok: false, hardReason: 'merge-auth-missing' };
    }
    if (auth.consumedAt) {
      return { ok: false, hardReason: 'merge-auth-replayed' };
    }
    auth.consumedAt = nowMs();
    log('merge-auth-consumed', { mergeAuthId: auth.id });
    return { ok: true, auth: clone(auth) };
  }

  function admitDone(attemptId, mergeAuthId, confirmedMerge) {
    const attempt = attempts.get(attemptId);
    if (!attempt) {
      return { ok: false, hardReason: 'attempt-not-found', decision: 'REJECTED' };
    }
    if (attempt.status === 'done') {
      return { ok: false, hardReason: 'already-done', decision: 'REJECTED' };
    }
    const candidate = candidates.get(attempt.candidateId);
    if (!candidate) {
      return { ok: false, hardReason: 'candidate-not-found', decision: 'REJECTED' };
    }

    const availability = checkAttemptAvailability(attempt);
    if (!availability.ok) {
      closeAttempt(attempt.id, availability.hardReason, availability.decision);
      return {
        ok: false,
        decision: availability.decision,
        hardReason: availability.hardReason,
      };
    }

    if (attempt.status === 'closed') {
      return { ok: false, hardReason: 'attempt-not-running', decision: 'REJECTED' };
    }

    if (attempt.candidateId !== activeCandidateId) {
      closeAttempt(attempt.id, 'candidate-superseded');
      return { ok: false, hardReason: 'candidate-superseded', decision: 'REJECTED' };
    }

    if (attempt.decision !== PASS || !attempt.exitContainmentProof) {
      closeAttempt(attempt.id, 'review-not-pass');
      return { ok: false, hardReason: 'review-not-pass', decision: 'REJECTED' };
    }

    if (!confirmedMerge || !confirmedMerge.confirmed) {
      closeAttempt(attempt.id, 'confirmed-merge-missing');
      return { ok: false, hardReason: 'confirmed-merge-missing', decision: 'REJECTED' };
    }

    const confirmedTarget = normalizeMergeTarget(confirmedMerge);
    if (candidate.executionAssigneeId === attempt.reviewerId) {
      closeAttempt(attempt.id, 'reviewer-not-independent');
      return { ok: false, hardReason: 'reviewer-not-independent', decision: 'REJECTED' };
    }

    if (
      confirmedMerge.contractVersion !== candidate.contractVersion ||
      confirmedMerge.sha !== candidate.sha
    ) {
      closeAttempt(attempt.id, 'merge-sha-contract-mismatch');
      return {
        ok: false,
        hardReason: 'merge-sha-contract-mismatch',
        decision: 'REJECTED',
      };
    }

    const auth = mergeAuths.get(mergeAuthId);
    if (!auth) {
      closeAttempt(attempt.id, 'merge-auth-missing');
      return { ok: false, hardReason: 'merge-auth-missing', decision: 'REJECTED' };
    }
    if (auth.attemptId !== attempt.id) {
      closeAttempt(attempt.id, 'merge-auth-purpose-mismatch');
      return { ok: false, hardReason: 'merge-auth-purpose-mismatch', decision: 'REJECTED' };
    }
    if (auth.candidateId !== attempt.candidateId) {
      closeAttempt(attempt.id, 'merge-auth-mismatch');
      return { ok: false, hardReason: 'merge-auth-mismatch', decision: 'REJECTED' };
    }
    if (auth.consumedAt) {
      closeAttempt(attempt.id, 'merge-auth-replayed');
      return { ok: false, hardReason: 'merge-auth-replayed', decision: 'REJECTED' };
    }
    if (auth.expiresAt <= nowMs()) {
      closeAttempt(attempt.id, 'merge-auth-expired');
      return { ok: false, hardReason: 'merge-auth-expired', decision: 'REJECTED' };
    }
    if (!mergeTargetsMatch(auth.mergeTarget, confirmedTarget)) {
      closeAttempt(attempt.id, 'merge-target-mismatch');
      return { ok: false, hardReason: 'merge-target-mismatch', decision: 'REJECTED' };
    }
    if (auth.contractVersion !== candidate.contractVersion || auth.sha !== candidate.sha) {
      closeAttempt(attempt.id, 'merge-auth-mismatch');
      return { ok: false, hardReason: 'merge-auth-mismatch', decision: 'REJECTED' };
    }

    const evidence = attempt.evidenceId ? evidencePackages.get(attempt.evidenceId) : null;
    if (!evidence) {
      closeAttempt(attempt.id, 'evidence-missing');
      return { ok: false, hardReason: 'evidence-missing', decision: 'REJECTED' };
    }
    if (evidence.attemptId !== attempt.id || evidence.candidateId !== attempt.candidateId) {
      closeAttempt(attempt.id, 'evidence-rebinding');
      return { ok: false, hardReason: 'evidence-rebinding', decision: 'REJECTED' };
    }
    if (evidence.contractVersion !== candidate.contractVersion || evidence.sha !== candidate.sha) {
      closeAttempt(attempt.id, 'evidence-mismatch');
      return { ok: false, hardReason: 'evidence-mismatch', decision: 'REJECTED' };
    }

    const consumed = consumeMergeAuth(mergeAuthId);
    if (!consumed.ok) {
      closeAttempt(attempt.id, consumed.hardReason);
      return consumed;
    }

    if (!consumed.auth || !consumed.auth.consumedAt) {
      closeAttempt(attempt.id, 'merge-auth-replayed');
      return { ok: false, hardReason: 'merge-auth-replayed', decision: 'REJECTED' };
    }

    attempt.status = 'done';
    attempt.finalizedAt = tick();
    candidate.cardStatus = 'done';
    releaseLease(attempt.id);
    log('done-admitted', {
      attemptId,
      mergeAuthId,
      contractVersion: candidate.contractVersion,
      sha: candidate.sha,
    });
    return { ok: true, decision: 'DONE', candidate: clone(candidate), auth: consumed.auth };
  }

  function releaseLease(attemptId) {
    const attempt = attempts.get(attemptId);
    if (!attempt) {
      return { ok: false, hardReason: 'attempt-not-found' };
    }
    return releaseStackLease(stackId, harnessId, attemptId, attempt.leaseToken);
  }

  function finalizeAttempt(attemptId) {
    const attempt = attempts.get(attemptId);
    if (!attempt) {
      return { ok: false, hardReason: 'attempt-not-found' };
    }
    attempt.status = 'closed';
    attempt.finalizedAt = tick();
    releaseLease(attemptId);
    log('attempt-finalized', { attemptId, status: attempt.status });
    return { ok: true, attempt: clone(attempt) };
  }

  function setAttemptAvailability(attemptId, { reviewerAvailable, runnerAvailable }) {
    const attempt = attempts.get(attemptId);
    if (!attempt) {
      return { ok: false, hardReason: 'attempt-not-found' };
    }
    if (typeof reviewerAvailable === 'boolean') {
      attempt.reviewerAvailable = reviewerAvailable;
    }
    if (typeof runnerAvailable === 'boolean') {
      attempt.runnerAvailable = runnerAvailable;
    }
    return { ok: true, attempt: clone(attempt) };
  }

  function setCandidateExecutionAssignee(candidateId, executionAssigneeId) {
    const candidate = candidates.get(candidateId);
    if (!candidate) {
      return { ok: false, hardReason: 'candidate-not-found' };
    }
    candidate.executionAssigneeId = executionAssigneeId;
    return { ok: true, candidate: clone(candidate) };
  }

  function advanceClockMs(ms) {
    clockMs += ms;
    return nowMs();
  }

  function snapshot() {
    return {
      activeCandidateId,
      candidates: [...candidates.values()].map((candidate) => clone(candidate)),
      attempts: [...attempts.values()].map((attempt) => clone(attempt)),
      evidencePackages: [...evidencePackages.values()].map((evidence) => clone(evidence)),
      mergeAuths: [...mergeAuths.values()].map((auth) => clone(auth)),
      traces: clone(traces),
      stackLease: clone(stackLeases.get(stackId) || null),
      leaseHolderAttemptId: stackLeases.get(stackId)?.holderAttemptId ?? null,
    };
  }

  return {
    freezeCandidate,
    promoteCurrentCandidate,
    submitReviewAttempt,
    bindEvidence,
    evaluateReview,
    requestMergeAuth,
    consumeMergeAuth,
    admitDone,
    finalizeAttempt,
    getCurrentCandidate,
    setAttemptAvailability,
    setCandidateExecutionAssignee,
    advanceClockMs,
    snapshot,
  };
}

function reportScenario(id, label, pass, details) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${label}`);
  if (!pass) {
    console.log(`  details: ${details}`);
  }
  return pass;
}

function runS1() {
  const sim = createHarness();
  const candidate = sim.freezeCandidate({
    contractVersion: 'rev-001',
    sha: 'abc123',
    executionAssigneeId: 'impl-agent',
  });
  const submit = sim.submitReviewAttempt({ candidateId: candidate.id, reviewerId: 'reviewer-1' });
  const evidence = sim.bindEvidence({
    attemptId: submit.attempt.id,
    contractVersion: candidate.contractVersion,
    sha: candidate.sha,
  });
  const review = sim.evaluateReview(submit.attempt.id, PASS);
  const auth = sim.requestMergeAuth(submit.attempt.id);
  const done = sim.admitDone(submit.attempt.id, auth.auth?.id, {
    confirmed: true,
    contractVersion: candidate.contractVersion,
    sha: candidate.sha,
    ...DEFAULT_MERGE_TARGET,
  });
  const finalCardStatus = sim.snapshot().candidates.find((row) => row.id === candidate.id)?.cardStatus;
  const pass =
    submit.ok &&
    evidence.ok &&
    review.ok &&
    review.decision === PASS &&
    review.attempt.exitContainmentProof &&
    auth.ok &&
    done.ok &&
    done.candidate.cardStatus === 'done' &&
    finalCardStatus === 'done' &&
    done.auth?.consumedAt;
  return reportScenario(
    'S1',
    'Normal pass path admits Done with matching single-use auth and containment',
    pass,
    JSON.stringify({ submit, evidence, review, auth, done, finalCardStatus }),
  );
}

function runS2() {
  const sim = createHarness();
  const candidate = sim.freezeCandidate({
    contractVersion: 'rev-002',
    sha: 'def456',
    executionAssigneeId: 'impl-agent',
  });
  const submit = sim.submitReviewAttempt({ candidateId: candidate.id, reviewerId: 'reviewer-2' });
  const evidence = sim.bindEvidence({
    attemptId: submit.attempt.id,
    contractVersion: candidate.contractVersion,
    sha: candidate.sha,
  });
  const review = sim.evaluateReview(submit.attempt.id, CHANGES_REQUESTED);
  const auth = sim.requestMergeAuth(submit.attempt.id);
  const done = sim.admitDone(submit.attempt.id, 'missing-auth', {
    confirmed: true,
    contractVersion: candidate.contractVersion,
    sha: candidate.sha,
    ...DEFAULT_MERGE_TARGET,
  });
  const finalCardStatus = sim.snapshot().candidates.find((row) => row.id === candidate.id)?.cardStatus;
  const pass =
    submit.ok &&
    evidence.ok &&
    review.ok &&
    review.decision === CHANGES_REQUESTED &&
    auth.hardReason === 'review-not-pass' &&
    finalCardStatus === 'todo' &&
    done.hardReason === 'review-not-pass';
  return reportScenario(
    'S2',
    'Changes Requested moves card back to Todo and never Done',
    pass,
    JSON.stringify({ submit, evidence, review, auth, done, finalCardStatus }),
  );
}

function runS3() {
  const sim = createHarness();
  const candidate = sim.freezeCandidate({
    contractVersion: 'rev-003',
    sha: 'c0ffee',
    executionAssigneeId: 'reviewer-3',
  });
  const submit = sim.submitReviewAttempt({ candidateId: candidate.id, reviewerId: 'reviewer-3' });
  const pass = submit.decision === 'REJECTED' && submit.hardReason === 'self-review-forbidden';
  return reportScenario('S3', 'Reviewer independence rejects self-review', pass, JSON.stringify({ submit }));
}

function runS4() {
  const sim = createHarness();
  const old = sim.freezeCandidate({
    contractVersion: 'rev-004',
    sha: 'old-sha',
    executionAssigneeId: 'impl-agent',
  });
  const submit = sim.submitReviewAttempt({ candidateId: old.id, reviewerId: 'reviewer-4' });
  const evidence = sim.bindEvidence({
    attemptId: submit.attempt.id,
    contractVersion: old.contractVersion,
    sha: old.sha,
  });

  const updated = sim.freezeCandidate({
    contractVersion: 'rev-005',
    sha: 'new-sha',
    executionAssigneeId: 'impl-agent',
  });
  sim.promoteCurrentCandidate(updated.id);

  const review = sim.evaluateReview(submit.attempt.id, PASS);
  const done = sim.admitDone(submit.attempt.id, 'missing-auth', {
    confirmed: true,
    contractVersion: updated.contractVersion,
    sha: updated.sha,
    ...DEFAULT_MERGE_TARGET,
  });
  const pass =
    submit.ok &&
    evidence.ok &&
    !review.ok &&
    (review.hardReason === 'evidence-stale' || review.hardReason === 'candidate-superseded') &&
    (done.hardReason === 'candidate-superseded' || done.hardReason === 'review-not-pass') &&
    sim.snapshot().attempts.find((row) => row.id === submit.attempt.id).decision === null;
  return reportScenario(
    'S4',
    'Stale evidence bound to old contract/sha is invalidated',
    pass,
    JSON.stringify({ old, updated, review, done }),
  );
}

function runS5() {
  const sim = createHarness();
  const candidate = sim.freezeCandidate({
    contractVersion: 'rev-006',
    sha: 'fail-sha',
    executionAssigneeId: 'impl-agent',
  });
  const blockedReviewer = sim.submitReviewAttempt({
    candidateId: candidate.id,
    reviewerId: 'reviewer-5',
    reviewerAvailable: false,
  });
  const blockedRunner = sim.submitReviewAttempt({
    candidateId: candidate.id,
    reviewerId: 'reviewer-5',
    runnerAvailable: false,
  });
  const done = sim.admitDone('missing-attempt', 'missing-auth', {
    confirmed: true,
    contractVersion: candidate.contractVersion,
    sha: candidate.sha,
    ...DEFAULT_MERGE_TARGET,
  });
  const pass =
    blockedReviewer.decision === 'FAIL_CLOSED' &&
    blockedRunner.decision === 'FAIL_CLOSED' &&
    done.hardReason === 'attempt-not-found' &&
    sim.snapshot().candidates.find((row) => row.id === candidate.id)?.cardStatus === 'todo';
  return reportScenario(
    'S5',
    'Fail-closed when reviewer or runner unavailable',
    pass,
    JSON.stringify({ blockedReviewer, blockedRunner, done }),
  );
}

function runS6() {
  const sim = createHarness();
  const candidate = sim.freezeCandidate({
    contractVersion: 'rev-007',
    sha: 'without-auth',
    executionAssigneeId: 'impl-agent',
  });
  const submit = sim.submitReviewAttempt({ candidateId: candidate.id, reviewerId: 'reviewer-7' });
  sim.bindEvidence({
    attemptId: submit.attempt.id,
    contractVersion: candidate.contractVersion,
    sha: candidate.sha,
  });
  sim.evaluateReview(submit.attempt.id, PASS);
  const done = sim.admitDone(submit.attempt.id, 'missing-dispatched-auth', {
    confirmed: true,
    contractVersion: candidate.contractVersion,
    sha: candidate.sha,
    ...DEFAULT_MERGE_TARGET,
  });
  const pass =
    submit.ok &&
    done.hardReason === 'merge-auth-missing' &&
    done.decision === 'REJECTED' &&
    sim.snapshot().candidates.find((row) => row.id === candidate.id)?.cardStatus !== 'done';
  return reportScenario(
    'S6',
    'Done without matching merge authorization is rejected',
    pass,
    JSON.stringify({ submit, done }),
  );
}

function runS7() {
  const sim = createHarness();
  const candidate = sim.freezeCandidate({
    contractVersion: 'rev-008',
    sha: 'lease-a',
    executionAssigneeId: 'impl-agent',
  });
  const active = sim.submitReviewAttempt({ candidateId: candidate.id, reviewerId: 'reviewer-8a' });
  const concurrent = sim.submitReviewAttempt({ candidateId: candidate.id, reviewerId: 'reviewer-8b' });
  const release = sim.finalizeAttempt(active.attempt.id);
  const afterRelease = sim.submitReviewAttempt({ candidateId: candidate.id, reviewerId: 'reviewer-8b' });
  const extraRelease = afterRelease.ok ? sim.finalizeAttempt(afterRelease.attempt.id) : { ok: false, hardReason: 'no-attempt' };
  const pass =
    active.ok &&
    concurrent.decision === 'QUEUED' &&
    concurrent.hardReason === 'lease-busy' &&
    release.ok &&
    afterRelease.ok &&
    extraRelease.ok;
  return reportScenario(
    'S7',
    'Exclusive shared Docker lease rejects concurrent Review attempt',
    pass,
    JSON.stringify({ active, concurrent, release, afterRelease }),
  );
}

function runS8() {
  const sim = createHarness();
  const candidate = sim.freezeCandidate({
    contractVersion: 'rev-009',
    sha: 'replay-sha',
    executionAssigneeId: 'impl-agent',
  });
  const submit = sim.submitReviewAttempt({ candidateId: candidate.id, reviewerId: 'reviewer-9' });
  sim.bindEvidence({
    attemptId: submit.attempt.id,
    contractVersion: candidate.contractVersion,
    sha: candidate.sha,
  });
  sim.evaluateReview(submit.attempt.id, PASS);
  const auth = sim.requestMergeAuth(submit.attempt.id);
  const consumed = sim.consumeMergeAuth(auth.auth.id);
  const replay = sim.admitDone(submit.attempt.id, auth.auth.id, {
    confirmed: true,
    contractVersion: candidate.contractVersion,
    sha: candidate.sha,
    ...DEFAULT_MERGE_TARGET,
  });
  const pass =
    auth.ok &&
    consumed.ok &&
    consumed.auth.consumedAt &&
    replay.hardReason === 'merge-auth-replayed';
  return reportScenario(
    'S8',
    'Consumed merge authorization cannot be replayed',
    pass,
    JSON.stringify({ submit, auth, consumed, replay }),
  );
}

function runS9() {
  const sim = createHarness();
  const oldCandidate = sim.freezeCandidate({
    contractVersion: 'rev-010',
    sha: 'old-010',
    executionAssigneeId: 'impl-agent',
  });
  const oldAttempt = sim.submitReviewAttempt({ candidateId: oldCandidate.id, reviewerId: 'reviewer-10' });
  sim.bindEvidence({
    attemptId: oldAttempt.attempt.id,
    contractVersion: oldCandidate.contractVersion,
    sha: oldCandidate.sha,
  });
  sim.evaluateReview(oldAttempt.attempt.id, PASS);
  const auth = sim.requestMergeAuth(oldAttempt.attempt.id);
  sim.freezeCandidate({
    contractVersion: 'rev-011',
    sha: 'new-011',
    executionAssigneeId: 'impl-agent',
  });
  const done = sim.admitDone(oldAttempt.attempt.id, auth.auth.id, {
    confirmed: true,
    contractVersion: oldCandidate.contractVersion,
    sha: oldCandidate.sha,
    ...DEFAULT_MERGE_TARGET,
  });
  const pass = auth.ok && done.decision === 'REJECTED' && done.hardReason === 'candidate-superseded';
  return reportScenario(
    'S9',
    'Superseded candidate after Pass cannot be admitted Done',
    pass,
    JSON.stringify({ oldCandidate, auth, done }),
  );
}

function runS10() {
  const sim = createHarness();
  const old = sim.freezeCandidate({
    contractVersion: 'rev-012',
    sha: 'old-012',
    executionAssigneeId: 'impl-agent',
  });
  const updated = sim.freezeCandidate({
    contractVersion: 'rev-013',
    sha: 'new-013',
    executionAssigneeId: 'impl-agent',
  });
  const rollback = sim.promoteCurrentCandidate(old.id);
  const pass = rollback.ok === false && rollback.hardReason === 'historical-rollback';
  return reportScenario(
    'S10',
    'Historical rollback candidate promotion is rejected',
    pass,
    JSON.stringify({ old, updated, rollback }),
  );
}

function runS11() {
  const sim = createHarness();
  const candidate = sim.freezeCandidate({
    contractVersion: 'rev-014',
    sha: 'expire-014',
    executionAssigneeId: 'impl-agent',
  });
  const submit = sim.submitReviewAttempt({ candidateId: candidate.id, reviewerId: 'reviewer-11' });
  sim.bindEvidence({
    attemptId: submit.attempt.id,
    contractVersion: candidate.contractVersion,
    sha: candidate.sha,
  });
  sim.evaluateReview(submit.attempt.id, PASS);
  const auth = sim.requestMergeAuth(submit.attempt.id);
  sim.advanceClockMs(AUTH_TTL_MS + 1);
  const done = sim.admitDone(submit.attempt.id, auth.auth.id, {
    confirmed: true,
    contractVersion: candidate.contractVersion,
    sha: candidate.sha,
    ...DEFAULT_MERGE_TARGET,
  });
  const pass = auth.ok && done.decision === 'REJECTED' && done.hardReason === 'merge-auth-expired';
  return reportScenario(
    'S11',
    'Expired merge authorization is rejected at admit',
    pass,
    JSON.stringify({ submit, auth, done }),
  );
}

function runS12() {
  const sim = createHarness();
  const candidate = sim.freezeCandidate({
    contractVersion: 'rev-015',
    sha: 'target-015',
    executionAssigneeId: 'impl-agent',
  });
  const submit = sim.submitReviewAttempt({ candidateId: candidate.id, reviewerId: 'reviewer-12' });
  sim.bindEvidence({
    attemptId: submit.attempt.id,
    contractVersion: candidate.contractVersion,
    sha: candidate.sha,
  });
  sim.evaluateReview(submit.attempt.id, PASS);
  const auth = sim.requestMergeAuth(submit.attempt.id, {
    ...DEFAULT_MERGE_TARGET,
    mergeId: 'target-a',
  });
  const done = sim.admitDone(submit.attempt.id, auth.auth.id, {
    confirmed: true,
    contractVersion: candidate.contractVersion,
    sha: candidate.sha,
    repo: DEFAULT_MERGE_TARGET.repo,
    ref: DEFAULT_MERGE_TARGET.ref,
    mergeId: 'target-b',
  });
  const pass = auth.ok && done.decision === 'REJECTED' && done.hardReason === 'merge-target-mismatch';
  return reportScenario(
    'S12',
    'Different target confirmation is rejected',
    pass,
    JSON.stringify({ submit, auth, done }),
  );
}

function runS13() {
  const sim = createHarness();
  const candidate = sim.freezeCandidate({
    contractVersion: 'rev-016',
    sha: 'rebind-016',
    executionAssigneeId: 'impl-agent',
  });
  const submit = sim.submitReviewAttempt({ candidateId: candidate.id, reviewerId: 'reviewer-13' });
  const firstEvidence = sim.bindEvidence({
    attemptId: submit.attempt.id,
    contractVersion: candidate.contractVersion,
    sha: candidate.sha,
  });
  const secondEvidence = sim.bindEvidence({
    attemptId: submit.attempt.id,
    contractVersion: candidate.contractVersion,
    sha: candidate.sha,
  });
  const pass =
    submit.ok &&
    firstEvidence.ok &&
    secondEvidence.decision === 'REJECTED' &&
    secondEvidence.hardReason === 'evidence-already-bound';
  const release = submit.ok ? sim.finalizeAttempt(submit.attempt.id) : { ok: false, hardReason: 'submit-failed' };
  return reportScenario(
    'S13',
    'Evidence cannot be re-bound once attached to a running attempt',
    pass,
    JSON.stringify({ submit, firstEvidence, secondEvidence, release }),
  );
}

function runS14() {
  const sim = createHarness();
  const candidate = sim.freezeCandidate({
    contractVersion: 'rev-017',
    sha: 'mutate-017',
    executionAssigneeId: 'impl-agent',
  });
  const submit = sim.submitReviewAttempt({ candidateId: candidate.id, reviewerId: 'reviewer-14' });
  const snapshot = sim.snapshot();
  if (snapshot.candidates[0]) {
    snapshot.candidates[0].executionAssigneeId = 'reviewer-14';
    snapshot.candidates[0].cardStatus = 'done';
  }
  if (snapshot.attempts[0]) {
    snapshot.attempts[0].decision = PASS;
  }
  const liveAfterCloneMutate = sim.getCurrentCandidate()?.executionAssigneeId === 'impl-agent';
  sim.bindEvidence({
    attemptId: submit.attempt.id,
    contractVersion: candidate.contractVersion,
    sha: candidate.sha,
  });
  sim.evaluateReview(submit.attempt.id, PASS);
  const auth = sim.requestMergeAuth(submit.attempt.id);
  sim.setCandidateExecutionAssignee(candidate.id, 'reviewer-14');
  const done = sim.admitDone(submit.attempt.id, auth.auth.id, {
    confirmed: true,
    contractVersion: candidate.contractVersion,
    sha: candidate.sha,
    ...DEFAULT_MERGE_TARGET,
  });
  const pass =
    liveAfterCloneMutate &&
    done.decision === 'REJECTED' &&
    done.hardReason === 'reviewer-not-independent';
  return reportScenario(
    'S14',
    'Snapshot clones are isolated and reviewer independence is rechecked at Done',
    pass,
    JSON.stringify({ submit, done, snapshot }),
  );
}

function runS15() {
  const simA = createHarness();
  const simB = createHarness();
  const candidateA = simA.freezeCandidate({
    contractVersion: 'rev-018',
    sha: 'lease-018-a',
    executionAssigneeId: 'impl-agent',
  });
  const candidateB = simB.freezeCandidate({
    contractVersion: 'rev-018',
    sha: 'lease-018-b',
    executionAssigneeId: 'impl-agent',
  });
  const active = simA.submitReviewAttempt({ candidateId: candidateA.id, reviewerId: 'reviewer-15a' });
  const blocked = simB.submitReviewAttempt({ candidateId: candidateB.id, reviewerId: 'reviewer-15b' });
  const release = simA.finalizeAttempt(active.attempt.id);
  const afterRelease = simB.submitReviewAttempt({ candidateId: candidateB.id, reviewerId: 'reviewer-15b' });
  const extraRelease = afterRelease.ok ? simB.finalizeAttempt(afterRelease.attempt.id) : { ok: false, hardReason: 'no-attempt' };
  const pass =
    active.ok &&
    blocked.decision === 'QUEUED' &&
    blocked.hardReason === 'lease-busy' &&
    release.ok &&
    afterRelease.ok &&
    extraRelease.ok;
  return reportScenario(
    'S15',
    'Two harness instances on shared stack cannot both hold lease',
    pass,
    JSON.stringify({ active, blocked, release, afterRelease }),
  );
}

function runS16() {
  const sim = createHarness();
  const candidate = sim.freezeCandidate({
    contractVersion: 'rev-019',
    sha: 'late-unavail-019',
    executionAssigneeId: 'impl-agent',
  });
  const submit = sim.submitReviewAttempt({ candidateId: candidate.id, reviewerId: 'reviewer-16' });
  sim.bindEvidence({
    attemptId: submit.attempt.id,
    contractVersion: candidate.contractVersion,
    sha: candidate.sha,
  });
  sim.evaluateReview(submit.attempt.id, PASS);
  const auth = sim.requestMergeAuth(submit.attempt.id);
  const unavailable = sim.setAttemptAvailability(submit.attempt.id, { runnerAvailable: false });
  const done = sim.admitDone(submit.attempt.id, auth.auth.id, {
    confirmed: true,
    contractVersion: candidate.contractVersion,
    sha: candidate.sha,
    ...DEFAULT_MERGE_TARGET,
  });
  const pass =
    submit.ok &&
    unavailable.ok &&
    done.decision === 'FAIL_CLOSED' &&
    done.hardReason === 'runner-unavailable';
  return reportScenario(
    'S16',
    'Late unavailability at Done causes fail-closed admission',
    pass,
    JSON.stringify({ submit, unavailable, done }),
  );
}

function main() {
  const scenarioResults = [
    runS1(),
    runS2(),
    runS3(),
    runS4(),
    runS5(),
    runS6(),
    runS7(),
    runS8(),
    runS9(),
    runS10(),
    runS11(),
    runS12(),
    runS13(),
    runS14(),
    runS15(),
    runS16(),
  ];
  const allPass = scenarioResults.every(Boolean);
  console.log(`\nSCENARIO_SUMMARY=${allPass ? 'PASS' : 'FAIL'}`);
  if (!allPass) {
    process.exitCode = 1;
  }
}

main();
