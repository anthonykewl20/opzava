import { lookupSafeSummary } from "./safe-summary-registry.js";
import { lookupSuppression } from "./suppression-registry.js";
import type { DoctorFinding, DoctorScanRun, DoctorSeverity } from "./types.js";

export const MAX_DOCTOR_OUTPUT_BYTES = 256 * 1024;
export const MAX_DOCTOR_FINDINGS = 500;
const MAX_CHECK_COUNT = 10_000;
const SAFE_CHECK_ID = /^[a-z0-9][a-z0-9._/-]{0,127}$/;

export interface DoctorLintOutput {
  readonly exitCode: number;
  readonly stdout: string;
}

function unavailable(failureCode: string): DoctorScanRun {
  return { status: "unavailable", checksRun: 0, checksSkipped: 0, findings: [], failureCode };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCount(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= MAX_CHECK_COUNT
    ? (value as number)
    : undefined;
}

function parseSeverity(value: unknown): DoctorSeverity | undefined {
  return value === "info" || value === "warning" || value === "error" ? value : undefined;
}

function parseFinding(value: unknown): DoctorFinding | undefined {
  if (!isRecord(value)) return undefined;
  const severity = parseSeverity(value["severity"]);
  if (severity === undefined) return undefined;

  const rawCheckId = value["checkId"];
  const checkId = typeof rawCheckId === "string" && SAFE_CHECK_ID.test(rawCheckId)
    ? rawCheckId
    : "unknown";
  const safe = checkId === "unknown" ? undefined : lookupSafeSummary(checkId);
  const suppression = checkId === "unknown" ? undefined : lookupSuppression(checkId);

  return {
    checkId,
    severity,
    group: safe?.group ?? "Other",
    summary:
      safe?.summary ??
      `OpenClaw doctor reported a ${severity} finding in an unclassified check.`,
    detailState: safe === undefined ? "redacted_unavailable" : "available",
    locationLabel: null,
    targetLabel: null,
    fixHint: null,
    suppressed: suppression !== undefined,
    suppressionReason: suppression?.reason ?? null
  };
}

/** Converts hostile CLI output into the only shape allowed to cross the ingest boundary. */
export function parseDoctorLintOutput(output: DoctorLintOutput): DoctorScanRun {
  if (output.exitCode !== 0 && output.exitCode !== 1) return unavailable("doctor_exit_2");
  if (Buffer.byteLength(output.stdout, "utf8") > MAX_DOCTOR_OUTPUT_BYTES) {
    return unavailable("output_oversized");
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(output.stdout) as unknown;
  } catch {
    return unavailable("invalid_json");
  }
  if (!isRecord(envelope)) return unavailable("invalid_envelope");

  const checksRun = parseCount(envelope["checksRun"]);
  const checksSkipped = parseCount(envelope["checksSkipped"]);
  const rawFindings = envelope["findings"];
  if (
    checksRun === undefined ||
    checksSkipped === undefined ||
    !Array.isArray(rawFindings) ||
    rawFindings.length > MAX_DOCTOR_FINDINGS
  ) {
    return unavailable("invalid_envelope");
  }

  const findings: DoctorFinding[] = [];
  for (const rawFinding of rawFindings) {
    const finding = parseFinding(rawFinding);
    if (finding === undefined) return unavailable("invalid_envelope");
    findings.push(finding);
  }

  return { status: "succeeded", checksRun, checksSkipped, findings };
}
