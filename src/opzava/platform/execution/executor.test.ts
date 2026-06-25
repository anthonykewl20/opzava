import { describe, expect, it, vi } from 'vitest'

import type { ExecutorPlan, ExecutorTask, TokenUsage, UsageSink } from './contracts'
import { buildTaskPrompt, makeTaskExecutor } from './executor'
import { makeInMemoryProvider } from './in-memory-provider'

const task: ExecutorTask = { id: 7, title: 'Add rate limiting', description: 'throttle the API', priority: 'high' }
const plan: ExecutorPlan = { model: 'claude-sonnet-4-6', accountProfile: 'anthropic:max' }
const usage: TokenUsage = { model: 'claude-sonnet-4-6', inputTokens: 120, outputTokens: 80 }

function spySink(): UsageSink & { calls: Array<{ task: ExecutorTask; usage: TokenUsage }> } {
  const calls: Array<{ task: ExecutorTask; usage: TokenUsage }> = []
  return { calls, record: (t, u) => calls.push({ task: t, usage: u }) }
}

describe('TaskExecutor.execute', () => {
  it('completes with the provider text and records usage', async () => {
    const sink = spySink()
    const provider = makeInMemoryProvider(() => ({ text: 'done: limiter added', sessionId: 's1', usage }))
    const outcome = await makeTaskExecutor({ provider, usageSink: sink }).execute({ task, plan })

    expect(outcome).toEqual({ kind: 'completed', resultText: 'done: limiter added', sessionId: 's1', usage })
    expect(sink.calls).toHaveLength(1)
    expect(sink.calls[0].usage).toEqual(usage)
  })

  it('returns a deferred outcome when the provider hands back an async run', async () => {
    const provider = makeInMemoryProvider(() => ({ text: '', deferred: true, runId: 'run-9', sessionId: 's2' }))
    const outcome = await makeTaskExecutor({ provider, usageSink: spySink() }).execute({ task, plan })
    expect(outcome).toEqual({ kind: 'deferred', runId: 'run-9', sessionId: 's2' })
  })

  it('fails (not silently completes) when a provider defers without a runId', async () => {
    const provider = makeInMemoryProvider(() => ({ text: '', deferred: true }))
    const outcome = await makeTaskExecutor({ provider, usageSink: spySink() }).execute({ task, plan })
    expect(outcome.kind).toBe('failed')
    if (outcome.kind === 'failed') expect(outcome.errorClass).toBe('DeferredWithoutRunId')
  })

  it('maps a provider throw to a failed outcome (never crashes the caller)', async () => {
    const provider = makeInMemoryProvider(() => {
      throw new TypeError('gateway timeout')
    })
    const outcome = await makeTaskExecutor({ provider, usageSink: spySink() }).execute({ task, plan })
    expect(outcome).toEqual({ kind: 'failed', errorClass: 'TypeError', errorMessage: 'gateway timeout' })
  })

  it('does not record usage when the provider returns none', async () => {
    const sink = spySink()
    const provider = makeInMemoryProvider(() => ({ text: 'ok' }))
    await makeTaskExecutor({ provider, usageSink: sink }).execute({ task, plan })
    expect(sink.calls).toHaveLength(0)
  })

  it('buildTaskPrompt embeds title, description, priority, and rejection feedback', () => {
    const prompt = buildTaskPrompt({ ...task, rejectionFeedback: 'tests were missing' })
    expect(prompt).toContain('Add rate limiting')
    expect(prompt).toContain('throttle the API')
    expect(prompt).toContain('Priority: high')
    expect(prompt).toContain('## Previous Review Feedback')
    expect(prompt).toContain('tests were missing')
  })
})
