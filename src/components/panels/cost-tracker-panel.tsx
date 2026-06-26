'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Loader } from '@/components/ui/loader'
import { useMissionControl } from '@/store'
import { createClientLogger } from '@/lib/client-logger'
import { apiFetch } from '@/lib/api-client'
import {
  PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, BarChart, Bar,
} from 'recharts'

const log = createClientLogger('CostTracker')

// ── Types ──────────────────────────────────────────

interface TokenStats {
  totalTokens: number; totalCost: number; requestCount: number
  avgTokensPerRequest: number; avgCostPerRequest: number
}

interface UsageStats {
  summary: TokenStats
  models: Record<string, { totalTokens: number; totalCost: number; requestCount: number }>
  sessions: Record<string, { totalTokens: number; totalCost: number; requestCount: number }>
  timeframe: string
  recordCount: number
}

interface TrendData {
  trends: Array<{ timestamp: string; tokens: number; cost: number; requests: number }>
  timeframe: string
}

interface ByAgentModelBreakdown {
  model: string; input_tokens: number; output_tokens: number; request_count: number; cost: number
}

interface ByAgentEntry {
  agent: string; total_input_tokens: number; total_output_tokens: number
  total_tokens: number; total_cost: number; session_count: number
  request_count: number; last_active: string; models: ByAgentModelBreakdown[]
}

interface ByAgentResponse {
  agents: ByAgentEntry[]
  summary: { total_cost: number; total_tokens: number; agent_count: number; days: number }
}

interface TaskCostEntry {
  taskId: number; title: string; status: string; priority: string
  assignedTo?: string | null
  project: { id?: number | null; name?: string | null; slug?: string | null; ticketRef?: string | null }
  stats: TokenStats
  models: Record<string, TokenStats>
}

interface TaskCostsResponse {
  summary: TokenStats
  tasks: TaskCostEntry[]
  agents: Record<string, { stats: TokenStats; taskCount: number; taskIds: number[] }>
  unattributed: TokenStats
  timeframe: string
}

interface SessionCostEntry {
  sessionId: string; sessionKey?: string; model: string
  totalTokens: number; inputTokens: number; outputTokens: number
  totalCost: number; requestCount: number; firstSeen: string; lastSeen: string
}

// ── Helpers ──────────────────────────────────────────

const DS_CHART_COLORS = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)',
  'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)',
]

const CHART_TOOLTIP_STYLE = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--fg)',
  fontSize: 'var(--text-xs)',
}

const MONO = {
  fontFamily: 'var(--font-mono)',
  fontVariantNumeric: 'tabular-nums',
}

const formatNumber = (num: number) => {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K'
  return num.toString()
}

const formatCost = (cost: number) => '$' + cost.toFixed(4)

const getModelDisplayName = (name: string) => name.split('/').pop() || name

type View = 'overview' | 'agents' | 'sessions' | 'tasks'
type Timeframe = 'hour' | 'day' | 'week' | 'month'

// ── Main Component ──────────────────────────────────

export function CostTrackerPanel() {
  const t = useTranslations('costTracker')
  const { sessions } = useMissionControl()

  const [view, setView] = useState<View>('overview')
  const [timeframe, setTimeframe] = useState<Timeframe>('day')
  const [chartMode, setChartMode] = useState<'incremental' | 'cumulative'>('incremental')
  const [isLoading, setIsLoading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  // Data
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null)
  const [trendData, setTrendData] = useState<TrendData | null>(null)
  const [byAgentData, setByAgentData] = useState<ByAgentResponse | null>(null)
  const [taskData, setTaskData] = useState<TaskCostsResponse | null>(null)
  const [sessionCosts, setSessionCosts] = useState<SessionCostEntry[]>([])
  const [sessionSort, setSessionSort] = useState<'cost' | 'tokens' | 'requests' | 'recent'>('cost')
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)

  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const timeframeToDays = (tf: Timeframe): number => {
    switch (tf) { case 'hour': case 'day': return 1; case 'week': return 7; case 'month': return 30 }
  }

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [statsJson, trendJson, byAgentJson, taskJson] = await Promise.all([
        apiFetch<UsageStats>(`/api/tokens?action=stats&timeframe=${timeframe}`),
        apiFetch<TrendData>(`/api/tokens?action=trends&timeframe=${timeframe}`),
        apiFetch<ByAgentResponse>(`/api/tokens/by-agent?days=${timeframeToDays(timeframe)}`),
        apiFetch<TaskCostsResponse>(`/api/tokens?action=task-costs&timeframe=${timeframe}`),
      ])
      setUsageStats(statsJson)
      setTrendData(trendJson)
      setByAgentData(byAgentJson)
      setTaskData(taskJson)
    } catch (err) {
      log.error('Failed to load cost data:', err)
    } finally {
      setIsLoading(false)
    }
  }, [timeframe])

  const loadSessionCosts = useCallback(async () => {
    try {
      const data = await apiFetch<{ sessions?: SessionCostEntry[] }>(`/api/tokens?action=session-costs&timeframe=${timeframe}`)
      if (Array.isArray(data?.sessions)) {
        setSessionCosts(data.sessions)
      } else if (usageStats?.sessions) {
        setSessionCosts(Object.entries(usageStats.sessions).map(([id, stats]) => ({
          sessionId: id, model: '', totalTokens: stats.totalTokens, inputTokens: 0,
          outputTokens: 0, totalCost: stats.totalCost, requestCount: stats.requestCount,
          firstSeen: '', lastSeen: '',
        })))
      }
    } catch {
      if (usageStats?.sessions) {
        setSessionCosts(Object.entries(usageStats.sessions).map(([id, stats]) => ({
          sessionId: id, model: '', totalTokens: stats.totalTokens, inputTokens: 0,
          outputTokens: 0, totalCost: stats.totalCost, requestCount: stats.requestCount,
          firstSeen: '', lastSeen: '',
        })))
      }
    }
  }, [timeframe, usageStats])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => {
    refreshTimer.current = setInterval(loadData, 30_000)
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current) }
  }, [loadData])
  useEffect(() => { if (view === 'sessions') loadSessionCosts() }, [view, loadSessionCosts])

  const exportData = async (format: 'json' | 'csv') => {
    setIsExporting(true)
    try {
      const res = await apiFetch<Response>(`/api/tokens?action=export&timeframe=${timeframe}&format=${format}`, { raw: true })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.style.display = 'none'; a.href = url
      a.download = `cost-tracker-${timeframe}-${new Date().toISOString().split('T')[0]}.${format}`
      document.body.appendChild(a); a.click()
      window.URL.revokeObjectURL(url); document.body.removeChild(a)
    } catch (err) {
      log.error('Export failed:', err)
    } finally {
      setIsExporting(false)
    }
  }

  // Derived data
  const summary = usageStats?.summary
  const agentSummary = byAgentData?.summary
  const agentList = byAgentData?.agents || []
  const maxAgentCost = Math.max(...agentList.map(a => a.total_cost), 0.0001)

  const getAgentTasks = (agentName: string): TaskCostEntry[] => {
    if (!taskData) return []
    const entry = taskData.agents[agentName]
    if (!entry) return []
    return taskData.tasks.filter(t => entry.taskIds.includes(t.taskId))
  }

  return (
    <div className="opzava-ds p-6 space-y-5" style={{ background: 'var(--bg)', color: 'var(--fg)' }}>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title font-semibold">{t('title')}</h1>
          <p className="page-sub">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          {isLoading && <Loader variant="inline" />}
          {/* View selector */}
          <div className="flex gap-1">
            {(['overview', 'agents', 'sessions', 'tasks'] as const).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`btn btn-sm${view === v ? ' btn-primary' : ''}`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          {/* Timeframe */}
          <div className="flex gap-1">
            {(['hour', 'day', 'week', 'month'] as const).map(tf => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`btn btn-sm${timeframe === tf ? ' btn-primary' : ''}`}
              >
                {tf.charAt(0).toUpperCase() + tf.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading && !usageStats ? (
        <div className="flex items-center justify-center py-16">
          <Loader variant="panel" label={t('loadingCostData')} />
        </div>
      ) : view === 'overview' ? (
        <OverviewView
          stats={usageStats} trendData={trendData} agentSummary={agentSummary}
          taskData={taskData} timeframe={timeframe} chartMode={chartMode}
          setChartMode={setChartMode} exportData={exportData} isExporting={isExporting}
          onRefresh={loadData}
        />
      ) : view === 'agents' ? (
        <AgentsView
          agents={agentList} summary={agentSummary} maxCost={maxAgentCost}
          expandedAgent={expandedAgent} setExpandedAgent={setExpandedAgent}
          getAgentTasks={getAgentTasks} onRefresh={loadData}
        />
      ) : view === 'sessions' ? (
        <SessionsView
          sessionCosts={sessionCosts} sessions={sessions}
          sessionSort={sessionSort} setSessionSort={setSessionSort}
        />
      ) : (
        <TasksView taskData={taskData} onRefresh={loadData} />
      )}
    </div>
  )
}

// ── Overview View ──────────────────────────────────

function OverviewView({
  stats, trendData, agentSummary, taskData, timeframe, chartMode, setChartMode,
  exportData, isExporting, onRefresh,
}: {
  stats: UsageStats | null; trendData: TrendData | null
  agentSummary: ByAgentResponse['summary'] | undefined; taskData: TaskCostsResponse | null
  timeframe: Timeframe; chartMode: 'incremental' | 'cumulative'
  setChartMode: (m: 'incremental' | 'cumulative') => void
  exportData: (f: 'json' | 'csv') => void; isExporting: boolean
  onRefresh: () => void
}) {
  const t = useTranslations('costTracker')
  if (!stats) {
    return (
      <div className="empty">
        <div className="empty-icon" aria-hidden>$</div>
        <div className="empty-title">{t('noUsageData')}</div>
        <div className="empty-desc">{t('noUsageDataDesc')}</div>
        <div className="empty-cta">
          <button type="button" onClick={onRefresh} className="btn btn-sm">{t('refresh')}</button>
        </div>
      </div>
    )
  }

  const modelData = Object.entries(stats.models)
    .map(([model, s]) => ({ name: getModelDisplayName(model), fullName: model, tokens: s.totalTokens, cost: s.totalCost, requests: s.requestCount }))
    .sort((a, b) => b.cost - a.cost)

  const pieData = modelData.slice(0, 6).map(m => ({ name: m.name, value: m.cost }))

  const trendChartData = (() => {
    if (!trendData?.trends) return []
    const raw = trendData.trends.map(t => ({
      time: new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      tokens: t.tokens, cost: t.cost, requests: t.requests,
    }))
    if (chartMode === 'cumulative') {
      let ct = 0, cc = 0, cr = 0
      return raw.map(d => { ct += d.tokens; cc += d.cost; cr += d.requests; return { ...d, tokens: ct, cost: cc, requests: cr } })
    }
    return raw
  })()

  const models = Object.entries(stats.models)
  const mostEfficient = models.length > 0
    ? models.reduce((best, curr) => {
        const c = curr[1].totalCost / Math.max(1, curr[1].totalTokens)
        const b = best[1].totalCost / Math.max(1, best[1].totalTokens)
        return c < b ? curr : best
      })
    : null
  const efficientCostPerToken = mostEfficient ? mostEfficient[1].totalCost / Math.max(1, mostEfficient[1].totalTokens) : 0
  const potentialSavings = Math.max(0, stats.summary.totalCost - stats.summary.totalTokens * efficientCostPerToken)

  return (
    <div className="space-y-5">
      {/* Stat grid */}
      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">{t('totalCost', { timeframe })}</div>
          <div className="stat-value" style={MONO}>{formatCost(stats.summary.totalCost)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('totalTokens')}</div>
          <div className="stat-value">{formatNumber(stats.summary.totalTokens)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('apiRequests')}</div>
          <div className="stat-value">{formatNumber(stats.summary.requestCount)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('activeAgents')}</div>
          <div className="stat-value">{agentSummary?.agent_count ?? '—'}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('taskAttributed')}</div>
          <div className="stat-value">
            {taskData
              ? `${((1 - taskData.unattributed.totalCost / Math.max(stats.summary.totalCost, 0.0001)) * 100).toFixed(0)}%`
              : '—'}
          </div>
        </div>
      </div>

      {/* Trend chart */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">{t('usageTrends')}</h2>
          <div className="flex gap-1">
            {(['incremental', 'cumulative'] as const).map(m => (
              <button key={m} type="button" onClick={() => setChartMode(m)}
                className={`btn btn-sm${chartMode === m ? ' btn-primary' : ''}`}
              >
                {m === 'incremental' ? t('perTurn') : t('cumulative')}
              </button>
            ))}
          </div>
        </div>
        <div className="card-body">
          <div style={{ height: 256 }}>
            {trendChartData.length === 0 ? (
              <div className="empty">
                <div className="empty-title">{t('noTrendData')}</div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--fg-muted)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--fg-muted)' }} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }} />
                  <Line type="monotone" dataKey="tokens" stroke="var(--chart-1)" strokeWidth={2} name="Tokens" dot={false} />
                  <Line type="monotone" dataKey="requests" stroke="var(--chart-2)" strokeWidth={2} name="Requests" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Model charts — side by side */}
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Token usage by model */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{t('tokenUsageByModel')}</h2>
          </div>
          <div className="card-body">
            <div style={{ height: 256 }}>
              {modelData.length === 0 ? (
                <div className="empty">
                  <div className="empty-title">{t('noModelData')}</div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={modelData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} interval={0} tick={{ fontSize: 10, fill: 'var(--fg-muted)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--fg-muted)' }} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v, n) => [formatNumber(Number(v)), n]} />
                    <Bar dataKey="tokens" fill="var(--chart-1)" name="Tokens" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Cost distribution */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{t('costDistributionByModel')}</h2>
          </div>
          <div className="card-body">
            <div style={{ height: 256 }}>
              {pieData.length === 0 ? (
                <div className="empty">
                  <div className="empty-title">{t('noCostData')}</div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={80} paddingAngle={5} dataKey="value">
                      {pieData.map((_, i) => <Cell key={i} fill={DS_CHART_COLORS[i % DS_CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v) => formatCost(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Performance insights */}
      {models.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{t('performanceInsights')}</h2>
          </div>
          <div className="card-body space-y-4">
            <div className="stat-grid">
              <div className="stat">
                <div className="stat-label">{t('mostEfficientModel')}</div>
                <div className="stat-value" style={{ fontSize: 'var(--text-lg)' }}>
                  {mostEfficient ? getModelDisplayName(mostEfficient[0]) : '—'}
                </div>
                {mostEfficient && (
                  <div className="hint" style={{ marginTop: 'var(--space-1)', ...MONO }}>
                    ${(efficientCostPerToken * 1000).toFixed(4)}/1K tokens
                  </div>
                )}
              </div>
              <div className="stat">
                <div className="stat-label">{t('avgTokensPerRequest')}</div>
                <div className="stat-value">{formatNumber(stats.summary.avgTokensPerRequest)}</div>
              </div>
              <div className="stat">
                <div className="stat-label">{t('optimizationPotential')}</div>
                <div className="stat-value" style={MONO}>{formatCost(potentialSavings)}</div>
                <div className="hint" style={{ marginTop: 'var(--space-1)' }}>
                  {stats.summary.totalCost > 0 ? ((potentialSavings / stats.summary.totalCost) * 100).toFixed(1) : '0'}% {t('savingsPossible')}
                </div>
              </div>
            </div>

            {/* Efficiency bars */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-4)' }}>
              <div className="section-label" style={{ padding: '0 0 var(--space-2)' }}>Cost per 1K tokens</div>
              <div className="space-y-2">
                {modelData.map(m => {
                  const costPer1k = m.cost / Math.max(1, m.tokens) * 1000
                  const maxCostPer1k = Math.max(...modelData.map(d => d.cost / Math.max(1, d.tokens) * 1000), 0.0001)
                  return (
                    <div key={m.fullName} className="flex items-center gap-3">
                      <div style={{ width: 128, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', flexShrink: 0 }}>
                        {m.name}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="perf-bar-track">
                          <i className="perf-bar-fill" style={{ width: `${(costPer1k / maxCostPer1k) * 100}%` }} />
                        </div>
                      </div>
                      <div style={{ width: 80, textAlign: 'right', ...MONO, fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', flexShrink: 0 }}>
                        ${costPer1k.toFixed(4)}/1K
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export */}
      <div className="card">
        <div className="card-body flex items-center justify-between">
          <div>
            <div className="font-semibold" style={{ fontSize: 'var(--text-base)', color: 'var(--fg)' }}>{t('exportData')}</div>
            <p className="hint" style={{ marginTop: 'var(--space-1)' }}>{t('exportDataDesc')}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => exportData('csv')} disabled={isExporting} className="btn btn-sm">
              {isExporting ? t('exporting') : 'CSV'}
            </button>
            <button type="button" onClick={() => exportData('json')} disabled={isExporting} className="btn btn-sm">
              {isExporting ? t('exporting') : 'JSON'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Agents View ──────────────────────────────────

function AgentsView({
  agents, summary, maxCost, expandedAgent, setExpandedAgent, getAgentTasks, onRefresh,
}: {
  agents: ByAgentEntry[]; summary: ByAgentResponse['summary'] | undefined
  maxCost: number; expandedAgent: string | null
  setExpandedAgent: (a: string | null) => void
  getAgentTasks: (name: string) => TaskCostEntry[]; onRefresh: () => void
}) {
  const t = useTranslations('costTracker')
  const [expandedSection, setExpandedSection] = useState<'models' | 'tasks'>('tasks')

  if (!summary || agents.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon" aria-hidden>✦</div>
        <div className="empty-title">{t('noAgentData')}</div>
        <div className="empty-desc">{t('noAgentDataDesc')}</div>
        <div className="empty-cta">
          <button type="button" onClick={onRefresh} className="btn btn-sm">{t('refresh')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">{t('agents')}</div>
          <div className="stat-value">{summary.agent_count}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('totalCostDays', { days: summary.days })}</div>
          <div className="stat-value" style={MONO}>{formatCost(summary.total_cost)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('totalTokens')}</div>
          <div className="stat-value">{formatNumber(summary.total_tokens)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('avgPer1kTokens')}</div>
          <div className="stat-value" style={MONO}>
            {summary.total_tokens > 0 ? `$${(summary.total_cost / summary.total_tokens * 1000).toFixed(4)}` : '—'}
          </div>
        </div>
      </div>

      {/* Per-agent cost bar chart */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">{t('perAgentCost')}</h2>
        </div>
        <div className="card-body">
          <div style={{ height: 256 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agents.slice(0, 12).map(a => ({
                name: a.agent.length > 12 ? a.agent.slice(0, 11) + '…' : a.agent,
                cost: Number(a.total_cost.toFixed(4)),
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--fg-muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--fg-muted)' }} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v) => formatCost(Number(v))} />
                <Bar dataKey="cost" fill="var(--chart-1)" name="Cost ($)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Agent detail rows */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">{t('agentBreakdown')}</h2>
          <span className="badge">{agents.length}</span>
        </div>
        <div style={{ maxHeight: 600, overflowY: 'auto' }}>
          {agents.map((agent, idx) => {
            const costShare = (agent.total_cost / Math.max(summary.total_cost, 0.0001)) * 100
            const isExpanded = expandedAgent === agent.agent
            const agentTasks = getAgentTasks(agent.agent)
            return (
              <div key={agent.agent} style={{ borderBottom: idx < agents.length - 1 ? '1px solid var(--border)' : 'none' }}>
                {/* Expand toggle */}
                <button
                  type="button"
                  onClick={() => setExpandedAgent(isExpanded ? null : agent.agent)}
                  className="w-full flex items-center justify-between text-left"
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 'var(--space-4) var(--space-5)',
                    cursor: 'pointer',
                    color: 'var(--fg)',
                    font: 'inherit',
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span aria-hidden style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-base)', lineHeight: 1, flexShrink: 0 }}>✦</span>
                    <span className="font-medium truncate" style={{ fontSize: 'var(--text-sm)' }}>{agent.agent}</span>
                    <span className="badge" style={{ flexShrink: 0 }}>{agent.session_count} session{agent.session_count !== 1 ? 's' : ''}</span>
                    <span className="badge" style={{ flexShrink: 0 }}>{agent.request_count} req{agent.request_count !== 1 ? 's' : ''}</span>
                    {agentTasks.length > 0 && (
                      <span className="badge" style={{ flexShrink: 0 }}>{agentTasks.length} task{agentTasks.length !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4" style={{ flexShrink: 0 }}>
                    <div style={{ width: 80 }} className="hidden md:block">
                      <div className="perf-bar-track">
                        <i className="perf-bar-fill" style={{ width: `${(agent.total_cost / maxCost) * 100}%` }} />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium" style={{ ...MONO, fontSize: 'var(--text-sm)' }}>{formatCost(agent.total_cost)}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)', ...MONO }}>{costShare.toFixed(1)}%</div>
                    </div>
                    <div className="text-right">
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', ...MONO }}>{formatNumber(agent.total_tokens)}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>{t('tokens')}</div>
                    </div>
                    <svg
                      className={`flex-none transition-transform${isExpanded ? ' rotate-180' : ''}`}
                      style={{ width: 16, height: 16, color: 'var(--fg-subtle)' }}
                      viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                    >
                      <polyline points="4,6 8,10 12,6" />
                    </svg>
                  </div>
                </button>

                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)', padding: 'var(--space-4) var(--space-5)' }}>
                    {/* Mini stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3" style={{ marginBottom: 'var(--space-3)' }}>
                      <div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>{t('inputTokens')}</div>
                        <div className="font-medium" style={{ fontSize: 'var(--text-sm)', ...MONO }}>{formatNumber(agent.total_input_tokens)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>{t('outputTokens')}</div>
                        <div className="font-medium" style={{ fontSize: 'var(--text-sm)', ...MONO }}>{formatNumber(agent.total_output_tokens)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>{t('ioRatio')}</div>
                        <div className="font-medium" style={{ fontSize: 'var(--text-sm)', ...MONO }}>
                          {agent.total_output_tokens > 0 ? (agent.total_input_tokens / agent.total_output_tokens).toFixed(2) : '—'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>{t('lastActive')}</div>
                        <div className="font-medium" style={{ fontSize: 'var(--text-sm)' }}>
                          {new Date(agent.last_active).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    {/* Section toggle */}
                    <div className="flex gap-2" style={{ marginBottom: 'var(--space-3)' }}>
                      <button
                        type="button"
                        className={`btn btn-sm${expandedSection === 'tasks' ? ' btn-primary' : ''}`}
                        onClick={(e) => { e.stopPropagation(); setExpandedSection('tasks') }}
                      >
                        Tasks ({agentTasks.length})
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm${expandedSection === 'models' ? ' btn-primary' : ''}`}
                        onClick={(e) => { e.stopPropagation(); setExpandedSection('models') }}
                      >
                        Models ({agent.models.length})
                      </button>
                    </div>

                    {expandedSection === 'tasks' && (
                      agentTasks.length === 0 ? (
                        <p className="hint" style={{ fontStyle: 'italic' }}>{t('noTaskCosts')}</p>
                      ) : (
                        <div className="space-y-1.5">
                          {agentTasks.map(task => (
                            <div key={task.taskId} className="flex items-center justify-between" style={{ fontSize: 'var(--text-xs)' }}>
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="badge" style={{ flexShrink: 0 }}>{task.priority}</span>
                                {task.project.ticketRef && (
                                  <span style={{ ...MONO, color: 'var(--fg-subtle)', flexShrink: 0 }}>{task.project.ticketRef}</span>
                                )}
                                <span className="truncate" style={{ color: 'var(--fg)' }}>{task.title}</span>
                              </div>
                              <span className="font-medium" style={{ ...MONO, width: 64, textAlign: 'right', flexShrink: 0 }}>
                                {formatCost(task.stats.totalCost)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )
                    )}

                    {expandedSection === 'models' && agent.models.length > 0 && (
                      <div className="space-y-1.5">
                        {agent.models.map(m => (
                          <div key={m.model} className="flex items-center justify-between" style={{ fontSize: 'var(--text-xs)' }}>
                            <span className="truncate" style={{ color: 'var(--fg-muted)' }}>{getModelDisplayName(m.model)}</span>
                            <div className="flex gap-4" style={{ ...MONO, flexShrink: 0 }}>
                              <span>{formatNumber(m.input_tokens)} in</span>
                              <span>{formatNumber(m.output_tokens)} out</span>
                              <span>{m.request_count} reqs</span>
                              <span className="font-medium" style={{ width: 64, textAlign: 'right' }}>{formatCost(m.cost)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Sessions View ──────────────────────────────────

function SessionsView({
  sessionCosts, sessions, sessionSort, setSessionSort,
}: {
  sessionCosts: SessionCostEntry[]; sessions: any[]
  sessionSort: 'cost' | 'tokens' | 'requests' | 'recent'
  setSessionSort: (s: 'cost' | 'tokens' | 'requests' | 'recent') => void
}) {
  const t = useTranslations('costTracker')
  const sorted = [...sessionCosts].sort((a, b) => {
    switch (sessionSort) {
      case 'cost': return b.totalCost - a.totalCost
      case 'tokens': return b.totalTokens - a.totalTokens
      case 'requests': return b.requestCount - a.requestCount
      case 'recent': return (b.lastSeen || '').localeCompare(a.lastSeen || '')
      default: return 0
    }
  })

  return (
    <div className="space-y-4">
      {/* Sort controls */}
      <div className="flex items-center gap-2">
        <span className="hint">{t('sortBy')}:</span>
        {(['cost', 'tokens', 'requests', 'recent'] as const).map(s => (
          <button key={s} type="button" onClick={() => setSessionSort(s)}
            className={`btn btn-sm${sessionSort === s ? ' btn-primary' : ''}`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden>⊙</div>
          <div className="empty-title">{t('noSessionCostData')}</div>
          <div className="empty-desc">{t('noSessionCostDataDesc')}</div>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(entry => {
            const sessionInfo = sessions.find((s: any) => s.id === entry.sessionId)
            return (
              <div key={entry.sessionId} className="card">
                <div className="card-body">
                  <div className="flex items-start justify-between" style={{ marginBottom: 'var(--space-3)' }}>
                    <div className="min-w-0">
                      <div className="font-medium truncate" style={{ fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
                        {entry.sessionKey || sessionInfo?.key || entry.sessionId}
                      </div>
                      <div className="flex items-center gap-2" style={{ marginTop: 'var(--space-1)', fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                        <span className={`dot${sessionInfo?.active ? ' dot-success' : ''}`} aria-hidden />
                        <span>{sessionInfo?.active ? t('activeStatus') : t('inactiveStatus')}</span>
                        {entry.model && <span aria-hidden style={{ color: 'var(--border-strong)' }}>·</span>}
                        {entry.model && <span>{getModelDisplayName(entry.model)}</span>}
                        {sessionInfo?.kind && <span aria-hidden style={{ color: 'var(--border-strong)' }}>·</span>}
                        {sessionInfo?.kind && <span>{sessionInfo.kind}</span>}
                      </div>
                    </div>
                    <div className="text-right" style={{ flexShrink: 0 }}>
                      <div className="font-semibold" style={{ ...MONO, fontSize: 'var(--text-lg)' }}>{formatCost(entry.totalCost)}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', ...MONO }}>{formatNumber(entry.totalTokens)} tokens</div>
                    </div>
                  </div>
                  <div
                    className="grid grid-cols-4 gap-4"
                    style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-2)' }}
                  >
                    <div><span className="font-medium" style={{ color: 'var(--fg)', ...MONO }}>{entry.requestCount}</span> {t('requests')}</div>
                    <div><span className="font-medium" style={{ color: 'var(--fg)', ...MONO }}>{formatNumber(entry.inputTokens || 0)}</span> {t('inShort')}</div>
                    <div><span className="font-medium" style={{ color: 'var(--fg)', ...MONO }}>{formatNumber(entry.outputTokens || 0)}</span> {t('outShort')}</div>
                    <div>
                      {entry.totalTokens > 0
                        ? <span className="font-medium" style={{ color: 'var(--fg)', ...MONO }}>{formatCost(entry.totalCost / entry.requestCount)}</span>
                        : '—'
                      } {t('avgPerReq')}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Tasks View ──────────────────────────────────

function TasksView({ taskData, onRefresh }: { taskData: TaskCostsResponse | null; onRefresh: () => void }) {
  const t = useTranslations('costTracker')
  if (!taskData || taskData.tasks.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon" aria-hidden>⊙</div>
        <div className="empty-title">{t('noTaskCostData')}</div>
        <div className="empty-desc">{t('noTaskCostDataDesc')}</div>
        <div className="empty-cta">
          <button type="button" onClick={onRefresh} className="btn btn-sm">{t('refresh')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">{t('tasksWithCosts')}</div>
          <div className="stat-value">{taskData.tasks.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('attributedCost')}</div>
          <div className="stat-value" style={MONO}>{formatCost(taskData.summary.totalCost)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('attributedTokens')}</div>
          <div className="stat-value">{formatNumber(taskData.summary.totalTokens)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('unattributed')}</div>
          <div className="stat-value" style={MONO}>{formatCost(taskData.unattributed.totalCost)}</div>
          <div className="hint" style={{ marginTop: 'var(--space-1)' }}>unattributed spend</div>
        </div>
      </div>

      {/* Task list */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">{t('tasksByCost')}</h2>
          <span className="badge">{taskData.tasks.length}</span>
        </div>
        <div style={{ maxHeight: 600, overflowY: 'auto' }}>
          {taskData.tasks.map((task, idx) => (
            <div
              key={task.taskId}
              className="flex items-center justify-between"
              style={{
                padding: 'var(--space-3) var(--space-5)',
                borderBottom: idx < taskData.tasks.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="badge" style={{ flexShrink: 0 }}>{task.priority}</span>
                {task.project.ticketRef && (
                  <span style={{ fontSize: 'var(--text-xs)', ...MONO, color: 'var(--fg-subtle)', flexShrink: 0 }}>
                    {task.project.ticketRef}
                  </span>
                )}
                <span className="font-medium truncate" style={{ fontSize: 'var(--text-sm)' }}>{task.title}</span>
                <span className="badge" style={{ flexShrink: 0 }}>{task.status}</span>
              </div>
              <div className="text-right" style={{ flexShrink: 0, marginLeft: 'var(--space-3)' }}>
                <div className="font-medium" style={MONO}>{formatCost(task.stats.totalCost)}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', ...MONO }}>
                  {formatNumber(task.stats.totalTokens)} {t('tokens')} · {task.stats.requestCount} {t('reqs')}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
