import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../../identity-access/drizzle/0025_dev_board_archive.sql", import.meta.url),
  "utf8",
);
const journal = readFileSync(
  new URL("../../../identity-access/drizzle/meta/_journal.json", import.meta.url),
  "utf8",
);

describe("TB-01b-7 archive migration", () => {
  it("preserves archive provenance and all six last-active lanes", () => {
    expect(migration).toMatch(
      /last_active_lane is null or last_active_lane in \('backlog', 'todo', 'blocked', 'in_progress', 'review', 'done'\)/i,
    );
    expect(migration).toMatch(/add column archived_by_user_id text/i);
    expect(migration).toMatch(
      /add column archived_reason text check \(archived_reason is null or \(length\(btrim\(archived_reason\)\) between 1 and 4000\)\)/i,
    );
    expect(journal).toMatch(/"idx":\s*25[\s\S]*"tag":\s*"0025_dev_board_archive"/);
  });
});
