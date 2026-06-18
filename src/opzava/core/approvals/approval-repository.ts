import Database from 'better-sqlite3';
import { parseApproval, type Approval, type ApprovalStatus } from './contracts';

export type ApprovalRepository = Readonly<{
  ensureSchema: () => void;
  saveApproval: (approval: Approval) => void;
  getApprovalById: (approvalId: string) => Approval | null;
  listApprovals: (filter?: Readonly<{ status?: ApprovalStatus }>) => Approval[];
}>;

export function createApprovalRepository(db: Database.Database): ApprovalRepository {
  let schemaReady = false;

  const ensureSchema = (): void => {
    if (schemaReady) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS opzava_approvals (
        approval_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        requested_action TEXT NOT NULL,
        requester_id TEXT NOT NULL,
        record_json TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        decided_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_opzava_approvals_status ON opzava_approvals(status);
      CREATE INDEX IF NOT EXISTS idx_opzava_approvals_requested ON opzava_approvals(requested_at);
    `);
    schemaReady = true;
  };

  ensureSchema();

  const insertOrUpdate = db.prepare(`
    INSERT INTO opzava_approvals (
      approval_id, status, requested_action, requester_id, record_json, requested_at, decided_at
    ) VALUES (
      @approval_id, @status, @requested_action, @requester_id, @record_json, @requested_at, @decided_at
    )
    ON CONFLICT(approval_id) DO UPDATE SET
      status = excluded.status,
      requested_action = excluded.requested_action,
      requester_id = excluded.requester_id,
      record_json = excluded.record_json,
      requested_at = excluded.requested_at,
      decided_at = excluded.decided_at
  `);

  const selectById = db.prepare(`SELECT record_json FROM opzava_approvals WHERE approval_id = ?`);
  const selectAll = db.prepare(`SELECT record_json FROM opzava_approvals ORDER BY requested_at DESC`);
  const selectByStatus = db.prepare(`SELECT record_json FROM opzava_approvals WHERE status = ? ORDER BY requested_at DESC`);

  const saveApproval = (approval: Approval): void => {
    ensureSchema();
    const a = parseApproval(approval);
    insertOrUpdate.run({
      approval_id: a.approvalId,
      status: a.status,
      requested_action: a.requestedAction,
      requester_id: a.requesterId,
      record_json: JSON.stringify(a),
      requested_at: a.requestedAt,
      decided_at: a.decidedAt,
    });
  };

  const getApprovalById = (approvalId: string): Approval | null => {
    ensureSchema();
    const row = selectById.get(approvalId) as { record_json: string } | undefined;
    if (!row) return null;
    return parseApproval(JSON.parse(row.record_json));
  };

  const listApprovals = (filter?: Readonly<{ status?: ApprovalStatus }>): Approval[] => {
    ensureSchema();
    const rows = filter?.status
      ? (selectByStatus.all(filter.status) as { record_json: string }[])
      : (selectAll.all() as { record_json: string }[]);
    return rows.map((r) => parseApproval(JSON.parse(r.record_json)));
  };

  return Object.freeze({ ensureSchema, saveApproval, getApprovalById, listApprovals });
}
