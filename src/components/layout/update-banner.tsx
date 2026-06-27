'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useMissionControl } from '@/store'

type UpdateState = 'idle' | 'updating' | 'restarting' | 'error'

export function UpdateBanner() {
  const { updateAvailable, updateDismissedVersion, dismissUpdate } = useMissionControl()
  const t = useTranslations('updateBanner')
  const tc = useTranslations('common')
  const [state, setState] = useState<UpdateState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (!updateAvailable) return null
  if (updateDismissedVersion === updateAvailable.latestVersion) return null

  async function handleUpdate() {
    setState('updating')
    setErrorMsg(null)

    try {
      const res = await fetch('/api/releases/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetVersion: updateAvailable!.latestVersion }),
      })
      const data = await res.json()

      if (!res.ok) {
        setState('error')
        setErrorMsg(data.error || t('updateFailed'))
        return
      }

      if (data.restartRequired) {
        setState('restarting')
        // Poll until the server comes back up, then reload
        const poll = setInterval(async () => {
          try {
            const check = await fetch('/api/releases/check', { cache: 'no-store' })
            if (check.ok) {
              clearInterval(poll)
              window.location.reload()
            }
          } catch {
            // Server still restarting
          }
        }, 2000)
        // Stop polling after 2 minutes
        setTimeout(() => {
          clearInterval(poll)
          setState('idle')
          window.location.reload()
        }, 120_000)
      } else {
        window.location.reload()
      }
    } catch {
      setState('error')
      setErrorMsg(t('networkError'))
    }
  }

  const isbusy = state === 'updating' || state === 'restarting'

  return (
    <div className="banner banner-info" role="status" style={{ margin: '12px 16px 0' }}>
      <span className="dot dot-success shrink-0" aria-hidden="true" />
      <p className="u-grow" style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
        {state === 'updating' && (
          <span style={{ color: 'var(--warning)', fontWeight: 'var(--fw-medium)' }}>{t('updating')}</span>
        )}
        {state === 'restarting' && (
          <span style={{ color: 'var(--warning)', fontWeight: 'var(--fw-medium)' }}>{t('restartingServer')}</span>
        )}
        {state === 'error' && (
          <span style={{ color: 'var(--danger)', fontWeight: 'var(--fw-medium)' }}>{errorMsg}</span>
        )}
        {state === 'idle' && (
          <>
            <span style={{ color: 'var(--fg)', fontWeight: 'var(--fw-medium)' }}>
              {t('updateAvailable', { version: updateAvailable.latestVersion })}
            </span>
            {t('newerVersionAvailable')}
          </>
        )}
      </p>
      {!isbusy && (
        <>
          <button
            type="button"
            onClick={handleUpdate}
            disabled={isbusy}
            className="btn btn-primary btn-sm shrink-0"
          >
            {tc('updateNow')}
          </button>
          <a
            href={updateAvailable.releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm shrink-0"
          >
            {tc('viewRelease')}
          </a>
          <button
            type="button"
            onClick={() => dismissUpdate(updateAvailable.latestVersion)}
            className="btn btn-ghost btn-icon btn-sm shrink-0"
            title={tc('dismiss')}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </>
      )}
      {isbusy && (
        <svg className="w-4 h-4 animate-spin shrink-0" style={{ color: 'var(--warning)' }} viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
        </svg>
      )}
    </div>
  )
}
