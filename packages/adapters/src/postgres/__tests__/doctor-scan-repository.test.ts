import { describe, expect, it } from "vitest";

import { InMemoryDoctorScanRepository } from "../doctor-scan-repository.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const scope = "platform-gateway";
const run = { status: "succeeded" as const, checksRun: 1, checksSkipped: 0, findings: [] };

describe("doctor scan repository lease contract (in-memory)", () => {
  it("allows exactly one concurrent-equivalent claim", () => {
    const repository = new InMemoryDoctorScanRepository();
    const input = { organizationId, scope, kind: "force" as const, leaseDurationMs: 10_000, now: new Date(100_000) };
    expect(repository.claim(input)).not.toBeNull();
    expect(repository.claim(input)).toBeNull();
  });

  it("fences a stale publisher after an expired lease is stolen", () => {
    const repository = new InMemoryDoctorScanRepository();
    const first = repository.claim({ organizationId, scope, kind: "force", leaseDurationMs: 100, now: new Date(1_000) });
    const second = repository.claim({ organizationId, scope, kind: "force", leaseDurationMs: 100, forceCooldownMs: 50, now: new Date(1_101) });
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(repository.publish({ organizationId, scope, leaseToken: first!.leaseToken, startedAt: new Date(1_000), completedAt: new Date(1_102), run })).toBeNull();
    expect(repository.publish({ organizationId, scope, leaseToken: second!.leaseToken, startedAt: new Date(1_101), completedAt: new Date(1_102), run })).not.toBeNull();
  });

  it("is restart-safe when a new instance shares durable state", () => {
    const leases = new Map();
    const runs = new Map();
    const crashed = new InMemoryDoctorScanRepository(leases, runs);
    expect(crashed.claim({ organizationId, scope, kind: "force", leaseDurationMs: 100, now: new Date(2_000) })).not.toBeNull();
    const restarted = new InMemoryDoctorScanRepository(leases, runs);
    expect(restarted.claim({ organizationId, scope, kind: "force", leaseDurationMs: 100, forceCooldownMs: 50, now: new Date(2_101) })).not.toBeNull();
  });
});
