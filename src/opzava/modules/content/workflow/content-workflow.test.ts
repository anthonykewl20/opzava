import { describe, expect, it } from 'vitest'

import { WORKFLOW_CONTRACT_SCHEMA_VERSION } from '../../../core/workflows/contracts'

import {
  CONTENT_WORKFLOW_ID,
  getContentWorkflowDefinition,
} from './content-workflow'

describe('Opzava content workflow definition', () => {
  it('parses without throwing', () => {
    expect(() => getContentWorkflowDefinition()).not.toThrow()
  })

  it('uses the current workflow contract schema version', () => {
    expect(getContentWorkflowDefinition().schemaVersion).toBe(WORKFLOW_CONTRACT_SCHEMA_VERSION)
  })

  it('carries the content workflow id', () => {
    expect(getContentWorkflowDefinition().workflowId).toBe(CONTENT_WORKFLOW_ID)
    expect(CONTENT_WORKFLOW_ID).toBe('content-workflow')
  })

  it('has exactly eleven steps', () => {
    expect(getContentWorkflowDefinition().steps).toHaveLength(11)
  })

  it('enters at idea intake', () => {
    expect(getContentWorkflowDefinition().entryStepId).toBe('idea-intake')
  })

  it('declares idea-intake as the only allowed input artifact type', () => {
    expect(getContentWorkflowDefinition().allowedInputArtifactTypes).toEqual(['idea-intake'])
  })

  it('terminates at wordpress-draft with no outgoing edges', () => {
    const terminal = getContentWorkflowDefinition().steps.find((s) => s.stepId === 'wordpress-draft')

    expect(terminal).toBeDefined()
    expect(terminal?.nextStepIds).toEqual([])
  })

  it('has exactly one approval gate and it precedes the external action', () => {
    const def = getContentWorkflowDefinition()
    const gates = def.steps.filter((s) => s.kind === 'approval-gate')

    expect(gates).toHaveLength(1)
    expect(gates[0]?.stepId).toBe('human-approval')
    expect(gates[0]?.nextStepIds).toEqual(['wordpress-draft'])
  })

  it('has exactly one external action and it is wordpress-draft', () => {
    const def = getContentWorkflowDefinition()
    const external = def.steps.filter((s) => s.kind === 'external-action')

    expect(external).toHaveLength(1)
    expect(external[0]?.stepId).toBe('wordpress-draft')
  })

  it('is frozen and deterministic across calls', () => {
    expect(Object.isFrozen(getContentWorkflowDefinition())).toBe(true)
    expect(getContentWorkflowDefinition()).toEqual(getContentWorkflowDefinition())
  })
})
