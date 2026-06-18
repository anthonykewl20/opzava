import { describe, expect, it } from 'vitest'

import {
  transitionStepRunStatus,
  transitionWorkflowRunStatus,
  parseWorkflowDefinition,
  parseWorkflowRun,
  parseStepRun,
} from './contracts'

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

  it('allows only explicit workflow run state transitions', () => {
    const run = parseWorkflowRun({
      schemaVersion: 1,
      runId: 'run_001',
      workflowId: 'content-draft-workflow',
      workflowVersion: 1,
      status: 'queued',
      actorId: 'admin:1',
      currentStepId: null,
      startedAt: null,
      finishedAt: null,
    })

    const running = transitionWorkflowRunStatus(run, 'running')
    const blocked = transitionWorkflowRunStatus(running, 'blocked')

    expect(running.status).toBe('running')
    expect(blocked.status).toBe('blocked')
    expect(() => transitionWorkflowRunStatus(blocked, 'succeeded')).toThrow(/invalid workflow transition/i)
  })

  it('allows only explicit step run state transitions', () => {
    const step = parseStepRun({
      schemaVersion: 1,
      stepRunId: 'step_run_001',
      runId: 'run_001',
      stepId: 'idea-intake',
      status: 'pending',
      inputArtifactIds: [],
      outputArtifactIds: [],
      attemptCount: 0,
      failureReason: null,
    })

    const running = transitionStepRunStatus(step, 'running')
    const succeeded = transitionStepRunStatus(running, 'succeeded')

    expect(running.status).toBe('running')
    expect(succeeded.status).toBe('succeeded')
    expect(() => transitionStepRunStatus(succeeded, 'running')).toThrow(/invalid step transition/i)
  })
})
