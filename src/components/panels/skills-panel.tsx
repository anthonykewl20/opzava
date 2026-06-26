'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useMissionControl } from '@/store'

interface SkillSummary {
  id: string
  name: string
  source: string
  path: string
  description?: string
  registry_slug?: string | null
  security_status?: string | null
}

interface SkillGroup {
  source: string
  path: string
  skills: SkillSummary[]
}

interface SkillsResponse {
  skills: SkillSummary[]
  groups: SkillGroup[]
  total: number
}

interface SkillContentResponse {
  source: string
  name: string
  skillPath: string
  skillDocPath: string
  content: string
  security?: { status: string; issues: Array<{ severity: string; rule: string; description: string; line?: number }> }
}

interface RegistrySkill {
  slug: string
  name: string
  description: string
  author: string
  version: string
  source: string
  installCount?: number
  tags?: string[]
}

type PanelTab = 'installed' | 'registry'

const SOURCE_LABELS: Record<string, string> = {
  'user-agents': '~/.agents/skills (global)',
  'user-codex': '~/.codex/skills (global)',
  'project-agents': '.agents/skills (project)',
  'project-codex': '.codex/skills (project)',
  'openclaw': '~/.openclaw/skills (gateway)',
  'workspace': '~/.openclaw/workspace/skills',
}

function getSourceLabel(source: string): string {
  if (SOURCE_LABELS[source]) return SOURCE_LABELS[source]
  if (source.startsWith('workspace-')) {
    const agentName = source.replace('workspace-', '')
    return `${agentName} workspace`
  }
  return source
}

// Source glyph: openclaw/workspace = ✦ AI-rooted; project/user = ⚙ local; unknown = ⚙
function sourceGlyph(source: string): { glyph: string; srLabel: string } {
  if (source === 'openclaw' || source.startsWith('workspace')) return { glyph: '✦', srLabel: 'AI gateway: ' }
  return { glyph: '⚙', srLabel: 'local: ' }
}

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }
const SUBTLE: React.CSSProperties = { color: 'var(--fg-subtle)' }
const MUTED: React.CSSProperties = { color: 'var(--fg-muted)' }
const ROW_BORDER: React.CSSProperties = { borderBottom: '1px solid var(--border)' }

export function SkillsPanel() {
  const t = useTranslations('skills')
  const { dashboardMode, skillsList, skillGroups, skillsTotal, setSkillsData } = useMissionControl()
  const [loading, setLoading] = useState(skillsList === null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [activeRoot, setActiveRoot] = useState<string | null>(null)
  const [selectedSkill, setSelectedSkill] = useState<SkillSummary | null>(null)
  const [selectedContent, setSelectedContent] = useState<SkillContentResponse | null>(null)
  const [draftContent, setDraftContent] = useState('')
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [drawerError, setDrawerError] = useState<string | null>(null)
  const [createSource, setCreateSource] = useState(dashboardMode === 'full' ? 'openclaw' : 'user-codex')
  const [createName, setCreateName] = useState('')
  const [createContent, setCreateContent] = useState('# new-skill\n\nDescribe this skill.\n')
  const [createError, setCreateError] = useState<string | null>(null)
  const [isMounted, setIsMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<PanelTab>('installed')
  const [registrySource, setRegistrySource] = useState<'clawhub' | 'skills-sh' | 'awesome-openclaw'>('awesome-openclaw')
  const [registryQuery, setRegistryQuery] = useState('')
  const [registryResults, setRegistryResults] = useState<RegistrySkill[]>([])
  const [registryLoading, setRegistryLoading] = useState(false)
  const [registryError, setRegistryError] = useState<string | null>(null)
  const [registrySearched, setRegistrySearched] = useState(false)
  const [installTarget, setInstallTarget] = useState(dashboardMode === 'full' ? 'openclaw' : 'user-agents')
  const [installing, setInstalling] = useState<string | null>(null)
  const [installMessage, setInstallMessage] = useState<string | null>(null)
  const [scanAll, setScanAll] = useState<{
    running: boolean
    total: number
    done: number
    current: string | null
    results: { clean: number; warning: number; rejected: number; error: number }
  } | null>(null)
  const [installModal, setInstallModal] = useState<{
    slug: string
    name: string
    step: 'fetching' | 'scanning' | 'writing' | 'done' | 'error'
    message?: string
    securityStatus?: string
  } | null>(null)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const loadSkills = useCallback(async (opts?: { initial?: boolean }) => {
    if (opts?.initial) setLoading(true)
    setError(null)
    const res = await fetch('/api/skills', { cache: 'no-store' })
    const body = await res.json()
    if (!res.ok) throw new Error(body?.error || 'Failed to load skills')
    const resp = body as SkillsResponse
    setSkillsData(resp.skills, resp.groups, resp.total)
    if (opts?.initial) setLoading(false)
  }, [setSkillsData])

  useEffect(() => {
    // Skip initial fetch if we already have cached data from a previous mount
    if (skillsList !== null) return
    let cancelled = false
    async function run() {
      try {
        await loadSkills({ initial: true })
      } catch (err: unknown) {
        if (!cancelled) {
          setError((err instanceof Error ? err.message : null) || 'Failed to load skills')
          setLoading(false)
        }
      }
    }
    run()
    return () => { cancelled = true }
  }, [loadSkills, skillsList])

  // Two-way disk sync: poll for external on-disk changes.
  useEffect(() => {
    const id = window.setInterval(() => {
      loadSkills().catch(() => {})
    }, 10000)
    return () => window.clearInterval(id)
  }, [loadSkills])

  const filtered = useMemo(() => {
    let list = skillsList || []
    if (activeRoot) list = list.filter((s) => s.source === activeRoot)
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((skill) => {
      const haystack = `${skill.name} ${skill.source} ${skill.description || ''}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [skillsList, query, activeRoot])

  useEffect(() => {
    if (!selectedSkill) return
    const skill = selectedSkill
    let cancelled = false
    async function run() {
      setDrawerLoading(true)
      setDrawerError(null)
      setSelectedContent(null)
      try {
        const params = new URLSearchParams({
          mode: 'content',
          source: skill.source,
          name: skill.name,
        })
        const res = await fetch(`/api/skills?${params.toString()}`, { cache: 'no-store' })
        const body = await res.json()
        if (!res.ok) throw new Error(body?.error || 'Failed to load SKILL.md')
        if (!cancelled) setSelectedContent(body as SkillContentResponse)
      } catch (err: unknown) {
        if (!cancelled) setDrawerError((err instanceof Error ? err.message : null) || 'Failed to load SKILL.md')
      } finally {
        if (!cancelled) setDrawerLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [selectedSkill])

  useEffect(() => {
    setDraftContent(selectedContent?.content || '')
  }, [selectedContent?.content])

  useEffect(() => {
    if (!selectedSkill) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedSkill(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedSkill])

  const refresh = async () => {
    setLoading(true)
    try {
      await loadSkills()
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : null) || 'Failed to refresh skills')
    } finally {
      setLoading(false)
    }
  }

  const createSkill = async () => {
    setCreateError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: createSource,
          name: createName.trim(),
          content: createContent,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to create skill')
      setCreateName('')
      await loadSkills()
    } catch (err: unknown) {
      setCreateError((err instanceof Error ? err.message : null) || 'Failed to create skill')
    } finally {
      setSaving(false)
    }
  }

  const saveSkill = async () => {
    if (!selectedSkill) return
    setSaving(true)
    setDrawerError(null)
    try {
      const res = await fetch('/api/skills', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: selectedSkill.source,
          name: selectedSkill.name,
          content: draftContent,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to save skill')
      await loadSkills()
      setSelectedContent((prev) => prev ? { ...prev, content: draftContent } : prev)
    } catch (err: unknown) {
      setDrawerError((err instanceof Error ? err.message : null) || 'Failed to save skill')
    } finally {
      setSaving(false)
    }
  }

  const deleteSkill = async () => {
    if (!selectedSkill) return
    const ok = window.confirm(`Delete skill "${selectedSkill.name}"? This removes it from disk.`)
    if (!ok) return
    setSaving(true)
    setDrawerError(null)
    try {
      const params = new URLSearchParams({ source: selectedSkill.source, name: selectedSkill.name })
      const res = await fetch(`/api/skills?${params.toString()}`, { method: 'DELETE' })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to delete skill')
      setSelectedSkill(null)
      setSelectedContent(null)
      await loadSkills()
    } catch (err: unknown) {
      setDrawerError((err instanceof Error ? err.message : null) || 'Failed to delete skill')
    } finally {
      setSaving(false)
    }
  }

  const searchRegistry = async () => {
    if (!registryQuery.trim()) return
    setRegistryLoading(true)
    setRegistryError(null)
    try {
      const params = new URLSearchParams({ source: registrySource, q: registryQuery.trim() })
      const res = await fetch(`/api/skills/registry?${params.toString()}`, { cache: 'no-store' })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Search failed')
      setRegistryResults(body?.skills || [])
      setRegistrySearched(true)
    } catch (err: unknown) {
      setRegistryError((err instanceof Error ? err.message : null) || 'Search failed')
    } finally {
      setRegistryLoading(false)
    }
  }

  const installSkill = async (slug: string, skillName?: string) => {
    const displayName = skillName || slug.split('/').pop() || slug
    setInstalling(slug)
    setInstallMessage(null)
    setInstallModal({ slug, name: displayName, step: 'fetching' })
    try {
      // Simulate step progression — the API does fetch+scan+write in one call,
      // so we show intermediate steps on a timer for UX feedback
      const stepTimer = setTimeout(() => {
        setInstallModal(prev => prev?.slug === slug ? { ...prev, step: 'scanning' } : prev)
      }, 800)
      const writeTimer = setTimeout(() => {
        setInstallModal(prev => prev?.slug === slug ? { ...prev, step: 'writing' } : prev)
      }, 1600)

      const res = await fetch('/api/skills/registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: registrySource, slug, targetRoot: installTarget }),
      })
      const body = await res.json()
      clearTimeout(stepTimer)
      clearTimeout(writeTimer)

      if (!res.ok) {
        const msg = body?.message || body?.error || 'Install failed'
        setInstallModal({ slug, name: displayName, step: 'error', message: msg, securityStatus: body?.securityReport?.status })
      } else {
        setInstallModal({ slug, name: displayName, step: 'done', message: body?.message || 'Installed successfully', securityStatus: body?.securityReport?.status })
        await loadSkills()
      }
    } catch (err: unknown) {
      setInstallModal({ slug, name: displayName, step: 'error', message: (err instanceof Error ? err.message : null) || 'Network error' })
    } finally {
      setInstalling(null)
    }
  }

  const checkSecurity = async (skill: SkillSummary) => {
    try {
      const params = new URLSearchParams({ mode: 'check', source: skill.source, name: skill.name })
      const res = await fetch(`/api/skills?${params.toString()}`, { cache: 'no-store' })
      const body = await res.json()
      if (res.ok && body?.security) {
        await loadSkills() // refresh to pick up updated security_status
      }
    } catch { /* best-effort */ }
  }

  const scanAllSkills = async () => {
    const skills = skillsList || []
    if (skills.length === 0) return
    const state = {
      running: true,
      total: skills.length,
      done: 0,
      current: null as string | null,
      results: { clean: 0, warning: 0, rejected: 0, error: 0 },
    }
    setScanAll({ ...state })

    for (const skill of skills) {
      state.current = skill.name
      setScanAll({ ...state })
      try {
        const params = new URLSearchParams({ mode: 'check', source: skill.source, name: skill.name })
        const res = await fetch(`/api/skills?${params.toString()}`, { cache: 'no-store' })
        const body = await res.json()
        if (res.ok && body?.security) {
          const s = body.security.status as string
          if (s === 'clean') state.results.clean++
          else if (s === 'warning') state.results.warning++
          else if (s === 'rejected') state.results.rejected++
          else state.results.clean++
        } else {
          state.results.error++
        }
      } catch {
        state.results.error++
      }
      state.done++
      setScanAll({ ...state })
    }

    state.running = false
    state.current = null
    setScanAll({ ...state })
    await loadSkills()
  }

  // DS-aligned security indicator: dot (success/warning/danger) + label. No rainbow.
  const securityBadge = (status?: string | null) => {
    if (!status || status === 'unchecked') {
      return <span style={{ ...MONO, ...SUBTLE }}>unchecked</span>
    }
    const dotClass =
      status === 'clean' ? 'dot dot-success' :
      status === 'warning' ? 'dot dot-warning' :
      status === 'rejected' ? 'dot dot-danger' : 'dot'
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className={dotClass} aria-hidden />
        <span style={{ ...MONO, ...MUTED }}>{status}</span>
      </span>
    )
  }

  return (
    <div className="opzava-ds p-4 md:p-6 max-w-6xl mx-auto space-y-4" style={{ background: 'var(--bg)', color: 'var(--fg)' }}>

      {/* Page header + tabs */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold" style={{ fontSize: 'var(--text-lg)' }}>{t('title')}</h2>
          <p className="page-sub mt-0.5">
            {t('subtitle')} {dashboardMode === 'local' ? t('localMode') : t('gatewayMode')}.
          </p>
        </div>
        <div className="tabs" style={{ border: 0 }}>
          <button
            type="button"
            onClick={() => setActiveTab('installed')}
            className={`tab${activeTab === 'installed' ? ' active' : ''}`}
          >
            {t('tabInstalled')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('registry')}
            className={`tab${activeTab === 'registry' ? ' active' : ''}`}
          >
            {t('tabRegistry')}
          </button>
        </div>
      </div>

      {/* Install message banner */}
      {installMessage && (
        <div className={`banner${
          installMessage.startsWith('Failed') || installMessage.startsWith('Install error')
            ? ' banner-danger'
            : ''
        }`}>
          <span className="flex-1">{installMessage}</span>
        </div>
      )}

      {/* ── INSTALLED TAB ── */}
      {activeTab === 'installed' && (
        <>
          {/* Search */}
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
              style={{ color: 'var(--fg-subtle)' }}
              viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5L14 14" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="input"
              style={{ paddingLeft: 36 }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="btn btn-ghost btn-icon btn-sm absolute right-1 top-1/2 -translate-y-1/2"
                title="Clear"
                style={{ height: 28, width: 28, fontSize: 'var(--text-xs)' }}
              >
                ✕
              </button>
            )}
          </div>
          {query && (
            <p style={{ fontSize: 'var(--text-xs)', ...MUTED }}>
              {t('searchResults', { count: filtered.length, total: skillsTotal, query })}
            </p>
          )}

          {/* Disk sync + create */}
          <div className="card card-body space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p style={{ fontSize: 'var(--text-xs)', ...MUTED }}>{t('diskSyncActive')}</p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={scanAllSkills}
                  disabled={loading || saving || !!scanAll?.running}
                >
                  {scanAll?.running ? t('scanningProgress', { done: scanAll.done, total: scanAll.total }) : t('scanAll')}
                </button>
                <button type="button" className="btn btn-sm" onClick={refresh} disabled={loading || saving}>
                  {t('refreshNow')}
                </button>
              </div>
            </div>

            {/* Scan All progress / results */}
            {scanAll && (
              <div className="space-y-2">
                {scanAll.running && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between" style={{ fontSize: 'var(--text-xs)', ...MUTED }}>
                      <span>
                        {t('scanning')}{' '}
                        <span className="font-semibold" style={{ color: 'var(--fg)' }}>{scanAll.current}</span>
                      </span>
                      <span style={MONO}>{scanAll.done}/{scanAll.total}</span>
                    </div>
                    <div className="progress">
                      <i style={{ width: `${(scanAll.done / scanAll.total) * 100}%` }} />
                    </div>
                  </div>
                )}
                {!scanAll.running && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="badge badge-success">{scanAll.results.clean} clean</span>
                      {scanAll.results.warning > 0 && (
                        <span className="badge badge-warning">{scanAll.results.warning} warning</span>
                      )}
                      {scanAll.results.rejected > 0 && (
                        <span className="badge badge-danger">{scanAll.results.rejected} rejected</span>
                      )}
                      {scanAll.results.error > 0 && (
                        <span className="badge badge-danger">{scanAll.results.error} errors</span>
                      )}
                      <span style={{ fontSize: 'var(--text-xs)', ...SUBTLE }}>
                        — {t('skillsScanned', { count: scanAll.total })}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setScanAll(null)}
                      className="btn btn-ghost btn-sm"
                    >
                      {t('dismiss')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Create skill form */}
            <div className="grid grid-cols-1 md:grid-cols-[240px_1fr_auto] gap-2">
              <select
                value={createSource}
                onChange={(e) => setCreateSource(e.target.value)}
                className="select"
                style={{ height: 36, fontSize: 'var(--text-xs)' }}
              >
                <option value="user-agents">{SOURCE_LABELS['user-agents']}</option>
                <option value="user-codex">{SOURCE_LABELS['user-codex']}</option>
                <option value="project-agents">{SOURCE_LABELS['project-agents']}</option>
                <option value="project-codex">{SOURCE_LABELS['project-codex']}</option>
                {dashboardMode === 'full' && (
                  <option value="openclaw">{SOURCE_LABELS['openclaw']}</option>
                )}
                <option value="workspace">{SOURCE_LABELS['workspace']}</option>
              </select>
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="new-skill-name"
                className="input"
                style={{ height: 36 }}
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={createSkill}
                disabled={saving || !createName.trim()}
              >
                {t('addSkill')}
              </button>
            </div>
            <textarea
              value={createContent}
              onChange={(e) => setCreateContent(e.target.value)}
              className="textarea"
              style={{ minHeight: 96, ...MONO }}
              placeholder={t('initialContent')}
            />
            {createError && (
              <div className="banner banner-danger" style={{ fontSize: 'var(--text-xs)' }}>
                {createError}
              </div>
            )}
          </div>

          {/* Skill list */}
          {loading ? (
            <div className="empty">
              <div className="empty-icon" aria-hidden>◌</div>
              <div className="empty-title">{t('loadingSkills')}</div>
            </div>
          ) : error ? (
            <div className="banner banner-danger">{error}</div>
          ) : (
            <>
              {/* Source group cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {activeRoot && (
                  <button
                    type="button"
                    onClick={() => setActiveRoot(null)}
                    className="btn btn-ghost btn-sm col-span-full justify-start"
                    style={{ fontSize: 'var(--text-xs)' }}
                  >
                    ← {t('showAllRoots')}
                  </button>
                )}
                {(skillGroups || [])
                  .filter(g => g.skills.length > 0 || ['user-agents', 'user-codex', 'openclaw', 'workspace'].includes(g.source) || g.source.startsWith('workspace-'))
                  .map((group) => {
                    const { glyph, srLabel } = sourceGlyph(group.source)
                    const isActive = activeRoot === group.source
                    return (
                      <button
                        key={group.source}
                        type="button"
                        onClick={() => setActiveRoot(isActive ? null : group.source)}
                        className="card card-body text-left"
                        style={{
                          border: isActive ? '1px solid var(--accent)' : undefined,
                          boxShadow: isActive ? '0 0 0 2px var(--accent-soft)' : undefined,
                        }}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span
                            aria-hidden
                            style={{
                              fontSize: 'var(--text-base)',
                              color: glyph === '✦' ? 'var(--accent)' : 'var(--fg-subtle)',
                            }}
                          >
                            {glyph}
                          </span>
                          <span className="sr-only">{srLabel}</span>
                          <span style={{ fontSize: 'var(--text-xs)', ...MUTED }}>{getSourceLabel(group.source)}</span>
                        </div>
                        <div className="font-semibold" style={{ fontSize: 'var(--text-xl)' }}>{group.skills.length}</div>
                        <div className="mt-1 truncate" style={{ ...MONO, ...SUBTLE }}>{group.path}</div>
                      </button>
                    )
                  })}
              </div>

              {/* Skill table */}
              <div className="card">
                <div className="card-header">
                  <span className="card-title" style={{ fontSize: 'var(--text-sm)' }}>
                    {t('skillCount', { count: filtered.length, total: skillsTotal })}
                  </span>
                </div>
                {filtered.length === 0 ? (
                  <div className="empty">
                    <div className="empty-icon" aria-hidden>✦</div>
                    <div className="empty-title">{t('noMatch')}</div>
                  </div>
                ) : (
                  <table className="table table-compact">
                    <caption className="sr-only">
                      Installed skills — name, source location, security status, and actions.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">{t('tabInstalled')}</th>
                        <th scope="col">Source</th>
                        <th scope="col">Security</th>
                        <th scope="col" style={{ width: 120 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((skill) => (
                        <tr key={skill.id}>
                          <td>
                            <div className="flex items-center gap-2">
                              <span className="font-medium" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--fg)' }}>
                                {skill.name}
                              </span>
                              {skill.registry_slug && (
                                <span className="badge badge-accent">registry</span>
                              )}
                            </div>
                            {skill.description && (
                              <p className="mt-0.5 truncate" style={{ fontSize: 'var(--text-xs)', ...MUTED }}>{skill.description}</p>
                            )}
                            <p className="mt-0.5 break-all" style={{ ...MONO, ...SUBTLE }}>{skill.path}</p>
                          </td>
                          <td>
                            <span className="badge">{getSourceLabel(skill.source)}</span>
                          </td>
                          <td>
                            {securityBadge(skill.security_status)}
                          </td>
                          <td>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => checkSecurity(skill)}
                              >
                                {t('scan')}
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => setSelectedSkill(skill)}
                              >
                                {t('view')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ── REGISTRY TAB ── */}
      {activeTab === 'registry' && (
        <>
          <div className="card card-body space-y-3">
            <div className="flex items-center gap-2">
              <select
                value={registrySource}
                onChange={(e) => {
                  setRegistrySource(e.target.value as 'clawhub' | 'skills-sh' | 'awesome-openclaw')
                  setRegistryResults([])
                  setRegistrySearched(false)
                }}
                className="select"
                style={{ width: 'auto', minWidth: 160, height: 36, fontSize: 'var(--text-xs)' }}
              >
                <option value="clawhub">ClawdHub</option>
                <option value="skills-sh">skills.sh</option>
                <option value="awesome-openclaw">Awesome OpenClaw</option>
              </select>
              <input
                value={registryQuery}
                onChange={(e) => setRegistryQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchRegistry()}
                placeholder={t('registrySearchPlaceholder')}
                className="input"
                style={{ flex: 1, height: 36 }}
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={searchRegistry}
                disabled={registryLoading || !registryQuery.trim()}
              >
                {registryLoading ? t('searching') : t('search')}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 'var(--text-xs)', ...MUTED }}>{t('installTo')}</span>
              <select
                value={installTarget}
                onChange={(e) => setInstallTarget(e.target.value)}
                className="select"
                style={{ width: 'auto', height: 30, fontSize: 'var(--text-xs)' }}
              >
                <option value="user-agents">{SOURCE_LABELS['user-agents']}</option>
                <option value="user-codex">{SOURCE_LABELS['user-codex']}</option>
                <option value="project-agents">{SOURCE_LABELS['project-agents']}</option>
                <option value="project-codex">{SOURCE_LABELS['project-codex']}</option>
                {dashboardMode === 'full' && (
                  <option value="openclaw">{SOURCE_LABELS['openclaw']}</option>
                )}
                <option value="workspace">{SOURCE_LABELS['workspace']}</option>
              </select>
            </div>
          </div>

          {registryError && (
            <div className="banner banner-danger">{registryError}</div>
          )}

          {registryResults.length > 0 ? (
            <div className="card">
              <div className="card-header">
                <span className="card-title" style={{ fontSize: 'var(--text-sm)' }}>
                  {registryResults.length} results
                </span>
                <span className="badge">
                  {{ clawhub: 'ClawdHub', 'skills-sh': 'skills.sh', 'awesome-openclaw': 'Awesome OpenClaw' }[registrySource]}
                </span>
              </div>
              <table className="table table-compact">
                <caption className="sr-only">Registry search results — skill name, author, version, and install action.</caption>
                <thead>
                  <tr>
                    <th scope="col">Skill</th>
                    <th scope="col">Tags</th>
                    <th scope="col" style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {registryResults.map((skill) => (
                    <tr key={skill.slug}>
                      <td>
                        <div className="font-medium" style={{ color: 'var(--fg)', fontSize: 'var(--text-sm)' }}>{skill.name}</div>
                        <div style={{ ...MONO, ...SUBTLE }}>
                          by {skill.author} · v{skill.version}
                          {skill.installCount != null && ` · ${skill.installCount} installs`}
                        </div>
                        {skill.description && (
                          <p className="mt-0.5" style={{ fontSize: 'var(--text-xs)', ...MUTED }}>{skill.description}</p>
                        )}
                      </td>
                      <td>
                        {skill.tags && skill.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {skill.tags.slice(0, 5).map((tag) => (
                              <span key={tag} className="badge">{tag}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => installSkill(skill.slug, skill.name)}
                          disabled={installing === skill.slug}
                        >
                          {installing === skill.slug ? t('installing') : t('install')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : registryLoading ? (
            <div className="empty">
              <div className="empty-icon" aria-hidden>◌</div>
              <div className="empty-title">{t('searching')}</div>
            </div>
          ) : registrySearched ? (
            <div className="empty">
              <div className="empty-icon" aria-hidden>✦</div>
              <div className="empty-title">{t('noRegistryResults', { query: registryQuery, registry: { clawhub: 'ClawdHub', 'skills-sh': 'skills.sh', 'awesome-openclaw': 'Awesome OpenClaw' }[registrySource] })}</div>
            </div>
          ) : (
            <div className="empty">
              <div className="empty-icon" aria-hidden>⊞</div>
              <div className="empty-title">{t('registryPrompt')}</div>
            </div>
          )}
        </>
      )}

      {/* ── INSTALL MODAL (portal) ── */}
      {isMounted && installModal && createPortal(
        <div
          className="opzava-ds scrim"
          style={{ alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)' }}
        >
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="card-header">
              <h3 className="card-title">
                {installModal.step === 'done' ? t('skillInstalled') :
                  installModal.step === 'error' ? t('installFailed') : t('installingSkill')}
              </h3>
              <p className="truncate" style={{ fontSize: 'var(--text-xs)', ...MUTED }}>{installModal.name}</p>
            </div>

            <div className="card-body space-y-3">
              {/* Progress steps */}
              <div className="space-y-2">
                <InstallStep
                  label={t('stepFetching')}
                  status={
                    installModal.step === 'fetching' ? 'active' :
                    (installModal.step === 'error' && !installModal.securityStatus) ? 'error' : 'done'
                  }
                />
                <InstallStep
                  label={t('stepScanning')}
                  status={
                    installModal.step === 'fetching' ? 'pending' :
                    installModal.step === 'scanning' ? 'active' :
                    (installModal.step === 'error' && installModal.securityStatus === 'rejected') ? 'error' :
                    (installModal.step === 'error' && !installModal.securityStatus) ? 'error' :
                    'done'
                  }
                />
                <InstallStep
                  label={t('stepWriting')}
                  status={
                    ['fetching', 'scanning'].includes(installModal.step) ? 'pending' :
                    installModal.step === 'writing' ? 'active' :
                    installModal.step === 'error' ? 'error' : 'done'
                  }
                />
              </div>

              {/* Result message */}
              {installModal.message && (installModal.step === 'done' || installModal.step === 'error') && (
                <div className={`banner${installModal.step === 'error' ? ' banner-danger' : ''}`}>
                  {installModal.message}
                </div>
              )}

              {/* Security status */}
              {installModal.securityStatus && installModal.step === 'done' && (
                <div className="flex items-center gap-2" style={{ fontSize: 'var(--text-xs)' }}>
                  <span style={MUTED}>{t('security')}</span>
                  {securityBadge(installModal.securityStatus)}
                </div>
              )}
            </div>

            {/* Modal footer */}
            {(installModal.step === 'done' || installModal.step === 'error') && (
              <div className="card-footer flex items-center justify-end gap-2">
                {installModal.step === 'done' && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => { setInstallModal(null); setActiveTab('installed') }}
                  >
                    {t('viewInstalled')}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setInstallModal(null)}
                >
                  {installModal.step === 'done' ? t('done') : t('close')}
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ── DETAIL DRAWER (portal) ── */}
      {isMounted && selectedSkill && createPortal(
        <div
          className="opzava-ds scrim"
          style={{ alignItems: 'stretch' }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedSkill(null) }}
        >
          <aside className="drawer" style={{ width: 'min(52rem, 100vw)' }}>
            {/* Drawer header */}
            <div className="card-header" style={{ flexShrink: 0 }}>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold truncate" style={{ fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
                  {selectedSkill.name}
                </h3>
                <p className="truncate" style={{ ...MONO, ...SUBTLE }}>
                  {selectedSkill.source} · {selectedSkill.path}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button type="button" className="btn btn-danger btn-sm" onClick={deleteSkill} disabled={saving || drawerLoading}>
                  {t('delete')}
                </button>
                <button type="button" className="btn btn-sm" onClick={saveSkill} disabled={saving || drawerLoading}>
                  {t('save')}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedSkill(null)}>
                  {t('close')}
                </button>
              </div>
            </div>

            {/* Drawer content */}
            <div className="flex-1 overflow-y-auto">
              {drawerLoading ? (
                <div className="empty">
                  <div className="empty-icon" aria-hidden>◌</div>
                  <div className="empty-title">{t('loadingSkillContent')}</div>
                </div>
              ) : drawerError ? (
                <div className="banner banner-danger" style={{ margin: 'var(--space-4)' }}>
                  {drawerError}
                </div>
              ) : selectedContent ? (
                <>
                  {selectedContent.security && selectedContent.security.issues.length > 0 && (
                    <div
                      className={`banner${
                        selectedContent.security.status === 'rejected' ? ' banner-danger' :
                        selectedContent.security.status === 'warning' ? ' banner-warning' : ''
                      }`}
                      style={{ margin: 'var(--space-4)', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--space-2)' }}
                    >
                      <div className="font-semibold" style={{ fontSize: 'var(--text-xs)' }}>
                        {t('security')}: {selectedContent.security.status}
                      </div>
                      {selectedContent.security.issues.map((issue, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <span style={{ ...MONO, fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                            [{issue.severity}]
                          </span>
                          <span style={{ fontSize: 'var(--text-xs)' }}>
                            {issue.description}{issue.line ? ` (line ${issue.line})` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <textarea
                    value={draftContent}
                    onChange={(e) => setDraftContent(e.target.value)}
                    className="textarea"
                    style={{
                      width: '100%',
                      minHeight: '70vh',
                      background: 'var(--surface)',
                      borderRadius: 0,
                      border: 0,
                      resize: 'none',
                      ...MONO,
                      lineHeight: 1.55,
                      color: 'var(--fg-muted)',
                    }}
                  />
                </>
              ) : (
                <div className="empty">
                  <div className="empty-title">{t('noContent')}</div>
                </div>
              )}
            </div>
          </aside>
        </div>,
        document.body
      )}
    </div>
  )
}

function InstallStep({ label, status }: { label: string; status: 'pending' | 'active' | 'done' | 'error' }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
        {status === 'pending' && (
          <span className="dot" style={{ width: 8, height: 8 }} aria-hidden />
        )}
        {status === 'active' && (
          <span className="dot dot-accent live" style={{ width: 8, height: 8 }} aria-hidden />
        )}
        {status === 'done' && (
          <svg className="w-4 h-4" style={{ color: 'var(--success)' }} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3.5 8.5L6.5 11.5L12.5 4.5" />
          </svg>
        )}
        {status === 'error' && (
          <svg className="w-4 h-4" style={{ color: 'var(--danger)' }} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5" />
          </svg>
        )}
      </div>
      <span style={{
        fontSize: 'var(--text-xs)',
        color:
          status === 'active' ? 'var(--fg)' :
          status === 'done' ? 'var(--fg-muted)' :
          status === 'error' ? 'var(--danger)' :
          'var(--fg-subtle)',
        fontWeight: status === 'active' ? 600 : undefined,
      }}>
        {label}
      </span>
    </div>
  )
}
