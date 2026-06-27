'use client'

import { useEffect } from 'react'
import { useMissionControl } from '@/store'
import { useNavigateToPanel } from '@/lib/navigation'
import { APP_VERSION } from '@/lib/version'
import {
  ContextSwitcher,
  MobileBottomBar,
  useFilteredNavGroups,
} from '@/components/layout/nav-rail'

/**
 * OpzavaShellRail — the redesigned left navigation rail (.rail), wired to the
 * real store/navigation and styled with the `.opzava-ds` design system.
 * Faithful to docs/architecture/ux-redesign/mockups/shell-overview.html.
 *
 * Desktop renders the `.rail`; mobile delegates to the existing
 * {@link MobileBottomBar} (driven by the shared {@link useFilteredNavGroups}),
 * so the legacy mobile navigation keeps working unchanged.
 */
export function OpzavaShellRail({ onOpenSearch }: { onOpenSearch?: () => void }) {
  const {
    activeTab,
    connection,
    dashboardMode,
    currentUser,
    activeTenant,
    tenants,
    osUsers,
    setActiveTenant,
    fetchTenants,
    fetchOsUsers,
    activeProject,
    projects,
    setActiveProject,
    fetchProjects,
    sidebarExpanded,
    defaultOrgName,
    interfaceMode,
    setInterfaceMode,
  } = useMissionControl()
  const navigateToPanel = useNavigateToPanel()
  const isLocal = dashboardMode === 'local'
  const isAdmin = currentUser?.role === 'admin'
  const { filteredGroups, filteredAllNavItems } = useFilteredNavGroups()

  // Admin context: hydrate orgs/projects for the avatar menu (mirrors NavRail).
  useEffect(() => {
    if (isAdmin) {
      fetchTenants()
      fetchOsUsers()
      fetchProjects()
    }
  }, [isAdmin, fetchTenants, fetchOsUsers, fetchProjects])

  // Which canonical tabId is currently visible (the real nav routing).
  const visibleIds = new Set(filteredAllNavItems.map(i => i.id))
  function visible(tabId: string): boolean {
    return visibleIds.has(tabId)
  }

  return (
    <>
      {/* Desktop: redesigned rail */}
      <aside className="rail hidden md:flex" aria-label="Main navigation">
        {/* Logo / wordmark */}
        <div className="rail-head">
          <svg className="rail-logo" viewBox="0 0 26 26" fill="none" aria-hidden="true">
            <rect width="26" height="26" rx="6" fill="var(--accent)" />
            <path d="M7 13h5m0 0 3-4m-3 4 3 4" stroke="var(--accent-fg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="19" cy="13" r="2" fill="var(--accent-fg)" />
          </svg>
          <span style={{ fontWeight: 'var(--fw-semibold)', fontSize: 'var(--text-base)', letterSpacing: '-.01em' }}>Opzava</span>
          <span className="u-subtle" style={{ fontSize: 'var(--text-xs)', marginLeft: 'auto' }}>v{APP_VERSION}</span>
        </div>

        {/* Nav groups */}
        <nav className="rail-nav" aria-label="Application sections">
          <SectionLabel>Operate</SectionLabel>
          <RailItem id="overview" label="Overview" active={activeTab === 'overview'} show={visible('overview')} onClick={navigateToPanel} icon={<OverviewIco />} />
          <RailItem id="agents" label="Agents" active={activeTab === 'agents'} show={visible('agents')} onClick={navigateToPanel} icon={<AgentsIco />} />
          <RailItem id="tasks" label="Tasks" active={activeTab === 'tasks'} show={visible('tasks')} onClick={navigateToPanel} icon={<TasksIco />} />
          <RailItem id="github" label="Issues" active={activeTab === 'github'} show={visible('github')} onClick={navigateToPanel} icon={<IssuesIco />} />
          <RailItem id="activity" label="Activity" active={activeTab === 'activity'} show={visible('activity')} onClick={navigateToPanel} icon={<ActivityIco />} />
          <RailItem id="chat" label="Messages" active={activeTab === 'chat'} show={visible('chat')} onClick={navigateToPanel} icon={<MessagesIco />} />

          {projects.length > 0 && (
            <>
              <div className="section-label" style={{ paddingRight: 8 }}>Projects</div>
              {projects.map((project, i) => (
                <button
                  key={project.id}
                  type="button"
                  className={`rail-item${activeProject?.id === project.id ? ' active' : ''}`}
                  aria-current={activeProject?.id === project.id ? 'page' : undefined}
                  onClick={() => { setActiveProject(project); navigateToPanel('tasks') }}
                >
                  <span
                    className="ico"
                    aria-hidden="true"
                    style={{ width: 10, height: 10, borderRadius: '50%', background: project.color || `var(--chart-${(i % 5) + 1})` }}
                  />
                  <span className="u-grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
                  {typeof project.task_count === 'number' && project.task_count > 0 && (
                    <span className="count">{project.task_count}</span>
                  )}
                  {project.deadline != null && project.deadline < Math.floor(Date.now() / 1000) && (
                    <span className="dot dot-warning" style={{ marginLeft: 6 }} aria-label="overdue" />
                  )}
                </button>
              ))}
            </>
          )}

          <div className="section-label">Observe</div>
          <RailItem id="monitor" label="Monitoring" active={activeTab === 'monitor'} show={visible('monitor')} onClick={navigateToPanel} icon={<MonitoringIco />} />
          <RailItem id="logs" label="Logs" active={activeTab === 'logs'} show={visible('logs')} onClick={navigateToPanel} icon={<LogsIco />} />
          <RailItem id="costs" label="Costs" active={activeTab === 'costs'} show={visible('costs')} onClick={navigateToPanel} icon={<CostsIco />} />

          <div className="section-label">Automate</div>
          <RailItem id="integrations" label="Connections" active={activeTab === 'integrations'} show={visible('integrations')} onClick={navigateToPanel} icon={<ConnectionsIco />} />
          <RailItem id="cron" label="Automation" active={activeTab === 'cron'} show={visible('cron')} onClick={navigateToPanel} icon={<AutomationIco />} />

          <div className="section-label">Govern</div>
          <RailItem id="security" label="Security & Audit" active={activeTab === 'security'} show={visible('security')} onClick={navigateToPanel} icon={<SecurityIco />} />
          <RailItem id="memory" label="Memory & Skills" active={activeTab === 'memory'} show={visible('memory')} onClick={navigateToPanel} icon={<MemoryIco />} />
          <RailItem id="alerts" label="Alerts" active={activeTab === 'alerts'} show={visible('alerts')} onClick={navigateToPanel} icon={<AlertsIco />} />
          <RailItem id="settings" label="Settings" active={activeTab === 'settings'} show={visible('settings')} onClick={navigateToPanel} icon={<SettingsIco />} />
          <RailItem id="debug" label="Debug" subtle active={activeTab === 'debug'} show={visible('debug')} onClick={navigateToPanel} icon={<DebugIco />} />
        </nav>

        {/* Footer: ⌘K quick jump */}
        <div className="rail-foot">
          <button
            type="button"
            className="search"
            style={{ width: '100%', maxWidth: 'none', cursor: 'pointer' }}
            aria-label="Open command palette (Cmd+K)"
            onClick={onOpenSearch}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flex: 'none', color: 'var(--fg-subtle)' }}>
              <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="u-subtle u-grow">Jump to…</span>
            <kbd className="kbd">&#8984;K</kbd>
          </button>

          {/* Avatar / account menu (interface toggle · settings · logout · orgs/projects) */}
          <div style={{ marginTop: 'var(--space-2)' }}>
            <ContextSwitcher
              currentUser={currentUser}
              isAdmin={isAdmin}
              isLocal={isLocal}
              isConnected={connection.isConnected}
              tenants={tenants}
              osUsers={osUsers}
              activeTenant={activeTenant}
              onSwitchTenant={setActiveTenant}
              projects={projects}
              activeProject={activeProject}
              onSwitchProject={setActiveProject}
              expanded={sidebarExpanded}
              defaultOrgName={defaultOrgName}
              navigateToPanel={navigateToPanel}
              fetchTenants={fetchTenants}
              fetchOsUsers={fetchOsUsers}
              interfaceMode={interfaceMode}
              setInterfaceMode={setInterfaceMode}
              activeTab={activeTab}
            />
          </div>
        </div>
      </aside>

      {/* Mobile: legacy bottom tab bar (reused, identical filtering) */}
      <MobileBottomBar
        activeTab={activeTab}
        navigateToPanel={navigateToPanel}
        groups={filteredGroups}
        items={filteredAllNavItems}
      />
    </>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="section-label">{children}</div>
}

function RailItem({ id, label, icon, active, show, subtle, count, onClick }: {
  id: string
  label: string
  icon: React.ReactNode
  active: boolean
  show: boolean
  subtle?: boolean
  count?: number
  onClick: (id: string) => void
}) {
  if (!show) return null
  return (
    <button
      type="button"
      className={`rail-item${active ? ' active' : ''}${subtle ? ' u-subtle' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={() => onClick(id)}
    >
      {icon}
      <span className="u-grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {typeof count === 'number' && count > 0 && <span className="count">{count}</span>}
    </button>
  )
}

/* ── Inline rail icons (.ico) — copied from shell-overview.html ────────────── */
function OverviewIco() {
  return (
    <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="6" height="6" rx="1.5" fill="currentColor" opacity=".9" />
      <rect x="10" y="2" width="6" height="6" rx="1.5" fill="currentColor" opacity=".5" />
      <rect x="2" y="10" width="6" height="6" rx="1.5" fill="currentColor" opacity=".5" />
      <rect x="10" y="10" width="6" height="6" rx="1.5" fill="currentColor" opacity=".5" />
    </svg>
  )
}
function AgentsIco() {
  return (
    <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 16c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
function TasksIco() {
  return (
    <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3 5h12M3 9h8M3 13h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="14" cy="13" r="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}
function IssuesIco() {
  return (
    <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="9" r="1.75" fill="currentColor" />
    </svg>
  )
}
function ActivityIco() {
  return (
    <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="4.5" cy="5" r="1.7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="4.5" cy="12" r="1.7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 12h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
function MessagesIco() {
  return (
    <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3 4h12v8H7l-3 3v-3H3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}
function MonitoringIco() {
  return (
    <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M2 9h3l2-5 3 8 2-5 2 3h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function LogsIco() {
  return (
    <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3 5h12M3 8h8M3 11h10M3 14h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
function CostsIco() {
  return (
    <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 5.5v5l3 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
function ConnectionsIco() {
  return (
    <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="5" cy="9" r="2.3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="13" cy="9" r="2.3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7.3 9h3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
function AutomationIco() {
  return (
    <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M10 2.5 4.5 10H8l-1 5.5L13.5 8H10z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}
function SecurityIco() {
  return (
    <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M9 2.5l5 1.8v3.7c0 3.3-2.1 5.6-5 6.5-2.9-.9-5-3.2-5-6.5V4.3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}
function MemoryIco() {
  return (
    <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M9 2.5 2.5 6 9 9.5 15.5 6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M2.5 10 9 13.5 15.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}
function AlertsIco() {
  return (
    <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M9 2a5 5 0 0 1 5 5v3l1.5 2H2.5L4 10V7a5 5 0 0 1 5-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7 14.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}
function SettingsIco() {
  return (
    <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 2v1.5M9 14.5V16M2 9h1.5M14.5 9H16M3.93 3.93l1.06 1.06M13.01 13.01l1.06 1.06M3.93 14.07l1.06-1.06M13.01 4.99l1.06-1.06" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
function DebugIco() {
  return (
    <svg className="ico" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="2.5" y="3.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 7.5 7.5 9.5 5.5 11.5M9.5 11.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
