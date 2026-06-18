import { describe, expect, it } from 'vitest'

import { CONTENT_ARTIFACT_TYPES } from '../artifacts/content-artifact'

import { getContentWorkflowDefinition } from './content-workflow'
import {
  CONTENT_STEP_OUTPUTS,
  getContentStepOutput,
} from './content-step-outputs'

describe('Opzava content step outputs', () => {
  it('declares an output for every step in the content workflow definition', () => {
    const steps = getContentWorkflowDefinition().steps

    expect(steps.length).toBeGreaterThan(0)
    for (const step of steps) {
      expect(() => getContentStepOutput(step.stepId)).not.toThrow()
      expect(getContentStepOutput(step.stepId)).toBeDefined()
      expect(CONTENT_STEP_OUTPUTS[step.stepId]).toBeDefined()
    }
  })

  it('binds idea-intake to an intake-record of idea-intake', () => {
    expect(getContentStepOutput('idea-intake')).toEqual({
      kind: 'intake-record',
      recordType: 'idea-intake',
    })
  })

  it('binds keyword-research to an artifact of keyword-research', () => {
    expect(getContentStepOutput('keyword-research')).toEqual({
      kind: 'artifact',
      artifactType: 'keyword-research',
    })
  })

  it('binds human-approval to an approval', () => {
    expect(getContentStepOutput('human-approval')).toEqual({ kind: 'approval' })
  })

  it('binds wordpress-draft to a wordpress-draft-request external action', () => {
    expect(getContentStepOutput('wordpress-draft')).toEqual({
      kind: 'external-action',
      requestType: 'wordpress-draft-request',
    })
  })

  it('throws for an unknown step id', () => {
    expect(() => getContentStepOutput('nonsense')).toThrowError(
      /no declared output for content step: nonsense/,
    )
  })

  it('binds every artifact output to a known content artifact type', () => {
    for (const stepId of Object.keys(CONTENT_STEP_OUTPUTS)) {
      const output = getContentStepOutput(stepId)
      if (output.kind === 'artifact') {
        expect(CONTENT_ARTIFACT_TYPES).toContain(output.artifactType)
      }
    }
  })
})
