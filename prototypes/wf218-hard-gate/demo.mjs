#!/usr/bin/env node

const TERMINAL_STATUS = 'done';
const REVIEW_STATUS = 'review';
const VALID_STATUSES = new Set(['todo', 'in_progress', REVIEW_STATUS, 'blocked', TERMINAL_STATUS]);
const REQUIRED_DONE_PROOFS = [
  ['readyApproval', 'ready-approval-absent'],
  ['reviewExitContainmentProof', 'review-proof-absent'],
  ['mergeAuthorization', 'merge-authorization-absent'],
  ['mergedIntoDevelopment', 'merge-unconfirmed'],
];

const tasks = new Map();
const confirmTokens = new Map();
const activityLedger = [];
const securityLog = [];
let taskSequence = 1;
let tokenSequence = 1;
let clockMs = Date.parse('2026-07-18T08:00:00.000Z');

function now() {
  return new Date(clockMs).toISOString();
}

function advanceClock(milliseconds) {
  clockMs += milliseconds;
}

function makeTask({ title, status = 'todo' }) {
  if (!VALID_STATUSES.has(status)) {
    throw new Error(`invalid task status: ${status}`);
  }
  return { id: String(taskSequence++), title, status };
}

function addTask(input) {
  const task = makeTask(input);
  tasks.set(task.id, task);
  return task;
}

function makeActor(adminId) {
  return { kind: 'admin', adminId };
}

function makeSystemActor(id = 'dev-board-admission') {
  return { kind: 'system', id };
}

function actingPrincipal(actor) {
  return actor?.adminId ?? actor?.id ?? null;
}

function appendActivity({ action, source, actor, target, fromStatus, toStatus, confirmTokenRef = null }) {
  activityLedger.push({
    action,
    source,
    actingPrincipal: actingPrincipal(actor),
    target: target ?? null,
    transition: `${fromStatus ?? 'none'}->${toStatus ?? 'none'}`,
    confirmTokenRef,
    decision: 'accepted',
    timestamp: now(),
  });
}

function appendSecurity({
  action,
  source = 'autonomous',
  actor,
  target,
  fromStatus,
  toStatus,
  hardReason,
  confirmTokenRef = null,
  event = 'command-rejected',
}) {
  securityLog.push({
    event,
    action,
    source,
    actingPrincipal: actingPrincipal(actor),
    target: target ?? null,
    transition: `${fromStatus ?? 'none'}->${toStatus ?? 'none'}`,
    confirmTokenRef,
    hardReason,
    decision: 'rejected',
    timestamp: now(),
  });
}

function mintConfirmToken({ taskId, action, adminId, expiresInMs = 30 * 60 * 1000 }) {
  if (!taskId || !action || !adminId) {
    throw new Error('confirm token requires taskId, action, and adminId bindings');
  }
  if (!Number.isFinite(expiresInMs) || expiresInMs <= 0) {
    throw new Error('confirm token expiry must be finite and future');
  }

  const record = Object.freeze({
    id: `token-${tokenSequence++}`,
    taskId: String(taskId),
    action,
    adminId,
    issuedAt: now(),
    expiresAt: new Date(clockMs + expiresInMs).toISOString(),
    consumedAt: null,
  });
  confirmTokens.set(record.id, record);
  return record;
}

function inspectConfirmTokenBinding({ taskId, action, actor, envelope = {} }) {
  const tokenId = typeof envelope.confirmToken === 'string' ? envelope.confirmToken : null;
  const token = tokenId ? confirmTokens.get(tokenId) ?? null : null;
  const tokenRef = token ? { tokenId: token.id, consumedAt: token.consumedAt } : null;

  if (!token) {
    return { token: null, tokenRef, source: 'autonomous', bindingValid: false };
  }

  const scopeValid = token.taskId === String(taskId) && token.action === action;
  const principalPresent = Boolean(token.adminId && actor?.adminId);
  const principalMatches = principalPresent && token.adminId === actor.adminId;
  const bindingValid = scopeValid && principalMatches;

  return {
    token,
    tokenRef,
    source: bindingValid ? 'human-commanded' : 'autonomous',
    bindingValid,
    scopeValid,
    principalPresent,
    principalMatches,
  };
}

function consumeConfirmTokenCas(token) {
  const current = confirmTokens.get(token.id);
  if (!current || current !== token || current.consumedAt !== null) {
    return null;
  }

  const consumed = Object.freeze({ ...current, consumedAt: now() });
  confirmTokens.set(token.id, consumed);
  return { tokenId: consumed.id, consumedAt: consumed.consumedAt };
}

function rejectSecurity(context, hardReason, overrides = {}) {
  appendSecurity({ ...context, ...overrides, hardReason });
  return { ok: false, decision: 'rejected', hardReason };
}

function authorizeRepresentativeHumanCommand({ task, action, actor, envelope }) {
  const binding = inspectConfirmTokenBinding({ taskId: task.id, action, actor, envelope });
  const context = {
    action,
    source: binding.source,
    actor,
    target: task.id,
    fromStatus: task.status,
    toStatus: REVIEW_STATUS,
    confirmTokenRef: binding.tokenRef,
  };

  if (!binding.token) {
    return rejectSecurity(context, envelope?.confirmToken ? 'confirm-token-invalid' : 'confirm-token-required');
  }
  if (!binding.scopeValid) {
    return rejectSecurity(context, 'confirm-token-scope-mismatch');
  }
  if (!binding.principalPresent) {
    return rejectSecurity(context, 'principal-binding-absent');
  }
  if (!binding.principalMatches) {
    return rejectSecurity(context, 'principal-mismatch');
  }

  const expiryMs = Date.parse(binding.token.expiresAt);
  if (!Number.isFinite(expiryMs) || expiryMs <= clockMs) {
    return rejectSecurity(context, 'confirm-token-expired');
  }
  if (binding.token.consumedAt !== null) {
    return rejectSecurity(context, 'confirm-token-conflict');
  }

  const consumedRef = consumeConfirmTokenCas(binding.token);
  if (!consumedRef) {
    return rejectSecurity(context, 'confirm-token-conflict');
  }
  return { ok: true, decision: 'allowed', source: binding.source, confirmTokenRef: consumedRef };
}

function performRepresentativeHumanAction(task, actor, envelope = {}) {
  const action = 'move-to-review';
  const fromStatus = task.status;
  const authorization = authorizeRepresentativeHumanCommand({ task, action, actor, envelope });
  if (!authorization.ok) {
    return authorization;
  }

  task.status = REVIEW_STATUS;
  appendActivity({
    action,
    source: authorization.source,
    actor,
    target: task.id,
    fromStatus,
    toStatus: task.status,
    confirmTokenRef: authorization.confirmTokenRef,
  });
  return { ok: true, decision: 'allowed', task, confirmTokenRef: authorization.confirmTokenRef };
}

function createTask(input, actor, envelope = {}) {
  const proposedStatus = input.status ?? 'todo';
  const context = {
    action: 'create-task',
    source: 'autonomous',
    actor,
    target: null,
    fromStatus: null,
    toStatus: proposedStatus,
  };

  if (proposedStatus === TERMINAL_STATUS) {
    return rejectSecurity(context, 'create-with-terminal-status', { event: 'terminal-bypass-attempt' });
  }
  if (!VALID_STATUSES.has(proposedStatus)) {
    return rejectSecurity(context, 'invalid-status');
  }

  const task = addTask({ title: input.title, status: proposedStatus });
  appendActivity({
    action: context.action,
    source: 'autonomous',
    actor,
    target: task.id,
    fromStatus: null,
    toStatus: task.status,
  });
  return { ok: true, decision: 'allowed', task };
}

function moveTask(input, actor, envelope = {}) {
  const task = tasks.get(String(input.taskId));
  if (!task) {
    return rejectSecurity(
      {
        action: 'move-task',
        actor,
        target: String(input.taskId),
        fromStatus: null,
        toStatus: input.status,
      },
      'task-not-found',
    );
  }

  const fromStatus = task.status;
  const tokenAction = `move-to-${input.status}`;
  const binding = inspectConfirmTokenBinding({ taskId: task.id, action: tokenAction, actor, envelope });
  const context = {
    action: 'move-task',
    source: binding.source,
    actor,
    target: task.id,
    fromStatus,
    toStatus: input.status,
    confirmTokenRef: binding.tokenRef,
  };

  if (input.status === TERMINAL_STATUS) {
    return rejectSecurity(context, 'done-requires-admit-done', { event: 'terminal-bypass-attempt' });
  }
  if (!VALID_STATUSES.has(input.status)) {
    return rejectSecurity(context, 'invalid-status');
  }

  task.status = input.status;
  appendActivity({
    action: context.action,
    source: context.source,
    actor,
    target: task.id,
    fromStatus,
    toStatus: task.status,
  });
  return { ok: true, decision: 'allowed', task };
}

function validateDoneAdmission(ticket, proofs, actor) {
  if (actor?.kind !== 'system') {
    return 'admit-done-system-actor-required';
  }
  if (ticket.status !== REVIEW_STATUS) {
    return 'review-status-required';
  }
  for (const [proofName, hardReason] of REQUIRED_DONE_PROOFS) {
    if (proofs?.[proofName] !== true) {
      return hardReason;
    }
  }
  return null;
}

function admitDone(ticket, proofs, actor, { failureInjection } = {}) {
  const context = {
    action: 'admit-done',
    source: 'system',
    actor,
    target: ticket.id,
    fromStatus: ticket.status,
    toStatus: TERMINAL_STATUS,
  };
  const hardReason = validateDoneAdmission(ticket, proofs, actor);
  if (hardReason) {
    return rejectSecurity(context, hardReason, { event: 'done-admission-rejected' });
  }

  // This snapshot models one transaction: authorization has succeeded, and both
  // the aggregate mutation and accepted-ledger append must commit or roll back.
  const priorStatus = ticket.status;
  const priorLedgerLength = activityLedger.length;
  try {
    failureInjection?.('after-authorization');
    ticket.status = TERMINAL_STATUS;
    failureInjection?.('after-mutation');
    appendActivity({
      action: context.action,
      source: context.source,
      actor,
      target: ticket.id,
      fromStatus: priorStatus,
      toStatus: ticket.status,
    });
    failureInjection?.('after-ledger-append');
    return { ok: true, decision: 'allowed', ticket };
  } catch (error) {
    ticket.status = priorStatus;
    activityLedger.length = priorLedgerLength;
    appendSecurity({
      ...context,
      hardReason: 'admit-done-atomic-write-failed',
      event: 'done-admission-rolled-back',
    });
    return {
      ok: false,
      decision: 'rejected',
      hardReason: 'admit-done-atomic-write-failed',
      rolledBack: true,
    };
  }
}

function latest(collection, predicate) {
  return collection.slice().reverse().find(predicate);
}

function reportScenario(id, label, pass, details) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${label}`);
  if (!pass) {
    console.log(`  details: ${details}`);
  }
  return pass;
}

function runS1() {
  const task = addTask({ title: 'S1 autonomous direct Done', status: 'in_progress' });
  const result = moveTask({ taskId: task.id, status: TERMINAL_STATUS }, makeActor('admin-1'));
  const row = latest(securityLog, (entry) => entry.target === task.id);
  const pass =
    result.hardReason === 'done-requires-admit-done' &&
    task.status === 'in_progress' &&
    row?.source === 'autonomous' &&
    row?.hardReason === result.hardReason &&
    !activityLedger.some((entry) => entry.target === task.id);
  return reportScenario('S1', 'tool-path autonomous direct-Done rejected', pass, JSON.stringify({ result, task, row }));
}

function runS2() {
  const actor = makeActor('admin-2');
  const task = addTask({ title: 'S2 human-token direct Done', status: 'in_progress' });
  const token = mintConfirmToken({ taskId: task.id, action: 'move-to-done', adminId: actor.adminId });
  const result = moveTask({ taskId: task.id, status: TERMINAL_STATUS }, actor, { confirmToken: token.id });
  const storedToken = confirmTokens.get(token.id);
  const row = latest(securityLog, (entry) => entry.target === task.id);
  const pass =
    result.hardReason === 'done-requires-admit-done' &&
    task.status === 'in_progress' &&
    storedToken.consumedAt === null &&
    row?.source === 'human-commanded' &&
    row?.hardReason === result.hardReason &&
    !activityLedger.some((entry) => entry.target === task.id);
  return reportScenario('S2', 'tool-path human-token direct-Done still rejected and token retained', pass, JSON.stringify({ result, task, storedToken, row }));
}

function runS3() {
  const taskCountBefore = tasks.size;
  const result = createTask({ title: 'S3 create Done', status: TERMINAL_STATUS }, makeActor('admin-3'));
  const row = latest(securityLog, (entry) => entry.action === 'create-task');
  const pass =
    result.hardReason === 'create-with-terminal-status' &&
    tasks.size === taskCountBefore &&
    row?.hardReason === result.hardReason &&
    !activityLedger.some((entry) => entry.action === 'create-task');
  return reportScenario('S3', 'create-with-done rejected', pass, JSON.stringify({ result, row }));
}

function runS4() {
  const actor = makeSystemActor();
  const readyMissing = addTask({ title: 'S4 missing Ready approval', status: REVIEW_STATUS });
  const reviewMissing = addTask({ title: 'S4 missing review proof', status: REVIEW_STATUS });
  const resultReady = admitDone(
    readyMissing,
    { reviewExitContainmentProof: true, mergeAuthorization: true, mergedIntoDevelopment: true },
    actor,
  );
  const resultReview = admitDone(
    reviewMissing,
    { readyApproval: true, mergeAuthorization: true, mergedIntoDevelopment: true },
    actor,
  );
  const rows = securityLog.filter((entry) => entry.action === 'admit-done' && [readyMissing.id, reviewMissing.id].includes(entry.target));
  const pass =
    resultReady.hardReason === 'ready-approval-absent' &&
    resultReview.hardReason === 'review-proof-absent' &&
    readyMissing.status === REVIEW_STATUS &&
    reviewMissing.status === REVIEW_STATUS &&
    rows.length === 2 &&
    rows.every((row) => row.event === 'done-admission-rejected') &&
    !activityLedger.some((entry) => [readyMissing.id, reviewMissing.id].includes(entry.target));
  return reportScenario('S4', 'AdmitDone incomplete proofs rejected fail-closed', pass, JSON.stringify({ resultReady, resultReview, rows }));
}

function fullProofs() {
  return {
    readyApproval: true,
    reviewExitContainmentProof: true,
    mergeAuthorization: true,
    mergedIntoDevelopment: true,
  };
}

function runS5() {
  const actor = makeSystemActor();
  const task = addTask({ title: 'S5 complete proof chain', status: REVIEW_STATUS });
  const activityBefore = activityLedger.length;
  const securityBefore = securityLog.length;
  const result = admitDone(task, fullProofs(), actor);
  const rows = activityLedger.filter((entry) => entry.action === 'admit-done' && entry.target === task.id);
  const pass =
    result.decision === 'allowed' &&
    task.status === TERMINAL_STATUS &&
    activityLedger.length === activityBefore + 1 &&
    rows.length === 1 &&
    rows[0].decision === 'accepted' &&
    securityLog.length === securityBefore;
  return reportScenario('S5', 'AdmitDone full proof chain accepted exactly once', pass, JSON.stringify({ result, rows }));
}

function runS6() {
  const task = addTask({ title: 'S6 atomic rollback', status: REVIEW_STATUS });
  const proofs = fullProofs();
  const proofsBefore = JSON.stringify(proofs);
  const tokenStateBefore = JSON.stringify([...confirmTokens.entries()]);
  const activityBefore = activityLedger.length;
  const result = admitDone(task, proofs, makeSystemActor(), {
    failureInjection(stage) {
      if (stage === 'after-mutation') {
        throw new Error('simulated persistence failure');
      }
    },
  });
  const row = latest(securityLog, (entry) => entry.target === task.id);
  const pass =
    result.hardReason === 'admit-done-atomic-write-failed' &&
    result.rolledBack === true &&
    task.status === REVIEW_STATUS &&
    activityLedger.length === activityBefore &&
    !activityLedger.some((entry) => entry.target === task.id) &&
    JSON.stringify(proofs) === proofsBefore &&
    JSON.stringify([...confirmTokens.entries()]) === tokenStateBefore &&
    row?.event === 'done-admission-rolled-back';
  return reportScenario('S6', 'AdmitDone post-authorization failure rolls back atomically', pass, JSON.stringify({ result, task, row }));
}

function runS7() {
  const securityBefore = securityLog.length;
  const owner = makeActor('admin-owner');

  const mismatchTask = addTask({ title: 'S7 principal mismatch', status: 'in_progress' });
  const mismatchToken = mintConfirmToken({ taskId: mismatchTask.id, action: 'move-to-review', adminId: owner.adminId });
  const mismatch = performRepresentativeHumanAction(mismatchTask, makeActor('admin-other'), { confirmToken: mismatchToken.id });

  const expiredTask = addTask({ title: 'S7 expired token', status: 'in_progress' });
  const expiredToken = mintConfirmToken({ taskId: expiredTask.id, action: 'move-to-review', adminId: owner.adminId, expiresInMs: 1_000 });
  advanceClock(1_001);
  const expired = performRepresentativeHumanAction(expiredTask, owner, { confirmToken: expiredToken.id });

  const replayTask = addTask({ title: 'S7 replay token', status: 'in_progress' });
  const replayToken = mintConfirmToken({ taskId: replayTask.id, action: 'move-to-review', adminId: owner.adminId });
  const firstUse = performRepresentativeHumanAction(replayTask, owner, { confirmToken: replayToken.id });
  const replay = performRepresentativeHumanAction(replayTask, owner, { confirmToken: replayToken.id });

  const forgedTask = addTask({ title: 'S7 forged token', status: 'in_progress' });
  const forged = performRepresentativeHumanAction(forgedTask, owner, { confirmToken: 'forged-token' });

  const absentTask = addTask({ title: 'S7 principal binding absent', status: 'in_progress' });
  const absentToken = mintConfirmToken({ taskId: absentTask.id, action: 'move-to-review', adminId: owner.adminId });
  const absent = performRepresentativeHumanAction(absentTask, null, { confirmToken: absentToken.id });

  const rejectedRows = securityLog.slice(securityBefore);
  const forgedRow = rejectedRows.find((row) => row.target === forgedTask.id);
  const reasons = rejectedRows.map((row) => row.hardReason);
  const pass =
    mismatch.hardReason === 'principal-mismatch' &&
    expired.hardReason === 'confirm-token-expired' &&
    firstUse.decision === 'allowed' &&
    replay.hardReason === 'confirm-token-conflict' &&
    forged.hardReason === 'confirm-token-invalid' &&
    forgedRow?.source === 'autonomous' &&
    absent.hardReason === 'principal-binding-absent' &&
    rejectedRows.length === 5 &&
    ['principal-mismatch', 'confirm-token-expired', 'confirm-token-conflict', 'confirm-token-invalid', 'principal-binding-absent'].every((reason) => reasons.includes(reason)) &&
    mismatchTask.status === 'in_progress' &&
    expiredTask.status === 'in_progress' &&
    replayTask.status === REVIEW_STATUS &&
    forgedTask.status === 'in_progress' &&
    absentTask.status === 'in_progress' &&
    confirmTokens.get(mismatchToken.id).consumedAt === null &&
    confirmTokens.get(expiredToken.id).consumedAt === null &&
    confirmTokens.get(replayToken.id).consumedAt !== null &&
    confirmTokens.get(absentToken.id).consumedAt === null;
  return reportScenario('S7', 'confirm-token mechanics on representative non-terminal action', pass, JSON.stringify({ mismatch, expired, firstUse, replay, forged, absent, rejectedRows }));
}

function dumpSink(name, rows) {
  console.log(`${name}:`);
  for (const [index, row] of rows.entries()) {
    console.log(`  #${index + 1} ${JSON.stringify(row)}`);
  }
}

function main() {
  const scenarios = [runS1, runS2, runS3, runS4, runS5, runS6, runS7];
  let allPass = true;
  for (const scenario of scenarios) {
    allPass = scenario() && allPass;
  }

  console.log('');
  dumpSink('activityLedger', activityLedger);
  console.log('');
  dumpSink('securityLog', securityLog);
  console.log('');
  console.log(`SCENARIO_SUMMARY=${allPass ? 'PASS' : 'FAIL'}`);
  if (!allPass) {
    process.exitCode = 1;
  }
}

main();
