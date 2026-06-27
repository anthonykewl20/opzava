'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useMissionControl } from '@/store'

interface DoctorStatus {
  level: 'healthy' | 'warning' | 'error'
  category: 'config' | 'state' | 'security' | 'general'
  healthy: boolean
  summary: string
  issues: string[]
  canFix: boolean
  raw: string
}

interface OpenClawDoctorFixProgress {
  step: string
  detail: string
}

type BannerState = 'idle' | 'fixing' | 'success' | 'error'

export function OpenClawDoctorBanner() {
  const t = useTranslations('doctorBanner')
  const tc = useTranslations('common')
  const [doctor, setDoctor] = useState<DoctorStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const doctorDismissedAt = useMissionControl(s => s.doctorDismissedAt)
  const dismissDoctor = useMissionControl(s => s.dismissDoctor)
  const [state, setState] = useState<BannerState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [fixProgress, setFixProgress] = useState<string>('')

  async function loadDoctorStatus() {
    try {
      const res = await fetch('/api/openclaw/doctor', { cache: 'no-store' })
      if (!res.ok) {
        setDoctor(null)
        return
      }
      const data = await res.json()
      setDoctor(data)
    } catch {
      setDoctor(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadDoctorStatus()
  }, [])

  async function handleFix() {
    setState('fixing')
    setErrorMsg(null)
    setFixProgress(t('runningFixes'))

    const progressMessages = [
      t('runningFixes'),
      t('cleaningSessionStores'),
      t('archivingOrphanTranscripts'),
      t('recheckingHealth'),
    ]
    let progressIndex = 0
    const progressTimer = window.setInterval(() => {
      progressIndex = (progressIndex + 1) % progressMessages.length
      setFixProgress(progressMessages[progressIndex] ?? progressMessages[0]!)
    }, 1400)

    try {
      const res = await fetch('/api/openclaw/doctor', { method: 'POST' })
      const data = await res.json()
      window.clearInterval(progressTimer)

      if (!res.ok) {
        setState('error')
        setErrorMsg(data.detail || data.error || t('fixFailed'))
        if (data.status) {
          setDoctor(data.status)
        }
        setFixProgress('')
        return
      }

      setDoctor(data.status)
      const progress = Array.isArray(data.progress) ? data.progress as OpenClawDoctorFixProgress[] : []
      setFixProgress(progress.map(item => item.detail).filter(Boolean).join(' '))
      setState(data.status?.healthy ? 'success' : 'idle')
      setShowDetails(false)
    } catch {
      window.clearInterval(progressTimer)
      setState('error')
      setErrorMsg(t('networkError'))
      setFixProgress('')
    }
  }

  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000
  const dismissed = doctorDismissedAt != null && (Date.now() - doctorDismissedAt) < TWENTY_FOUR_HOURS

  if (loading || dismissed || !doctor || doctor.healthy) return null

  const severity = doctor.level === 'error' ? 'danger' : 'warning'

  const visibleIssues = doctor.issues.slice(0, 3)
  const extraCount = Math.max(doctor.issues.length - visibleIssues.length, 0)
  const busy = state === 'fixing'
  const headline =
    state === 'success'
      ? t('fixCompleted')
      : doctor.category === 'config'
        ? t('configDrift')
        : doctor.category === 'state'
          ? t('stateIntegrity')
          : doctor.category === 'security'
            ? t('securityWarning')
            : t('doctorWarnings')

  return (
    <div style={{ margin: '12px 16px 0' }}>
      <div className={`banner banner-${severity}`} role="status" style={{ alignItems: 'flex-start' }}>
        <span className={`dot dot-${severity} shrink-0`} aria-hidden="true" style={{ marginTop: 2 }} />
        <div className="min-w-0 flex-1">
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
            <span style={{ color: 'var(--fg)', fontWeight: 'var(--fw-medium)' }}>{headline}</span>
            {' — '}
            {state === 'error' ? errorMsg || doctor.summary : doctor.summary}
          </p>
          {visibleIssues.length > 0 && (
            <div className="mt-2 space-y-1">
              {visibleIssues.map(issue => (
                <p key={issue} style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                  - {issue}
                </p>
              ))}
              {extraCount > 0 && (
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>{tc('moreIssues', { count: extraCount })}</p>
              )}
            </div>
          )}
          {busy && fixProgress && (
            <p className="mt-2" style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>{fixProgress}</p>
          )}
          {!busy && state === 'success' && fixProgress && (
            <p className="mt-2" style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>{fixProgress}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {doctor.canFix && state !== 'success' && (
            <button
              type="button"
              onClick={handleFix}
              disabled={busy}
              className="btn btn-primary btn-sm shrink-0"
            >
              {busy ? t('runningFix') : t('runDoctorFix')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowDetails(value => !value)}
            className="btn btn-sm shrink-0"
          >
            {showDetails ? tc('hideDetails') : tc('showDetails')}
          </button>
          <button
            type="button"
            onClick={dismissDoctor}
            className="btn btn-ghost btn-icon btn-sm shrink-0"
            title={tc('dismiss')}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      </div>
      {showDetails && (
        <div
          className="card"
          style={{
            marginTop: 4,
            padding: 'var(--space-3) var(--space-4)',
            fontSize: 'var(--text-xs)',
            color: 'var(--fg-muted)',
            whiteSpace: 'pre-wrap',
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          {doctor.raw || doctor.summary}
        </div>
      )}
    </div>
  )
}
