import { describe, expect, it } from 'vitest'

import type { TokenUsage } from './contracts'
import {
  makeGatewayProvider,
  ProviderError,
  type AgentAddress,
  type GatewayProviderDeps,
  type LeadSession,
  type ProviderTransportStrategy,
} from './gateway-provider'

// ── test doubles ───────────────────────────────────────────────────────────

type Gw = GatewayProviderDeps['gateway']
const gw = (fn: (method: string, params: unknown) => Promise<unknown>): Gw => fn as Gw

function strategy(over: Partial<ProviderTransportStrategy> = {}): ProviderTransportStrategy {
  return {
    resolveAddress: (): AgentAddress => ({ via: 'gateway-agent', agentId: 'lead-orchestrator' }),
    parseUsageEvent: () => null,
    classifyError: () => ({ code: 'unavailable' }),
    isReachable: () => true,
    ...over,
  }
}

function session(over: Partial<LeadSession> = {}): LeadSession {
  return { ensureActive: async () => {}, isActive: () => true, ...over }
}

/** A scripted gateway: `chat.send` returns `send`; each `agent.wait` returns the next `waits` entry (last repeats). */
function scriptedGateway(script: { send?: unknown; waits?: unknown[] }): Gw {
  let i = 0
  return gw(async (method) => {
    if (method === 'chat.send') return script.send ?? { runId: 'run-1' }
    if (method === 'agent.wait') {
      const list = script.waits ?? [{ status: 'complete', text: '' }]
      return list[Math.min(i++, list.length - 1)]
    }
    return {}
  })
}

function makeProvider(over: Partial<GatewayProviderDeps> = {}, configOver: Record<string, unknown> = {}) {
  const deps: GatewayProviderDeps = {
    transport: strategy(),
    session: session(),
    gateway: scriptedGateway({ send: { runId: 'run-1' }, waits: [{ status: 'complete', text: '' }] }),
    ...over,
  }
  return makeGatewayProvider({ sessionKey: 'lead-orchestrator', ...configOver }, deps)
}

describe('makeGatewayProvider — gateway-agent path', () => {
  // AC1 — tracer bullet
  it('AC1: synchronous invoke resolves the graph text from chat.send→agent.wait(complete)', async () => {
    const provider = makeProvider({
      gateway: scriptedGateway({ send: { runId: 'run-1' }, waits: [{ status: 'complete', text: '{"steps":[]}' }] }),
    })
    const result = await provider.invoke({ prompt: 'decompose CARD-1', model: 'openai/gpt-5.5' })
    expect(result.text).toBe('{"steps":[]}')
  })

  // AC2 — usage rides ProviderResult.usage; the adapter never records it (matching makeInMemoryProvider +
  // the ProviderPort/executor contract). The executor records worker usage; orchestration usage = K0/Q3 (deferred).
  it('AC2: populates ProviderResult.usage from the strategy parseUsageEvent on the terminal payload', async () => {
    const usage: TokenUsage = { model: 'openai/gpt-5.5', inputTokens: 100, outputTokens: 40 }
    const provider = makeProvider({
      transport: strategy({ parseUsageEvent: (e) => ((e as { status?: string })?.status === 'complete' ? usage : null) }),
      gateway: scriptedGateway({ send: { runId: 'r' }, waits: [{ status: 'complete', text: 'ok' }] }),
    })
    const result = await provider.invoke({ prompt: 'p', model: 'openai/gpt-5.5' })
    expect(result.usage).toEqual(usage)
  })

  // AC3 — 401 → unauthenticated
  it('AC3: throws ProviderError(unauthenticated) on a 401-class transport failure', async () => {
    const provider = makeProvider({
      transport: strategy({ classifyError: () => ({ code: 'unauthenticated' }) }),
      gateway: gw(async (m) => { if (m === 'chat.send') throw new Error('401'); return {} }),
    })
    await expect(provider.invoke({ prompt: 'p', model: 'm' })).rejects.toMatchObject({
      name: 'ProviderError', code: 'unauthenticated',
    })
  })

  // AC4 — 429 → rate-limited (+ retryAfterMs)
  it('AC4: throws ProviderError(rate-limited) carrying retryAfterMs', async () => {
    const provider = makeProvider({
      transport: strategy({ classifyError: () => ({ code: 'rate-limited', retryAfterMs: 1500 }) }),
      gateway: gw(async (m) => { if (m === 'chat.send') throw new Error('429'); return {} }),
    })
    await expect(provider.invoke({ prompt: 'p', model: 'm' })).rejects.toMatchObject({
      code: 'rate-limited', retryAfterMs: 1500,
    })
  })

  // AC5 — wall-clock budget exceeded → timeout
  it('AC5: throws ProviderError(timeout) when the poll loop exceeds the wall-clock budget', async () => {
    const now = { v: 0 }
    const provider = makeProvider(
      {
        clock: { nowMs: () => now.v },
        gateway: gw(async (m) => {
          if (m === 'chat.send') return { runId: 'r' }
          now.v += 2000 // advance past the 1000ms budget on each wait
          return { status: 'running' }
        }),
      },
      { timeoutMs: 1000, pollWindowMs: 10 },
    )
    await expect(provider.invoke({ prompt: 'p', model: 'm' })).rejects.toMatchObject({ code: 'timeout' })
  })

  // AC6 — transport/session dead → unavailable
  it('AC6a: throws ProviderError(unavailable) when agent.wait returns a failed status', async () => {
    const provider = makeProvider({ gateway: scriptedGateway({ send: { runId: 'r' }, waits: [{ status: 'failed' }] }) })
    await expect(provider.invoke({ prompt: 'p', model: 'm' })).rejects.toMatchObject({ code: 'unavailable' })
  })
  it('AC6b: throws ProviderError(unavailable) when chat.send returns no runId', async () => {
    const provider = makeProvider({ gateway: scriptedGateway({ send: {}, waits: [{ status: 'complete', text: '' }] }) })
    await expect(provider.invoke({ prompt: 'p', model: 'm' })).rejects.toMatchObject({ code: 'unavailable' })
  })

  // AC7 — malformed output flows through as text (never an error)
  it('AC7: malformed (non-JSON) model output flows through as text', async () => {
    const provider = makeProvider({
      gateway: scriptedGateway({ send: { runId: 'r' }, waits: [{ status: 'complete', text: 'not json {oops' }] }),
    })
    const result = await provider.invoke({ prompt: 'p', model: 'm' })
    expect(result.text).toBe('not json {oops')
  })

  // AC8 — isAvailable = session.isActive() || transport.isReachable()
  it('AC8: isAvailable composes session liveness OR transport reachability', () => {
    const mk = (active: boolean, reachable: boolean) =>
      makeProvider({ session: session({ isActive: () => active }), transport: strategy({ isReachable: () => reachable }) }).isAvailable()
    expect(mk(true, false)).toBe(true)
    expect(mk(false, true)).toBe(true)
    expect(mk(false, false)).toBe(false)
  })

  // AC9 — session lifecycle
  it('AC9a: calls session.ensureActive before dispatch', async () => {
    const order: string[] = []
    const provider = makeProvider({
      session: session({ ensureActive: async () => { order.push('ensure') } }),
      gateway: gw(async (m) => { order.push(m); return m === 'chat.send' ? { runId: 'r' } : { status: 'complete', text: '' } }),
    })
    await provider.invoke({ prompt: 'p', model: 'm' })
    expect(order[0]).toBe('ensure')
    expect(order).toContain('chat.send')
  })
  it('AC9b: a throwing ensureActive (session dead) surfaces as ProviderError(unavailable)', async () => {
    const provider = makeProvider({
      session: session({ ensureActive: async () => { throw new ProviderError('unavailable', 'session dead') } }),
    })
    await expect(provider.invoke({ prompt: 'p', model: 'm' })).rejects.toMatchObject({ code: 'unavailable' })
  })

  // AC10 — frontier-lock is upstream (the adapter dispatches whatever model it is given)
  it('AC10: dispatches whatever model it is handed — never inspects tier', async () => {
    let seen = ''
    const provider = makeProvider({
      transport: strategy({ resolveAddress: (model) => { seen = model; return { via: 'gateway-agent', agentId: 'x' } } }),
    })
    const result = await provider.invoke({ prompt: 'p', model: 'some/non-frontier-mini' })
    expect(seen).toBe('some/non-frontier-mini')
    expect(result.text).toBe('')
  })

  // AC11 — no ProviderResult widening
  it('AC11: never widens ProviderResult — deferred and runId stay undefined', async () => {
    const result = await makeProvider().invoke({ prompt: 'p', model: 'm' })
    expect(result.deferred).toBeUndefined()
    expect(result.runId).toBeUndefined()
  })

  // AC12 — agnostic transport seam
  it('AC12a: a gateway-session address uses its sessionKey for chat.send', async () => {
    let sentKey: unknown
    const provider = makeProvider({
      transport: strategy({ resolveAddress: () => ({ via: 'gateway-session', sessionKey: 'pinned-sess' }) }),
      gateway: gw(async (m, params) => {
        if (m === 'chat.send') { sentKey = (params as { sessionKey?: string }).sessionKey; return { runId: 'r' } }
        return { status: 'complete', text: '' }
      }),
    })
    await provider.invoke({ prompt: 'p', model: 'm' })
    expect(sentKey).toBe('pinned-sess')
  })
  it('AC12b: a cli address is a named extension — throws ProviderError(unavailable) in v1', async () => {
    const provider = makeProvider({
      transport: strategy({ resolveAddress: () => ({ via: 'cli', command: 'claude', args: [] }) }),
    })
    await expect(provider.invoke({ prompt: 'p', model: 'm' })).rejects.toMatchObject({ code: 'unavailable' })
  })

  // AC13 — abort terminates promptly
  it('AC13: an aborted signal terminates promptly with a ProviderError', async () => {
    const ac = new AbortController()
    ac.abort()
    const provider = makeProvider({ gateway: scriptedGateway({ send: { runId: 'r' }, waits: [{ status: 'running' }] }) })
    await expect(provider.invoke({ prompt: 'p', model: 'm', signal: ac.signal })).rejects.toMatchObject({
      name: 'ProviderError',
    })
  })
})
