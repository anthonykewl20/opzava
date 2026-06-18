import { beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { createArtifactRepository } from './artifact-repository'
import type { Artifact } from '@/opzava/core/artifacts/contracts'
import type { StoredArtifactContext } from './artifact-repository'

const artifact = (overrides: Partial<Artifact> = {}): Artifact => ({
  schemaVersion: 1,
  artifactId: 'art-1',
  artifactType: 'seo-brief',
  sourceStepRunId: 'step-1',
  content: { title: 'Hello' },
  validation: { status: 'valid', checkedAt: '2026-07-01T00:00:00.000Z' },
  lineage: { inputArtifactIds: ['idea-1'] },
  ...overrides,
})

const ctx = (over: Partial<StoredArtifactContext> = {}): StoredArtifactContext => ({
  workflowRunId: 'wf-1',
  createdAt: '2026-07-01T00:00:00.000Z',
  ...over,
})

let db: Database.Database
let repo: ReturnType<typeof createArtifactRepository>

beforeEach(() => {
  db = new Database(':memory:')
  repo = createArtifactRepository(db)
  repo.ensureSchema()
})

describe('artifact-repository', () => {
  it('round-trips a saved artifact and returns null for unknown id', () => {
    const a = artifact({ artifactId: 'art-rt' })
    repo.saveArtifact(a, ctx())

    const fetched = repo.getArtifactById('art-rt')
    expect(fetched).toEqual(a)
    expect(repo.getArtifactById('does-not-exist')).toBeNull()
  })

  it('upserts by artifactId, overwriting the previous record', () => {
    repo.saveArtifact(
      artifact({ artifactId: 'art-1', validation: { status: 'pending', checkedAt: '2026-07-01T00:00:00.000Z' } }),
      ctx(),
    )
    repo.saveArtifact(
      artifact({ artifactId: 'art-1', validation: { status: 'valid', checkedAt: '2026-07-02T00:00:00.000Z' } }),
      ctx(),
    )

    const fetched = repo.getArtifactById('art-1')
    expect(fetched).not.toBeNull()
    expect(fetched!.validation.status).toBe('valid')
    expect(fetched!.validation.checkedAt).toBe('2026-07-02T00:00:00.000Z')
    expect(repo.listArtifacts()).toHaveLength(1)
  })

  it('lists artifacts newest-first by createdAt DESC', () => {
    repo.saveArtifact(artifact({ artifactId: 'art-old' }), ctx({ createdAt: '2026-07-01T00:00:00.000Z' }))
    repo.saveArtifact(artifact({ artifactId: 'art-new' }), ctx({ createdAt: '2026-07-03T00:00:00.000Z' }))

    const list = repo.listArtifacts()
    expect(list).toHaveLength(2)
    expect(list[0]!.artifactId).toBe('art-new')
    expect(list[1]!.artifactId).toBe('art-old')
  })

  it('filters listArtifacts by artifactType', () => {
    repo.saveArtifact(artifact({ artifactId: 'a-1', artifactType: 'seo-brief' }), ctx())
    repo.saveArtifact(artifact({ artifactId: 'a-2', artifactType: 'article-draft' }), ctx())

    const briefs = repo.listArtifacts({ artifactType: 'seo-brief' })
    expect(briefs).toHaveLength(1)
    expect(briefs[0]!.artifactType).toBe('seo-brief')
    expect(briefs[0]!.artifactId).toBe('a-1')
  })

  it('filters listArtifacts by workflowRunId', () => {
    repo.saveArtifact(artifact({ artifactId: 'a-1' }), ctx({ workflowRunId: 'wf-1' }))
    repo.saveArtifact(artifact({ artifactId: 'a-2' }), ctx({ workflowRunId: 'wf-2' }))

    const run2 = repo.listArtifacts({ workflowRunId: 'wf-2' })
    expect(run2).toHaveLength(1)
    expect(run2[0]!.artifactId).toBe('a-2')
  })

  it('throws when saving an artifact with empty lineage', () => {
    const bad = {
      schemaVersion: 1,
      artifactId: 'bad-1',
      artifactType: 'seo-brief',
      sourceStepRunId: 'step-1',
      content: { title: 'No' },
      validation: { status: 'valid', checkedAt: '2026-07-01T00:00:00.000Z' },
      lineage: { inputArtifactIds: [] },
    }
    expect(() => repo.saveArtifact(bad as unknown as Artifact, ctx())).toThrow()
  })

  it('listArtifactSummaries returns column summaries newest-first with createdAt', () => {
    repo.saveArtifact(artifact({ artifactId: 'sum-old', artifactType: 'seo-brief' }), ctx({ createdAt: '2026-07-01T00:00:00.000Z' }));
    repo.saveArtifact(artifact({ artifactId: 'sum-new', artifactType: 'article-draft' }), ctx({ createdAt: '2026-07-03T00:00:00.000Z', workflowRunId: 'wf-2' }));
    const out = repo.listArtifactSummaries();
    expect(out.length).toBe(2);
    expect(out[0].artifactId).toBe('sum-new');
    expect(out[0].createdAt).toBe('2026-07-03T00:00:00.000Z');
    expect(out[0].artifactType).toBe('article-draft');
    expect(out[0].workflowRunId).toBe('wf-2');
    expect(out[0]).not.toHaveProperty('content');
  });

  it('listArtifactSummaries filters by type and run', () => {
    repo.saveArtifact(artifact({ artifactId: 's1', artifactType: 'seo-brief' }), ctx({ workflowRunId: 'wf-1' }));
    repo.saveArtifact(artifact({ artifactId: 's2', artifactType: 'article-draft' }), ctx({ workflowRunId: 'wf-2' }));
    expect(repo.listArtifactSummaries({ artifactType: 'seo-brief' }).length).toBe(1);
    expect(repo.listArtifactSummaries({ workflowRunId: 'wf-2' })[0].artifactId).toBe('s2');
  });

})
