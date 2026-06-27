// modules/conversations — PUBLIC BARREL ONLY. Consumers import from here, never deep paths.

export {
  CONVERSATION_SCHEMA_VERSION,
  conversationTypeSchema,
  conversationSchema,
  parseConversation,
  conversationTurnSchema,
  parseConversationTurn,
  turnRoleSchema,
  turnRefTypeSchema,
} from './contracts'
export type {
  Conversation,
  ConversationType,
  ConversationTurn,
  TurnRole,
  TurnRefType,
} from './contracts'

export { createConversationRepository } from './conversation-repository'
export type { ConversationRepository } from './conversation-repository'

export { readConversationThread } from './read-conversation-thread'
export type { ConversationThread, ThreadViewer } from './read-conversation-thread'

// Orchestrator seam (Ask-Opzava brain)
export { composeDigest } from './orchestrator/digest'
export type { DigestBlock, DigestProjectRow, DigestApprovalCard } from './orchestrator/digest'

export {
  createOrchestratorActionRegistry,
  makeCreateFollowupTaskAction,
  makeNotifyOwnerAction,
} from './orchestrator/action-registry'
export type {
  OrchestratorAction,
  OrchestratorActionRegistry,
  ActionExecCtx,
  ActionResult,
  ActionResultTurn,
  ApprovalRef,
  CreateFollowupTaskPort,
  NotifyOwnerPort,
} from './orchestrator/action-registry'

export { askOrchestrator } from './orchestrator/ask-orchestrator'
export type {
  AskOrchestratorDeps,
  AskOrchestratorCtx,
  AskOrchestratorResult,
  ProposedAction,
} from './orchestrator/ask-orchestrator'
