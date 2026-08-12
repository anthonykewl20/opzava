import { InMemoryDoctorScanRepository } from "@opzava/adapters";
import type { DoctorLintRawResult } from "@opzava/ports";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";
import { describe, expect, it, vi } from "vitest";

import { OpenClawDoctorScanOrchestrator } from "./orchestrator.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const scope = "platform-gateway";
const scanScope = { organizationId, scope };
const safeEnvelope = JSON.stringify({
  checksRun: 1,
  checksSkipped: 0,
  findings: [
    {
      checkId: "unknown-plugin.check",
      severity: "warning",
      message: "RAW_STDOUT_SECRET",
      path: "/private/secret",
    },
  ],
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

async function settleDetached(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("OpenClawDoctorScanOrchestrator", () => {
  it("reports an honest unknown state when readLatest has no durable run", async () => {
    const service = new OpenClawDoctorScanOrchestrator(new InMemoryDoctorScanRepository(), {
      runDoctorLintScan: vi.fn(),
    });

    await expect(service.readLatest(scanScope)).resolves.toEqual({
      availability: "unknown",
      latest: null,
      inProgress: false,
    });
  });

  it("readLatest returns the latest durable run and findings", async () => {
    const repository = new InMemoryDoctorScanRepository();
    const claim = repository.claim({
      ...scanScope,
      kind: "force",
      leaseDurationMs: 1_000,
      now: new Date(1_000),
    })!;
    repository.publish({
      ...scanScope,
      leaseToken: claim.leaseToken,
      startedAt: new Date(1_000),
      completedAt: new Date(1_001),
      run: {
        status: "succeeded",
        checksRun: 1,
        checksSkipped: 0,
        findings: [
          {
            checkId: "unknown",
            severity: "info",
            group: "Other",
            summary: "Safe summary",
            detailState: "redacted_unavailable",
            locationLabel: null,
            targetLabel: null,
            fixHint: null,
            suppressed: false,
            suppressionReason: null,
          },
        ],
      },
    });

    const service = new OpenClawDoctorScanOrchestrator(repository, { runDoctorLintScan: vi.fn() });
    const view = await service.readLatest(scanScope);
    expect(view.availability).toBe("available");
    expect(view.latest?.findings).toHaveLength(1);
    expect(view.latest?.checksRun).toBe(1);
  });

  it("ensureFresh claims and returns immediately while its delayed scan remains in progress", async () => {
    const scan = deferred<Result<DoctorLintRawResult>>();
    const runtime = { runDoctorLintScan: vi.fn(() => scan.promise) };
    const service = new OpenClawDoctorScanOrchestrator(new InMemoryDoctorScanRepository(), runtime);

    await expect(service.ensureFresh(scanScope)).resolves.toMatchObject({
      availability: "unknown",
      latest: null,
      inProgress: true,
    });
    expect(runtime.runDoctorLintScan).toHaveBeenCalledTimes(1);

    scan.resolve(ok({ exitCode: 0, stdout: safeEnvelope }));
    await settleDetached();
  });

  it("coalesces concurrent ensureFresh calls onto one in-flight scan", async () => {
    const scan = deferred<Result<DoctorLintRawResult>>();
    const runtime = { runDoctorLintScan: vi.fn(() => scan.promise) };
    const service = new OpenClawDoctorScanOrchestrator(new InMemoryDoctorScanRepository(), runtime);

    const [first, second] = await Promise.all([
      service.ensureFresh(scanScope),
      service.ensureFresh(scanScope),
    ]);
    expect(first.inProgress).toBe(true);
    expect(second.inProgress).toBe(true);
    expect(runtime.runDoctorLintScan).toHaveBeenCalledTimes(1);

    scan.resolve(ok({ exitCode: 0, stdout: safeEnvelope }));
    await settleDetached();
  });

  it("honors cadence after completion and does not start another scan", async () => {
    const runtime = {
      runDoctorLintScan: vi.fn(async () =>
        ok<DoctorLintRawResult>({ exitCode: 0, stdout: safeEnvelope }),
      ),
    };
    const service = new OpenClawDoctorScanOrchestrator(new InMemoryDoctorScanRepository(), runtime);

    expect((await service.ensureFresh(scanScope)).inProgress).toBe(true);
    await settleDetached();
    expect((await service.ensureFresh(scanScope)).inProgress).toBe(false);
    expect(runtime.runDoctorLintScan).toHaveBeenCalledTimes(1);
  });

  it("force is authorization-gated and respects the 30-second minimum interval", async () => {
    let now = 100_000;
    const runtime = {
      runDoctorLintScan: vi.fn(async () =>
        ok<DoctorLintRawResult>({ exitCode: 0, stdout: safeEnvelope }),
      ),
    };
    const service = new OpenClawDoctorScanOrchestrator(
      new InMemoryDoctorScanRepository(),
      runtime,
      { authorizeForce: () => true, now: () => new Date(now) },
    );

    expect((await service.force(scanScope)).inProgress).toBe(true);
    await settleDetached();
    now += 29_999;
    const second = await service.force(scanScope);
    expect(second.inProgress).toBe(false);
    expect(second.latest?.status).toBe("succeeded");
    expect(runtime.runDoctorLintScan).toHaveBeenCalledTimes(1);
  });

  it("publishes only structurally redacted findings and never persists raw stdout", async () => {
    const repository = new InMemoryDoctorScanRepository();
    const service = new OpenClawDoctorScanOrchestrator(repository, {
      runDoctorLintScan: vi.fn(async () =>
        ok<DoctorLintRawResult>({ exitCode: 1, stdout: safeEnvelope }),
      ),
    });

    await service.ensureFresh(scanScope);
    await settleDetached();
    const latest = repository.readLatest(scanScope);
    expect(latest?.status).toBe("succeeded");
    expect(latest?.findings[0]).toMatchObject({
      checkId: "unknown-plugin.check",
      severity: "warning",
      summary: "OpenClaw doctor reported a warning finding in an unclassified check.",
      detailState: "redacted_unavailable",
      locationLabel: null,
      targetLabel: null,
      fixHint: null,
    });
    expect(JSON.stringify(latest)).not.toContain("RAW_STDOUT_SECRET");
    expect(JSON.stringify(latest)).not.toContain("/private/secret");
  });

  it("publishes a bounded unavailable run when execution fails", async () => {
    const repository = new InMemoryDoctorScanRepository();
    const service = new OpenClawDoctorScanOrchestrator(repository, {
      runDoctorLintScan: vi.fn(async () =>
        err(
          new DomainError({
            code: "RAW_EXCEPTION_SECRET",
            message: "secret",
          }),
        ),
      ),
    });

    await service.tick(scanScope);
    await settleDetached();
    expect(repository.readLatest(scanScope)).toEqual({
      status: "unavailable",
      checksRun: 0,
      checksSkipped: 0,
      findings: [],
      failureCode: "doctor_scan_unavailable",
    });
  });
});
