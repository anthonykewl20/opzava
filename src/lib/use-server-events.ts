'use client'

import { useEffect, useRef } from 'react'
import { useMissionControl } from '@/store'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('SSE')

interface ServerEvent {
  id?: number
  type: string
  data: any
  timestamp: number
}

/**
 * Hook that connects to the SSE endpoint (/api/events) and dispatches
 * real-time DB mutation events to the Zustand store.
 *
 * SSE provides instant updates for all local-DB data (tasks, agents,
 * chat, activities, notifications), making REST polling a fallback.
 */
const MAX_DEDUPED_EVENT_IDS = 500

export function useServerEvents() {
  const eventSourceRef = useRef<EventSource | null>(null)
  const processedEventIdsRef = useRef<Set<number>>(new Set())

  const {
    setConnection,
    addTask,
    updateTask,
    deleteTask,
    addAgent,
    updateAgent,
    deleteAgent,
    addChatMessage,
    addNotification,
    markNotificationRead,
    addActivity,
  } = useMissionControl()

  useEffect(() => {
    let mounted = true

    function connect() {
      if (!mounted) return
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }

      const es = new EventSource('/api/events')
      eventSourceRef.current = es

      es.onopen = () => {
        if (!mounted) return
        // A fresh connection clears any stale resync-needed state from a prior
        // (gap-affected) connection; the bootstrap/refetch path is the source
        // of truth for a clean window.
        setConnection({ sseConnected: true, resyncNeeded: false })
      }

      es.onmessage = (event) => {
        if (!mounted) return
        try {
          const payload = JSON.parse(event.data) as ServerEvent
          // Dedup ONLY on the payload's own numeric id. Volatile/id-less events
          // (connected, resync.required, …) bypass the Set entirely — falling
          // back to event.lastEventId would reuse the PRIOR durable event's id
          // (already in the Set) and mis-drop them. Such events are also never
          // allowed to advance the cursor.
          const id = payload.id
          if (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) {
            if (processedEventIdsRef.current.has(id)) return
            processedEventIdsRef.current.add(id)
            if (processedEventIdsRef.current.size > MAX_DEDUPED_EVENT_IDS) {
              const oldest = processedEventIdsRef.current.values().next().value
              if (oldest !== undefined) processedEventIdsRef.current.delete(oldest)
            }
          }
          dispatch(payload)
        } catch {
          // Ignore malformed events
        }
      }

      es.onerror = () => {
        if (!mounted) return
        setConnection({ sseConnected: false })
        log.warn('SSE connection lost; browser EventSource will reconnect')
      }
    }

    function dispatch(event: ServerEvent) {
      switch (event.type) {
        case 'connected':
          // Initial connection ack, nothing to do
          break

        // Control frame: the client's Last-Event-ID predates the server's
        // retained window (retention gap). The store does not own a refetch
        // path for the realtime-backed collections (panels do that on mount);
        // surface a flag so the dashboard/panels can trigger a full REST
        // refetch. Never crashes on the frame.
        case 'resync.required':
          log.warn('SSE retention gap detected; flagging for resync', event.data)
          setConnection({ resyncNeeded: true })
          break

        // Task events
        case 'task.created':
          addTask(event.data)
          break
        case 'task.updated':
          if (event.data?.id) {
            updateTask(event.data.id, event.data)
          }
          break
        case 'task.status_changed':
          if (event.data?.id) {
            const updates = {
              status: event.data.status,
              updated_at: event.data.updated_at,
              ...(event.data.error_message !== undefined ? { error_message: event.data.error_message } : {}),
            }
            updateTask(event.data.id, updates)
          }
          break
        case 'task.deleted':
          if (event.data?.id) {
            deleteTask(event.data.id)
          }
          break

        // Agent events
        case 'agent.created':
          addAgent(event.data)
          break
        case 'agent.updated':
        case 'agent.status_changed':
          if (event.data?.id) {
            updateAgent(event.data.id, event.data)
          }
          break
        case 'agent.deleted':
          if (event.data?.id) {
            deleteAgent(event.data.id)
          }
          break

        // Chat events
        case 'chat.message':
          if (event.data?.id) {
            addChatMessage({
              id: event.data.id,
              conversation_id: event.data.conversation_id,
              from_agent: event.data.from_agent,
              to_agent: event.data.to_agent,
              content: event.data.content,
              message_type: event.data.message_type || 'text',
              metadata: event.data.metadata,
              read_at: event.data.read_at,
              created_at: event.data.created_at || Math.floor(Date.now() / 1000),
            })
          }
          break
        // CHAT-5: another client marked a DM read. Reconcile read_at on the
        // matching cached message. Idempotent: only writes when the message is
        // present and its read_at differs; an unknown id is a safe no-op.
        case 'chat.message.read': {
          const readId = event.data?.id
          const readAt = event.data?.read_at
          if (typeof readId !== 'number' || typeof readAt !== 'number') break
          const state = useMissionControl.getState()
          const existing = state.chatMessages.find((m) => m.id === readId)
          if (!existing || existing.read_at === readAt) break
          useMissionControl.setState({
            chatMessages: state.chatMessages.map((m) =>
              m.id === readId ? { ...m, read_at: readAt } : m
            ),
          })
          break
        }

        // Notification events
        case 'notification.created':
          if (event.data?.id) {
            addNotification({
              id: event.data.id as number,
              recipient: event.data.recipient || 'operator',
              type: event.data.type || 'info',
              title: event.data.title || '',
              message: event.data.message || '',
              source_type: event.data.source_type,
              source_id: event.data.source_id,
              created_at: event.data.created_at || Math.floor(Date.now() / 1000),
            })
          }
          break
        case 'notification.read':
          if (event.data?.id) {
            markNotificationRead(event.data.id)
          }
          break

        // Activity events
        case 'activity.created':
          if (event.data?.id) {
            addActivity({
              id: event.data.id as number,
              type: event.data.type,
              entity_type: event.data.entity_type,
              entity_id: event.data.entity_id,
              actor: event.data.actor,
              description: event.data.description,
              data: event.data.data,
              created_at: event.data.created_at || Math.floor(Date.now() / 1000),
            })
          }
          break
      }
    }

    connect()

    return () => {
      mounted = false
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      setConnection({ sseConnected: false })
    }
  }, [
    setConnection,
    addTask,
    updateTask,
    deleteTask,
    addAgent,
    updateAgent,
    deleteAgent,
    addChatMessage,
    addNotification,
    markNotificationRead,
    addActivity,
  ])
}

/**
 * Watches `connection.resyncNeeded`. When the SSE layer flags a retention-gap
 * resync, this re-invokes the caller-provided refetch (a stable closure that
 * reloads the realtime-backed collections) and then clears the flag.
 *
 * Idempotent + thread-safe: the effect only runs the refetch on a true→false
 * transition (gated by `resyncNeeded === true`), so concurrent reconnection
 * storms or repeated frames cannot fire duplicate refetches; clearing is a
 * single synchronous store write. The refetch callback is invoked once per
 * flag flip and awaited — failures are logged but still clear the flag so the
 * client does not get stuck refusing the next resync.
 *
 * Kept in this module (next to the flag's producer) so the resync contract —
 * flip → refetch → clear — lives in one place. Callers pass their own refetch
 * so this hook owns no network/UI concerns (deep module, no hidden deps).
 */
export function useResyncRefetch(refetch: () => void | Promise<void>) {
  const resyncNeeded = useMissionControl((s) => s.connection.resyncNeeded)
  const setConnection = useMissionControl((s) => s.setConnection)
  // Hold the latest refetch in a ref so the flag-transition effect is
  // independent of callback identity churn; the resync effect re-runs ONLY on
  // the flag transition, not on every refetch-closure change.
  const refetchRef = useRef(refetch)
  useEffect(() => {
    refetchRef.current = refetch
  }, [refetch])

  useEffect(() => {
    if (!resyncNeeded) return
    let cancelled = false
    Promise.resolve()
      .then(() => refetchRef.current())
      .catch((err) => log.warn('Resync refetch failed', err))
      .finally(() => {
        // Always clear the flag so a failed refetch does not wedge resync.
        // Guarded so a rapid unmount does not write after teardown.
        if (!cancelled) setConnection({ resyncNeeded: false })
      })
    return () => {
      cancelled = true
    }
  }, [resyncNeeded, setConnection])
}
