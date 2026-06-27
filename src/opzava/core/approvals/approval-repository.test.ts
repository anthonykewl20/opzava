import { beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { createApprovalRepository } from './approval-repository';
import type { Approval, ApprovalStatus } from './contracts';

function approval(overrides: Partial<Approval> = {}): Approval {
  const base: Approval = {
    schemaVersion: 1,
    approvalId: 'apr-1',
    requestedAction: 'wordpress-draft',
    target: { kind: 'external-action', id: 'req-1' },
    status: 'requested',
    requesterId: 'system',
    approverId: null,
    decisionReason: null,
    requestedAt: '2026-07-01T00:00:00.000Z',
    decidedAt: null,
    expiresAt: null,
    correlation: null,
  };
  return { ...base, ...overrides };
}

function approved(overrides: Partial<Approval> = {}): Approval {
  return approval({
    approvalId: 'apr-2',
    status: 'approved',
    approverId: 'admin',
    decisionReason: 'looks good',
    decidedAt: '2026-07-02T00:00:00.000Z',
    ...overrides,
  });
}

let db: Database.Database;
let repo: ReturnType<typeof createApprovalRepository>;

beforeEach(() => {
  db = new Database(':memory:');
  repo = createApprovalRepository(db);
  repo.ensureSchema();
});

describe('createApprovalRepository', () => {
  it('round-trips a requested approval via save + getById', () => {
    const a = approval();
    repo.saveApproval(a);
    const fetched = repo.getApprovalById('apr-1');
    expect(fetched).toEqual(a);
    expect(repo.getApprovalById('does-not-exist')).toBeNull();
  });

  it('upserts when saving with the same approvalId', () => {
    repo.saveApproval(approval());
    repo.saveApproval(approved({ approvalId: 'apr-1' }));
    const fetched = repo.getApprovalById('apr-1');
    expect(fetched).not.toBeNull();
    expect(fetched?.status).toBe<ApprovalStatus>('approved');
    expect(fetched?.approverId).toBe('admin');
    expect(fetched?.decisionReason).toBe('looks good');
    expect(fetched?.decidedAt).toBe('2026-07-02T00:00:00.000Z');
    expect(repo.listApprovals()).toHaveLength(1);
  });

  it('lists approvals newest-first by requestedAt DESC', () => {
    repo.saveApproval(approval({ approvalId: 'apr-old', requestedAt: '2026-07-01T00:00:00.000Z' }));
    repo.saveApproval(approval({ approvalId: 'apr-mid', requestedAt: '2026-07-02T00:00:00.000Z' }));
    repo.saveApproval(approval({ approvalId: 'apr-new', requestedAt: '2026-07-03T00:00:00.000Z' }));
    const list = repo.listApprovals();
    expect(list.map((a) => a.approvalId)).toEqual(['apr-new', 'apr-mid', 'apr-old']);
    expect(list[0]?.approvalId).toBe('apr-new');
  });

  it('filters listApprovals by status', () => {
    repo.saveApproval(approval({ approvalId: 'apr-req' }));
    repo.saveApproval(approved({ approvalId: 'apr-app' }));
    const requested = repo.listApprovals({ status: 'requested' });
    expect(requested).toHaveLength(1);
    expect(requested[0]?.status).toBe<ApprovalStatus>('requested');
    expect(requested[0]?.approvalId).toBe('apr-req');
    const approvedList = repo.listApprovals({ status: 'approved' });
    expect(approvedList).toHaveLength(1);
    expect(approvedList[0]?.approvalId).toBe('apr-app');
  });

  it('round-trips correlation lineage through record_json', () => {
    repo.saveApproval(
      approval({ approvalId: 'apr-corr', correlation: { conversationId: 'coord:admin:opzava', runId: 'run_x' } }),
    );
    expect(repo.getApprovalById('apr-corr')?.correlation).toEqual({
      conversationId: 'coord:admin:opzava',
      runId: 'run_x',
    });
  });

  it('re-validates round-tripped approvals via parseApproval', () => {
    repo.saveApproval(approved({ approvalId: 'apr-x' }));
    const fetched = repo.getApprovalById('apr-x');
    expect(fetched).not.toBeNull();
    expect(fetched?.approvalId).toBe('apr-x');
    expect(fetched?.status).toBe<ApprovalStatus>('approved');
    expect(fetched?.approverId).toBe('admin');
    expect(fetched?.decisionReason).toBe('looks good');
    expect(fetched?.decidedAt).toBe('2026-07-02T00:00:00.000Z');
  });

  it('throws when saving an invalid approval', () => {
    const bad = {
      schemaVersion: 1,
      approvalId: 'apr-bad',
      requestedAction: 'wordpress-draft',
      target: { kind: 'external-action', id: 'req-1' },
      status: 'approved',
      requesterId: 'system',
      approverId: null,
      decisionReason: null,
      requestedAt: '2026-07-01T00:00:00.000Z',
      decidedAt: null,
      expiresAt: null,
    };
    expect(() => repo.saveApproval(bad as unknown as Approval)).toThrow();
  });
});
