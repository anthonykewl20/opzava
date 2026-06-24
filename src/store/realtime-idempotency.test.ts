import { beforeEach, describe, expect, it } from 'vitest'
import { useMissionControl } from './index'
import type { Activity, Agent, ChatMessage, Notification, Task } from './index'

const task = (id: number): Task => ({
  id,
  title: `Task ${id}`,
  status: 'inbox',
  priority: 'medium',
  created_by: 'operator',
  created_at: 1,
  updated_at: 1,
})

const agent = (id: number): Agent => ({
  id,
  name: `agent-${id}`,
  role: 'worker',
  status: 'idle',
  created_at: 1,
  updated_at: 1,
})

const notification = (id: number, read_at?: number): Notification => ({
  id,
  recipient: 'operator',
  type: 'info',
  title: `Notification ${id}`,
  message: 'message',
  created_at: 1,
  read_at,
})

const activity = (id: number): Activity => ({
  id,
  type: 'task_created',
  entity_type: 'task',
  entity_id: 1,
  actor: 'operator',
  description: `Activity ${id}`,
  created_at: 1,
})

describe('store realtime idempotency', () => {
  beforeEach(() => {
    useMissionControl.setState({
      tasks: [],
      agents: [],
      notifications: [],
      activities: [],
      unreadNotificationCount: 0,
      selectedTask: null,
      selectedAgent: null,
    })
  })

  it('does not duplicate task.created replay rows', () => {
    const store = useMissionControl.getState()

    store.addTask(task(1))
    useMissionControl.getState().addTask(task(1))

    expect(useMissionControl.getState().tasks.map((item) => item.id)).toEqual([1])
  })

  it('does not duplicate agent.created replay rows', () => {
    const store = useMissionControl.getState()

    store.addAgent(agent(1))
    useMissionControl.getState().addAgent(agent(1))

    expect(useMissionControl.getState().agents.map((item) => item.id)).toEqual([1])
  })

  it('does not double count duplicate notification.created events', () => {
    const store = useMissionControl.getState()

    store.addNotification(notification(1))
    useMissionControl.getState().addNotification(notification(1))

    expect(useMissionControl.getState().notifications.map((item) => item.id)).toEqual([1])
    expect(useMissionControl.getState().unreadNotificationCount).toBe(1)
  })

  it('does not increment unread count for already-read notifications', () => {
    useMissionControl.getState().addNotification(notification(1, 10))

    expect(useMissionControl.getState().notifications.map((item) => item.id)).toEqual([1])
    expect(useMissionControl.getState().unreadNotificationCount).toBe(0)
  })

  it('does not duplicate activity.created replay rows', () => {
    useMissionControl.getState().addActivity(activity(1))
    useMissionControl.getState().addActivity(activity(1))

    expect(useMissionControl.getState().activities.map((item) => item.id)).toEqual([1])
  })

  it('does not decrement unread count twice for duplicate notification.read events', () => {
    useMissionControl.getState().addNotification(notification(1))
    useMissionControl.getState().markNotificationRead(1)
    useMissionControl.getState().markNotificationRead(1)

    expect(useMissionControl.getState().notifications[0].read_at).toBeTruthy()
    expect(useMissionControl.getState().unreadNotificationCount).toBe(0)
  })
})

describe('store optimistic-send race (chat.message vs HTTP response)', () => {
  const msg = (id: number, content = 'hi'): ChatMessage => ({
    id,
    conversation_id: 'conv-1',
    from_agent: 'human',
    to_agent: 'agent-1',
    content,
    message_type: 'text',
    created_at: 1,
  })

  beforeEach(() => {
    useMissionControl.setState({ chatMessages: [] })
  })

  it('replacePendingMessage keeps exactly one message when the SSE originator already inserted it', () => {
    // Race: tempId -1 optimistic, then SSE delivers real id 42 first, then
    // the HTTP response calls replacePendingMessage(-1, msg42).
    useMissionControl.setState({
      chatMessages: [msg(-1, 'pending'), msg(42, 'hello')],
    })

    useMissionControl.getState().replacePendingMessage(-1, msg(42, 'hello'))

    const ids = useMissionControl.getState().chatMessages.map((m) => m.id)
    expect(ids).toEqual([42])
    expect(ids.filter((id) => id === 42)).toHaveLength(1)
  })

  it('replacePendingMessage still swaps the tempId when the real message is not yet present', () => {
    useMissionControl.setState({ chatMessages: [msg(-1, 'pending')] })

    useMissionControl.getState().replacePendingMessage(-1, msg(42, 'hello'))

    const { chatMessages } = useMissionControl.getState()
    expect(chatMessages.map((m) => m.id)).toEqual([42])
    expect(chatMessages[0].pendingStatus).toBe('sent')
  })
})
