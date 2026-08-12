import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { InMemoryScheduledJobRepository } from "../scheduled-job-repository.js";

const organizationId = randomUUID();
const now = new Date("2026-08-13T00:00:00Z");
const job = { jobKey: "openclaw.doctor-scan", organizationId, scope: "platform-gateway", cadenceSeconds: 300, now };

describe("InMemoryScheduledJobRepository", () => {
  it("registers idempotently and claims only due, unleased work", () => {
    const repository = new InMemoryScheduledJobRepository();
    repository.register(job); repository.register({ ...job, cadenceSeconds: 600 });
    const first = repository.claimDue({ organizationId, now, batchLimit: 10 });
    const second = repository.claimDue({ organizationId, now, batchLimit: 10 });
    expect(first).toHaveLength(1); expect(second).toEqual([]);
    expect(first[0]?.cadenceSeconds).toBe(600);
  });

  it("ack advances cadence and clears the lease while fencing wrong and expired tokens", () => {
    const repository = new InMemoryScheduledJobRepository(); repository.register(job);
    const claim = repository.claimDue({ organizationId, now, batchLimit: 1 })[0]!;
    expect(repository.ack({ ...job, leaseToken: randomUUID(), now, cadenceSeconds: 300 })).toBe(false);
    expect(repository.ack({ ...job, leaseToken: claim.dispatchLeaseToken!, now: new Date(now.getTime() + 60_001), cadenceSeconds: 300 })).toBe(false);
    const reclaimed = repository.claimDue({ organizationId, now: new Date(now.getTime() + 60_001), batchLimit: 1 })[0]!;
    const ackAt = new Date(now.getTime() + 61_000);
    expect(repository.ack({ ...job, leaseToken: reclaimed.dispatchLeaseToken!, now: ackAt, cadenceSeconds: 300 })).toBe(true);
    expect(repository.values()[0]).toMatchObject({ dispatchLeaseToken: null, nextRunAt: new Date(ackAt.getTime() + 300_000), lastCompletedAt: ackAt });
  });

  it("fail increments failures, stores a bounded code, and applies backoff", () => {
    const repository = new InMemoryScheduledJobRepository(); repository.register(job);
    const claim = repository.claimDue({ organizationId, now, batchLimit: 1 })[0]!;
    expect(repository.fail({ ...job, leaseToken: claim.dispatchLeaseToken!, now, failureCode: "handler_failed", retryBackoffSeconds: 30 })).toBe(true);
    expect(repository.values()[0]).toMatchObject({ consecutiveFailures: 1, lastFailureCode: "handler_failed", nextRunAt: new Date(now.getTime() + 30_000), dispatchLeaseToken: null });
  });
});
