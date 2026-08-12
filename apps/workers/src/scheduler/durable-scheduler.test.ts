import { InMemoryScheduledJobRepository } from "@opzava/adapters";
import { describe, expect, it, vi } from "vitest";

import { DurableScheduler } from "./durable-scheduler.js";

const organizationId = "11111111-1111-4111-8111-111111111111";
const identity = { jobKey: "test.job", organizationId, scope: "platform" };

describe("DurableScheduler", () => {
  it("wakes, claims, dispatches, and acknowledges", async () => {
    const repository = new InMemoryScheduledJobRepository();
    const now = new Date("2026-08-13T00:00:00Z");
    repository.register({ ...identity, cadenceSeconds: 300, now });
    const handler = vi.fn(async () => {});
    const scheduler = new DurableScheduler(repository, new Map([[identity.jobKey, handler]]), { organizationId, now: () => now });
    await scheduler.wake();
    expect(handler).toHaveBeenCalledWith({ organizationId, scope: "platform" });
    expect(repository.values()[0]).toMatchObject({ dispatchLeaseToken: null, consecutiveFailures: 0, nextRunAt: new Date(now.getTime() + 300_000) });
  });

  it("maps raw handler errors to one bounded failure code", async () => {
    const repository = new InMemoryScheduledJobRepository();
    const now = new Date("2026-08-13T00:00:00Z");
    repository.register({ ...identity, cadenceSeconds: 300, now });
    const scheduler = new DurableScheduler(repository, new Map([[identity.jobKey, async () => { throw new Error("secret raw upstream text"); }]]), { organizationId, now: () => now, retryBackoffSeconds: 30 });
    await scheduler.wake();
    expect(repository.values()[0]).toMatchObject({ lastFailureCode: "handler_failed", consecutiveFailures: 1, nextRunAt: new Date(now.getTime() + 30_000) });
    expect(JSON.stringify(repository.values())).not.toContain("secret raw upstream text");
  });

  it("stops claiming and waits for an active handler", async () => {
    const repository = new InMemoryScheduledJobRepository();
    const now = new Date("2026-08-13T00:00:00Z");
    repository.register({ ...identity, cadenceSeconds: 300, now });
    let release!: () => void;
    const active = new Promise<void>((resolve) => { release = resolve; });
    const handler = vi.fn(() => active);
    const scheduler = new DurableScheduler(repository, new Map([[identity.jobKey, handler]]), { organizationId, now: () => now, sleep: async () => {} });
    scheduler.start();
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    let stopped = false;
    const stopping = scheduler.stop().then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);
    release(); await stopping;
    await scheduler.wake();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
