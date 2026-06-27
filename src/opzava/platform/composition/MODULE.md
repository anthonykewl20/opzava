<!-- agent-context: read this before editing the module -->

# platform/composition

## Purpose
The **sanctioned cross-engine read location** — the one place Engine-B product code is allowed to read inherited Engine-A tables (`projects`, `tasks`, `comments`, …) **by value**. Peer of `platform/costs` (which does the same for inherited spend). Exposes narrow, batch, **degrade-never-throw** read-seams so feature modules consume an *interface*, never raw inherited SQL, and never couple to each other (ARD 0007 engine boundary; design `95` §1).

## Public surface
The barrel `src/opzava/platform/composition/index.ts` is truth.

- **project-read-seam** (4): `createSqliteProjectReadSeam`, `NULL_PROJECT_READ_SEAM`, type `ProjectReadSeam`, type `ProjectProjection` — batch `readProjectsByIds(ids) → {name,color,description}` by value.
- **task-read-seam** (4): `createSqliteTaskReadSeam`, `NULL_TASK_READ_SEAM`, type `TaskReadSeam`, type `TaskCounts` — `countTasksByProject(projectId) → {open,total}`.

Consumer-driven: methods accrete here as consumers need them (todos/goals will add by-id task projections; `ProjectMemberReadSeam` lands with its first consumer per `95` §1 / 100 T2).

## Dependencies
- **Outbound:** `better-sqlite3` only. **No `@/lib` import** — the adapters issue raw SQL against inherited tables directly (allowed *here*, the sanctioned location; nowhere else in Engine B).
- **Inbound:** Engine-B feature modules (`modules/projects` `readProjectCard`/`readNeedsYouRollup`, future `todos`/`goals`) import the seam **interfaces + `NULL_*` constants**; thin routes wire the concrete `createSqlite*` adapters at the composition root.

## Invariants
1. **Degrade, never throw.** Every adapter probes `sqlite_master` for the inherited table; absent table → empty/zero projection (a fresh Engine-B db with no inherited migrations must not crash a reader). Unknown ids → `undefined` (projects) / zeros (task counts).
2. **By value, read-only.** Seams only `SELECT`; they never write inherited tables and carry no FK. Ids cross as strings (inherited PKs are INTEGER — SQLite affinity coerces on the `IN (…)`/`= ?` predicate; results re-keyed via `String(id)`).
3. **SQL stays sealed.** Inherited-table SQL (`FROM projects`, `FROM tasks`) lives **only** in these adapters. A feature module touching inherited SQL directly is a boundary violation — route it through a seam (the gate extension to scan `modules/*` for inherited-table SQL is the planned hardening per `95` §1).
4. **Engine-boundary:** this is Engine B reading Engine A one-way (A→B is the only sanctioned direction; `src/lib` never imports composition). See `test/engine-boundary.test.mjs`, `docs/architecture/engine-boundary.md`, ARD 0007.
