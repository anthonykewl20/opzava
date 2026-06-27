'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useMissionControl } from '@/store'

type UpdateState = 'idle' | 'updating' | 'success' | 'error'

export function OpenClawUpdateBanner() {
  const { openclawUpdate, openclawUpdateDismissedVersion, dismissOpenclawUpdate, setOpenclawUpdate } = useMissionControl()
  const t = useTranslations('openclawUpdateBanner')
  const tc = useTranslations('common')
  const [copied, setCopied] = useState(false)
  const [state, setState] = useState<UpdateState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [newVersion, setNewVersion] = useState<string | null>(null)
  const [showChangelog, setShowChangelog] = useState(false)

  if (!openclawUpdate) return null
  if (openclawUpdateDismissedVersion === openclawUpdate.latest) return null

  function handleCopy() {
    navigator.clipboard.writeText(openclawUpdate!.updateCommand).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  async function handleUpdate() {
    setState('updating')
    setErrorMsg(null)

    try {
      const res = await fetch('/api/openclaw/update', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        setState('error')
        setErrorMsg(data.detail || data.error || t('updateFailed'))
        return
      }

      setState('success')
      setNewVersion(data.newVersion)
      // Clear the banner after a few seconds
      setTimeout(() => setOpenclawUpdate(null), 5000)
    } catch {
      setState('error')
      setErrorMsg(t('networkError'))
    }
  }

  const busy = state === 'updating'

  return (
    <div style={{ margin: '12px 16px 0' }}>
      <div className="banner banner-info" role="status">
        <span className="dot dot-accent shrink-0" aria-hidden="true" />
        <p className="u-grow" style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
          {state === 'updating' && (
            <span style={{ color: 'var(--warning)', fontWeight: 'var(--fw-medium)' }}>{t('updatingOpenClaw')}</span>
          )}
          {state === 'success' && (
            <span style={{ color: 'var(--success)', fontWeight: 'var(--fw-medium)' }}>
              {t('openclawUpdated', { version: newVersion || openclawUpdate.latest })}
            </span>
          )}
          {state === 'error' && (
            <span style={{ color: 'var(--danger)', fontWeight: 'var(--fw-medium)' }}>{errorMsg}</span>
          )}
          {state === 'idle' && (
            <>
              <span style={{ color: 'var(--fg)', fontWeight: 'var(--fw-medium)' }}>
                {t('openclawUpdateAvailable', { version: openclawUpdate.latest })}
              </span>
              {' ('}{t('installed', { version: openclawUpdate.installed })}{')'}
            </>
          )}
        </p>
        {!busy && state !== 'success' && (
          <>
            <button
              type="button"
              onClick={handleUpdate}
              className="btn btn-primary btn-sm shrink-0"
            >
              {tc('updateNow')}
            </button>
            {openclawUpdate.releaseNotes && (
              <button
                type="button"
                onClick={() => setShowChangelog(v => !v)}
                className="btn btn-sm shrink-0"
              >
                {t('changelog')} {showChangelog ? '▴' : '▾'}
              </button>
            )}
            <button
              type="button"
              onClick={handleCopy}
              className="btn btn-sm shrink-0"
            >
              {copied ? t('copied') : t('copyCommand')}
            </button>
            <a
              href={openclawUpdate.releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm shrink-0"
            >
              {tc('viewRelease')}
            </a>
            <button
              type="button"
              onClick={() => dismissOpenclawUpdate(openclawUpdate.latest)}
              className="btn btn-ghost btn-icon btn-sm shrink-0"
              title={tc('dismiss')}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </>
        )}
        {busy && (
          <svg className="w-4 h-4 animate-spin shrink-0" style={{ color: 'var(--warning)' }} viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
          </svg>
        )}
      </div>
      {showChangelog && openclawUpdate.releaseNotes && (
        <div
          className="card"
          style={{
            marginTop: 4,
            padding: 'var(--space-3) var(--space-4)',
            fontSize: 'var(--text-xs)',
            color: 'var(--fg-muted)',
            whiteSpace: 'pre-wrap',
            maxHeight: 256,
            overflowY: 'auto',
          }}
        >
          {openclawUpdate.releaseNotes}
        </div>
      )}
    </div>
  )
}
