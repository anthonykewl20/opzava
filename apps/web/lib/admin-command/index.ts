export interface CommandReceipt {
  readonly opId: string;
  readonly auditRef: string;
  readonly submittedAt: string;
}

export type CommandOutcomeState =
  "accepted" | "pending" | "indeterminate" | "succeeded" | "failed" | "partial" | "conflict";

export type AuthoritativeCommandReadback =
  | {
      readonly kind: "authoritative";
      readonly state: "succeeded";
      readonly observedAt: string;
      readonly checkpoint: string;
    }
  | {
      readonly kind: "authoritative";
      readonly state: "failed";
      readonly observedAt: string;
      readonly checkpoint: string;
      readonly safeFailureCode: string;
    }
  | {
      readonly kind: "authoritative";
      readonly state: "partial";
      readonly observedAt: string;
      readonly checkpoint: string;
    };

export type ReconciliationEvidence =
  | AuthoritativeCommandReadback
  | { readonly kind: "not-yet-observed" }
  | { readonly kind: "ambiguous-timeout" }
  | { readonly kind: "restart-without-readback" };

export type CommandOutcome =
  | { readonly receipt: CommandReceipt; readonly state: "accepted" }
  | {
      readonly receipt: CommandReceipt;
      readonly state: "pending";
      readonly reason: "awaiting-readback" | "ambiguous-timeout";
    }
  | {
      readonly receipt: CommandReceipt;
      readonly state: "indeterminate";
      readonly reason: "restart-without-readback";
    }
  | TerminalCommandOutcome
  | {
      readonly receipt: CommandReceipt;
      readonly state: "conflict";
      readonly freshStateRef: string;
    };

type TerminalCommandOutcome =
  | {
      readonly receipt: CommandReceipt;
      readonly state: "succeeded";
      readonly readback: Extract<AuthoritativeCommandReadback, { readonly state: "succeeded" }>;
    }
  | {
      readonly receipt: CommandReceipt;
      readonly state: "failed";
      readonly readback: Extract<AuthoritativeCommandReadback, { readonly state: "failed" }>;
    }
  | {
      readonly receipt: CommandReceipt;
      readonly state: "partial";
      readonly readback: Extract<AuthoritativeCommandReadback, { readonly state: "partial" }>;
    };

export function acceptCommand(receipt: CommandReceipt): CommandOutcome {
  return { receipt, state: "accepted" };
}

export function reconcile(
  receipt: CommandReceipt,
  evidence: ReconciliationEvidence,
): CommandOutcome {
  if (evidence.kind === "not-yet-observed") {
    return { receipt, state: "pending", reason: "awaiting-readback" };
  }
  if (evidence.kind === "ambiguous-timeout") {
    return { receipt, state: "pending", reason: "ambiguous-timeout" };
  }
  if (evidence.kind === "restart-without-readback") {
    return { receipt, state: "indeterminate", reason: "restart-without-readback" };
  }
  if (evidence.state === "succeeded") {
    return { receipt, state: "succeeded", readback: evidence };
  }
  if (evidence.state === "failed") {
    return { receipt, state: "failed", readback: evidence };
  }
  return { receipt, state: "partial", readback: evidence };
}

export interface CommandTargetOutcome {
  readonly targetId: string;
  readonly state: "succeeded" | "failed";
}

export interface CommandAggregate<TPart extends CommandTargetOutcome> {
  readonly state: "succeeded" | "failed" | "partial";
  readonly parts: readonly TPart[];
}

export function aggregate<TPart extends CommandTargetOutcome>(
  parts: readonly TPart[],
): CommandAggregate<TPart> {
  if (parts.length === 0) {
    throw new RangeError("A command aggregate requires at least one target outcome");
  }

  const succeeded = parts.filter((part) => part.state === "succeeded").length;
  const state = succeeded === parts.length ? "succeeded" : succeeded === 0 ? "failed" : "partial";
  return { state, parts };
}

export interface ActualBaseState<T> {
  readonly baseHash: string;
  readonly freshState: T;
}

export type BaseHashCheck<T> =
  | { readonly status: "ok"; readonly baseHash: string; readonly freshState: T }
  | {
      readonly status: "conflict";
      readonly expectedBaseHash: string;
      readonly actualBaseHash: string;
      readonly freshState: T;
    };

export function checkBaseHash<T>(
  expectedBaseHash: string,
  actual: ActualBaseState<T>,
): BaseHashCheck<T> {
  if (expectedBaseHash === actual.baseHash) {
    return { status: "ok", baseHash: actual.baseHash, freshState: actual.freshState };
  }

  return {
    status: "conflict",
    expectedBaseHash,
    actualBaseHash: actual.baseHash,
    freshState: actual.freshState,
  };
}

export interface IdempotentCommandRecord {
  readonly idempotencyKey: string;
  readonly payloadHash: string;
  readonly receipt: CommandReceipt;
}

export interface IdempotentCommandAttempt {
  readonly idempotencyKey: string;
  readonly payloadHash: string;
}

export type IdempotentReplayCheck =
  | { readonly status: "reuse"; readonly receipt: CommandReceipt }
  | { readonly status: "conflict" }
  | { readonly status: "new-command" };

export function checkIdempotentReplay(
  prior: IdempotentCommandRecord,
  attempt: IdempotentCommandAttempt,
): IdempotentReplayCheck {
  if (prior.idempotencyKey !== attempt.idempotencyKey) {
    return { status: "new-command" };
  }
  if (prior.payloadHash !== attempt.payloadHash) {
    return { status: "conflict" };
  }
  return { status: "reuse", receipt: prior.receipt };
}
