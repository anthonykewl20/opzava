import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runMigrations } from '@/lib/migrations'
import type { ProviderPort } from '@/opzava/platform/execution/contracts'
import type { NeedsYouRollup } from '@/opzava/platform/project-health/needs-you-rollup'
import { createConversationRepository } from '../conversation-repository'
import { createOrchestratorActionRegistry, type OrchestratorAction } from './action-registry'
import { askOrchestrator } from './ask-orchestrator'

let db: Database.Database
let repo: ReturnType<typeof createConversationRepository>

const emptyRollup: NeedsYouRollup = { needsYou: 0, blocked: 0, projects: [] }
const rollupReader = (rollup: NeedsYouRollup = emptyRollup) => ({ read: () => rollup })

function providerReturning(text: string): { provider: ProviderPort; invoke: ReturnType<typeof vi.fn> } {
  const invoke = vi.fn(async () => ({ text }))
  return { provider: { invoke, isAvailable: () => true }, invoke }
}

function idGen() {
  let n = 0
  return () => `id-${++n}`
}

const fakeInternal = (actionType: string): OrchestratorAction => ({
  kind: 'internal-reversible',
  actionType,
  execute: async () => ({ resultTurn: { body: 'done' } }),
})

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
  repo = createConversationRepository(db)
  repo.saveConversation({
    conversationId: 'coord:admin:opzava',
    type: 'orchestrator',
    projectId: null,
    participants: ['admin'],
    title: 'Ask Opzava',
    record: {},
    createdAt: 't0',
    lastMessageAt: null,
  })
})

afterEach(() => db.close())

function baseDeps(provider: ProviderPort, registry = createOrchestratorActionRegistry([])) {
  return {
    provider,
    model: 'gpt-frontier',
    readNeedsYouRollup: rollupReader(),
    actionRegistry: registry,
    conversationRepo: repo,
    now: () => 't1',
    newId: idGen(),
  }
}

const askCtx = { workspaceId: 1, conversationId: 'coord:admin:opzava', actor: 'admin', prompt: "How's everything?" }

describe('askOrchestrator', () => {
  it('persists the human prompt and the AI narration as turns', async () => {
    const { provider } = providerReturning(JSON.stringify({ narration: 'All on track.', actions: [] }))
    const result = await askOrchestrator(baseDeps(provider), askCtx)

    expect(result.humanTurn.role).toBe('human')
    expect(result.humanTurn.body).toBe("How's everything?")
    expect(result.narrationTurn.role).toBe('ai')
    expect(result.narrationTurn.body).toBe('All on track.')

    const turns = repo.listTurns('coord:admin:opzava')
    expect(turns.map((t) => t.role)).toEqual(['human', 'ai'])
  })

  it('injects the deterministic rollup facts into the model prompt (narration-only)', async () => {
    const { provider, invoke } = providerReturning(JSON.stringify({ narration: 'ok', actions: [] }))
    const rollup: NeedsYouRollup = { needsYou: 2, blocked: 1, projects: [] }
    await askOrchestrator({ ...baseDeps(provider), readNeedsYouRollup: rollupReader(rollup) }, askCtx)
    const sentPrompt = invoke.mock.calls[0][0].prompt as string
    expect(sentPrompt).toContain('"needsYou":2')
    expect(sentPrompt).toContain('"blocked":1')
    expect(invoke.mock.calls[0][0].model).toBe('gpt-frontier')
  })

  it('persists a known proposed action as a pending action-block turn', async () => {
    const { provider } = providerReturning(
      JSON.stringify({ narration: 'I can chase that.', actions: [{ actionType: 'create_followup_task', args: { title: 'Chase reply' } }] }),
    )
    const registry = createOrchestratorActionRegistry([fakeInternal('create_followup_task')])
    const result = await askOrchestrator({ ...baseDeps(provider, registry) }, askCtx)

    expect(result.proposedActions).toHaveLength(1)
    expect(result.proposedActions[0]).toMatchObject({ actionType: 'create_followup_task', kind: 'internal-reversible', args: { title: 'Chase reply' } })

    const pending = repo.listTurns('coord:admin:opzava').filter((t) => t.status === 'pending')
    expect(pending).toHaveLength(1)
    expect(pending[0]?.record).toMatchObject({ action: { actionType: 'create_followup_task' } })
  })

  it('drops a proposed action whose type is not in the registry (allow-list)', async () => {
    const { provider } = providerReturning(
      JSON.stringify({ narration: 'hmm', actions: [{ actionType: 'delete_everything', args: {} }] }),
    )
    const result = await askOrchestrator(baseDeps(provider), askCtx) // empty registry
    expect(result.proposedActions).toHaveLength(0)
    expect(repo.listTurns('coord:admin:opzava').some((t) => t.status === 'pending')).toBe(false)
  })

  it('degrades gracefully when the model returns non-JSON: whole text is the narration', async () => {
    const { provider } = providerReturning('Everything looks fine to me.')
    const result = await askOrchestrator(baseDeps(provider), askCtx)
    expect(result.narrationTurn.body).toBe('Everything looks fine to me.')
    expect(result.proposedActions).toHaveLength(0)
  })
})
