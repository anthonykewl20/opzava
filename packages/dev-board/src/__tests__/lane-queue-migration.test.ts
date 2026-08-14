import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../../identity-access/drizzle/0022_dev_board_lane_queue.sql", import.meta.url),
  "utf8",
);

describe("TB-01b-5 lane queue migration", () => {
  it("keeps the deferred membership trigger RLS-safe and fail-closed without tenant context", () => {
    expect(migration).toMatch(/security\s+definer/i);
    expect(migration).toMatch(/set\s+search_path\s*=\s*public/i);
    expect(migration).toMatch(/alter function public\.dev_board_assert_todo_queue_membership\(\) owner to opzava_owner/i);
    expect(migration).toMatch(/if\s+app\.current_org_id\(\)\s+is\s+null\s+then[\s\S]*raise exception/i);
    expect(migration).toMatch(/create constraint trigger dev_board_dev_ticket_todo_queue_membership_check[\s\S]*deferrable initially deferred/i);
    expect(migration).toMatch(/create constraint trigger dev_board_lane_queue_todo_membership_check[\s\S]*deferrable initially deferred/i);
  });
});
