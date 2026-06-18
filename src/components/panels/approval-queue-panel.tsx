'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
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

const STATUS_STYLES: Record<Approval['status'], string> = {
  requested: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  expired: 'bg-surface-1/40 text-muted-foreground border-border/30',
  cancelled: 'bg-surface-1/40 text-muted-foreground border-border/30',
}

const FILTERS = ['requested', 'approved', 'rejected', 'all'] as const
type Filter = (typeof FILTERS)[number]

function StatusPill({ status }: { status: Approval['status'] }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  )
}

function ApprovalRow({
  approval,
  busy,
  onDecide,
}: {
  approval: Approval
  busy: boolean
  onDecide: (id: string, decision: 'approved' | 'rejected') => void
}) {
  return (
    <li className="rounded-lg border border-border/30 bg-surface-1/20 p-3 space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">{approval.requestedAction}</span>
          <StatusPill status={approval.status} />
        </div>
        <span className="text-[11px] text-muted-foreground shrink-0">
          {new Date(approval.requestedAt).toLocaleString()}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {approval.target.kind} {approval.target.id} · requested by {approval.requesterId}
        {approval.approverId ? ` · decided by ${approval.approverId}` : ''}
      </p>
      {approval.decisionReason && (
        <p className="text-xs text-foreground/80">{approval.decisionReason}</p>
      )}
      {approval.status === 'requested' && (
        <div className="flex items-center gap-2 pt-1">
          <Button variant="success" size="xs" disabled={busy} onClick={() => onDecide(approval.approvalId, 'approved')}>
            {busy ? '…' : 'Approve'}
          </Button>
          <Button variant="destructive" size="xs" disabled={busy} onClick={() => onDecide(approval.approvalId, 'rejected')}>
            Reject
          </Button>
        </div>
      )}
    </li>
  )
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

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Approval Queue</h2>
          <p className="text-sm text-muted-foreground">
            Actions waiting on a human decision. The system blocks the external action until an approval is granted.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(filter)}>
          Refresh
        </Button>
      </div>

      <div className="flex items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${
              filter === f
                ? 'bg-void-cyan/10 text-void-cyan border-void-cyan/30'
                : 'bg-surface-1/30 text-muted-foreground border-border/30 hover:text-foreground'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {error && (
        <div className="px-3 py-2 rounded-md text-sm border border-red-500/20 bg-red-500/10 text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <Loader variant="panel" label="Loading approvals" />
      ) : approvals.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/30 bg-surface-1/10 p-8 text-center text-sm text-muted-foreground">
          Nothing here. No approvals match this filter.
        </div>
      ) : (
        <ul className="space-y-2">
          {approvals.map((a) => (
            <ApprovalRow key={a.approvalId} approval={a} busy={busyId === a.approvalId} onDecide={decide} />
          ))}
        </ul>
      )}
    </div>
  )
}
