import Database from 'better-sqlite3'
import {
  parseAgentRole,
  DEFAULT_AGENT_ROLES,
  type AgentRole,
  type AgentStatus,
} from './agent-role'

export type AgentRoleListFilter = Readonly<{
  department?: string
  status?: AgentStatus
}>

export type AgentRoleRepository = Readonly<{
  ensureSchema: () => void
  saveAgentRole: (role: AgentRole) => void
  getAgentRoleById: (agentId: string) => AgentRole | null
  listAgentRoles: (filter?: AgentRoleListFilter) => AgentRole[]
  seedDefaults: () => number
}>

export function createAgentRoleRepository(
  db: Database.Database,
): AgentRoleRepository {
  let schemaReady = false

  const ensureSchema = (): void => {
    if (schemaReady) return
    db.exec(
      'CREATE TABLE IF NOT EXISTS opzava_agent_roles (' +
        'agent_id TEXT PRIMARY KEY, ' +
        'name TEXT NOT NULL, ' +
        'department TEXT NOT NULL, ' +
        'status TEXT NOT NULL, ' +
        'record_json TEXT NOT NULL' +
        ');',
    )
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_opzava_agent_roles_department ' +
        'ON opzava_agent_roles(department);',
    )
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_opzava_agent_roles_status ' +
        'ON opzava_agent_roles(status);',
    )
    schemaReady = true
  }

  ensureSchema()

  const insertStmt = db.prepare(
    'INSERT INTO opzava_agent_roles (agent_id, name, department, status, record_json) ' +
      'VALUES (@agent_id, @name, @department, @status, @record_json) ' +
      'ON CONFLICT(agent_id) DO UPDATE SET ' +
      'name = excluded.name, ' +
      'department = excluded.department, ' +
      'status = excluded.status, ' +
      'record_json = excluded.record_json;',
  )

  const selectByIdStmt = db.prepare(
    'SELECT record_json FROM opzava_agent_roles WHERE agent_id = ?;',
  )

  const countStmt = db.prepare(
    'SELECT COUNT(*) AS c FROM opzava_agent_roles;',
  )

  const selectAllStmt = db.prepare(
    'SELECT record_json FROM opzava_agent_roles ORDER BY department ASC, agent_id ASC;',
  )

  const selectByDepartmentStmt = db.prepare(
    'SELECT record_json FROM opzava_agent_roles WHERE department = ? ' +
      'ORDER BY department ASC, agent_id ASC;',
  )

  const selectByStatusStmt = db.prepare(
    'SELECT record_json FROM opzava_agent_roles WHERE status = ? ' +
      'ORDER BY department ASC, agent_id ASC;',
  )

  const selectByDepartmentAndStatusStmt = db.prepare(
    'SELECT record_json FROM opzava_agent_roles ' +
      'WHERE department = ? AND status = ? ' +
      'ORDER BY department ASC, agent_id ASC;',
  )

  const saveAgentRole = (role: AgentRole): void => {
    const r = parseAgentRole(role)
    insertStmt.run({
      agent_id: r.agentId,
      name: r.name,
      department: r.department,
      status: r.status,
      record_json: JSON.stringify(r),
    })
  }

  const getAgentRoleById = (agentId: string): AgentRole | null => {
    const row = selectByIdStmt.get(agentId) as
      | { record_json: string }
      | undefined
    if (!row) return null
    return parseAgentRole(JSON.parse(row.record_json))
  }

  const listAgentRoles = (
    filter?: AgentRoleListFilter,
  ): AgentRole[] => {
    const hasDept = filter?.department !== undefined
    const hasStatus = filter?.status !== undefined

    let rows: Array<{ record_json: string }>
    if (hasDept && hasStatus) {
      rows = selectByDepartmentAndStatusStmt.all(
        filter!.department,
        filter!.status,
      ) as Array<{ record_json: string }>
    } else if (hasDept) {
      rows = selectByDepartmentStmt.all(filter!.department) as Array<{
        record_json: string
      }>
    } else if (hasStatus) {
      rows = selectByStatusStmt.all(filter!.status) as Array<{
        record_json: string
      }>
    } else {
      rows = selectAllStmt.all() as Array<{ record_json: string }>
    }

    return rows.map((r) => parseAgentRole(JSON.parse(r.record_json)))
  }

  const seedDefaults = (): number => {
    ensureSchema()
    const count = (countStmt.get() as { c: number }).c
    if (count > 0) return 0
    for (const role of DEFAULT_AGENT_ROLES) {
      saveAgentRole(role)
    }
    return DEFAULT_AGENT_ROLES.length
  }

  return Object.freeze({
    ensureSchema,
    saveAgentRole,
    getAgentRoleById,
    listAgentRoles,
    seedDefaults,
  })
}
