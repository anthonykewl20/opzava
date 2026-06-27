import type { ConversationRepository } from './conversation-repository'
import type { Conversation, ConversationTurn } from './contracts'

// Reads a self-contained conversation thread (Ask-Opzava / orchestrator): the conversation + its
// turns, oldest-first. It does NOT read or merge the inherited `messages` table — that is the
// separate human↔human "Messages" surface (messages-slack.html). ACL: admin/operator see all;
// otherwise the viewer must be a listed participant.

export interface ThreadViewer {
  readonly role: string
  readonly name: string
}

export interface ConversationThread {
  readonly conversation: Conversation
  readonly timeline: readonly ConversationTurn[]
}

function canView(viewer: ThreadViewer, conversation: Conversation): boolean {
  if (viewer.role === 'admin' || viewer.role === 'operator') return true
  return conversation.participants.includes(viewer.name)
}

export function readConversationThread(
  repo: ConversationRepository,
  conversationId: string,
  viewer: ThreadViewer,
): ConversationThread | null {
  const conversation = repo.getConversationById(conversationId)
  if (!conversation) return null
  if (!canView(viewer, conversation)) return null
  return { conversation, timeline: repo.listTurns(conversationId) }
}
