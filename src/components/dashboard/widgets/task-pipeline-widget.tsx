'use client'

import type { DashboardData } from '../widget-primitives'

interface PipelineStage {
  label: string
  count: number
  dotClass: string
}

export function TaskPipelineWidget({ data }: { data: DashboardData }) {
  const { inboxCount, assignedCount, runningTasks, reviewCount, doneCount, navigateToPanel } = data

  const total = inboxCount + assignedCount + runningTasks + reviewCount + doneCount

  const stages: PipelineStage[] = [
    { label: 'Inbox', count: inboxCount, dotClass: 'dot' },
    { label: 'Assigned', count: assignedCount, dotClass: 'dot dot-accent' },
    { label: 'Running', count: runningTasks, dotClass: 'dot dot-warning is-running' },
    { label: 'Review', count: reviewCount, dotClass: 'dot dot-accent' },
    { label: 'Done', count: doneCount, dotClass: 'dot dot-success' },
  ]

  const hasBottleneck = reviewCount > 3

  if (total === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Task Pipeline</h3>
          <span className="u-mono u-subtle" style={{ fontSize: 'var(--text-xs)' }}>0 tasks</span>
        </div>
        <div className="card-body cursor-pointer" onClick={() => navigateToPanel('tasks')}>
          <p className="u-subtle text-center" style={{ fontSize: 'var(--text-sm)' }}>No tasks yet</p>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Task Pipeline</h3>
        <span className="u-mono u-subtle" style={{ fontSize: 'var(--text-xs)' }}>{total} total</span>
      </div>
      <div className="card-body cursor-pointer" onClick={() => navigateToPanel('tasks')}>
        {/* Stage pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {stages.map((stage, i) => {
            const hasItems = stage.count > 0
            return (
              <div key={stage.label} className="flex items-center gap-1.5">
                <span className="badge" style={hasItems ? undefined : { opacity: 0.5 }}>
                  {hasItems && <span className={stage.dotClass} aria-hidden="true" />}
                  <span>{stage.label}</span>
                  <span className="u-tnum">{stage.count}</span>
                </span>
                {i < stages.length - 1 && (
                  <svg className="w-3 h-3 shrink-0" style={{ color: 'var(--fg-subtle)' }} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                    <path d="M4 2l4 4-4 4" />
                  </svg>
                )}
              </div>
            )
          })}
        </div>

        {/* Bottleneck warning */}
        {hasBottleneck && (
          <p className="mt-2.5 flex items-center gap-1" style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)' }}>
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M8 2l6.5 11H1.5z" />
              <path d="M8 7v2.5M8 11.5v0" />
            </svg>
            {reviewCount} tasks waiting for review
          </p>
        )}
      </div>
    </div>
  )
}
