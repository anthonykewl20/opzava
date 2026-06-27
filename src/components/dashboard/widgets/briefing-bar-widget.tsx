'use client'

import { formatTokensShort, type DashboardData } from '../widget-primitives'

export function BriefingBarWidget({ data }: { data: DashboardData }) {
  const {
    isLocal,
    activeSessions,
    onlineAgents,
    runningTasks,
    reviewCount,
    errorCount,
    claudeStats,
    memPct,
    sessions,
    connection,
    isSystemLoading,
    isClaudeLoading,
    subscriptionLabel,
    subscriptionPrice,
    navigateToPanel,
    dbStats,
    agents,
  } = data

  const totalTokens = (claudeStats?.total_input_tokens ?? 0) + (claudeStats?.total_output_tokens ?? 0)
  const costDisplay = subscriptionLabel
    ? (subscriptionPrice ? `$${subscriptionPrice}/mo` : 'Included')
    : `$${(claudeStats?.total_estimated_cost ?? 0).toFixed(2)}`

  const agentTotal = dbStats?.agents.total ?? agents.length

  return (
    <div className="card" style={{ padding: 'var(--space-3) var(--space-4)' }}>
      {/* Top row: key counts */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        <BriefingItem
          dot="success"
          onClick={() => navigateToPanel(isLocal ? 'sessions' : 'agents')}
        >
          {isLocal
            ? <><b>{activeSessions}</b> active session{activeSessions !== 1 ? 's' : ''}</>
            : <><b>{onlineAgents}</b>/<b>{agentTotal}</b> agents online</>
          }
        </BriefingItem>

        <BriefingItem
          dot="accent"
          onClick={() => navigateToPanel('tasks')}
        >
          <b>{runningTasks}</b> task{runningTasks !== 1 ? 's' : ''} running
        </BriefingItem>

        {reviewCount > 0 && (
          <BriefingItem
            dot="warning"
            onClick={() => navigateToPanel('tasks')}
          >
            <b>{reviewCount}</b> need{reviewCount === 1 ? 's' : ''} review
          </BriefingItem>
        )}

        {errorCount > 0 && (
          <BriefingItem
            dot="danger"
            onClick={() => navigateToPanel('logs')}
          >
            <b>{errorCount}</b> error{errorCount !== 1 ? 's' : ''}
          </BriefingItem>
        )}

        {!isLocal && (
          <BriefingItem dot={connection.isConnected ? 'success' : 'danger'}>
            Gateway {connection.isConnected ? 'connected' : 'disconnected'}
            {connection.latency != null && <span className="text-muted-foreground/60 ml-1">{connection.latency}ms</span>}
          </BriefingItem>
        )}
      </div>

      {/* Bottom row: secondary metrics */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-1.5 u-subtle" style={{ fontSize: 'var(--text-xs)' }}>
        <span>{sessions.length} session{sessions.length !== 1 ? 's' : ''} today</span>

        {isLocal && !isClaudeLoading && totalTokens > 0 && (
          <span>{formatTokensShort(totalTokens)} tokens</span>
        )}

        {isLocal && !isClaudeLoading && (
          <span>{costDisplay} spent</span>
        )}

        {!isSystemLoading && memPct != null && (
          <span className="inline-flex items-center gap-1.5">
            Memory {memPct}%
            <span className="progress" style={{ display: 'inline-block', width: 64 }}>
              <i style={{ width: `${Math.min(memPct, 100)}%`, background: memPct > 90 ? 'var(--danger)' : memPct > 70 ? 'var(--warning)' : 'var(--success)' }} />
            </span>
          </span>
        )}
      </div>
    </div>
  )
}

function BriefingItem({
  dot,
  onClick,
  children,
}: {
  dot: 'success' | 'accent' | 'warning' | 'danger'
  onClick?: () => void
  children: React.ReactNode
}) {
  const dotClass = {
    success: 'dot-success',
    accent: 'dot-accent',
    warning: 'dot-warning',
    danger: 'dot-danger',
  }[dot]

  const Tag = onClick ? 'button' : 'span'

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`inline-flex items-center gap-2 ${onClick ? 'cursor-pointer' : ''}`}
      style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)', background: 'none', border: 0 }}
    >
      <span className={`dot ${dotClass}`} aria-hidden="true" />
      <span className="[&>b]:font-semibold" style={{ color: 'var(--fg-muted)' }}>{children}</span>
    </Tag>
  )
}
