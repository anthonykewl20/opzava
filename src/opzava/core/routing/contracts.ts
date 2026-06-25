/**
 * core/routing contracts (ARD 0026 Q2 / Slice 2b). The declared `AgentCapability` model the
 * orchestrator matches Steps against — formalizing the inherited keyword-substring scoring
 * (`scoreAgentForTask`/`ROLE_AFFINITY`, task-dispatch.ts) into a pure, testable Engine-B primitive.
 *
 * Pure `core/` (layering-guarded). The matcher decides *which agent fits* (specialization); the
 * *capacity* layer (which account has headroom, `AccountCapacity`) is the separate, independent
 * dimension (ARD 0026 §1) — this module never touches it.
 */

export interface AgentCapability {
  readonly name: string
  readonly role: string
  /** Declared strengths, e.g. ['code', 'testing', 'security']. */
  readonly capabilities: readonly string[]
  /** The model this agent dispatches on (carried through to the Step's plan). */
  readonly model: string
}

export interface Assignment {
  readonly agent: AgentCapability
  readonly score: number
}
