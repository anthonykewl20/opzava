import { makeTenantId } from "@opzava/shared-kernel";
import { describe, expect, it } from "vitest";

import { verifyGatewayBrokerTenantOrg, type TenantOrgLookup } from "../runtime/tenant-org-check.js";

const configuredTenantId = makeTenantId("c48e6c03-8b73-46b5-93fb-a431f46e68e3");
const staleTenantId = makeTenantId("30edebd6-6343-40a8-a95f-bbea779574e0");
const seededOrgId = "c48e6c03-8b73-46b5-93fb-a431f46e68e3";

function lookupReturning(value: string | undefined): TenantOrgLookup {
  return { resolveSeededOrgId: async () => value };
}

function lookupThrowing(error: unknown): TenantOrgLookup {
  return { resolveSeededOrgId: async () => Promise.reject(error) };
}

describe("verifyGatewayBrokerTenantOrg", () => {
  it("resolves when the configured tenant matches the seeded org", async () => {
    const result = await verifyGatewayBrokerTenantOrg(
      configuredTenantId,
      lookupReturning(seededOrgId),
    );

    expect(result).toMatchObject({
      ok: true,
      value: { configuredTenantId, seededOrgId },
    });
  });

  it("matches case-insensitively (env casing vs db casing)", async () => {
    const result = await verifyGatewayBrokerTenantOrg(
      makeTenantId("C48E6C03-8B73-46B5-93FB-A431F46E68E3"),
      lookupReturning(seededOrgId),
    );

    expect(result.ok).toBe(true);
  });

  it("fails loud with BOTH ids in detail when the env tenant has drifted from the seeded org", async () => {
    const result = await verifyGatewayBrokerTenantOrg(staleTenantId, lookupReturning(seededOrgId));

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "gatewayBroker.tenantOrgMismatch",
        details: { configuredTenantId: staleTenantId, seededOrgId },
      },
    });
    // The message must be actionable and never reach the browser (boot-time only).
    expect((result as { readonly error: { readonly message: string } }).error.message).toContain(
      seededOrgId,
    );
  });

  it("fails loud when no org has been seeded yet (resolves to no org)", async () => {
    const result = await verifyGatewayBrokerTenantOrg(staleTenantId, lookupReturning(undefined));

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "gatewayBroker.tenantOrgUnresolved",
        details: { configuredTenantId: staleTenantId },
      },
    });
  });

  it("fails loud with a cause when the seeded-org lookup itself throws", async () => {
    const cause = new Error("connection refused");
    const result = await verifyGatewayBrokerTenantOrg(configuredTenantId, lookupThrowing(cause));

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "gatewayBroker.tenantOrgLookupFailed",
        details: { configuredTenantId },
      },
    });
    expect((result as { readonly error: { readonly cause: unknown } }).error.cause).toBe(cause);
  });
});
