import { describe, expect, it } from 'vitest'
import { useMissionControl } from './index'

/**
 * Contract test for the store's public surface.
 *
 * GAP C deepens src/store/index.ts by composing internal domain slices, but
 * the `useMissionControl` hook and its ENTIRE public API (every state field +
 * every action that any of the 44 panels import) MUST stay byte-for-byte
 * identical. This test pins that contract so a slice refactor cannot silently
 * drop or rename a key the components destructure.
 *
 * The expected key set is the complete top-level surface of
 * `MissionControlStore`. It is declared here as data (not derived from the
 * store under test) so the assertion is non-circular.
 */

// Exhaustive top-level surface of MissionControlStore (state fields + actions).
// Update this list ONLY when the store's public API intentionally grows.
const EXPECTED_KEYS = [
  // Dashboard mode / capabilities
  'dashboardMode', 'gatewayAvailable', 'localSessionsAvailable', 'bannerDismissed',
  'capabilitiesChecked', 'bootComplete', 'subscription', 'defaultOrgName',
  'setDashboardMode', 'setGatewayAvailable', 'setLocalSessionsAvailable',
  'dismissBanner', 'setCapabilitiesChecked', 'setBootComplete', 'setSubscription',
  'setDefaultOrgName',
  // Update availability
  'updateAvailable', 'updateDismissedVersion', 'setUpdateAvailable', 'dismissUpdate',
  // OpenClaw update availability
  'openclawUpdate', 'openclawUpdateDismissedVersion', 'setOpenclawUpdate',
  'dismissOpenclawUpdate',
  // Doctor banner
  'doctorDismissedAt', 'dismissDoctor',
  // Connection
  'connection', 'lastMessage', 'setConnection', 'setLastMessage',
  // Tasks
  'tasks', 'selectedTask', 'setTasks', 'setSelectedTask', 'addTask', 'updateTask',
  'deleteTask',
  // Agents
  'agents', 'selectedAgent', 'setAgents', 'setSelectedAgent', 'addAgent',
  'updateAgent', 'deleteAgent',
  // Activities
  'activities', 'setActivities', 'addActivity',
  // Notifications
  'notifications', 'unreadNotificationCount', 'setNotifications', 'addNotification',
  'markNotificationRead', 'markAllNotificationsRead',
  // Comments
  'taskComments', 'setTaskComments', 'addTaskComment',
  // Standup
  'standupReports', 'currentStandupReport', 'setStandupReports',
  'setCurrentStandupReport',
  // Sessions
  'sessions', 'selectedSession', 'setSessions', 'setSelectedSession', 'updateSession',
  // Logs
  'logs', 'logFilters', 'addLog', 'setLogFilters', 'clearLogs',
  // Agent spawning
  'spawnRequests', 'addSpawnRequest', 'updateSpawnRequest',
  // Cron
  'cronJobs', 'setCronJobs', 'updateCronJob',
  // Memory browser
  'memoryFiles', 'selectedMemoryFile', 'memoryContent', 'memoryFileLinks',
  'memoryHealth', 'setMemoryFiles', 'setSelectedMemoryFile', 'setMemoryContent',
  'setMemoryFileLinks', 'setMemoryHealth',
  // Token usage
  'tokenUsage', 'addTokenUsage', 'getUsageByModel', 'getTotalCost',
  // Models
  'availableModels', 'setAvailableModels',
  // Chat
  'chatMessages', 'conversations', 'activeConversation', 'chatInput',
  'isSendingMessage', 'chatPanelOpen', 'setChatMessages', 'addChatMessage',
  'replacePendingMessage', 'updatePendingMessage', 'removePendingMessage',
  'setConversations', 'setActiveConversation', 'setChatInput', 'setIsSendingMessage',
  'setChatPanelOpen', 'markConversationRead',
  // Terminal split panes + attention
  'splitPanes', 'setSplitPanes', 'addSplitPane', 'removeSplitPane', 'clearSplitPanes',
  'sessionAttention', 'setSessionAttention',
  // Auth
  'currentUser', 'setCurrentUser',
  // Tenant / org context
  'activeTenant', 'tenants', 'osUsers', 'setActiveTenant', 'setTenants',
  'fetchTenants', 'fetchOsUsers',
  // Project context
  'activeProject', 'projects', 'setActiveProject', 'setProjects', 'fetchProjects',
  // Project manager modal
  'showProjectManagerModal', 'setShowProjectManagerModal',
  // Onboarding
  'showOnboarding', 'setShowOnboarding',
  // Exec approvals
  'execApprovals', 'setExecApprovals', 'addExecApproval', 'updateExecApproval',
  // Skills
  'skillsList', 'skillGroups', 'skillsTotal', 'setSkillsData',
  // Memory graph
  'memoryGraphAgents', 'setMemoryGraphAgents',
  // Security posture
  'securityPosture', 'setSecurityPosture',
  // Dashboard layout
  'dashboardLayout', 'setDashboardLayout',
  // Interface mode
  'interfaceMode', 'setInterfaceMode',
  // UI state
  'activeTab', 'sidebarExpanded', 'collapsedGroups', 'liveFeedOpen', 'headerDensity',
  'setActiveTab', 'toggleSidebar', 'setSidebarExpanded', 'toggleGroup',
  'toggleLiveFeed', 'setHeaderDensity',
] as const

describe('store slice composition contract', () => {
  it('exposes every key of the documented public surface', () => {
    const state = useMissionControl.getState() as unknown as Record<string, unknown>
    const missing = EXPECTED_KEYS.filter((key) => !(key in state))
    expect(missing, `missing keys: ${missing.join(', ')}`).toEqual([])
  })

  it('exposes no undocumented top-level keys beyond the public surface', () => {
    const state = useMissionControl.getState() as unknown as Record<string, unknown>
    // Zustand injects framework-internal helpers; ignore those.
    const internals = new Set(['setState', 'getState', 'subscribe', 'destroy', 'getInitialState'])
    const expected = new Set<string>(EXPECTED_KEYS)
    const extra = Object.keys(state).filter(
      (key) => !expected.has(key) && !internals.has(key)
    )
    expect(extra, `unexpected extra keys: ${extra.join(', ')}`).toEqual([])
  })

  it('every documented action is a function (state fields excluded)', () => {
    const state = useMissionControl.getState() as unknown as Record<string, unknown>
    for (const key of EXPECTED_KEYS) {
      // Every documented key must at least exist on the state object.
      expect(key in state, `key "${key}" missing from state`).toBe(true)
    }
    // A documented *action* starts with a verb prefix followed by an uppercase
    // letter. A small set of STATE fields also start with those verbs
    // (updateAvailable, openclawUpdate, ...) and must be excluded.
    const verbPrefix = (k: string) =>
      /^(set|add|update|delete|toggle|dismiss|mark|clear|fetch|replace|remove|get)[A-Z]/.test(k)
    const stateNotAction = new Set([
      'updateAvailable', 'openclawUpdate', 'updateDismissedVersion',
      'openclawUpdateDismissedVersion', 'availableModels', 'securityPosture',
    ])
    for (const key of EXPECTED_KEYS) {
      if (verbPrefix(key) && !stateNotAction.has(key)) {
        expect(typeof state[key], `action "${key}" must be a function`).toBe('function')
      }
    }
  })

  it('tasks slice preserves idempotent add + update + delete + selectedTask sync', () => {
    useMissionControl.setState({
      tasks: [],
      selectedTask: null,
    })
    const s = useMissionControl.getState()
    const t = { id: 1, title: 't1', status: 'inbox' as const, priority: 'medium' as const, created_by: 'op', created_at: 1, updated_at: 1 }
    s.addTask(t)
    s.addTask(t) // idempotent: no dup
    expect(useMissionControl.getState().tasks).toHaveLength(1)

    s.setSelectedTask(t)
    s.updateTask(1, { title: 'renamed' })
    const after = useMissionControl.getState()
    expect(after.tasks[0].title).toBe('renamed')
    expect(after.selectedTask?.title).toBe('renamed')

    s.deleteTask(1)
    expect(useMissionControl.getState().tasks).toHaveLength(0)
    expect(useMissionControl.getState().selectedTask).toBeNull()
  })

  it('notifications slice preserves unread count + dedupe + mark-read semantics', () => {
    useMissionControl.setState({ notifications: [], unreadNotificationCount: 0 })
    const s = useMissionControl.getState()
    const n = { id: 7, recipient: 'op', type: 'info', title: 'x', message: 'y', created_at: 1 }
    s.addNotification(n)
    s.addNotification(n) // dedupe
    s.addNotification({ ...n, id: 8 })
    expect(useMissionControl.getState().unreadNotificationCount).toBe(2)

    s.markNotificationRead(7)
    expect(useMissionControl.getState().unreadNotificationCount).toBe(1)
    s.markNotificationRead(7) // no double-decrement
    expect(useMissionControl.getState().unreadNotificationCount).toBe(1)

    s.markAllNotificationsRead()
    expect(useMissionControl.getState().unreadNotificationCount).toBe(0)
  })

  it('connection + sessions + logs slices preserve merge / map semantics', () => {
    useMissionControl.setState({
      connection: { isConnected: false, url: '', reconnectAttempts: 0 },
      sessions: [{ id: 's1', key: 'k', kind: 'claude-code', age: '', model: '', tokens: '', flags: [], active: false }],
      logs: [],
      logFilters: {},
    })
    const s = useMissionControl.getState()
    s.setConnection({ isConnected: true })
    expect(useMissionControl.getState().connection.isConnected).toBe(true)

    s.updateSession('s1', { active: true })
    expect(useMissionControl.getState().sessions[0].active).toBe(true)

    s.addLog({ id: 'l1', timestamp: 1, level: 'info', source: 'x', message: 'm' })
    expect(useMissionControl.getState().logs).toHaveLength(1)
    s.clearLogs()
    expect(useMissionControl.getState().logs).toHaveLength(0)
  })

  it('token usage derived getters preserve aggregation', () => {
    useMissionControl.setState({
      tokenUsage: [
        { model: 'm1', sessionId: 's', date: new Date().toISOString(), inputTokens: 1, outputTokens: 1, totalTokens: 10, cost: 2 },
      ],
    })
    const s = useMissionControl.getState()
    expect(s.getUsageByModel('day').m1).toBe(10)
    expect(s.getTotalCost('day')).toBe(2)
  })
})
