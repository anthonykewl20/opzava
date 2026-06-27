import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runMigrations } from '@/lib/migrations'
import type { CardCreationInput, CardCreationPort } from '@/opzava/platform/composition/task-write-seam'
import { createRunnerRepository } from '@/opzava/platform/runner/repository'
import { decomposeCardIdempotencyKey } from '@/opzava/platform/orchestrator/decompose-card-job'
import { launchWork } from './launch-work'

let db: Database.Database
let repo: ReturnType<typeof createRunnerRepository>
let seq: number

const ids = () => {
  seq += 1
  return `id-${seq}`
}

function fakeCards(created = true, cardId = 42): { port: CardCreationPort; calls: CardCreationInput[] } {
  const calls: CardCreationInput[] = []
  return {
    calls,
    port: {
      createCard: (input) => {
        calls.push(input)
        return { cardId, created }
      },
    },
  }
}

function deps(cards: CardCreationPort) {
  return {
    cards,
    runnerRepo: repo,
    transact: <T>(fn: () => T): T => fn(),
    now: () => '2026-06-27T00:00:00.000Z',
    newId: ids,
  }
}

const input = {
  workspaceId: 1,
  conversationId: 'coord:admin:opzava',
  actionId: 'act-1',
  actor: 'admin',
  projectId: 7,
  title: 'Series B outreach sequence',
  description: 'Draft + send',
}

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
  repo = createRunnerRepository(db)
  repo.ensureSchema()
  seq = 0
})

afterEach(() => db.close())

describe('launchWork', () => {
  it('creates a correlated Card and enqueues a durable decompose-card job', () => {
    const cards = fakeCards(true, 42)
    const result = launchWork(input, deps(cards.port))

    expect(result).toMatchObject({ cardId: 42, runId: 'run_act-1', idempotent: false })

    // Card carries the deterministic clientRequestId + the decompose flag/correlation in metadata.
    const sent = cards.calls[0]
    expect(sent.clientRequestId).toBe('launch:coord:admin:opzava:act-1')
    expect(sent.metadata).toMatchObject({
      opzava: { decompose: { needs: true, status: 'queued', conversationId: 'coord:admin:opzava', runId: 'run_act-1' } },
    })

    // A durable decompose-card job was enqueued for the Card.
    const job = repo.getJobByIdempotencyKey(decomposeCardIdempotencyKey(42))
    expect(job?.job.payload).toMatchObject({ kind: 'decompose-card', cardId: 42, runId: 'run_act-1' })
  })

  it('reports idempotent when the Card already existed (replayed launch)', () => {
    const cards = fakeCards(false, 99)
    const result = launchWork(input, deps(cards.port))
    expect(result).toMatchObject({ cardId: 99, idempotent: true })
  })

  it('derives runId deterministically from the actionId (double-send safe)', () => {
    const a = launchWork(input, deps(fakeCards().port))
    const b = launchWork(input, deps(fakeCards().port))
    expect(a.runId).toBe(b.runId)
  })
})
