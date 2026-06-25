import { describe, expect, it } from 'vitest'

import type { AgentCapability } from './contracts'
import { assignWorker, scoreAgent } from './assign-worker'

const coder: AgentCapability = { name: 'devbot', role: 'coder', capabilities: ['code', 'api'], model: 'm-coder' }
const writer: AgentCapability = { name: 'scribe', role: 'writer', capabilities: ['copywriting'], model: 'm-writer' }
const reviewer: AgentCapability = { name: 'aegis', role: 'reviewer', capabilities: ['security'], model: 'm-rev' }

describe('assignWorker', () => {
  it('assigns a coding task to the coder', () => {
    const result = assignWorker('implement the rate-limiting API endpoint', [coder, writer, reviewer])
    expect(result?.agent.name).toBe('devbot')
    expect(result?.agent.model).toBe('m-coder')
  })

  it('assigns a writing task to the writer', () => {
    const result = assignWorker('draft the launch email and summarize the report', [coder, writer, reviewer])
    expect(result?.agent.name).toBe('scribe')
  })

  it('a declared capability match outscores role-affinity alone', () => {
    // 'security audit' hits the reviewer's role keywords AND its declared 'security' capability.
    const result = assignWorker('run a security audit', [coder, reviewer])
    expect(result?.agent.name).toBe('aegis')
  })

  it('returns null when there are no candidate agents', () => {
    expect(assignWorker('anything', [])).toBeNull()
  })

  it('scoreAgent rewards a declared capability (+15) over a bare role keyword (+10)', () => {
    expect(scoreAgent(coder, 'build the api')).toBeGreaterThan(scoreAgent(writer, 'build the api'))
    expect(scoreAgent({ ...writer, capabilities: ['api'] }, 'the api')).toBe(15)
  })
})
