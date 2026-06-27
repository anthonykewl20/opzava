import { randomUUID } from 'crypto'

import type Database from 'better-sqlite3'

import { eventBus } from '@/lib/event-bus'
import { createApprovalRepository } from '@/opzava/core/approvals/approval-repository'
import {
  createApprovedActionRegistry,
  createPostApprovalDispatcher,
  type ApprovedActionHandler,
  type ApprovedActionOutcome,
  type ApprovedActionRegistry,
  type ApprovedActionTurnSink,
  type PostApprovalDispatcher,
} from '@/opzava/core/approvals/post-approval-dispatcher'
import { createConversationRepository, type ConversationTurn } from '@/opzava/modules/conversations'
import {
  CAMPAIGN_SEND_REQUESTED_ACTION,
  campaignSendApprovalId,
  createGuardedCampaignSendExecutorForCampaign,
  createLiveResendProviderAdapter,
  createLiveResendProviderProfile,
  RESEND_API_KEY_SECRET_REFERENCE,
  resolveResendCampaignConnection,
  runApprovedCampaign,
} from '@/opzava/modules/content'
import { createEnvSecretResolver } from '@/opzava/platform/providers/env-secret-resolver'

// Composition root for ARD 0029 — the ONE place that imports feature modules and assembles the
// PostApprovalDispatcher's registry (handlers register here; the dispatcher itself imports none of
// them, so platform↛modules / core↛platform hold). The campaign-send handler reuses the existing
// guarded Resend send (its LIVE execution is verified in S4); the turn sink writes the outcome turn
// into the launching Ask-Opzava thread.

// ── Outcome turn sink (Engine-A adapter over the conversation store + the realtime bus) ──

function outcomeBody(outcome: ApprovedActionOutcome): string {
  if (outcome.kind === 'failed') return `Couldn't complete that — ${outcome.summary}`
  if (outcome.kind === 'already-done') return outcome.summary
  return `✓ ${outcome.summary}`
}

export interface OutcomeTurnSinkDeps {
  readonly now: () => string
  readonly workspaceId: number
  readonly broadcast?: (type: 'conversation.turn_added', data: unknown) => void
}

export function createConversationOutcomeTurnSink(
  db: Database.Database,
  deps: OutcomeTurnSinkDeps,
): ApprovedActionTurnSink {
  const broadcast = deps.broadcast ?? ((type, data) => eventBus.broadcast(type, data))
  return {
    postOutcomeTurn({ correlation, approvalId, outcome }) {
      const repo = createConversationRepository(db)
      // Deterministic turnId → appendTurn is an idempotent upsert (a re-dispatch posts no second turn).
      const turn: ConversationTurn = {
        turnId: `approval-outcome:${approvalId}`,
        conversationId: correlation.conversationId,
        parentTurnId: null,
        author: 'Opzava',
        role: 'system',
        body: outcomeBody(outcome),
        refType: 'approval',
        refId: approvalId,
        messageAnchor: null,
        status: null,
        record: { outcome },
        createdAt: deps.now(),
      }
      repo.appendTurn(turn)
      repo.touchLastMessageAt(correlation.conversationId, deps.now())
      broadcast('conversation.turn_added', { conversation_id: correlation.conversationId, turn, workspace_id: deps.workspaceId })
    },
  }
}

// ── Campaign-send handler (reuses the existing guarded Resend send; LIVE-verified in S4) ──

async function executeApprovedCampaignSend(db: Database.Database, campaignId: string): Promise<void> {
  const read = (key: string) =>
    (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value
  const resolver = createEnvSecretResolver({ readEnv: (name) => process.env[name] })
  const resolved = await resolveResendCampaignConnection({ readSetting: read, resolver })
  if (!resolved.ok) {
    throw new Error(
      resolved.reason === 'secret-unavailable'
        ? 'Resend API key is not available (set the RESEND_API_KEY secret)'
        : 'Resend is not configured',
    )
  }
  const now = () => new Date().toISOString()
  const http = async (url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
    const res = await fetch(url, init)
    return { ok: res.ok, status: res.status, json: () => res.json() }
  }
  const adapter = createLiveResendProviderAdapter({ connection: resolved.connection, http, now })
  const profile = createLiveResendProviderProfile(RESEND_API_KEY_SECRET_REFERENCE.id)
  const approval = createApprovalRepository(db).getApprovalById(campaignSendApprovalId(campaignId))
  const sendExecutor = createGuardedCampaignSendExecutorForCampaign({
    db,
    adapter,
    profile,
    resolver,
    approval,
    campaignId,
    newId: () => randomUUID(),
    clock: { now: () => new Date(), nowIso: now },
  })
  await runApprovedCampaign(
    {
      db,
      sendExecutor,
      newId: () => randomUUID(),
      now,
      workflowRunId: `campaign-run:${campaignId}`,
      clock: { now: () => new Date() },
      ids: { attemptId: () => randomUUID(), deadLetterId: ({ jobId, attemptId }) => `dl-${jobId}-${attemptId}` },
    },
    { campaignId },
  )
}

export function createCampaignSendApprovedActionHandler(
  db: Database.Database,
  execute: (db: Database.Database, campaignId: string) => Promise<void> = executeApprovedCampaignSend,
): ApprovedActionHandler {
  return {
    requestedAction: CAMPAIGN_SEND_REQUESTED_ACTION,
    async trigger({ approval }) {
      const campaignId = approval.target.id
      try {
        await execute(db, campaignId)
        return { kind: 'triggered', summary: 'The campaign is sending now.', ref: { type: 'run', id: campaignId } }
      } catch (err) {
        return {
          kind: 'failed',
          summary: err instanceof Error ? err.message : 'The send could not be started.',
          errorKind: 'send-failed',
        }
      }
    },
  }
}

// ── Registry + dispatcher assembly ──

export function resolveApprovedActionHandlers(db: Database.Database): ApprovedActionRegistry {
  return createApprovedActionRegistry([createCampaignSendApprovedActionHandler(db)])
}

/**
 * request_changes_redraft (ARD 0028 Q10 / 0029): a rejected approval posts the typed feedback into
 * its launching thread as a revision turn, so the operator can ask the Concierge for a revised draft
 * (the revision loop is the conversation). No-op for an un-correlated approval.
 */
export function postRequestChangesRevisionTurn(
  db: Database.Database,
  input: Readonly<{ correlation: { conversationId: string; runId: string } | null; approvalId: string; reason: string }>,
  deps: Readonly<{ now: () => string; newId: () => string; workspaceId: number; broadcast?: (type: 'conversation.turn_added', data: unknown) => void }>,
): void {
  if (!input.correlation) return
  const broadcast = deps.broadcast ?? ((type, data) => eventBus.broadcast(type, data))
  const repo = createConversationRepository(db)
  const turn: ConversationTurn = {
    turnId: deps.newId(),
    conversationId: input.correlation.conversationId,
    parentTurnId: null,
    author: 'Opzava',
    role: 'system',
    body: `Changes requested — the send was declined: ${input.reason}`,
    refType: 'approval',
    refId: input.approvalId,
    messageAnchor: null,
    status: null,
    record: { requestChanges: true, reason: input.reason },
    createdAt: deps.now(),
  }
  repo.appendTurn(turn)
  repo.touchLastMessageAt(input.correlation.conversationId, deps.now())
  broadcast('conversation.turn_added', { conversation_id: input.correlation.conversationId, turn, workspace_id: deps.workspaceId })
}

export interface DispatcherCompositionDeps {
  readonly workspaceId: number
  readonly now?: () => string
  readonly broadcast?: (type: 'conversation.turn_added', data: unknown) => void
}

export function composePostApprovalDispatcher(
  db: Database.Database,
  deps: DispatcherCompositionDeps,
): PostApprovalDispatcher {
  const now = deps.now ?? (() => new Date().toISOString())
  return createPostApprovalDispatcher({
    registry: resolveApprovedActionHandlers(db),
    turnSink: createConversationOutcomeTurnSink(db, { now, workspaceId: deps.workspaceId, broadcast: deps.broadcast }),
  })
}
