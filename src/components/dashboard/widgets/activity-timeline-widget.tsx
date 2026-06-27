'use client'

import type { DashboardData, LogLike } from '../widget-primitives'

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function getSourceLabel(source: string): string {
  if (source.includes('claude')) return 'Claude'
  if (source.includes('codex')) return 'Codex'
  if (source.includes('hermes')) return 'Hermes'
  if (source.includes('gateway')) return 'Gateway'
  if (source.includes('mc') || source.includes('mission')) return 'MC'
  return source.length > 10 ? source.slice(0, 10) : source
}

function getStatusBadge(log: LogLike): { label: string; className: string } {
  if (log.level === 'error') return { label: 'Error', className: 'badge-danger' }
  if (log.message.toLowerCase().includes('completed') || log.message.toLowerCase().includes('done'))
    return { label: 'Done', className: 'badge-success' }
  if (log.message.toLowerCase().includes('started') || log.message.toLowerCase().includes('running') || log.message.toLowerCase().includes('active'))
    return { label: 'Running', className: 'badge-accent' }
  if (log.message.toLowerCase().includes('idle') || log.message.toLowerCase().includes('waiting'))
    return { label: 'Idle', className: '' }
  if (log.level === 'warn')
    return { label: 'Warning', className: 'badge-warning' }
  return { label: 'Info', className: '' }
}

export function ActivityTimelineWidget({ data }: { data: DashboardData }) {
  const { mergedRecentLogs, isSessionsLoading } = data

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Activity</h3>
        <span className="live-indicator">
          <span className="dot dot-success live" aria-hidden="true" />
          Live
        </span>
      </div>
      <div className="max-h-[340px] overflow-y-auto" role="log" aria-label="Live system activity feed" aria-live="polite">
        {mergedRecentLogs.length === 0 ? (
          <div className="empty">
            <p className="empty-title" style={{ fontWeight: 'var(--fw-medium)' }}>
              {isSessionsLoading ? 'Loading activity…' : 'No activity yet'}
            </p>
            <p className="empty-desc">Agent events and task updates will appear here.</p>
          </div>
        ) : (
          <div>
            {mergedRecentLogs.map((log) => {
              const badge = getStatusBadge(log)
              return (
                <div
                  key={log.id}
                  className="flex items-start gap-3"
                  style={{ padding: '10px var(--space-5)', borderBottom: '1px solid var(--border)' }}
                >
                  {/* Time column */}
                  <span className="u-mono u-subtle shrink-0" style={{ fontSize: 'var(--text-xs)', width: 56, paddingTop: 2 }}>
                    {timeAgo(log.timestamp)}
                  </span>

                  {/* Source */}
                  <span className="u-muted shrink-0" style={{ fontSize: 'var(--text-xs)', width: 56, paddingTop: 2, fontWeight: 'var(--fw-medium)' }}>
                    {getSourceLabel(log.source)}
                  </span>

                  {/* Message */}
                  <p className="flex-1 min-w-0 break-words" style={{ fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
                    {log.message.length > 120 ? log.message.slice(0, 120) + '...' : log.message}
                  </p>

                  {/* Status badge */}
                  <span className={`badge ${badge.className} shrink-0`}>{badge.label}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
