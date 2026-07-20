export const ADMIN_FRESHNESS_BUDGET_MS = {
  gatewaySession: 60_000,
  agentReconciliation: 120_000,
  providerAuthAndSkill: 300_000,
  usage: 900_000,
  opzavaRecordAndReceipt: 300_000,
} as const;

export type AvailabilityState = "live" | "stale" | "unknown" | "unavailable" | "not-configured";

export interface EvidenceProvenance {
  readonly label: string;
  readonly href: string | null;
  readonly diagnosticRef: string | null;
}

export type SourceVersion =
  | { readonly kind: "version"; readonly value: string }
  | { readonly kind: "revision"; readonly value: string }
  | { readonly kind: "sequence"; readonly value: string }
  | { readonly kind: "checkpoint"; readonly value: string };

interface EvidenceIdentity {
  readonly sourceOwner: string;
  readonly sourceId: string;
  readonly provenance: EvidenceProvenance;
  readonly sourceVersion: SourceVersion | null;
  readonly sourceTimestamp: string | null;
  readonly observedAt: string;
  readonly staleAfter: string;
  readonly observationGeneration: number;
}

export interface SnapshotEvidenceInput<T> extends EvidenceIdentity {
  readonly kind: "snapshot";
  readonly value: T | null;
  readonly declaredState: "live" | "not-configured";
  readonly lastKnownGood: boolean;
}

export interface MissingEvidenceInput extends EvidenceIdentity {
  readonly kind: "no-evidence";
  readonly value: null;
  readonly lastKnownGood?: false;
}

export interface FailedReadEvidenceInput extends EvidenceIdentity {
  readonly kind: "read-failure";
  readonly state: "unknown" | "unavailable";
  readonly value: null;
  readonly lastKnownGood?: false;
}

export type EvidenceInput<T> =
  SnapshotEvidenceInput<T> | MissingEvidenceInput | FailedReadEvidenceInput;

export interface SourceAuthorizationFailure {
  readonly kind: "authorization-failure";
  readonly failure: {
    readonly code: "source-forbidden";
    readonly sourceOwner: string;
  };
}

export type SourceEvidenceInput<T> = EvidenceInput<T> | SourceAuthorizationFailure;

export interface EvidenceEnvelope<T> extends EvidenceIdentity {
  readonly value: T | null;
  readonly state: AvailabilityState;
  readonly lastKnownGood: boolean;
  readonly evidenceRole: "current" | "last-known-good";
  readonly freshnessState: "within-budget" | "stale" | "unknown";
  readonly evaluatedAt: string;
}

function validTime(value: string): number | null {
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

export function deriveAvailabilityState<T>(
  input: EvidenceInput<T>,
  evaluatedAt: string,
): EvidenceEnvelope<T> {
  const observedAtMs = validTime(input.observedAt);
  const staleAfterMs = validTime(input.staleAfter);
  const evaluatedAtMs = validTime(evaluatedAt);
  let state: AvailabilityState;
  let freshnessState: EvidenceEnvelope<T>["freshnessState"];

  if (
    observedAtMs === null ||
    staleAfterMs === null ||
    evaluatedAtMs === null ||
    observedAtMs > evaluatedAtMs
  ) {
    state = "unknown";
    freshnessState = "unknown";
  } else if (input.kind === "no-evidence") {
    state = "unknown";
    freshnessState = "unknown";
  } else if (input.kind === "read-failure") {
    state = input.state;
    freshnessState = "unknown";
  } else if (evaluatedAtMs > staleAfterMs) {
    state = "stale";
    freshnessState = "stale";
  } else if (input.lastKnownGood) {
    // The retained snapshot is fresh as an LKG, but cannot assert current truth.
    state = "unknown";
    freshnessState = "within-budget";
  } else if (input.declaredState === "not-configured") {
    state = "not-configured";
    freshnessState = "within-budget";
  } else if (input.value === null) {
    state = "unknown";
    freshnessState = "unknown";
  } else {
    state = "live";
    freshnessState = "within-budget";
  }

  return {
    value: input.value,
    sourceOwner: input.sourceOwner,
    sourceId: input.sourceId,
    provenance: input.provenance,
    sourceVersion: input.sourceVersion,
    sourceTimestamp: input.sourceTimestamp,
    observedAt: input.observedAt,
    staleAfter: input.staleAfter,
    observationGeneration: input.observationGeneration,
    state,
    lastKnownGood: input.kind === "snapshot" ? input.lastKnownGood : false,
    evidenceRole: input.kind === "snapshot" && input.lastKnownGood ? "last-known-good" : "current",
    freshnessState,
    evaluatedAt,
  };
}

export interface CompositePart {
  readonly id: string;
  readonly required: boolean;
  readonly state: AvailabilityState;
  readonly freshnessBudgetMs: number;
  readonly lastKnownGood?: boolean;
}

export interface CompositeState<TPart extends CompositePart> {
  readonly state: AvailabilityState;
  readonly partial: boolean;
  readonly freshnessBudgetMs: number | null;
  readonly parts: readonly TPart[];
}

const NON_LIVE_PRECEDENCE: readonly AvailabilityState[] = [
  "unavailable",
  "unknown",
  "not-configured",
  "stale",
];

export function composeState<TPart extends CompositePart>(
  parts: readonly TPart[],
): CompositeState<TPart> {
  const required = parts.filter((part) => part.required);
  const requiredStates = required.map((part): AvailabilityState =>
    part.lastKnownGood === true ? "unknown" : part.state,
  );
  const freshnessBudgetMs =
    required.length === 0 ? null : Math.min(...required.map((part) => part.freshnessBudgetMs));
  const state =
    required.length === 0
      ? "unknown"
      : requiredStates.every((partState) => partState === "live")
        ? "live"
        : (NON_LIVE_PRECEDENCE.find((candidate) => requiredStates.includes(candidate)) ??
          "unknown");
  const hasLive = parts.some((part) => part.state === "live" && part.lastKnownGood !== true);
  const hasNonLive = parts.some((part) => part.state !== "live" || part.lastKnownGood === true);

  return {
    state,
    partial: hasLive && hasNonLive,
    freshnessBudgetMs,
    parts,
  };
}

export interface CompositionCacheKey {
  readonly tenantId: string;
  readonly userId: string;
  readonly authorizationVersion: string;
  readonly compositionSchemaVersion: string;
}

function serializeCacheKey(key: CompositionCacheKey): string {
  return JSON.stringify([
    key.tenantId,
    key.userId,
    key.authorizationVersion,
    key.compositionSchemaVersion,
  ]);
}

export class CompositionCache<T> {
  readonly #entries = new Map<string, readonly EvidenceInput<T>[]>();

  set(key: CompositionCacheKey, evidence: readonly EvidenceInput<T>[]): void {
    this.#entries.set(serializeCacheKey(key), [...evidence]);
  }

  get(key: CompositionCacheKey, evaluatedAt: string): readonly EvidenceEnvelope<T>[] | null {
    const evidence = this.#entries.get(serializeCacheKey(key));
    if (evidence === undefined) {
      return null;
    }

    return evidence.map((item) => deriveAvailabilityState(item, evaluatedAt));
  }

  invalidate(key: CompositionCacheKey): boolean {
    return this.#entries.delete(serializeCacheKey(key));
  }
}

export interface CommittedObservation<T> {
  readonly generation: number;
  readonly value: T;
}

export type ObservationCommitResult<T> =
  | { readonly accepted: true; readonly current: CommittedObservation<T> }
  | { readonly accepted: false; readonly current: CommittedObservation<T> | null };

export class ObservationGenerationStore<T> {
  readonly #observations = new Map<string, CommittedObservation<T>>();
  readonly #latestAdmittedGeneration = new Map<string, number>();

  admitObservation(key: string, generation: number): boolean {
    const latestAdmitted = this.#latestAdmittedGeneration.get(key);
    if (latestAdmitted !== undefined && generation <= latestAdmitted) {
      return false;
    }

    this.#latestAdmittedGeneration.set(key, generation);
    return true;
  }

  tryCommitObservation(key: string, generation: number, value: T): ObservationCommitResult<T> {
    const current = this.#observations.get(key);
    const latestAdmitted = this.#latestAdmittedGeneration.get(key);
    if (
      (latestAdmitted !== undefined && generation < latestAdmitted) ||
      (current !== undefined && generation <= current.generation)
    ) {
      return { accepted: false, current: current ?? null };
    }

    this.#latestAdmittedGeneration.set(key, generation);
    const committed = { generation, value };
    this.#observations.set(key, committed);
    return { accepted: true, current: committed };
  }

  get(key: string): CommittedObservation<T> | null {
    return this.#observations.get(key) ?? null;
  }
}
