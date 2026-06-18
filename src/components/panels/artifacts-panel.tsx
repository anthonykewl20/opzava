'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader } from '@/components/ui/loader'

// Read-only artifact browser served by /api/ops/artifacts (summaries) and
// /api/ops/artifacts/[id] (full artifact). Lineage/validation are server truth.
interface ArtifactSummary {
  artifactId: string
  artifactType: string
  sourceStepRunId: string
  validationStatus: 'pending' | 'valid' | 'invalid'
  inputArtifactIds: string[]
}

interface ArtifactDetail extends ArtifactSummary {
  content: unknown
  validation: { status: string; checkedAt: string | null; message?: string }
  lineage: { inputArtifactIds: string[] }
}

const VALIDATION_STYLES: Record<string, string> = {
  valid: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  invalid: 'bg-red-500/10 text-red-400 border-red-500/20',
}

function ValidationPill({ status }: { status: string }) {
  const style = VALIDATION_STYLES[status] ?? 'bg-surface-1/40 text-muted-foreground border-border/30'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${style}`}>
      {status}
    </span>
  )
}

function ArtifactRow({ summary, onOpen }: { summary: ArtifactSummary; onOpen: (id: string) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(summary.artifactId)}
        className="w-full text-left rounded-lg border border-border/30 bg-surface-1/20 p-3 hover:border-void-cyan/30 transition-colors"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium truncate">{summary.artifactType}</span>
            <ValidationPill status={summary.validationStatus} />
          </div>
          <span className="text-[11px] text-muted-foreground font-mono shrink-0">{summary.artifactId}</span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          step {summary.sourceStepRunId} · {summary.inputArtifactIds.length} lineage input(s)
        </p>
      </button>
    </li>
  )
}

function ArtifactDetailView({ artifact, onBack }: { artifact: ArtifactDetail; onBack: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="text-[11px] text-void-cyan hover:text-void-cyan/80">
          ← Back to list
        </button>
        <ValidationPill status={artifact.validation.status} />
      </div>
      <div>
        <h3 className="text-sm font-semibold">{artifact.artifactType}</h3>
        <p className="text-[11px] text-muted-foreground font-mono">{artifact.artifactId}</p>
      </div>
      <div className="rounded-lg border border-border/30 bg-surface-1/20 p-3">
        <div className="text-[11px] font-medium text-foreground/90 mb-1">Lineage</div>
        {artifact.lineage.inputArtifactIds.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No upstream inputs.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {artifact.lineage.inputArtifactIds.map((id) => (
              <li key={id} className="rounded-full border border-border/30 bg-surface-1/30 px-2 py-0.5 text-[11px] font-mono">
                {id}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-lg border border-border/30 bg-surface-1/20 p-3">
        <div className="text-[11px] font-medium text-foreground/90 mb-1">Content</div>
        <pre className="text-[11px] text-foreground/80 whitespace-pre-wrap break-words overflow-x-auto max-h-96">
          {JSON.stringify(artifact.content, null, 2)}
        </pre>
      </div>
    </div>
  )
}

export function ArtifactsPanel() {
  const [items, setItems] = useState<ArtifactSummary[]>([])
  const [detail, setDetail] = useState<ArtifactDetail | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (type: string) => {
    setLoading(true)
    try {
      const qs = type === 'all' ? '' : `?type=${encodeURIComponent(type)}`
      const res = await fetch(`/api/ops/artifacts${qs}`)
      if (!res.ok) {
        setError('Failed to load artifacts')
        return
      }
      const data = await res.json()
      setItems(Array.isArray(data.artifacts) ? data.artifacts : [])
      setError(null)
    } catch {
      setError('Failed to load artifacts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!detail) load(typeFilter)
  }, [load, typeFilter, detail])

  const open = async (id: string) => {
    try {
      const res = await fetch(`/api/ops/artifacts/${id}`)
      if (!res.ok) {
        setError('Failed to load the artifact')
        return
      }
      const data = await res.json()
      setDetail(data.artifact)
      setError(null)
    } catch {
      setError('Failed to load the artifact')
    }
  }

  const types = useMemo(() => {
    const set = new Set(items.map((a) => a.artifactType))
    return ['all', ...Array.from(set).sort()]
  }, [items])

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div>
        <h2 className="text-lg font-semibold">Artifacts</h2>
        <p className="text-sm text-muted-foreground">
          Validated content artifacts produced by workflow runs. Open one to inspect its lineage and content.
        </p>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-md text-sm border border-red-500/20 bg-red-500/10 text-red-400">
          {error}
        </div>
      )}

      {detail ? (
        <ArtifactDetailView artifact={detail} onBack={() => setDetail(null)} />
      ) : loading ? (
        <Loader variant="panel" label="Loading artifacts" />
      ) : (
        <>
          {types.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {types.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                    typeFilter === t
                      ? 'bg-void-cyan/10 text-void-cyan border-void-cyan/30'
                      : 'bg-surface-1/30 text-muted-foreground border-border/30 hover:text-foreground'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/30 bg-surface-1/10 p-8 text-center text-sm text-muted-foreground">
              No artifacts yet. Workflow runs will record their artifacts here.
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((a) => (
                <ArtifactRow key={a.artifactId} summary={a} onOpen={open} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
