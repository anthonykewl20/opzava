import { randomUUID } from 'crypto'

import type Database from 'better-sqlite3'

import { callOpenClawGateway } from '@/lib/openclaw-gateway'
import { resolveCoordinatorDeliveryTarget } from '@/lib/coordinator-routing'
import { getAllGatewaySessions, type GatewaySession } from '@/lib/sessions'
import type { ProviderPort } from '@/opzava/platform/execution/contracts'
import { ProviderError } from '@/opzava/platform/execution/gateway-provider'
import { createSqliteNeedsYouRollupReader } from '@/opzava/platform/project-health/needs-you-rollup'
import {
  createConversationRepository,
  createOrchestratorActionRegistry,
  makeCreateFollowupTaskAction,
  makeLaunchWorkAction,
  makeNotifyOwnerAction,
  type AskOrchestratorDeps,
  type ConversationRepository,
  type CreateFollowupTaskPort,
  type NotifyOwnerPort,
  type OrchestratorAction,
} from '@/opzava/modules/conversations'
import { createSqliteCardCreationPort } from '@/opzava/platform/composition/task-write-seam'
import { createRunnerRepository } from '@/opzava/platform/runner/repository'

// Engine-A composition root for Ask-Opzava (the one place that wires Engine-B + the gateway + the
// inherited tasks/notifications). The conversations module stays src/lib-free; all crossings are here.

const COORDINATOR_AGENT =
  String(process.env.MC_COORDINATOR_AGENT || process.env.NEXT_PUBLIC_COORDINATOR_AGENT || 'coordinator').trim() ||
  'coordinator'

/** Config-driven (golden principle: no hardcoded model). Empty → the gateway session's own model. */
const CONCIERGE_MODEL = String(process.env.MC_COORDINATOR_MODEL || '').trim()

/** One persistent Ask-Opzava thread per admin operator. */
export function orchestratorConversationId(username: string): string {
  return `coord:${username}:opzava`
}

export function ensureOrchestratorConversation(
  repo: ConversationRepository,
  conversationId: string,
  username: string,
  nowIso: string,
): void {
  if (repo.getConversationById(conversationId)) return
  repo.saveConversation({
    conversationId,
    type: 'orchestrator',
    projectId: null,
    participants: [username],
    title: 'Ask Opzava',
    record: {},
    createdAt: nowIso,
    lastMessageAt: nowIso,
  })
}

// ── Action ports (Engine-A effects behind the internal-reversible actions) ──

export function createFollowupTaskPort(db: Database.Database): CreateFollowupTaskPort {
  return {
    createFollowupTask({ title, projectId, actor, workspaceId }) {
      const info = db
        .prepare(
          `INSERT INTO tasks (title, status, project_id, created_by, workspace_id, created_at, updated_at)
           VALUES (?, 'inbox', ?, ?, ?, unixepoch(), unixepoch())`,
        )
        .run(title || 'Follow-up', projectId ?? null, actor, workspaceId)
      return { cardId: Number(info.lastInsertRowid) }
    },
  }
}

export function notifyOwnerPort(db: Database.Database): NotifyOwnerPort {
  return {
    notifyOwner({ message, actor, workspaceId }) {
      // v1: notify the operator who is chatting (project-owner lookup is #35 territory).
      db.prepare(
        `INSERT INTO notifications (recipient, type, title, message, source_type, workspace_id)
         VALUES (?, 'conversation', 'Ask Opzava', ?, 'conversation', ?)`,
      ).run(actor, message || 'Opzava flagged something for you.', workspaceId)
    },
  }
}

// ── Concierge gateway provider (ProviderPort over OpenClaw chat.send + agent.wait) ──

interface ConciergeProviderOpts {
  readonly sessionKey: string | null
  readonly model: string
  readonly pollWindowMs?: number
  readonly maxWaits?: number
  readonly gatewayCall?: <T>(method: string, params: unknown, timeoutMs?: number) => Promise<T>
}

export function createConciergeProvider(opts: ConciergeProviderOpts): ProviderPort {
  const gateway = opts.gatewayCall ?? callOpenClawGateway
  const pollWindowMs = opts.pollWindowMs ?? 6000
  const maxWaits = opts.maxWaits ?? 20
  return {
    isAvailable: () => opts.sessionKey !== null,
    async invoke({ prompt }) {
      if (!opts.sessionKey) {
        throw new ProviderError('unavailable', 'Ask Opzava gateway session is not reachable')
      }
      const send = await gateway<{ runId?: string }>(
        'chat.send',
        { sessionKey: opts.sessionKey, message: prompt, idempotencyKey: `ask-${randomUUID()}`, deliver: false },
        12000,
      )
      const runId = send?.runId
      if (!runId) throw new ProviderError('unavailable', 'gateway did not accept the message')
      for (let i = 0; i < maxWaits; i += 1) {
        const wait = await gateway<{ status?: string; text?: string }>(
          'agent.wait',
          { runId, timeoutMs: pollWindowMs },
          pollWindowMs + 5000,
        )
        if (wait?.status === 'complete') return { text: wait.text ?? '' }
        if (wait?.status === 'failed') throw new ProviderError('unavailable', 'gateway run failed')
      }
      throw new ProviderError('timeout', 'Ask Opzava timed out waiting for the gateway')
    },
  }
}

/**
 * Real coordinator liveness telemetry for the offline "Technical details" block (doc 19 / 100 T3):
 * derived from the actual gateway session record — never a fabricated id. `runId`/`lastSeen` are the
 * session's real values (or null when there is no session); the offline card renders only what this
 * returns and omits the rest, so no placeholder like `coord-session-4812` can ever appear.
 */
export interface CoordinatorStatus {
  readonly status: 'online' | 'offline'
  readonly runId: string | null
  readonly lastSeen: string | null
  readonly reason: string | null
}

export function probeCoordinatorStatus(sessions: readonly GatewaySession[], coordinatorAgent: string): CoordinatorStatus {
  const name = coordinatorAgent.toLowerCase()
  const matches = sessions.filter(
    (s) => s.agent.toLowerCase() === name || s.key.toLowerCase().includes(name),
  )
  const latest = matches.sort((a, b) => b.updatedAt - a.updatedAt)[0]
  if (!latest) return { status: 'offline', runId: null, lastSeen: null, reason: 'no_coordinator_session' }
  const lastSeen = new Date(latest.updatedAt).toISOString()
  const runId = latest.sessionId || null
  if (latest.active) return { status: 'online', runId, lastSeen, reason: null }
  return { status: 'offline', runId, lastSeen, reason: 'gateway_session_expired' }
}

/** The coordinator agent name the Concierge resolves against (config-or-default). */
export const CONCIERGE_COORDINATOR_AGENT = COORDINATOR_AGENT

/** Probe live coordinator status from the on-disk gateway session store. */
export function readCoordinatorStatus(): CoordinatorStatus {
  return probeCoordinatorStatus(getAllGatewaySessions(), COORDINATOR_AGENT)
}

/** Resolve the coordinator gateway session, mirroring the legacy coord chat path. */
export function resolveConciergeSessionKey(db: Database.Database, workspaceId: number): string | null {
  const allAgents = db
    .prepare('SELECT name, session_key, config FROM agents WHERE workspace_id = ?')
    .all(workspaceId) as Array<{ name: string; session_key?: string | null; config?: string | null }>
  const configuredCoordinatorTarget =
    (db.prepare("SELECT value FROM settings WHERE key = 'chat.coordinator_target_agent'").get() as
      | { value?: string }
      | undefined)?.value || null
  return resolveCoordinatorDeliveryTarget({
    to: COORDINATOR_AGENT,
    coordinatorAgent: COORDINATOR_AGENT,
    directAgent: null,
    allAgents,
    sessions: getAllGatewaySessions(),
    explicitSessionKey: null,
    configuredCoordinatorTarget,
  }).sessionKey
}

export interface OrchestratorUser {
  readonly username: string
  readonly workspace_id?: number | null
}

/** The project a chat-launched Card lands in when the proposal doesn't name one (first active project). */
function resolveDefaultProjectId(db: Database.Database, workspaceId: number): number | null {
  const row = db
    .prepare("SELECT id FROM projects WHERE workspace_id = ? AND status != 'archived' ORDER BY id ASC LIMIT 1")
    .get(workspaceId) as { id: number } | undefined
  return row?.id ?? null
}

export function composeAskOrchestratorDeps(db: Database.Database, user: OrchestratorUser): AskOrchestratorDeps {
  const workspaceId = user.workspace_id ?? 1
  const repo = createConversationRepository(db)
  const actions: OrchestratorAction[] = [
    makeCreateFollowupTaskAction(createFollowupTaskPort(db)),
    makeNotifyOwnerAction(notifyOwnerPort(db)),
  ]
  // launch_work needs a target project; without one (a fresh workspace) it isn't offered.
  const defaultProjectId = resolveDefaultProjectId(db, workspaceId)
  if (defaultProjectId !== null) {
    actions.push(
      makeLaunchWorkAction({
        cards: createSqliteCardCreationPort(db),
        runnerRepo: createRunnerRepository(db),
        transact: (fn) => db.transaction(fn)(),
        now: () => new Date().toISOString(),
        newId: () => randomUUID(),
        defaultProjectId,
      }),
    )
  }
  const registry = createOrchestratorActionRegistry(actions)
  return {
    provider: createConciergeProvider({ sessionKey: resolveConciergeSessionKey(db, workspaceId), model: CONCIERGE_MODEL }),
    model: CONCIERGE_MODEL,
    readNeedsYouRollup: createSqliteNeedsYouRollupReader(db),
    actionRegistry: registry,
    conversationRepo: repo,
    now: () => new Date().toISOString(),
    newId: () => randomUUID(),
  }
}
