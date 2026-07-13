import { afterEach, describe, expect, it, vi } from "vitest";

import {
  pollUntilTerminal,
  postConnectionsMutation,
  type MutationResult,
} from "../lib/connections-mutation-client";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.useRealTimers();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("postConnectionsMutation sad paths", () => {
  it("returns data on 200", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(200, { opId: "op-1", status: "pending" }));
    const result = await postConnectionsMutation<{ opId: string }>("/x", {});
    expect(result).toMatchObject({ ok: true, data: { opId: "op-1" } });
  });

  it("maps 401/403/400/502 to typed failures carrying the server code", async () => {
    const cases = [
      [401, "unauthorized"],
      [403, "forbidden"],
      [400, "invalid"],
      [502, "server"],
    ] as const;
    for (const [status, kind] of cases) {
      globalThis.fetch = vi.fn(async () =>
        jsonResponse(status, { message: "boom", code: "some.code" }),
      );
      const result = await postConnectionsMutation("/x", {});
      expect(result).toMatchObject({ ok: false, kind, code: "some.code", status });
    }
  });

  it("maps an aborted/timed-out request to a timeout failure, never a hang", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    });
    const result = await postConnectionsMutation("/x", {});
    expect(result).toMatchObject({ ok: false, kind: "timeout" });
  });

  it("maps a network failure distinctly from a timeout", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const result = await postConnectionsMutation("/x", {});
    expect(result).toMatchObject({ ok: false, kind: "network" });
  });

  it("treats an unreadable 200 body as a server failure instead of returning garbage", async () => {
    globalThis.fetch = vi.fn(async () => new Response("<html>proxy error</html>", { status: 200 }));
    const result = await postConnectionsMutation("/x", {});
    expect(result).toMatchObject({ ok: false, kind: "server" });
  });
});

describe("pollUntilTerminal pending backoff", () => {
  // Records the sleep schedule while running it at zero delay, so the backoff curve is asserted
  // exactly without the test actually waiting.
  function captureDelays(): { readonly delays: number[]; restore: () => void } {
    const delays: number[] = [];
    const realSetTimeout = globalThis.setTimeout;
    const record = (handler: TimerHandler, ms?: number) => {
      delays.push(ms ?? 0);
      // Fire immediately: the schedule is what's under test, not the waiting.
      return realSetTimeout(handler, 0);
    };
    const spy = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation(record as unknown as typeof globalThis.setTimeout);
    return { delays, restore: () => spy.mockRestore() };
  }

  // #168: a disconnect paces gateway logouts over 60-120s+. Sampling that at a flat interval means
  // hundreds of polls; the interval must grow toward a ceiling instead.
  it("grows the pending interval toward the ceiling instead of hammering a long operation", async () => {
    const { delays, restore } = captureDelays();
    let polls = 0;

    const outcome = await pollUntilTerminal<{ status: string }>({
      poll: async () => ({ ok: true, data: { status: ++polls < 8 ? "pending" : "disconnected" } }),
      isTerminal: (data) => data.status !== "pending",
      intervalMs: 1_000,
      maxIntervalMs: 5_000,
      backoffFactor: 2,
      shouldContinue: () => true,
    });
    restore();

    expect(outcome).toMatchObject({ ok: true, data: { status: "disconnected" } });
    // Fast first sample (a 1-agent disconnect lands immediately), then backing off and pinning at
    // the ceiling — never seven flat 1s polls.
    expect(delays).toEqual([1_000, 2_000, 4_000, 5_000, 5_000, 5_000, 5_000]);
  });

  it("keeps a constant interval when no ceiling is set, so existing connect flows are unchanged", async () => {
    const { delays, restore } = captureDelays();
    let polls = 0;

    await pollUntilTerminal<{ status: string }>({
      poll: async () => ({ ok: true, data: { status: ++polls < 4 ? "pending" : "connected" } }),
      isTerminal: (data) => data.status !== "pending",
      intervalMs: 1_750,
      shouldContinue: () => true,
    });
    restore();

    expect(delays).toEqual([1_750, 1_750, 1_750]);
  });
});

describe("pollUntilTerminal sad paths", () => {
  it("retries transient blips with backoff then reaches the terminal state", async () => {
    const samples: MutationResult<{ status: string }>[] = [
      { ok: false, kind: "network", message: "blip", code: null, status: null },
      { ok: true, data: { status: "pending" } },
      { ok: false, kind: "timeout", message: "blip", code: null, status: null },
      { ok: true, data: { status: "connected" } },
    ];
    let index = 0;
    const outcome = await pollUntilTerminal({
      poll: async () => samples[Math.min(index++, samples.length - 1)]!,
      isTerminal: (data) => data.status !== "pending",
      intervalMs: 1,
      shouldContinue: () => true,
    });
    expect(outcome).toMatchObject({ ok: true, data: { status: "connected" } });
    expect(index).toBe(4);
  });

  it("surfaces transient failures once the consecutive budget is exhausted", async () => {
    const outcome = await pollUntilTerminal<{ status: string }>({
      poll: async () => ({ ok: false, kind: "network", message: "down", code: null, status: null }),
      isTerminal: () => false,
      intervalMs: 1,
      maxTransientFailures: 2,
      shouldContinue: () => true,
    });
    expect(outcome).toMatchObject({ ok: false, kind: "network" });
  });

  it("surfaces hard failures immediately without retrying", async () => {
    let calls = 0;
    const outcome = await pollUntilTerminal<{ status: string }>({
      poll: async () => {
        calls += 1;
        return { ok: false, kind: "unauthorized", message: "expired", code: null, status: 401 };
      },
      isTerminal: () => false,
      intervalMs: 1,
      shouldContinue: () => true,
    });
    expect(outcome).toMatchObject({ ok: false, kind: "unauthorized" });
    expect(calls).toBe(1);
  });

  it("stops cleanly when the component unmounts mid-poll", async () => {
    let continuePolling = true;
    const pending = pollUntilTerminal<{ status: string }>({
      poll: async () => ({ ok: true, data: { status: "pending" } }),
      isTerminal: () => false,
      intervalMs: 1,
      shouldContinue: () => continuePolling,
    });
    continuePolling = false;
    const outcome = await pending;
    expect(outcome).toMatchObject({ ok: false, kind: "cancelled" });
  });

  it("bounds the whole window and reports expiry actionably", async () => {
    const outcome = await pollUntilTerminal<{ status: string }>({
      poll: async () => ({ ok: true, data: { status: "pending" } }),
      isTerminal: () => false,
      intervalMs: 1,
      maxDurationMs: 25,
      shouldContinue: () => true,
    });
    expect(outcome).toMatchObject({ ok: false, kind: "expired-window" });
  });
});
