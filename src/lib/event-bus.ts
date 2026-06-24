import { EventEmitter } from 'events'
import { logger } from './logger'

/**
 * Server-side event bus for broadcasting database mutations to SSE clients.
 * Singleton per Next.js server process.
 */

export interface ServerEvent {
  id?: number
  type: string
  data: any
  timestamp: number
  workspace_id?: number | null
}

// Event types emitted by the bus
export type EventType =
  | 'task.created'
  | 'task.updated'
  | 'task.deleted'
  | 'task.status_changed'
  | 'chat.message'
  | 'chat.message.deleted'
  | 'notification.created'
  | 'notification.read'
  | 'activity.created'
  | 'agent.updated'
  | 'agent.created'
  | 'agent.deleted'
  | 'agent.synced'
  | 'agent.status_changed'
  | 'audit.security'
  | 'security.event'
  | 'connection.created'
  | 'connection.disconnected'
  | 'github.synced'
  | 'run.created'
  | 'run.updated'
  | 'run.completed'
  | 'run.eval_attached'
  | 'task.escalated'
  | 'session.updated'

class ServerEventBus extends EventEmitter {
  private static instance: ServerEventBus | null = null
  private recordingFailureLogged = false

  private constructor() {
    super()
    this.setMaxListeners(500)
  }

  static getInstance(): ServerEventBus {
    if (!ServerEventBus.instance) {
      ServerEventBus.instance = new ServerEventBus()
    }
    return ServerEventBus.instance
  }

  /**
   * Persist an event durably. Isolated as a seam so the durability latch in
   * `broadcast` can be exercised without a live SQLite database: the lazy
   * require avoids a db.ts -> event-bus.ts -> db.ts module cycle, and tests
   * override this on the singleton to control success/failure per call.
   */
  protected recordDurable(event: ServerEvent): ServerEvent {
    const { recordServerEvent } = require('./realtime-events') as typeof import('./realtime-events')
    return recordServerEvent(event)
  }

  /**
   * Broadcast an event to all SSE listeners
   */
  broadcast(type: EventType, data: any): ServerEvent {
    const volatileEvent: ServerEvent = { type, data, timestamp: Date.now() }
    let event = volatileEvent
    try {
      event = this.recordDurable(volatileEvent)
      // A successful record clears the latch so the NEXT failure warns again;
      // without this one transient SQLite error permanently mutes durability
      // warnings for the process life.
      this.recordingFailureLogged = false
    } catch (err) {
      if (!this.recordingFailureLogged) {
        this.recordingFailureLogged = true
        logger.warn({ err, type }, 'Realtime event durability unavailable; falling back to in-process delivery')
      }
      event = volatileEvent
    }
    this.emit('server-event', event)
    return event
  }
}

// Use globalThis to survive HMR in development
const globalBus = globalThis as typeof globalThis & { __eventBus?: ServerEventBus }
export const eventBus = globalBus.__eventBus ?? ServerEventBus.getInstance()
globalBus.__eventBus = eventBus as ServerEventBus
