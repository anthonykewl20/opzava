'use client'

import { useMissionControl } from '@/store'
import { useNavigateToPanel } from '@/lib/navigation'
import { useWebSocket } from '@/lib/websocket'
import { ThemeSwitch } from '@/components/layout/opzava-theme-switch'

/**
 * OpzavaShellHeader — the redesigned top header (.header), wired to the real
 * store/navigation/connection and styled with `.opzava-ds`. Faithful to
 * docs/architecture/ux-redesign/mockups/shell-overview.html.
 *
 * Behaviours are preserved from the legacy HeaderBar: the search box opens the
 * shared command palette (`onOpenSearch`, owned by the page so a single palette
 * instance/overlay is shared with the rail); the live indicator reflects the
 * SSE connection; notifications route to the notifications panel.
 */
export function OpzavaShellHeader({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { connection, unreadNotificationCount, currentUser, toggleSidebar } = useMissionControl()
  const navigateToPanel = useNavigateToPanel()
  const { isConnected } = useWebSocket()

  const sseLive = connection.sseConnected ?? false
  const healthy = isConnected || connection.isConnected

  const userName = currentUser?.display_name || currentUser?.username || 'User'
  const initials = userName.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'U'
  const unread = unreadNotificationCount

  return (
    <header className="header">
      {/* Sidebar collapse */}
      <button type="button" className="btn btn-ghost btn-icon" aria-label="Collapse sidebar" onClick={toggleSidebar}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="2" y="4.5" width="14" height="1.5" rx=".75" fill="currentColor" />
          <rect x="2" y="8.25" width="10" height="1.5" rx=".75" fill="currentColor" />
          <rect x="2" y="12" width="14" height="1.5" rx=".75" fill="currentColor" />
        </svg>
      </button>

      {/* Search → command palette */}
      <button
        type="button"
        className="search"
        role="search"
        aria-label="Search agents, tasks, runs"
        onClick={onOpenSearch}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flex: 'none' }}>
          <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="u-grow u-subtle" style={{ textAlign: 'left' }}>Search agents, tasks, runs…</span>
        <kbd className="kbd">&#8984;K</kbd>
      </button>

      {/* Spacer */}
      <div className="u-grow" />

      {/* Light/dark theme switch */}
      <ThemeSwitch />

      {/* Health pill */}
      <div className="health-pill" aria-label={`System health: ${healthy ? 'All systems healthy' : 'Connection degraded'}`}>
        <span className={`dot ${healthy ? 'dot-success' : 'dot-warning'}`} aria-hidden="true" />
        {healthy ? 'All systems healthy' : 'Connection degraded'}
      </div>

      {/* Live indicator (SSE) */}
      <div className="live-indicator" aria-label={sseLive ? 'Live connection active' : 'Live connection idle'}>
        <span className={`dot ${sseLive ? 'dot-success live' : ''}`} aria-hidden="true" />
        <span>{sseLive ? 'Live' : 'Idle'}</span>
      </div>

      {/* Notifications */}
      <div className="notif-btn-wrap">
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          onClick={() => navigateToPanel('notifications')}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M9 2a5 5 0 0 1 5 5v3l1.5 2H2.5L4 10V7a5 5 0 0 1 5-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M7 14.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        {unread > 0 && (
          <>
            <span className="notif-badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>
            <span className="u-sr-only">{unread} unread notifications</span>
          </>
        )}
      </div>

      {/* Avatar → account menu */}
      <button
        type="button"
        className="header-avatar"
        aria-label={`Account menu — ${userName}`}
        title={userName}
        onClick={() => navigateToPanel('settings')}
      >
        {initials}
      </button>
    </header>
  )
}
