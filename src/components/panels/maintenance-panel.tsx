'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

// Admin maintenance: triggers the guarded /api/ops/maintenance/prune retention GC
// and shows the last report. The deletion policy itself lives server-side.
interface PruneReport {
  operationalEvents: number
  deadLetters: number
  succeededJobs: number
}

interface PruneResult {
  prunedAt: string
  cutoff: string
  report: PruneReport
}

const inputClass =
  'w-24 rounded-md border border-border/40 bg-surface-1/30 px-2.5 py-1.5 text-sm text-foreground ' +
  'focus:outline-none focus:ring-1 focus:ring-void-cyan/40 focus:border-void-cyan/40'

function ReportRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/20 bg-surface-1/10 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  )
}

export function MaintenancePanel() {
  const [retentionDays, setRetentionDays] = useState('90')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<PruneResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runCleanup = async () => {
    const days = Number(retentionDays)
    if (!Number.isFinite(days) || days < 0) {
      setError('Retention days must be a non-negative number')
      return
    }
    if (!window.confirm(`Permanently delete runner data older than ${days} days? This cannot be undone.`)) {
      return
    }
    setRunning(true)
    setError(null)
    try {
      const res = await fetch('/api/ops/maintenance/prune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retentionDays: days }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Cleanup failed')
        return
      }
      setResult(data)
    } catch {
      setError('Cleanup failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl mx-auto">
      <div>
        <h2 className="text-lg font-semibold">Maintenance</h2>
        <p className="text-sm text-muted-foreground">
          Garbage-collect old runner data. Only completed work past the retention window is removed — in-flight
          jobs, failures, and dead letters are kept until they age out.
        </p>
      </div>

      <div className="rounded-lg border border-border/30 bg-surface-1/20 p-4 space-y-3">
        <div className="flex items-end gap-3">
          <label className="space-y-1">
            <span className="block text-xs font-medium text-foreground/90">Retention (days)</span>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
            />
          </label>
          <Button variant="destructive" onClick={runCleanup} disabled={running}>
            {running ? 'Running…' : 'Run cleanup'}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Deletes operational events, dead letters, and succeeded jobs with timestamps older than the window.
        </p>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-md text-sm border border-red-500/20 bg-red-500/10 text-red-400">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-border/30 bg-surface-1/20 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Last cleanup</h3>
            <span className="text-[11px] text-muted-foreground">{new Date(result.prunedAt).toLocaleString()}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">Cutoff: {new Date(result.cutoff).toLocaleString()}</p>
          <div className="grid grid-cols-3 gap-2 pt-1">
            <ReportRow label="Events" value={result.report.operationalEvents} />
            <ReportRow label="Dead letters" value={result.report.deadLetters} />
            <ReportRow label="Jobs" value={result.report.succeededJobs} />
          </div>
        </div>
      )}
    </div>
  )
}
