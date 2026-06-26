'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Loader } from '@/components/ui/loader'
import { useMissionControl } from '@/store'
import { useSmartPoll } from '@/lib/use-smart-poll'
import { useNavigateToPanel } from '@/lib/navigation'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

interface AuthEvent {
  id: number
  type: string
  actor: string
  ip: string
  timestamp: number
  detail: string
}

interface AgentTrust {
  agentId: number
  name: string
  trustScore: number
  flagged: boolean
  lastEval: number
}

interface SecretAlert {
  id: number
  file: string
  line: number
  type: string
  preview: string
  detectedAt: number
  resolved: boolean
}

interface ToolAuditEntry {
  tool: string
  calls: number
  successes: number
  failures: number
}

interface RateLimitSignal {
  ip: string
  hits: number
  agent?: string
  lastHit: number
}

interface InjectionAttempt {
  id: number
  type: string
  source: string
  input: string
  blocked: boolean
  timestamp: number
}

interface TimelinePoint {
  timestamp: string
  authEvents: number
  injectionAttempts: number
  secretAlerts: number
  toolCalls: number
}

interface EvalScore {
  layer: string
  score: number
  maxScore: number
}

interface AgentEval {
  agentId: number
  name: string
  scores: EvalScore[]
  convergence: number
  driftDetected: boolean
  lastEvalAt: number
}

type CheckSeverity = 'critical' | 'high' | 'medium' | 'low'

interface ScanCheck {
  id: string
  name: string
  status: 'pass' | 'fail' | 'warn'
  detail: string
  fix: string
  severity?: CheckSeverity
}

interface ScanCategory {
  score: number
  checks: ScanCheck[]
}

interface ScanData {
  score: number
  overall: string
  categories: Record<string, ScanCategory>
}

interface SecurityAuditData {
  posture: { score: number; level: string }
  scan?: ScanData
  authEvents: AuthEvent[]
  agentTrust: AgentTrust[]
  secretAlerts: SecretAlert[]
  toolAudit: ToolAuditEntry[]
  rateLimits: RateLimitSignal[]
  injectionAttempts: InjectionAttempt[]
  timeline: TimelinePoint[]
}

interface AgentEvalsData {
  agents: AgentEval[]
  overallConvergence: number
  driftAlerts: string[]
}

const SCAN_STATUS_ICON: Record<string, string> = { pass: '+', fail: 'x', warn: '!' }

/** Actor glyph: AI agents = ✦ (accent), system/unknown = ⚙ (subtle). Never colour. */
function actorInfo(actor: string): { glyph: string; isAI: boolean } {
  const lower = (actor || '').toLowerCase()
  if (!actor || lower === 'unknown' || lower === 'system' || lower === 'scheduler') {
    return { glyph: '⚙', isAI: false }
  }
  return { glyph: '✦', isAI: true }
}

function ScanCategoryRow({ label, icon, category, failingCount }: {
  label: string; icon: string; category: ScanCategory; failingCount: number
}) {
  const t = useTranslations('securityAudit')
  const [expanded, setExpanded] = useState(false)
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 text-left"
        style={{ background: 'none', border: 'none', padding: 'var(--space-2) var(--space-3)', cursor: 'pointer', color: 'var(--fg)', font: 'inherit' }}
      >
        <span
          className="flex items-center justify-center flex-none"
          style={{ width: 22, height: 22, borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}
        >
          {icon}
        </span>
        <span className="flex-1 font-medium" style={{ fontSize: 'var(--text-sm)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {category.score}%
        </span>
        {failingCount > 0 && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>
            {t('issueCount', { count: failingCount })}
          </span>
        )}
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)', padding: 'var(--space-2) var(--space-3)' }}>
          {[...category.checks].sort((a, b) => {
            if (a.status === 'pass' && b.status !== 'pass') return 1
            if (a.status !== 'pass' && b.status === 'pass') return -1
            const sev: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
            return (sev[a.severity ?? 'medium'] ?? 2) - (sev[b.severity ?? 'medium'] ?? 2)
          }).map(check => (
            <div key={check.id} className="flex items-start gap-2 py-1">
              <span
                className="flex-none"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', width: 20, marginTop: 2 }}
              >
                [{SCAN_STATUS_ICON[check.status]}]
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>{check.name}</span>
                  {check.severity && <span className="badge">{check.severity}</span>}
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', marginTop: 2 }}>{check.detail}</p>
                {check.fix && check.status !== 'pass' && (
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', marginTop: 2 }}>
                    {t('fixPrefix', { fix: check.fix })}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function SecurityAuditPanel() {
  const t = useTranslations('securityAudit')
  const { setSecurityPosture } = useMissionControl()
  const navigateToPanel = useNavigateToPanel()

  const [selectedTimeframe, setSelectedTimeframe] = useState<'hour' | 'day' | 'week' | 'month'>('day')
  const [data, setData] = useState<SecurityAuditData | null>(null)
  const [evalsData, setEvalsData] = useState<AgentEvalsData | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [auditRes, evalsRes] = await Promise.all([
        fetch(`/api/security-audit?timeframe=${selectedTimeframe}`),
        fetch(`/api/agents/evals?timeframe=${selectedTimeframe}`),
      ])
      if (auditRes.ok) {
        const audit = await auditRes.json()
        // API returns authEvents as { loginFailures, tokenRotations, accessDenials, recentEvents }
        // but the panel expects authEvents to be an array of AuthEvent
        if (audit.authEvents && !Array.isArray(audit.authEvents)) {
          const events = audit.authEvents.recentEvents || []
          audit.authEvents = events.map((e: any, i: number) => ({
            id: i,
            type: (e.event_type || '').replace('auth.', ''),
            actor: e.agent_name || 'unknown',
            ip: e.ip_address || '',
            timestamp: e.created_at || 0,
            detail: e.detail || '',
          }))
        }
        // agentTrust: { agents: [...], flaggedCount } → AgentTrust[]
        if (audit.agentTrust && !Array.isArray(audit.agentTrust)) {
          const agents = audit.agentTrust.agents || []
          const flaggedThreshold = 0.8
          audit.agentTrust = agents.map((a: any, i: number) => ({
            agentId: i,
            name: a.name,
            trustScore: a.score,
            flagged: a.score < flaggedThreshold,
          }))
        }
        // secretExposures → secretAlerts
        if (audit.secretExposures && !audit.secretAlerts) {
          const recent = audit.secretExposures.recent || []
          audit.secretAlerts = recent.map((e: any, i: number) => ({
            id: i,
            file: e.detail || '',
            line: 0,
            type: (e.event_type || '').replace('secret.', ''),
            preview: e.detail || '',
            detectedAt: e.created_at || 0,
            resolved: false,
          }))
        }
        if (!Array.isArray(audit.secretAlerts)) audit.secretAlerts = []
        // mcpAudit → toolAudit
        if (audit.mcpAudit && !audit.toolAudit) {
          const topTools = audit.mcpAudit.topTools || []
          audit.toolAudit = topTools.map((t: any) => ({
            tool: t.name,
            calls: t.count,
            successes: t.count,
            failures: 0,
          }))
        }
        if (!Array.isArray(audit.toolAudit)) audit.toolAudit = []
        // rateLimits: { totalHits, byIp } → RateLimitSignal[]
        if (audit.rateLimits && !Array.isArray(audit.rateLimits)) {
          const byIp = audit.rateLimits.byIp || []
          audit.rateLimits = byIp.map((r: any) => ({
            ip: r.ip,
            hits: r.count,
            lastHit: 0,
          }))
        }
        // injectionAttempts: { total, recent } → InjectionAttempt[]
        if (audit.injectionAttempts && !Array.isArray(audit.injectionAttempts)) {
          const recent = audit.injectionAttempts.recent || []
          audit.injectionAttempts = recent.map((e: any, i: number) => ({
            id: i,
            type: (e.event_type || '').replace('injection.', ''),
            source: e.agent_name || e.ip_address || 'unknown',
            input: e.detail || '',
            blocked: true,
            timestamp: e.created_at || 0,
          }))
        }
        // timeline: [{timestamp, eventCount, severity}] → [{timestamp, authEvents, ...}]
        if (Array.isArray(audit.timeline)) {
          audit.timeline = audit.timeline.map((t: any) => ({
            timestamp: t.timestamp,
            authEvents: t.eventCount || 0,
            injectionAttempts: 0,
            secretAlerts: 0,
            toolCalls: 0,
          }))
        }
        setData(audit)
        if (audit.posture) {
          setSecurityPosture(audit.posture)
        }
      }
      if (evalsRes.ok) {
        const evals = await evalsRes.json()
        setEvalsData(evals)
      }
    } catch {
      // Silent failure — data will remain stale
    } finally {
      setIsLoading(false)
    }
  }, [selectedTimeframe, setSecurityPosture])

  useSmartPoll(fetchData, 30_000)

  const formatTime = (ts: number) => new Date(ts * 1000).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })

  void navigateToPanel

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
          <div className="flex gap-1">
            {(['hour', 'day', 'week', 'month'] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setSelectedTimeframe(tf)}
                className={`btn btn-sm${selectedTimeframe === tf ? ' btn-primary' : ''}`}
              >
                {t(`timeframe${tf.charAt(0).toUpperCase() + tf.slice(1)}` as 'timeframeHour' | 'timeframeDay' | 'timeframeWeek' | 'timeframeMonth')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!data ? (
        <div className="flex items-center justify-center py-16">
          <Loader variant="panel" label={t('loadingSecurityData')} />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Posture + scan stat grid */}
          <div className="stat-grid">
            <div className="stat">
              <div className="stat-label">{t('securityPosture')}</div>
              <div className="stat-value">{data.posture.score}</div>
              <div className="hint" style={{ marginTop: 'var(--space-1)' }}>{data.posture.level}</div>
            </div>
            {data.scan && (
              <div className="stat">
                <div className="stat-label">{t('infrastructureScan')}</div>
                <div className="stat-value">
                  {data.scan.score}
                  <span className="font-medium" style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)' }}>/100</span>
                </div>
                <div className="hint" style={{ marginTop: 'var(--space-1)' }}>{data.scan.overall}</div>
              </div>
            )}
            <div className="stat">
              <div className="stat-label">{t('agentTrustScores')}</div>
              <div className="stat-value flex items-center" style={{ gap: 'var(--space-2)' }}>
                {data.agentTrust.filter(a => a.flagged).length}
                {data.agentTrust.filter(a => a.flagged).length > 0 && (
                  <span className="dot dot-warning" aria-hidden />
                )}
              </div>
              <div className="hint" style={{ marginTop: 'var(--space-1)' }}>{t('flagged')}</div>
            </div>
          </div>

          {/* Infrastructure scan categories */}
          {data.scan && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">{t('infrastructureScan')}</h2>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--fg-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {data.scan.score}/100
                </span>
              </div>
              <div className="card-body space-y-2">
                {Object.entries(data.scan.categories).map(([key, cat]) => {
                  const scanCategoryLabels: Record<string, string> = {
                    credentials: t('scanCredentials'),
                    network: t('scanNetwork'),
                    openclaw: t('scanOpenclaw'),
                    runtime: t('scanRuntime'),
                    os: t('scanOs'),
                  }
                  const label = scanCategoryLabels[key] || key
                  const iconMap: Record<string, string> = { credentials: 'K', network: 'N', openclaw: 'O', runtime: 'R', os: 'S' }
                  const icon = iconMap[key] || key[0].toUpperCase()
                  const failing = cat.checks.filter(c => c.status !== 'pass')
                  return (
                    <ScanCategoryRow key={key} label={label} icon={icon} category={cat} failingCount={failing.length} />
                  )
                })}
              </div>
            </div>
          )}

          {/* Auth events + Agent trust */}
          <div className="grid lg:grid-cols-2 gap-5">
            {/* Auth events */}
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">{t('authEvents')}</h2>
                <span className="badge">{data.authEvents.length}</span>
              </div>
              {data.authEvents.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon" aria-hidden>⚡</div>
                  <div className="empty-title">{t('noAuthEvents')}</div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto', maxHeight: 256, overflowY: 'auto' }}>
                  <table className="table table-compact">
                    <caption style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
                      {t('authEvents')}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">{t('colType')}</th>
                        <th scope="col">{t('colActor')}</th>
                        <th scope="col">{t('colIP')}</th>
                        <th scope="col">{t('colTime')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.authEvents.map(evt => {
                        const { glyph, isAI } = actorInfo(evt.actor)
                        return (
                          <tr key={evt.id}>
                            <td>
                              <span className="badge">{evt.type.replace(/_/g, ' ')}</span>
                            </td>
                            <td>
                              <span className="flex items-center gap-1.5">
                                {isAI && <span className="sr-only">AI agent: </span>}
                                <span
                                  aria-hidden
                                  style={{
                                    color: isAI ? 'var(--accent)' : 'var(--fg-subtle)',
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: 'var(--text-base)',
                                    lineHeight: 1,
                                  }}
                                >
                                  {glyph}
                                </span>
                                <span style={{ fontSize: 'var(--text-xs)' }}>{evt.actor}</span>
                              </span>
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                              {evt.ip}
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>
                              {formatTime(evt.timestamp)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Agent trust scores */}
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">{t('agentTrustScores')}</h2>
              </div>
              {data.agentTrust.length === 0 ? (
                <div className="empty">
                  <div className="empty-title">{t('noAgentTrustData')}</div>
                </div>
              ) : (
                <div className="card-body space-y-3" style={{ maxHeight: 256, overflowY: 'auto' }}>
                  {data.agentTrust.map(agent => (
                    <div key={agent.agentId} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <span aria-hidden style={{ color: 'var(--accent)', fontSize: 'var(--text-base)', lineHeight: 1 }}>✦</span>
                          <span className="font-medium" style={{ fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>{agent.name}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          {agent.flagged && <span className="badge">{t('flagged')}</span>}
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', fontVariantNumeric: 'tabular-nums' }}>
                            {(agent.trustScore * 100).toFixed(0)}%
                          </span>
                        </span>
                      </div>
                      <div className="progress">
                        <i style={{ width: `${agent.trustScore * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Secret exposure alerts */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">{t('secretExposureAlerts')}</h2>
              {data.secretAlerts.filter(a => !a.resolved).length > 0 && (
                <span className="badge badge-danger">
                  {data.secretAlerts.filter(a => !a.resolved).length} {t('statusActive')}
                </span>
              )}
            </div>
            {data.secretAlerts.length === 0 ? (
              <div className="empty">
                <div className="empty-icon" aria-hidden>⚷</div>
                <div className="empty-title">{t('noSecretsDetected')}</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto', maxHeight: 200, overflowY: 'auto' }}>
                <table className="table table-compact">
                  <caption style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
                    {t('secretExposureAlerts')}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('colType')}</th>
                      <th scope="col">{t('colFile')}</th>
                      <th scope="col">{t('colPreview')}</th>
                      <th scope="col">{t('colStatus')}</th>
                      <th scope="col">{t('colDetected')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.secretAlerts.map(alert => (
                      <tr key={alert.id}>
                        <td><span className="badge">{alert.type}</span></td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                          {alert.file}:{alert.line}
                        </td>
                        <td
                          className="truncate"
                          style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', maxWidth: 192 }}
                        >
                          {alert.preview}
                        </td>
                        <td>
                          <span className="flex items-center gap-1.5" style={{ fontSize: 'var(--text-xs)' }}>
                            <span className={`dot ${alert.resolved ? 'dot-success' : 'dot-danger'}`} aria-hidden />
                            {alert.resolved ? t('statusResolved') : t('statusActive')}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>
                          {formatTime(alert.detectedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* MCP tool audit + rate limits */}
          <div className="grid lg:grid-cols-2 gap-5">
            {/* MCP tool audit bar chart */}
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">{t('mcpToolAudit')}</h2>
              </div>
              {data.toolAudit.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon" aria-hidden>⚙</div>
                  <div className="empty-title">{t('noToolUsageData')}</div>
                </div>
              ) : (
                <div className="card-body">
                  <div style={{ height: 192 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.toolAudit}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis
                          dataKey="tool"
                          angle={-45}
                          textAnchor="end"
                          height={60}
                          interval={0}
                          tick={{ fontSize: 10, fill: 'var(--fg-muted)' }}
                        />
                        <YAxis tick={{ fontSize: 10, fill: 'var(--fg-muted)' }} />
                        <Tooltip
                          contentStyle={{
                            background: 'var(--surface-2)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--fg)',
                            fontSize: 'var(--text-xs)',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }} />
                        <Bar dataKey="successes" stackId="a" fill="var(--success)" name={t('chartSuccess')} />
                        <Bar dataKey="failures" stackId="a" fill="var(--danger)" name={t('chartFailure')} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>

            {/* Rate limit / abuse signals */}
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">{t('rateLimitAbuseSignals')}</h2>
              </div>
              {data.rateLimits.length === 0 ? (
                <div className="empty">
                  <div className="empty-title">{t('noRateLimitSignals')}</div>
                </div>
              ) : (
                <div className="card-body space-y-2" style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {data.rateLimits.map((rl, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between"
                      style={{ padding: 'var(--space-2) var(--space-3)', background: 'var(--surface-2)', borderRadius: 'var(--radius-md)' }}
                    >
                      <div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--fg)' }}>
                          {rl.ip}
                        </span>
                        {rl.agent && (
                          <span style={{ marginLeft: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                            ({rl.agent})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="badge" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {t('hits', { hits: rl.hits })}
                        </span>
                        {rl.lastHit > 0 && (
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>
                            {formatTime(rl.lastHit)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Injection attempts */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">{t('injectionAttempts')}</h2>
              {data.injectionAttempts.filter(a => !a.blocked).length > 0 && (
                <span className="badge badge-danger">
                  {data.injectionAttempts.filter(a => !a.blocked).length} unblocked
                </span>
              )}
            </div>
            {data.injectionAttempts.length === 0 ? (
              <div className="empty">
                <div className="empty-icon" aria-hidden>⊘</div>
                <div className="empty-title">{t('noInjectionAttempts')}</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto', maxHeight: 200, overflowY: 'auto' }}>
                <table className="table table-compact">
                  <caption style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
                    {t('injectionAttempts')}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('colType')}</th>
                      <th scope="col">{t('colSource')}</th>
                      <th scope="col">{t('colInput')}</th>
                      <th scope="col">{t('colStatus')}</th>
                      <th scope="col">{t('colTime')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.injectionAttempts.map(attempt => (
                      <tr key={attempt.id}>
                        <td><span className="badge">{attempt.type}</span></td>
                        <td style={{ fontSize: 'var(--text-xs)', color: 'var(--fg)' }}>{attempt.source}</td>
                        <td
                          className="truncate"
                          style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', maxWidth: 192 }}
                        >
                          {attempt.input}
                        </td>
                        <td>
                          <span className="flex items-center gap-1.5" style={{ fontSize: 'var(--text-xs)' }}>
                            <span className={`dot ${attempt.blocked ? 'dot-success' : 'dot-danger'}`} aria-hidden />
                            {attempt.blocked ? t('statusBlocked') : t('statusPassed')}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>
                          {formatTime(attempt.timestamp)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Security timeline */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">{t('securityTimeline', { timeframe: selectedTimeframe })}</h2>
            </div>
            {data.timeline.length === 0 ? (
              <div className="empty">
                <div className="empty-title">{t('noTimelineData')}</div>
              </div>
            ) : (
              <div className="card-body">
                <div style={{ height: 256 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.timeline.map(p => ({
                      ...p,
                      time: new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--fg-muted)' }} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--fg-muted)' }} />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--surface-2)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          color: 'var(--fg)',
                          fontSize: 'var(--text-xs)',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }} />
                      <Line type="monotone" dataKey="authEvents" stroke="var(--chart-2)" strokeWidth={2} name={t('chartAuthEvents')} dot={false} />
                      <Line type="monotone" dataKey="injectionAttempts" stroke="var(--danger)" strokeWidth={2} name={t('chartInjections')} dot={false} />
                      <Line type="monotone" dataKey="secretAlerts" stroke="var(--warning)" strokeWidth={2} name={t('chartSecrets')} dot={false} />
                      <Line type="monotone" dataKey="toolCalls" stroke="var(--chart-3)" strokeWidth={2} name={t('chartToolCalls')} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* Agent eval dashboard */}
          {evalsData && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">{t('agentEvalDashboard')}</h2>
              </div>
              <div className="card-body">
                {/* Overall convergence + drift alerts */}
                <div className="flex items-start gap-5 mb-5">
                  <div>
                    <div className="stat-label">{t('overallConvergence')}</div>
                    <div className="stat-value" style={{ fontSize: 'var(--text-xl)' }}>
                      {evalsData.overallConvergence}%
                    </div>
                    <p className="hint" style={{ marginTop: 2 }}>{t('crossAgentAlignment')}</p>
                  </div>
                  {evalsData.driftAlerts.length > 0 && (
                    <div className="banner banner-warning flex-1" style={{ alignSelf: 'center' }}>
                      <span style={{ fontSize: 'var(--text-xs)' }}>
                        {evalsData.driftAlerts.join(' · ')}
                      </span>
                    </div>
                  )}
                </div>

                {/* Per-agent eval scores */}
                {evalsData.agents.length === 0 ? (
                  <div className="empty">
                    <div className="empty-title">{t('noEvalData')}</div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {evalsData.agents.map(agent => (
                      <div
                        key={agent.agentId}
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          padding: 'var(--space-4)',
                          background: 'var(--surface-2)',
                        }}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="flex items-center gap-2">
                            <span aria-hidden style={{ color: 'var(--accent)', fontSize: 'var(--text-base)', lineHeight: 1 }}>✦</span>
                            <span className="font-medium" style={{ fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
                              {agent.name}
                            </span>
                            {agent.driftDetected && <span className="badge">{t('drift')}</span>}
                          </span>
                          <span className="flex items-center gap-2">
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>{t('convergence')}</span>
                            <span className="font-semibold" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
                              {agent.convergence}%
                            </span>
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {agent.scores.map(s => (
                            <div key={s.layer} className="text-center">
                              <div
                                className="truncate"
                                style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', marginBottom: 'var(--space-1)' }}
                              >
                                {s.layer}
                              </div>
                              <div className="progress">
                                <i style={{ width: `${(s.score / s.maxScore) * 100}%` }} />
                              </div>
                              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', marginTop: 2 }}>
                                {s.score}/{s.maxScore}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
