import type { ProviderInvokeInput, ProviderPort, ProviderResult, TokenUsage } from './contracts'

/**
 * Gateway `ProviderPort` adapter (the Lead's brain) — ARD 0026 GP1; design SEAM-gateway-provider-adapter.md.
 *
 * Satisfies the existing `ProviderPort` by dispatching the planning prompt to a dedicated persistent
 * GPT-Plus gateway agent via the OpenClaw gateway (`chat.send`→`runId`, poll `agent.wait`), returning the
 * model's text. SYNCHRONOUS from the caller's view (one in-flight planning call — not a deferred task);
 * the poll loop is internal. Transport specifics (addressing, usage parse, error→taxonomy mapping) live
 * behind the injected `ProviderTransportStrategy`, so the SAME adapter fronts any subscription transport.
 *
 * Errors are THROWN as a typed `ProviderError` (never widening `ProviderResult`); malformed model output is
 * NOT an error — it flows through as `text` to the caller's parse path. Usage rides `ProviderResult.usage`
 * (the executor's `UsageSink` records it — not this adapter's concern). Frontier-lock stays upstream.
 */

export type ProviderErrorCode = 'unauthenticated' | 'rate-limited' | 'timeout' | 'unavailable'

export class ProviderError extends Error {
  readonly code: ProviderErrorCode
  readonly retryAfterMs?: number
  constructor(code: ProviderErrorCode, message: string, options?: { cause?: unknown; retryAfterMs?: number }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = 'ProviderError'
    this.code = code
    this.retryAfterMs = options?.retryAfterMs
  }
}

/** The one provider-specific slot. `gateway-agent` is the v1 path; `cli` is a named extension (not wired). */
export type AgentAddress =
  | { readonly via: 'gateway-agent'; readonly agentId: string }
  | { readonly via: 'gateway-session'; readonly sessionKey: string }
  | { readonly via: 'cli'; readonly command: string; readonly args: readonly string[] }

export interface ProviderTransportStrategy {
  resolveAddress(model: string): AgentAddress
  /** Usage from a terminal transport payload (e.g. a `codex --json` rate-limit event). null ⇒ none. */
  parseUsageEvent(rawEvent: unknown): TokenUsage | null
  /** Map a raw transport failure to the shared taxonomy. The adapter constructs + throws. */
  classifyError(raw: unknown): { code: ProviderErrorCode; retryAfterMs?: number }
  /** Fast, synchronous reachability (gateway up OR CLI present). No network call. */
  isReachable(): boolean
}

export interface LeadSession {
  /** Idempotent: verify or (re)create the lead-orchestrator session. Throws `ProviderError('unavailable')` if unrecoverable. */
  ensureActive(): Promise<void>
  /** Sync snapshot; no network. Backs `isAvailable()`. */
  isActive(): boolean
}

export interface GatewayProviderConfig {
  readonly sessionKey: string
  readonly timeoutMs?: number     // total wall-clock budget per invoke (default 120_000)
  readonly pollWindowMs?: number  // agent.wait poll window (default 5_000)
}

export interface GatewayProviderDeps {
  readonly transport: ProviderTransportStrategy
  readonly gateway: <T>(method: string, params: unknown, timeoutMs?: number) => Promise<T>
  readonly session: LeadSession
  readonly clock?: { nowMs(): number }
}

const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_POLL_WINDOW_MS = 5_000

function isCompleteStatus(s: string): boolean {
  return s === 'complete' || s === 'completed' || s === 'done' || s === 'ok' || s === 'succeeded'
}
function isFailedStatus(s: string): boolean {
  return s === 'failed' || s === 'error' || s === 'cancelled' || s === 'canceled'
}

export function makeGatewayProvider(config: GatewayProviderConfig, deps: GatewayProviderDeps): ProviderPort {
  const clock = deps.clock ?? { nowMs: () => Date.now() }
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const pollWindowMs = config.pollWindowMs ?? DEFAULT_POLL_WINDOW_MS

  /** Classify a raw transport failure and throw the typed error (never returns). */
  function fail(raw: unknown): never {
    const { code, retryAfterMs } = deps.transport.classifyError(raw)
    throw new ProviderError(code, `gateway transport error: ${code}`, { cause: raw, retryAfterMs })
  }

  /** One gateway RPC, mapping any throw through the strategy's taxonomy. */
  async function call<T>(method: string, params: unknown, rpcTimeoutMs?: number): Promise<T> {
    try {
      return await deps.gateway<T>(method, params, rpcTimeoutMs)
    } catch (err) {
      if (err instanceof ProviderError) throw err
      fail(err)
    }
  }

  return {
    isAvailable: () => deps.session.isActive() || deps.transport.isReachable(),

    invoke: async (input: ProviderInvokeInput): Promise<ProviderResult> => {
      await deps.session.ensureActive()

      const address = deps.transport.resolveAddress(input.model)
      if (address.via === 'cli') {
        throw new ProviderError('unavailable', 'cli transport is a named extension; not wired in v1')
      }
      const sessionKey = address.via === 'gateway-session' ? address.sessionKey : config.sessionKey

      const sendResult = await call<{ runId?: string }>(
        'chat.send',
        { sessionKey, message: input.prompt, deliver: false },
        pollWindowMs,
      )
      const runId = typeof sendResult?.runId === 'string' && sendResult.runId.trim() ? sendResult.runId : null
      if (!runId) throw new ProviderError('unavailable', 'chat.send returned no runId')

      const deadline = clock.nowMs() + timeoutMs
      while (clock.nowMs() < deadline) {
        if (input.signal?.aborted) throw new ProviderError('unavailable', 'invoke aborted')

        const waitResult = await call<{ status?: string; text?: string }>(
          'agent.wait',
          { runId, timeoutMs: pollWindowMs },
          pollWindowMs + 5_000,
        )
        const status = String(waitResult?.status ?? '').toLowerCase()

        if (isCompleteStatus(status)) {
          const usage = deps.transport.parseUsageEvent(waitResult) ?? undefined
          return { text: typeof waitResult.text === 'string' ? waitResult.text : '', usage }
        }
        if (isFailedStatus(status)) {
          throw new ProviderError('unavailable', `agent.wait returned status '${status}'`)
        }
        // running / pending → keep polling (the gateway's agent.wait paces each iteration)
      }
      throw new ProviderError('timeout', `invoke exceeded ${timeoutMs}ms wall-clock budget`)
    },
  }
}
