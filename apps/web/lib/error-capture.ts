import { randomUUID } from "node:crypto";

import type {
  AppendAuditInput,
  AppendAuditReceipt,
  ErrorCapturePort,
} from "@opzava/ports";
import { ok } from "@opzava/shared-kernel";

// Built-in no-op adapter for contexts that only need droppable diagnostics (the durable
// diagnostics sink is the pending ADR-013 GlitchTip). `capture` is a true no-op. `appendAudit`
// is COMPLIANCE and must never silently drop a governance event, so when this no-op is wired
// somewhere that actually appends audit rows it logs a loud structured warning and returns a
// synthetic receipt — real compliance sinks use PostgresObservabilityAdapter against Postgres.
export const defaultErrorCapturePort: ErrorCapturePort = {
  async capture() {
    return ok(undefined);
  },
  async appendAudit(input: AppendAuditInput) {
    console.error(
      JSON.stringify({
        level: "error",
        code: "observability.complianceSinkNotConfigured",
        message:
          "Governance audit append called against the no-op diagnostics adapter; install PostgresObservabilityAdapter for a durable compliance sink.",
        intent: input.intent,
        transition: input.transition,
        targetKind: input.targetKind,
        targetRef: input.targetRef,
        actorId: input.actorId,
      }),
    );
    return ok({ eventId: `noop_${randomUUID()}` } satisfies AppendAuditReceipt);
  },
};
