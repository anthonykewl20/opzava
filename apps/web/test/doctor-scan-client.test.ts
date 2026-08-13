import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultDoctorScanClient, readDoctorScanScope } from "@/lib/doctor-scan";

afterEach(() => vi.unstubAllGlobals());

describe("doctor scan worker client", () => {
  it("reads and validates the worker-bound scan scope", () => {
    const organizationId = "22222222-2222-4222-8222-222222222222";
    expect(readDoctorScanScope({ OPZAVA_PLATFORM_ORGANIZATION_ID: organizationId })).toEqual({
      ok: true,
      value: { organizationId, scope: "platform-gateway" },
    });
    expect(
      readDoctorScanScope({
        OPZAVA_PLATFORM_ORGANIZATION_ID: organizationId,
        DOCTOR_SCAN_SCOPE: "custom",
      }),
    ).toEqual({
      ok: true,
      value: { organizationId, scope: "custom" },
    });
    expect(readDoctorScanScope({})).toMatchObject({
      ok: false,
      error: { code: "web.doctorScanNotConfigured" },
    });
    expect(
      readDoctorScanScope({ OPZAVA_PLATFORM_ORGANIZATION_ID: "not-a-uuid" }),
    ).toMatchObject({ ok: false, error: { code: "web.doctorScanInvalidConfig" } });
  });
  it("fails closed when the worker is not configured", async () => {
    const result = await defaultDoctorScanClient({}).readLatest({ organizationId: "org-1", scope: "platform-gateway" });
    expect(result).toMatchObject({ ok: false, error: { code: "web.doctorScanNotConfigured" } });
  });

  it("calls all typed routes and returns the worker shape", async () => {
    const latest = {
      availability: "available" as const,
      latest: {
        status: "succeeded" as const,
        runCheckedAt: "2026-07-21T00:00:00.000Z",
        checksRun: 1,
        checksSkipped: 0,
        findings: [],
      },
      inProgress: true,
    };
    const fetchMock = vi.fn(async (...args: [string, RequestInit]) => {
      void args;
      return new Response(JSON.stringify(latest), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = defaultDoctorScanClient({ PROVISIONING_WORKER_URL: "http://worker:19188", PROVISIONING_WORKER_TOKEN: "token" });
    const input = { organizationId: "org-1", scope: "platform-gateway" };

    await expect(client.readLatest(input)).resolves.toEqual({ ok: true, value: latest });
    await expect(client.ensureFresh(input)).resolves.toEqual({ ok: true, value: latest });
    await expect(client.force(input)).resolves.toEqual({ ok: true, value: latest });
    expect(fetchMock.mock.calls.map(([url, init]) => [url, (init as RequestInit).method])).toEqual([
      ["http://worker:19188/internal/doctor-scan?organizationId=org-1&scope=platform-gateway", "GET"],
      ["http://worker:19188/internal/doctor-scan/ensure?organizationId=org-1&scope=platform-gateway", "POST"],
      ["http://worker:19188/internal/doctor-scan/force?organizationId=org-1&scope=platform-gateway", "POST"],
    ]);
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).toEqual({ authorization: "Bearer token" });
  });
});
