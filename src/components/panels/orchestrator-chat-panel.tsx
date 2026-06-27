'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

// "Ask Opzava" — the cross-project Concierge chat, wired to live data.
//
//   GET  /api/conversations/ask-opzava        → { conversation, timeline, digest }
//   POST /api/conversations/ask-opzava/ask     → { humanTurn, narrationTurn, proposedActions }
//                                                | { degraded: true, narrationTurn, proposedActions: [] }
//   SSE  /api/events?types=conversation.turn_added (with a 5s polling fallback)
//
// Styling is the scoped `.opzava-ds` vocabulary defined in opzava-ds.css; this component owns the
// data lifecycle only. The route enforces admin auth, so there is no client-side auth logic here.

// ── API contract types (mirror the server contracts; see src/opzava/modules/conversations) ──

type TurnRole = 'human' | 'ai' | 'system'
type TurnRefType = 'run' | 'artifact' | 'approval'

interface ConversationTurn {
  turnId: string
  conversationId: string
  parentTurnId: string | null
  author: string
  role: TurnRole
  body: string
  refType: TurnRefType | null
  refId: string | null
  messageAnchor: number | null
  status: string | null
  record: Record<string, unknown>
  createdAt: string
}

type HealthFacet = 'needs_you' | 'blocked' | null

interface DigestProjectRow {
  projectId: string
  name: string
  health: HealthFacet
  displayLabel: string
  summary: string
}

interface DigestApprovalCard {
  approvalId: string
  requestedAction: string
  targetId: string
}

interface DigestBlock {
  kind: 'digest'
  summary: { needsYou: number; blocked: number; totalProjects: number }
  projects: DigestProjectRow[]
  pendingApprovals: DigestApprovalCard[]
}

interface AskConversation {
  conversationId: string
  participants: string[]
  title: string | null
  createdAt: string
  lastMessageAt: string | null
}

/**
 * Live status of the coordinator (the persistent gateway agent that backs Ask Opzava).
 * `offline` surfaces the top-of-log offline card; the optional fields are echoed verbatim
 * (and only when non-null) in the collapsible "Technical details" block — never faked.
 */
type CoordinatorStatus = 'online' | 'offline'

interface Coordinator {
  status: CoordinatorStatus
  runId: string | null
  lastSeen: string | null
  reason: string | null
}

interface AskThreadResponse {
  conversation: AskConversation
  timeline: ConversationTurn[]
  digest: DigestBlock
  coordinator: Coordinator
}

interface ProposedAction {
  actionId: string
  actionType: string
  kind: 'internal-reversible' | 'external-guarded'
  args: Record<string, unknown>
}

type AskResponse =
  | { humanTurn: ConversationTurn; narrationTurn: ConversationTurn; proposedActions: ProposedAction[] }
  | { degraded: true; narrationTurn: ConversationTurn; proposedActions: [] }

type LoadStatus = 'loading' | 'ready' | 'error'

const EXAMPLE_PROMPTS = [
  "How's everything today?",
  'What needs my attention?',
  'Summarise anything blocked.',
] as const

const THREAD_URL = '/api/conversations/ask-opzava'
const ASK_URL = '/api/conversations/ask-opzava/ask'
const EVENTS_URL = '/api/events?types=conversation.turn_added'
const POLL_INTERVAL_MS = 5000

/** Builder (not a string literal) so the call site mirrors the file's existing fetch URLs. */
function approvalDecideUrl(approvalId: string): string {
  return `/api/ops/approvals/${encodeURIComponent(approvalId)}/decide`
}

// ── Pure helpers (module-level so React effects stay dependency-stable) ──

let optimisticCounter = 0
function makeOptimisticId(): string {
  optimisticCounter += 1
  return `optimistic:${Date.now()}:${optimisticCounter}`
}
function isOptimistic(id: string): boolean {
  return id.startsWith('optimistic:')
}

/** Return a copy of `map` without `key` (or the same reference when the key is absent). */
function dropKey<T>(map: Record<string, T>, key: string): Record<string, T> {
  if (!(key in map)) return map
  const next = { ...map }
  delete next[key]
  return next
}

/** Content key used to reconcile an optimistic human turn against its persisted twin. */
function humanKey(turn: ConversationTurn): string {
  return `${turn.author}\n${turn.body}`
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function digestSummaryLine(s: { needsYou: number; blocked: number }): string {
  if (s.needsYou + s.blocked === 0) return 'Everything is on track.'
  const needs = `${s.needsYou} ${s.needsYou === 1 ? 'project needs' : 'projects need'} your attention`
  return `${needs} · ${s.blocked} blocked.`
}

function healthPresentation(h: HealthFacet): {
  glyph: string
  label: string
  pill: string
  rowBg?: string
} {
  if (h === 'blocked') return { glyph: '✕', label: 'Blocked', pill: 'digest-pill--err', rowBg: 'var(--danger-soft)' }
  if (h === 'needs_you') return { glyph: '▲', label: 'Needs you', pill: 'digest-pill--warn', rowBg: 'var(--warning-soft)' }
  return { glyph: '●', label: 'On track', pill: 'digest-pill--ok' }
}

/** Narrow a turn's opaque `record` to a pending proposed action, if present. */
function getProposedAction(turn: ConversationTurn): ProposedAction | null {
  const a = turn.record.action
  if (a && typeof a === 'object' && typeof (a as { actionType?: unknown }).actionType === 'string') {
    return a as ProposedAction
  }
  return null
}

/** A proposed action is persisted server-side as a pending turn keyed by its actionId. */
function actionToTurn(action: ProposedAction, conversationId: string, createdAt: string): ConversationTurn {
  return {
    turnId: action.actionId,
    conversationId,
    parentTurnId: null,
    author: 'Opzava',
    role: 'ai',
    body: '',
    refType: action.kind === 'external-guarded' ? 'approval' : null,
    refId: null,
    messageAnchor: null,
    status: 'pending',
    record: { action },
    createdAt,
  }
}

/**
 * Merge incoming turns into the existing list, de-duped by turnId. When a *real*
 * (non-optimistic) human turn arrives, any optimistic placeholder with the same
 * author+body is dropped — so the optimistic bubble is replaced, never doubled.
 */
function mergeTurns(prev: ConversationTurn[], incoming: ConversationTurn[]): ConversationTurn[] {
  let next = prev.slice()
  for (const turn of incoming) {
    if (next.some((t) => t.turnId === turn.turnId)) continue
    if (turn.role === 'human' && !isOptimistic(turn.turnId)) {
      const key = humanKey(turn)
      next = next.filter((t) => !(isOptimistic(t.turnId) && humanKey(t) === key))
    }
    next.push(turn)
  }
  return next
}

/**
 * Extract a ConversationTurn from an SSE payload. Handles both the wrapped shape
 * `{ type, data: { conversation_id, turn } }` and a bare `{ conversation_id, turn }`,
 * and only returns a turn whose conversation_id matches the loaded thread.
 */
function extractTurnFromEvent(parsed: unknown, conversationId: string): ConversationTurn | null {
  if (!parsed || typeof parsed !== 'object') return null
  const outer = parsed as { data?: unknown; conversation_id?: unknown; turn?: unknown }
  const inner = (outer.data && typeof outer.data === 'object' ? outer.data : outer) as {
    conversation_id?: unknown
    turn?: unknown
  }
  if (inner.conversation_id !== conversationId) return null
  const turn = inner.turn
  if (!turn || typeof turn !== 'object') return null
  if (typeof (turn as { turnId?: unknown }).turnId !== 'string') return null
  return turn as ConversationTurn
}

async function fetchThread(): Promise<AskThreadResponse> {
  const res = await fetch(THREAD_URL, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Couldn't load the conversation (error ${res.status}).`)
  return (await res.json()) as AskThreadResponse
}

async function describeSendError(res: Response): Promise<string> {
  if (res.status === 429) return "You're sending messages too quickly — wait a moment and try again."
  if (res.status === 401 || res.status === 403) return 'Your session expired. Refresh the page and sign in again.'
  try {
    const body = (await res.json()) as { error?: unknown }
    if (typeof body.error === 'string' && body.error) return body.error
  } catch {
    // fall through to the generic message
  }
  return `Couldn't send that (error ${res.status}). Please try again.`
}

/** Plain-language copy for an approval-decision failure. The decide route returns `{ error }`. */
async function describeDecideError(res: Response): Promise<string> {
  if (res.status === 429) return 'Too many requests — wait a moment.'
  if (res.status === 403) return "You can't decide your own request."
  if (res.status === 409) return 'This approval was already decided.'
  try {
    const body = (await res.json()) as { error?: unknown }
    if (typeof body.error === 'string' && body.error) return body.error
  } catch {
    // fall through to the generic message
  }
  return `Couldn't record that decision (error ${res.status}). Please try again.`
}

// ── Component ──

export function OrchestratorChatPanel() {
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [conversation, setConversation] = useState<AskConversation | null>(null)
  const [digest, setDigest] = useState<DigestBlock | null>(null)
  const [coordinator, setCoordinator] = useState<Coordinator | null>(null)
  const [turns, setTurns] = useState<ConversationTurn[]>([])

  // Offline card's collapsible "Technical details" disclosure (closed by default).
  const [techOpen, setTechOpen] = useState(false)

  const [msg, setMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)

  // ── Per-approval action state, keyed by approvalId (so rows act independently) ──
  // decidePending: a decide request is in flight for this approval (disables + aria-busy).
  // decideError:   the last failure message for this approval (role="alert", var(--danger)).
  // reasonDrafts:  presence of the key means the "request changes" editor is open for this
  //                approval; the value is the in-progress reason text.
  const [decidePending, setDecidePending] = useState<Record<string, boolean>>({})
  const [decideError, setDecideError] = useState<Record<string, string>>({})
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({})

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const logRef = useRef<HTMLDivElement>(null)

  const conversationId = conversation?.conversationId ?? null

  // ── Initial load + retry ──
  const load = useCallback(async () => {
    setStatus('loading')
    setLoadError(null)
    try {
      const data = await fetchThread()
      setConversation(data.conversation)
      setDigest(data.digest)
      setCoordinator(data.coordinator)
      setTurns(data.timeline)
      setStatus('ready')
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Something went wrong.')
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // ── Live updates: SSE first, polling as the fallback ──
  useEffect(() => {
    if (!conversationId) return
    let disposed = false
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let es: EventSource | null = null

    const reconcile = async () => {
      try {
        const data = await fetchThread()
        if (disposed) return
        setDigest(data.digest)
        setCoordinator(data.coordinator)
        setTurns((prev) => {
          const realHumanKeys = new Set(
            data.timeline.filter((t) => t.role === 'human').map(humanKey),
          )
          const survivingOptimistic = prev.filter(
            (t) => isOptimistic(t.turnId) && !realHumanKeys.has(humanKey(t)),
          )
          return [...data.timeline, ...survivingOptimistic]
        })
      } catch {
        // Keep the last good state; the next tick retries.
      }
    }

    const startPolling = () => {
      if (disposed || pollTimer) return
      pollTimer = setInterval(() => void reconcile(), POLL_INTERVAL_MS)
    }

    try {
      es = new EventSource(EVENTS_URL)
      es.onmessage = (e) => {
        if (disposed) return
        try {
          const turn = extractTurnFromEvent(JSON.parse(e.data), conversationId)
          if (turn) setTurns((prev) => mergeTurns(prev, [turn]))
        } catch {
          // Ignore malformed frames (heartbeats, connected/resync control frames).
        }
      }
      es.onerror = () => {
        // EventSource auto-reconnects; polling is the durable safety net once it drops.
        startPolling()
      }
    } catch {
      startPolling()
    }

    return () => {
      disposed = true
      if (es) es.close()
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [conversationId])

  // Keep the log pinned to the newest message.
  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns.length, status])

  // ── Composer ──
  function resize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  function resetTextarea() {
    const el = textareaRef.current
    if (el) el.style.height = 'auto'
  }

  function fillComposer(text: string) {
    setMsg(text)
    textareaRef.current?.focus()
  }

  const send = useCallback(async () => {
    const text = msg.trim()
    const convId = conversation?.conversationId
    if (!text || sending || !convId) return

    const optimisticId = makeOptimisticId()
    const optimisticTurn: ConversationTurn = {
      turnId: optimisticId,
      conversationId: convId,
      parentTurnId: null,
      author: conversation?.participants[0] ?? 'You',
      role: 'human',
      body: text,
      refType: null,
      refId: null,
      messageAnchor: null,
      status: null,
      record: {},
      createdAt: new Date().toISOString(),
    }

    setTurns((prev) => mergeTurns(prev, [optimisticTurn]))
    setMsg('')
    resetTextarea()
    setSending(true)
    setSendError(null)
    setOffline(false)

    try {
      const res = await fetch(ASK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text }),
      })

      if (!res.ok) {
        // The prompt was not accepted — roll back the optimistic bubble and restore the text.
        setTurns((prev) => prev.filter((t) => t.turnId !== optimisticId))
        setMsg(text)
        setSendError(await describeSendError(res))
        return
      }

      const data = (await res.json()) as AskResponse
      if (!('humanTurn' in data)) {
        // Gateway offline: the human turn is persisted server-side (reconciles on the next poll),
        // so keep the optimistic bubble and append the plain-language offline reply.
        setTurns((prev) => mergeTurns(prev, [data.narrationTurn]))
        setOffline(true)
        return
      }

      const actionTurns = data.proposedActions.map((a) =>
        actionToTurn(a, convId, data.narrationTurn.createdAt),
      )
      setTurns((prev) => mergeTurns(prev, [data.humanTurn, data.narrationTurn, ...actionTurns]))
    } catch {
      setTurns((prev) => prev.filter((t) => t.turnId !== optimisticId))
      setMsg(text)
      setSendError('Could not reach Opzava. Check your connection and try again.')
    } finally {
      setSending(false)
    }
  }, [msg, sending, conversation])

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    void send()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  // ── Pending-approval actions ──
  // Decide one approval. `load()` re-fetches the thread + digest on success, so the decided
  // approval drops out of pendingApprovals and the server-posted outcome turn appears. The SSE
  // consumer also delivers that turn, but mergeTurns de-dupes by turnId, so there's no doubling.
  const decideApproval = useCallback(
    async (approvalId: string, decision: 'approved' | 'rejected', decisionReason?: string) => {
      setDecidePending((prev) => (prev[approvalId] ? prev : { ...prev, [approvalId]: true }))
      setDecideError((prev) => dropKey(prev, approvalId))

      try {
        const body: { decision: 'approved' | 'rejected'; decisionReason?: string } =
          decision === 'rejected' ? { decision, decisionReason } : { decision }
        const res = await fetch(approvalDecideUrl(approvalId), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (!res.ok) {
          const message = await describeDecideError(res)
          setDecideError((prev) => ({ ...prev, [approvalId]: message }))
          return
        }

        // Decided — close any reason editor for this row, then refresh the thread + digest.
        setReasonDrafts((prev) => dropKey(prev, approvalId))
        await load()
      } catch {
        setDecideError((prev) => ({
          ...prev,
          [approvalId]: 'Could not reach Opzava. Check your connection and try again.',
        }))
      } finally {
        setDecidePending((prev) => dropKey(prev, approvalId))
      }
    },
    [load],
  )

  function toggleReason(approvalId: string) {
    setReasonDrafts((prev) =>
      approvalId in prev ? dropKey(prev, approvalId) : { ...prev, [approvalId]: '' },
    )
  }

  function submitReason(approvalId: string) {
    const reason = (reasonDrafts[approvalId] ?? '').trim()
    if (!reason) return
    void decideApproval(approvalId, 'rejected', reason)
  }

  // ── Render helpers ──
  // One pending approval, rendered as the mockup's inline accent action-bubble (the single
  // accent action: "Approve & send"). Keeps the existing per-approval decide/reason/error logic.
  function renderApprovalBubble(a: DigestApprovalCard) {
    const busy = Boolean(decidePending[a.approvalId])
    const rowError = decideError[a.approvalId]
    const reasonShown = a.approvalId in reasonDrafts
    const reasonValue = reasonDrafts[a.approvalId] ?? ''
    const reasonId = `approval-reason-${a.approvalId}`
    return (
      <div className="chat-row" key={a.approvalId}>
        <span className="sb-avatar sb-avatar--ai" style={{ background: 'var(--chart-6)', flex: 'none' }} aria-label="Opzava AI">
          O
        </span>
        <div className="chat-stack" style={{ maxWidth: '80%' }}>
          <div className="chat-meta">
            <strong>Opzava</strong>
            <span className="sb-badge sb-badge--accent">✦ AI</span>
            <span className="chat-time">{formatTime(conversation?.lastMessageAt ?? conversation?.createdAt ?? '')}</span>
          </div>
          <div className="action-bubble" role="group" aria-label={`Action required: ${a.requestedAction}`} aria-busy={busy}>
            <div className="action-bubble-title">
              <span aria-hidden="true">▲</span> {a.requestedAction} needs your approval
            </div>
            <p className="u-muted" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
              Target: {a.targetId}
            </p>
            <div className="action-row" style={{ flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void decideApproval(a.approvalId, 'approved')}
                disabled={busy}
                aria-busy={busy}
                aria-label={`Approve and send: ${a.requestedAction}`}
              >
                <span aria-hidden="true">✓</span> Approve &amp; send
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => toggleReason(a.approvalId)}
                disabled={busy}
                aria-expanded={reasonShown}
                aria-controls={reasonId}
                aria-label={`Request changes: ${a.requestedAction}`}
              >
                Request changes
              </button>
              {/* No artifact route yet — render the affordance, but honestly inert (disabled). */}
              <button
                type="button"
                className="btn btn-ghost btn-sm u-subtle"
                style={{ marginLeft: 'auto' }}
                disabled
                title="Draft preview isn't available yet"
              >
                View full draft ↗
              </button>
            </div>

            {reasonShown && (
              <div className="u-row" style={{ gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                <label htmlFor={reasonId} className="u-sr-only">
                  Reason for requesting changes to {a.requestedAction}
                </label>
                <input
                  id={reasonId}
                  type="text"
                  className="input"
                  style={{ flex: 1, minWidth: '12rem' }}
                  placeholder="What needs to change?"
                  value={reasonValue}
                  disabled={busy}
                  autoFocus
                  onChange={(e) => setReasonDrafts((prev) => ({ ...prev, [a.approvalId]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      submitReason(a.approvalId)
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => submitReason(a.approvalId)}
                  disabled={busy || !reasonValue.trim()}
                  aria-busy={busy}
                >
                  Send request
                </button>
              </div>
            )}

            {rowError && (
              <div role="alert" className="u-row" style={{ gap: 'var(--space-2)', color: 'var(--danger)', fontSize: 'var(--text-xs)' }}>
                <span aria-hidden="true">✕</span>
                <span>{rowError}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  function renderTurn(turn: ConversationTurn) {
    const proposed = turn.status === 'pending' ? getProposedAction(turn) : null

    if (proposed) {
      return (
        <div className="chat-row" key={turn.turnId}>
          <span className="sb-avatar sb-avatar--ai" style={{ background: 'var(--chart-6)', flex: 'none' }} aria-label="Opzava AI">
            O
          </span>
          <div className="chat-stack" style={{ maxWidth: '80%' }}>
            <div className="chat-meta">
              <strong>Opzava</strong>
              <span className="sb-badge sb-badge--accent">✦ AI</span>
              <span className="chat-time">{formatTime(turn.createdAt)}</span>
            </div>
            <div
              className="action-bubble"
              style={{ opacity: 0.85 }}
              role="group"
              aria-label={`Opzava proposes ${proposed.actionType}`}
            >
              <div className="action-bubble-title">
                <span aria-hidden="true">✦</span> Opzava proposes: {proposed.actionType}
              </div>
              <p className="u-subtle" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
                Confirmation isn&apos;t available yet — awaiting wiring.
              </p>
            </div>
          </div>
        </div>
      )
    }

    if (turn.role === 'human') {
      return (
        <div className="chat-row chat-row--user" key={turn.turnId}>
          <span className="sb-avatar" style={{ background: 'var(--chart-2)', flex: 'none' }} aria-label="You">
            {initials(turn.author)}
          </span>
          <div className="chat-stack">
            <div className="chat-meta">
              <strong>You</strong>
              <span className="chat-time">{formatTime(turn.createdAt)}</span>
            </div>
            <div className="chat-bubble chat-bubble--user" style={{ whiteSpace: 'pre-wrap' }}>
              {turn.body}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="chat-row" key={turn.turnId}>
        <span className="sb-avatar sb-avatar--ai" style={{ background: 'var(--chart-6)', flex: 'none' }} aria-label="Opzava AI">
          O
        </span>
        <div className="chat-stack" style={{ maxWidth: '80%' }}>
          <div className="chat-meta">
            <strong>{turn.author || 'Opzava'}</strong>
            <span className="sb-badge sb-badge--accent">✦ AI</span>
            <span className="chat-time">{formatTime(turn.createdAt)}</span>
          </div>
          <div className="chat-bubble" style={{ whiteSpace: 'pre-wrap' }}>
            {turn.body}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-panel">
      {/* ── Page title strip (static, not inside the log) ── */}
      <div className="chat-titlebar">
        <div className="chat-titlebar-inner">
          <div className="u-row" style={{ gap: 'var(--space-3)', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--fw-semibold)', color: 'var(--fg)' }}>
              Ask Opzava
            </span>
            <span className="u-subtle" style={{ fontSize: 'var(--text-xs)' }}>·</span>
            <span className="u-subtle" style={{ fontSize: 'var(--text-xs)' }}>
              Cross-project oversight — not tied to any single project
            </span>
          </div>
        </div>
      </div>

      {/* ── Chat log ── */}
      <div
        className="chat-log"
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-busy={status === 'loading'}
        aria-label="Conversation with Opzava"
      >
        <div className="chat-log-inner">
          {status === 'loading' && (
            <>
              <span className="u-sr-only">Loading your conversation…</span>
              <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="chat-row" style={{ opacity: 0.5 }}>
                    <span className="sb-avatar" style={{ background: 'var(--surface-3)', flex: 'none' }} />
                    <div className="chat-stack" style={{ maxWidth: '60%' }}>
                      <div style={{ height: '12px', width: '120px', background: 'var(--surface-3)', borderRadius: 'var(--radius-sm)' }} />
                      <div
                        style={{
                          height: '56px',
                          width: '320px',
                          maxWidth: '100%',
                          background: 'var(--surface-2)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-lg)',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {status === 'error' && (
            <div className="chat-row">
              <span className="sb-avatar sb-avatar--ai" style={{ background: 'var(--chart-6)', flex: 'none' }} aria-label="Opzava AI">
                O
              </span>
              <div className="chat-stack" style={{ maxWidth: '80%' }}>
                <div className="chat-bubble" role="alert">
                  <p style={{ margin: '0 0 var(--space-3)' }}>{loadError ?? "Couldn't load your conversation."}</p>
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => void load()}>
                    Retry
                  </button>
                </div>
              </div>
            </div>
          )}

          {status === 'ready' && (
            <>
              {/* ── Offline / coordinator unavailable (top of log; digest + thread still render below) ── */}
              {coordinator?.status === 'offline' && (
                <div className="banner banner-warning" role="alert" aria-live="assertive">
                  <span aria-hidden="true" style={{ fontSize: 'var(--text-md)' }}>
                    ☾
                  </span>
                  <div className="u-grow">
                    <strong>Opzava is offline right now.</strong>
                    <p className="u-muted" style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)' }}>
                      I&apos;ll pick up where we left off when it&apos;s back. Nothing was lost — your last
                      message is queued.
                    </p>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--space-2)',
                      flex: 'none',
                      alignItems: 'flex-start',
                    }}
                  >
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => void load()}>
                      Try again
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost u-subtle"
                      aria-expanded={techOpen}
                      aria-controls="coord-tech-details"
                      onClick={() => setTechOpen((open) => !open)}
                    >
                      {techOpen ? '▾' : '▸'} Technical details
                    </button>
                    {techOpen && (
                      <div
                        id="coord-tech-details"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 'var(--text-xs)',
                          color: 'var(--fg-subtle)',
                          padding: 'var(--space-2) 0',
                          lineHeight: 'var(--lh-normal)',
                        }}
                      >
                        {/* Only non-null fields are rendered — never a placeholder/fake value. */}
                        <div>coordinator_status: {coordinator.status}</div>
                        {coordinator.runId !== null && <div>run_id: {coordinator.runId}</div>}
                        {coordinator.lastSeen !== null && <div>last_seen: {coordinator.lastSeen}</div>}
                        {coordinator.reason !== null && <div>reason: {coordinator.reason}</div>}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Opzava proactive digest (opens the thread) ── */}
              {digest && (
                <div className="chat-row">
                  <span className="sb-avatar sb-avatar--ai" style={{ background: 'var(--chart-6)', flex: 'none' }} aria-label="Opzava AI">
                    O
                  </span>
                  <div className="chat-stack" style={{ maxWidth: '80%' }}>
                    <div className="chat-meta">
                      <strong>Opzava</strong>
                      <span className="sb-badge sb-badge--accent">✦ AI</span>
                      <span className="chat-time">Live</span>
                    </div>
                    <div className="chat-bubble">
                      <p style={{ margin: '0 0 var(--space-2)' }}>
                        Here&apos;s where everything stands across your projects right now.
                      </p>
                      <p className="u-muted" style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--text-sm)' }}>
                        {digestSummaryLine(digest.summary)}
                      </p>

                      {digest.projects.length > 0 ? (
                        <div className="digest-card" role="table" aria-label="Project status digest">
                          <div
                            className="digest-row"
                            role="row"
                            style={{ padding: 'var(--space-2) var(--space-4)', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}
                          >
                            <span
                              className="u-subtle"
                              role="columnheader"
                              style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--fw-semibold)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', flex: 'none', minWidth: '96px' }}
                            >
                              Status
                            </span>
                            <span
                              className="u-subtle"
                              role="columnheader"
                              style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--fw-semibold)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', flex: 1 }}
                            >
                              Project
                            </span>
                          </div>

                          {digest.projects.map((p) => {
                            const pres = healthPresentation(p.health)
                            const blocked = p.health === 'blocked'
                            return (
                              <div
                                key={p.projectId}
                                className="digest-row"
                                role="row"
                                style={pres.rowBg ? { background: pres.rowBg } : undefined}
                              >
                                <span className={`digest-pill ${pres.pill}`} role="cell">
                                  <span aria-hidden="true">{pres.glyph}</span> {pres.label}
                                </span>
                                <div className="digest-summary" role="cell">
                                  <span style={{ color: 'var(--fg)', fontWeight: 'var(--fw-medium)' }}>{p.name}</span>
                                  {p.summary && (
                                    <span className="u-muted" style={{ marginLeft: 'var(--space-2)' }}>
                                      — {p.summary}
                                    </span>
                                  )}
                                </div>
                                <div className="digest-actions" role="cell">
                                  {blocked ? (
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-ghost"
                                      onClick={() => fillComposer(`What's blocking ${p.name}?`)}
                                      aria-label={`Ask what's blocking ${p.name}`}
                                    >
                                      Fix
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-ghost"
                                      onClick={() => fillComposer(`How is ${p.name} going?`)}
                                      aria-label={`Review ${p.name}`}
                                    >
                                      Review
                                    </button>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="u-subtle" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
                          No active projects yet.
                        </p>
                      )}

                    </div>
                  </div>
                </div>
              )}

              {/* ── Pending approvals — one accent action-bubble per approval (mockup MSG 4) ── */}
              {digest?.pendingApprovals.map(renderApprovalBubble)}

              {/* ── Timeline ── */}
              {turns.map(renderTurn)}

              {/* ── Cold-start empty slate ── */}
              {turns.length === 0 && (
                <div className="chat-row">
                  <span className="sb-avatar sb-avatar--ai" style={{ background: 'var(--chart-6)', flex: 'none' }} aria-label="Opzava AI">
                    O
                  </span>
                  <div className="chat-stack" style={{ maxWidth: '80%' }}>
                    <div className="chat-meta">
                      <strong>Opzava</strong>
                      <span className="sb-badge sb-badge--accent">✦ AI</span>
                    </div>
                    <div className="chat-bubble">
                      <p style={{ margin: 0 }}>
                        Ask me anything about your projects — status, blockers, or what needs your attention.
                      </p>
                      <div className="u-row" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
                        {EXAMPLE_PROMPTS.map((ex) => (
                          <button key={ex} type="button" className="btn btn-sm btn-ghost" onClick={() => fillComposer(ex)}>
                            {ex}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>{/* /chat-log-inner */}
      </div>{/* /chat-log */}

      {/* ── Composer (pinned) ── */}
      <div className="composer-wrap">
        {sendError && (
          <div
            role="alert"
            className="u-row"
            style={{ maxWidth: '860px', margin: '0 auto var(--space-2)', gap: 'var(--space-2)', color: 'var(--danger)', fontSize: 'var(--text-xs)' }}
          >
            <span aria-hidden="true">✕</span>
            <span>{sendError}</span>
          </div>
        )}
        {offline && !sendError && (
          <div
            role="status"
            className="u-row"
            style={{ maxWidth: '860px', margin: '0 auto var(--space-2)', gap: 'var(--space-2)', color: 'var(--fg-subtle)', fontSize: 'var(--text-xs)' }}
          >
            <span aria-hidden="true">◌</span>
            <span>Opzava may be offline — your message is saved and will sync once it&apos;s back.</span>
          </div>
        )}
        <form className="composer" role="search" aria-label="Message Opzava" onSubmit={handleSubmit}>
          <label htmlFor="msgInput" className="u-sr-only">Message Opzava</label>
          <textarea
            id="msgInput"
            ref={textareaRef}
            rows={1}
            placeholder="Message Opzava…"
            aria-label="Message Opzava"
            autoComplete="off"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            onInput={resize}
            onKeyDown={handleKeyDown}
          />
          <span className="composer-hint" aria-hidden="true"><kbd className="kbd">↵</kbd> send</span>
          <button
            className="composer-send"
            type="submit"
            aria-label="Send message"
            aria-busy={sending}
            disabled={sending || !msg.trim()}
          >
            ↑
          </button>
        </form>
      </div>
    </div>
  )
}
