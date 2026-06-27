'use client'

import { useState } from 'react'
import { HealthRow, formatUptime, type DashboardData } from '../widget-primitives'

export function SystemHealthWidget({ data }: { data: DashboardData }) {
  const {
    memPct,
    diskPct,
    systemStats,
    isSystemLoading,
    localOsStatus,
    claudeHealth,
    codexHealth,
    hermesHealth,
    mcHealth,
    errorCount,
    connection,
    isLocal,
    gatewayHealthStatus,
  } = data

  const [expanded, setExpanded] = useState(false)

  if (isSystemLoading) {
    return (
      <div className="card" style={{ padding: '10px var(--space-4)' }}>
        <span className="u-subtle" style={{ fontSize: 'var(--text-xs)' }}>Loading system health…</span>
      </div>
    )
  }

  const cpuPct = systemStats?.cpu?.usage != null
    ? Math.round(systemStats.cpu.usage)
    : null

  const uptimeStr = systemStats?.uptime != null ? formatUptime(systemStats.uptime) : null

  // Determine overall health for trend arrow
  const memTrend = memPct != null && memPct > 80 ? 'up' : memPct != null && memPct < 50 ? 'down' : null

  return (
    <div className="card">
      {/* Compact bar */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex flex-wrap items-center gap-x-5 gap-y-1 u-muted"
        style={{ padding: '10px var(--space-4)', fontSize: 'var(--text-xs)', background: 'none', border: 0, textAlign: 'left' }}
      >
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--fw-semibold)', color: 'var(--fg)' }}>System</span>

        {cpuPct != null && (
          <span>CPU <span className="u-mono u-tnum" style={{ color: cpuPct > 80 ? 'var(--danger)' : cpuPct > 60 ? 'var(--warning)' : 'var(--fg)' }}>{cpuPct}%</span></span>
        )}

        {memPct != null && (
          <span className="inline-flex items-center gap-1">
            Mem <span className="u-mono u-tnum" style={{ color: memPct > 90 ? 'var(--danger)' : memPct > 70 ? 'var(--warning)' : 'var(--fg)' }}>{memPct}%</span>
            {memTrend === 'up' && <span style={{ color: 'var(--warning)' }}>▲</span>}
            {memTrend === 'down' && <span style={{ color: 'var(--success)' }}>▼</span>}
          </span>
        )}

        {Number.isFinite(diskPct) && (
          <span>Disk <span className="u-mono u-tnum" style={{ color: 'var(--fg)' }}>{diskPct}%</span></span>
        )}

        {uptimeStr && <span>Uptime <span className="u-mono u-tnum" style={{ color: 'var(--fg)' }}>{uptimeStr}</span></span>}

        <span className="inline-flex items-center gap-1">
          MC
          <span className={`dot ${errorCount > 0 ? 'dot-warning' : 'dot-success'}`} aria-hidden="true" />
          <span className="u-mono u-tnum" style={{ color: 'var(--fg)' }}>{errorCount > 0 ? `${errorCount} err` : 'OK'}</span>
        </span>

        <span className="ml-auto u-subtle">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-3 pt-1 space-y-2.5" style={{ borderTop: '1px solid var(--border)' }}>
          {isLocal ? (
            <>
              <HealthRow label="Local OS" value={localOsStatus.value} status={localOsStatus.status} />
              <HealthRow label="Claude Runtime" value={claudeHealth.value} status={claudeHealth.status} />
              <HealthRow label="Codex Runtime" value={codexHealth.value} status={codexHealth.status} />
              <HealthRow label="Hermes Runtime" value={hermesHealth.value} status={hermesHealth.status} />
              <HealthRow label="MC Core" value={mcHealth.value} status={mcHealth.status} />
            </>
          ) : (
            <>
              <HealthRow label="Gateway" value={connection.isConnected ? 'Connected' : 'Disconnected'} status={gatewayHealthStatus} />
              <HealthRow label="MC Core" value={mcHealth.value} status={mcHealth.status} />
            </>
          )}
          {memPct != null && (
            <HealthRow label="Memory" value={`${memPct}%`} status={memPct > 90 ? 'bad' : memPct > 70 ? 'warn' : 'good'} bar={memPct} />
          )}
          {systemStats?.disk && (
            <HealthRow label="Disk" value={systemStats.disk.usage || 'N/A'} status={parseInt(systemStats.disk.usage) > 90 ? 'bad' : 'good'} />
          )}
        </div>
      )}
    </div>
  )
}
