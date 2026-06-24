import { beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { createArtifactRepository } from '@/opzava/modules/content'
import { summarizeAgentActivity, stepToArtifactType } from './agent-activity'
import { DEFAULT_AGENT_ROLES } from './agent-role'

function art(id: string, type: string): any {
  return {
    schemaVersion: 1,
    artifactId: id,
    artifactType: type,
    sourceStepRunId: 'step-1',
    content: { k: id },
    validation: { status: 'valid', checkedAt: '2026-07-01T00:00:00.000Z' },
    lineage: { inputArtifactIds: ['idea-1'] },
  }
}

function seed(db: Database.Database, id: string, type: string): void {
  const repo = createArtifactRepository(db)
  repo.ensureSchema()
  repo.saveArtifact(art(id, type), {
    workflowRunId: 'wf-1',
    createdAt: '2026-07-01T00:00:00.000Z',
  })
}

function activityFor(list: readonly { agentId: string; artifactCount: number; lastActiveAt?: string | null }[], agentId: string) {
  return list.find((a) => a.agentId === agentId)
}

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
})

describe('stepToArtifactType', () => {
  it('remaps fact-check and is identity otherwise', () => {
    expect(stepToArtifactType('fact-check')).toBe('fact-check-report')
    expect(stepToArtifactType('article-draft')).toBe('article-draft')
    expect(stepToArtifactType('seo-brief')).toBe('seo-brief')
  })
})

describe('summarizeAgentActivity', () => {
  it('returns one activity entry per role', () => {
    const out = summarizeAgentActivity(db, DEFAULT_AGENT_ROLES)
    expect(out.length).toBe(DEFAULT_AGENT_ROLES.length)
    for (const role of DEFAULT_AGENT_ROLES) {
      expect(out.some((a) => a.agentId === role.agentId)).toBe(true)
    }
  })

  it("counts the copywriter's outline + article-draft artifacts", () => {
    seed(db, 'a1', 'outline')
    seed(db, 'a2', 'article-draft')
    seed(db, 'a3', 'article-draft')
    seed(db, 'a4', 'seo-brief')
    const out = summarizeAgentActivity(db, DEFAULT_AGENT_ROLES)
    const copywriter = activityFor(out, 'copywriter')
    expect(copywriter).toBeDefined()
    expect(copywriter!.artifactCount).toBe(3)
  })

  it('counts the fact-checker via the fact-check-report remap', () => {
    seed(db, 'f1', 'fact-check-report')
    seed(db, 'f2', 'fact-check-report')
    const out = summarizeAgentActivity(db, DEFAULT_AGENT_ROLES)
    const factChecker = activityFor(out, 'fact-checker')
    expect(factChecker).toBeDefined()
    expect(factChecker!.artifactCount).toBe(2)
  })

  it('agents whose steps produce no artifact have count 0', () => {
    seed(db, 'a1', 'outline')
    seed(db, 'a2', 'article-draft')
    seed(db, 'f1', 'fact-check-report')
    seed(db, 'k1', 'keyword-research')
    seed(db, 's1', 'seo-brief')
    const out = summarizeAgentActivity(db, DEFAULT_AGENT_ROLES)
    const emailSpecialist = activityFor(out, 'email-specialist')
    const managingEditor = activityFor(out, 'managing-editor')
    const generalVa = activityFor(out, 'general-va')
    expect(emailSpecialist).toBeDefined()
    expect(managingEditor).toBeDefined()
    expect(generalVa).toBeDefined()
    expect(emailSpecialist!.artifactCount).toBe(0)
    expect(managingEditor!.artifactCount).toBe(0)
    expect(generalVa!.artifactCount).toBe(0)
  })

  it('the seo-specialist counts keyword-research + seo-brief', () => {
    seed(db, 'k1', 'keyword-research')
    seed(db, 's1', 'seo-brief')
    const out = summarizeAgentActivity(db, DEFAULT_AGENT_ROLES)
    const seoSpecialist = activityFor(out, 'seo-specialist')
    expect(seoSpecialist).toBeDefined()
    expect(seoSpecialist!.artifactCount).toBe(2)
  })

  it('computes lastActiveAt as the newest createdAt among owned artifacts', () => {
    const repo = createArtifactRepository(db);
    repo.saveArtifact(art('a1', 'article-draft'), { workflowRunId: 'wf-1', createdAt: '2026-07-01T00:00:00.000Z' });
    repo.saveArtifact(art('a2', 'outline'), { workflowRunId: 'wf-1', createdAt: '2026-07-05T00:00:00.000Z' });
    const out = summarizeAgentActivity(db, DEFAULT_AGENT_ROLES);
    const cw = activityFor(out, 'copywriter');
    expect(cw?.artifactCount).toBe(2);
    expect(cw?.lastActiveAt).toBe('2026-07-05T00:00:00.000Z');
    const email = activityFor(out, 'email-specialist');
    expect(email?.artifactCount).toBe(0);
    expect(email?.lastActiveAt).toBe(null);
  });

})
