'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Loader } from '@/components/ui/loader'
import { useMissionControl } from '@/store'
import { useSmartPoll } from '@/lib/use-smart-poll'

interface Activity {
  id: number
  type: string
  entity_type: string
  entity_id: number
  actor: string
  description: string
  data?: any
  created_at: number
  entity?: {
    type: string
    id?: number
    title?: string
    name?: string
    status?: string
    content_preview?: string
    task_title?: string
  }
}

interface SessionInfo {
  id: string
  key: string
  kind: string
  age: string
  model: string
  tokens: string
  active: boolean
}

// Glyph hints for the type filter dropdown (mono, neutral — never a colour key).
const activityIcons: Record<string, string> = {
  task_created: '+',
  task_updated: '~',
  task_deleted: 'x',
  comment_added: '#',
  agent_created: '@',
  agent_status_change: '~',
  standup_generated: '!',
  mention: '>',
  assignment: '=',
}

type ActorKind = 'ai' | 'system' | 'human'

// Actor is distinguished by GLYPH, never by hue: AI agents = ✦, system = ⚙, humans = initials.
function actorKind(actor: string, agentNames: Set<string>): ActorKind {
  const a = (actor || '').trim()
  const lower = a.toLowerCase()
  if (lower === 'system' || lower === 'scheduler' || lower === 'cron') return 'system'
  if (agentNames.has(a) || agentNames.has(lower)) return 'ai'
  return 'human'
}

const AVATAR_BASE: React.CSSProperties = {
  width: 26,
  height: 26,
  background: 'var(--surface-3)',
  border: '1px solid var(--border-strong)',
}

function ActorAvatar({ actor, kind }: { actor: string; kind: ActorKind }) {
  if (kind === 'ai') {
    return (
      <span
        aria-hidden
        className="flex-none flex items-center justify-center rounded-full font-semibold"
        style={{ ...AVATAR_BASE, color: 'var(--accent)', fontSize: 'var(--text-base)' }}
      >
        ✦
      </span>
    )
  }
  if (kind === 'system') {
    return (
      <span
        aria-hidden
        className="flex-none flex items-center justify-center rounded-full font-semibold"
        style={{ ...AVATAR_BASE, color: 'var(--fg-subtle)', fontSize: 'var(--text-sm)' }}
      >
        ⚙
      </span>
    )
  }
  return (
    <span
      aria-hidden
      className="flex-none flex items-center justify-center rounded-full font-semibold"
      style={{ ...AVATAR_BASE, color: 'var(--fg-muted)', fontSize: 'var(--text-xs)' }}
    >
      {(actor || '?').slice(0, 2).toUpperCase()}
    </span>
  )
}

function formatRelativeTime(timestamp: number) {
  const now = Date.now()
  const diffMs = now - timestamp * 1000
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(timestamp * 1000).toLocaleDateString()
}

function timeOfDay(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function dayLabel(timestamp: number): string {
  const d = new Date(timestamp * 1000)
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOf(new Date()) - startOf(d)) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

function groupByDay(activities: Activity[]): Record<string, Activity[]> {
  const groups: Record<string, Activity[]> = {}
  for (const act of activities) {
    const day = dayLabel(act.created_at)
    if (!groups[day]) groups[day] = []
    groups[day].push(act)
  }
  return groups
}

const SECTION_LABEL_STYLE: React.CSSProperties = {
  padding: 'var(--space-4) var(--space-5) var(--space-2)',
}
const ROW_BORDER: React.CSSProperties = { borderBottom: '1px solid var(--border)' }
const MONO_TIME: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  color: 'var(--fg-subtle)',
}

// ── Activity row (flat feed) ────────────────────
function ActivityRow({ activity, agentNames }: { activity: Activity; agentNames: Set<string> }) {
  const t = useTranslations('activityFeed')
  const kind = actorKind(activity.actor, agentNames)
  return (
    <div className="flex items-start gap-3 px-5 py-2.5" style={ROW_BORDER}>
      <ActorAvatar actor={activity.actor} kind={kind} />

      <div className="flex-1 min-w-0">
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
          {kind === 'ai' && <span className="sr-only">AI agent: </span>}
          <span className="font-semibold">{activity.actor}</span>{' '}
          <span style={{ color: 'var(--fg-muted)' }}>{activity.description}</span>
        </p>

        {activity.entity && (
          <div
            className="mt-2 p-2 rounded-md"
            style={{ fontSize: 'var(--text-xs)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          >
            {activity.entity.type === 'task' && (
              <div>
                <span style={{ color: 'var(--fg-subtle)' }}>{t('entityTask')}</span>
                <span className="ml-1" style={{ color: 'var(--fg)' }}>{activity.entity.title}</span>
                {activity.entity.status && (
                  <span
                    className="ml-2 px-1.5 py-0.5 rounded"
                    style={{ fontSize: '10px', background: 'var(--surface-3)', color: 'var(--fg-muted)' }}
                  >
                    {activity.entity.status}
                  </span>
                )}
              </div>
            )}
            {activity.entity.type === 'comment' && (
              <div>
                <span style={{ color: 'var(--fg-subtle)' }}>{t('entityCommentOn')}</span>
                <span className="ml-1" style={{ color: 'var(--fg)' }}>{activity.entity.task_title}</span>
                {activity.entity.content_preview && (
                  <div className="mt-1 italic" style={{ color: 'var(--fg-subtle)' }}>
                    &quot;{activity.entity.content_preview}...&quot;
                  </div>
                )}
              </div>
            )}
            {activity.entity.type === 'agent' && (
              <div>
                <span style={{ color: 'var(--fg-subtle)' }}>{t('entityAgent')}</span>
                <span className="ml-1" style={{ color: 'var(--fg)' }}>{activity.entity.name}</span>
                {activity.entity.status && (
                  <span
                    className="ml-2 px-1.5 py-0.5 rounded"
                    style={{ fontSize: '10px', background: 'var(--surface-3)', color: 'var(--fg-muted)' }}
                  >
                    {activity.entity.status}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {activity.data && Object.keys(activity.data).length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer" style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>
              {t('showDetails')}
            </summary>
            <pre
              className="mt-1 p-2 rounded-md overflow-auto max-h-32"
              style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            >
              {JSON.stringify(activity.data, null, 2)}
            </pre>
          </details>
        )}
      </div>

      <time className="flex-none text-right" style={{ ...MONO_TIME, minWidth: 68 }}>
        {timeOfDay(activity.created_at)}
      </time>
    </div>
  )
}

// ── Timeline row (agent-grouped view) ───────────
function TimelineRow({ activity }: { activity: Activity }) {
  return (
    <div className="flex items-start gap-2.5 pl-3 py-1.5 relative">
      <span
        className="dot absolute -left-[5px] top-2.5"
        style={{ background: 'var(--accent)' }}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg)' }}>{activity.description}</p>
        {activity.entity?.title && (
          <p className="mt-0.5 truncate" style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
            {activity.entity.title}
          </p>
        )}
      </div>
      <span className="flex-none" style={MONO_TIME}>
        {timeOfDay(activity.created_at)}
      </span>
    </div>
  )
}

// ── Main Component ──────────────────────────────
export function ActivityFeedPanel() {
  const t = useTranslations('activityFeed')
  const { agents } = useMissionControl()

  const [activities, setActivities] = useState<Activity[]>([])
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [lastRefresh, setLastRefresh] = useState(Date.now())

  const [selectedAgent, setSelectedAgent] = useState<string>('')
  const [filter, setFilter] = useState({ type: '', limit: 50 })

  const limit = filter.limit
  const isAgentView = selectedAgent !== ''

  // ── Fetch activities ──────────────────────────
  const fetchActivities = useCallback(
    async (since?: number) => {
      try {
        if (!since) setLoading(true)
        setError(null)

        const params = new URLSearchParams()
        if (selectedAgent) params.append('actor', selectedAgent)
        if (filter.type) params.append('type', filter.type)
        params.append('limit', limit.toString())
        if (isAgentView) params.append('offset', (page * limit).toString())
        if (since && !isAgentView) params.append('since', Math.floor(since / 1000).toString())

        const response = await fetch(`/api/activities?${params}`)
        if (!response.ok) throw new Error('Failed to fetch activities')
        const data = await response.json()

        if (since && !isAgentView) {
          setActivities((prev) => {
            const newActivities = data.activities || []
            const existingIds = new Set(prev.map((a: Activity) => a.id))
            const uniqueNew = newActivities.filter((a: Activity) => !existingIds.has(a.id))
            return [...uniqueNew, ...prev].slice(0, limit)
          })
        } else {
          setActivities(data.activities || [])
        }

        setTotal(data.total || 0)
        setLastRefresh(Date.now())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    },
    [selectedAgent, filter.type, limit, page, isAgentView],
  )

  const lastRefreshRef = useRef(lastRefresh)
  useEffect(() => {
    lastRefreshRef.current = lastRefresh
  }, [lastRefresh])

  useEffect(() => {
    fetchActivities()
  }, [fetchActivities])

  const pollActivities = useCallback(() => {
    fetchActivities(isAgentView ? undefined : lastRefreshRef.current)
  }, [fetchActivities, isAgentView])

  useSmartPoll(pollActivities, 30000, { enabled: autoRefresh, pauseWhenSseConnected: true })

  // ── Fetch sessions (for agent sidebar) ────────
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions')
      if (!res.ok) return
      const data = await res.json()
      setSessions(data.sessions || [])
    } catch {
      /* silent */
    }
  }, [])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  // ── Derived data ──────────────────────────────
  const agentNames = new Set(agents.map((a) => a.name))
  const activityTypes = Array.from(new Set(activities.map((a) => a.type))).sort()
  const agentSessions = sessions.filter((s) => selectedAgent && s.key.includes(selectedAgent))
  const selectedAgentData = agents.find((a) => a.name === selectedAgent)
  const totalPages = Math.ceil(total / limit)
  const groupedByDay = groupByDay(activities)

  const statusDot = (status?: string) =>
    status === 'busy'
      ? 'dot-success'
      : status === 'idle'
        ? 'dot-warning'
        : status === 'error'
          ? 'dot-danger'
          : ''

  return (
    <div className="opzava-ds h-full flex flex-col" style={{ background: 'var(--bg)', color: 'var(--fg)' }}>
      {/* Header */}
      <div className="flex justify-between items-center p-4 flex-shrink-0" style={ROW_BORDER}>
        <div className="flex items-center gap-3">
          <h2 className="font-semibold" style={{ fontSize: 'var(--text-lg)' }}>{t('title')}</h2>
          <span className={`dot ${autoRefresh ? 'dot-success live' : ''}`} aria-hidden />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setAutoRefresh(!autoRefresh)} className="btn btn-sm">
            <span className={`dot ${autoRefresh ? 'dot-success live' : ''}`} aria-hidden />
            {autoRefresh ? t('live') : t('paused')}
          </button>
          <button type="button" onClick={() => fetchActivities()} className="btn btn-sm">
            {t('refresh')}
          </button>
        </div>
      </div>

      {/* Filters + Agent Selector */}
      <div className="p-4 flex-shrink-0" style={{ ...ROW_BORDER, background: 'var(--surface)' }}>
        <div className="flex gap-4 flex-wrap items-end">
          {/* Agent filter */}
          <div>
            <label className="block mb-1" style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
              {t('filterAgent')}
            </label>
            <div className="flex gap-1 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setSelectedAgent('')
                  setPage(0)
                }}
                className={`btn btn-sm ${selectedAgent === '' ? 'btn-primary' : ''}`}
              >
                {t('filterAll')}
              </button>
              {agents.map((a) => (
                <button
                  type="button"
                  key={a.name}
                  onClick={() => {
                    setSelectedAgent(a.name)
                    setPage(0)
                  }}
                  className={`btn btn-sm ${selectedAgent === a.name ? 'btn-primary' : ''}`}
                >
                  <span className={`dot ${statusDot(a.status)}`} style={{ width: 6, height: 6 }} aria-hidden />
                  {a.name}
                </button>
              ))}
            </div>
          </div>

          {/* Type filter */}
          <div>
            <label className="block mb-1" style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
              {t('filterType')}
            </label>
            <select
              value={filter.type}
              onChange={(e) => setFilter((prev) => ({ ...prev, type: e.target.value }))}
              className="select btn-sm"
              style={{ width: 'auto', minWidth: 160 }}
            >
              <option value="">{t('allTypes')}</option>
              {activityTypes.map((type) => (
                <option key={type} value={type}>
                  {activityIcons[type] || '•'} {type.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          {/* Limit */}
          <div>
            <label className="block mb-1" style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
              {t('filterLimit')}
            </label>
            <select
              value={filter.limit}
              onChange={(e) => setFilter((prev) => ({ ...prev, limit: parseInt(e.target.value) }))}
              className="select btn-sm"
              style={{ width: 'auto', minWidth: 90 }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="banner banner-danger m-4">
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="btn btn-ghost btn-icon btn-sm"
            aria-label={t('refresh')}
          >
            x
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && activities.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <Loader variant="inline" label={t('loadingActivities')} />
          </div>
        ) : activities.length === 0 ? (
          <div className="empty">
            <div className="empty-icon" aria-hidden>☰</div>
            <div className="empty-title">{t('noActivities')}</div>
            <div className="empty-desc">
              {selectedAgent ? t('noActivityForAgent', { agent: selectedAgent }) : t('tryAdjustingFilters')}
            </div>
          </div>
        ) : isAgentView ? (
          /* ── Agent-grouped view with sidebar ─── */
          <div className="grid lg:grid-cols-3 gap-4">
            {/* Agent info sidebar */}
            <div className="lg:col-span-1 space-y-3">
              {selectedAgentData && (
                <div className="card card-body space-y-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ background: 'var(--accent-soft)' }}
                    >
                      <span className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--accent)' }}>
                        {selectedAgentData.name.slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
                        {selectedAgentData.name}
                      </p>
                      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>{selectedAgentData.role}</p>
                    </div>
                  </div>

                  <div className="space-y-2" style={{ fontSize: 'var(--text-xs)' }}>
                    <div className="flex justify-between items-center">
                      <span style={{ color: 'var(--fg-muted)' }}>{t('agentStatus')}</span>
                      <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: 'var(--fg)' }}>
                        <span className={`dot ${statusDot(selectedAgentData.status)}`} aria-hidden />
                        {selectedAgentData.status}
                      </span>
                    </div>
                    {selectedAgentData.last_seen && (
                      <div className="flex justify-between">
                        <span style={{ color: 'var(--fg-muted)' }}>{t('lastSeen')}</span>
                        <span style={{ ...MONO_TIME, color: 'var(--fg)' }}>
                          {formatRelativeTime(selectedAgentData.last_seen)}
                        </span>
                      </div>
                    )}
                    {selectedAgentData.last_activity && (
                      <div className="flex justify-between">
                        <span style={{ color: 'var(--fg-muted)' }}>{t('lastAction')}</span>
                        <span
                          className="truncate max-w-[140px]"
                          style={{ color: 'var(--fg)' }}
                          title={selectedAgentData.last_activity}
                        >
                          {selectedAgentData.last_activity}
                        </span>
                      </div>
                    )}
                    {selectedAgentData.taskStats && (
                      <>
                        <div className="pt-2 mt-2" style={{ borderTop: '1px solid var(--border)' }} />
                        <div className="flex justify-between">
                          <span style={{ color: 'var(--fg-muted)' }}>{t('tasksAssigned')}</span>
                          <span style={{ color: 'var(--fg)' }}>{selectedAgentData.taskStats.assigned}</span>
                        </div>
                        <div className="flex justify-between">
                          <span style={{ color: 'var(--fg-muted)' }}>{t('inProgress')}</span>
                          <span style={{ color: 'var(--fg)' }}>{selectedAgentData.taskStats.in_progress}</span>
                        </div>
                        <div className="flex justify-between">
                          <span style={{ color: 'var(--fg-muted)' }}>{t('completed')}</span>
                          <span style={{ color: 'var(--fg)' }}>{selectedAgentData.taskStats.completed}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {agentSessions.length > 0 && (
                <div className="card card-body">
                  <h4 className="font-semibold mb-2" style={{ fontSize: 'var(--text-xs)', color: 'var(--fg)' }}>
                    {t('activeSessions')}
                  </h4>
                  <div className="space-y-2">
                    {agentSessions.map((s) => (
                      <div key={s.id} className="space-y-0.5" style={{ fontSize: 'var(--text-xs)' }}>
                        <div className="flex items-center gap-1.5">
                          <span className={`dot ${s.active ? 'dot-success' : ''}`} style={{ width: 6, height: 6 }} aria-hidden />
                          <span className="truncate" style={{ ...MONO_TIME, color: 'var(--fg)' }}>{s.kind}</span>
                        </div>
                        <div className="flex gap-3 pl-3" style={{ color: 'var(--fg-muted)' }}>
                          <span>{s.model}</span>
                          <span>{s.tokens} tokens</span>
                          <span>{s.age}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Day-grouped timeline */}
            <div className="lg:col-span-2">
              <div className="space-y-4">
                {Object.entries(groupedByDay).map(([day, dayActivities]) => (
                  <div key={day}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="section-label" style={{ padding: 0 }}>{day}</span>
                      <span className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>
                        {t('events', { count: dayActivities.length })}
                      </span>
                    </div>
                    <div className="space-y-1 pl-2" style={{ borderLeft: '1px solid var(--border)' }}>
                      {dayActivities.map((act) => (
                        <TimelineRow key={act.id} activity={act} />
                      ))}
                    </div>
                  </div>
                ))}

                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="btn btn-ghost btn-sm"
                    >
                      {t('newer')}
                    </button>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                      {t('pageOf', { page: page + 1, total: totalPages })}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      className="btn btn-ghost btn-sm"
                    >
                      {t('older')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ── Flat feed (all agents) — day-grouped event stream ──────── */
          <div className="card">
            <div role="log" aria-live="polite" aria-label={t('title')}>
              {Object.entries(groupedByDay).map(([day, dayActivities]) => (
                <div key={day}>
                  <div className="section-label" style={SECTION_LABEL_STYLE}>{day}</div>
                  {dayActivities.map((activity, index) => (
                    <ActivityRow key={`${activity.id}-${index}`} activity={activity} agentNames={agentNames} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="card-footer flex-shrink-0" style={{ background: 'var(--surface)' }}>
        <div className="flex justify-between items-center">
          <span className="hint">
            {isAgentView
              ? t('footerAgentEvents', { total, agent: selectedAgent })
              : t('footerShowing', { count: activities.length, filtered: filter.type ? ` ${t('filtered')}` : '' })}
          </span>
          <span className="hint">{t('lastUpdated', { time: new Date(lastRefresh).toLocaleTimeString() })}</span>
        </div>
      </div>
    </div>
  )
}
