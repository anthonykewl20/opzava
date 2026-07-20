import { describe, expect, it } from "vitest";

import {
  ADMIN_FRESHNESS_BUDGET_MS,
  CompositionCache,
  ObservationGenerationStore,
  composeState,
  deriveAvailabilityState,
  type FailedReadEvidenceInput,
  type MissingEvidenceInput,
  type SnapshotEvidenceInput,
} from "../lib/admin-evidence";

const provenance = {
  label: "Gateway readiness",
  href: "/gateway",
  diagnosticRef: "gateway-readiness",
} as const;

const evidenceIdentity = {
  sourceOwner: "runtime-control",
  sourceId: "gateway-readiness",
  provenance,
  sourceVersion: { kind: "checkpoint", value: "checkpoint-1" },
  sourceTimestamp: null,
  observedAt: "2026-07-20T00:00:00.000Z",
  staleAfter: "2026-07-20T00:01:00.000Z",
  observationGeneration: 1,
} as const;

function snapshot<T>(overrides: Partial<SnapshotEvidenceInput<T>> = {}): SnapshotEvidenceInput<T> {
  return {
    ...evidenceIdentity,
    kind: "snapshot",
    value: 3 as T,
    declaredState: "live",
    lastKnownGood: false,
    ...overrides,
  };
}

function missingInput(): MissingEvidenceInput {
  return { ...evidenceIdentity, kind: "no-evidence", value: null };
}

function unavailableInput(): FailedReadEvidenceInput {
  return { ...evidenceIdentity, kind: "read-failure", state: "unavailable", value: null };
}

describe("Admin evidence state derivation", () => {
  it.each([
    ["stale", snapshot({ staleAfter: "2026-07-19T23:59:59.000Z" }), "stale", 3],
    ["unknown", missingInput(), "unknown", null],
    ["unavailable", unavailableInput(), "unavailable", null],
    [
      "not-configured",
      snapshot({ declaredState: "not-configured", value: null }),
      "not-configured",
      null,
    ],
  ] as const)(
    "never turns %s evidence into live or numeric zero",
    (_label, input, state, value) => {
      expect(deriveAvailabilityState(input, "2026-07-20T00:00:30.000Z")).toMatchObject({
        state,
        value,
      });
    },
  );

  it("flips live evidence to stale at its own boundary without changing its value", () => {
    const input = snapshot<{ readonly count: number }>({ value: { count: 3 } });

    expect(deriveAvailabilityState(input, "2026-07-20T00:01:00.000Z")).toMatchObject({
      state: "live",
      value: { count: 3 },
    });
    expect(deriveAvailabilityState(input, "2026-07-20T00:01:00.001Z")).toMatchObject({
      state: "stale",
      value: { count: 3 },
    });
  });

  it("keeps missing evidence unknown and distinct from a verified zero", () => {
    const missing = deriveAvailabilityState(missingInput(), "2026-07-20T00:00:30.000Z");
    const verifiedZero = deriveAvailabilityState(
      snapshot<number>({ value: 0 }),
      "2026-07-20T00:00:30.000Z",
    );

    expect(missing).toMatchObject({ state: "unknown", value: null });
    expect(verifiedZero).toMatchObject({ state: "live", value: 0 });
  });

  it("marks impossible server clock ordering unknown", () => {
    expect(
      deriveAvailabilityState(
        snapshot({ observedAt: "2026-07-20T00:00:31.000Z" }),
        "2026-07-20T00:00:30.000Z",
      ),
    ).toMatchObject({ state: "unknown" });
  });

  it("retains an over-budget LKG value in a separate stale envelope", () => {
    expect(
      deriveAvailabilityState(
        snapshot({ lastKnownGood: true, staleAfter: "2026-07-20T00:00:10.000Z" }),
        "2026-07-20T00:00:30.000Z",
      ),
    ).toMatchObject({
      state: "stale",
      freshnessState: "stale",
      evidenceRole: "last-known-good",
      value: 3,
      lastKnownGood: true,
    });
  });

  it("represents a within-budget LKG separately without calling it stale or current", () => {
    expect(
      deriveAvailabilityState(snapshot({ lastKnownGood: true }), "2026-07-20T00:00:30.000Z"),
    ).toMatchObject({
      state: "unknown",
      freshnessState: "within-budget",
      evidenceRole: "last-known-good",
      value: 3,
      lastKnownGood: true,
    });
  });

  it("distinguishes proven missing configuration, source failure, and authorization failure", () => {
    const notConfigured = deriveAvailabilityState(
      snapshot({ declaredState: "not-configured", value: null }),
      "2026-07-20T00:00:30.000Z",
    );
    const unavailable = deriveAvailabilityState(unavailableInput(), "2026-07-20T00:00:30.000Z");
    const forbidden = {
      kind: "authorization-failure",
      failure: { code: "source-forbidden", sourceOwner: "runtime-control" },
    } as const;

    expect(notConfigured.state).toBe("not-configured");
    expect(unavailable.state).toBe("unavailable");
    expect(forbidden.kind).toBe("authorization-failure");
    expect("state" in forbidden).toBe(false);
  });
});

describe("Admin evidence budgets and composition", () => {
  it("exports the locked per-item maximum freshness budgets", () => {
    expect(ADMIN_FRESHNESS_BUDGET_MS).toEqual({
      gatewaySession: 60_000,
      agentReconciliation: 120_000,
      providerAuthAndSkill: 300_000,
      usage: 900_000,
      opzavaRecordAndReceipt: 300_000,
    });
  });

  it("is live only when every required fact is live and uses the strictest required budget", () => {
    expect(
      composeState([
        { id: "gateway", required: true, state: "live", freshnessBudgetMs: 60_000 },
        { id: "agent", required: true, state: "live", freshnessBudgetMs: 120_000 },
      ]),
    ).toMatchObject({ state: "live", partial: false, freshnessBudgetMs: 60_000 });

    expect(
      composeState([
        { id: "gateway", required: true, state: "live", freshnessBudgetMs: 60_000 },
        { id: "agent", required: true, state: "unavailable", freshnessBudgetMs: 120_000 },
      ]),
    ).toMatchObject({ state: "unavailable", partial: true, freshnessBudgetMs: 60_000 });
  });

  it("retains every row so a section can expose verified and failed siblings", () => {
    const parts = [
      { id: "verified", required: true, state: "live", freshnessBudgetMs: 60_000 },
      { id: "failed", required: false, state: "unknown", freshnessBudgetMs: 300_000 },
    ] as const;

    expect(composeState(parts)).toEqual({
      state: "live",
      partial: true,
      freshnessBudgetMs: 60_000,
      parts,
    });
  });

  it("never lets a required LKG make a composite live even while it is within budget", () => {
    expect(
      composeState([
        {
          id: "gateway-lkg",
          required: true,
          state: "live",
          freshnessBudgetMs: 60_000,
          lastKnownGood: true,
        },
      ]),
    ).toMatchObject({ state: "unknown", partial: false });
  });
});

describe("CompositionCache", () => {
  const key = {
    tenantId: "tenant-1",
    userId: "user-1",
    authorizationVersion: "auth-1",
    compositionSchemaVersion: "schema-1",
  } as const;

  it("isolates tenant, user, authorization version, and schema version", () => {
    const cache = new CompositionCache<number>();
    cache.set(key, [snapshot()]);

    expect(cache.get(key, "2026-07-20T00:00:30.000Z")).not.toBeNull();
    expect(cache.get({ ...key, tenantId: "tenant-2" }, "2026-07-20T00:00:30.000Z")).toBeNull();
    expect(cache.get({ ...key, userId: "user-2" }, "2026-07-20T00:00:30.000Z")).toBeNull();
    expect(
      cache.get({ ...key, authorizationVersion: "auth-2" }, "2026-07-20T00:00:30.000Z"),
    ).toBeNull();
    expect(
      cache.get({ ...key, compositionSchemaVersion: "schema-2" }, "2026-07-20T00:00:30.000Z"),
    ).toBeNull();
  });

  it("re-derives cached facts after retrieval instead of extending freshness", () => {
    const cache = new CompositionCache<number>();
    cache.set(key, [snapshot()]);

    expect(cache.get(key, "2026-07-20T00:00:30.000Z")?.[0]?.state).toBe("live");
    expect(cache.get(key, "2026-07-20T00:01:01.000Z")?.[0]).toMatchObject({
      state: "stale",
      lastKnownGood: false,
      value: 3,
    });
  });
});

describe("ObservationGenerationStore", () => {
  it("rejects a lower-generation slow completion even when its wall clock is later", () => {
    const store = new ObservationGenerationStore<string>();

    expect(store.tryCommitObservation("gateway", 2, "newer-generation")).toEqual({
      accepted: true,
      current: { generation: 2, value: "newer-generation" },
    });
    expect(store.tryCommitObservation("gateway", 1, "later-wall-clock-completion")).toEqual({
      accepted: false,
      current: { generation: 2, value: "newer-generation" },
    });
  });

  it("rejects a completion older than the latest admitted read before that newer read completes", () => {
    const store = new ObservationGenerationStore<string>();

    expect(store.admitObservation("gateway", 1)).toBe(true);
    expect(store.admitObservation("gateway", 2)).toBe(true);
    expect(store.tryCommitObservation("gateway", 1, "stale-completion")).toEqual({
      accepted: false,
      current: null,
    });
    expect(store.tryCommitObservation("gateway", 2, "current-completion")).toMatchObject({
      accepted: true,
      current: { generation: 2, value: "current-completion" },
    });
  });
});
