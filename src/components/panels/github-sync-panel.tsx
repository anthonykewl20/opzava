'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Loader } from '@/components/ui/loader'
import { apiFetch, ApiError } from '@/lib/api-client'

/** Pull a server-provided `error` string out of an ApiError's parsed payload, if present. */
function apiErrorMessage(err: unknown): string | undefined {
  if (
    err instanceof ApiError &&
    typeof err.payload === 'object' &&
    err.payload !== null &&
    'error' in err.payload &&
    typeof (err.payload as { error: unknown }).error === 'string'
  ) {
    return (err.payload as { error: string }).error
  }
  return undefined
}

interface GitHubLabel {
  name: string
  color?: string
}

interface GitHubIssue {
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  labels: GitHubLabel[]
  assignee: { login: string } | null
  html_url: string
  created_at: string
  updated_at: string
}

interface SyncRecord {
  id: number
  repo: string
  last_synced_at: number
  issue_count: number
  sync_direction: string
  status: string
  error: string | null
  created_at: number
}

interface LinkedTask {
  id: number
  title: string
  status: string
  priority: string
  metadata: {
    github_repo?: string
    github_issue_number?: number
    github_issue_url?: string
    github_synced_at?: string
    github_state?: string
  }
}

type TabFilter = 'all' | 'needs-triage' | 'ready-for-agent' | 'ready-for-human' | 'in-progress' | 'closed'

const MONO: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  color: 'var(--fg-subtle)',
}

/** Inline spinner — reuses Tailwind animate-spin, styled with CSS vars. */
function SmallSpinner() {
  return (
    <span
      aria-hidden
      className="animate-spin inline-block flex-none"
      style={{
        width: 12,
        height: 12,
        border: '2px solid currentColor',
        borderTopColor: 'transparent',
        borderRadius: '50%',
      }}
    />
  )
}

export function GitHubSyncPanel() {
  const t = useTranslations('githubSync')
  // Connection status
  const [tokenStatus, setTokenStatus] = useState<{ connected: boolean; user?: string } | null>(null)

  // Import form
  const [repo, setRepo] = useState('')
  const [labelFilter, setLabelFilter] = useState('')
  const [stateFilter, setStateFilter] = useState<'open' | 'closed' | 'all'>('open')
  const [assignAgent, setAssignAgent] = useState('')
  const [agents, setAgents] = useState<{ name: string }[]>([])

  // Preview
  const [previewIssues, setPreviewIssues] = useState<GitHubIssue[]>([])
  const [previewing, setPreviewing] = useState(false)

  // Sync
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ imported: number; skipped: number; errors: number } | null>(null)

  // Sync history
  const [syncHistory, setSyncHistory] = useState<SyncRecord[]>([])

  // Linked tasks
  const [linkedTasks, setLinkedTasks] = useState<LinkedTask[]>([])

  // Two-way sync
  const [projects, setProjects] = useState<Array<{
    id: number; name: string; github_repo?: string;
    github_sync_enabled?: boolean; github_labels_initialized?: boolean
  }>>([])
  const [syncingProjectId, setSyncingProjectId] = useState<number | null>(null)

  // Feedback
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [loading, setLoading] = useState(true)

  // Tab filter — UI-only, never triggers an API call
  const [tabFilter, setTabFilter] = useState<TabFilter>('all')

  const showFeedback = (ok: boolean, text: string) => {
    setFeedback({ ok, text })
    setTimeout(() => setFeedback(null), 4000)
  }

  // Check GitHub token status
  const checkToken = useCallback(async () => {
    try {
      const data = await apiFetch<{ ok?: boolean; detail?: string }>('/api/integrations', {
        method: 'POST',
        body: JSON.stringify({ action: 'test', integrationId: 'github' }),
        signal: AbortSignal.timeout(8000),
        redirectOnUnauthenticated: false,
      })
      setTokenStatus({
        connected: data.ok === true,
        user: data.detail?.replace('User: ', ''),
      })
    } catch {
      setTokenStatus({ connected: false })
    }
  }, [])

  // Fetch sync history
  const fetchSyncHistory = useCallback(async () => {
    try {
      const data = await apiFetch<{ syncs?: SyncRecord[] }>('/api/github', {
        method: 'POST',
        body: JSON.stringify({ action: 'status' }),
        signal: AbortSignal.timeout(8000),
        redirectOnUnauthenticated: false,
      })
      setSyncHistory(data.syncs || [])
    } catch { /* ignore */ }
  }, [])

  // Fetch linked tasks
  const fetchLinkedTasks = useCallback(async () => {
    try {
      const data = await apiFetch<{ tasks?: LinkedTask[] }>('/api/tasks?limit=200', {
        signal: AbortSignal.timeout(8000),
        redirectOnUnauthenticated: false,
      })
      const linked = (data.tasks || []).filter(
        (task: LinkedTask) => task.metadata?.github_repo
      )
      setLinkedTasks(linked)
    } catch { /* ignore */ }
  }, [])

  // Fetch projects for two-way sync
  const fetchProjects = useCallback(async () => {
    try {
      const data = await apiFetch<{ projects?: typeof projects }>('/api/projects', {
        signal: AbortSignal.timeout(8000),
        redirectOnUnauthenticated: false,
      })
      setProjects(data.projects || [])
    } catch { /* ignore */ }
  }, [])

  // Fetch agents for assign dropdown
  const fetchAgents = useCallback(async () => {
    try {
      const data = await apiFetch<{ agents?: { name: string }[] }>('/api/agents', {
        signal: AbortSignal.timeout(8000),
        redirectOnUnauthenticated: false,
      })
      setAgents((data.agents || []).map((a: any) => ({ name: a.name })))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    Promise.allSettled([checkToken(), fetchSyncHistory(), fetchLinkedTasks(), fetchAgents(), fetchProjects()])
      .finally(() => setLoading(false))
  }, [checkToken, fetchSyncHistory, fetchLinkedTasks, fetchAgents, fetchProjects])

  // Preview issues from GitHub
  const handlePreview = async () => {
    if (!repo) {
      showFeedback(false, t('enterRepo'))
      return
    }
    setPreviewing(true)
    setPreviewIssues([])
    setSyncResult(null)
    try {
      const params = new URLSearchParams({ action: 'issues', repo, state: stateFilter })
      if (labelFilter) params.set('labels', labelFilter)
      const data = await apiFetch<{ issues?: GitHubIssue[] }>(`/api/github?${params}`)
      setPreviewIssues(data.issues || [])
      if (data.issues?.length === 0) showFeedback(true, t('noIssuesFound'))
    } catch (err) {
      // Preserve the original two-tier failure handling: HTTP errors surfaced the
      // server-provided message (or a generic fetch-issues failure), while genuine
      // network failures showed the network error string.
      if (err instanceof ApiError && err.code !== 'NETWORK_ERROR') {
        showFeedback(false, apiErrorMessage(err) || t('failedFetchIssues'))
      } else {
        showFeedback(false, t('networkError'))
      }
    } finally {
      setPreviewing(false)
    }
  }

  // Import issues as tasks
  const handleImport = async () => {
    if (!repo) return
    setSyncing(true)
    setSyncResult(null)
    try {
      const data = await apiFetch<{ imported: number; skipped: number; errors: number }>('/api/github', {
        method: 'POST',
        body: JSON.stringify({
          action: 'sync',
          repo,
          labels: labelFilter || undefined,
          state: stateFilter,
          assignAgent: assignAgent || undefined,
        }),
      })
      setSyncResult({ imported: data.imported, skipped: data.skipped, errors: data.errors })
      showFeedback(true, t('importedFeedback', { imported: data.imported, skipped: data.skipped }))
      setPreviewIssues([])
      fetchSyncHistory()
      fetchLinkedTasks()
    } catch (err) {
      if (err instanceof ApiError && err.code !== 'NETWORK_ERROR') {
        showFeedback(false, apiErrorMessage(err) || t('syncFailed'))
      } else {
        showFeedback(false, t('networkError'))
      }
    } finally {
      setSyncing(false)
    }
  }

  // Two-way sync handlers
  const handleToggleSync = async (project: typeof projects[number]) => {
    try {
      await apiFetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ github_sync_enabled: !project.github_sync_enabled }),
      })
      await fetchProjects()
      showFeedback(true, `Sync ${project.github_sync_enabled ? 'disabled' : 'enabled'} for ${project.name}`)
    } catch (err) {
      if (err instanceof ApiError && err.code !== 'NETWORK_ERROR') {
        showFeedback(false, apiErrorMessage(err) || t('failedToggleSync'))
      } else {
        showFeedback(false, t('networkError'))
      }
    }
  }

  const handleSyncProject = async (projectId: number) => {
    setSyncingProjectId(projectId)
    try {
      const data = await apiFetch<{ message?: string }>('/api/github/sync', {
        method: 'POST',
        body: JSON.stringify({ action: 'trigger', project_id: projectId }),
      })
      showFeedback(true, data.message || 'Sync triggered')
      fetchSyncHistory()
    } catch (err) {
      if (err instanceof ApiError && err.code !== 'NETWORK_ERROR') {
        showFeedback(false, apiErrorMessage(err) || t('syncFailed'))
      } else {
        showFeedback(false, t('networkError'))
      }
    } finally {
      setSyncingProjectId(null)
    }
  }

  const handleSyncAll = async () => {
    setSyncingProjectId(-1)
    try {
      const data = await apiFetch<{ message?: string }>('/api/github/sync', {
        method: 'POST',
        body: JSON.stringify({ action: 'trigger-all' }),
      })
      showFeedback(true, data.message || 'Sync triggered for all projects')
      fetchSyncHistory()
    } catch (err) {
      if (err instanceof ApiError && err.code !== 'NETWORK_ERROR') {
        showFeedback(false, apiErrorMessage(err) || t('syncFailed'))
      } else {
        showFeedback(false, t('networkError'))
      }
    } finally {
      setSyncingProjectId(null)
    }
  }

  // ── Derived display data ──────────────────────────────────────────────────
  const hasPreview = previewIssues.length > 0
  const agentNameSet = new Set(agents.map(a => a.name))

  // Triage pipeline counts.
  // When previewIssues are loaded (after a fetch), count by GitHub label name (accurate).
  // Fallback to linkedTask.status for a rough approximation when no preview is active.
  const triageCounts = {
    needsTriage: hasPreview
      ? previewIssues.filter(i => i.labels.some(l => l.name === 'needs-triage')).length
      : linkedTasks.filter(task => task.status === 'pending' || task.status === 'backlog').length,
    readyForAgent: hasPreview
      ? previewIssues.filter(i => i.labels.some(l => l.name === 'ready-for-agent')).length
      : linkedTasks.filter(task => task.status === 'ready').length,
    readyForHuman: hasPreview
      ? previewIssues.filter(i => i.labels.some(l => l.name === 'ready-for-human')).length
      : 0,
    inProgress: hasPreview
      ? previewIssues.filter(i => i.labels.some(l => l.name === 'in-progress')).length
      : linkedTasks.filter(task => task.status === 'in_progress').length,
    closed: hasPreview
      ? previewIssues.filter(i => i.state === 'closed').length
      : linkedTasks.filter(task => task.metadata.github_state === 'closed').length,
  }

  // Issues table source: previewIssues (richer GitHub data) > linkedTasks (fallback)
  const filteredPreview = previewIssues.filter(issue => {
    if (tabFilter === 'all') return true
    if (tabFilter === 'closed') return issue.state === 'closed'
    if (tabFilter === 'in-progress') return issue.labels.some(l => l.name === 'in-progress')
    return issue.labels.some(l => l.name === tabFilter)
  })

  const filteredLinked = linkedTasks.filter(task => {
    if (tabFilter === 'all') return true
    if (tabFilter === 'closed') return task.metadata.github_state === 'closed' || task.status === 'completed'
    if (tabFilter === 'in-progress') return task.status === 'in_progress'
    return false // triage-label tabs can't be filtered from LinkedTask — no label field
  })

  // Last successful sync timestamp for footer hint
  const lastSync = syncHistory.length > 0
    ? new Date(syncHistory[0].created_at * 1000).toLocaleString()
    : null

  const linkedProjects = projects.filter(p => p.github_repo)

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        className="opzava-ds flex items-center justify-center"
        style={{ background: 'var(--bg)', color: 'var(--fg)', minHeight: 200 }}
      >
        <Loader variant="inline" label={t('loading')} />
      </div>
    )
  }

  // ── Rendered panel ────────────────────────────────────────────────────────
  return (
    <div className="opzava-ds p-6 space-y-5" style={{ background: 'var(--bg)', color: 'var(--fg)' }}>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title font-semibold">{t('title')}</h1>
          <p className="page-sub">
            {t('subtitle')}
            {tokenStatus?.connected && (
              <span style={{ marginLeft: 'var(--space-2)', color: 'var(--fg-subtle)' }}>
                · {t('connectedAs', { user: tokenStatus.user || 'connected' })}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handlePreview}
            disabled={previewing || !repo}
            className="btn"
          >
            {previewing ? <SmallSpinner /> : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            )}
            {t('buttonPreview')}
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={syncing || !repo}
            className="btn btn-primary"
          >
            {syncing ? <SmallSpinner /> : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 12v2h10v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            )}
            {t('buttonImport')}
          </button>
        </div>
      </div>

      {/* ── Not-configured warning ────────────────────────────────────────── */}
      {tokenStatus && !tokenStatus.connected && (
        <div className="banner banner-warning" role="alert">
          <span aria-hidden style={{ fontWeight: 600, color: 'var(--warning)', flexShrink: 0 }}>!</span>
          <div>
            <div className="font-medium" style={{ fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
              {t('tokenNotConfigured')}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', marginTop: 2 }}>
              {t.rich('tokenNotConfiguredDesc', {
                code: (chunks) => (
                  <code style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs)',
                    background: 'var(--surface-3)',
                    padding: '1px 4px',
                    borderRadius: 'var(--radius-sm)',
                  }}>
                    {chunks}
                  </code>
                ),
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Feedback banner ───────────────────────────────────────────────── */}
      {feedback && (
        <div className={`banner${feedback.ok ? '' : ' banner-danger'}`} role="alert">
          <span aria-hidden style={{ color: feedback.ok ? 'var(--success)' : 'var(--danger)', fontWeight: 600, flexShrink: 0 }}>
            {feedback.ok ? '✓' : '!'}
          </span>
          <span style={{ flex: 1, fontSize: 'var(--text-sm)' }}>{feedback.text}</span>
        </div>
      )}

      {/* ── Sync result banner ────────────────────────────────────────────── */}
      {syncResult && (
        <div className="banner banner-info" role="status">
          <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--fg-muted)' }}>
            {t('syncResultImported', { count: syncResult.imported })}
            {' · '}
            {t('syncResultSkipped', { count: syncResult.skipped })}
            {syncResult.errors > 0 && (
              <span style={{ color: 'var(--danger)', marginLeft: 'var(--space-3)' }}>
                {t('syncResultErrors', { count: syncResult.errors })}
              </span>
            )}
          </span>
        </div>
      )}

      {/* ── Triage pipeline ───────────────────────────────────────────────── */}
      <section aria-labelledby="gh-pipeline-lbl">
        <div className="section-label" id="gh-pipeline-lbl" style={{ paddingLeft: 0 }}>
          Triage pipeline
        </div>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 'var(--space-2)', overflowX: 'auto' }}>

          <div className="stat" style={{ flex: '1 1 0', minWidth: 140, borderLeft: '3px solid var(--accent)' }}>
            <div className="stat-label">Needs triage</div>
            <div className="stat-value">{triageCounts.needsTriage}</div>
            <div className="stat-delta" style={{ color: 'var(--fg-subtle)' }}>no label yet</div>
          </div>

          <span aria-hidden style={{ flex: 'none', alignSelf: 'center', color: 'var(--fg-subtle)', fontSize: 'var(--text-base)' }}>→</span>

          <div className="stat" style={{ flex: '1 1 0', minWidth: 140 }}>
            <div className="stat-label">Ready for agent</div>
            <div className="stat-value">{triageCounts.readyForAgent}</div>
            <div className="stat-delta" style={{ color: 'var(--fg-subtle)' }}>fleet can pick up</div>
          </div>

          <span aria-hidden style={{ flex: 'none', alignSelf: 'center', color: 'var(--fg-subtle)', fontSize: 'var(--text-base)' }}>→</span>

          <div className="stat" style={{ flex: '1 1 0', minWidth: 140, borderLeft: '3px solid var(--accent)' }}>
            <div className="stat-label">Ready for human</div>
            <div className="stat-value">{triageCounts.readyForHuman}</div>
            <div className="stat-delta" style={{ color: 'var(--fg-subtle)' }}>you must act</div>
          </div>

          <span aria-hidden style={{ flex: 'none', alignSelf: 'center', color: 'var(--fg-subtle)', fontSize: 'var(--text-base)' }}>→</span>

          <div className="stat" style={{ flex: '1 1 0', minWidth: 140 }}>
            <div className="stat-label">In progress</div>
            <div className="stat-value">{triageCounts.inProgress}</div>
            <div className="stat-delta" style={{ color: 'var(--fg-subtle)' }}>being worked</div>
          </div>

          <span aria-hidden style={{ flex: 'none', alignSelf: 'center', color: 'var(--fg-subtle)', fontSize: 'var(--text-base)' }}>→</span>

          <div className="stat" style={{ flex: '1 1 0', minWidth: 140 }}>
            <div className="stat-label">Closed</div>
            <div className="stat-value">{triageCounts.closed}</div>
            <div className="stat-delta" style={{ color: 'var(--fg-subtle)' }}>done / closed</div>
          </div>

        </div>
      </section>

      {/* ── Issues table (previewIssues › linkedTasks fallback) ───────────── */}
      <section aria-label="Synced GitHub issues">
        <div className="card">

          {/* Filter tabs */}
          <div className="tabs" role="tablist" aria-label="Filter issues">
            {(['all', 'needs-triage', 'ready-for-agent', 'ready-for-human', 'in-progress', 'closed'] as TabFilter[]).map(tab => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={tabFilter === tab}
                onClick={() => setTabFilter(tab)}
                className={`tab${tabFilter === tab ? ' active' : ''}`}
              >
                {tab === 'all' ? 'All' : tab}
              </button>
            ))}
          </div>

          {/* Table body — previewIssues when available, else linkedTasks */}
          {hasPreview ? (
            filteredPreview.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="table table-compact">
                  <caption className="sr-only">
                    {t('previewTitle', { count: previewIssues.length })}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">{t('colTitle')}</th>
                      <th scope="col">Assignee</th>
                      <th scope="col">Updated</th>
                      <th scope="col">{t('colState')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPreview.map(issue => {
                      const isAgent = issue.assignee ? agentNameSet.has(issue.assignee.login) : false
                      return (
                        <tr key={issue.number}>
                          <td style={{ width: 56 }}>
                            <span style={{ ...MONO, color: 'var(--fg-muted)' }}>#{issue.number}</span>
                          </td>
                          <td>
                            <a
                              href={issue.html_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium"
                              style={{
                                color: 'var(--fg)',
                                fontSize: 'var(--text-sm)',
                                lineHeight: 'var(--lh-snug)',
                                textDecoration: 'none',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                              onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg)')}
                            >
                              {issue.title}
                            </a>
                            {issue.labels.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {issue.labels.map(l => (
                                  <span key={l.name} className="badge">{l.name}</span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td>
                            {issue.assignee ? (
                              <span className="flex items-center gap-1.5">
                                {isAgent ? (
                                  <>
                                    <span className="sr-only">AI agent: </span>
                                    <span aria-hidden style={{ color: 'var(--accent)', fontSize: 'var(--text-base)', lineHeight: 1 }}>✦</span>
                                  </>
                                ) : (
                                  <span
                                    aria-hidden
                                    style={{
                                      width: 22,
                                      height: 22,
                                      borderRadius: 'var(--radius-full)',
                                      background: 'var(--surface-3)',
                                      border: '1px solid var(--border-strong)',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: 10,
                                      color: 'var(--fg-muted)',
                                      fontWeight: 600,
                                      flexShrink: 0,
                                    }}
                                  >
                                    {issue.assignee.login.slice(0, 2).toUpperCase()}
                                  </span>
                                )}
                                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                                  {issue.assignee.login}
                                </span>
                              </span>
                            ) : (
                              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>Unassigned</span>
                            )}
                          </td>
                          <td style={MONO}>
                            {new Date(issue.updated_at).toLocaleDateString()}
                          </td>
                          <td>
                            <span className="flex items-center gap-1.5">
                              <span className={`dot ${issue.state === 'open' ? 'dot-accent' : ''}`} aria-hidden />
                              <span style={{ fontSize: 'var(--text-xs)', color: issue.state === 'closed' ? 'var(--fg-muted)' : 'var(--fg)' }}>
                                {issue.state}
                              </span>
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">
                <div className="empty-icon" aria-hidden>○</div>
                <div className="empty-title">No issues match this filter</div>
              </div>
            )
          ) : linkedTasks.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="table table-compact">
                <caption className="sr-only">
                  {t('linkedTasksWithCount', { count: linkedTasks.length })}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">{t('colTask')}</th>
                    <th scope="col">{t('colStatus')}</th>
                    <th scope="col">{t('colSynced')}</th>
                    <th scope="col">{t('colState')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(tabFilter === 'all' ? linkedTasks : filteredLinked).map(task => {
                    const ghState = task.metadata.github_state
                    const isClosed = ghState === 'closed' || task.status === 'completed'
                    const isInProgress = task.status === 'in_progress'
                    const stateDot = isClosed ? '' : isInProgress ? 'dot-warning' : 'dot-accent'
                    const stateLabel = isClosed ? t('stateClosed') : isInProgress ? 'In progress' : t('stateOpen')
                    return (
                      <tr key={task.id}>
                        <td style={{ width: 56 }}>
                          {task.metadata.github_issue_number ? (
                            <span style={{ ...MONO, color: 'var(--fg-muted)' }}>
                              #{task.metadata.github_issue_number}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--fg-subtle)' }}>—</span>
                          )}
                        </td>
                        <td>
                          {task.metadata.github_issue_url ? (
                            <a
                              href={task.metadata.github_issue_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium"
                              style={{ color: 'var(--fg)', fontSize: 'var(--text-sm)', textDecoration: 'none' }}
                              onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                              onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg)')}
                            >
                              {task.title}
                            </a>
                          ) : (
                            <span className="font-medium" style={{ fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
                              {task.title}
                            </span>
                          )}
                          <div className="flex gap-1 mt-1.5">
                            <span className="badge">{task.priority}</span>
                          </div>
                        </td>
                        <td>
                          <span className="badge">{task.status}</span>
                        </td>
                        <td style={MONO}>
                          {task.metadata.github_synced_at
                            ? new Date(task.metadata.github_synced_at).toLocaleDateString()
                            : '—'}
                        </td>
                        <td>
                          <span className="flex items-center gap-1.5">
                            <span className={`dot ${stateDot}`} aria-hidden />
                            <span style={{ fontSize: 'var(--text-xs)', color: isClosed ? 'var(--fg-muted)' : 'var(--fg)' }}>
                              {stateLabel}
                            </span>
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">
              <div className="empty-icon" aria-hidden>⊙</div>
              <div className="empty-title">{t('noLinkedTasks')}</div>
              <div className="empty-desc">{t('subtitle')}</div>
            </div>
          )}

          {/* Footer hint */}
          <div className="card-footer">
            <p className="hint">
              {hasPreview
                ? t('previewTitle', { count: filteredPreview.length })
                : linkedTasks.length > 0
                  ? t('linkedTasksWithCount', { count: linkedTasks.length })
                  : t('noLinkedTasks')
              }
              {lastSync && (
                <span style={{ marginLeft: 'var(--space-3)', color: 'var(--fg-subtle)' }}>
                  · last sync{' '}
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{lastSync}</span>
                </span>
              )}
            </p>
          </div>

        </div>
      </section>

      {/* ── Import form ───────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">{t('importIssues')}</h2>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <div className="field">
              <label className="hint" htmlFor="gh-repo">{t('labelRepository')}</label>
              <input
                id="gh-repo"
                type="text"
                value={repo}
                onChange={e => setRepo(e.target.value)}
                placeholder={t('placeholderRepo')}
                className="input"
              />
            </div>

            <div className="field">
              <label className="hint" htmlFor="gh-labels">{t('labelLabels')}</label>
              <input
                id="gh-labels"
                type="text"
                value={labelFilter}
                onChange={e => setLabelFilter(e.target.value)}
                placeholder={t('placeholderLabels')}
                className="input"
              />
            </div>

            <div className="field">
              <label className="hint" htmlFor="gh-state">{t('labelState')}</label>
              <select
                id="gh-state"
                value={stateFilter}
                onChange={e => setStateFilter(e.target.value as 'open' | 'closed' | 'all')}
                className="select"
              >
                <option value="open">{t('stateOpen')}</option>
                <option value="closed">{t('stateClosed')}</option>
                <option value="all">{t('stateAll')}</option>
              </select>
            </div>

            <div className="field">
              <label className="hint" htmlFor="gh-agent">{t('labelAssignAgent')}</label>
              <select
                id="gh-agent"
                value={assignAgent}
                onChange={e => setAssignAgent(e.target.value)}
                className="select"
              >
                <option value="">{t('unassigned')}</option>
                {agents.map(a => (
                  <option key={a.name} value={a.name}>{a.name}</option>
                ))}
              </select>
            </div>

          </div>
        </div>
      </div>

      {/* ── Two-way sync ──────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">{t('twoWaySync')}</h2>
          <button
            type="button"
            className="btn btn-sm"
            onClick={handleSyncAll}
            disabled={syncingProjectId !== null}
          >
            {syncingProjectId === -1 && <SmallSpinner />}
            {t('syncAll')}
          </button>
        </div>

        {linkedProjects.length > 0 ? (
          <div style={{ borderTop: '1px solid var(--border)' }}>
            {linkedProjects.map(project => (
              <div
                key={project.id}
                className="flex items-center justify-between"
                style={{
                  padding: 'var(--space-3) var(--space-5)',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`dot ${project.github_sync_enabled ? 'dot-success' : ''}`}
                    aria-label={project.github_sync_enabled ? 'Sync enabled' : 'Sync disabled'}
                  />
                  <div className="min-w-0">
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--fg)', fontWeight: 500 }}>
                      {project.name}
                    </div>
                    <div style={{ ...MONO, marginTop: 2, color: 'var(--fg-subtle)' }}>
                      {project.github_repo}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => handleToggleSync(project)}
                  >
                    {project.github_sync_enabled ? t('disableSync') : t('enableSync')}
                  </button>
                  {project.github_sync_enabled && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => handleSyncProject(project.id)}
                      disabled={syncingProjectId === project.id}
                    >
                      {syncingProjectId === project.id ? <SmallSpinner /> : (
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
                          <path d="M2 8a6 6 0 0110.472-4M14 8a6 6 0 01-10.472 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          <path d="M13 2v4h-4M3 14v-4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      )}
                      {t('syncButton')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            <div className="empty-icon" aria-hidden>⊙</div>
            <div className="empty-title">{t('noProjectsLinked')}</div>
          </div>
        )}
      </div>

      {/* ── Sync history ──────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">{t('syncHistory')}</h2>
        </div>
        {syncHistory.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table table-compact">
              <caption className="sr-only">{t('syncHistory')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('colRepo')}</th>
                  <th scope="col">{t('colIssues')}</th>
                  <th scope="col">{t('colStatus')}</th>
                  <th scope="col">{t('colSyncedAt')}</th>
                </tr>
              </thead>
              <tbody>
                {syncHistory.map(sync => {
                  const statusDot =
                    sync.status === 'success' ? 'dot-success' :
                    sync.status === 'partial'  ? 'dot-warning' :
                    'dot-danger'
                  return (
                    <tr key={sync.id}>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--fg)' }}>
                          {sync.repo}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                          {sync.issue_count}
                        </span>
                      </td>
                      <td>
                        <span className="flex items-center gap-1.5">
                          <span className={`dot ${statusDot}`} aria-hidden />
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                            {sync.status}
                          </span>
                        </span>
                      </td>
                      <td style={MONO}>
                        {new Date(sync.created_at * 1000).toLocaleString()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <div className="empty-icon" aria-hidden>⊙</div>
            <div className="empty-title">{t('noSyncHistory')}</div>
          </div>
        )}
      </div>

    </div>
  )
}
