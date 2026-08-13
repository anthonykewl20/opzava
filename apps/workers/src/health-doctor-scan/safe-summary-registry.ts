interface SafeSummaryDefinition {
  readonly group: string;
  readonly summary: string;
}

// Every value is authored by Opzava. Upstream diagnostic text is never used as a fallback.
export const DOCTOR_SAFE_SUMMARY_REGISTRY = {
  "core/doctor/auth-profiles": {
    group: "Authentication",
    summary: "OpenClaw doctor found an authentication profile configuration issue."
  },
  "core/doctor/gateway-services/extra": {
    group: "Gateway",
    summary: "OpenClaw doctor found an unexpected Gateway service registration."
  },
  "core/doctor/heartbeat-template": {
    group: "Configuration",
    summary: "OpenClaw doctor found a heartbeat template configuration issue."
  },
  "core/doctor/session-locks": {
    group: "Sessions",
    summary: "OpenClaw doctor found a session lock requiring attention."
  },
  "core/doctor/session-transcripts": {
    group: "Sessions",
    summary: "OpenClaw doctor found a session transcript integrity issue."
  },
  "core/doctor/state-integrity": {
    group: "Storage",
    summary: "OpenClaw doctor found a state integrity issue."
  },
  "core/doctor/ui-protocol-freshness": {
    group: "Gateway",
    summary: "OpenClaw doctor found a UI protocol compatibility issue."
  }
} as const satisfies Readonly<Record<string, SafeSummaryDefinition>>;

export function lookupSafeSummary(checkId: string): SafeSummaryDefinition | undefined {
  return Object.hasOwn(DOCTOR_SAFE_SUMMARY_REGISTRY, checkId)
    ? (DOCTOR_SAFE_SUMMARY_REGISTRY as Readonly<Record<string, SafeSummaryDefinition>>)[checkId]
    : undefined;
}
