'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'

// The virtual-company staff roster served by /api/team/agents. Agents are named
// role identities that own workflow steps the SYSTEM orchestrates.
interface AgentRole {
  agentId: string
  name: string
  department: string
  status: 'active' | 'planned' | 'paused'
  ownedStepIds: string[]
  responsibilities: string
  artifactCount?: number
  lastActiveAt?: string | null
  displayName?: string
  avatarEmoji?: string | null
  charter?: string | null
  preferredModel?: string | null
}

interface PipelineStep {
  stepId: string
  agentId: string | null
  agentName: string | null
}

const STATUS_STYLES: Record<AgentRole['status'], string> = {
  active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  planned: 'bg-surface-1/40 text-muted-foreground border-border/30',
  paused: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
}

function StatusPill({ status }: { status: AgentRole['status'] }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  )
}

function AgentCard({
  agent,
  busy,
  onToggle,
}: {
  agent: AgentRole
  busy: boolean
  onToggle: (agentId: string, status: AgentRole['status']) => void
}) {
  const dimmed = agent.status === 'planned'
  const toggleable = agent.status === 'active' || agent.status === 'paused'
  return (
    <div className={`rounded-lg border border-border/30 bg-surface-1/20 p-3 space-y-2 ${dimmed ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {agent.avatarEmoji && <span className="text-base shrink-0" aria-hidden>{agent.avatarEmoji}</span>}
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{agent.displayName ?? agent.name}</div>
            <div className="text-[10px] text-muted-foreground truncate">{agent.name}</div>
          </div>
        </div>
        <StatusPill status={agent.status} />
      </div>
      {agent.charter && <p className="text-[11px] text-foreground/80 italic">{agent.charter}</p>}
      <p className="text-[11px] text-muted-foreground">{agent.responsibilities}</p>
      {agent.preferredModel && (
        <span className="inline-flex items-center rounded-full border border-void-cyan/20 bg-void-cyan/10 px-2 py-0.5 text-[10px] font-medium text-void-cyan">
          {agent.preferredModel}
        </span>
      )}
      {agent.ownedStepIds.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {agent.ownedStepIds.map((step) => (
            <li
              key={step}
              className="rounded-full border border-void-cyan/20 bg-void-cyan/10 px-2 py-0.5 text-[10px] font-mono text-void-cyan"
            >
              {step}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[10px] text-muted-foreground/70 italic">No assigned steps yet.</p>
      )}
      {typeof agent.artifactCount === 'number' && agent.artifactCount > 0 && (
        <div className="pt-1.5 mt-1 border-t border-border/20 text-[11px] text-muted-foreground flex items-center justify-between gap-2">
          <span>
            {agent.artifactCount} artifact{agent.artifactCount === 1 ? '' : 's'} produced
          </span>
          {agent.lastActiveAt && (
            <span title={new Date(agent.lastActiveAt).toLocaleString()}>
              active {new Date(agent.lastActiveAt).toLocaleDateString()}
            </span>
          )}
        </div>
      )}
      {toggleable && (
        <div className="pt-1">
          <Button
            variant={agent.status === 'active' ? 'outline' : 'success'}
            size="xs"
            disabled={busy}
            onClick={() => onToggle(agent.agentId, agent.status)}
          >
            {busy ? '…' : agent.status === 'active' ? 'Pause' : 'Activate'}
          </Button>
        </div>
      )}
    </div>
  )
}

function DepartmentPipeline({ pipeline }: { pipeline: PipelineStep[] }) {
  if (pipeline.length === 0) {
    return null
  }
  return (
    <div className="rounded-lg border border-border/20 bg-surface-1/10 p-3">
      <div className="text-[11px] font-medium text-foreground/90 mb-2">Pipeline</div>
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {pipeline.map((step, i) => (
          <li key={step.stepId} className="flex items-center gap-1">
            <div className="rounded-md border border-border/30 bg-surface-1/30 px-2 py-1 leading-tight">
              <div className="text-[11px] font-mono text-foreground/90">{step.stepId}</div>
              <div className={`text-[10px] ${step.agentName ? 'text-void-cyan' : 'text-muted-foreground/60 italic'}`}>
                {step.agentName ?? 'unassigned'}
              </div>
            </div>
            {i < pipeline.length - 1 && <span className="text-muted-foreground/50 text-[11px]">→</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}

function DepartmentSection({
  department,
  agents,
  pipeline,
  busyId,
  onToggle,
}: {
  department: string
  agents: AgentRole[]
  pipeline: PipelineStep[]
  busyId: string | null
  onToggle: (agentId: string, status: AgentRole['status']) => void
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">{department}</h3>
        <span className="text-[11px] text-muted-foreground">
          {agents.length} agent{agents.length === 1 ? '' : 's'}
        </span>
      </div>
      <DepartmentPipeline pipeline={pipeline} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {agents.map((a) => (
          <AgentCard key={a.agentId} agent={a} busy={busyId === a.agentId} onToggle={onToggle} />
        ))}
      </div>
    </section>
  )
}

export function TeamDashboardPanel() {
  const [byDepartment, setByDepartment] = useState<Record<string, AgentRole[]>>({})
  const [pipelines, setPipelines] = useState<Record<string, PipelineStep[]>>({})
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/team/agents')
      if (!res.ok) {
        setError('Failed to load the team')
        return
      }
      const data = await res.json()
      setByDepartment(data.byDepartment ?? {})
      setPipelines(data.pipelines ?? {})
      setTotal(Array.isArray(data.agents) ? data.agents.length : 0)
      setError(null)
    } catch {
      setError('Failed to load the team')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const toggle = async (agentId: string, status: AgentRole['status']) => {
    const next = status === 'active' ? 'paused' : 'active'
    setBusyId(agentId)
    try {
      const res = await fetch(`/api/team/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Could not update the agent')
        return
      }
      setError(null)
      await load()
    } catch {
      setError('Could not update the agent')
    } finally {
      setBusyId(null)
    }
  }

  const departments = Object.keys(byDepartment)

  if (loading) {
    return <Loader variant="panel" label="Loading the team" />
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Team</h2>
          <p className="text-sm text-muted-foreground">
            Your virtual staff — AI agents organized by department. Each owns the workflow steps the system runs;
            the system still owns sequence, validation, approval, and audit.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          Refresh
        </Button>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-md text-sm border border-red-500/20 bg-red-500/10 text-red-400">
          {error}
        </div>
      )}

      {departments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/30 bg-surface-1/10 p-8 text-center text-sm text-muted-foreground">
          No agents yet.
        </div>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">
            {total} agent{total === 1 ? '' : 's'} across {departments.length} department
            {departments.length === 1 ? '' : 's'}
          </p>
          <div className="space-y-5">
            {departments.map((dept) => (
              <DepartmentSection
                key={dept}
                department={dept}
                agents={byDepartment[dept]}
                pipeline={pipelines[dept] ?? []}
                busyId={busyId}
                onToggle={toggle}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
