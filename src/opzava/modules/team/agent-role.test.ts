import { describe, it, expect } from 'vitest';
import {
  parseAgentRole,
  DEFAULT_AGENT_ROLES,
  groupAgentRolesByDepartment,
  AGENT_STATUSES,
} from './agent-role';

describe('agent-role', () => {
  it('parses a valid active agent and returns a frozen object', () => {
    const input = {
      schemaVersion: 1,
      agentId: 'copywriter',
      name: 'Copywriter',
      department: 'Content Marketing',
      status: 'active' as const,
      ownedStepIds: ['article-draft'],
      responsibilities: 'Writes drafts.',
    };
    const role = parseAgentRole(input);
    expect(role).toEqual(input);
    expect(Object.isFrozen(role)).toBe(true);
    expect(role.agentId).toBe('copywriter');
    expect(role.department).toBe('Content Marketing');
  });

  it('rejects an active agent with no owned steps', () => {
    const input = {
      schemaVersion: 1,
      agentId: 'noop-agent',
      name: 'No Op',
      department: 'Content Marketing',
      status: 'active' as const,
      ownedStepIds: [],
      responsibilities: 'Does nothing yet.',
    };
    expect(() => parseAgentRole(input)).toThrow();
  });

  it('accepts a planned agent with no owned steps', () => {
    const input = {
      schemaVersion: 1,
      agentId: 'future-agent',
      name: 'Future Agent',
      department: 'General VA',
      status: 'planned' as const,
      ownedStepIds: [],
      responsibilities: 'Not active yet.',
    };
    const role = parseAgentRole(input);
    expect(role.status).toBe('planned');
    expect(role.ownedStepIds).toEqual([]);
  });

  it('rejects a bad agentId and duplicate owned step ids', () => {
    const badId = {
      schemaVersion: 1,
      agentId: 'Copy Writer',
      name: 'Bad',
      department: 'Content Marketing',
      status: 'active' as const,
      ownedStepIds: ['step-a'],
      responsibilities: 'Bad id.',
    };
    expect(() => parseAgentRole(badId)).toThrow();

    const duplicateSteps = {
      schemaVersion: 1,
      agentId: 'dup-agent',
      name: 'Dup Agent',
      department: 'Content Marketing',
      status: 'active' as const,
      ownedStepIds: ['x', 'x'],
      responsibilities: 'Duplicates.',
    };
    expect(() => parseAgentRole(duplicateSteps)).toThrow();
  });

  it('exposes the expected default personas and validates them', () => {
    const ids = DEFAULT_AGENT_ROLES.map((r) => r.agentId);
    expect(ids).toContain('copywriter');
    expect(ids).toContain('seo-specialist');
    expect(ids).toContain('email-specialist');
    expect(ids).toContain('social-media-manager');
    expect(ids).toContain('general-va');

    // Every seed entry must re-parse without throwing.
    for (const role of DEFAULT_AGENT_ROLES) {
      expect(() => parseAgentRole(role)).not.toThrow();
    }

    const copywriter = DEFAULT_AGENT_ROLES.find((r) => r.agentId === 'copywriter');
    expect(copywriter).toBeDefined();
    expect(copywriter?.ownedStepIds).toContain('article-draft');

    const email = DEFAULT_AGENT_ROLES.find((r) => r.agentId === 'email-specialist');
    expect(email).toBeDefined();
    expect(email?.ownedStepIds).toContain('campaign-send');
  });

  it('marks planned personas correctly and ensures active ones own steps', () => {
    const social = DEFAULT_AGENT_ROLES.find((r) => r.agentId === 'social-media-manager');
    expect(social).toBeDefined();
    expect(social?.status).toBe('active');
    expect(social?.ownedStepIds).toContain('social-post-draft');

    const generalVa = DEFAULT_AGENT_ROLES.find((r) => r.agentId === 'general-va');
    expect(generalVa).toBeDefined();
    expect(generalVa?.status).toBe('active');
    expect(generalVa?.ownedStepIds).toContain('va-task-intake');

    for (const role of DEFAULT_AGENT_ROLES) {
      if (role.status === 'active') {
        expect(role.ownedStepIds.length).toBeGreaterThanOrEqual(1);
      }
      if (role.status === 'planned') {
        expect(role.ownedStepIds).toEqual([]);
      }
    }
  });

  it('groups agent roles by department, preserving input order', () => {
    const grouped = groupAgentRolesByDepartment(DEFAULT_AGENT_ROLES);
    expect(Object.keys(grouped)).toEqual(
      expect.arrayContaining([
        'Content Marketing',
        'Email Marketing',
        'Social Media',
        'General VA',
      ]),
    );

    expect(grouped['Content Marketing']).toBeDefined();
    expect(grouped['Content Marketing'].length).toBeGreaterThan(0);

    const emailGroup = grouped['Email Marketing'];
    expect(emailGroup).toBeDefined();
    const emailIds = emailGroup.map((r) => r.agentId);
    expect(emailIds).toContain('email-specialist');
  });

  it('exposes the AGENT_STATUSES tuple', () => {
    expect(AGENT_STATUSES).toEqual(['active', 'planned', 'paused']);
  });
});
