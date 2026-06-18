'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { apiFetch } from '@/lib/api-client'

// Read-only view of durable-runner dead letters served by /api/ops/dead-letters.
// The panel renders failure state; replay/remediation stays a server concern.
interface DeadLetter {
  deadLetterId: string
  jobId: string
  workflowRunId: string
  stepRunId: string | null
  finalError: { class: string; message: string }
  replay: { eligible: boolean; source: string; reason: string }
  createdAt: string
}

interface DeadLetterRecord {
  storedAt: string
  workflowRunId: string
  replayEligible: boolean
  deadLetter: DeadLetter
}

const ERROR_STYLES: Record<string, string> = {
  timeout: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'provider-error': 'bg-red-500/10 text-red-400 border-red-500/20',
  'validation-error': 'bg-void-cyan/10 text-void-cyan border-void-cyan/20',
  'permission-error': 'bg-red-500/10 text-red-400 border-red-500/20',
  unknown: 'bg-surface-1/40 text-muted-foreground border-border/30',
}

function ErrorPill({ kind }: { kind: string }) {
  const style = ERROR_STYLES[kind] ?? ERROR_STYLES.unknown
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${style}`}>
      {kind}
    </span>
  )
}

function DeadLetterRow({ record }: { record: DeadLetterRecord }) {
  const dl = record.deadLetter
  return (
    <li className="rounded-lg border border-border/30 bg-surface-1/20 p-3 space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">{dl.jobId}</span>
          <ErrorPill kind={dl.finalError.class} />
          {record.replayEligible && (
            <span className="text-[11px] text-void-cyan">replayable</span>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground shrink-0">
          {new Date(record.storedAt).toLocaleString()}
        </span>
      </div>
      <p className="text-xs text-foreground/80 break-words">{dl.finalError.message}</p>
      <p className="text-[11px] text-muted-foreground">
        run {dl.workflowRunId}
        {dl.stepRunId ? ` · step ${dl.stepRunId}` : ''} · {dl.replay.source}: {dl.replay.reason}
      </p>
    </li>
  )
}

export function OpsFailuresPanel() {
  const [records, setRecords] = useState<DeadLetterRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ deadLetters?: DeadLetterRecord[] }>('/api/ops/dead-letters')
      setRecords(Array.isArray(data.deadLetters) ? data.deadLetters : [])
      setError(null)
    } catch {
      setError('Failed to load failures')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return <Loader variant="panel" label="Loading failures" />
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Failures &amp; Dead Letters</h2>
          <p className="text-sm text-muted-foreground">
            Jobs that exhausted their retries. The runner keeps them for review and replay — nothing is lost.
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

      {records.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/30 bg-surface-1/10 p-8 text-center text-sm text-muted-foreground">
          No failures. Every job has completed or is still in flight.
        </div>
      ) : (
        <ul className="space-y-2">
          {records.map((r) => (
            <DeadLetterRow key={r.deadLetter.deadLetterId} record={r} />
          ))}
        </ul>
      )}
    </div>
  )
}
