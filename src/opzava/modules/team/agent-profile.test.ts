import { describe, it, expect } from 'vitest';
import {
  parseAgentProfile,
  DEFAULT_AGENT_PROFILES,
  getAgentProfile,
  AGENT_MODELS,
} from './agent-profile';
import { DEFAULT_AGENT_ROLES } from './agent-role';

describe('agent-profile', () => {
  it('parseAgentProfile accepts a valid profile and returns it frozen', () => {
    const valid = {
      schemaVersion: 1 as const,
      agentId: 'copywriter',
      displayName: 'Leo Hart',
      avatarEmoji: '✍️',
      charter: 'Outlines and writes article drafts grounded in the brief and sources.',
      preferredModel: 'opus' as const,
    };
    const parsed = parseAgentProfile(valid);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(parsed.agentId).toBe('copywriter');
    expect(parsed.displayName).toBe('Leo Hart');
    expect(parsed.avatarEmoji).toBe('✍️');
    expect(parsed.charter.length).toBeGreaterThan(0);
    expect(parsed.preferredModel).toBe('opus');
    expect(parsed.schemaVersion).toBe(1);
  });

  it('parseAgentProfile rejects invalid inputs', () => {
    const base = {
      schemaVersion: 1 as const,
      agentId: 'copywriter',
      displayName: 'Leo Hart',
      avatarEmoji: '✍️',
      charter: 'A valid charter.',
      preferredModel: 'opus' as const,
    };
    expect(() => parseAgentProfile({ ...base, displayName: '' })).toThrow();
    expect(() =>
      parseAgentProfile({ ...base, preferredModel: 'gpt' }),
    ).toThrow();
    const longCharter = 'x'.repeat(281);
    expect(() => parseAgentProfile({ ...base, charter: longCharter })).toThrow();
  });

  it('every default agent role has a profile', () => {
    for (const role of DEFAULT_AGENT_ROLES) {
      expect(getAgentProfile(role.agentId)).not.toBeNull();
    }
    expect(DEFAULT_AGENT_PROFILES.length).toBe(DEFAULT_AGENT_ROLES.length);
  });

  it('every default profile validates and uses an allowed model', () => {
    for (const p of DEFAULT_AGENT_PROFILES) {
      expect(() => parseAgentProfile(p)).not.toThrow();
      expect(AGENT_MODELS).toContain(p.preferredModel);
    }
  });

  it('getAgentProfile returns the copywriter profile with a display name and emoji', () => {
    const p = getAgentProfile('copywriter');
    expect(p).not.toBeNull();
    expect(p?.displayName.length).toBeGreaterThan(0);
    expect(p?.avatarEmoji.length).toBeGreaterThan(0);
    expect(p?.charter.length).toBeGreaterThan(0);
  });

  it('getAgentProfile returns null for an unknown agent', () => {
    expect(getAgentProfile('nobody')).toBeNull();
  });
});
