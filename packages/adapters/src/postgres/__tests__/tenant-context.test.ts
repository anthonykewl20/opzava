import { describe, expect, it } from "vitest";

import { assertRuntimeDatabaseRole, type TenantQueryable } from "../tenant-context.js";

function queryableReturning(row: Record<string, unknown>): TenantQueryable {
  return {
    execute: async () => ({ rows: [row] })
  };
}

describe("assertRuntimeDatabaseRole", () => {
  it("accepts the runtime application role only", async () => {
    await expect(
      assertRuntimeDatabaseRole(
        queryableReturning({
          session_role: "opzava_app",
          is_super: false,
          bypass_rls: false
        })
      )
    ).resolves.toBeUndefined();
  });

  it("rejects non-runtime, superuser, and BYPASSRLS roles", async () => {
    await expect(
      assertRuntimeDatabaseRole(
        queryableReturning({
          session_role: "opzava_owner",
          is_super: false,
          bypass_rls: false
        })
      )
    ).rejects.toMatchObject({
      status: 403,
      code: "postgres.runtimeDatabaseRoleMismatch"
    });

    await expect(
      assertRuntimeDatabaseRole(
        queryableReturning({
          session_role: "opzava_app",
          is_super: true,
          bypass_rls: false
        })
      )
    ).rejects.toMatchObject({
      status: 403,
      code: "postgres.runtimeDatabaseRoleMismatch"
    });

    await expect(
      assertRuntimeDatabaseRole(
        queryableReturning({
          session_role: "opzava_app",
          is_super: false,
          bypass_rls: true
        })
      )
    ).rejects.toMatchObject({
      status: 403,
      code: "postgres.runtimeDatabaseRoleMismatch"
    });
  });
});
