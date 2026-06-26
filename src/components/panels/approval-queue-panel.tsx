'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader } from '@/components/ui/loader'

// Read-only view of persisted Opzava approvals served by /api/ops/approvals.
// Deciding an approval is a guarded server action handled elsewhere, not here.
interface Approval {
  approvalId: string
  requestedAction: string
  target: { kind: 'artifact' | 'external-action'; id: string }
  status: 'requested' | 'approved' | 'rejected' | 'expired' | 'cancelled'
  requesterId: string
  approverId: string | null
  decisionReason: string | null
  requestedAt: string
  decidedAt: string | null
  expiresAt: string | null
}

const FILTERS = ['requested', 'approved', 'rejected', 'all'] as const
type Filter = (typeof FILTERS)[number]

const MONO = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  color: 'var(--fg-subtle)',
} as const

/** Returns a DS badge class for an approval status — label+variant, never whole-row hue. */
function statusBadgeClass(status: Approval['status']): string {
  switch (status) {
    case 'approved': return 'badge badge-success'
    case 'rejected': return 'badge badge-danger'
    case 'requested': return 'badge badge-warning'
    default: return 'badge'
  }
}

/** Compact elapsed-time string for the Age column. */
function computeAge(isoString: string): string {
  const ms = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return '<1m'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

export function ApprovalQueuePanel() {
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [filter, setFilter] = useState<Filter>('requested')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async (next: Filter) => {
    setLoading(true)
    try {
      const qs = next === 'all' ? '' : `?status=${next}`
      const res = await fetch(`/api/ops/approvals${qs}`)
      if (!res.ok) {
        setError('Failed to load approvals')
        return
      }
      const data = await res.json()
      setApprovals(Array.isArray(data.approvals) ? data.approvals : [])
      setError(null)
    } catch {
      setError('Failed to load approvals')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(filter)
  }, [load, filter])

  const decide = async (id: string, decision: 'approved' | 'rejected') => {
    const reason = window.prompt(`Reason for ${decision} (optional):`, '')
    if (reason === null) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/ops/approvals/${id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, decisionReason: reason }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || `Could not ${decision} the approval`)
        return
      }
      setError(null)
      await load(filter)
    } catch {
      setError(`Could not ${decision} the approval`)
    } finally {
      setBusyId(null)
    }
  }

  // Stats derived from the loaded set — accurate when filter='all'; scoped otherwise.
  const pendingCount = approvals.filter((a) => a.status === 'requested').length
  const approvedCount = approvals.filter((a) => a.status === 'approved').length
  const rejectedCount = approvals.filter((a) => a.status === 'rejected').length

  const filterLabel =
    filter === 'requested'
      ? 'Pending approvals'
      : filter === 'all'
        ? 'All approvals'
        : `${filter.charAt(0).toUpperCase() + filter.slice(1)} approvals`

  return (
    <div
      className="opzava-ds p-4 md:p-6 max-w-4xl mx-auto"
      style={{ background: 'var(--bg)', color: 'var(--fg)' }}
    >
      {/* ── Page header ─────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h2 className="page-title font-semibold">Approval Queue</h2>
          <p className="page-sub">
            Actions waiting on a human decision. The system blocks the external action until an approval is granted.
          </p>
        </div>
        <button type="button" className="btn" onClick={() => load(filter)}>
          Refresh
        </button>
      </div>

      {/* ── Summary stats ───────────────────────────────────── */}
      <section aria-label="Approvals summary" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="stat-grid">
          <div className="stat">
            <div className="stat-label">Pending</div>
            <div className="flex items-center gap-2">
              <span className="stat-value">{pendingCount}</span>
              {pendingCount > 0 && <span className="dot dot-warning" aria-hidden />}
            </div>
            <div className="stat-delta" style={{ color: 'var(--fg-subtle)' }}>needs you</div>
          </div>
          <div className="stat">
            <div className="stat-label">Approved</div>
            <div className="stat-value">{approvedCount}</div>
            <div className="stat-delta" style={{ color: 'var(--fg-subtle)' }}>in view</div>
          </div>
          <div className="stat">
            <div className="stat-label">Denied</div>
            <div className="flex items-center gap-2">
              <span className="stat-value">{rejectedCount}</span>
              {rejectedCount > 0 && <span className="dot" aria-hidden />}
            </div>
            <div className="stat-delta" style={{ color: 'var(--fg-subtle)' }}>in view</div>
          </div>
        </div>
      </section>

      {/* ── Filter tabs ──────────────────────────────────────── */}
      <div
        className="tabs"
        role="tablist"
        aria-label="Filter approvals by status"
        style={{ marginBottom: 'var(--space-4)' }}
      >
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={`tab${filter === f ? ' active' : ''}`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* ── Error banner ─────────────────────────────────────── */}
      {error && (
        <div className="banner banner-danger" role="alert" style={{ marginBottom: 'var(--space-4)' }}>
          <span className="flex-1">{error}</span>
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm"
            aria-label="Dismiss error"
            onClick={() => setError(null)}
          >
            ×
          </button>
        </div>
      )}

      {/* ── Content ─────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center" style={{ height: 128 }}>
          <Loader variant="panel" label="Loading approvals" />
        </div>
      ) : approvals.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden>⏳</div>
          <div className="empty-title">No approvals</div>
          <div className="empty-desc">Nothing here. No approvals match this filter.</div>
        </div>
      ) : (
        <section aria-labelledby="approvals-heading">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title" id="approvals-heading">{filterLabel}</h3>
              <span className="badge">
                {approvals.length}{filter === 'requested' ? ' awaiting you' : ' records'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="table">
                <caption className="sr-only">
                  {filterLabel} — each row shows the requested action, who requested it (AI agent shown with ✦),
                  the target, its current status, how long ago it was submitted,
                  and Approve / Reject buttons for pending items.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Action</th>
                    <th scope="col">Requested by</th>
                    <th scope="col">Target</th>
                    <th scope="col">Status</th>
                    <th scope="col">Age</th>
                    <th scope="col">Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {approvals.map((a) => {
                    const busy = busyId === a.approvalId
                    // External-action + pending = highest-impact; flag with danger left-border
                    // (no risk field in the API — target.kind is the closest proxy).
                    const isDangerRow = a.target.kind === 'external-action' && a.status === 'requested'
                    return (
                      <tr key={a.approvalId}>
                        <td
                          className="font-medium"
                          style={
                            isDangerRow
                              ? { borderLeft: '3px solid var(--danger)', paddingLeft: 'var(--space-3)' }
                              : undefined
                          }
                        >
                          {a.requestedAction}
                          {a.decisionReason && (
                            <div
                              style={{
                                fontSize: 'var(--text-xs)',
                                color: 'var(--fg-subtle)',
                                marginTop: 2,
                                fontWeight: 400,
                              }}
                            >
                              {a.decisionReason}
                            </div>
                          )}
                        </td>
                        <td>
                          {/* All requesters in the approval queue are AI agents — distinguished by ✦ glyph, never colour. */}
                          <span className="flex items-center gap-1.5">
                            <span
                              aria-hidden
                              style={{ color: 'var(--accent)', fontSize: 'var(--text-base)', lineHeight: 1 }}
                            >
                              ✦
                            </span>
                            <span className="sr-only">AI agent:</span>
                            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)' }}>
                              {a.requesterId}
                            </span>
                          </span>
                        </td>
                        <td>
                          <div>
                            <span
                              style={{
                                fontSize: 'var(--text-xs)',
                                color: 'var(--fg-subtle)',
                                textTransform: 'capitalize',
                              }}
                            >
                              {a.target.kind.replace('-', ' ')}
                            </span>
                            <div
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: 'var(--text-xs)',
                                color: 'var(--fg-muted)',
                                marginTop: 2,
                              }}
                            >
                              {a.target.id}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={statusBadgeClass(a.status)}>{a.status}</span>
                          {a.approverId && (
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)', marginTop: 2 }}>
                              by {a.approverId}
                            </div>
                          )}
                        </td>
                        <td>
                          <time style={MONO}>{computeAge(a.requestedAt)}</time>
                          {a.decidedAt && (
                            <div style={MONO}>
                              →{' '}
                              {new Date(a.decidedAt).toLocaleTimeString(undefined, {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          )}
                        </td>
                        <td>
                          {a.status === 'requested' ? (
                            <span className="flex items-center gap-1.5">
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                disabled={busy}
                                onClick={() => decide(a.approvalId, 'approved')}
                                aria-label={`Approve: ${a.requestedAction}`}
                              >
                                {busy ? '…' : 'Approve'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-danger"
                                disabled={busy}
                                onClick={() => decide(a.approvalId, 'rejected')}
                                aria-label={`Reject: ${a.requestedAction}`}
                              >
                                Reject
                              </button>
                            </span>
                          ) : (
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="card-footer">
              <p className="hint">
                {pendingCount > 0 ? `${pendingCount} pending` : 'No pending'} · {approvedCount} approved ·{' '}
                {rejectedCount} denied · filtered to: {filter}
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
