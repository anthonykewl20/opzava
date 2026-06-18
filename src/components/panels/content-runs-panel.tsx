'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'

// Read-only recent-runs view served by /api/ops/runs — one row per workflow run,
// aggregated from operational events. Run orchestration stays a server concern.
interface RunSummary {
  workflowRunId: string
  eventCount: number
  lastEventAt: string
  externalCallCount: number
  costCount: number
  auditCount: number
}

function CountChip({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border ${accent}`}>
      <span className="font-semibold">{value}</span>
      <span className="opacity-80">{label}</span>
    </span>
  )
}

function RunRow({ run }: { run: RunSummary }) {
  return (
    <li className="rounded-lg border border-border/30 bg-surface-1/20 p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium font-mono truncate">{run.workflowRunId}</span>
        <span className="text-[11px] text-muted-foreground shrink-0">
          {new Date(run.lastEventAt).toLocaleString()}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <CountChip label="events" value={run.eventCount} accent="bg-surface-1/40 text-muted-foreground border-border/30" />
        <CountChip label="calls" value={run.externalCallCount} accent="bg-void-cyan/10 text-void-cyan border-void-cyan/20" />
        <CountChip label="cost" value={run.costCount} accent="bg-emerald-500/10 text-emerald-400 border-emerald-500/20" />
        <CountChip label="audit" value={run.auditCount} accent="bg-amber-500/10 text-amber-400 border-amber-500/20" />
      </div>
    </li>
  )
}

export function ContentRunsPanel() {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [starting, setStarting] = useState(false)
  const [form, setForm] = useState({ title: '', topic: '', targetAudience: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ops/runs')
      if (!res.ok) {
        setError('Failed to load runs')
        return
      }
      const data = await res.json()
      setRuns(Array.isArray(data.runs) ? data.runs : [])
      setError(null)
    } catch {
      setError('Failed to load runs')
    } finally {
      setLoading(false)
    }
  }, [])

  const startRun = useCallback(async () => {
    if (!form.title.trim() || !form.topic.trim()) return
    setStarting(true)
    try {
      const res = await fetch('/api/ops/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          topic: form.topic.trim(),
          targetAudience: form.targetAudience.trim() || undefined,
        }),
      })
      if (!res.ok) {
        setError('Failed to start run')
        return
      }
      setForm({ title: '', topic: '', targetAudience: '' })
      setShowForm(false)
      setError(null)
      await load()
    } catch {
      setError('Failed to start run')
    } finally {
      setStarting(false)
    }
  }, [form, load])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return <Loader variant="panel" label="Loading runs" />
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Content Runs</h2>
          <p className="text-sm text-muted-foreground">
            Recent workflow runs, summarized from their operational events — external calls, cost, and audit activity.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={() => setShowForm((v) => !v)}>
            New content run
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={load}>
            Refresh
          </Button>
        </div>
      </div>

      {showForm && (
        <div className="rounded-lg border border-border/30 bg-surface-1/20 p-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="content-run-title" className="text-xs font-medium text-muted-foreground">
                Title <span className="text-red-400" aria-hidden="true">*</span>
              </label>
              <input
                id="content-run-title"
                className="w-full rounded-md border border-border/40 bg-surface-2/40 px-3 py-2 text-sm outline-none focus:border-void-cyan/50"
                placeholder="Cold Brew Guide"
                required
                aria-required="true"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="content-run-topic" className="text-xs font-medium text-muted-foreground">
                Topic / keyword <span className="text-red-400" aria-hidden="true">*</span>
              </label>
              <input
                id="content-run-topic"
                className="w-full rounded-md border border-border/40 bg-surface-2/40 px-3 py-2 text-sm outline-none focus:border-void-cyan/50"
                placeholder="cold brew"
                required
                aria-required="true"
                value={form.topic}
                onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor="content-run-audience" className="text-xs font-medium text-muted-foreground">
              Target audience (optional)
            </label>
            <input
              id="content-run-audience"
              className="w-full rounded-md border border-border/40 bg-surface-2/40 px-3 py-2 text-sm outline-none focus:border-void-cyan/50"
              placeholder="Coffee lovers"
              value={form.targetAudience}
              onChange={(e) => setForm((f) => ({ ...f, targetAudience: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={startRun}
              disabled={starting || !form.title.trim() || !form.topic.trim()}
            >
              {starting ? 'Starting…' : 'Start run'}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)} disabled={starting}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="px-3 py-2 rounded-md text-sm border border-red-500/20 bg-red-500/10 text-red-400">
          {error}
        </div>
      )}

      {runs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/30 bg-surface-1/10 p-8 text-center text-sm text-muted-foreground">
          No runs yet. Workflow activity will appear here as runs execute.
        </div>
      ) : (
        <ul className="space-y-2">
          {runs.map((r) => (
            <RunRow key={r.workflowRunId} run={r} />
          ))}
        </ul>
      )}
    </div>
  )
}
