import { describe, it, expect } from 'vitest';
import {
  createVaTaskDraftStepService,
  createMockVaTaskDraftProvider,
  parseVaTaskDraftInput,
} from './va-task-draft-service';

const deps = () => ({
  provider: createMockVaTaskDraftProvider(),
  newId: () => 'va-1',
  now: () => '2026-07-01T00:00:00.000Z',
});

const validInput = {
  taskIntakeArtifactId: 'intake-1',
  request: 'Book travel to Lisbon',
  sourceStepRunId: 'step-1',
};

describe('va-task-draft-service', () => {
  it('produces a va-task-draft artifact from an intake', () => {
    const art = createVaTaskDraftStepService(deps()).run(validInput);
    expect(art.artifactType).toBe('va-task-draft');
    expect(art.artifactId).toBe('va-1');
    expect(art.lineage.inputArtifactIds).toEqual(['intake-1']);
    expect(art.validation.status).toBe('valid');
  });

  it('carries the provider draft as content', () => {
    const art = createVaTaskDraftStepService(deps()).run(validInput);
    const c = art.content as unknown as { summary: string; steps: string[] };
    expect(c.summary).toContain('Book travel to Lisbon');
    expect(c.steps.length).toBeGreaterThan(0);
  });

  it('parseVaTaskDraftInput rejects a missing field', () => {
    expect(() =>
      parseVaTaskDraftInput({ taskIntakeArtifactId: 'i', request: 'r' }),
    ).toThrow(/invalid va task draft input/);
    expect(() =>
      parseVaTaskDraftInput({
        taskIntakeArtifactId: '',
        request: 'r',
        sourceStepRunId: 's',
      }),
    ).toThrow();
  });

  it('createMockVaTaskDraftProvider returns a deterministic draft', () => {
    const d = createMockVaTaskDraftProvider()({
      taskIntakeArtifactId: 'i',
      request: 'Email the client',
      sourceStepRunId: 's',
    });
    expect(d.summary).toContain('Email the client');
    expect(Array.isArray(d.steps)).toBe(true);
  });

  it('the run output is a frozen Artifact', () => {
    expect(Object.isFrozen(createVaTaskDraftStepService(deps()).run(validInput))).toBe(true);
  });
});
