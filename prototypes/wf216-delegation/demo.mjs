#!/usr/bin/env node

const ALLOWED_VERB_SET = new Set([
  'draftProposal',
  'requestCreateBacklogDevTicket',
  'requestAssign',
  'requestClaimAndStart',
  'requestSubmitForReview',
  'pauseOrEscalate',
  'notify',
]);

const CARD_FLOW = {
  requested: ['provisioning', 'blocked'],
  provisioning: ['starting', 'blocked'],
  starting: ['in_progress', 'blocked'],
  in_progress: ['submitted_for_review', 'blocked'],
  blocked: ['provisioning'],
  submitted_for_review: [],
};

let clockMs = Date.parse('2026-07-18T10:00:00.000Z');
let ids = {
  card: 1,
  command: 1,
  lease: 1,
  checkpoint: 1,
  receipt: 1,
  fence: 1,
};

const cards = new Map();
const leases = new Map();
const auditLog = [];
const commandCache = new Map();
const activeSessions = new Map([
  ['session-admin-A', { principalRef: 'admin-A', source: 'web-chat' }],
  ['session-admin-B', { principalRef: 'admin-B', source: 'web-chat' }],
  ['session-admin-C', { principalRef: 'admin-C', source: 'web-chat' }],
  ['session-admin-C-slack', { principalRef: 'admin-C', source: 'slack-chat' }],
  ['session-admin-D', { principalRef: 'admin-D', source: 'web-chat' }],
  ['session-admin-E', { principalRef: 'admin-E', source: 'web-chat' }],
  ['session-admin-F', { principalRef: 'admin-F', source: 'web-chat' }],
  ['session-admin-G', { principalRef: 'admin-G', source: 'web-chat' }],
  ['session-admin-H', { principalRef: 'admin-H', source: 'web-chat' }],
  ['session-admin-I', { principalRef: 'admin-I', source: 'web-chat' }],
  ['session-admin-Z', { principalRef: 'admin-Z', source: 'web-chat' }],
  ['session-admin-FORBIDDEN', { principalRef: '', source: '' }],
]);

function sessionVerifier(rawSessionToken) {
  const session = rawSessionToken ? activeSessions.get(rawSessionToken) : null;
  if (!session || !session.principalRef || !session.source) {
    return {
      verified: false,
      reason: 'unverified-session',
      sessionRef: rawSessionToken,
    };
  }

  return {
    verified: true,
    principalRef: session.principalRef,
    source: session.source,
    sessionRef: rawSessionToken,
  };
}

const devBoardStats = {
  commandDispatchCount: 0,
  commandRejectCount: 0,
  leaseCreatedCount: 0,
};

function now() {
  return new Date(clockMs).toISOString();
}

function nextId(prefix) {
  const value = ids[prefix];
  ids[prefix] += 1;
  return `${prefix}-${value}`;
}

function appendAudit(type, payload) {
  auditLog.push({
    ts: now(),
    type,
    ...payload,
  });
}

function isTransitionAllowed(fromState, toState) {
  return fromState === toState || (CARD_FLOW[fromState] || []).includes(toState);
}

function transitionCard(card, toState, event, details = {}) {
  if (!isTransitionAllowed(card.state, toState)) {
    throw new Error(`invalid transition for ${card.id}: ${card.state} -> ${toState}`);
  }
  const fromState = card.state;
  card.state = toState;
  card.eventLog.push({
    at: now(),
    fromState,
    toState,
    event,
    ...details,
  });
  return { fromState, toState, event };
}

function hashInput(parts) {
  const data = `${JSON.stringify(parts)}`;
  let h = 0;
  for (let i = 0; i < data.length; i += 1) {
    h = (h * 31 + data.charCodeAt(i)) >>> 0;
  }
  return `sig-${h.toString(16).padStart(8, '0')}`;
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function seedCard({ title, principalRef, sourceRef }) {
  const card = {
    id: nextId('card'),
    title,
    state: 'requested',
    principalRef,
    sourceRef,
    expectedVersion: 1,
    executionUnknown: false,
    leaseId: null,
    lastFence: null,
    lastCheckpoint: null,
    lastNonce: null,
    checkpoints: [],
    worklogs: [],
    eventLog: [
      {
        at: now(),
        fromState: null,
        toState: 'requested',
        event: 'card-seeded',
      },
    ],
  };
  cards.set(card.id, card);
  appendAudit('card.seeded', {
    cardId: card.id,
    principalRef,
    sourceRef,
    expectedVersion: card.expectedVersion,
  });
  return card;
}

function snapshotCard(card) {
  return {
    id: card.id,
    title: card.title,
    state: card.state,
    principalRef: card.principalRef,
    sourceRef: card.sourceRef,
    expectedVersion: card.expectedVersion,
    executionUnknown: card.executionUnknown,
    leaseId: card.leaseId,
    lastFence: card.lastFence,
    lastCheckpoint: card.lastCheckpoint,
    checkpointCount: card.checkpoints.length,
    worklogCount: card.worklogs.length,
  };
}

class FakeRunner {
  constructor() {
    this.running = new Map();
    this.signatures = new Map();
    this.lastDisconnectReason = null;
  }

  verifyExecutionContext(cardId, executionContext = {}) {
    const card = cards.get(cardId);
    if (!card) {
      return {
        ok: false,
        reason: 'card-missing',
      };
    }

    const leaseId = executionContext.leaseId;
    const fence = executionContext.fence;
    const nonce = executionContext.nonce;

    if (!leaseId || !fence || !nonce) {
      return {
        ok: false,
        reason: 'missing-fence-context',
      };
    }

    const lease = leases.get(leaseId);
    if (!lease || lease.cardId !== cardId) {
      return {
        ok: false,
        reason: 'invalid-lease',
      };
    }

    if (lease.fence !== fence || lease.nonce !== nonce) {
      return {
        ok: false,
        reason: 'lease-fence-mismatch',
      };
    }

    const runningLease = this.running.get(cardId);
    if (!runningLease || runningLease !== leaseId || card.leaseId !== leaseId) {
      return {
        ok: false,
        reason: 'stale-lease',
      };
    }

    return {
      ok: true,
      card,
      lease,
    };
  }

  start({ card, lease, commandEnvelope }) {
    if (!card || card.leaseId !== lease.id || card.state !== 'starting') {
      return {
        ok: false,
        reason: 'invalid-start-state',
      };
    }

    const receipt = {
      id: nextId('receipt'),
      type: 'execution_started',
      runner: 'runner-local',
      runnerBinding: 'runner-boundary-local-1',
      commandRef: commandEnvelope.id,
      leaseId: lease.id,
      fence: lease.fence,
      nonce: lease.nonce,
      cardId: card.id,
      at: now(),
    };

    receipt.signature = hashInput(receipt);
    transitionCard(card, 'in_progress', 'runner.signed-start-receipt', {
      receiptId: receipt.id,
      leaseId: lease.id,
      commandRef: commandEnvelope.id,
    });
    card.executionUnknown = false;
    card.lastFence = lease.fence;

    this.running.set(card.id, lease.id);
    this.signatures.set(lease.id, receipt.signature);

    appendAudit('runner.start-receipt', {
      cardId: card.id,
      leaseId: lease.id,
      receiptId: receipt.id,
      signature: receipt.signature,
      commandRef: commandEnvelope.id,
      actorRef: commandEnvelope.actorRef,
    });

    return {
      ok: true,
      receipt,
      commandRef: commandEnvelope.id,
    };
  }

  checkpoint(cardId, note, executionContext) {
    const validation = this.verifyExecutionContext(cardId, executionContext);
    if (!validation.ok) {
      return {
        ok: false,
        reason: validation.reason,
      };
    }

    const { card } = validation;

    if (card.state !== 'in_progress') {
      return { ok: false, reason: 'invalid-card-state' };
    }

    const checkpoint = {
      id: nextId('checkpoint'),
      cardId,
      at: now(),
      note,
    };

    card.checkpoints.push(checkpoint);
    card.lastCheckpoint = clone(checkpoint);

    appendAudit('runner.checkpoint', {
      cardId,
      checkpointId: checkpoint.id,
      note,
      state: card.state,
      leaseId: executionContext.leaseId,
      fence: executionContext.fence,
      nonce: executionContext.nonce,
    });

    return {
      ok: true,
      checkpoint,
    };
  }

  worklog(cardId, line, executionContext) {
    const validation = this.verifyExecutionContext(cardId, executionContext);
    if (!validation.ok) {
      return {
        ok: false,
        reason: validation.reason,
      };
    }

    const { card } = validation;

    if (card.state !== 'in_progress') {
      return { ok: false, reason: 'invalid-card-state' };
    }
    card.worklogs.push({
      at: now(),
      cardId,
      line,
    });
    appendAudit('runner.worklog', {
      cardId,
      line,
      leaseId: executionContext.leaseId,
      fence: executionContext.fence,
      nonce: executionContext.nonce,
    });
    return { ok: true };
  }

  disconnect(cardId, executionContext = {}) {
    const validation = this.verifyExecutionContext(cardId, executionContext);
    if (!validation.ok) {
      return {
        ok: false,
        reason: validation.reason,
      };
    }

    const { card, lease } = validation;

    if (!this.running.has(cardId)) {
      return { ok: false, reason: 'runner-not-running' };
    }

    const leaseLost = lease.id;

    this.running.delete(cardId);
    this.lastDisconnectReason = {
      cardId,
      at: now(),
      reason: 'connection-lost',
    };

    const previousState = card.state;
    const versionBefore = card.expectedVersion;

    transitionCard(card, 'blocked', 'runner.disconnect.containment', {
      fromState: previousState,
      reason: 'connection-lost',
      lastCheckpoint: card.lastCheckpoint,
      versionBefore,
    });

    card.executionUnknown = true;
    card.leaseId = null;
    card.expectedVersion += 1;
    this.running.delete(cardId);

    appendAudit('runner.disconnect', {
      cardId,
      stateFrom: previousState,
      stateTo: card.state,
      versionBefore,
      versionAfter: card.expectedVersion,
      lastCheckpoint: card.lastCheckpoint,
      leaseLost,
    });

    return {
      ok: true,
      executionUnknown: true,
      state: card.state,
      lastTrustedCheckpoint: card.lastCheckpoint,
    };
  }
}

class FakeExecutionAdmission {
  constructor(runner) {
    this.runner = runner;
  }

  claimAndStart(card, commandEnvelope) {
    if (!ALLOWED_VERB_SET.has(commandEnvelope.action)) {
      return {
        ok: false,
        reason: 'unsupported-action',
      };
    }
    if (!['requested', 'blocked'].includes(card.state)) {
      return {
        ok: false,
        reason: 'invalid-state-for-claim',
        state: card.state,
      };
    }

  if (!commandEnvelope.nonce) {
      return {
        ok: false,
        reason: 'missing-command-nonce',
      };
    }

    if (card.state === 'blocked' && card.lastNonce && commandEnvelope.nonce === card.lastNonce) {
      return {
        ok: false,
        reason: 'nonce-reuse-for-resume',
      };
    }

    const lease = {
      id: nextId('lease'),
      cardId: card.id,
      fence: `fence-${nextId('fence')}`,
      nonce: commandEnvelope.nonce,
      actorRef: commandEnvelope.actorRef,
      source: commandEnvelope.source,
      createdAt: now(),
    };

    card.leaseId = lease.id;
    card.lastFence = lease.fence;
    card.lastNonce = lease.nonce;
    devBoardStats.leaseCreatedCount += 1;
    leases.set(lease.id, lease);

    transitionCard(card, 'provisioning', 'executionAdmission.claim.start', {
      leaseId: lease.id,
      action: commandEnvelope.action,
      expectedVersion: card.expectedVersion,
    });

    transitionCard(card, 'starting', 'executionAdmission.lease-granted', {
      leaseId: lease.id,
      leaseFence: lease.fence,
    });

    const runnerResult = this.runner.start({
      card,
      lease,
      commandEnvelope,
    });
    if (!runnerResult.ok) {
      transitionCard(card, 'blocked', 'executionAdmission.start-rejected', {
        reason: runnerResult.reason,
      });
      return {
        ok: false,
        reason: runnerResult.reason,
      };
    }

    card.expectedVersion += 1;

    appendAudit('executionAdmission.claim-approved', {
      cardId: card.id,
      leaseId: lease.id,
      versionBefore: card.expectedVersion - 1,
      versionAfter: card.expectedVersion,
      commandRef: commandEnvelope.id,
    });

    return {
      ok: true,
      decision: 'accepted',
      cardId: card.id,
      lease,
      fence: lease.fence,
      nonce: lease.nonce,
      runnerReceipt: runnerResult.receipt,
      envelopeId: commandEnvelope.id,
    };
  }
}

class FakeDevBoardAdapter {
  constructor(executionAdmission) {
    this.executionAdmission = executionAdmission;
    this.requests = [];
  }

  requestCommand(envelope, intent) {
    devBoardStats.commandDispatchCount += 1;
    this.requests.push({ envelope, intent: clone(intent) });
    appendAudit('devboard.request', {
      commandRef: envelope.id,
      action: envelope.action,
      actorRef: envelope.actorRef,
      source: envelope.source,
      target: envelope.target,
      expectedVersion: envelope.expectedVersion,
    });

    if (!ALLOWED_VERB_SET.has(envelope.action)) {
      return this.reject(envelope, 'unsupported-action');
    }

    if (envelope.action === 'requestCreateBacklogDevTicket') {
      const card = seedCard({
        title: intent.payload?.title || `card-${intent.target || 'untitled'}`,
        principalRef: envelope.actorRef,
        sourceRef: envelope.source,
      });

      return {
        ok: true,
        decision: 'card-created',
        cardId: card.id,
        commandRef: envelope.id,
        envelope,
        expectedVersion: card.expectedVersion,
        state: card.state,
      };
    }

    const card = cards.get(envelope.target);
    if (!card) {
      return this.reject(envelope, 'target-missing');
    }

    if (card.principalRef !== envelope.actorRef) {
      return this.reject(envelope, 'principal-mismatch');
    }
    if (card.sourceRef !== envelope.source) {
      return this.reject(envelope, 'source-mismatch');
    }
    if (card.expectedVersion !== envelope.expectedVersion) {
      return this.reject(envelope, 'expectedVersion-mismatch');
    }

    if (envelope.action === 'requestAssign') {
      appendAudit('devboard.assign-request', {
        cardId: card.id,
        commandRef: envelope.id,
        state: card.state,
      });
      card.expectedVersion += 1;
      return {
        ok: true,
        decision: 'assign-request-accepted',
        commandRef: envelope.id,
        cardId: card.id,
        state: card.state,
        expectedVersion: card.expectedVersion,
      };
    }

    if (envelope.action === 'requestClaimAndStart') {
      return this.executionAdmission.claimAndStart(card, envelope);
    }

    if (envelope.action === 'requestSubmitForReview') {
      if (card.state !== 'in_progress') {
        if (card.state === 'blocked' && card.executionUnknown) {
          return this.reject(envelope, 'resume-required-before-submit');
        }
        return this.reject(envelope, 'invalid-state-for-submit');
      }
      transitionCard(card, 'submitted_for_review', 'devboard.review-requested', {
        commandRef: envelope.id,
      });
      card.expectedVersion += 1;
      appendAudit('devboard.submitted-for-review', {
        cardId: card.id,
        commandRef: envelope.id,
      });
      return {
        ok: true,
        decision: 'submitted_for_review',
        cardId: card.id,
        state: card.state,
        expectedVersion: card.expectedVersion,
      };
    }

    if (envelope.action === 'pauseOrEscalate' || envelope.action === 'notify' || envelope.action === 'draftProposal') {
      appendAudit('devboard.non-execution-command', {
        cardId: card.id,
        action: envelope.action,
        commandRef: envelope.id,
      });
      card.expectedVersion += 1;
      return {
        ok: true,
        decision: envelope.action,
        cardId: card.id,
        state: card.state,
        expectedVersion: card.expectedVersion,
      };
    }

    return this.reject(envelope, 'unsupported-action');
  }

  reject(envelope, reason) {
    devBoardStats.commandRejectCount += 1;
    appendAudit('devboard.rejected', {
      commandRef: envelope.id,
      action: envelope.action,
      reason,
      target: envelope.target,
      actorRef: envelope.actorRef,
    });
    return {
      ok: false,
      decision: 'rejected',
      reason,
      commandRef: envelope.id,
      action: envelope.action,
      target: envelope.target,
    };
  }
}

class AskAdminCommandAdapter {
  constructor({ devBoard, sessions }) {
    this.devBoard = devBoard;
    this.verifySession = sessions;
  }

  makeDedupKey({
    principalRef,
    source,
    action,
    targetCardId,
    expectedVersion,
    payloadHash,
    idempotencyKey,
  }) {
    return [
      'idempotency-v2',
      principalRef,
      source,
      action,
      targetCardId || '',
      String(expectedVersion ?? ''),
      payloadHash,
      idempotencyKey,
    ].join('|');
  }

  requestCommand(turnContext, intent) {
    const action = intent?.action;
    const commandNonce = intent?.nonce ?? turnContext?.toolCallId;
    const sessionId = turnContext?.sessionId;

    if (!commandNonce) {
      const failure = {
        ok: false,
        decision: 'rejected',
        reason: 'missing-idempotency-key',
        action,
        commandNonce,
      };
      appendAudit('ask-admin.rejected', {
        action,
        reason: failure.reason,
        commandNonce,
      });
      return failure;
    }

    const verificationResult = this.verifySession
      ? this.verifySession(sessionId)
      : {
          verified: false,
        };

    if (!verificationResult || !verificationResult.verified) {
      const failure = {
        ok: false,
        decision: 'rejected',
        reason: 'unverified-session',
        action,
        commandNonce,
      };
      appendAudit('ask-admin.rejected', {
        action,
        reason: failure.reason,
        sessionRef: sessionId,
        commandNonce,
      });
      return failure;
    }

    if (!ALLOWED_VERB_SET.has(action)) {
      const failure = {
        ok: false,
        decision: 'rejected',
        reason: 'forbidden-verb',
        action,
        commandNonce,
      };
      commandCache.set(this.makeDedupKey({
        principalRef: verificationResult.principalRef,
        source: verificationResult.source,
        action: action,
        targetCardId: intent?.target,
        expectedVersion: intent?.expectedVersion,
        payloadHash: hashInput({
          action,
          target: intent?.target,
          expectedVersion: intent?.expectedVersion,
          payload: intent?.payload || null,
        }),
        idempotencyKey: commandNonce,
      }), failure);
      appendAudit('ask-admin.rejected', {
        action,
        reason: failure.reason,
        actorRef: verificationResult.principalRef,
        commandNonce,
      });
      return failure;
    }

    if (action !== 'requestCreateBacklogDevTicket' && intent?.expectedVersion == null) {
      const failure = {
        ok: false,
        decision: 'rejected',
        reason: 'missing-expected-version',
        action,
        commandNonce,
      };
      commandCache.set(this.makeDedupKey({
        principalRef: verificationResult.principalRef,
        source: verificationResult.source,
        action: action,
        targetCardId: intent?.target,
        expectedVersion: intent?.expectedVersion,
        payloadHash: hashInput({
          action,
          target: intent?.target,
          expectedVersion: intent?.expectedVersion,
          payload: intent?.payload || null,
        }),
        idempotencyKey: commandNonce,
      }), failure);
      appendAudit('ask-admin.rejected', {
        action,
        reason: failure.reason,
        actorRef: verificationResult.principalRef,
        commandNonce,
        target: intent?.target,
      });
      return failure;
    }

    const derivedActor = verificationResult.principalRef;
    const derivedSource = verificationResult.source;
    const idempotencyHash = hashInput({
      action,
      target: intent?.target,
      expectedVersion: intent?.expectedVersion,
      payload: intent?.payload || null,
    });
    const idempotencyKey = this.makeDedupKey({
      principalRef: derivedActor,
      source: derivedSource,
      action,
      targetCardId: intent?.target,
      expectedVersion: intent?.expectedVersion,
      payloadHash: idempotencyHash,
      idempotencyKey: commandNonce,
    });

    if (commandCache.has(idempotencyKey)) {
      const cached = commandCache.get(idempotencyKey);
      appendAudit('ask-admin.replay-dedup', {
        commandNonce,
        commandRef: cached.envelope?.id,
      });
      return {
        ...cached,
        deduped: true,
      };
    }

    const envelope = {
      id: nextId('command'),
      issuedAt: now(),
      turnId: turnContext.turnId,
      commandToolCallId: turnContext.toolCallId,
      actorRef: derivedActor,
      source: derivedSource,
      target: intent.target,
      expectedVersion: intent.expectedVersion,
      action,
      nonce: commandNonce,
      principalAuthorizationRefs: [`principal:${derivedActor}`],
      sourceAuthorizationRefs: [`source:${derivedSource}`],
    };

    const result = this.devBoard.requestCommand(envelope, intent);
    const response = {
      ok: result.ok,
      deduped: false,
      commandNonce,
      commandRef: envelope.id,
      envelope,
      ...result,
    };

    appendAudit('ask-admin.dispatched', {
      commandRef: envelope.id,
      action,
      target: envelope.target,
      actorRef: derivedActor,
      source: derivedSource,
      result: result.decision || result.reason,
    });

    commandCache.set(idempotencyKey, response);

    return response;
  }
}

function makeTurn({ turnId, toolCallId, principalRef, source, sessionId }) {
  return {
    turnId,
    toolCallId,
    sessionId,
    principalRef,
    source,
  };
}

const runner = new FakeRunner();
const admission = new FakeExecutionAdmission(runner);
const devBoard = new FakeDevBoardAdapter(admission);
const ask = new AskAdminCommandAdapter({ devBoard, sessions: sessionVerifier });

function runScenario(label, fn) {
  try {
    const ok = fn();
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
    return !!ok;
  } catch (error) {
    console.log(`FAIL ${label}`);
    console.log(`  error: ${error.message}`);
    return false;
  }
}

function require(cond, message) {
  return Boolean(cond) ? { ok: true } : { ok: false, message };
}

function scenarioS1() {
  const createIntent = {
    action: 'requestCreateBacklogDevTicket',
    payload: { title: 'S1 delegation happy path' },
    nonce: 's1-create',
  };

  const createContext = makeTurn({
    turnId: 'turn-s1-create',
    toolCallId: 'tool-s1-create',
    principalRef: 'admin-A',
    source: 'web-chat',
    sessionId: 'session-admin-A',
  });

  const createResult = ask.requestCommand(createContext, createIntent);
  const card = cards.get(createResult.cardId);

  const startTurn = makeTurn({
    turnId: 'turn-s1-start',
    toolCallId: 'tool-s1-start',
    principalRef: 'admin-A',
    source: 'web-chat',
    sessionId: 'session-admin-A',
  });

  const startIntent = {
    action: 'requestClaimAndStart',
    target: card.id,
    expectedVersion: cards.get(card.id).expectedVersion,
    nonce: 's1-claim',
  };

  const claimVersion = card.expectedVersion;
  const claimIntent = {
    action: 'requestClaimAndStart',
    target: card.id,
    expectedVersion: claimVersion,
    nonce: 's1-claim',
  };
  const claimResult = ask.requestCommand(startTurn, claimIntent);

  const executionContext = {
    leaseId: claimResult.lease.id,
    fence: claimResult.fence,
    nonce: claimResult.nonce,
  };

  const cp1 = runner.checkpoint(card.id, 'checkpoint-1', executionContext);
  const cp2 = runner.checkpoint(card.id, 'checkpoint-2', executionContext);
  const wk = runner.worklog(card.id, 'worker: implemented tests and proofs', executionContext);

  const submitTurn = makeTurn({
    turnId: 'turn-s1-submit',
    toolCallId: 'tool-s1-submit',
    principalRef: 'admin-A',
    source: 'web-chat',
    sessionId: 'session-admin-A',
  });

  const submitResult = ask.requestCommand(submitTurn, {
    action: 'requestSubmitForReview',
    target: card.id,
    expectedVersion: card.expectedVersion,
    nonce: 's1-submit',
  });

  const finalCard = cards.get(card.id);

  const checks = [
    createResult.ok,
    claimResult.ok,
    claimResult.decision === 'accepted',
    claimResult.lease?.id,
    claimResult.runnerReceipt?.signature,
    cp1.ok,
    cp2.ok,
    wk.ok,
    submitResult.ok,
    finalCard.state === 'submitted_for_review',
    !['done', 'closed'].includes(finalCard.state),
  ];

  return checks.every(Boolean);
}

function scenarioS2() {
  const startCount = devBoardStats.commandDispatchCount;
  const turn = makeTurn({
    turnId: 'turn-s2-forbidden',
    toolCallId: 'tool-s2-forbidden',
    principalRef: 'admin-A',
    source: 'web-chat',
    sessionId: 'session-admin-A',
  });

  const result = ask.requestCommand(turn, {
    action: 'Done',
    target: 'card-xx',
    expectedVersion: 1,
    nonce: 's2-forbidden',
  });

  return (
    !result.ok &&
    result.reason === 'forbidden-verb' &&
    result.decision === 'rejected' &&
    devBoardStats.commandDispatchCount === startCount
  );
}

function scenarioS3() {
  const card = seedCard({ title: 'S3 disconnect containment', principalRef: 'admin-B', sourceRef: 'web-chat' });
  const startVersion = card.expectedVersion;
  const startResult = ask.requestCommand(makeTurn({
    turnId: 'turn-s3-start',
    toolCallId: 'tool-s3-start',
    principalRef: 'admin-B',
    source: 'web-chat',
    sessionId: 'session-admin-B',
  }), {
    action: 'requestClaimAndStart',
    target: card.id,
    expectedVersion: startVersion,
    nonce: 's3-claim',
  });

  const startContext = {
    leaseId: startResult.lease.id,
    fence: startResult.fence,
    nonce: startResult.nonce,
  };
  runner.checkpoint(card.id, 's3-checkpoint-before-disconnect', startContext);
  const beforeLeaseCount = devBoardStats.leaseCreatedCount;
  const disconnectResult = runner.disconnect(card.id, startContext);

  const blockedCard = cards.get(card.id);
  const noAutoFailover = !runner.running.has(card.id) && blockedCard.state === 'blocked' && blockedCard.executionUnknown === true;
  const lastCheckpointMatches = blockedCard.lastCheckpoint?.note === 's3-checkpoint-before-disconnect';
  const stoppedAfterDisconnect = !runner.running.has(card.id);

  const autoSubmitAttempt = ask.requestCommand(makeTurn({
    turnId: 'turn-s3-auto-submit',
    toolCallId: 'tool-s3-auto-submit',
    principalRef: 'admin-B',
    source: 'web-chat',
    sessionId: 'session-admin-B',
  }), {
    action: 'requestSubmitForReview',
    target: card.id,
    expectedVersion: blockedCard.expectedVersion,
    nonce: 's3-submit-while-blocked',
  });

  const explicitResume = ask.requestCommand(makeTurn({
    turnId: 'turn-s3-resume',
    toolCallId: 'tool-s3-resume',
    principalRef: 'admin-B',
    source: 'web-chat',
    sessionId: 'session-admin-B',
  }), {
    action: 'requestClaimAndStart',
    target: card.id,
    expectedVersion: blockedCard.expectedVersion,
    nonce: 's3-resume',
  });

  const afterResumeCard = cards.get(card.id);

  return (
    startResult.ok &&
    disconnectResult.ok &&
    noAutoFailover &&
    lastCheckpointMatches &&
    !autoSubmitAttempt.ok &&
    explicitResume.ok &&
    explicitResume.decision === 'accepted' &&
    afterResumeCard.leaseId !== startResult.lease.id &&
    devBoardStats.leaseCreatedCount === beforeLeaseCount + 1 &&
    !afterResumeCard.executionUnknown &&
    stoppedAfterDisconnect &&
    afterResumeCard.state === 'in_progress'
  );
}

function scenarioS4() {
  const card = seedCard({ title: 'S4 reauth mismatch', principalRef: 'admin-C', sourceRef: 'web-chat' });
  const baseVersion = card.expectedVersion;
  const leaseCountBefore = devBoardStats.leaseCreatedCount;

  const staleVersionResult = ask.requestCommand(makeTurn({
    turnId: 'turn-s4-stale',
    toolCallId: 'tool-s4-stale',
    principalRef: 'admin-C',
    source: 'web-chat',
    sessionId: 'session-admin-C',
  }), {
    action: 'requestClaimAndStart',
    target: card.id,
    expectedVersion: baseVersion + 1,
    nonce: 's4-stale',
  });

  const principalMismatchResult = ask.requestCommand(makeTurn({
    turnId: 'turn-s4-principal',
    toolCallId: 'tool-s4-principal',
    principalRef: 'admin-Z',
    source: 'web-chat',
    sessionId: 'session-admin-Z',
  }), {
    action: 'requestClaimAndStart',
    target: card.id,
    expectedVersion: baseVersion,
    nonce: 's4-principal',
  });

  const sourceMismatchResult = ask.requestCommand(makeTurn({
    turnId: 'turn-s4-source',
    toolCallId: 'tool-s4-source',
    principalRef: 'admin-C',
    source: 'slack-chat',
    sessionId: 'session-admin-C-slack',
  }), {
    action: 'requestClaimAndStart',
    target: card.id,
    expectedVersion: baseVersion,
    nonce: 's4-source',
  });

  const leaseCountAfter = devBoardStats.leaseCreatedCount;

  return (
    staleVersionResult.ok === false && staleVersionResult.reason === 'expectedVersion-mismatch' &&
    principalMismatchResult.ok === false && principalMismatchResult.reason === 'principal-mismatch' &&
    sourceMismatchResult.ok === false && sourceMismatchResult.reason === 'source-mismatch' &&
    cards.get(card.id).expectedVersion === baseVersion &&
    leaseCountAfter === leaseCountBefore
  );
}

function scenarioS5() {
  const card = seedCard({ title: 'S5 replay dedupe', principalRef: 'admin-D', sourceRef: 'web-chat' });
  const claimVersion = card.expectedVersion;

  const first = ask.requestCommand(makeTurn({
    turnId: 'turn-s5-repeat',
    toolCallId: 'tool-s5-repeat',
    principalRef: 'admin-D',
    source: 'web-chat',
    sessionId: 'session-admin-D',
  }), {
    action: 'requestClaimAndStart',
    target: card.id,
    expectedVersion: claimVersion,
    nonce: 's5-identical-nonce',
  });

  const leaseCountAfterFirst = devBoardStats.leaseCreatedCount;

  const second = ask.requestCommand(makeTurn({
    turnId: 'turn-s5-repeat-again',
    toolCallId: 'tool-s5-repeat-again',
    principalRef: 'admin-D',
    source: 'web-chat',
    sessionId: 'session-admin-D',
  }), {
    action: 'requestClaimAndStart',
    target: card.id,
    expectedVersion: claimVersion,
    nonce: 's5-identical-nonce',
  });

  const leaseCountAfterSecond = devBoardStats.leaseCreatedCount;

  return (
    first.ok &&
    second.ok &&
    second.deduped === true &&
    first.commandRef === second.commandRef &&
    leaseCountAfterSecond === leaseCountAfterFirst
  );
}

function scenarioS6() {
  const initialDispatchCount = devBoardStats.commandDispatchCount;
  const initialRejectedCount = auditLog.filter((row) => row.type === 'ask-admin.rejected' && row.reason === 'unverified-session')
    .length;

  const forgedResult = ask.requestCommand(makeTurn({
    turnId: 'turn-s6-forged',
    toolCallId: 'tool-s6-forged',
    sessionId: 'session-admin-ghost',
  }), {
    action: 'requestCreateBacklogDevTicket',
    payload: { title: 'S6 forged session should fail' },
    nonce: 's6-forged',
  });

  const missingPrincipalResult = ask.requestCommand(makeTurn({
    turnId: 'turn-s6-missing-principal',
    toolCallId: 'tool-s6-missing-principal',
    sessionId: 'session-admin-FORBIDDEN',
  }), {
    action: 'requestCreateBacklogDevTicket',
    payload: { title: 'S6 missing principal session should fail' },
    nonce: 's6-missing-principal',
  });

  const rejectedCount = auditLog.filter((row) => row.type === 'ask-admin.rejected' && row.reason === 'unverified-session')
    .length;

  return (
    !forgedResult.ok &&
    forgedResult.reason === 'unverified-session' &&
    !missingPrincipalResult.ok &&
    missingPrincipalResult.reason === 'unverified-session' &&
    devBoardStats.commandDispatchCount === initialDispatchCount &&
    rejectedCount === initialRejectedCount + 2
  );
}

function scenarioS7() {
  const card = seedCard({ title: 'S7 stale-version resume', principalRef: 'admin-E', sourceRef: 'web-chat' });
  const startVersion = card.expectedVersion;

  const startResult = ask.requestCommand(makeTurn({
    turnId: 'turn-s7-start',
    toolCallId: 'tool-s7-start',
    principalRef: 'admin-E',
    source: 'web-chat',
    sessionId: 'session-admin-E',
  }), {
    action: 'requestClaimAndStart',
    target: card.id,
    expectedVersion: startVersion,
    nonce: 's7-claim',
  });

  const leaseContext = {
    leaseId: startResult.lease.id,
    fence: startResult.fence,
    nonce: startResult.nonce,
  };
  runner.checkpoint(card.id, 's7-checkpoint-before-disconnect', leaseContext);

  const beforeDisconnectVersion = cards.get(card.id).expectedVersion;
  const disconnectResult = runner.disconnect(card.id, leaseContext);

  const staleResume = ask.requestCommand(makeTurn({
    turnId: 'turn-s7-resume-stale',
    toolCallId: 'tool-s7-resume-stale',
    principalRef: 'admin-E',
    source: 'web-chat',
    sessionId: 'session-admin-E',
  }), {
    action: 'requestClaimAndStart',
    target: card.id,
    expectedVersion: beforeDisconnectVersion,
    nonce: 's7-resume-stale',
  });

  const freshVersion = cards.get(card.id).expectedVersion;
  const freshResume = ask.requestCommand(makeTurn({
    turnId: 'turn-s7-resume-fresh',
    toolCallId: 'tool-s7-resume-fresh',
    principalRef: 'admin-E',
    source: 'web-chat',
    sessionId: 'session-admin-E',
  }), {
    action: 'requestClaimAndStart',
    target: card.id,
    expectedVersion: freshVersion,
    nonce: 's7-resume-fresh',
  });

  const resumedCard = cards.get(card.id);

  return (
    startResult.ok &&
    disconnectResult.ok &&
    staleResume.ok === false &&
    staleResume.reason === 'expectedVersion-mismatch' &&
    freshResume.ok &&
    freshResume.decision === 'accepted' &&
    resumedCard.leaseId === freshResume.lease.id &&
    resumedCard.leaseId !== startResult.lease.id
  );
}

function scenarioS8() {
  const card = seedCard({ title: 'S8 cross-caller replay', principalRef: 'admin-H', sourceRef: 'web-chat' });
  const claimPayload = { assignee: 'operator-H' };
  const claimVersion = card.expectedVersion;

  const first = ask.requestCommand(makeTurn({
    turnId: 'turn-s8-first',
    toolCallId: 'tool-s8-first',
    principalRef: 'admin-H',
    source: 'web-chat',
    sessionId: 'session-admin-H',
  }), {
    action: 'requestAssign',
    target: card.id,
    expectedVersion: claimVersion,
    payload: claimPayload,
    nonce: 's8-shared-nonce',
  });

  const crossCaller = ask.requestCommand(makeTurn({
    turnId: 'turn-s8-cross-caller',
    toolCallId: 'tool-s8-cross-caller',
    principalRef: 'admin-I',
    source: 'web-chat',
    sessionId: 'session-admin-I',
  }), {
    action: 'requestAssign',
    target: card.id,
    expectedVersion: cards.get(card.id).expectedVersion,
    payload: claimPayload,
    nonce: 's8-shared-nonce',
  });

  const missingKey = ask.requestCommand(makeTurn({
    turnId: 'turn-s8-missing-key',
    sessionId: 'session-admin-H',
  }), {
    action: 'requestAssign',
    target: card.id,
    expectedVersion: cards.get(card.id).expectedVersion,
    payload: claimPayload,
  });

  return (
    first.ok &&
    crossCaller.ok === false &&
    crossCaller.deduped !== true &&
    crossCaller.reason === 'principal-mismatch' &&
    missingKey.ok === false &&
    missingKey.reason === 'missing-idempotency-key'
  );
}

function scenarioS9() {
  const card = seedCard({ title: 'S9 old-fence writes', principalRef: 'admin-I', sourceRef: 'web-chat' });
  const startVersion = card.expectedVersion;

  const startResult = ask.requestCommand(makeTurn({
    turnId: 'turn-s9-start',
    toolCallId: 'tool-s9-start',
    principalRef: 'admin-I',
    source: 'web-chat',
    sessionId: 'session-admin-I',
  }), {
    action: 'requestClaimAndStart',
    target: card.id,
    expectedVersion: startVersion,
    nonce: 's9-claim',
  });

  const originalContext = {
    leaseId: startResult.lease.id,
    fence: startResult.fence,
    nonce: startResult.nonce,
  };
  const initialCheckpoint = runner.checkpoint(card.id, 's9-initial-checkpoint', originalContext);

  const disconnectResult = runner.disconnect(card.id, originalContext);
  const preResumeVersion = cards.get(card.id).expectedVersion;
  const resumeResult = ask.requestCommand(makeTurn({
    turnId: 'turn-s9-resume',
    toolCallId: 'tool-s9-resume',
    principalRef: 'admin-I',
    source: 'web-chat',
    sessionId: 'session-admin-I',
  }), {
    action: 'requestClaimAndStart',
    target: card.id,
    expectedVersion: preResumeVersion,
    nonce: 's9-resume',
  });

  const resumedContext = {
    leaseId: resumeResult.lease.id,
    fence: resumeResult.fence,
    nonce: resumeResult.nonce,
  };

  const oldFenceCheckpoint = runner.checkpoint(card.id, 's9-old-fence-checkpoint', originalContext);
  const oldFenceWorklog = runner.worklog(card.id, 's9-old-fence-worklog', originalContext);
  const freshCheckpoint = runner.checkpoint(card.id, 's9-fresh-checkpoint', resumedContext);

  return (
    startResult.ok &&
    initialCheckpoint.ok &&
    disconnectResult.ok &&
    resumeResult.ok &&
    resumeResult.decision === 'accepted' &&
    oldFenceCheckpoint.ok === false &&
    oldFenceWorklog.ok === false &&
    freshCheckpoint.ok
  );
}

function scenarioS10() {
  const card = seedCard({ title: 'S10 resume-nonce-reuse', principalRef: 'admin-F', sourceRef: 'web-chat' });
  const claimVersion = card.expectedVersion;

  const startResult = ask.requestCommand(makeTurn({
    turnId: 'turn-s10-start',
    toolCallId: 'tool-s10-start',
    principalRef: 'admin-F',
    source: 'web-chat',
    sessionId: 'session-admin-F',
  }), {
    action: 'requestClaimAndStart',
    target: card.id,
    expectedVersion: claimVersion,
    nonce: 's10-claim',
  });

  const startContext = {
    leaseId: startResult.lease.id,
    fence: startResult.fence,
    nonce: startResult.nonce,
  };

  const disconnectResult = runner.disconnect(card.id, startContext);
  const blockedVersion = cards.get(card.id).expectedVersion;

  const reusedNonceResume = ask.requestCommand(makeTurn({
    turnId: 'turn-s10-resume-reuse',
    toolCallId: 'tool-s10-resume-reuse',
    principalRef: 'admin-F',
    source: 'web-chat',
    sessionId: 'session-admin-F',
  }), {
    action: 'requestClaimAndStart',
    target: card.id,
    expectedVersion: blockedVersion,
    nonce: 's10-claim',
  });

  const freshNonceResume = ask.requestCommand(makeTurn({
    turnId: 'turn-s10-resume-fresh',
    toolCallId: 'tool-s10-resume-fresh',
    principalRef: 'admin-F',
    source: 'web-chat',
    sessionId: 'session-admin-F',
  }), {
    action: 'requestClaimAndStart',
    target: card.id,
    expectedVersion: blockedVersion,
    nonce: 's10-resume',
  });

  const currentCard = cards.get(card.id);

  return (
    startResult.ok &&
    disconnectResult.ok &&
    reusedNonceResume.ok === false &&
    reusedNonceResume.reason === 'nonce-reuse-for-resume' &&
    freshNonceResume.ok &&
    freshNonceResume.decision === 'accepted' &&
    currentCard.leaseId === freshNonceResume.lease.id &&
    currentCard.leaseId !== startResult.lease.id &&
    !currentCard.executionUnknown
  );
}

function scenarioS11() {
  const card = seedCard({ title: 'S11 delayed-old-lease-event', principalRef: 'admin-G', sourceRef: 'web-chat' });
  const startVersion = card.expectedVersion;

  const startResult = ask.requestCommand(makeTurn({
    turnId: 'turn-s11-start',
    toolCallId: 'tool-s11-start',
    principalRef: 'admin-G',
    source: 'web-chat',
    sessionId: 'session-admin-G',
  }), {
    action: 'requestClaimAndStart',
    target: card.id,
    expectedVersion: startVersion,
    nonce: 's11-claim',
  });

  const oldContext = {
    leaseId: startResult.lease.id,
    fence: startResult.fence,
    nonce: startResult.nonce,
  };

  const initialDisconnect = runner.disconnect(card.id, oldContext);
  const preResumeVersion = cards.get(card.id).expectedVersion;

  const resumeResult = ask.requestCommand(makeTurn({
    turnId: 'turn-s11-resume',
    toolCallId: 'tool-s11-resume',
    principalRef: 'admin-G',
    source: 'web-chat',
    sessionId: 'session-admin-G',
  }), {
    action: 'requestClaimAndStart',
    target: card.id,
    expectedVersion: preResumeVersion,
    nonce: 's11-resume',
  });

  const resumedContext = {
    leaseId: resumeResult.lease.id,
    fence: resumeResult.fence,
    nonce: resumeResult.nonce,
  };

  const staleCheckpoint = runner.checkpoint(card.id, 's11-stale-checkpoint', oldContext);
  const staleWorklog = runner.worklog(card.id, 's11-stale-worklog', oldContext);
  const staleDisconnect = runner.disconnect(card.id, oldContext);
  const liveCheckpoint = runner.checkpoint(card.id, 's11-live-checkpoint', resumedContext);
  const liveDisconnect = runner.disconnect(card.id, resumedContext);

  const finalCard = cards.get(card.id);

  return (
    startResult.ok &&
    initialDisconnect.ok &&
    resumeResult.ok &&
    resumeResult.decision === 'accepted' &&
    staleCheckpoint.ok === false &&
    staleWorklog.ok === false &&
    staleDisconnect.ok === false &&
    liveCheckpoint.ok &&
    liveDisconnect.ok &&
    finalCard.state === 'blocked' &&
    finalCard.executionUnknown === true &&
    finalCard.leaseId === null
  );
}

function run() {
  const scenarios = [
    ['S1', scenarioS1],
    ['S2', scenarioS2],
    ['S3', scenarioS3],
    ['S4', scenarioS4],
    ['S5', scenarioS5],
    ['S6', scenarioS6],
    ['S7', scenarioS7],
    ['S8', scenarioS8],
    ['S9', scenarioS9],
    ['S10', scenarioS10],
    ['S11', scenarioS11],
  ];

  let allPass = true;
  for (const [name, fn] of scenarios) {
    allPass = runScenario(name, fn) && allPass;
  }

  console.log('');
  console.log('=== Delegation Cards ===');
  for (const card of cards.values()) {
    const row = snapshotCard(card);
    console.log(`  ${row.id} ${row.title}`);
    console.log(`    state=${row.state} expectedVersion=${row.expectedVersion} executionUnknown=${row.executionUnknown}`);
    console.log(`    lastCheckpoint=${JSON.stringify(row.lastCheckpoint)}`);
    console.log(`    principal=${row.principalRef} source=${row.sourceRef}`);
    if (row.checkpointCount) {
      const trace = cards.get(card.id).checkpoints.slice(-2);
      console.log(`    checkpoints=${row.checkpointCount} lastTwo=${trace.map((cp) => cp.id).join(',')}`);
    }
  }

  console.log('');
  console.log('=== Leases ===');
  if (!leases.size) {
    console.log('  none');
  }
  for (const lease of leases.values()) {
    console.log(`  ${lease.id} card=${lease.cardId} fence=${lease.fence} nonce=${lease.nonce}`);
  }

  console.log('');
  console.log('=== Audit sample (first 40) ===');
  for (const row of auditLog.slice(0, 40)) {
    console.log(`  ${row.type} :: ${JSON.stringify(row)}`);
  }

  console.log('');
  console.log(`SCENARIO_SUMMARY=${allPass ? 'PASS' : 'FAIL'}`);
  if (!allPass) {
    process.exit(1);
  }
}

run();
