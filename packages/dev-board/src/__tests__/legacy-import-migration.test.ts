import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../../identity-access/drizzle/0026_dev_board_legacy_import.sql", import.meta.url), "utf8");
const manifest = readFileSync(new URL("../../../identity-access/drizzle/manifest.json", import.meta.url), "utf8");
const journal = readFileSync(new URL("../../../identity-access/drizzle/meta/_journal.json", import.meta.url), "utf8");

describe("TB-01b-8 legacy import migration", () => {
  it("registers both tenant-isolated import tables", () => {
    expect(manifest).toMatch(/0026_dev_board_legacy_import\.sql/);
    expect(journal).toMatch(/"idx":\s*26[\s\S]*"tag":\s*"0026_dev_board_legacy_import"/);
    for (const table of ["dev_board_historical_record", "dev_board_legacy_task_alias"]) {
      expect(migration).toMatch(new RegExp(`alter table public\\.${table} owner to opzava_owner`, "i"));
       expect(migration).toMatch(new RegExp(`grant select, insert, update on table public\\.${table} to opzava_app`, "i"));
       expect(migration).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, "i"));
       expect(migration).toMatch(new RegExp(`alter table public\\.${table} force row level security`, "i"));
       for (const policy of ["tenant_isolation", "tenant_context_required", "owner_admin"]) {
         expect(migration).toMatch(new RegExp(`${table}.*${policy}|${policy}.*${table}`, "is"));
       }
    }
  });

  it("preserves the alias winner and immutable historical checks", () => {
    expect(migration).toMatch(/primary key \(organization_id, legacy_task_id\)/i);
    expect(migration).toMatch(/legacy_task_alias_ticket_organization_fk foreign key \(dev_ticket_id, organization_id\)/i);
    expect(migration).toMatch(/preserved_payload_digest ~ '\^\[a-f0-9\]\{64\}\$'/i);
    expect(migration).toMatch(/source_disposition in \('promoted_backlog', 'quarantined_no_owner', 'historical_candidate'\)/i);
    expect(migration).toMatch(/completion_gate is null or completion_gate in \('legacy_unverified', 'reconciled_historical'\)/i);
  });
});
