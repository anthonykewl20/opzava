import { beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { createAgentRoleRepository } from './agent-role-repository'
import {
  DEFAULT_AGENT_ROLES,
  type AgentRole,
} from './agent-role'

function role(overrides: Partial<AgentRole> = {}): AgentRole {
  return {
    schemaVersion: 1,
    agentId: 'copywriter',
    name: 'Copywriter',
    department: 'Content Marketing',
    status: 'active',
    ownedStepIds: ['article-draft'],
    responsibilities: 'Writes drafts.',
    ...overrides,
  }
}

describe('createAgentRoleRepository', () => {
  let db: Database.Database
  let repo: ReturnType<typeof createAgentRoleRepository>

  beforeEach(() => {
    db = new Database(':memory:')
    repo = createAgentRoleRepository(db)
    repo.ensureSchema()
  })

  it('round-trips saveAgentRole + getAgentRoleById', () => {
    const r = role()
    repo.saveAgentRole(r)
    const fetched = repo.getAgentRoleById('copywriter')
    expect(fetched).toEqual(r)
    expect(repo.getAgentRoleById('does-not-exist')).toBeNull()
  })

  it('upserts by agentId', () => {
    repo.saveAgentRole(role({ name: 'Copywriter' }))
    repo.saveAgentRole(
      role({ name: 'Senior Copywriter', ownedStepIds: ['article-draft'] }),
    )
    const fetched = repo.getAgentRoleById('copywriter')
    expect(fetched).not.toBeNull()
    expect(fetched!.name).toBe('Senior Copywriter')
    expect(repo.listAgentRoles()).toHaveLength(1)
  })

  it('listAgentRoles orders by department then agentId', () => {
    repo.saveAgentRole(
      role({ agentId: 'zeta', department: 'Alpha Dept' }),
    )
    repo.saveAgentRole(
      role({ agentId: 'alpha', department: 'Alpha Dept' }),
    )
    repo.saveAgentRole(
      role({ agentId: 'mid', department: 'Beta Dept' }),
    )
    const ids = repo.listAgentRoles().map((r) => r.agentId)
    expect(ids).toEqual(['alpha', 'zeta', 'mid'])
  })

  it('listAgentRoles filters by department and status', () => {
    repo.saveAgentRole(
      role({ agentId: 'cw', department: 'Content', status: 'active' }),
    )
    repo.saveAgentRole(
      role({
        agentId: 'planner',
        name: 'Planner',
        department: 'Strategy',
        status: 'planned',
        ownedStepIds: [],
      }),
    )
    const byDept = repo.listAgentRoles({ department: 'Strategy' })
    expect(byDept.map((r) => r.agentId)).toEqual(['planner'])
    const byStatus = repo.listAgentRoles({ status: 'planned' })
    expect(byStatus.map((r) => r.agentId)).toEqual(['planner'])
    const combined = repo.listAgentRoles({
      department: 'Content',
      status: 'active',
    })
    expect(combined.map((r) => r.agentId)).toEqual(['cw'])
  })

  it('seedDefaults inserts the default roster into an empty table', () => {
    const inserted = repo.seedDefaults()
    expect(inserted).toBe(DEFAULT_AGENT_ROLES.length)
    expect(repo.listAgentRoles()).toHaveLength(DEFAULT_AGENT_ROLES.length)
  })

  it('seedDefaults is idempotent', () => {
    const first = repo.seedDefaults()
    expect(first).toBe(DEFAULT_AGENT_ROLES.length)
    const second = repo.seedDefaults()
    expect(second).toBe(0)
    expect(repo.listAgentRoles()).toHaveLength(DEFAULT_AGENT_ROLES.length)
  })

  it('seedDefaults includes email-specialist with campaign-send step', () => {
    repo.seedDefaults()
    const emailSpecialist = repo.getAgentRoleById('email-specialist')
    expect(emailSpecialist).not.toBeNull()
    expect(emailSpecialist!.ownedStepIds).toContain('campaign-send')
  })
})
