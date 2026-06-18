'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'

// Read-only view of durable-runner cost events served by /api/ops/costs.
interface CostEvent {
  costEventId: string
  providerId: string
  operation: string
  units: Record<string, number>
  estimatedCostCents: number
  actualCostCents: number | null
  currency: string
  recordedAt: string
}

interface CostRecord {
  recordId: string
  occurredAt: string
  event: CostEvent
}

interface CostSummary {
  count: number
  estimatedCostCents: number
  actualCostCents: number
}

function cents(value: number): string {
  return `$${(value / 100).toFixed(2)}`
}

function unitsLabel(units: Record<string, number>): string {
  const parts = Object.entries(units).map(([k, v]) => `${v} ${k}`)
  return parts.length ? parts.join(', ') : '—'
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border/30 bg-surface-1/20 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${accent ? 'text-void-cyan' : 'text-foreground'}`}>{value}</div>
    </div>
  )
}

function CostRow({ record }: { record: CostRecord }) {
  const e = record.event
  return (
    <li className="rounded-lg border border-border/30 bg-surface-1/20 p-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{e.providerId}</span>
          <span className="text-[11px] text-muted-foreground">{e.operation}</span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {unitsLabel(e.units)} · {new Date(record.occurredAt).toLocaleString()}
        </p>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-medium">{cents(e.actualCostCents ?? e.estimatedCostCents)}</div>
        <div className="text-[11px] text-muted-foreground">
          {e.actualCostCents === null ? 'estimated' : 'actual'} · {e.currency}
        </div>
      </div>
    </li>
  )
}

export function OpsCostsPanel() {
  const [records, setRecords] = useState<CostRecord[]>([])
  const [summary, setSummary] = useState<CostSummary>({ count: 0, estimatedCostCents: 0, actualCostCents: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ops/costs')
      if (!res.ok) {
        setError('Failed to load costs')
        return
      }
      const data = await res.json()
      setRecords(Array.isArray(data.events) ? data.events : [])
      setSummary(data.summary ?? { count: 0, estimatedCostCents: 0, actualCostCents: 0 })
      setError(null)
    } catch {
      setError('Failed to load costs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return <Loader variant="panel" label="Loading costs" />
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Costs</h2>
          <p className="text-sm text-muted-foreground">
            What provider executions cost. Estimated at reservation, reconciled to actual when the provider reports it.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          Refresh
        </Button>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-md text-sm border border-red-500/20 bg-red-500/10 text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Events" value={String(summary.count)} />
        <SummaryCard label="Estimated" value={cents(summary.estimatedCostCents)} />
        <SummaryCard label="Actual" value={cents(summary.actualCostCents)} accent />
      </div>

      {records.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/30 bg-surface-1/10 p-8 text-center text-sm text-muted-foreground">
          No cost events yet. Provider executions will record their cost here.
        </div>
      ) : (
        <ul className="space-y-2">
          {records.map((r) => (
            <CostRow key={r.recordId} record={r} />
          ))}
        </ul>
      )}
    </div>
  )
}
