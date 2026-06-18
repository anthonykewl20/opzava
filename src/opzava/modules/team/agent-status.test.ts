import { describe, it, expect } from 'vitest';
import type { AgentRole } from './agent-role';
import { canTransitionAgentStatus, transitionAgentStatus } from './agent-status';

function role(overrides: Partial<AgentRole> = {}): AgentRole {
  const base: AgentRole = {
    schemaVersion: 1,
    agentId: 'copywriter',
    name: 'Copywriter',
    department: 'Content Marketing',
    status: 'active',
    ownedStepIds: ['article-draft'],
    responsibilities: 'Writes drafts.',
  };
  return { ...base, ...overrides } as AgentRole;
}

describe('canTransitionAgentStatus truth table', () => {
  it('allows active -> paused', () => {
    expect(canTransitionAgentStatus('active', 'paused')).toBe(true);
  });
  it('allows paused -> active', () => {
    expect(canTransitionAgentStatus('paused', 'active')).toBe(true);
  });
  it('forbids active -> active', () => {
    expect(canTransitionAgentStatus('active', 'active')).toBe(false);
  });
  it('forbids paused -> paused', () => {
    expect(canTransitionAgentStatus('paused', 'paused')).toBe(false);
  });
  it('forbids planned -> active', () => {
    expect(canTransitionAgentStatus('planned', 'active')).toBe(false);
  });
  it('forbids planned -> paused', () => {
    expect(canTransitionAgentStatus('planned', 'paused')).toBe(false);
  });
});

describe('transitionAgentStatus', () => {
  it('active -> paused returns a paused role and leaves the original unchanged', () => {
    const r = role({ status: 'active' });
    const out = transitionAgentStatus(r, 'paused');
    expect(out.status).toBe('paused');
    expect(r.status).toBe('active');
    expect(out.ownedStepIds).toEqual(['article-draft']);
  });

  it('paused -> active returns an active role', () => {
    const out = transitionAgentStatus(role({ status: 'paused' }), 'active');
    expect(out.status).toBe('active');
  });

  it('throws on an illegal transition (active -> active)', () => {
    expect(() => transitionAgentStatus(role({ status: 'active' }), 'active'))
      .toThrow(/illegal agent status transition/);
  });

  it('throws when toggling a planned agent', () => {
    const planned = role({
      agentId: 'general-va',
      department: 'General VA',
      status: 'planned',
      ownedStepIds: [],
    });
    expect(() => transitionAgentStatus(planned, 'active'))
      .toThrow(/illegal agent status transition/);
  });

  it('the transitioned role re-validates (frozen, valid AgentRole)', () => {
    const out = transitionAgentStatus(role({ status: 'active' }), 'paused');
    expect(Object.isFrozen(out)).toBe(true);
    expect(out.agentId).toBe('copywriter');
  });
});
