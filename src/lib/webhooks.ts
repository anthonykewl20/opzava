import { createHmac, timingSafeEqual } from 'crypto'
import { lookup as dnsLookup } from 'dns/promises'
import { isIP } from 'net'
import { eventBus, type ServerEvent } from './event-bus'
import { logger } from './logger'

interface Webhook {
  id: number
  name: string
  url: string
  secret: string | null
  events: string // JSON array
  enabled: number
  workspace_id?: number
  consecutive_failures?: number
}

interface DeliverOpts {
  attempt?: number
  parentDeliveryId?: number | null
  allowRetry?: boolean
}

interface DeliveryResult {
  success: boolean
  status_code: number | null
  response_body: string | null
  error: string | null
  duration_ms: number
  delivery_id?: number
}

// Backoff schedule in seconds: 30s, 5m, 30m, 2h, 8h
const BACKOFF_SECONDS = [30, 300, 1800, 7200, 28800]

const MAX_RETRIES = parseInt(process.env.MC_WEBHOOK_MAX_RETRIES || '5', 10) || 5

// ─── SSRF protection ────────────────────────────────────────────────────────
// Webhook targets are operator-configured and may otherwise be used to reach
// internal services or cloud-metadata endpoints from the server. These helpers
// classify a URL's host family and resolve it at fetch time so a stored URL
// cannot pivot onto a private address (DNS rebind defense-in-depth).

/** Loopback / metadata hostnames that have no IP literal to inspect. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost', 'ip6-localhost', 'ip6-loopback',
  'metadata.google.internal', 'metadata', 'metadata.internal', 'instance-data',
])

/**
 * Parse an IP-literal host component (incl. bracketed IPv6) into a normalized
 * address string, or null when the host is not an IP literal.
 */
function parseIpLiteral(hostname: string): string | null {
  let host = hostname
  // Strip surrounding brackets used for IPv6 in URLs.
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
  return isIP(host) ? host : null
}

/** True when the IPv4 string sits inside one of the blocked private ranges. */
function isBlockedV4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p))
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true
  const [a, b] = parts
  if (a === 0) return true // 0.0.0.0/8 "this host"
  if (a === 10) return true // RFC1918
  if (a === 127) return true // loopback
  if (a === 169 && b === 254) return true // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true // RFC1918
  if (a === 192 && b === 168) return true // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true // carrier-grade NAT
  return false
}

function isBlockedV6(ip: string): boolean {
  const lower = ip.toLowerCase()
  if (lower === '::1') return true // loopback
  if (lower === '::' || lower === '::0') return true // unspecified
  if (lower.startsWith('fe80')) return true // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true // unique-local
  return false
}

/**
 * Allowlist of hosts permitted to be private, sourced from
 * MC_WEBHOOK_ALLOW_PRIVATE (comma-separated IPs, CIDRs, or hostnames).
 * Read once per call to stay in sync with env changes between requests.
 */
function parseAllowlist(): Set<string> {
  const raw = process.env.MC_WEBHOOK_ALLOW_PRIVATE
  if (!raw) return new Set()
  return new Set(
    raw
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  )
}

/** Does `host` (lowercased) match an allowlisted entry (exact, or within CIDR)? */
function isAllowedPrivate(host: string, allowlist: Set<string>): boolean {
  const lower = host.toLowerCase()
  if (allowlist.has(lower)) return true
  // CIDR membership: support the common /n case for IPv4 private ranges.
  for (const entry of allowlist) {
    const slash = entry.indexOf('/')
    if (slash === -1) continue
    const base = entry.slice(0, slash)
    const prefix = Number(entry.slice(slash + 1))
    const baseIp = parseIpLiteral(base)
    const hostIp = parseIpLiteral(lower)
    if (baseIp && hostIp && isIPv4CidrMatch(baseIp, prefix, hostIp)) return true
  }
  return false
}

function isIPv4CidrMatch(baseIp: string, prefix: number, hostIp: string): boolean {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false
  const baseParts = baseIp.split('.').map(Number)
  const hostParts = hostIp.split('.').map(Number)
  if (baseParts.length !== 4 || hostParts.length !== 4) return false
  const baseNum =
    ((baseParts[0] << 24) >>> 0) +
    (baseParts[1] << 16) +
    (baseParts[2] << 8) +
    baseParts[3]
  const hostNum =
    ((hostParts[0] << 24) >>> 0) +
    (hostParts[1] << 16) +
    (hostParts[2] << 8) +
    hostParts[3]
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return (baseNum & mask) === (hostNum & mask)
}

/**
 * Decode an opaque IPv4 host label (decimal / hex / octal forms such as
 * `2130706433` or `0x7f000001`) into dotted-quad, or null. Node's `URL`
 * canonicalizes most of these, but the guard is applied to raw host labels too,
 * so we normalize defensively before classification.
 */
function decodeOpaqueIpv4(hostname: string): string | null {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return hostname
  let n: number
  if (/^\d+$/.test(hostname)) {
    n = Number(hostname)
  } else if (/^0x[0-9a-f]+$/i.test(hostname)) {
    n = parseInt(hostname, 16)
  } else if (/^0[0-7]+$/.test(hostname)) {
    n = parseInt(hostname, 8)
  } else {
    return null
  }
  if (!Number.isFinite(n) || n < 0 || n > 0xffffffff) return null
  return [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ].join('.')
}

function isIPv4(ip: string): boolean {
  return ip.includes('.') && isIP(ip) === 4
}

/**
 * Classify a URL string as blocked (true = must not be fetched).
 * Considers scheme, hostname, IP-literal families, and opaque IP encodings.
 * Honors MC_WEBHOOK_ALLOW_PRIVATE to permit explicit operator-approved targets.
 */
export function isBlockedWebhookUrl(urlStr: string): boolean {
  let url: URL
  try {
    url = new URL(urlStr)
  } catch {
    return true
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true

  const hostname = url.hostname.toLowerCase()
  const allowlist = parseAllowlist()

  if (isAllowedPrivate(hostname, allowlist)) return false
  if (BLOCKED_HOSTNAMES.has(hostname)) return true
  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return true

  const ip = parseIpLiteral(hostname)
  if (ip) {
    return isIPv4(ip) ? isBlockedV4(ip) : isBlockedV6(ip)
  }

  const decoded = decodeOpaqueIpv4(hostname)
  if (decoded) return isBlockedV4(decoded)

  return false
}

/**
 * Resolve `url`'s hostname and reject when any resolved address lands on a
 * private/loopback/link-local family. This is the fetch-time guard: even a URL
 * whose literal host looked public (or was on an allowlist by hostname) cannot
 * pivot onto an internal address via DNS at delivery time.
 *
 * Resolution failures are treated as blocked (fail-closed) so a transient DNS
 * error cannot bypass the check.
 */
export async function assertResolvablePublicUrl(urlStr: string): Promise<void> {
  const hostname = new URL(urlStr).hostname.toLowerCase()
  const ip = parseIpLiteral(hostname)
  // No literal IP to resolve (hostname) — look it up and check every address.
  if (!ip) {
    let records: { address: string; family: number }[]
    try {
      // all: true so we reject when ANY A/AAAA record is private.
      records = await dnsLookup(hostname, { all: true })
    } catch {
      throw new SsrfBlockedError(`SSRF: could not resolve host ${hostname}`)
    }
    if (records.length === 0) {
      throw new SsrfBlockedError(`SSRF: no address records for ${hostname}`)
    }
    for (const r of records) {
      if (isBlockedAddress(r.address)) {
        throw new SsrfBlockedError(
          `SSRF: ${hostname} resolves to internal address ${r.address}`,
        )
      }
    }
    return
  }

  if (isBlockedAddress(ip)) {
    throw new SsrfBlockedError(`SSRF: ${urlStr} targets an internal address`)
  }
}

function isBlockedAddress(address: string): boolean {
  const normalized = parseIpLiteral(address) ?? address
  if (isIPv4(normalized)) return isBlockedV4(normalized)
  return isBlockedV6(normalized)
}

/** Thrown when a webhook target is rejected by the SSRF guard. */
export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SsrfBlockedError'
  }
}

// Map event bus events to webhook event types
const EVENT_MAP: Record<string, string> = {
  'activity.created': 'activity',         // Dynamically becomes activity.<type>
  'notification.created': 'notification',  // Dynamically becomes notification.<type>
  'agent.status_changed': 'agent.status_change',
  'audit.security': 'security',           // Dynamically becomes security.<action>
  'task.created': 'activity.task_created',
  'task.updated': 'activity.task_updated',
  'task.deleted': 'activity.task_deleted',
  'task.status_changed': 'activity.task_status_changed',
}

/**
 * Compute the next retry delay in seconds, with ±20% jitter.
 */
export function nextRetryDelay(attempt: number): number {
  const base = BACKOFF_SECONDS[Math.min(attempt, BACKOFF_SECONDS.length - 1)]
  const jitter = base * 0.2 * (2 * Math.random() - 1) // ±20%
  return Math.round(base + jitter)
}

/**
 * Verify a webhook signature using constant-time comparison.
 * Consumers can use this to validate incoming webhook deliveries.
 */
export function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | null | undefined
): boolean {
  if (!signatureHeader || !secret) return false

  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`

  // Constant-time comparison
  const sigBuf = Buffer.from(signatureHeader)
  const expectedBuf = Buffer.from(expected)

  if (sigBuf.length !== expectedBuf.length) {
    // Compare expected against a dummy buffer of matching length to avoid timing leak
    const dummy = Buffer.alloc(expectedBuf.length)
    timingSafeEqual(expectedBuf, dummy)
    return false
  }

  return timingSafeEqual(sigBuf, expectedBuf)
}

/**
 * Subscribe to the event bus and fire webhooks for matching events.
 * Called once during server initialization.
 */
export function initWebhookListener() {
  eventBus.on('server-event', (event: ServerEvent) => {
    const mapping = EVENT_MAP[event.type]
    if (!mapping) return

    // Build the specific webhook event type
    let webhookEventType: string
    if (mapping === 'activity' && event.data?.type) {
      webhookEventType = `activity.${event.data.type}`
    } else if (mapping === 'notification' && event.data?.type) {
      webhookEventType = `notification.${event.data.type}`
    } else if (mapping === 'security' && event.data?.action) {
      webhookEventType = `security.${event.data.action}`
    } else {
      webhookEventType = mapping
    }

    // Also fire agent.error for error status specifically
    const isAgentError = event.type === 'agent.status_changed' && event.data?.status === 'error'
    const workspaceId = typeof event.data?.workspace_id === 'number' ? event.data.workspace_id : 1

    fireWebhooksAsync(webhookEventType, event.data, workspaceId).catch((err) => {
      logger.error({ err }, 'Webhook dispatch error')
    })

    if (isAgentError) {
      fireWebhooksAsync('agent.error', event.data, workspaceId).catch((err) => {
        logger.error({ err }, 'Webhook dispatch error')
      })
    }
  })
}

/**
 * Fire all matching webhooks for an event type (public for test endpoint).
 */
export function fireWebhooks(eventType: string, payload: Record<string, any>, workspaceId?: number) {
  fireWebhooksAsync(eventType, payload, workspaceId).catch((err) => {
    logger.error({ err }, 'Webhook dispatch error')
  })
}

async function fireWebhooksAsync(eventType: string, payload: Record<string, any>, workspaceId?: number) {
  const resolvedWorkspaceId =
    workspaceId ?? (typeof payload?.workspace_id === 'number' ? payload.workspace_id : 1)
  let webhooks: Webhook[]
  try {
    // Lazy import to avoid circular dependency
    const { getDatabase } = await import('./db')
    const db = getDatabase()
    webhooks = db.prepare(
      'SELECT * FROM webhooks WHERE enabled = 1 AND workspace_id = ?'
    ).all(resolvedWorkspaceId) as Webhook[]
  } catch {
    return // DB not ready or table doesn't exist yet
  }

  if (webhooks.length === 0) return

  const matchingWebhooks = webhooks.filter((wh) => {
    try {
      const events: string[] = JSON.parse(wh.events)
      return events.includes('*') || events.includes(eventType)
    } catch {
      return false
    }
  })

  await Promise.allSettled(
    matchingWebhooks.map((wh) => deliverWebhook(wh, eventType, payload, { allowRetry: true }))
  )
}

/**
 * Public wrapper for API routes (test endpoint, manual retry).
 * Returns delivery result fields for the response.
 */
export async function deliverWebhookPublic(
  webhook: Webhook,
  eventType: string,
  payload: Record<string, any>,
  opts?: DeliverOpts
): Promise<DeliveryResult> {
  return deliverWebhook(webhook, eventType, payload, opts ?? { allowRetry: false })
}

async function deliverWebhook(
  webhook: Webhook,
  eventType: string,
  payload: Record<string, any>,
  opts: DeliverOpts = {}
): Promise<DeliveryResult> {
  const { attempt = 0, parentDeliveryId = null, allowRetry = true } = opts

  const body = JSON.stringify({
    event: eventType,
    timestamp: Math.floor(Date.now() / 1000),
    data: payload,
  })

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'MissionControl-Webhook/1.0',
    'X-MC-Event': eventType,
  }

  // HMAC signature if secret is configured
  if (webhook.secret) {
    const sig = createHmac('sha256', webhook.secret).update(body).digest('hex')
    headers['X-MC-Signature'] = `sha256=${sig}`
  }

  const start = Date.now()
  let statusCode: number | null = null
  let responseBody: string | null = null
  let error: string | null = null

  // SSRF guard: reject internal/private/metadata targets at fetch time, after
  // resolving the host, so a stored URL cannot pivot onto an internal address.
  // Fail-closed — an unresolvable or private target is never fetched.
  try {
    await assertResolvablePublicUrl(webhook.url)
  } catch (ssrfErr) {
    // The SSRF guard throws SsrfBlockedError (an Error subclass); narrow the
    // unknown catch so the message is always a string, falling back for any
    // non-Error value the guard (or a transient dns failure) could surface.
    const message = ssrfErr instanceof Error ? ssrfErr.message : String(ssrfErr)
    logger.warn(
      { webhookId: webhook.id, name: webhook.name, err: ssrfErr },
      'Webhook delivery blocked by SSRF guard',
    )
    return {
      success: false,
      status_code: null,
      response_body: null,
      error: message,
      duration_ms: Date.now() - start,
    }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const res = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    })

    clearTimeout(timeout)
    statusCode = res.status
    responseBody = await res.text().catch(() => null)
    if (responseBody && responseBody.length > 1000) {
      responseBody = responseBody.slice(0, 1000) + '...'
    }
  } catch (err: any) {
    error = err.name === 'AbortError' ? 'Timeout (10s)' : err.message
  }

  const durationMs = Date.now() - start
  const success = statusCode !== null && statusCode >= 200 && statusCode < 300
  let deliveryId: number | undefined

  // Log delivery attempt and handle retry/circuit-breaker logic
  try {
    const { getDatabase } = await import('./db')
    const db = getDatabase()
    const workspaceId =
      typeof webhook.workspace_id === 'number' &&
      Number.isFinite(webhook.workspace_id) &&
      webhook.workspace_id > 0
        ? webhook.workspace_id
        : null

    if (workspaceId === null) {
      logger.error(
        { webhookId: webhook.id, name: webhook.name },
        'Webhook delivery bookkeeping skipped: workspace context required',
      )
      return { success, status_code: statusCode, response_body: responseBody, error, duration_ms: durationMs, delivery_id: deliveryId }
    }

    const insertResult = db.prepare(`
      INSERT INTO webhook_deliveries (webhook_id, event_type, payload, status_code, response_body, error, duration_ms, attempt, is_retry, parent_delivery_id, workspace_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      webhook.id,
      eventType,
      body,
      statusCode,
      responseBody,
      error,
      durationMs,
      attempt,
      attempt > 0 ? 1 : 0,
      parentDeliveryId,
      workspaceId
    )
    deliveryId = Number(insertResult.lastInsertRowid)

    // Update webhook last_fired
    db.prepare(`
      UPDATE webhooks SET last_fired_at = unixepoch(), last_status = ?, updated_at = unixepoch()
      WHERE id = ? AND workspace_id = ?
    `).run(statusCode ?? -1, webhook.id, workspaceId)

    // Circuit breaker + retry scheduling (skip for test deliveries)
    if (allowRetry) {
      if (success) {
        // Reset consecutive failures on success
        db.prepare(`UPDATE webhooks SET consecutive_failures = 0 WHERE id = ? AND workspace_id = ?`).run(webhook.id, workspaceId)
      } else {
        // Increment consecutive failures
        db.prepare(`UPDATE webhooks SET consecutive_failures = consecutive_failures + 1 WHERE id = ? AND workspace_id = ?`).run(webhook.id, workspaceId)

        if (attempt < MAX_RETRIES - 1) {
          // Schedule retry
          const delaySec = nextRetryDelay(attempt)
          const nextRetryAt = Math.floor(Date.now() / 1000) + delaySec
          db.prepare(`UPDATE webhook_deliveries SET next_retry_at = ? WHERE id = ?`).run(nextRetryAt, deliveryId)
        } else {
          // Exhausted retries — trip circuit breaker
          const wh = db.prepare(`SELECT consecutive_failures FROM webhooks WHERE id = ? AND workspace_id = ?`).get(webhook.id, workspaceId) as { consecutive_failures: number } | undefined
          if (wh && wh.consecutive_failures >= MAX_RETRIES) {
            db.prepare(`UPDATE webhooks SET enabled = 0, updated_at = unixepoch() WHERE id = ? AND workspace_id = ?`).run(webhook.id, workspaceId)
            logger.warn({ webhookId: webhook.id, name: webhook.name }, 'Webhook circuit breaker tripped — disabled after exhausting retries')
          }
        }
      }
    }

    // Prune old deliveries (keep last 200 per webhook)
    db.prepare(`
      DELETE FROM webhook_deliveries
      WHERE webhook_id = ? AND workspace_id = ? AND id NOT IN (
        SELECT id FROM webhook_deliveries WHERE webhook_id = ? AND workspace_id = ? ORDER BY created_at DESC LIMIT 200
      )
    `).run(webhook.id, workspaceId, webhook.id, workspaceId)
  } catch (logErr) {
    logger.error({ err: logErr, webhookId: webhook.id }, 'Webhook delivery logging/pruning failed')
  }

  return { success, status_code: statusCode, response_body: responseBody, error, duration_ms: durationMs, delivery_id: deliveryId }
}

/**
 * Process pending webhook retries. Called by the scheduler.
 * Picks up deliveries where next_retry_at has passed and re-delivers them.
 */
export async function processWebhookRetries(): Promise<{ ok: boolean; message: string }> {
  try {
    const { getDatabase } = await import('./db')
    const db = getDatabase()
    const now = Math.floor(Date.now() / 1000)

    // Find deliveries ready for retry (limit batch to 50)
    const pendingRetries = db.prepare(`
      SELECT wd.id, wd.webhook_id, wd.event_type, wd.payload, wd.attempt,
             w.id as w_id, w.name as w_name, w.url as w_url, w.secret as w_secret,
             w.events as w_events, w.enabled as w_enabled, w.consecutive_failures as w_consecutive_failures,
             wd.workspace_id as wd_workspace_id
      FROM webhook_deliveries wd
      JOIN webhooks w ON w.id = wd.webhook_id AND w.workspace_id = wd.workspace_id AND w.enabled = 1
      WHERE wd.next_retry_at IS NOT NULL AND wd.next_retry_at <= ?
      LIMIT 50
    `).all(now) as Array<{
      id: number; webhook_id: number; event_type: string; payload: string; attempt: number
      w_id: number; w_name: string; w_url: string; w_secret: string | null
      w_events: string; w_enabled: number; w_consecutive_failures: number; wd_workspace_id: number
    }>

    if (pendingRetries.length === 0) {
      return { ok: true, message: 'No pending retries' }
    }

    // Clear next_retry_at immediately to prevent double-processing
    const clearStmt = db.prepare(`UPDATE webhook_deliveries SET next_retry_at = NULL WHERE id = ? AND workspace_id = ?`)
    for (const row of pendingRetries) {
      clearStmt.run(row.id, row.wd_workspace_id)
    }

    // Re-deliver each
    let succeeded = 0
    let failed = 0
    for (const row of pendingRetries) {
      const webhook: Webhook = {
        id: row.w_id,
        name: row.w_name,
        url: row.w_url,
        secret: row.w_secret,
        events: row.w_events,
        enabled: row.w_enabled,
        consecutive_failures: row.w_consecutive_failures,
        workspace_id: row.wd_workspace_id,
      }

      // Parse the original payload from the stored JSON body
      let parsedPayload: Record<string, any>
      try {
        const parsed = JSON.parse(row.payload)
        parsedPayload = parsed.data ?? parsed
      } catch {
        parsedPayload = {}
      }

      const result = await deliverWebhook(webhook, row.event_type, parsedPayload, {
        attempt: row.attempt + 1,
        parentDeliveryId: row.id,
        allowRetry: true,
      })

      if (result.success) succeeded++
      else failed++
    }

    return { ok: true, message: `Processed ${pendingRetries.length} retries (${succeeded} ok, ${failed} failed)` }
  } catch (err: any) {
    return { ok: false, message: `Webhook retry failed: ${err.message}` }
  }
}
