import { describe, expect, it, vi } from 'vitest'

import { gate } from './gate'
import { GATE_DENIAL_CODE, type GateDeps, type GatePolicy, type OrchestrationPlanAction } from './contracts'

const linearGraph = {
  steps: [
    { id: 's1', kind: 'dispatch', data: {} },
    { id: 's2', kind: 'review', data: {} },
  ],
  edges: [{ source: 's1', target: 's2', sourceHandle: 'source' }],
}

function makeDeps(over: Partial<GateDeps> = {}): GateDeps {
  return {
    isDecompositionDuplicate: () => false,
    registeredStepKinds: () => new Set(['dispatch', 'review']),
    estimateGraphCostUsd: () => 0.1,
    auditAction: () => {},
    ...over,
  }
}

const policy: GatePolicy = { maxSteps: 10, budgetUsd: 5, allowedShapes: ['linear', 'fan-out'] }

const validDecompose: OrchestrationPlanAction = {
  kind: 'decompose',
  workspaceId: 1,
  cardId: 42,
  graph: linearGraph,
}

describe('OrchestrationPolicyGate', () => {
  it('confirms a valid linear decompose and audits the decision', () => {
    const auditAction = vi.fn()
    const verdict = gate(validDecompose, policy, makeDeps({ auditAction }))
    expect(verdict).toEqual({ passed: true, idempotent: false })
    expect(auditAction).toHaveBeenCalledOnce()
    expect(auditAction).toHaveBeenCalledWith(validDecompose, verdict)
  })

  it('denies a decompose whose graph exceeds the step-count cap', () => {
    const auditAction = vi.fn()
    const bigGraph = {
      steps: Array.from({ length: policy.maxSteps + 1 }, (_, i) => ({ id: `s${i}`, kind: 'dispatch', data: {} })),
      edges: [],
    }
    const verdict = gate(
      { kind: 'decompose', workspaceId: 1, cardId: 7, graph: bigGraph },
      policy,
      makeDeps({ auditAction }),
    )
    expect(verdict.passed).toBe(false)
    if (!verdict.passed) {
      expect(verdict.denials.map((d) => d.code)).toContain(GATE_DENIAL_CODE.STEP_COUNT_EXCEEDED)
    }
    expect(auditAction).toHaveBeenCalledOnce()
  })

  it('treats a re-proposed decompose for an already-decomposed card as an idempotent no-op', () => {
    const verdict = gate(
      validDecompose,
      policy,
      makeDeps({ isDecompositionDuplicate: (ws, card) => ws === 1 && card === 42 }),
    )
    expect(verdict).toEqual({ passed: true, idempotent: true })
  })

  it('denies a decompose whose graph uses a step kind with no registered executor', () => {
    const graph = {
      steps: [{ id: 's1', kind: 'frobnicate', data: {} }],
      edges: [],
    }
    const verdict = gate({ kind: 'decompose', workspaceId: 1, cardId: 8, graph }, policy, makeDeps())
    expect(verdict.passed).toBe(false)
    if (!verdict.passed) {
      const unknown = verdict.denials.find((d) => d.code === GATE_DENIAL_CODE.UNKNOWN_STEP_KIND)
      expect(unknown?.field).toBe('frobnicate')
    }
  })

  it('denies a decompose whose graph has an edge to a non-existent step', () => {
    const graph = {
      steps: [{ id: 's1', kind: 'dispatch', data: {} }],
      edges: [{ source: 's1', target: 'ghost', sourceHandle: 'source' }],
    }
    const verdict = gate({ kind: 'decompose', workspaceId: 1, cardId: 9, graph }, policy, makeDeps())
    expect(verdict.passed).toBe(false)
    if (!verdict.passed) {
      expect(verdict.denials.map((d) => d.code)).toContain(GATE_DENIAL_CODE.GRAPH_INVALID)
    }
  })

  it('denies a cyclic graph as an unsupported shape (provision 5: linear/fan-out only)', () => {
    const graph = {
      steps: [
        { id: 's1', kind: 'dispatch', data: {} },
        { id: 's2', kind: 'review', data: {} },
      ],
      edges: [
        { source: 's1', target: 's2', sourceHandle: 'source' },
        { source: 's2', target: 's1', sourceHandle: 'source' },
      ],
    }
    const verdict = gate({ kind: 'decompose', workspaceId: 1, cardId: 10, graph }, policy, makeDeps())
    expect(verdict.passed).toBe(false)
    if (!verdict.passed) {
      expect(verdict.denials.map((d) => d.code)).toContain(GATE_DENIAL_CODE.SHAPE_UNSUPPORTED)
    }
  })

  it('confirms a fan-out graph (one fork to parallel branches)', () => {
    const graph = {
      steps: [
        { id: 's1', kind: 'dispatch', data: {} },
        { id: 's2', kind: 'review', data: {} },
        { id: 's3', kind: 'review', data: {} },
      ],
      edges: [
        { source: 's1', target: 's2', sourceHandle: 'source' },
        { source: 's1', target: 's3', sourceHandle: 'source' },
      ],
    }
    const verdict = gate({ kind: 'decompose', workspaceId: 1, cardId: 11, graph }, policy, makeDeps())
    expect(verdict).toEqual({ passed: true, idempotent: false })
  })

  it('denies a decompose whose projected cost exceeds the budget ceiling', () => {
    const verdict = gate(
      validDecompose,
      policy,
      makeDeps({ estimateGraphCostUsd: () => policy.budgetUsd + 1 }),
    )
    expect(verdict.passed).toBe(false)
    if (!verdict.passed) {
      expect(verdict.denials.map((d) => d.code)).toContain(GATE_DENIAL_CODE.COST_EXCEEDS_BUDGET)
    }
  })
})
