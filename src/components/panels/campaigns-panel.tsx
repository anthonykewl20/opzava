'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'

// Mirrors the Campaign aggregate served by /api/campaigns (status state machine
// lives server-side; this panel only displays state and requests transitions).
interface CampaignStep {
  stepId: string
  subject: string
  html: string
  offsetHours: number
}

interface Campaign {
  campaignId: string
  name: string
  status: 'draft' | 'approved' | 'sending' | 'sent' | 'failed'
  startAt: string
  steps: CampaignStep[]
  audience: { recipients: string[] }
  createdAt: string
  updatedAt: string
}

const STATUS_STYLES: Record<Campaign['status'], string> = {
  draft: 'bg-surface-1/40 text-muted-foreground border-border/30',
  approved: 'bg-void-cyan/10 text-void-cyan border-void-cyan/20',
  sending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  sent: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  failed: 'bg-red-500/10 text-red-400 border-red-500/20',
}

const inputClass =
  'w-full rounded-md border border-border/40 bg-surface-1/30 px-2.5 py-1.5 text-sm text-foreground ' +
  'placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-void-cyan/40 focus:border-void-cyan/40'

const emptyStep = (): CampaignStep => ({ stepId: '', subject: '', html: '', offsetHours: 0 })

function StatusPill({ status }: { status: Campaign['status'] }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium border ${STATUS_STYLES[status]}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {status}
    </span>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-foreground/90">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  )
}

function StepEditor({
  step,
  index,
  removable,
  onChange,
  onRemove,
}: {
  step: CampaignStep
  index: number
  removable: boolean
  onChange: (patch: Partial<CampaignStep>) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-md border border-border/20 bg-surface-1/10 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">Step {index + 1}</span>
        {removable && (
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-red-400"
            onClick={onRemove}
          >
            Remove
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          className={`${inputClass} sm:col-span-2`}
          placeholder="Subject"
          value={step.subject}
          onChange={(e) => onChange({ subject: e.target.value })}
        />
        <input
          type="number"
          min={0}
          className={inputClass}
          placeholder="Offset (hours)"
          value={step.offsetHours}
          onChange={(e) => onChange({ offsetHours: Number(e.target.value) })}
        />
      </div>
      <textarea
        className={`${inputClass} min-h-[60px] font-mono text-xs`}
        placeholder="<p>HTML body…</p>"
        value={step.html}
        onChange={(e) => onChange({ html: e.target.value })}
      />
    </div>
  )
}

interface ComposeState {
  name: string
  setName: (v: string) => void
  startAt: string
  setStartAt: (v: string) => void
  recipients: string
  setRecipients: (v: string) => void
  steps: CampaignStep[]
  setSteps: React.Dispatch<React.SetStateAction<CampaignStep[]>>
  recipientCount: number
  canCreate: boolean
  creating: boolean
  onCreate: () => void
}

function ComposeSection(props: ComposeState) {
  const { name, startAt, recipients, steps, setSteps } = props
  const updateStep = (i: number, patch: Partial<CampaignStep>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  return (
    <section className="rounded-lg border border-border/30 bg-surface-1/20 p-4 space-y-3">
      <h3 className="text-sm font-medium">Compose a draft</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Campaign name">
          <input
            className={inputClass}
            placeholder="July product launch"
            value={name}
            onChange={(e) => props.setName(e.target.value)}
          />
        </Field>
        <Field label="Start at" hint="The first step sends at this time; later steps offset from it.">
          <input
            type="datetime-local"
            className={inputClass}
            value={startAt}
            onChange={(e) => props.setStartAt(e.target.value)}
          />
        </Field>
      </div>
      <Field
        label="Recipients"
        hint="One address per line, or comma-separated. Duplicates are removed by the system."
      >
        <textarea
          className={`${inputClass} min-h-[64px] font-mono text-xs`}
          placeholder="a@example.com&#10;b@example.com"
          value={recipients}
          onChange={(e) => props.setRecipients(e.target.value)}
        />
      </Field>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-foreground/90">Steps</span>
          <button
            type="button"
            className="text-[11px] text-void-cyan hover:text-void-cyan/80"
            onClick={() => setSteps((p) => [...p, emptyStep()])}
          >
            + Add step
          </button>
        </div>
        {steps.map((s, i) => (
          <StepEditor
            key={i}
            step={s}
            index={i}
            removable={steps.length > 1}
            onChange={(patch) => updateStep(i, patch)}
            onRemove={() => setSteps((p) => p.filter((_, idx) => idx !== i))}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-[11px] text-muted-foreground">
          {props.recipientCount} recipient(s) · {steps.length} step(s)
        </p>
        <Button onClick={props.onCreate} disabled={!props.canCreate || props.creating}>
          {props.creating ? 'Creating…' : 'Create draft'}
        </Button>
      </div>
    </section>
  )
}

function CampaignList({
  campaigns,
  busyId,
  onApprove,
  onRun,
}: {
  campaigns: Campaign[]
  busyId: string | null
  onApprove: (id: string) => void
  onRun: (id: string) => void
}) {
  if (campaigns.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/30 bg-surface-1/10 p-6 text-center text-sm text-muted-foreground">
        No campaigns yet. Compose a draft above to get started.
      </div>
    )
  }
  return (
    <ul className="space-y-2">
      {campaigns.map((c) => (
        <li
          key={c.campaignId}
          className="rounded-lg border border-border/30 bg-surface-1/20 p-3 flex items-center justify-between gap-3"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{c.name}</span>
              <StatusPill status={c.status} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {c.steps.length} step(s) · {c.audience.recipients.length} recipient(s) · starts{' '}
              {new Date(c.startAt).toLocaleString()}
            </p>
          </div>
          {c.status === 'draft' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onApprove(c.campaignId)}
              disabled={busyId === c.campaignId}
            >
              {busyId === c.campaignId ? 'Approving…' : 'Approve'}
            </Button>
          )}
          {c.status === 'approved' && (
            <Button
              variant="success"
              size="sm"
              onClick={() => onRun(c.campaignId)}
              disabled={busyId === c.campaignId}
            >
              {busyId === c.campaignId ? 'Sending…' : 'Run'}
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}

export function CampaignsPanel() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const [name, setName] = useState('')
  const [startAt, setStartAt] = useState('')
  const [recipients, setRecipients] = useState('')
  const [steps, setSteps] = useState<CampaignStep[]>([emptyStep()])

  const showFeedback = useCallback((ok: boolean, text: string) => {
    setFeedback({ ok, text })
    setTimeout(() => setFeedback(null), 4000)
  }, [])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/campaigns')
      if (!res.ok) {
        setError('Failed to load campaigns')
        return
      }
      const data = await res.json()
      setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : [])
      setError(null)
    } catch {
      setError('Failed to load campaigns')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const recipientList = useMemo(
    () => recipients.split(/[\n,]/).map((r) => r.trim()).filter(Boolean),
    [recipients],
  )

  const resetForm = () => {
    setName('')
    setStartAt('')
    setRecipients('')
    setSteps([emptyStep()])
  }

  const createDraft = async () => {
    setCreating(true)
    try {
      const body = {
        name: name.trim(),
        startAt: startAt ? new Date(startAt).toISOString() : '',
        steps: steps.map((s, i) => ({
          stepId: s.stepId.trim() || `step-${i + 1}`,
          subject: s.subject.trim(),
          html: s.html,
          offsetHours: Number(s.offsetHours) || 0,
        })),
        audience: {
          schemaVersion: 1,
          audienceId: `aud-${Date.now()}`,
          name: name.trim() || 'Audience',
          recipients: recipientList,
          createdAt: new Date().toISOString(),
        },
      }
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showFeedback(false, err.error || 'Could not create the draft')
        return
      }
      resetForm()
      await load()
      showFeedback(true, 'Draft campaign created')
    } catch {
      showFeedback(false, 'Could not create the draft')
    } finally {
      setCreating(false)
    }
  }

  const approve = async (id: string) => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/campaigns/${id}/approve`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showFeedback(false, err.error || 'Could not approve the campaign')
        return
      }
      await load()
      showFeedback(true, 'Campaign approved')
    } catch {
      showFeedback(false, 'Could not approve the campaign')
    } finally {
      setBusyId(null)
    }
  }

  const run = async (id: string) => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/campaigns/${id}/run`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showFeedback(false, data.error || 'Could not run the campaign')
        return
      }
      await load()
      if (data.status === 'sent') {
        showFeedback(true, `Campaign sent (${data.sent}/${data.total})`)
      } else {
        showFeedback(false, `Campaign finished with failures (${data.sent}/${data.total} sent)`)
      }
    } catch {
      showFeedback(false, 'Could not run the campaign')
    } finally {
      setBusyId(null)
    }
  }

  const canCreate =
    name.trim().length > 0 &&
    startAt.length > 0 &&
    recipientList.length > 0 &&
    steps.every((s) => s.subject.trim() && s.html.trim())

  if (loading) {
    return <Loader variant="panel" label="Loading campaigns" />
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      <div>
        <h2 className="text-lg font-semibold">Campaigns</h2>
        <p className="text-sm text-muted-foreground">
          Compose an email campaign, review it, and approve it. Sending only begins after approval — the
          system owns scheduling, exactly-once delivery, and audit.
        </p>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-md text-sm border border-red-500/20 bg-red-500/10 text-red-400">
          {error}
        </div>
      )}

      <ComposeSection
        name={name}
        setName={setName}
        startAt={startAt}
        setStartAt={setStartAt}
        recipients={recipients}
        setRecipients={setRecipients}
        steps={steps}
        setSteps={setSteps}
        recipientCount={recipientList.length}
        canCreate={canCreate}
        creating={creating}
        onCreate={createDraft}
      />

      <section className="space-y-2">
        <h3 className="text-sm font-medium">All campaigns</h3>
        <CampaignList campaigns={campaigns} busyId={busyId} onApprove={approve} onRun={run} />
      </section>

      {feedback && (
        <div
          className={`fixed bottom-4 right-4 px-3 py-2 rounded-md text-sm border shadow-lg ${
            feedback.ok
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
              : 'border-red-500/20 bg-red-500/10 text-red-400'
          }`}
        >
          {feedback.text}
        </div>
      )}
    </div>
  )
}
