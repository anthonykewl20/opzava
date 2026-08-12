export type DoctorSeverity = "info" | "warning" | "error";

export interface DoctorFinding {
  readonly checkId: string;
  readonly severity: DoctorSeverity;
  readonly group: string;
  readonly summary: string;
  readonly detailState: "available" | "redacted_unavailable";
  readonly locationLabel: string | null;
  readonly targetLabel: string | null;
  readonly fixHint: string | null;
  readonly suppressed: boolean;
  readonly suppressionReason: string | null;
}

export interface DoctorScanRun {
  readonly status: "succeeded" | "unavailable";
  readonly checksRun: number;
  readonly checksSkipped: number;
  readonly findings: readonly DoctorFinding[];
  readonly failureCode?: string;
}
