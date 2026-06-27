'use client'

import { useState, useEffect } from 'react'
import { apiFetch } from '@/lib/api-client'

interface RuntimeStatus {
  id: string
  name: string
  installed: boolean
  version?: string | null
  authRequired?: boolean
  authHint?: string
  authenticated?: boolean
}

interface Props {
  agentCount: number
  taskCount: number
  onNavigate: (panel: string) => void
}

export function EmptyStateLaunchpad({ agentCount, taskCount, onNavigate }: Props) {
  const [runtimes, setRuntimes] = useState<RuntimeStatus[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function detectRuntimes() {
      // Try the agent-runtimes API first, fall back to capabilities endpoint.
      // apiFetch throws on any non-2xx (unlike the original r.ok check), so each
      // call is wrapped in try/catch to preserve the original graceful degradation:
      // a failed agent-runtimes call falls through to capabilities detection, and a
      // failed capabilities call simply detects nothing.
      let runtimesPayload: { runtimes?: RuntimeStatus[] } | null = null
      try {
        runtimesPayload = await apiFetch<{ runtimes?: RuntimeStatus[] }>('/api/agent-runtimes')
      } catch {
        // Non-2xx / network error — degrade to fallback detection below.
        runtimesPayload = null
      }

      if (runtimesPayload?.runtimes) {
        if (!cancelled) setRuntimes(runtimesPayload.runtimes)
        return
      }

      // Fallback: use capabilities endpoint for detection
      let caps: Record<string, unknown> = {}
      try {
        caps = await apiFetch<Record<string, unknown>>('/api/status?action=capabilities')
      } catch {
        // Non-2xx / network error — detect nothing (original returned {} on !ok).
        caps = {}
      }

      const detected: RuntimeStatus[] = []
      if (caps.openclawHome) detected.push({ id: 'openclaw', name: 'OpenClaw', installed: true })
      if (caps.hermesInstalled) detected.push({ id: 'hermes', name: 'Hermes Agent', installed: true })
      if (caps.claudeHome) detected.push({ id: 'claude', name: 'Claude Code', installed: true })
      if (!cancelled) setRuntimes(detected)
    }

    detectRuntimes()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const installed = runtimes.filter(r => r.installed)
  const hasRuntimes = installed.length > 0
  const hasAgents = agentCount > 0
  const hasTasks = taskCount > 0

  // Hide once all steps complete
  if (hasAgents && hasTasks) return null
  // Don't flash before data loads
  if (!loaded) return null

  const completedCount = (hasRuntimes ? 1 : 0) + (hasAgents ? 1 : 0) + (hasTasks ? 1 : 0)

  return (
    <div className="card" style={{ padding: 'var(--space-6)' }}>
      <div className="text-center mb-6">
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--fw-semibold)', color: 'var(--fg)', marginBottom: 4 }}>Launch Sequence</h2>
        <p className="u-muted" style={{ fontSize: 'var(--text-sm)' }}>
          Complete each step to bring your station online.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Step 1: Runtimes */}
        <StepCard
          step={1}
          title="Agent Runtimes"
          done={hasRuntimes}
          active={!hasRuntimes}
          doneContent={
            <div className="space-y-1">
              {installed.map(r => (
                <div key={r.id} className="flex items-center justify-between" style={{ fontSize: 'var(--text-xs)' }}>
                  <div className="flex items-center gap-1.5" style={{ color: 'var(--success)' }}>
                    <span className="dot dot-success shrink-0" aria-hidden="true" />
                    {r.name}
                    {r.version && <span className="u-subtle">v{r.version}</span>}
                  </div>
                  {r.authRequired && !r.authenticated && (
                    <span style={{ color: 'var(--warning)' }}>{r.authHint || 'Not authenticated'}</span>
                  )}
                </div>
              ))}
              {installed.length < runtimes.length && (
                <button onClick={() => onNavigate('settings')} className="u-accent underline mt-1.5" style={{ fontSize: 'var(--text-xs)', background: 'none', border: 0, cursor: 'pointer' }}>
                  + Install more runtimes
                </button>
              )}
            </div>
          }
          pendingContent={
            <>
              <p className="u-muted mb-3" style={{ fontSize: 'var(--text-xs)' }}>
                Install a runtime to run agents on this machine.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm w-full"
                onClick={() => onNavigate('settings')}
              >
                Install Runtimes
              </button>
            </>
          }
        />

        {/* Step 2: Agent */}
        <StepCard
          step={2}
          title="Dock an Agent"
          done={hasAgents}
          active={hasRuntimes && !hasAgents}
          doneContent={
            <>
              <p className="mb-1" style={{ fontSize: 'var(--text-xs)', color: 'var(--success)' }}>Agent registered</p>
              <button
                className="u-muted"
                style={{ fontSize: 'var(--text-xs)', background: 'none', border: 0, cursor: 'pointer' }}
                onClick={() => onNavigate('agents')}
              >
                View fleet →
              </button>
            </>
          }
          pendingContent={
            <>
              <p className="u-muted mb-3" style={{ fontSize: 'var(--text-xs)' }}>
                Register your first agent. Choose a template and configure its capabilities.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm w-full"
                disabled={!hasRuntimes}
                onClick={() => onNavigate('agents')}
              >
                Create Agent
              </button>
            </>
          }
        />

        {/* Step 3: Task */}
        <StepCard
          step={3}
          title="Dispatch a Task"
          done={hasTasks}
          active={hasAgents && !hasTasks}
          doneContent={
            <>
              <p className="mb-1" style={{ fontSize: 'var(--text-xs)', color: 'var(--success)' }}>Tasks in queue</p>
              <button
                className="u-muted"
                style={{ fontSize: 'var(--text-xs)', background: 'none', border: 0, cursor: 'pointer' }}
                onClick={() => onNavigate('tasks')}
              >
                Open task board →
              </button>
            </>
          }
          pendingContent={
            <>
              <p className="u-muted mb-3" style={{ fontSize: 'var(--text-xs)' }}>
                Create a task and assign it to your agent.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm w-full"
                disabled={!hasAgents}
                onClick={() => onNavigate('tasks')}
              >
                Create Task
              </button>
            </>
          }
        />
      </div>

      {/* Progress bar */}
      <div className="mt-5 flex items-center gap-3">
        <div className="progress flex-1">
          <i
            style={{
              width: `${(completedCount / 3) * 100}%`,
              background: completedCount === 3 ? 'var(--success)' : 'var(--accent)',
            }}
          />
        </div>
        <span className="u-tnum u-mono" style={{ fontSize: 'var(--text-xs)', color: completedCount === 3 ? 'var(--success)' : 'var(--fg-subtle)' }}>
          {completedCount}/3
        </span>
      </div>
    </div>
  )
}

function StepCard({ step, title, done, active, doneContent, pendingContent }: {
  step: number
  title: string
  done: boolean
  active: boolean
  doneContent: React.ReactNode
  pendingContent: React.ReactNode
}) {
  return (
    <div
      style={{
        padding: 'var(--space-4)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        background: done ? 'var(--success-soft)' : active ? 'var(--accent-soft)' : 'var(--surface-2)',
        opacity: !done && !active ? 0.55 : 1,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="u-mono badge"
          style={{
            color: done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--fg-muted)',
            background: done ? 'var(--success-soft)' : active ? 'var(--accent-soft)' : 'var(--surface-3)',
          }}
        >
          {done ? '✓' : `0${step}`}
        </span>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--fw-medium)', color: 'var(--fg)' }}>{title}</span>
      </div>
      {done ? doneContent : pendingContent}
    </div>
  )
}
