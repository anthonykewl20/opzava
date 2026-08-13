interface SuppressionDefinition {
  readonly reason: string;
  readonly reviewOwner: string;
}

// CheckIds structurally inapplicable to the Opzava container deployment. A suppressed finding
// is retained in the DTO with its reason; it is never dropped.
export const DOCTOR_SUPPRESSION_REGISTRY = {
  "core/doctor/gateway-daemon": {
    reason: "OpenClaw runs as a container, not a system service.",
    reviewOwner: "platform-ops"
  }
} as const satisfies Readonly<Record<string, SuppressionDefinition>>;

export function lookupSuppression(checkId: string): SuppressionDefinition | undefined {
  return Object.hasOwn(DOCTOR_SUPPRESSION_REGISTRY, checkId)
    ? (DOCTOR_SUPPRESSION_REGISTRY as Readonly<Record<string, SuppressionDefinition>>)[checkId]
    : undefined;
}
