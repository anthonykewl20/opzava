import type { AuthSession, SessionId, SessionToken } from "@opzava/ports";
import { makeOrgId, makeTenantId, makeUserId, type OrgId } from "@opzava/shared-kernel";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  withTenantForSession: vi.fn(),
}));

vi.mock("@opzava/adapters", () => ({
  db: { execute: vi.fn() },
  sql: (strings: TemplateStringsArray, ...values: readonly unknown[]) => ({ strings, values }),
}));

vi.mock("@opzava/identity-access/better-auth", () => ({
  authPort: { getSession: mocks.getSession },
  withTenantForSession: mocks.withTenantForSession,
}));

import { getAppSessionContext } from "../lib/session";

function sessionFixture(overrides: {
  readonly authorizationVersion: string;
  readonly issuedAt: Date;
}): AuthSession {
  const orgId = makeOrgId("org-1");
  const membership = {
    orgId,
    tenantId: makeTenantId("org-1"),
    membershipVersion: 7,
    authorizationVersion: overrides.authorizationVersion,
    roleKeys: ["owner"],
  } as const;

  return {
    sessionId: "session-1" as SessionId,
    sessionToken: "token-1" as SessionToken,
    identity: {
      userId: makeUserId("user-1"),
      email: "owner@example.test",
      activeMembership: membership,
      memberships: [membership],
    },
    issuedAt: overrides.issuedAt,
    expiresAt: new Date("2026-07-21T00:00:00.000Z"),
  };
}

beforeEach(() => {
  mocks.getSession.mockReset();
  mocks.withTenantForSession.mockReset();
  mocks.withTenantForSession.mockImplementation(
    async (
      _session: AuthSession,
      _orgId: OrgId,
      fn: (tx: { execute(query: unknown): Promise<unknown> }) => Promise<unknown> | unknown,
    ) =>
      fn({
        execute: async () => ({
          rows: [
            {
              user_id: "user-1",
              user_name: "Owner",
              user_email: "owner@example.test",
              organization_id: "org-1",
              organization_name: "Opzava",
              organization_lifecycle_state: "active",
              workspace_id: "workspace-1",
              workspace_name: "Admin",
            },
          ],
        }),
      }),
  );
});

describe("getAppSessionContext", () => {
  it("uses the first-class authorization version independently of session issue time", async () => {
    mocks.getSession.mockResolvedValueOnce({
      ok: true,
      value: sessionFixture({
        authorizationVersion: "opaque-authz-7",
        issuedAt: new Date("2026-07-20T00:00:00.000Z"),
      }),
    });

    const first = await getAppSessionContext(new Headers());

    mocks.getSession.mockResolvedValueOnce({
      ok: true,
      value: sessionFixture({
        authorizationVersion: "opaque-authz-7",
        issuedAt: new Date("2026-07-20T12:00:00.000Z"),
      }),
    });

    const second = await getAppSessionContext(new Headers());

    expect(first?.authorizationVersion).toBe("opaque-authz-7");
    expect(second?.authorizationVersion).toBe(first?.authorizationVersion);
    expect(second?.authorizationVersion).not.toContain("issued:");
  });
});
