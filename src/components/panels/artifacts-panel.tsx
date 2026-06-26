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

// Validation status → DS .badge modifier — label+badge only, no rainbow colour map.
function validationBadgeClass(status: string): string {
  if (status === 'valid') return 'badge badge-success'
  if (status === 'pending') return 'badge badge-warning'
  if (status === 'invalid') return 'badge badge-danger'
  return 'badge'
}

const MONO_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  color: 'var(--fg-subtle)',
}

// Section sub-label inside card-body (no horizontal padding override needed here)
const SUB_LABEL_STYLE: React.CSSProperties = { padding: '0 0 var(--space-2)' }

function ArtifactDetailView({ artifact, onBack }: { artifact: ArtifactDetail; onBack: () => void }) {
  return (
    <div className="space-y-4">
      {/* Back nav + validation badge */}
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="btn btn-ghost btn-sm">
          ← Back to list
        </button>
        <span className={validationBadgeClass(artifact.validation.status)}>
          {artifact.validation.status}
        </span>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">{artifact.artifactType}</h3>
          {/* artifact ID is a machine identifier — always mono */}
          <span style={MONO_STYLE}>{artifact.artifactId}</span>
        </div>

        <div className="card-body space-y-4">

          {/* Step source — all artifacts come from workflow step runs (system ⚙) */}
          <div>
            <div className="section-label" style={SUB_LABEL_STYLE}>Step run</div>
            <span className="inline-flex items-center gap-1.5">
              {/* ⚙ = system/workflow runner; API has no actor/creator field */}
              <span aria-hidden style={{ color: 'var(--fg-subtle)', fontSize: 'var(--text-sm)' }}>⚙</span>
              <span style={MONO_STYLE}>{artifact.sourceStepRunId}</span>
            </span>
          </div>

          {/* Lineage inputs */}
          <div>
            <div className="section-label" style={SUB_LABEL_STYLE}>Lineage inputs</div>
            {artifact.lineage.inputArtifactIds.length === 0 ? (
              <p className="hint">No upstream inputs.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {artifact.lineage.inputArtifactIds.map((id) => (
                  <span
                    key={id}
                    className="badge"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
                  >
                    {id}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Validation note (optional) */}
          {artifact.validation.message && (
            <div>
              <div className="section-label" style={SUB_LABEL_STYLE}>Validation note</div>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)' }}>
                {artifact.validation.message}
              </p>
            </div>
          )}

          {/* Content */}
          <div>
            <div className="section-label" style={SUB_LABEL_STYLE}>Content</div>
            <pre
              className="overflow-auto"
              style={{
                maxHeight: 384,
                padding: 'var(--space-3)',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs)',
                color: 'var(--fg-muted)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {JSON.stringify(artifact.content, null, 2)}
            </pre>
          </div>

        </div>
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
    <div
      className="opzava-ds p-6 space-y-4 max-w-4xl mx-auto"
      style={{ background: 'var(--bg)', color: 'var(--fg)' }}
    >
      {/* Page header */}
      <div className="page-header">
        <div>
          <h2 className="page-title font-semibold">Artifacts</h2>
          <p className="page-sub">Validated content artifacts produced by workflow runs. Open one to inspect its lineage and content.</p>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="banner banner-danger">
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="btn btn-ghost btn-icon btn-sm"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {/* Detail view */}
      {detail ? (
        <ArtifactDetailView artifact={detail} onBack={() => setDetail(null)} />
      ) : loading ? (
        <div className="flex items-center justify-center" style={{ minHeight: 160 }}>
          <Loader variant="panel" label="Loading artifacts" />
        </div>
      ) : (
        <section aria-labelledby="artifacts-heading">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title" id="artifacts-heading">Recent artifacts</h3>
              <span className="badge">{items.length} shown</span>
            </div>

            {/* Type filter strip */}
            {types.length > 1 && (
              <div
                className="flex flex-wrap gap-1.5 px-5 py-3"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                {types.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTypeFilter(t)}
                    className={`btn btn-sm ${typeFilter === t ? 'btn-primary' : 'btn-ghost'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}

            {/* Empty state */}
            {items.length === 0 ? (
              <div className="empty">
                <div className="empty-icon" aria-hidden>◻</div>
                <div className="empty-title">No artifacts yet</div>
                <div className="empty-desc">Workflow runs will record their artifacts here.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                {/*
                  Columns adapted from real API data (no "name" or "creator" fields):
                  - Artifact ID  → mono identifier (plays "Name" role)
                  - Type         → artifactType as .badge
                  - Source       → sourceStepRunId with ⚙ glyph (all artifacts are system/step-run produced)
                  - Validation   → validationStatus as DS badge (success/warning/danger) — no rainbow map
                  - Lineage      → inputArtifactIds.length count
                  - Open         → dedicated button preserving the original click-to-drill-in behaviour
                */}
                <table className="table table-compact" aria-label="Artifacts list">
                  <caption className="sr-only">
                    Artifacts produced by workflow step runs — ID, type, step source, validation
                    status, and lineage input count. Showing {items.length} artifact
                    {items.length !== 1 ? 's' : ''}.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Artifact ID</th>
                      <th scope="col">Type</th>
                      <th scope="col">Source</th>
                      <th scope="col">Validation</th>
                      <th scope="col" className="num">Lineage</th>
                      <th scope="col"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((a) => (
                      <tr key={a.artifactId}>
                        <td>
                          <span
                            className="font-medium"
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 'var(--text-xs)',
                              color: 'var(--fg)',
                            }}
                          >
                            {a.artifactId}
                          </span>
                        </td>
                        <td>
                          <span className="badge">{a.artifactType}</span>
                        </td>
                        <td>
                          {/* All artifacts are system-produced by step runs — ⚙ glyph, never ✦ AI */}
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              aria-hidden
                              style={{ color: 'var(--fg-subtle)', fontSize: 'var(--text-sm)' }}
                            >
                              ⚙
                            </span>
                            <span
                              className="truncate"
                              style={{ ...MONO_STYLE, maxWidth: 140 }}
                            >
                              {a.sourceStepRunId}
                            </span>
                          </span>
                        </td>
                        <td>
                          <span className={validationBadgeClass(a.validationStatus)}>
                            {a.validationStatus}
                          </span>
                        </td>
                        <td className="num" style={MONO_STYLE}>
                          {a.inputArtifactIds.length}
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => { void open(a.artifactId) }}
                            className="btn btn-ghost btn-sm"
                            aria-label={`Open artifact ${a.artifactId}`}
                          >
                            Open ›
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="card-footer">
              <p className="hint">
                {items.length} artifact{items.length !== 1 ? 's' : ''} · click Open to inspect lineage and content
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
