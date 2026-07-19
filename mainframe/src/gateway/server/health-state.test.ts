// Health-state tests cover probe coalescing, sensitive snapshots, and broadcast version behavior.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HealthSummary } from "../../commands/health.js";

/**
 * Health-state cache tests covering coalescing, sensitive probes, and broadcasts.
 */
const getHealthSnapshotMock = vi.hoisted(() => vi.fn());

vi.mock("../../commands/health.js", () => ({
  getHealthSnapshot: getHealthSnapshotMock,
}));

function healthSnapshotCallArg(index = 0) {
  return getHealthSnapshotMock.mock.calls.at(index)?.at(0) as
    | {
        eventLoop?: unknown;
        includeSensitive?: boolean;
        probe?: boolean;
        runtimeSnapshot?: unknown;
        configReloadHotReloadStatus?: unknown;
      }
    | undefined;
}

function createHealthSummary(): HealthSummary {
  return {
    ok: true,
    ts: Date.now(),
    durationMs: 1,
    channels: {},
    channelOrder: [],
    channelLabels: {},
    heartbeatSeconds: 0,
    defaultAgentId: "main",
    agents: [],
    sessions: {
      path: "/tmp/sessions.json",
      count: 0,
      recent: [],
    },
  };
}

async function loadHealthState() {
  vi.resetModules();
  getHealthSnapshotMock.mockReset();
  getHealthSnapshotMock.mockResolvedValue(createHealthSummary());
  return await import("./health-state.js");
}

describe("refreshGatewayHealthSnapshot", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("runs one strong follow-up when probe callers arrive during a weak refresh", async () => {
    const healthState = await loadHealthState();
    const weakSummary = createHealthSummary();
    const strongSummary = createHealthSummary();
    let resolveWeak: ((summary: HealthSummary) => void) | undefined;
    let resolveStrong: ((summary: HealthSummary) => void) | undefined;
    getHealthSnapshotMock
      .mockImplementationOnce(
        () =>
          new Promise<HealthSummary>((resolve) => {
            resolveWeak = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<HealthSummary>((resolve) => {
            resolveStrong = resolve;
          }),
      );

    const first = healthState.refreshGatewayHealthSnapshot({ probe: false });
    const strongWaiters = Array.from({ length: 5 }, () =>
      healthState.refreshGatewayHealthSnapshot({ probe: true }),
    );

    expect(getHealthSnapshotMock).toHaveBeenCalledTimes(1);
    expect(getHealthSnapshotMock).toHaveBeenCalledWith({
      probe: false,
      includeSensitive: false,
      runtimeSnapshot: undefined,
    });
    expect(Object.hasOwn(healthSnapshotCallArg() ?? {}, "eventLoop")).toBe(false);
    resolveWeak?.(weakSummary);
    await first;
    await vi.waitFor(() => expect(getHealthSnapshotMock).toHaveBeenCalledTimes(2));
    expect(healthSnapshotCallArg(1)?.probe).toBe(true);
    resolveStrong?.(strongSummary);
    await expect(Promise.all(strongWaiters)).resolves.toEqual(
      Array.from({ length: 5 }, () => strongSummary),
    );
  });

  it("still runs a strong follow-up when the weak predecessor fails", async () => {
    const healthState = await loadHealthState();
    const strongSummary = createHealthSummary();
    let rejectWeak: ((error: Error) => void) | undefined;
    getHealthSnapshotMock
      .mockImplementationOnce(
        () =>
          new Promise<HealthSummary>((_resolve, reject) => {
            rejectWeak = reject;
          }),
      )
      .mockResolvedValueOnce(strongSummary);

    const weak = healthState.refreshGatewayHealthSnapshot({ probe: false });
    const strong = healthState.refreshGatewayHealthSnapshot({ probe: true });
    rejectWeak?.(new Error("weak refresh failed"));

    await expect(weak).rejects.toThrow("weak refresh failed");
    await expect(strong).resolves.toBe(strongSummary);
    expect(getHealthSnapshotMock).toHaveBeenCalledTimes(2);
    expect(healthSnapshotCallArg(1)?.probe).toBe(true);
  });

  it("passes event-loop health only when the hook returns a snapshot", async () => {
    const healthState = await loadHealthState();
    const eventLoop = {
      degraded: true,
      reasons: ["event_loop_delay" as const],
      intervalMs: 2_000,
      delayP99Ms: 1_500,
      delayMaxMs: 1_700,
      utilization: 0.2,
      cpuCoreRatio: 0.1,
    };

    await healthState.refreshGatewayHealthSnapshot({
      probe: false,
      getEventLoopHealth: () => eventLoop,
    });
    await healthState.refreshGatewayHealthSnapshot({
      probe: true,
      getEventLoopHealth: () => undefined,
    });

    expect(getHealthSnapshotMock).toHaveBeenCalledTimes(2);
    expect(healthSnapshotCallArg()?.eventLoop).toBe(eventLoop);
    expect(Object.hasOwn(healthSnapshotCallArg(1) ?? {}, "eventLoop")).toBe(false);
  });

  it("passes the config reloader hot-reload status only when the hook returns one", async () => {
    const healthState = await loadHealthState();

    await healthState.refreshGatewayHealthSnapshot({
      probe: false,
      getConfigReloaderHotReloadStatus: () => "disabled",
    });
    await healthState.refreshGatewayHealthSnapshot({
      probe: true,
      getConfigReloaderHotReloadStatus: () => undefined,
    });

    expect(getHealthSnapshotMock).toHaveBeenCalledTimes(2);
    expect(healthSnapshotCallArg()?.configReloadHotReloadStatus).toBe("disabled");
    expect(Object.hasOwn(healthSnapshotCallArg(1) ?? {}, "configReloadHotReloadStatus")).toBe(
      false,
    );
  });

  it("captures runtime snapshots for completed refreshes and guards snapshot failures", async () => {
    const healthState = await loadHealthState();
    const runtimeSnapshot = {
      channels: { discord: { accountId: "default", connected: true } },
      channelAccounts: {},
    };

    await healthState.refreshGatewayHealthSnapshot({
      probe: false,
      getRuntimeSnapshot: () => runtimeSnapshot,
    });
    await healthState.refreshGatewayHealthSnapshot({
      probe: true,
      getRuntimeSnapshot: () => {
        throw new Error("bad channel config");
      },
    });

    expect(getHealthSnapshotMock).toHaveBeenCalledTimes(2);
    expect(
      getHealthSnapshotMock.mock.calls
        .map((_call, index) => healthSnapshotCallArg(index)?.probe)
        .toSorted((a, b) => Number(a) - Number(b)),
    ).toEqual([false, true]);
    expect(
      getHealthSnapshotMock.mock.calls.map(
        (_call, index) => healthSnapshotCallArg(index)?.includeSensitive,
      ),
    ).toEqual([false, false]);
    expect(healthSnapshotCallArg()?.runtimeSnapshot).toBe(runtimeSnapshot);
    expect(healthSnapshotCallArg(1)?.runtimeSnapshot).toBeUndefined();
  });

  it("stores sensitive health separately without broadcasting or changing the safe version", async () => {
    const healthState = await loadHealthState();
    const sensitiveSummary = createHealthSummary();
    const safeSummary = createHealthSummary();
    const broadcast = vi.fn();
    getHealthSnapshotMock
      .mockResolvedValueOnce(sensitiveSummary)
      .mockResolvedValueOnce(safeSummary);
    healthState.setBroadcastHealthUpdate(broadcast);
    const version = healthState.getHealthVersion();

    await healthState.refreshGatewayHealthSnapshot({ probe: true, includeSensitive: true });

    expect(healthState.getHealthCache()).toBeNull();
    expect(healthState.getHealthCache({ includeSensitive: true })).toBe(sensitiveSummary);
    expect(healthState.getHealthVersion()).toBe(version);
    expect(broadcast).not.toHaveBeenCalled();

    await healthState.refreshGatewayHealthSnapshot({ probe: false });

    expect(healthState.getHealthCache()).toBe(safeSummary);
    expect(healthState.getHealthCache({ includeSensitive: true })).toBe(sensitiveSummary);
    expect(healthState.getHealthVersion()).toBe(version + 1);
    expect(broadcast).toHaveBeenCalledWith(safeSummary);
  });

  it("serves the latest sensitive probe to later sensitive cache reads", async () => {
    const healthState = await loadHealthState();
    const first = createHealthSummary();
    const probed = { ...createHealthSummary(), ts: first.ts + 1 };
    getHealthSnapshotMock.mockResolvedValueOnce(first).mockResolvedValueOnce(probed);

    await healthState.refreshGatewayHealthSnapshot({ probe: false, includeSensitive: true });
    await healthState.refreshGatewayHealthSnapshot({ probe: true, includeSensitive: true });

    expect(healthState.getHealthCache({ includeSensitive: true })).toBe(probed);
    expect(healthState.getHealthCache()).toBeNull();
  });

  it("keeps sensitive and public refreshes on separate in-flight promises", async () => {
    const healthState = await loadHealthState();
    const sensitiveSummary = createHealthSummary();
    const safeSummary = createHealthSummary();
    let resolveSensitive: (() => void) | undefined;
    let resolveSafe: (() => void) | undefined;
    getHealthSnapshotMock
      .mockImplementationOnce(
        () =>
          new Promise<HealthSummary>((resolve) => {
            resolveSensitive = () => resolve(sensitiveSummary);
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<HealthSummary>((resolve) => {
            resolveSafe = () => resolve(safeSummary);
          }),
      );

    const sensitive = healthState.refreshGatewayHealthSnapshot({
      probe: true,
      includeSensitive: true,
    });
    const safe = healthState.refreshGatewayHealthSnapshot({ probe: false });

    expect(getHealthSnapshotMock).toHaveBeenCalledTimes(2);
    expect(healthSnapshotCallArg()?.includeSensitive).toBe(true);
    expect(healthSnapshotCallArg(1)?.includeSensitive).toBe(false);

    resolveSensitive?.();
    resolveSafe?.();

    await expect(sensitive).resolves.toBe(sensitiveSummary);
    await expect(safe).resolves.toBe(safeSummary);
    expect(healthState.getHealthCache()).toBe(safeSummary);
  });
});
