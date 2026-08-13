import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OpenClawDoctorScanPort } from "./orchestrator.js";
import { createConnectionsInternalHttpServer } from "../provisioning/connections-http-server.js";

const organizationId = "11111111-1111-4111-8111-111111111111";
const scope = "platform-gateway";
const servers: ReturnType<typeof createConnectionsInternalHttpServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function start(port: OpenClawDoctorScanPort): Promise<string> {
  const server = createConnectionsInternalHttpServer({
    internalToken: "internal-token",
    doctorScanPort: port,
    platformOrganizationId: organizationId,
    doctorScanScope: scope,
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function fakePort(): OpenClawDoctorScanPort {
  return {
    readLatest: vi.fn(async () => ({ availability: "unknown" as const, latest: null, inProgress: false })),
    ensureFresh: vi.fn(async () => ({ availability: "unknown" as const, latest: null, inProgress: true })),
    force: vi.fn(async () => ({ availability: "unknown" as const, latest: null, inProgress: true })),
    tick: vi.fn(async () => ({ availability: "unknown" as const, latest: null, inProgress: false })),
  };
}

function request(baseUrl: string, path: string, options: { method?: string; token?: boolean } = {}) {
  return fetch(`${baseUrl}${path}?organizationId=${organizationId}&scope=${scope}`, {
    method: options.method ?? "GET",
    headers: options.token === false ? {} : { authorization: "Bearer internal-token" },
  });
}

describe("doctor scan internal HTTP routes", () => {
  it("denies unauthenticated requests", async () => {
    const baseUrl = await start(fakePort());
    expect((await request(baseUrl, "/internal/doctor-scan", { token: false })).status).toBe(401);
  });

  it("returns the honest unknown state when no durable run exists", async () => {
    const baseUrl = await start(fakePort());
    await expect((await request(baseUrl, "/internal/doctor-scan")).json()).resolves.toEqual({
      availability: "unknown", latest: null, inProgress: false,
    });
  });

  it("returns ensureFresh in-progress state", async () => {
    const baseUrl = await start(fakePort());
    await expect((await request(baseUrl, "/internal/doctor-scan/ensure", { method: "POST" })).json()).resolves.toMatchObject({ inProgress: true });
  });

  it("routes force through the orchestrator authorization gate", async () => {
    const port = fakePort();
    vi.mocked(port.force).mockRejectedValueOnce(new Error("SECRET_STDERR force denied"));
    const baseUrl = await start(port);
    const response = await request(baseUrl, "/internal/doctor-scan/force", { method: "POST" });
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('{"error":"doctor_scan_failed"}');
    expect(port.force).toHaveBeenCalledWith({ organizationId, scope });
  });

  it("serializes only the closed persisted DTO and drops raw diagnostic fields", async () => {
    const port = fakePort();
    vi.mocked(port.readLatest).mockResolvedValueOnce({
      availability: "available",
      inProgress: false,
      latest: {
        status: "succeeded", runCheckedAt: "2026-07-21T00:00:00.000Z", checksRun: 1, checksSkipped: 0,
        findings: [{
          checkId: "gateway.config", severity: "warning", group: "gateway",
          summary: "Safe summary", detailState: "redacted_unavailable", locationLabel: null,
          targetLabel: null, fixHint: null, suppressed: false, suppressionReason: null,
          ...({ stdout: "SECRET_SENTINEL", stderr: "SECRET_SENTINEL" } as object),
        }],
        ...({ stdout: "SECRET_SENTINEL", stderr: "SECRET_SENTINEL", gatewayDto: { token: "SECRET_SENTINEL" } } as object),
      },
    });
    const baseUrl = await start(port);
    const body = await (await request(baseUrl, "/internal/doctor-scan")).text();
    expect(body).not.toContain("SECRET_SENTINEL");
    expect(body).not.toContain("stdout");
    expect(body).not.toContain("stderr");
    expect(JSON.parse(body)).toMatchObject({
      latest: { runCheckedAt: "2026-07-21T00:00:00.000Z" },
    });
  });

  it("rejects a caller-selected tenant or scope", async () => {
    const baseUrl = await start(fakePort());
    const response = await fetch(`${baseUrl}/internal/doctor-scan?organizationId=22222222-2222-4222-8222-222222222222&scope=${scope}`, { headers: { authorization: "Bearer internal-token" } });
    expect(response.status).toBe(400);
  });
});
