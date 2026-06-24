import { describe, expect, it } from 'vitest'

import { parseWorkflowDefinition } from './contracts'
import * as contracts from './contracts'

describe('Opzava workflow contracts', () => {
  it('accepts a versioned workflow definition with explicit step graph edges', () => {
    const workflow = parseWorkflowDefinition({
      schemaVersion: 1,
      workflowId: 'content-draft-workflow',
      version: 1,
      displayName: 'Content Draft Workflow',
      entryStepId: 'idea-intake',
      steps: [
        {
          stepId: 'idea-intake',
          displayName: 'Idea Intake',
          kind: 'manual-input',
          nextStepIds: ['seo-brief'],
        },
        {
          stepId: 'seo-brief',
          displayName: 'SEO Brief',
          kind: 'artifact-transform',
          nextStepIds: [],
        },
      ],
      allowedInputArtifactTypes: ['content.idea'],
    })

    expect(workflow.workflowId).toBe('content-draft-workflow')
    expect(workflow.steps).toHaveLength(2)
  })

  it('rejects workflow definitions with duplicate step IDs', () => {
    expect(() =>
      parseWorkflowDefinition({
        schemaVersion: 1,
        workflowId: 'content-draft-workflow',
        version: 1,
        displayName: 'Content Draft Workflow',
        entryStepId: 'idea-intake',
        steps: [
          {
            stepId: 'idea-intake',
            displayName: 'Idea Intake',
            kind: 'manual-input',
            nextStepIds: [],
          },
          {
            stepId: 'idea-intake',
            displayName: 'Duplicate Idea Intake',
            kind: 'manual-input',
            nextStepIds: [],
          },
        ],
        allowedInputArtifactTypes: ['content.idea'],
      }),
    ).toThrow(/duplicate step/i)
  })

  it('rejects workflow definitions whose edges point at unknown steps', () => {
    expect(() =>
      parseWorkflowDefinition({
        schemaVersion: 1,
        workflowId: 'content-draft-workflow',
        version: 1,
        displayName: 'Content Draft Workflow',
        entryStepId: 'idea-intake',
        steps: [
          {
            stepId: 'idea-intake',
            displayName: 'Idea Intake',
            kind: 'manual-input',
            nextStepIds: ['missing-step'],
          },
        ],
        allowedInputArtifactTypes: ['content.idea'],
      }),
    ).toThrow(/unknown step/i)
  })

  it('rejects workflow definitions with cyclic step graphs', () => {
    expect(() =>
      parseWorkflowDefinition({
        schemaVersion: 1,
        workflowId: 'content-draft-workflow',
        version: 1,
        displayName: 'Content Draft Workflow',
        entryStepId: 'idea-intake',
        steps: [
          {
            stepId: 'idea-intake',
            displayName: 'Idea Intake',
            kind: 'manual-input',
            nextStepIds: ['seo-brief'],
          },
          {
            stepId: 'seo-brief',
            displayName: 'SEO Brief',
            kind: 'artifact-transform',
            nextStepIds: ['idea-intake'],
          },
        ],
        allowedInputArtifactTypes: ['content.idea'],
      }),
    ).toThrow(/cycle/i)
  })

  it('does not export the dead run/step-run machinery', () => {
    // Guardrail: parseWorkflowRun/parseStepRun/transitionWorkflowRunStatus/
    // transitionStepRunStatus and their schemas were dead surface with zero
    // production consumers and have been removed. Only parseWorkflowDefinition
    // (plus the version constant and definition schema) remains.
    const exports = Object.keys(contracts).sort()

    expect(exports).toEqual(
      ['WORKFLOW_CONTRACT_SCHEMA_VERSION', 'parseWorkflowDefinition', 'workflowDefinitionSchema'].sort(),
    )
    for (const removed of [
      'parseWorkflowRun',
      'parseStepRun',
      'transitionWorkflowRunStatus',
      'transitionStepRunStatus',
      'workflowRunSchema',
      'stepRunSchema',
    ]) {
      expect(contracts).not.toHaveProperty(removed)
    }
  })
})
