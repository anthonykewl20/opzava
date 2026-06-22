import { describe, it, expect } from 'vitest';
import {
  buildDepartmentPipeline,
  CONTENT_PIPELINE_ORDER,
  DEPARTMENT_PIPELINE_ORDER,
} from './department-pipeline';
import { DEFAULT_AGENT_ROLES } from './agent-role';

describe('buildDepartmentPipeline', () => {
  it('builds the Content Marketing pipeline in canonical order', () => {
    const p = buildDepartmentPipeline(DEFAULT_AGENT_ROLES, 'Content Marketing');
    expect(p.map((s) => s.stepId)).toEqual([...CONTENT_PIPELINE_ORDER]);
  });

  it('attributes each step to its owning agent', () => {
    const p = buildDepartmentPipeline(DEFAULT_AGENT_ROLES, 'Content Marketing');
    const byStep = Object.fromEntries(p.map((s) => [s.stepId, s.agentId]));
    expect(byStep['article-draft']).toBe('copywriter');
    expect(byStep['outline']).toBe('copywriter');
    expect(byStep['fact-check']).toBe('fact-checker');
    expect(byStep['seo-brief']).toBe('seo-specialist');
    expect(byStep['wordpress-draft']).toBe('publisher');
    expect(byStep['idea-intake']).toBe('content-strategist');
  });

  it("carries the owner's display name", () => {
    const p = buildDepartmentPipeline(DEFAULT_AGENT_ROLES, 'Content Marketing');
    const ad = p.find((s) => s.stepId === 'article-draft');
    expect(ad?.agentName).toBe('Copywriter');
  });

  it('marks an unowned step as null', () => {
    const role: any = {
      schemaVersion: 1,
      agentId: 'copywriter',
      name: 'Copywriter',
      department: 'Content Marketing',
      status: 'active',
      ownedStepIds: ['article-draft'],
      responsibilities: 'x',
    };
    const p = buildDepartmentPipeline([role], 'Content Marketing');
    expect(p.find((s) => s.stepId === 'article-draft')?.agentId).toBe('copywriter');
    expect(p.find((s) => s.stepId === 'seo-brief')?.agentId).toBe(null);
    expect(p.find((s) => s.stepId === 'seo-brief')?.agentName).toBe(null);
  });

  it('builds the Email Marketing pipeline', () => {
    const p = buildDepartmentPipeline(DEFAULT_AGENT_ROLES, 'Email Marketing');
    expect(p.map((s) => s.stepId)).toEqual(['campaign-send']);
    expect(p[0].agentId).toBe('email-specialist');
  });

  it('an unknown department yields an empty pipeline', () => {
    expect(buildDepartmentPipeline(DEFAULT_AGENT_ROLES, 'Nope')).toEqual([]);
  });

  it('builds the Social Media pipeline owned by the social-media-manager', () => {
    const p = buildDepartmentPipeline(DEFAULT_AGENT_ROLES, 'Social Media');
    expect(p.map((s) => s.stepId)).toEqual(['social-brief', 'social-post-draft', 'social-review', 'social-schedule-request']);
    const draft = p.find((s) => s.stepId === 'social-post-draft');
    expect(draft?.agentId).toBe('social-media-manager');
    expect(p.find((s) => s.stepId === 'social-brief')?.agentId).toBe('social-media-manager');
    expect(p.find((s) => s.stepId === 'social-review')?.agentId).toBe('social-reviewer');
    expect(p.find((s) => s.stepId === 'social-schedule-request')?.agentId).toBe('social-media-manager');
  });


  it('builds the General VA pipeline owned by the general-va agent', () => {
    const p = buildDepartmentPipeline(DEFAULT_AGENT_ROLES, 'General VA');
    expect(p.map((s) => s.stepId)).toEqual(['va-task-intake', 'va-task-draft', 'va-task-review']);
    expect(p.find((s) => s.stepId === 'va-task-draft')?.agentId).toBe('general-va');
    expect(p.find((s) => s.stepId === 'va-task-review')?.agentId).toBe('general-va');
  });

  it('every step in every department pipeline is owned by a default role (no orphans)', () => {
    for (const department of Object.keys(DEPARTMENT_PIPELINE_ORDER)) {
      const pipeline = buildDepartmentPipeline(DEFAULT_AGENT_ROLES, department);
      const orphans = pipeline.filter((step) => step.agentId === null);
      expect(orphans, `orphaned steps in ${department}: ${orphans.map((s) => s.stepId).join(', ')}`).toEqual([]);
      for (const step of pipeline) {
        expect(step.agentId, `${department}/${step.stepId} has no owner`).not.toBe(null);
        expect(step.agentName, `${department}/${step.stepId} has no owner name`).not.toBe(null);
      }
    }
  });

});
