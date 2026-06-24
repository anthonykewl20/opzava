import { AsyncLocalStorage } from 'node:async_hooks'
import type { NextRequest, NextResponse } from 'next/server'

/**
 * Request-scoped context propagated via AsyncLocalStorage. This is the single
 * seam that lets the logger, audit, and auth layers correlate a log/audit line
 * to the request that produced it WITHOUT threading a value through every call.
 *
 * Populate it by wrapping a route handler in `withRequestContext` (which reads
 * the `x-request-id` header set by `src/middleware.ts`). Any code running inside
 * that handler — including async awaits — can read the context via
 * `getRequestContext()` / `getRequestId()`.
 */
export interface RequestContext {
  requestId: string
  userId?: number
  workspaceId?: number
  tenantId?: number
}

const als = new AsyncLocalStorage<RequestContext>()

/** Run `fn` within a request context; any code inside can read it back. */
export function runRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return als.run(ctx, fn)
}

/** The active request context, or undefined when not inside a request. */
export function getRequestContext(): RequestContext | undefined {
  return als.getStore()
}

/** The active request id, or undefined when not inside a request. */
export function getRequestId(): string | undefined {
  return als.getStore()?.requestId
}

/**
 * Wrap a Next.js route handler so it runs within a request context populated
 * from the `x-request-id` header (set by middleware). Every log line emitted
 * inside the handler then carries `request_id` automatically (the pino mixin in
 * logger.ts), and audit/auth calls can read it via getRequestContext(). Apply
 * to the hot routes (chat write, ops, events, status).
 */
export function withRequestContext<H extends (...args: any[]) => Promise<NextResponse> | NextResponse>(
  handler: H,
): H {
  return (async (...args: any[]) => {
    const request = args[0] as NextRequest | undefined
    const requestId = request?.headers?.get('x-request-id') || 'unknown'
    return runRequestContext({ requestId }, () => (handler as (...a: any[]) => any)(...args))
  }) as H
}
