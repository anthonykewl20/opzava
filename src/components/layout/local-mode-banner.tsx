'use client'

import { useTranslations } from 'next-intl'
import { useMissionControl } from '@/store'
import { useNavigateToPanel } from '@/lib/navigation'

export function LocalModeBanner() {
  const { dashboardMode, bannerDismissed, capabilitiesChecked, dismissBanner } = useMissionControl()
  const navigateToPanel = useNavigateToPanel()
  const t = useTranslations('localModeBanner')
  const tc = useTranslations('common')

  if (!capabilitiesChecked || dashboardMode === 'full' || bannerDismissed) return null

  return (
    <div className="banner banner-info" role="status" style={{ margin: '12px 16px 0' }}>
      <span className="dot dot-accent shrink-0" aria-hidden="true" />
      <p className="u-grow" style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
        <span style={{ color: 'var(--fg)', fontWeight: 'var(--fw-medium)' }}>{t('noGatewayDetected')}</span>
        {t('runningInLocalMode')}
      </p>
      <button
        type="button"
        onClick={() => navigateToPanel('gateways')}
        className="btn btn-sm shrink-0"
      >
        {t('configureGateway')}
      </button>
      <button
        type="button"
        onClick={dismissBanner}
        className="btn btn-ghost btn-icon btn-sm shrink-0"
        title={tc('dismiss')}
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  )
}
