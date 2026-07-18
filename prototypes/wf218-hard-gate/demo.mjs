#!/usr/bin/env node

const TIMING = {
  tokenTtlMs: 30 * 60 * 1000,
};

const CREATE_ALLOWED_STATUSES = ['todo', 'in_progress', 'blocked'];
const TERMINAL_STATUS = 'done';

const tasks = new Map();
const auditLog = [];
const confirmTokens = new Map();
let taskSequence = 1;
let tokenSequence = 1;

function now() {
  return new Date().toISOString();
}

function makeTask(input) {
  return {
    id: String(input.id ?? taskSequence++),
    title: input.title,
    status: input.status,
  };
}

function appendAudit({ action, source = 'autonomous', actor, target, fromStatus, toStatus, decision, hardReason, confirmTokenRef }) {
  auditLog.push({
    action,
    source,
    actingPrincipal: actor?.adminId,
    target,
    transition: `${fromStatus ?? 'none'}->${toStatus ?? 'none'}`,
    confirmTokenRef: confirmTokenRef ?? null,
    hardReason: hardReason ?? null,
    decision,
    timestamp: now(),
  });
}

function authorizeTask(action) {
  // Sticky by design for the prototype: role status is always accepted for member.
  // Real policy is unchanged and intentionally not status-aware.
  return { allowed: true, reason: null, action, role: 'member' };
}

function mintConfirmToken({ taskId, toStatus, adminId, expiresAt }) {
  if (!adminId) {
    throw new Error('mintConfirmToken requires adminId');
  }
  const id = `token-${tokenSequence++}`;
  const record = {
    id,
    taskId: String(taskId),
    toStatus,
    adminId,
    issuedAt: new Date().toISOString(),
    expiresAt: expiresAt ?? new Date(Date.now() + TIMING.tokenTtlMs).toISOString(),
    consumedAt: null,
  };
  confirmTokens.set(id, record);
  return record;
}

function consumeConfirmToken(record) {
  if (record.consumedAt) {
    return null;
  }
  record.consumedAt = new Date().toISOString();
  return {
    tokenId: record.id,
    consumedAt: record.consumedAt,
  };
}

function getTask(taskId) {
  return tasks.get(String(taskId)) || null;
}

function createTask(input, actor, envelope = {}) {
  const action = 'create';
  const proposedStatus = input.status ?? 'todo';

  if (!CREATE_ALLOWED_STATUSES.includes(proposedStatus)) {
    const hardReason = proposedStatus === TERMINAL_STATUS ? 'create-with-terminal-status' : 'invalid-status';
    appendAudit({
      action,
      source: 'autonomous',
      actor,
      target: null,
      fromStatus: null,
      toStatus: proposedStatus,
      decision: 'rejected',
      hardReason,
      confirmTokenRef: null,
    });
    return {
      ok: false,
      decision: 'rejected',
      hardReason,
    };
  }

  const authorization = authorizeTask('create');
  if (!authorization.allowed) {
    appendAudit({
      action,
      source: 'autonomous',
      actor,
      target: null,
      fromStatus: null,
      toStatus: proposedStatus,
      decision: 'rejected',
      hardReason: authorization.reason ?? 'authorization-denied',
      confirmTokenRef: null,
    });
    return {
      ok: false,
      decision: 'rejected',
      hardReason: authorization.reason ?? 'authorization-denied',
    };
  }

  const guardResult = assertTerminalTransitionAuthorized({ kind: 'create', id: 'new' }, proposedStatus, actor, envelope);

  if (guardResult.decision === 'rejected') {
    appendAudit({
      action,
      source: guardResult.source,
      actor,
      target: null,
      fromStatus: null,
      toStatus: proposedStatus,
      decision: 'rejected',
      hardReason: guardResult.hardReason,
      confirmTokenRef: null,
    });
    return { ok: false, decision: 'rejected', hardReason: guardResult.hardReason };
  }

  const task = makeTask({ title: input.title, status: proposedStatus });
  tasks.set(task.id, task);

  appendAudit({
    action,
    source: guardResult.source,
    actor,
    target: task.id,
    fromStatus: null,
    toStatus: task.status,
    decision: 'allowed',
    hardReason: null,
    confirmTokenRef: null,
  });

  return {
    ok: true,
    decision: 'allowed',
    task,
  };
}

function moveTask(input, actor, envelope = {}) {
  const action = 'move';
  const task = getTask(input.taskId);
  if (!task) {
    appendAudit({
      action,
      source: 'autonomous',
      actor,
      target: String(input.taskId),
      fromStatus: null,
      toStatus: input.status,
      decision: 'rejected',
      hardReason: 'task-not-found',
      confirmTokenRef: null,
    });
    return { ok: false, decision: 'rejected', hardReason: 'task-not-found' };
  }

  const fromStatus = task.status;
  const toStatus = input.status;

  const authorization = authorizeTask('update');
  if (!authorization.allowed) {
    appendAudit({
      action,
      source: 'autonomous',
      actor,
      target: task.id,
      fromStatus,
      toStatus,
      decision: 'rejected',
      hardReason: authorization.reason ?? 'authorization-denied',
      confirmTokenRef: null,
    });
    return {
      ok: false,
      decision: 'rejected',
      hardReason: authorization.reason ?? 'authorization-denied',
      task,
    };
  }

  const guardResult = assertTerminalTransitionAuthorized(task, toStatus, actor, envelope);

  if (guardResult.decision === 'rejected') {
    appendAudit({
      action,
      source: guardResult.source,
      actor,
      target: task.id,
      fromStatus,
      toStatus,
      decision: 'rejected',
      hardReason: guardResult.hardReason,
      confirmTokenRef: guardResult.confirmTokenRef,
    });
    return {
      ok: false,
      decision: 'rejected',
      hardReason: guardResult.hardReason,
      task,
    };
  }

  task.status = toStatus;

  appendAudit({
    action,
    source: guardResult.source,
    actor,
    target: task.id,
    fromStatus,
    toStatus,
    decision: 'allowed',
    hardReason: null,
    confirmTokenRef: guardResult.confirmTokenRef,
  });

  return {
    ok: true,
    decision: 'allowed',
    task,
    confirmTokenRef: guardResult.confirmTokenRef,
  };
}

function assertTerminalTransitionAuthorized(target, toStatus, actor, envelope = {}) {
  const token = envelope?.confirmToken ? confirmTokens.get(envelope.confirmToken) : null;
  const scopeMatch = !!(token && token.taskId === target?.id && token.toStatus === toStatus);
  const principalBound = !!(token && token.adminId && actor?.adminId && token.adminId === actor.adminId);
  const source = token && scopeMatch && principalBound ? 'human-commanded' : 'autonomous';

  if (toStatus !== TERMINAL_STATUS) {
    return { decision: 'allowed', hardReason: null, confirmTokenRef: null, source };
  }

  if (target?.kind === 'create') {
    return {
      decision: 'rejected',
      hardReason: 'create-with-terminal-status',
      confirmTokenRef: null,
      source,
    };
  }

  if (!token) {
    return {
      decision: 'rejected',
      hardReason: 'autonomous-attempt-on-gated-transition',
      confirmTokenRef: null,
      source,
    };
  }

  if (!scopeMatch) {
    return {
      decision: 'rejected',
      hardReason: 'confirm-token-scope-mismatch',
      confirmTokenRef: { tokenId: token.id, consumedAt: token.consumedAt },
      source,
    };
  }

  if (!token.adminId || !actor || !actor.adminId) {
    return {
      decision: 'rejected',
      hardReason: 'principal-binding-absent',
      confirmTokenRef: { tokenId: token.id, consumedAt: token.consumedAt },
      source,
    };
  }

  if (token.adminId !== actor.adminId) {
    return {
      decision: 'rejected',
      hardReason: 'principal-mismatch',
      confirmTokenRef: { tokenId: token.id, consumedAt: token.consumedAt },
      source,
    };
  }

  const exp = new Date(token.expiresAt).getTime();
  if (!Number.isFinite(exp) || exp <= Date.now()) {
    return {
      decision: 'rejected',
      hardReason: 'confirm-token-expired',
      confirmTokenRef: { tokenId: token.id, consumedAt: token.consumedAt },
      source,
    };
  }

  if (token.consumedAt) {
    return {
      decision: 'rejected',
      hardReason: 'confirm-token-conflict',
      confirmTokenRef: { tokenId: token.id, consumedAt: token.consumedAt },
      source,
    };
  }

  const consumed = consumeConfirmToken(token);
  if (!consumed) {
    return {
      decision: 'rejected',
      hardReason: 'confirm-token-conflict',
      confirmTokenRef: { tokenId: token.id, consumedAt: token.consumedAt },
      source,
    };
  }

  return {
    decision: 'allowed',
    hardReason: null,
    confirmTokenRef: consumed,
    source,
  };
}

function makeActor(label, adminId = label) {
  return {
    adminId,
    label,
  };
}

function assertScenario(name, condition, details) {
  if (condition) {
    console.log(`PASS ${name}`);
    return true;
  }
  console.log(`FAIL ${name}`);
  if (details) {
    console.log(`  details: ${details}`);
  }
  return false;
}

function latestAudit(predicate) {
  return auditLog.slice().reverse().find((entry) => predicate(entry));
}

function runScenarioS1() {
  const name = 'S1 Autonomous-reject';
  const actor = makeActor('admin X', 'admin X');
  const task = makeTask({ title: 'S1 card', status: 'todo' });
  tasks.set(task.id, task);

  const result = moveTask({ taskId: task.id, status: 'done' }, actor, {});

  const audit = latestAudit((row) => row.action === 'move' && row.target === task.id);
  const pass =
    result.decision === 'rejected' &&
    result.hardReason === 'autonomous-attempt-on-gated-transition' &&
    task.status !== 'done' &&
    audit?.source === 'autonomous' &&
    audit?.decision === 'rejected' &&
    audit?.hardReason === 'autonomous-attempt-on-gated-transition';

  return assertScenario(name, pass, `result=${JSON.stringify(result)}, taskStatus=${task.status}, audit=${JSON.stringify(audit)}`);
}

function runScenarioS2() {
  const name = 'S2 Human-confirm-accept';
  const actor = makeActor('admin X via Ask Admin', 'admin X');
  const task = makeTask({ title: 'S2 card', status: 'in_progress' });
  tasks.set(task.id, task);

  const token = mintConfirmToken({ taskId: task.id, toStatus: 'done', adminId: actor.adminId });
  const result = moveTask({ taskId: task.id, status: 'done' }, actor, { confirmToken: token.id });
  const tokenRecord = confirmTokens.get(token.id);
  const tokenRow = latestAudit((row) => row.action === 'move' && row.target === task.id && row.decision === 'allowed');

  const pass =
    result.decision === 'allowed' &&
    task.status === 'done' &&
    tokenRecord?.consumedAt &&
    tokenRow?.source === 'human-commanded' &&
    tokenRow?.actingPrincipal === actor.adminId &&
    tokenRow?.hardReason === null &&
    tokenRow?.confirmTokenRef?.tokenId === token.id;

  return assertScenario(name, pass, `result=${JSON.stringify(result)}, token=${JSON.stringify(tokenRecord)}, actorLabel=${actor.label}, audit=${JSON.stringify(tokenRow)}`);
}

function runScenarioS3() {
  const name = 'S3 Principal-mismatch-reject';
  const owner = makeActor('admin A', 'admin A');
  const intruder = makeActor('admin B', 'admin B');
  const task = makeTask({ title: 'S3 card', status: 'in_progress' });
  tasks.set(task.id, task);

  const token = mintConfirmToken({ taskId: task.id, toStatus: 'done', adminId: owner.adminId });
  const result = moveTask({ taskId: task.id, status: 'done' }, intruder, { confirmToken: token.id });
  const audit = latestAudit((row) => row.action === 'move' && row.target === task.id && row.decision === 'rejected');

  const pass =
    result.decision === 'rejected' &&
    result.hardReason === 'principal-mismatch' &&
    task.status !== 'done' &&
    audit?.hardReason === 'principal-mismatch' &&
    audit?.source === 'autonomous' &&
    audit?.actingPrincipal === intruder.adminId;

  return assertScenario(name, pass, `result=${JSON.stringify(result)}, taskStatus=${task.status}, audit=${JSON.stringify(audit)}`);
}

function runScenarioS4() {
  const name = 'S4 Create-with-done-reject';
  const actor = makeActor('admin X', 'admin X');

  const beforeCount = tasks.size;
  const result = createTask({ title: 'S4 card', status: 'done' }, actor, {});
  const afterCount = tasks.size;
  const audit = latestAudit((row) => row.action === 'create' && row.decision === 'rejected' && row.hardReason === 'create-with-terminal-status');

  const pass =
    result.decision === 'rejected' &&
    result.hardReason === 'create-with-terminal-status' &&
    afterCount === beforeCount &&
    audit?.hardReason === 'create-with-terminal-status';

  return assertScenario(name, pass, `result=${JSON.stringify(result)}, before=${beforeCount}, after=${afterCount}, audit=${JSON.stringify(audit)}`);
}

function runScenarioS5() {
  const name = 'S5 Expired-and-replayed-reject';
  const actor = makeActor('admin X', 'admin X');

  // Expired token rejection
  const cardExpired = makeTask({ title: 'S5 expired', status: 'in_progress' });
  tasks.set(cardExpired.id, cardExpired);
  const expiredToken = mintConfirmToken({
    taskId: cardExpired.id,
    toStatus: 'done',
    adminId: actor.adminId,
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
  });
  const expiredResult = moveTask({ taskId: cardExpired.id, status: 'done' }, actor, {
    confirmToken: expiredToken.id,
  });

  const expiredAudit = latestAudit((row) => row.action === 'move' && row.target === cardExpired.id && row.decision === 'rejected' && row.hardReason === 'confirm-token-expired');

  const expiredPass =
    expiredResult.decision === 'rejected' &&
    expiredResult.hardReason === 'confirm-token-expired' &&
    cardExpired.status !== 'done' &&
    expiredAudit?.source === 'human-commanded';

  // Replayed token rejection after first successful consume
  const cardReplay = makeTask({ title: 'S5 replay', status: 'todo' });
  tasks.set(cardReplay.id, cardReplay);
  const replayToken = mintConfirmToken({ taskId: cardReplay.id, toStatus: 'done', adminId: actor.adminId });
  const first = moveTask({ taskId: cardReplay.id, status: 'done' }, actor, { confirmToken: replayToken.id });
  const second = moveTask({ taskId: cardReplay.id, status: 'done' }, actor, { confirmToken: replayToken.id });
  const replayAudit = latestAudit((row) => row.action === 'move' && row.target === cardReplay.id && row.decision === 'rejected' && row.hardReason === 'confirm-token-conflict');

  const replayPass =
    first.decision === 'allowed' &&
    cardReplay.status === 'done' &&
    second.decision === 'rejected' &&
    second.hardReason === 'confirm-token-conflict' &&
    replayAudit?.hardReason === 'confirm-token-conflict' &&
    replayAudit?.source === 'human-commanded';

  const pass = expiredPass && replayPass;
  return assertScenario(name, pass, `expiredResult=${JSON.stringify(expiredResult)}, first=${JSON.stringify(first)}, second=${JSON.stringify(second)}, token=${replayToken.id}, audits=${JSON.stringify({ expiredAudit, replayAudit })}`);
}

function runScenarioS6() {
  const name = 'S6 Forged-token-source';
  const actor = makeActor('admin X', 'admin X');
  const task = makeTask({ title: 'S6 card', status: 'in_progress' });
  tasks.set(task.id, task);

  const result = moveTask({ taskId: task.id, status: 'done' }, actor, { confirmToken: 'does-not-exist' });
  const audit = latestAudit((row) => row.action === 'move' && row.target === task.id && row.decision === 'rejected' && row.hardReason === 'autonomous-attempt-on-gated-transition');

  const pass =
    result.decision === 'rejected' &&
    result.hardReason === 'autonomous-attempt-on-gated-transition' &&
    task.status !== 'done' &&
    audit?.source === 'autonomous';

  return assertScenario(name, pass, `result=${JSON.stringify(result)}, taskStatus=${task.status}, audit=${JSON.stringify(audit)}`);
}

function runScenarioS7() {
  const name = 'S7 Principal-binding-absent';
  const actorNoAdmin = {};
  const tokenOwnerTask = makeTask({ title: 'S7 token owner', status: 'todo' });
  tasks.set(tokenOwnerTask.id, tokenOwnerTask);
  const forgedToken = {
    id: `token-${tokenSequence++}`,
    taskId: tokenOwnerTask.id,
    toStatus: 'done',
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + TIMING.tokenTtlMs).toISOString(),
    consumedAt: null,
  };
  confirmTokens.set(forgedToken.id, forgedToken);
  const missingActorResult = moveTask({ taskId: tokenOwnerTask.id, status: 'done' }, actorNoAdmin, { confirmToken: forgedToken.id });
  const missingActorAudit = latestAudit(
    (row) => row.action === 'move' && row.target === tokenOwnerTask.id && row.decision === 'rejected' && row.hardReason === 'principal-binding-absent',
  );

  const missingActorPass =
    missingActorResult.decision === 'rejected' &&
    missingActorResult.hardReason === 'principal-binding-absent' &&
    tokenOwnerTask.status !== 'done' &&
    missingActorAudit?.source === 'autonomous';

  const actor = makeActor('admin X', 'admin X');
  const nullActorTask = makeTask({ title: 'S7 null actor', status: 'todo' });
  tasks.set(nullActorTask.id, nullActorTask);
  const validToken = mintConfirmToken({ taskId: nullActorTask.id, toStatus: 'done', adminId: actor.adminId });
  const nullActorResult = moveTask({ taskId: nullActorTask.id, status: 'done' }, null, { confirmToken: validToken.id });
  const nullActorAudit = latestAudit(
    (row) => row.action === 'move' && row.target === nullActorTask.id && row.decision === 'rejected' && row.hardReason === 'principal-binding-absent',
  );

  const nullActorPass =
    nullActorResult.decision === 'rejected' &&
    nullActorResult.hardReason === 'principal-binding-absent' &&
    nullActorTask.status !== 'done' &&
    nullActorAudit?.source === 'autonomous';

  return assertScenario(name, missingActorPass && nullActorPass, `missingActorResult=${JSON.stringify(missingActorResult)}, missingActorAudit=${JSON.stringify(missingActorAudit)}, nullActorResult=${JSON.stringify(nullActorResult)}, nullActorAudit=${JSON.stringify(nullActorAudit)}`);
}

function runScenarioS8() {
  const name = 'S8 Malformed-expiry';
  const actor = makeActor('admin X', 'admin X');
  const task = makeTask({ title: 'S8 malformed expiry', status: 'in_progress' });
  tasks.set(task.id, task);

  const malformedToken = mintConfirmToken({
    taskId: task.id,
    toStatus: 'done',
    adminId: actor.adminId,
    expiresAt: 'not-a-date',
  });
  const result = moveTask({ taskId: task.id, status: 'done' }, actor, { confirmToken: malformedToken.id });
  const audit = latestAudit((row) => row.action === 'move' && row.target === task.id && row.decision === 'rejected' && row.hardReason === 'confirm-token-expired');

  const pass =
    result.decision === 'rejected' &&
    result.hardReason === 'confirm-token-expired' &&
    task.status !== 'done' &&
    audit?.source === 'human-commanded';

  return assertScenario(name, pass, `result=${JSON.stringify(result)}, taskStatus=${task.status}, audit=${JSON.stringify(audit)}`);
}

function dumpAudit() {
  console.log('\nAudit Log:');
  for (const [index, row] of auditLog.entries()) {
    console.log(`  #${index + 1}.`, JSON.stringify(row));
  }
}

function main() {
  const scenarios = [
    runScenarioS1,
    runScenarioS2,
    runScenarioS3,
    runScenarioS4,
    runScenarioS5,
    runScenarioS6,
    runScenarioS7,
    runScenarioS8,
  ];

  let allPass = true;
  for (const scenario of scenarios) {
    const pass = scenario();
    allPass = allPass && pass;
    console.log('');
  }

  dumpAudit();
  console.log('');
  console.log(`SCENARIO_SUMMARY=${allPass ? 'PASS' : 'FAIL'}`);

  if (!allPass) {
    process.exitCode = 1;
  }
}

main();
