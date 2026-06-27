'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '@/lib/api-client'
import { useMissionControl } from '@/store'
import { useNavigateToPanel } from '@/lib/navigation'

interface ChecklistItem {
  id: string
  label: string
  checked: boolean
  panel?: string
}

export function OnboardingChecklistWidget() {
  const { agents, tasks, securityPosture } = useMissionControl()
  const navigateToPanel = useNavigateToPanel()
  const [visible, setVisible] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const [celebrating, setCelebrating] = useState(false)

  // Check if checklist should be visible
  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const onboardingData = await apiFetch<{
          completed?: boolean
          skipped?: boolean
          checklistDismissed?: boolean
        }>('/api/onboarding')
        if (cancelled) return

        const completed = onboardingData?.completed === true
        const skipped = onboardingData?.skipped === true
        const isDismissed = onboardingData?.checklistDismissed === true

        if (completed && !skipped && !isDismissed) {
          setVisible(true)
        } else {
          setVisible(false)
        }
      } catch {
        // Don't show on error
      }
    }
    check()
    return () => { cancelled = true }
  }, [])

  // Derive checklist items from real data
  const items: ChecklistItem[] = [
    { id: 'account', label: 'Account created', checked: true },
    { id: 'interface', label: 'Interface mode selected', checked: true },
    { id: 'credentials', label: 'Credentials reviewed', checked: true },
    { id: 'security', label: 'Run security scan', checked: !!securityPosture, panel: 'settings' },
    { id: 'agent', label: 'Dock your first agent', checked: agents.length > 0, panel: 'agents' },
    { id: 'task', label: 'Create your first task', checked: tasks.length > 0, panel: 'tasks' },
  ]

  const completedCount = items.filter(i => i.checked).length
  const allComplete = completedCount === items.length
  const progressPct = Math.round((completedCount / items.length) * 100)

  // Auto-celebrate when all complete
  useEffect(() => {
    if (allComplete && visible && !celebrating) {
      setCelebrating(true)
      const timer = setTimeout(async () => {
        try {
          await apiFetch('/api/onboarding', {
            method: 'POST',
            body: JSON.stringify({ action: 'dismiss_checklist' }),
          })
        } catch {}
        setVisible(false)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [allComplete, visible, celebrating])

  const handleDismiss = useCallback(async () => {
    setDismissing(true)
    try {
      await apiFetch('/api/onboarding', {
        method: 'POST',
        body: JSON.stringify({ action: 'dismiss_checklist' }),
      })
      setVisible(false)
    } catch {
      // silently fail
    } finally {
      setDismissing(false)
    }
  }, [])

  if (!visible) return null

  if (celebrating) {
    return (
      <section className="card text-center" style={{ padding: 'var(--space-6)' }}>
        <div className="u-accent" style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--fw-semibold)', marginBottom: 4 }}>Station Fully Operational</div>
        <p className="u-muted" style={{ fontSize: 'var(--text-sm)' }}>All systems online. You&apos;re ready to go.</p>
      </section>
    )
  }

  return (
    <section className="card" style={{ padding: 'var(--space-4)' }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="card-title">Setup Progress ({completedCount}/{items.length})</h3>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={dismissing}
          onClick={handleDismiss}
        >
          Dismiss
        </button>
      </div>

      {/* Progress bar */}
      <div className="progress" style={{ marginBottom: 'var(--space-4)' }}>
        <i style={{ width: `${progressPct}%` }} />
      </div>

      {/* Checklist */}
      <div className="space-y-1.5">
        {items.map(item => (
          <div
            key={item.id}
            className="flex items-center justify-between"
            style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', color: item.checked ? 'var(--fg-muted)' : 'var(--fg)' }}
          >
            <div className="flex items-center gap-2.5">
              <span className="u-mono" style={{ fontSize: 'var(--text-xs)', color: item.checked ? 'var(--success)' : 'var(--fg-subtle)' }}>
                [{item.checked ? 'x' : ' '}]
              </span>
              <span className={item.checked ? 'line-through' : ''}>{item.label}</span>
            </div>
            {!item.checked && item.panel && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => navigateToPanel(item.panel!)}
              >
                {'->'}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
