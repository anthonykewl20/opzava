# 0104: Approval Repository

## Problem

Opzava's Approval aggregate (status: `requested|approved|rejected|expired|cancelled`, with status-dependent decision-field invariants) existed as a domain model but had no persistence layer. Approvals lived only in-memory within the content workflow, making them ephemeral and invisible to operators. Without a repository, an Approval Queue UI was impossible — pending approvals vanished on restart.

## Approach

TDD-driven SQLite repository mirroring the campaign-repository idiom: a factory function over a `better-sqlite3` Database that returns frozen closures. A single `CREATE TABLE IF NOT EXISTS opzava_approvals` with a `record_json` column stores the full aggregate. `parseApproval` validates on **every** read and write, enforcing domain invariants at the persistence boundary.

## Contract

`createApprovalRepository(db)` returns:

- `ensureSchema()` — idempotent table creation
- `saveApproval(approval)` — upserts by `approvalId`; validates before write
- `getApprovalById(id)` — returns parsed approval or `null`
- `listApprovals({status?})` — newest-first (`requestedAt DESC`), optional status filter

## Validation

Six tests against a real in-memory `better-sqlite3` database:

1. **Round-trip** — save a `requested` approval, get it back; unknown id returns `null`
2. **Upsert** — save `requested`, then save same `approved` → one row, status `approved`
3. **List newest-first** — two approvals, `listApprovals()` returns newer first
4. **List filtered** — `listApprovals({status: 'requested'})` excludes others
5. **Read re-validates** — tampered `record_json` fails closed on read
6. **Invalid write throws** — saving `approved` with `approverId: null` throws; status-dependent decision-field invariants enforced on write

## Security & Audit

No secret values, private credentials, tokens are stored on approval rows — only ids, action names, target references, status, and decision metadata. Validating on read as well as write means a tampered row fails closed; an approval can never be persisted in an inconsistent decided/undecided state.

## Next Case Study Thread

An admin-only `GET /api/ops/approvals` route backed by this repository (defaulting to `status: 'requested'` for the queue), followed by an operator Approval Queue panel in Opus UI listing pending approvals with their target and requester.
