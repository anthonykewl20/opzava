'use client'

import { useTranslations } from 'next-intl'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Loader } from '@/components/ui/loader'
import { useMissionControl, CronJob } from '@/store'
import { createClientLogger } from '@/lib/client-logger'
import { apiFetch, ApiError } from '@/lib/api-client'
import { TEMPLATE_PRIMARY_SONNET } from '@/lib/model-config'
const log = createClientLogger('CronManagement')
import { buildDayKey, getCronOccurrences } from '@/lib/cron-occurrences'
import { describeCronFrequency } from '@/lib/cron-utils'

interface DayJobSummary {
  job: CronJob
  runCount: number
  firstRunMs: number
}

/** Returns ✦ for AI agents, ⚙ for system/local runners. */
function agentGlyph(agentId: string): string {
  if (!agentId || agentId === 'mission-control-local') return '⚙'
  return '✦'
}

/** Maps a run status to a DS dot class + readable label (no traffic-light hue). */
function runStatusInfo(status?: string): { dotClass: string; label: string } {
  switch (status) {
    case 'success': return { dotClass: 'dot dot-success', label: 'OK' }
    case 'error':   return { dotClass: 'dot dot-danger',  label: 'Failed' }
    case 'running': return { dotClass: 'dot dot-accent is-running', label: 'Running' }
    default:        return { dotClass: 'dot', label: '—' }
  }
}

/**
 * Extract the human-readable error message from a thrown ApiError.
 * The API returns `{ error: string }` bodies on failure; apiFetch attaches
 * that parsed body to `err.payload` for 403/5xx. Falls back to the error
 * message (e.g. for 404/401 where no payload is attached).
 */
function extractApiErrorMessage(error: ApiError): string {
  const payload = error.payload
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof (payload as { error: unknown }).error === 'string'
  ) {
    return (payload as { error: string }).error
  }
  return error.message
}

interface NewJobForm {
  name: string
  schedule: string
  command: string
  description: string
  model: string
  staggerSeconds: string
}

interface FormErrors {
  name?: string
  schedule?: string
  command?: string
  model?: string
  staggerSeconds?: string
}

interface RunHistoryEntry {
  jobId: string
  status: string
  deliveryStatus?: string
  timestamp?: number
  startedAtMs?: number
  durationMs?: number
  error?: string
}

type ScheduleKindFilter = 'all' | 'at' | 'every' | 'cron'
type SortField = 'name' | 'schedule' | 'lastRun' | 'nextRun'
type SortDir = 'asc' | 'desc'

type CalendarViewMode = 'agenda' | 'day' | 'week' | 'month'

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function getWeekStart(date: Date): Date {
  const day = date.getDay()
  const diffToMonday = (day + 6) % 7
  return addDays(startOfDay(date), -diffToMonday)
}

function getMonthStartGrid(date: Date): Date {
  const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1)
  const day = firstOfMonth.getDay()
  return addDays(firstOfMonth, -day)
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }
const MUTED_MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)', color: 'var(--fg-subtle)', fontSize: 'var(--text-xs)' }

export function CronManagementPanel() {
  const t = useTranslations('cronManagement')
  const { cronJobs, setCronJobs, dashboardMode } = useMissionControl()
  const isLocalMode = dashboardMode === 'local'
  const [isLoading, setIsLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedJob, setSelectedJob] = useState<CronJob | null>(null)
  const [jobLogs, setJobLogs] = useState<any[]>([])
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [calendarView, setCalendarView] = useState<CalendarViewMode>('week')
  const [calendarDate, setCalendarDate] = useState<Date>(startOfDay(new Date()))
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date>(startOfDay(new Date()))
  const [searchQuery, setSearchQuery] = useState('')
  const [agentFilter, setAgentFilter] = useState('all')
  const [stateFilter, setStateFilter] = useState<'all' | 'enabled' | 'disabled'>('all')
  const [scheduleKindFilter, setScheduleKindFilter] = useState<ScheduleKindFilter>('all')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [runHistory, setRunHistory] = useState<RunHistoryEntry[]>([])
  const [runHistoryTotal, setRunHistoryTotal] = useState(0)
  const [runHistoryHasMore, setRunHistoryHasMore] = useState(false)
  const [runHistoryPage, setRunHistoryPage] = useState(1)
  const [runHistoryQuery, setRunHistoryQuery] = useState('')
  const [showRunHistory, setShowRunHistory] = useState(false)
  const [runDropdownJobId, setRunDropdownJobId] = useState<string | null>(null)
  const [newJob, setNewJob] = useState<NewJobForm>({
    name: '',
    schedule: '0 * * * *',
    command: '',
    description: '',
    model: '',
    staggerSeconds: '',
  })

  const formatRelativeTime = (timestamp: string | number, future = false) => {
    const now = new Date().getTime()
    const time = new Date(timestamp).getTime()
    const diff = future ? time - now : now - time

    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ${future ? 'from now' : 'ago'}`
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ${future ? 'from now' : 'ago'}`
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ${future ? 'from now' : 'ago'}`
    return future ? 'soon' : 'just now'
  }

  const loadCronJobs = useCallback(async () => {
    setIsLoading(true)
    try {
      const cronData = await apiFetch<{ jobs?: unknown }>('/api/cron?action=list')
      const cronList = Array.isArray(cronData.jobs) ? cronData.jobs : []

      if (!isLocalMode) {
        setCronJobs(cronList)
        return
      }

      const schedulerData = await apiFetch<{ tasks?: unknown }>('/api/scheduler')
      const schedulerTasks = Array.isArray(schedulerData.tasks) ? schedulerData.tasks : []
      const mappedSchedulerJobs: CronJob[] = schedulerTasks.map((task: any) => ({
        id: task.id,
        name: task.name || task.id || 'scheduler-task',
        schedule: 'system-managed automation',
        command: `Built-in local automation (${task.id || 'unknown'})`,
        agentId: 'mission-control-local',
        delivery: 'local',
        enabled: task.running ? true : !!task.enabled,
        lastRun: typeof task.lastRun === 'number' ? task.lastRun : undefined,
        nextRun: typeof task.nextRun === 'number' ? task.nextRun : undefined,
        lastStatus: task.running
          ? 'running'
          : (task.lastResult?.ok === false ? 'error' : (task.lastResult?.ok === true ? 'success' : undefined)),
      }))

      setCronJobs([...cronList, ...mappedSchedulerJobs])
    } catch (error) {
      log.error('Failed to load cron jobs:', error)
    } finally {
      setIsLoading(false)
    }
  }, [isLocalMode, setCronJobs])

  useEffect(() => {
    loadCronJobs()
  }, [loadCronJobs])

  useEffect(() => {
    const loadAvailableModels = async () => {
      try {
        const data = await apiFetch<{ models?: unknown }>('/api/status?action=models')
        const models = Array.isArray(data.models) ? data.models : []
        const names = models
          .map((model: any) => String(model.name || model.alias || '').trim())
          .filter(Boolean)
        setAvailableModels(Array.from(new Set<string>(names)))
      } catch {
        // Keep cron form usable even when model discovery is unavailable.
      }
    }
    loadAvailableModels()
  }, [])

  const validateForm = useCallback((form: NewJobForm): FormErrors => {
    const errors: FormErrors = {}
    if (!form.name.trim()) errors.name = 'Job name is required'
    if (!form.command.trim()) errors.command = 'Command is required'
    // Validate cron expression: should be 5 space-separated fields
    const cronParts = form.schedule.trim().split(/\s+/)
    if (cronParts.length !== 5) {
      errors.schedule = 'Must be 5 fields: minute hour day month weekday'
    } else {
      const cronFieldPattern = /^(\*|(\*\/\d+)|(\d+(-\d+)?(,\d+(-\d+)?)*))(\/\d+)?$/
      for (const part of cronParts) {
        if (!cronFieldPattern.test(part)) {
          errors.schedule = `Invalid cron field: "${part}"`
          break
        }
      }
    }
    // Validate model if provided
    if (form.model.trim() && availableModels.length > 0) {
      if (!availableModels.includes(form.model.trim())) {
        errors.model = `Unknown model. Available: ${availableModels.slice(0, 3).join(', ')}${availableModels.length > 3 ? '...' : ''}`
      }
    }
    // Validate stagger
    if (form.staggerSeconds.trim()) {
      const val = Number(form.staggerSeconds)
      if (!Number.isFinite(val) || val <= 0) {
        errors.staggerSeconds = 'Must be a positive number'
      }
    }
    return errors
  }, [availableModels])

  const cloneJob = async (job: CronJob) => {
    try {
      const result = await apiFetch<{ success?: boolean; error?: string }>('/api/cron', {
        method: 'POST',
        body: JSON.stringify({
          action: 'clone',
          jobId: job.id,
          jobName: job.name,
        })
      })
      if (result.success) {
        await loadCronJobs()
      } else {
        alert(`Failed to clone job: ${result.error}`)
      }
    } catch (error) {
      log.error('Failed to clone job:', error)
      if (error instanceof ApiError) {
        const payloadError = extractApiErrorMessage(error)
        if (error.code === 'NETWORK_ERROR') {
          alert('Network error occurred')
        } else {
          alert(`Failed to clone job: ${payloadError}`)
        }
      } else {
        alert('Network error occurred')
      }
    }
  }

  const loadRunHistory = useCallback(async (jobId: string, page = 1, query = '') => {
    try {
      const params = new URLSearchParams({
        action: 'history',
        jobId,
        page: String(page),
        ...(query ? { query } : {}),
      })
      const data = await apiFetch<{
        entries?: RunHistoryEntry[]
        total?: number
        hasMore?: boolean
      }>(`/api/cron?${params}`)
      if (page === 1) {
        setRunHistory(data.entries || [])
      } else {
        setRunHistory(prev => [...prev, ...(data.entries || [])])
      }
      setRunHistoryTotal(data.total || 0)
      setRunHistoryHasMore(data.hasMore || false)
      setRunHistoryPage(page)
    } catch (error) {
      log.error('Failed to load run history:', error)
    }
  }, [])

  const openRunHistory = (job: CronJob) => {
    setShowRunHistory(true)
    setRunHistory([])
    setRunHistoryPage(1)
    setRunHistoryQuery('')
    loadRunHistory(job.id || job.name, 1, '')
  }

  const loadJobLogs = async (job: CronJob) => {
    const isLocalAutomation = (job.delivery === 'local' && job.agentId === 'mission-control-local')
    if (isLocalAutomation) {
      const logs: Array<{ timestamp: number; message: string; level: string }> = []
      if (job.lastRun) {
        logs.push({
          timestamp: job.lastRun,
          message: `Last run recorded for ${job.name}`,
          level: job.lastStatus === 'error' ? 'error' : 'info',
        })
      }
      if (job.lastError) {
        logs.push({
          timestamp: job.lastRun || Date.now(),
          message: `Error: ${job.lastError}`,
          level: 'error',
        })
      }
      if (job.nextRun) {
        logs.push({
          timestamp: Date.now(),
          message: `Next scheduled run: ${new Date(job.nextRun).toLocaleString()}`,
          level: 'info',
        })
      }
      if (logs.length === 0) {
        logs.push({
          timestamp: Date.now(),
          message: 'No scheduler telemetry available yet for this local automation task',
          level: 'info',
        })
      }
      setJobLogs(logs)
      return
    }

    try {
      const data = await apiFetch<{ logs?: any[] }>(`/api/cron?action=logs&job=${encodeURIComponent(job.name)}`)
      setJobLogs(data.logs || [])
    } catch (error) {
      log.error('Failed to load job logs:', error)
      setJobLogs([])
    }
  }

  const toggleJob = async (job: CronJob) => {
    try {
      await apiFetch('/api/cron', {
        method: 'POST',
        body: JSON.stringify({
          action: 'toggle',
          jobName: job.name,
          enabled: !job.enabled
        })
      })
      await loadCronJobs() // Reload to get updated status
    } catch (error) {
      log.error('Failed to toggle job:', error)
      if (error instanceof ApiError && error.code !== 'NETWORK_ERROR') {
        alert(`Failed to toggle job: ${extractApiErrorMessage(error)}`)
      } else {
        alert('Network error occurred')
      }
    }
  }

  const triggerJob = async (job: CronJob, mode: 'force' | 'due' = 'force') => {
    const isLocalAutomation = (job.delivery === 'local' && job.agentId === 'mission-control-local')
    setRunDropdownJobId(null)
    try {
      if (isLocalAutomation) {
        // Original branched on (response.ok && result.ok) and reloaded jobs in
        // both the success and failure paths. apiFetch throws on non-2xx, so
        // surface the failure message from the thrown payload and still reload.
        try {
          const result = await apiFetch<{ ok?: boolean; message?: string; error?: string }>('/api/scheduler', {
            method: 'POST',
            body: JSON.stringify({ task_id: job.id }),
          })
          if (result.ok) {
            alert(`Local automation executed: ${result.message}`)
          } else {
            alert(`Local automation failed: ${result.error || result.message || 'Unknown error'}`)
          }
        } catch (localError) {
          if (localError instanceof ApiError && localError.code !== 'NETWORK_ERROR') {
            const payload = localError.payload as { error?: string; message?: string } | null
            alert(`Local automation failed: ${payload?.error || payload?.message || localError.message || 'Unknown error'}`)
          } else {
            throw localError
          }
        }
        await loadCronJobs()
        return
      }

      const result = await apiFetch<{ success?: boolean; stdout?: string; error?: string; stderr?: string }>('/api/cron', {
        method: 'POST',
        body: JSON.stringify({
          action: 'trigger',
          jobId: job.id,
          jobName: job.name,
          mode,
        })
      })

      if (result.success) {
        alert(`Job executed successfully:\n${result.stdout}`)
      } else {
        alert(`Job failed:\n${result.error}\n${result.stderr}`)
      }
    } catch (error) {
      log.error('Failed to trigger job:', error)
      // The cron-trigger endpoint signals logical failures with HTTP errors as
      // well as { success: false } bodies; surface the server message instead
      // of swallowing it as a generic network error.
      if (error instanceof ApiError && error.code !== 'NETWORK_ERROR') {
        const payload = error.payload as { error?: string; stderr?: string } | null
        alert(`Job failed:\n${payload?.error || error.message}\n${payload?.stderr || ''}`)
      } else {
        alert('Network error occurred')
      }
    }
  }

  const addJob = async () => {
    const errors = validateForm(newJob)
    setFormErrors(errors)
    if (Object.keys(errors).length > 0) return

    try {
      const staggerVal = newJob.staggerSeconds.trim() ? Number(newJob.staggerSeconds) : undefined
      await apiFetch('/api/cron', {
        method: 'POST',
        body: JSON.stringify({
          action: 'add',
          jobName: newJob.name,
          schedule: newJob.schedule,
          command: newJob.command,
          ...(newJob.model.trim() ? { model: newJob.model.trim() } : {}),
          ...(staggerVal && staggerVal > 0 ? { staggerSeconds: staggerVal } : {}),
        })
      })

      setNewJob({
        name: '',
        schedule: '0 * * * *',
        command: '',
        description: '',
        model: '',
        staggerSeconds: '',
      })
      setFormErrors({})
      setShowAddForm(false)
      await loadCronJobs()
    } catch (error) {
      log.error('Failed to add job:', error)
      if (error instanceof ApiError && error.code !== 'NETWORK_ERROR') {
        alert(`Failed to add job: ${extractApiErrorMessage(error)}`)
      } else {
        alert('Network error occurred')
      }
    }
  }

  const removeJob = async (job: CronJob) => {
    if (!confirm(`Are you sure you want to remove the job "${job.name}"?`)) {
      return
    }

    try {
      await apiFetch('/api/cron', {
        method: 'POST',
        body: JSON.stringify({
          action: 'remove',
          jobName: job.name
        })
      })

      await loadCronJobs()
      if (selectedJob?.name === job.name) {
        setSelectedJob(null)
      }
    } catch (error) {
      log.error('Failed to remove job:', error)
      if (error instanceof ApiError && error.code !== 'NETWORK_ERROR') {
        alert(`Failed to remove job: ${extractApiErrorMessage(error)}`)
      } else {
        alert('Network error occurred')
      }
    }
  }

  const handleJobSelect = (job: CronJob) => {
    setSelectedJob(job)
    loadJobLogs(job)
  }

  const predefinedSchedules = [
    { label: 'Every minute', value: '* * * * *' },
    { label: 'Every 5 minutes', value: '*/5 * * * *' },
    { label: 'Every hour', value: '0 * * * *' },
    { label: 'Every 6 hours', value: '0 */6 * * *' },
    { label: 'Daily at midnight', value: '0 0 * * *' },
    { label: 'Daily at 6 AM', value: '0 6 * * *' },
    { label: 'Weekly (Sunday)', value: '0 0 * * 0' },
    { label: 'Monthly (1st)', value: '0 0 1 * *' },
  ]

  const uniqueAgents = Array.from(
    new Set(
      cronJobs
        .map((job) => (job.agentId || '').trim())
        .filter(Boolean)
    )
  )

  const filteredJobs = cronJobs
    .filter((job) => typeof job.schedule === 'string' && job.schedule.length > 0)
    .filter((job) => {
      const query = searchQuery.trim().toLowerCase()
      const matchesQuery =
        !query ||
        job.name.toLowerCase().includes(query) ||
        job.command.toLowerCase().includes(query) ||
        (job.agentId || '').toLowerCase().includes(query) ||
        (job.model || '').toLowerCase().includes(query)

      const matchesAgent = agentFilter === 'all' || (job.agentId || '') === agentFilter
      const matchesState =
        stateFilter === 'all' ||
        (stateFilter === 'enabled' && job.enabled) ||
        (stateFilter === 'disabled' && !job.enabled)

      // Schedule kind filter: detect from the schedule string
      let matchesKind = true
      if (scheduleKindFilter !== 'all') {
        const sched = job.schedule.toLowerCase()
        if (scheduleKindFilter === 'cron') {
          // Standard 5-field cron
          matchesKind = sched.replace(/\s*\([^)]+\)$/, '').trim().split(/\s+/).length === 5
        } else if (scheduleKindFilter === 'every') {
          matchesKind = sched.startsWith('every') || sched.includes('*/')
        } else if (scheduleKindFilter === 'at') {
          matchesKind = sched.startsWith('at ') || /^\d{4}-/.test(sched)
        }
      }

      return matchesQuery && matchesAgent && matchesState && matchesKind
    })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      switch (sortField) {
        case 'name':
          return dir * a.name.localeCompare(b.name)
        case 'schedule':
          return dir * (a.schedule || '').localeCompare(b.schedule || '')
        case 'lastRun':
          return dir * ((a.lastRun || 0) - (b.lastRun || 0))
        case 'nextRun':
          return dir * ((a.nextRun || 0) - (b.nextRun || 0))
        default:
          return 0
      }
    })

  const dayStart = startOfDay(calendarDate)
  const dayEnd = addDays(dayStart, 1)

  const weekStart = getWeekStart(calendarDate)
  const weekDays = Array.from({ length: 7 }, (_, idx) => addDays(weekStart, idx))

  const monthGridStart = getMonthStartGrid(calendarDate)
  const monthDays = Array.from({ length: 42 }, (_, idx) => addDays(monthGridStart, idx))

  const calendarBounds = useMemo(() => {
    if (calendarView === 'day') {
      return { startMs: dayStart.getTime(), endMs: dayEnd.getTime() }
    }
    if (calendarView === 'week') {
      return { startMs: weekStart.getTime(), endMs: addDays(weekStart, 7).getTime() }
    }
    if (calendarView === 'month') {
      return { startMs: monthGridStart.getTime(), endMs: addDays(monthGridStart, 42).getTime() }
    }
    const agendaStart = Date.now()
    return { startMs: agendaStart, endMs: addDays(startOfDay(new Date()), 30).getTime() }
  }, [calendarView, dayEnd, dayStart, monthGridStart, weekStart])

  // Aggregate: unique jobs per day with run count (for week/month cells)
  const jobSummariesByDay = useMemo(() => {
    const dayMap = new Map<string, DayJobSummary[]>()
    for (const job of filteredJobs) {
      const occurrences = getCronOccurrences(job.schedule, calendarBounds.startMs, calendarBounds.endMs, 5000)

      // Fallback for unparseable schedules
      if (occurrences.length === 0 && typeof job.nextRun === 'number' && job.nextRun >= calendarBounds.startMs && job.nextRun < calendarBounds.endMs) {
        occurrences.push({ atMs: job.nextRun, dayKey: buildDayKey(new Date(job.nextRun)) })
      }

      // Group occurrences by day for this job
      const perDay = new Map<string, { count: number; firstMs: number }>()
      for (const occ of occurrences) {
        const existing = perDay.get(occ.dayKey)
        if (existing) {
          existing.count++
          if (occ.atMs < existing.firstMs) existing.firstMs = occ.atMs
        } else {
          perDay.set(occ.dayKey, { count: 1, firstMs: occ.atMs })
        }
      }

      for (const [dayKey, { count, firstMs }] of perDay) {
        const existing = dayMap.get(dayKey) || []
        existing.push({ job, runCount: count, firstRunMs: firstMs })
        dayMap.set(dayKey, existing)
      }
    }

    // Sort each day's jobs by first run time
    for (const [, summaries] of dayMap) {
      summaries.sort((a, b) => a.firstRunMs - b.firstRunMs)
    }
    return dayMap
  }, [calendarBounds.endMs, calendarBounds.startMs, filteredJobs])

  // Flat occurrence list for agenda view only (capped per job)
  const calendarOccurrences = useMemo(() => {
    if (calendarView !== 'agenda') return []
    const rows: Array<{ job: CronJob; atMs: number; dayKey: string }> = []
    for (const job of filteredJobs) {
      const occurrences = getCronOccurrences(job.schedule, calendarBounds.startMs, calendarBounds.endMs, 50)
      for (const occurrence of occurrences) {
        rows.push({ job, atMs: occurrence.atMs, dayKey: occurrence.dayKey })
      }
      if (occurrences.length === 0 && typeof job.nextRun === 'number' && job.nextRun >= calendarBounds.startMs && job.nextRun < calendarBounds.endMs) {
        rows.push({ job, atMs: job.nextRun, dayKey: buildDayKey(new Date(job.nextRun)) })
      }
    }
    rows.sort((a, b) => a.atMs - b.atMs)
    return rows.slice(0, 500)
  }, [calendarBounds.endMs, calendarBounds.startMs, calendarView, filteredJobs])

  const dayJobSummaries = jobSummariesByDay.get(buildDayKey(dayStart)) || []

  const jobsByWeekDay = weekDays.map((date) => ({
    date,
    jobs: jobSummariesByDay.get(buildDayKey(date)) || [],
  }))

  const jobsByMonthDay = monthDays.map((date) => ({
    date,
    jobs: jobSummariesByDay.get(buildDayKey(date)) || [],
  }))

  const selectedDayJobs = jobSummariesByDay.get(buildDayKey(selectedCalendarDate)) || []

  const moveCalendar = (direction: -1 | 1) => {
    setCalendarDate((prev) => {
      if (calendarView === 'day') return addDays(prev, direction)
      if (calendarView === 'week') return addDays(prev, direction * 7)
      if (calendarView === 'month') return new Date(prev.getFullYear(), prev.getMonth() + direction, 1)
      return addDays(prev, direction * 7)
    })
  }

  const calendarRangeLabel =
    calendarView === 'day'
      ? calendarDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
      : calendarView === 'week'
        ? `${formatDateLabel(weekDays[0])} - ${formatDateLabel(weekDays[6])}`
        : calendarDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  // Derived summary stats
  const enabledCount = cronJobs.filter(j => j.enabled).length
  const errorCount = cronJobs.filter(j => j.lastStatus === 'error').length

  // Pill style for calendar cells (neutral, no rainbow)
  const calPill: React.CSSProperties = {
    fontSize: 'var(--text-xs)',
    padding: '2px 6px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--surface-3)',
    color: 'var(--fg-muted)',
    border: '1px solid var(--border)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }

  return (
    <div className="opzava-ds p-6 space-y-6" style={{ background: 'var(--bg)', color: 'var(--fg)' }}>

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title font-semibold">{t('title')}</h1>
          <p className="page-sub">{t('subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadCronJobs}
            disabled={isLoading}
            className="btn"
          >
            {isLoading ? t('loading') : t('refresh')}
          </button>
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="btn btn-primary"
          >
            {t('addJob')}
          </button>
        </div>
      </div>

      {/* ── Glanceable stats ─────────────────────────────────────────── */}
      <section aria-label="Automation summary">
        <div className="stat-grid">
          <div className="stat">
            <div className="stat-label">Active</div>
            <div className="flex items-center gap-2">
              <span className="stat-value">{enabledCount}</span>
              {enabledCount > 0 && <span className="dot dot-success dot-beat" aria-hidden />}
            </div>
            <div className="stat-delta" style={{ color: 'var(--fg-subtle)' }}>
              of {cronJobs.length} enabled
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Schedules</div>
            <div className="stat-value">{cronJobs.length}</div>
            <div className="stat-delta" style={{ color: 'var(--fg-subtle)' }}>total cron jobs</div>
          </div>
          <div className="stat">
            <div className="stat-label">Failures</div>
            <div className="flex items-center gap-2">
              <span className="stat-value">{errorCount}</span>
              {errorCount > 0 && <span className="dot dot-danger" aria-hidden />}
            </div>
            <div className="stat-delta" style={{ color: 'var(--fg-subtle)' }}>last-status error</div>
          </div>
        </div>
      </section>

      <div className="space-y-4">

        {/* ── Calendar View ─────────────────────────────────────────── */}
        <section aria-labelledby="calendar-heading">
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title" id="calendar-heading">{t('calendarView')}</h2>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', marginTop: 2 }}>
                  {isLocalMode ? t('calendarViewDescLocal') : t('calendarViewDesc')}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <button type="button" onClick={() => moveCalendar(-1)} className="btn btn-sm">{t('prev')}</button>
                <button type="button" onClick={() => setCalendarDate(startOfDay(new Date()))} className="btn btn-sm">{t('today')}</button>
                <button type="button" onClick={() => moveCalendar(1)} className="btn btn-sm">{t('next')}</button>
                <span
                  className="font-medium ml-2"
                  style={{ fontSize: 'var(--text-sm)', color: 'var(--fg)' }}
                >
                  {calendarRangeLabel}
                </span>
              </div>
            </div>

            <div className="card-body space-y-4">
              {/* View mode tabs */}
              <div className="flex gap-1 flex-wrap">
                {(['agenda', 'day', 'week', 'month'] as CalendarViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setCalendarView(mode)}
                    className={`btn btn-sm ${calendarView === mode ? 'btn-primary' : ''}`}
                  >
                    {t(`calMode_${mode}` as any)}
                  </button>
                ))}
              </div>

              {/* Filters */}
              <div className="grid md:grid-cols-3 gap-3">
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className="input"
                  style={{ height: 36 }}
                />
                <select
                  value={agentFilter}
                  onChange={(e) => setAgentFilter(e.target.value)}
                  className="select"
                  style={{ height: 36 }}
                >
                  <option value="all">{t('allAgents')}</option>
                  {uniqueAgents.map((agentId) => (
                    <option key={agentId} value={agentId}>{agentId}</option>
                  ))}
                </select>
                <select
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value as 'all' | 'enabled' | 'disabled')}
                  className="select"
                  style={{ height: 36 }}
                >
                  <option value="all">{t('allStates')}</option>
                  <option value="enabled">{t('enabled')}</option>
                  <option value="disabled">{t('disabled')}</option>
                </select>
              </div>

              {/* Kind filter + sort */}
              <div className="flex flex-wrap gap-2 items-center">
                <div className="flex gap-1">
                  {(['all', 'cron', 'every', 'at'] as ScheduleKindFilter[]).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setScheduleKindFilter(kind)}
                      className={`btn btn-sm ${scheduleKindFilter === kind ? 'btn-primary' : ''}`}
                      style={{ fontSize: 'var(--text-xs)' }}
                    >
                      {kind === 'all' ? t('all') : kind}
                    </button>
                  ))}
                </div>
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as SortField)}
                  className="select"
                  style={{ height: 30, width: 'auto', minWidth: 130, fontSize: 'var(--text-xs)' }}
                >
                  <option value="name">{t('sortName')}</option>
                  <option value="schedule">{t('sortSchedule')}</option>
                  <option value="lastRun">{t('sortLastRun')}</option>
                  <option value="nextRun">{t('sortNextRun')}</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                  className="btn btn-sm"
                  style={{ fontSize: 'var(--text-xs)' }}
                >
                  {sortDir === 'asc' ? t('ascending') : t('descending')}
                </button>
              </div>

              {/* Agenda view */}
              {calendarView === 'agenda' && (
                <div className="card" style={{ overflow: 'hidden' }}>
                  <div className="max-h-80 overflow-y-auto">
                    {calendarOccurrences.length === 0 ? (
                      <div className="empty">
                        <div className="empty-icon" aria-hidden>⏰</div>
                        <div className="empty-title">{t('noJobsMatchFilters')}</div>
                      </div>
                    ) : (
                      calendarOccurrences.map((row) => (
                        <button
                          key={`agenda-${row.job.id || row.job.name}-${row.atMs}`}
                          type="button"
                          onClick={() => handleJobSelect(row.job)}
                          className="w-full text-left"
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 'var(--space-3)',
                            padding: 'var(--space-3) var(--space-5)',
                            background: 'none',
                            border: 0,
                            borderBottom: '1px solid var(--border)',
                            cursor: 'pointer',
                            color: 'var(--fg)',
                          } as React.CSSProperties}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                          <div>
                            <div className="font-medium" style={{ fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
                              {row.job.name}
                            </div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                              <span aria-hidden>{agentGlyph(row.job.agentId || '')}</span>{' '}
                              {row.job.agentId || 'system'} · {row.job.enabled ? t('enabled') : t('disabled')} ·{' '}
                              <span style={MONO}>{row.job.schedule}</span>
                            </div>
                          </div>
                          <div style={MUTED_MONO}>
                            {new Date(row.atMs).toLocaleString()}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Day view */}
              {calendarView === 'day' && (
                <div
                  className="card"
                  style={{ padding: 'var(--space-3)' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>
                      {t('uniqueJobs', { count: dayJobSummaries.length })}
                    </span>
                  </div>
                  {dayJobSummaries.length === 0 ? (
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)' }}>{t('noJobsForDay')}</div>
                  ) : (
                    <div className="space-y-1.5 max-h-96 overflow-y-auto">
                      {dayJobSummaries.map((row) => (
                        <button
                          key={`day-${row.job.id || row.job.name}`}
                          type="button"
                          onClick={() => handleJobSelect(row.job)}
                          className="w-full text-left"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 'var(--space-2)',
                            padding: 'var(--space-2) var(--space-3)',
                            background: 'var(--surface-2)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-md)',
                            cursor: 'pointer',
                            color: 'var(--fg)',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                        >
                          <div className="min-w-0 flex-1">
                            <div
                              className="font-medium truncate"
                              style={{ fontSize: 'var(--text-sm)', color: 'var(--fg)' }}
                            >
                              {row.job.name}
                            </div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                              <span aria-hidden>{agentGlyph(row.job.agentId || '')}</span>{' '}
                              {row.job.agentId || 'system'} · {describeCronFrequency(row.job.schedule)}
                            </div>
                          </div>
                          <div style={{ ...MUTED_MONO, whiteSpace: 'nowrap' }}>
                            {row.runCount > 1
                              ? t('runsCount', { count: row.runCount })
                              : new Date(row.firstRunMs).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Week view */}
              {calendarView === 'week' && (
                <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
                  {jobsByWeekDay.map(({ date, jobs }) => {
                    const totalRuns = jobs.reduce((sum, j) => sum + j.runCount, 0)
                    const isSelected = isSameDay(date, selectedCalendarDate)
                    const isToday = isSameDay(date, new Date())
                    return (
                      <div
                        key={`week-${date.toISOString()}`}
                        onClick={() => setSelectedCalendarDate(startOfDay(date))}
                        style={{
                          borderRadius: 'var(--radius-lg)',
                          border: `1px solid ${isSelected ? 'var(--accent-border)' : 'var(--border)'}`,
                          padding: 'var(--space-2)',
                          minHeight: 144,
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          background: isSelected ? 'var(--accent-soft)' : 'transparent',
                        }}
                        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isSelected ? 'var(--accent-soft)' : 'transparent' }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className="font-medium"
                            style={{
                              fontSize: 'var(--text-xs)',
                              color: isToday ? 'var(--accent)' : 'var(--fg-muted)',
                            }}
                          >
                            {date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}
                          </span>
                          {jobs.length > 0 && (
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>
                              {t('jobCount', { count: jobs.length })}
                            </span>
                          )}
                        </div>
                        <div className="space-y-1 flex-1 overflow-hidden">
                          {jobs.slice(0, 5).map((row) => (
                            <div
                              key={`week-job-${row.job.id || row.job.name}`}
                              style={calPill}
                              title={`${row.job.name} — ${t('runsCount', { count: row.runCount })}`}
                            >
                              {row.job.name}
                            </div>
                          ))}
                          {jobs.length > 5 && (
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>
                              {t('moreJobs', { count: jobs.length - 5 })}
                            </div>
                          )}
                        </div>
                        {totalRuns > 0 && (
                          <div
                            style={{
                              fontSize: 'var(--text-xs)',
                              color: 'var(--fg-subtle)',
                              marginTop: 4,
                              paddingTop: 4,
                              borderTop: '1px solid var(--border)',
                            }}
                          >
                            {t('totalRunsCount', { count: totalRuns })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Month view */}
              {calendarView === 'month' && (
                <div className="grid grid-cols-7 gap-2">
                  {jobsByMonthDay.map(({ date, jobs }) => {
                    const inCurrentMonth = date.getMonth() === calendarDate.getMonth()
                    const totalRuns = jobs.reduce((sum, j) => sum + j.runCount, 0)
                    const isSelected = isSameDay(date, selectedCalendarDate)
                    const isToday = isSameDay(date, new Date())
                    return (
                      <div
                        key={`month-${date.toISOString()}`}
                        onClick={() => setSelectedCalendarDate(startOfDay(date))}
                        style={{
                          border: `1px solid ${isSelected ? 'var(--accent-border)' : 'var(--border)'}`,
                          borderRadius: 'var(--radius-lg)',
                          padding: 'var(--space-2)',
                          minHeight: 96,
                          cursor: 'pointer',
                          background: isSelected
                            ? 'var(--accent-soft)'
                            : inCurrentMonth
                              ? 'transparent'
                              : 'var(--surface-2)',
                          opacity: inCurrentMonth ? 1 : 0.6,
                        }}
                        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)' }}
                        onMouseLeave={e => {
                          const bg = isSelected ? 'var(--accent-soft)' : inCurrentMonth ? 'transparent' : 'var(--surface-2)'
                          ;(e.currentTarget as HTMLDivElement).style.background = bg
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={isToday ? 'font-semibold' : ''}
                            style={{
                              fontSize: 'var(--text-xs)',
                              color: isToday ? 'var(--accent)' : inCurrentMonth ? 'var(--fg)' : 'var(--fg-subtle)',
                            }}
                          >
                            {date.getDate()}
                          </span>
                          {jobs.length > 0 && (
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>
                              {jobs.length}
                            </span>
                          )}
                        </div>
                        <div className="space-y-0.5 mt-1">
                          {jobs.slice(0, 3).map((row) => (
                            <div
                              key={`month-job-${row.job.id || row.job.name}`}
                              style={{ ...calPill, fontSize: '11px', padding: '1px 4px' }}
                              title={`${row.job.name} — ${t('runsCount', { count: row.runCount })}`}
                            >
                              {row.job.name}
                            </div>
                          ))}
                          {jobs.length > 3 && (
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>
                              {t('moreJobs', { count: jobs.length - 3 })}
                            </div>
                          )}
                        </div>
                        {totalRuns > 0 && jobs.length > 0 && (
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)', marginTop: 2 }}>
                            {t('runsCount', { count: totalRuns })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Selected day drill-down (day / week / month) */}
              {calendarView !== 'agenda' && (
                <div className="card" style={{ padding: 'var(--space-3)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
                      {selectedCalendarDate.toLocaleDateString(undefined, {
                        weekday: 'long', month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>
                        {t('jobCount', { count: selectedDayJobs.length })}
                      </span>
                      {selectedDayJobs.length > 0 && (
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>
                          · {t('totalRunsCount', { count: selectedDayJobs.reduce((s, r) => s + r.runCount, 0) })}
                        </span>
                      )}
                    </div>
                  </div>
                  {selectedDayJobs.length === 0 ? (
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)' }}>{t('noJobsForDay')}</div>
                  ) : (
                    <div className="space-y-1.5 max-h-72 overflow-y-auto">
                      {selectedDayJobs.map((row) => (
                        <button
                          key={`selected-day-${row.job.id || row.job.name}`}
                          type="button"
                          onClick={() => handleJobSelect(row.job)}
                          className="w-full text-left"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 'var(--space-2)',
                            padding: 'var(--space-2) var(--space-3)',
                            background: 'var(--surface-2)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-md)',
                            cursor: 'pointer',
                            color: 'var(--fg)',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                        >
                          <div className="min-w-0 flex-1">
                            <div
                              className="font-medium truncate"
                              style={{ fontSize: 'var(--text-sm)', color: 'var(--fg)' }}
                            >
                              {row.job.name}
                            </div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                              <span aria-hidden>{agentGlyph(row.job.agentId || '')}</span>{' '}
                              {row.job.agentId || 'system'} · {describeCronFrequency(row.job.schedule)}
                            </div>
                          </div>
                          <div className="text-right" style={{ whiteSpace: 'nowrap' }}>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg)' }}>
                              {t('runsCount', { count: row.runCount })}
                            </div>
                            <div style={MUTED_MONO}>
                              {t('firstRun', { time: new Date(row.firstRunMs).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) })}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Scheduled Jobs table ──────────────────────────────────── */}
        <section aria-labelledby="jobs-heading">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title" id="jobs-heading">{t('scheduledJobs')}</h2>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>
                {t('jobsCount', { count: filteredJobs.length, total: cronJobs.length })}
              </span>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center" style={{ height: 128 }}>
                <Loader variant="inline" label={t('loadingJobs')} />
              </div>
            ) : cronJobs.length === 0 ? (
              <div className="empty">
                <div className="empty-icon" aria-hidden>⏱</div>
                <div className="empty-title">{t('noCronJobsFound')}</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-compact">
                  <caption className="sr-only">{t('scheduledJobs')}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('colJobName')}</th>
                      <th scope="col">{t('colAgent')}</th>
                      <th scope="col">{t('colSchedule')}</th>
                      <th scope="col">{t('colModel')}</th>
                      <th scope="col">{t('colStatus')}</th>
                      <th scope="col">{t('colLastRun')}</th>
                      <th scope="col">{t('colNextRun')}</th>
                      <th scope="col" className="num">{t('colActions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredJobs.map((job, index) => {
                      const isLocalAutomation = job.delivery === 'local' && job.agentId === 'mission-control-local'
                      const isSelected = selectedJob?.name === job.name
                      const { dotClass: lastDotClass, label: lastLabel } = runStatusInfo(job.lastStatus)
                      return (
                        <tr
                          key={`${job.name}-${index}`}
                          onClick={() => handleJobSelect(job)}
                          style={{
                            cursor: 'pointer',
                            background: isSelected ? 'var(--accent-soft)' : undefined,
                          }}
                        >
                          <td>
                            <div className="flex items-center gap-2">
                              <span className={`dot ${job.enabled ? 'dot-success' : ''}`} aria-hidden />
                              <span className="font-medium truncate" style={{ maxWidth: 192, fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
                                {job.name}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                              <span
                                aria-hidden
                                style={{
                                  color: isLocalAutomation ? 'var(--fg-subtle)' : 'var(--accent)',
                                  marginRight: 4,
                                }}
                              >
                                {agentGlyph(job.agentId || '')}
                              </span>
                              {job.agentId || 'system'}
                            </span>
                          </td>
                          <td>
                            <div>
                              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg)' }}>
                                {describeCronFrequency(job.schedule)}
                              </span>
                              <div style={{ ...MONO, fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>
                                {job.schedule}
                              </div>
                            </div>
                          </td>
                          <td>
                            {job.model ? (
                              <span style={{ ...MONO, fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                                {job.model}
                              </span>
                            ) : (
                              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>—</span>
                            )}
                          </td>
                          <td>
                            {job.lastStatus ? (
                              <span className="flex items-center gap-1.5">
                                <span className={lastDotClass} aria-hidden />
                                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                                  {lastLabel}
                                </span>
                              </span>
                            ) : (
                              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>—</span>
                            )}
                          </td>
                          <td>
                            <span style={MUTED_MONO}>
                              {job.lastRun ? formatRelativeTime(job.lastRun) : '—'}
                            </span>
                          </td>
                          <td>
                            <span style={{ ...MUTED_MONO, color: 'var(--fg-muted)' }}>
                              {job.nextRun ? formatRelativeTime(job.nextRun, true) : '—'}
                            </span>
                          </td>
                          <td className="num">
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); toggleJob(job) }}
                                disabled={isLocalAutomation}
                                className="btn btn-sm"
                                style={{ fontSize: 'var(--text-xs)', height: 26, padding: '0 8px' }}
                              >
                                {job.enabled ? t('disable') : t('enable')}
                              </button>
                              <div style={{ position: 'relative' }}>
                                <div className="flex">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); triggerJob(job, 'force') }}
                                    className="btn btn-sm"
                                    style={{
                                      fontSize: 'var(--text-xs)',
                                      height: 26,
                                      padding: '0 8px',
                                      borderRadius: 'var(--radius-md) 0 0 var(--radius-md)',
                                      borderRight: 0,
                                    }}
                                  >
                                    {t('run')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setRunDropdownJobId(prev => prev === (job.id || job.name) ? null : (job.id || job.name))
                                    }}
                                    className="btn btn-sm"
                                    style={{
                                      fontSize: 'var(--text-xs)',
                                      height: 26,
                                      padding: '0 6px',
                                      borderRadius: '0 var(--radius-md) var(--radius-md) 0',
                                    }}
                                    aria-label="More run options"
                                  >
                                    ▾
                                  </button>
                                </div>
                                {runDropdownJobId === (job.id || job.name) && (
                                  <div
                                    style={{
                                      position: 'absolute',
                                      right: 0,
                                      top: 30,
                                      zIndex: 100,
                                      background: 'var(--surface)',
                                      border: '1px solid var(--border)',
                                      borderRadius: 'var(--radius-md)',
                                      boxShadow: 'var(--shadow-md)',
                                      minWidth: 140,
                                      padding: '4px 0',
                                    }}
                                  >
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); triggerJob(job, 'force') }}
                                      style={{
                                        display: 'block',
                                        width: '100%',
                                        textAlign: 'left',
                                        padding: '6px 12px',
                                        fontSize: 'var(--text-xs)',
                                        color: 'var(--fg)',
                                        background: 'none',
                                        border: 0,
                                        cursor: 'pointer',
                                      }}
                                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                                    >
                                      {t('runNowForce')}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); triggerJob(job, 'due') }}
                                      style={{
                                        display: 'block',
                                        width: '100%',
                                        textAlign: 'left',
                                        padding: '6px 12px',
                                        fontSize: 'var(--text-xs)',
                                        color: 'var(--fg)',
                                        background: 'none',
                                        border: 0,
                                        cursor: 'pointer',
                                      }}
                                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                                    >
                                      {t('runNowIfDue')}
                                    </button>
                                  </div>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); cloneJob(job) }}
                                disabled={isLocalAutomation}
                                className="btn btn-sm"
                                style={{ fontSize: 'var(--text-xs)', height: 26, padding: '0 8px' }}
                              >
                                {t('clone')}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleJobSelect(job); openRunHistory(job) }}
                                className="btn btn-sm"
                                style={{ fontSize: 'var(--text-xs)', height: 26, padding: '0 8px' }}
                              >
                                {t('history')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* ── Job Detail ────────────────────────────────────────────── */}
        {selectedJob && (
          <section aria-labelledby="detail-heading">
            <div className="card">
              <div className="card-header">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="card-title" id="detail-heading">{selectedJob.name}</h2>
                  <span className="flex items-center gap-1.5">
                    <span className={`dot ${selectedJob.enabled ? 'dot-success' : ''}`} aria-hidden />
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                      {selectedJob.enabled ? t('enabled') : t('disabled')}
                    </span>
                  </span>
                  {selectedJob.lastStatus && (
                    <span className="flex items-center gap-1.5">
                      <span className={runStatusInfo(selectedJob.lastStatus).dotClass} aria-hidden />
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                        {runStatusInfo(selectedJob.lastStatus).label}
                      </span>
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedJob(null)}
                  className="btn btn-ghost btn-sm"
                >
                  {t('close')}
                </button>
              </div>

              <div className="card-body">
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Left: Configuration */}
                  <div className="space-y-4">
                    <div>
                      <div className="section-label" style={{ padding: '0 0 var(--space-2)' }}>
                        {t('configuration')}
                      </div>
                      <div
                        className="space-y-3"
                        style={{
                          background: 'var(--surface-2)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          padding: 'var(--space-4)',
                        }}
                      >
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '100px 1fr',
                            gap: 4,
                            fontSize: 'var(--text-sm)',
                          }}
                        >
                          <span style={{ color: 'var(--fg-muted)' }}>{t('colSchedule')}</span>
                          <div>
                            <code style={{ ...MONO, color: 'var(--fg)' }}>{selectedJob.schedule}</code>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                              {describeCronFrequency(selectedJob.schedule)}
                            </div>
                          </div>
                        </div>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '100px 1fr',
                            gap: 4,
                            fontSize: 'var(--text-sm)',
                          }}
                        >
                          <span style={{ color: 'var(--fg-muted)' }}>{t('colAgent')}</span>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                            <span aria-hidden style={{ color: selectedJob.agentId === 'mission-control-local' ? 'var(--fg-subtle)' : 'var(--accent)', marginRight: 4 }}>
                              {agentGlyph(selectedJob.agentId || '')}
                            </span>
                            {selectedJob.agentId || 'system'}
                          </span>
                        </div>
                        {selectedJob.model && (
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '100px 1fr',
                              gap: 4,
                              fontSize: 'var(--text-sm)',
                            }}
                          >
                            <span style={{ color: 'var(--fg-muted)' }}>{t('colModel')}</span>
                            <code style={{ ...MONO, fontSize: 'var(--text-xs)', color: 'var(--fg)' }}>
                              {selectedJob.model}
                            </code>
                          </div>
                        )}
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '100px 1fr',
                            gap: 4,
                            fontSize: 'var(--text-sm)',
                          }}
                        >
                          <span style={{ color: 'var(--fg-muted)' }}>{t('delivery')}</span>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg)' }}>
                            {selectedJob.delivery || 'gateway'}
                          </span>
                        </div>
                        {selectedJob.delivery === 'local' && selectedJob.agentId === 'mission-control-local' && (
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '100px 1fr',
                              gap: 4,
                              fontSize: 'var(--text-sm)',
                            }}
                          >
                            <span style={{ color: 'var(--fg-muted)' }}>{t('source')}</span>
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg)' }}>
                              {t('localSchedulerAutomation')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="section-label" style={{ padding: '0 0 var(--space-2)' }}>
                        {t('command')}
                      </div>
                      <pre
                        style={{
                          ...MONO,
                          fontSize: 'var(--text-xs)',
                          color: 'var(--fg)',
                          background: 'var(--surface-2)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          padding: 'var(--space-4)',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                          overflowX: 'auto',
                          maxHeight: 128,
                        }}
                      >
                        {selectedJob.command}
                      </pre>
                    </div>

                    <div>
                      <div className="section-label" style={{ padding: '0 0 var(--space-2)' }}>
                        {t('timing')}
                      </div>
                      <div
                        className="space-y-2"
                        style={{
                          background: 'var(--surface-2)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          padding: 'var(--space-4)',
                        }}
                      >
                        {selectedJob.lastRun && (
                          <div className="flex justify-between" style={{ fontSize: 'var(--text-sm)' }}>
                            <span style={{ color: 'var(--fg-muted)' }}>{t('lastRun')}</span>
                            <span style={MUTED_MONO}>
                              {new Date(selectedJob.lastRun).toLocaleString()} ({formatRelativeTime(selectedJob.lastRun)})
                            </span>
                          </div>
                        )}
                        {selectedJob.nextRun && (
                          <div className="flex justify-between" style={{ fontSize: 'var(--text-sm)' }}>
                            <span style={{ color: 'var(--fg-muted)' }}>{t('nextRun')}</span>
                            <span style={{ ...MUTED_MONO, color: 'var(--accent)' }}>
                              {new Date(selectedJob.nextRun).toLocaleString()} ({formatRelativeTime(selectedJob.nextRun, true)})
                            </span>
                          </div>
                        )}
                        {selectedJob.timezone && (
                          <div className="flex justify-between" style={{ fontSize: 'var(--text-sm)' }}>
                            <span style={{ color: 'var(--fg-muted)' }}>{t('timezone')}</span>
                            <span style={{ color: 'var(--fg)', fontSize: 'var(--text-xs)' }}>
                              {selectedJob.timezone}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => triggerJob(selectedJob, 'force')}
                        className="btn btn-sm"
                      >
                        {t('runNowForce')}
                      </button>
                      <button
                        type="button"
                        onClick={() => triggerJob(selectedJob, 'due')}
                        className="btn btn-sm"
                      >
                        {t('runNowIfDue')}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleJob(selectedJob)}
                        disabled={selectedJob.delivery === 'local' && selectedJob.agentId === 'mission-control-local'}
                        className="btn btn-sm"
                      >
                        {selectedJob.enabled ? t('disable') : t('enable')}
                      </button>
                      <button
                        type="button"
                        onClick={() => cloneJob(selectedJob)}
                        disabled={selectedJob.delivery === 'local' && selectedJob.agentId === 'mission-control-local'}
                        className="btn btn-sm"
                      >
                        {t('clone')}
                      </button>
                      <button
                        type="button"
                        onClick={() => openRunHistory(selectedJob)}
                        className="btn btn-sm"
                      >
                        {t('history')}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeJob(selectedJob)}
                        disabled={selectedJob.delivery === 'local' && selectedJob.agentId === 'mission-control-local'}
                        className="btn btn-danger btn-sm"
                      >
                        {t('remove')}
                      </button>
                    </div>
                  </div>

                  {/* Right: Logs */}
                  <div>
                    <div className="section-label" style={{ padding: '0 0 var(--space-2)' }}>
                      {t('recentLogs')}
                    </div>
                    <div
                      style={{
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        padding: 'var(--space-4)',
                        maxHeight: 320,
                        overflowY: 'auto',
                      }}
                    >
                      {jobLogs.length === 0 ? (
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)' }}>
                          {t('noLogsAvailable')}
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {jobLogs.map((logEntry, index) => (
                            <div key={index} style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', ...MONO }}>
                              <span style={{ color: 'var(--fg-subtle)' }}>
                                [{new Date(logEntry.timestamp).toLocaleString()}]
                              </span>{' '}
                              {logEntry.message}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Run History ───────────────────────────────────────────── */}
        {showRunHistory && selectedJob && (
          <section aria-labelledby="history-heading">
            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title" id="history-heading">
                    {t('runHistoryTitle', { name: selectedJob.name })}
                  </h2>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>
                    {t('totalRuns', { count: runHistoryTotal })}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRunHistory(false)}
                  className="btn btn-ghost btn-sm"
                >
                  {t('close')}
                </button>
              </div>

              <div className="card-body">
                <div style={{ marginBottom: 'var(--space-3)' }}>
                  <input
                    value={runHistoryQuery}
                    onChange={(e) => {
                      setRunHistoryQuery(e.target.value)
                      loadRunHistory(selectedJob.id || selectedJob.name, 1, e.target.value)
                    }}
                    placeholder={t('filterRunsPlaceholder')}
                    className="input"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="table table-compact">
                  <caption className="sr-only">{t('runHistoryTitle', { name: selectedJob.name })}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('colStatus')}</th>
                      <th scope="col">{t('delivery')}</th>
                      <th scope="col">{t('timestamp')}</th>
                      <th scope="col">{t('duration')}</th>
                      <th scope="col">{t('error')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runHistory.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', color: 'var(--fg-muted)' }}>
                          {t('noRunHistoryAvailable')}
                        </td>
                      </tr>
                    ) : (
                      runHistory.map((entry, idx) => {
                        const ts = entry.timestamp || entry.startedAtMs
                        const { dotClass, label } = runStatusInfo(entry.status)
                        return (
                          <tr key={idx}>
                            <td>
                              <span className="flex items-center gap-1.5">
                                <span className={dotClass} aria-hidden />
                                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                                  {label}
                                </span>
                              </span>
                            </td>
                            <td style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                              {entry.deliveryStatus || '—'}
                            </td>
                            <td style={MUTED_MONO}>
                              {ts ? new Date(ts).toLocaleString() : '—'}
                            </td>
                            <td style={MUTED_MONO}>
                              {entry.durationMs ? `${(entry.durationMs / 1000).toFixed(1)}s` : '—'}
                            </td>
                            <td
                              className="truncate"
                              style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)', maxWidth: 256 }}
                            >
                              {entry.error || ''}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {runHistoryHasMore && (
                <div className="card-footer" style={{ textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => loadRunHistory(selectedJob.id || selectedJob.name, runHistoryPage + 1, runHistoryQuery)}
                    className="btn btn-sm"
                  >
                    {t('loadMore')}
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Claude Code Teams ─────────────────────────────────────── */}
        <ClaudeCodeTeamsSection />

      </div>

      {/* ── Add Job Modal ─────────────────────────────────────────── */}
      {showAddForm && (
        <div className="scrim">
          <div className="modal" style={{ padding: 'var(--space-6)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
              {t('addNewCronJob')}
            </h2>

            <div className="space-y-4">
              {/* Job name */}
              <div className="field">
                <label className="label">{t('fieldJobName')}</label>
                <input
                  type="text"
                  value={newJob.name}
                  onChange={(e) => setNewJob(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., daily-backup, system-check"
                  className="input"
                  style={formErrors.name ? { borderColor: 'var(--danger)' } : {}}
                />
                {formErrors.name && (
                  <div className="hint" style={{ color: 'var(--danger)' }}>{formErrors.name}</div>
                )}
              </div>

              {/* Schedule */}
              <div className="field">
                <label className="label">{t('fieldSchedule')}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newJob.schedule}
                    onChange={(e) => setNewJob(prev => ({ ...prev, schedule: e.target.value }))}
                    placeholder="0 * * * *"
                    className="input"
                    style={{
                      flex: 1,
                      ...MONO,
                      ...(formErrors.schedule ? { borderColor: 'var(--danger)' } : {}),
                    }}
                  />
                  <select
                    value=""
                    onChange={(e) => e.target.value && setNewJob(prev => ({ ...prev, schedule: e.target.value }))}
                    className="select"
                    style={{ width: 'auto' }}
                  >
                    <option value="">{t('quickSelect')}</option>
                    {predefinedSchedules.map((sched) => (
                      <option key={sched.value} value={sched.value}>{sched.label}</option>
                    ))}
                  </select>
                </div>
                {formErrors.schedule ? (
                  <div className="hint" style={{ color: 'var(--danger)' }}>{formErrors.schedule}</div>
                ) : (
                  <div className="hint">{t('scheduleFormatHint')}</div>
                )}
              </div>

              {/* Command */}
              <div className="field">
                <label className="label">{t('fieldCommand')}</label>
                <textarea
                  value={newJob.command}
                  onChange={(e) => setNewJob(prev => ({ ...prev, command: e.target.value }))}
                  placeholder="cd /path/to/script && ./script.sh"
                  className="textarea"
                  style={{
                    ...MONO,
                    ...(formErrors.command ? { borderColor: 'var(--danger)' } : {}),
                  }}
                />
                {formErrors.command && (
                  <div className="hint" style={{ color: 'var(--danger)' }}>{formErrors.command}</div>
                )}
              </div>

              {/* Model */}
              <div className="field">
                <label className="label">{t('fieldModelOptional')}</label>
                <input
                  type="text"
                  value={newJob.model}
                  onChange={(e) => setNewJob(prev => ({ ...prev, model: e.target.value }))}
                  list="cron-model-suggestions"
                  placeholder={TEMPLATE_PRIMARY_SONNET}
                  className="input"
                  style={{
                    ...MONO,
                    ...(formErrors.model ? { borderColor: 'var(--danger)' } : {}),
                  }}
                />
                <datalist id="cron-model-suggestions">
                  {availableModels.map((modelName) => (
                    <option key={modelName} value={modelName} />
                  ))}
                </datalist>
                {formErrors.model ? (
                  <div className="hint" style={{ color: 'var(--danger)' }}>{formErrors.model}</div>
                ) : (
                  <div className="hint">{t('modelHint')}</div>
                )}
              </div>

              {/* Stagger */}
              <div className="field">
                <label className="label">{t('fieldStaggerOptional')}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newJob.staggerSeconds}
                    onChange={(e) => setNewJob(prev => ({ ...prev, staggerSeconds: e.target.value }))}
                    placeholder="0"
                    className="input"
                    style={{
                      width: 128,
                      ...MONO,
                      ...(formErrors.staggerSeconds ? { borderColor: 'var(--danger)' } : {}),
                    }}
                  />
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)' }}>
                    {t('seconds')}
                  </span>
                </div>
                {formErrors.staggerSeconds ? (
                  <div className="hint" style={{ color: 'var(--danger)' }}>{formErrors.staggerSeconds}</div>
                ) : (
                  <div className="hint">{t('staggerHint')}</div>
                )}
              </div>

              {/* Description */}
              <div className="field">
                <label className="label">{t('fieldDescriptionOptional')}</label>
                <input
                  type="text"
                  value={newJob.description}
                  onChange={(e) => setNewJob(prev => ({ ...prev, description: e.target.value }))}
                  placeholder={t('descriptionPlaceholder')}
                  className="input"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3" style={{ marginTop: 'var(--space-6)' }}>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="btn btn-ghost"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={addJob}
                className="btn btn-primary"
              >
                {t('addJob')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ClaudeCodeTeamsSection() {
  const t = useTranslations('cronManagement')
  const [expanded, setExpanded] = useState(false)
  const [data, setData] = useState<{ teams: any[]; tasks: any[] }>({ teams: [], tasks: [] })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!expanded || loaded) return
    apiFetch<{ teams: any[]; tasks: any[] }>('/api/claude-tasks')
      .then(d => { setData(d); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [expanded, loaded])

  const statusCounts = data.tasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1
    return acc
  }, {})

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="w-full text-left"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-4) var(--space-5)',
          background: 'none',
          border: 0,
          borderBottom: expanded ? '1px solid var(--border)' : 0,
          cursor: 'pointer',
          color: 'var(--fg)',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        <div className="flex items-center gap-3">
          <span className="card-title">{t('claudeCodeTeams')}</span>
          {data.teams.length > 0 && (
            <span className="badge">
              {t('teamsCount', { count: data.teams.length })}
            </span>
          )}
        </div>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>
          {expanded ? t('collapse') : t('expand')}
        </span>
      </button>

      {expanded && (
        <div className="card-body space-y-4">
          {!loaded ? (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)' }}>{t('loading')}</div>
          ) : data.teams.length === 0 ? (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)' }}>{t('noClaudeCodeTeams')}</div>
          ) : (
            <>
              {Object.keys(statusCounts).length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(statusCounts).map(([status, count]) => (
                    <span key={status} className="badge">
                      {status}: {count}
                    </span>
                  ))}
                </div>
              )}
              <div className="space-y-3">
                {data.teams.map(team => (
                  <div
                    key={team.name}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-lg)',
                      padding: 'var(--space-4)',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium" style={{ color: 'var(--fg)' }}>{team.name}</span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                        {t('membersCount', { count: team.members?.length || 0 })}
                      </span>
                      {team.description && (
                        <span className="truncate" style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                          {team.description}
                        </span>
                      )}
                    </div>
                    {team.members?.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {team.members.map((m: any) => (
                          <span
                            key={m.agentId}
                            className="badge"
                            style={{ fontSize: 'var(--text-xs)' }}
                          >
                            ✦ {m.name}{' '}
                            <span style={{ color: 'var(--fg-subtle)' }}>
                              ({m.model || m.agentType})
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
